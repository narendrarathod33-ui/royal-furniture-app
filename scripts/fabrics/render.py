#!/usr/bin/env python3
"""Catalogue-wide white-base masks, render QA and per-product contact sheets.

Original gallery JPEGs under assets/base are read-only inputs. The app receives
an aligned upholstery mask plus a cleaned white Current Fabric image for each
accepted angle; named colours are rendered on-device from those audited inputs.
Every named combination is also rendered here for QA/contact sheets. Rejected
products and colours remain close-up/swatch-only and are never recoloured.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import math
import sys
import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter

from scripts.fabrics.extract import colour_asset_id
from scripts.fabrics.white_base import analyse_candidate, average_hash, build_upholstery_mask, clean_white_base, median_colour


def font(size: int, bold: bool = False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)
    except OSError:
        return ImageFont.load_default()


def lab(rgb: np.ndarray) -> np.ndarray:
    value = np.asarray(rgb, dtype=np.float64) / 255.0
    value = np.where(value <= 0.04045, value / 12.92, ((value + 0.055) / 1.055) ** 2.4)
    matrix = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = value @ matrix.T / np.array([0.95047, 1.0, 1.08883])
    delta = 6 / 29
    f = np.where(xyz > delta**3, np.cbrt(xyz), xyz / (3 * delta**2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def delta_e(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(lab(a) - lab(b)))


def load(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    return copy


@lru_cache(maxsize=1024)
def contain_file(path: str, size: tuple[int, int]) -> Image.Image:
    return contain(load(Path(path)), size)


def at_1200(image: Image.Image) -> Image.Image:
    height = round(image.height * 1200 / image.width)
    return image.convert("RGB").resize((1200, height), Image.Resampling.LANCZOS)


def rgba_mask(mask: Image.Image) -> Image.Image:
    output = Image.new("RGBA", mask.size, (255, 255, 255, 0))
    output.putalpha(mask.convert("L"))
    return output


def pure_white_at_1200(image: Image.Image, subject: Image.Image) -> tuple[Image.Image, np.ndarray]:
    resized = at_1200(image)
    subject_array = np.asarray(subject.convert("L").resize(resized.size, Image.Resampling.LANCZOS))
    pixels = np.asarray(resized).copy()
    pixels[subject_array == 0] = 255
    return Image.fromarray(pixels, "RGB"), subject_array


def white_masked_render(
    base: Image.Image,
    mask: Image.Image,
    closeup: Image.Image,
    subject: Image.Image | None = None,
    shadow: Image.Image | None = None,
) -> tuple[Image.Image, dict[str, Any]]:
    """Recolour only upholstery on a cleaned white base and measure every escape."""
    width = 1200
    height = round(base.height * width / base.width)
    base = base.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
    alpha_image = mask.getchannel("A") if mask.mode == "RGBA" else mask.convert("L")
    alpha_image = alpha_image.resize((width, height), Image.Resampling.LANCZOS)
    subject_array = None
    if subject is not None:
        subject_array = np.asarray(subject.convert("L").resize((width, height), Image.Resampling.LANCZOS))
        protected = np.asarray(alpha_image).copy()
        protected[subject_array < 250] = 0
        alpha_image = Image.fromarray(protected, "L")
    # build_upholstery_mask stores the protected one-pixel edge in the runtime
    # asset itself, so web, native and this renderer consume exactly the same mask.
    alpha = np.asarray(alpha_image, dtype=np.float32) / 255.0
    if subject is not None:
        base, subject_array = pure_white_at_1200(base, subject)
    source = np.asarray(base, dtype=np.float32)
    target = median_colour(closeup)
    luminance = source @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    inside = alpha > 0.95
    if inside.sum() < 1000:
        raise ValueError("White-base upholstery mask has too few interior pixels")
    typical = float(np.median(luminance[inside]))
    relative = np.clip(luminance / max(typical, 1), 0.32, 1.8) ** 0.88
    rendered = target[None, None, :] * relative[..., None]
    texture = closeup.convert("L").resize((420, 420), Image.Resampling.LANCZOS)
    texture_array = np.asarray(texture, dtype=np.float32)
    blurred = np.asarray(texture.filter(ImageFilter.GaussianBlur(3)), dtype=np.float32)
    detail = np.clip(texture_array - blurred, -14, 14) * 0.2
    tiled = np.tile(detail, (math.ceil(height / 420), math.ceil(width / 420)))[:height, :width]
    rendered = np.clip(rendered + tiled[..., None], 0, 255)
    output = source * (1 - alpha[..., None]) + rendered * alpha[..., None]
    output = Image.fromarray(np.uint8(np.clip(output + 0.5, 0, 255)), "RGB")

    changed = np.asarray(output, dtype=np.float32)
    difference = np.abs(changed - source).mean(axis=2)
    unmasked = np.asarray(alpha_image) == 0
    background_mean = float(difference[unmasked].mean())
    leak_ratio = float((difference[unmasked] > 12).mean())
    background = subject_array == 0 if subject_array is not None else unmasked
    background_pure_white = bool(np.all(changed[background] == 255))
    shadow_metrics = {"maskMax": 0, "mean": 0.0, "over12": 0.0, "samples": 0}
    if shadow is not None:
        shadow_array = np.asarray(shadow.convert("L").resize((width, height), Image.Resampling.LANCZOS)) > 12
        shadow_metrics = {
            "maskMax": int(np.asarray(alpha_image)[shadow_array].max()) if shadow_array.any() else 0,
            "mean": float(difference[shadow_array].mean()) if shadow_array.any() else 0.0,
            "over12": float((difference[shadow_array] > 12).mean()) if shadow_array.any() else 0.0,
            "samples": int(shadow_array.sum()),
        }
    rendered_median = np.median(changed[inside], axis=0)
    colour_difference = delta_e(rendered_median, target)
    base_blown = (source > 250).all(axis=2) & inside
    rendered_blown = (changed > 250).all(axis=2) & inside
    highlight_increase = float((rendered_blown.sum() - base_blown.sum()) / inside.sum())
    edge = (np.asarray(alpha_image) > 0) & (np.asarray(alpha_image) < 255)
    dark_target = float(target @ np.array([0.2126, 0.7152, 0.0722])) < 180
    edge_halo = float(((changed > 245).all(axis=2) & edge).sum() / max(1, edge.sum())) if dark_target else 0.0
    flags = []
    if colour_difference > 25:
        flags.append("colour-difference")
    if background_mean >= 4 or leak_ratio >= 0.02:
        flags.append("mask-leak")
    if not background_pure_white:
        flags.append("background-not-pure-white")
    if shadow_metrics["maskMax"] or shadow_metrics["mean"] >= 4 or shadow_metrics["over12"] >= 0.02:
        flags.append("contact-shadow-recoloured")
    if highlight_increase > 0.04:
        flags.append("blown-highlights")
    if edge_halo > 0.02:
        flags.append("white-edge-halo")
    return output, {
        "swatchMedianRgb": target.round(2).tolist(),
        "renderedMedianRgb": rendered_median.round(2).tolist(),
        "deltaE76": colour_difference,
        "unmaskedMean": background_mean,
        "maskLeakRatio": leak_ratio,
        "backgroundPureWhite": background_pure_white,
        "contactShadow": shadow_metrics,
        "edgeHaloRatio": edge_halo,
        "highlightIncrease": highlight_increase,
        "flags": flags,
    }


def repair_current_closeups(products: list[dict[str, Any]], output: Path, delay: float) -> tuple[list[dict[str, str]], int]:
    session = requests.Session()
    session.headers.update({"User-Agent": "RoyalFurnitureInternalDemoFabricQA/2.0", "Accept": "image/webp,image/*,*/*;q=0.8"})
    errors: list[dict[str, str]] = []
    last = 0.0
    downloaded = 0
    for product in products:
        for fabric in product["fabricTypes"]:
            for colour in fabric["colours"]:
                if not colour.get("current"):
                    continue
                url = colour.get("closeupSourceUrl")
                if not url:
                    continue
                destination = output / "assets/fabrics" / fabric["id"] / f"{colour_asset_id(colour)}.webp"
                thumbnail = destination.with_name(f"{destination.stem}-thumb.webp")
                if not destination.exists():
                    try:
                        remaining = delay - (time.monotonic() - last)
                        if remaining > 0:
                            time.sleep(remaining)
                        response = session.get(url, timeout=(15, 45))
                        last = time.monotonic()
                        if response.status_code in (401, 403):
                            raise PermissionError(f"Current-closeup access blocked ({response.status_code}); stopping")
                        response.raise_for_status()
                        with Image.open(io.BytesIO(response.content)) as source:
                            image = ImageOps.exif_transpose(source).convert("RGB")
                            destination.parent.mkdir(parents=True, exist_ok=True)
                            image.save(destination, "WEBP", quality=94, method=6)
                            image.thumbnail((192, 192), Image.Resampling.LANCZOS)
                            image.save(thumbnail, "WEBP", quality=84, method=6)
                        downloaded += 1
                    except PermissionError:
                        raise
                    except Exception as error:
                        errors.append({"productId": product["id"], "url": url, "error": str(error)})
                        continue
                colour["closeupPath"] = destination.relative_to(output).as_posix()
                colour["swatchPath"] = thumbnail.relative_to(output).as_posix()
                with Image.open(destination) as image:
                    colour["closeupWidth"], colour["closeupHeight"] = image.size
    return errors, downloaded


def all_colours(product: dict[str, Any]) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    return [(fabric, colour) for fabric in product["fabricTypes"] for colour in fabric["colours"]]


def current_closeup(product: dict[str, Any], output: Path) -> Image.Image | None:
    current = next((colour for _, colour in all_colours(product) if colour.get("current")), None)
    path = output / ((current or {}).get("closeupPath") or "")
    return load(path) if path.is_file() else None


def public_angle(record: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in record.items() if not key.startswith("_")}


def recover_similar_angles(products: list[dict[str, Any]], output: Path, delay: float) -> list[dict[str, str]]:
    """Recheck perceptual-hash skips without dropping genuinely different views.

    Early harvests used either a two-bit tolerance or exact 64-bit average-hash
    equality. Only candidates whose source bytes are not already known are
    fetched again; exact source-byte duplicates need no network recovery work.
    """
    report_path = output / "white-base-extraction-report.json"
    if not report_path.is_file():
        return []
    report = json.loads(report_path.read_text())
    by_product = {product["id"]: product for product in products}
    session = requests.Session()
    session.headers.update({"User-Agent": "RoyalFurnitureInternalDemoFabricQA/2.0", "Accept": "image/webp,image/*,*/*;q=0.8"})
    errors: list[dict[str, str]] = []
    last = 0.0
    recovered = 0
    for row in report.get("products", []):
        product = by_product.get(row.get("productId"))
        if not product:
            continue
        seen = {candidate.get("sourceSha256") for candidate in row.get("candidates", []) if candidate.get("sourceSha256") and not str(candidate.get("status", "")).startswith("duplicate-angle")}
        for candidate in row.get("candidates", []):
            if candidate.get("status") not in {"duplicate-angle", "duplicate-angle-exact"}:
                continue
            # Newer harvests already deduplicate exact source bytes and need no
            # request. Older perceptual-hash skips are fetched and rechecked.
            if candidate.get("sourceSha256") in seen:
                candidate["status"] = "duplicate-angle-exact"
                continue
            url = candidate["url"]
            try:
                remaining = delay - (time.monotonic() - last)
                if remaining > 0:
                    time.sleep(remaining)
                response = session.get(url, timeout=(15, 45))
                last = time.monotonic()
                response.raise_for_status()
                content = response.content
                with Image.open(io.BytesIO(content)) as source:
                    source_format = (source.format or "unknown").upper()
                    image = ImageOps.exif_transpose(source).convert("RGB")
                source_sha256 = hashlib.sha256(content).hexdigest()
                perceptual_hash = f"{average_hash(image):016x}"
                if source_sha256 in seen:
                    candidate["status"] = "duplicate-angle-exact"
                    continue
                seen.add(source_sha256)
                analysis = analyse_candidate(image)
                candidate.update(analysis)
                if not analysis["whiteBackground"]:
                    candidate["status"] = "flagged-after-angle-recheck"
                    continue
                angle_number = len(product["whiteBaseImages"]) + 1
                angle_id = "front" if angle_number == 1 else f"angle-{angle_number}"
                filename = f"{product['id']}.jpg" if angle_number == 1 else f"{product['id']}-angle-{angle_number}.jpg"
                destination = output / "assets/base" / filename
                destination.parent.mkdir(parents=True, exist_ok=True)
                if source_format == "JPEG":
                    destination.write_bytes(content)
                    conversion = None
                else:
                    image.save(destination, "JPEG", quality=100, subsampling=0, optimize=True)
                    conversion = f"{source_format}->JPEG"
                item = {
                    "angleId": angle_id,
                    "originalPath": destination.relative_to(output).as_posix(),
                    "sourceUrl": url,
                    "sourceFormat": source_format,
                    "jpegConversion": conversion,
                    "sourceSha256": source_sha256,
                    "storedSha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
                    "width": image.width,
                    "height": image.height,
                    "borderWhiteRatio": analysis["borderWhiteRatio"],
                    "singleObjectConfidence": analysis["singleObjectConfidence"],
                }
                product["whiteBaseImages"].append(item)
                row.setdefault("selected", []).append(item)
                candidate.update({"status": "white-background-recovered", "originalPath": item["originalPath"], "angleId": angle_id, "averageHash": perceptual_hash, "sourceSha256": source_sha256, "sourceFormat": source_format})
                product["previewBaseStatus"] = "white-background"
                product["previewBaseAttention"] = []
                recovered += 1
            except Exception as error:
                candidate["status"] = "angle-recheck-download-error"
                candidate["error"] = str(error)
                errors.append({"productId": product["id"], "url": url, "error": str(error)})
    report["similarAnglesRecovered"] = recovered
    report["angleRecoveryErrors"] = errors
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    extraction_path = output / "extraction-report.json"
    if recovered and extraction_path.is_file():
        extraction = json.loads(extraction_path.read_text())
        extraction["counts"]["whiteBackgroundProducts"] = sum(product.get("previewBaseStatus") == "white-background" for product in products)
        extraction["counts"]["whiteBackgroundAngles"] = sum(len(product.get("whiteBaseImages", [])) for product in products)
        extraction["counts"]["similarAnglesRecovered"] = recovered
        extraction_path.write_text(json.dumps(extraction, indent=2, ensure_ascii=False) + "\n")
    return errors


def prepare_product(product: dict[str, Any], output: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Build masks/current bases; front acceptance is mandatory for live preview."""
    closeup = current_closeup(product, output)
    angle_reports = []
    accepted = []
    for angle in product.get("whiteBaseImages", []):
        original_path = output / angle["originalPath"]
        report = {"productId": product["id"], "name": product["name"], "angleId": angle["angleId"], "originalPath": angle["originalPath"], "sourceUrl": angle["sourceUrl"]}
        if not original_path.is_file():
            report.update({"accepted": False, "maskConfidence": 0.0, "flagReasons": ["selected-base-file-missing"]})
            angle_reports.append(report)
            continue
        before = hashlib.sha256(original_path.read_bytes()).hexdigest()
        base = load(original_path)
        result = build_upholstery_mask(base, closeup)
        after = hashlib.sha256(original_path.read_bytes()).hexdigest()
        report.update({key: value for key, value in result.items() if key not in {"upholsteryMask", "subjectMask", "shadowMask"}})
        report["originalIntegrity"] = "unchanged" if before == after == angle.get("storedSha256", after) else "changed"
        if before != after:
            report["accepted"] = False
            report["flagReasons"] = ["original-base-was-modified"]
        if result.get("accepted"):
            # Only the upholstery alpha mask and cleaned current image enter
            # the runtime. Subject/shadow masks are deterministically rebuilt
            # from the untouched source by verify_encoded.py.
            suffix = "" if angle["angleId"] == "front" else f"-{angle['angleId']}"
            mask_path = output / "assets/masks" / f"{product['id']}{suffix}.png"
            mask_path.parent.mkdir(parents=True, exist_ok=True)
            rgba_mask(result["upholsteryMask"]).save(mask_path, "PNG", optimize=True)
            clean = clean_white_base(base, result["subjectMask"])
            current_path = output / "assets/variants" / product["id"] / f"current{suffix}.webp"
            current_path.parent.mkdir(parents=True, exist_ok=True)
            current_image, _ = pure_white_at_1200(clean, result["subjectMask"])
            # Lossless encoding keeps the pure-white background, protected
            # non-upholstery pixels and soft contact shadow byte-for-byte after
            # decoding. Lossy WebP introduced isolated off-white QA outliers.
            current_image.save(current_path, "WEBP", lossless=True, method=6)
            accepted.append({
                "angleId": angle["angleId"],
                "originalBaseImage": angle["originalPath"],
                "baseImageSourceUrl": angle["sourceUrl"],
                "baseImage": current_path.relative_to(output).as_posix(),
                "maskImage": mask_path.relative_to(output).as_posix(),
                "maskConfidence": result["maskConfidence"],
                "maskCoverage": result["maskCoverage"],
                "borderWhiteRatio": angle["borderWhiteRatio"],
                "singleObjectConfidence": angle["singleObjectConfidence"],
                "_clean": clean,
                "_mask": result["upholsteryMask"],
                "_subject": result["subjectMask"],
                "_shadow": result["shadowMask"],
            })
        angle_reports.append(report)
    front_ok = bool(accepted and accepted[0]["angleId"] == "front")
    if not front_ok:
        accepted = []
        product["previewBaseStatus"] = "flagged"
        product["maskConfidence"] = 0.0
        product["previewBaseAttention"] = ["A white-background FRONT image with an accepted upholstery mask is required; live recolour is disabled."]
        if angle_reports and angle_reports[0].get("flagReasons"):
            product["previewBaseAttention"].extend(angle_reports[0]["flagReasons"])
    else:
        product["previewBaseStatus"] = "white-background"
        product["maskConfidence"] = accepted[0]["maskConfidence"]
        product["previewBaseAttention"] = [f"Optional {report['angleId']} was not used: {', '.join(report.get('flagReasons', []))}" for report in angle_reports[1:] if not report.get("accepted")]
    product["previewAngles"] = [public_angle(angle) for angle in accepted]
    product["previewBaseOriginalPath"] = accepted[0]["originalBaseImage"] if accepted else None
    product["baseImagePath"] = accepted[0]["baseImage"] if accepted else None
    product["maskImagePath"] = accepted[0]["maskImage"] if accepted else None
    return accepted, angle_reports


def contact_sheet(product: dict[str, Any], current: Image.Image | None, thumbnails: dict[str, Image.Image], output: Path) -> Path:
    entries = all_colours(product)
    columns, card_w, card_h, header = 5, 200, 220, 82
    rows = math.ceil(len(entries) / columns)
    sheet = Image.new("RGB", (columns * card_w, header + rows * card_h), "#F5F1F2")
    draw = ImageDraw.Draw(sheet)
    draw.text((14, 10), product["name"], fill="#291F24", font=font(20, True))
    base_text = f"WHITE BASE · mask {product.get('maskConfidence', 0):.0%}" if product.get("previewAngles") else "FLAGGED · no white-base live recolour"
    draw.text((14, 39), f"{product['id']} · {base_text}", fill="#74676D", font=font(11))
    draw.text((14, 59), "Original lifestyle gallery is retained separately and never recoloured.", fill="#74676D", font=font(10))
    current_thumb = contain(current, (184, 135)) if current else None
    for index, (fabric, colour) in enumerate(entries):
        x, y = (index % columns) * card_w, header + (index // columns) * card_h
        draw.rectangle((x + 4, y + 4, x + card_w - 5, y + card_h - 5), fill="#FFFFFF", outline="#E0D7DA")
        key = f"{fabric['id']}::{colour['id']}"
        thumb = current_thumb if colour.get("current") else thumbnails.get(key)
        if thumb:
            sheet.paste(thumb, (x + (card_w - thumb.width) // 2, y + 8 + (135 - thumb.height) // 2))
        else:
            closeup_path = output / (colour.get("closeupPath") or "")
            if closeup_path.is_file():
                swatch = contain_file(str(closeup_path), (92, 92))
                sheet.paste(swatch, (x + (card_w - swatch.width) // 2, y + 22))
            draw.text((x + 22, y + 121), "CLOSE-UP / SWATCH ONLY", fill="#A3272E", font=font(10, True))
        label = "CURRENT FABRIC" if colour.get("current") else colour["name"]
        draw.text((x + 10, y + 150), f"{fabric['name']} · {label}"[:31], fill="#291F24", font=font(10, True))
        draw.text((x + 10, y + 169), str(colour.get("code") or "Code not listed")[:30], fill="#74676D", font=font(9))
        if colour.get("previewUnavailable"):
            status = "WHITE BASE FLAGGED" if colour.get("current") else "CLOSE-UP ONLY"
        elif colour.get("available") is False:
            status = "OUT OF STOCK · WHITE PREVIEW"
        elif colour.get("current"):
            status = "CURRENT · PURE WHITE BASE"
        else:
            status = "WHITE MASK PREVIEW"
        draw.text((x + 10, y + 190), status, fill="#A3272E" if colour.get("available") is False or colour.get("previewUnavailable") else "#74676D", font=font(9))
    path = output / "contact-sheets" / f"{product['id']}.webp"
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, "WEBP", quality=78, method=6)
    return path


def flag_product(product: dict[str, Any]) -> None:
    for _, colour in all_colours(product):
        colour["variantPath"] = None
        colour["variantKind"] = "unavailable"
        colour["previewUnavailable"] = True
        colour["flagReasons"] = ["no-accepted-white-background-front-base"]


def base_report_rows(manifest: dict[str, Any], product_stats: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for product_id, product in manifest["products"].items():
        if not product.get("hasOptions"):
            rows.append({"productId": product_id, "product": product["name"], "baseImage": "Not required — no genuine named fabric options", "status": "not-applicable", "maskConfidence": None, "variantsRendered": 0, "attention": []})
            continue
        stats = product_stats[product_id]
        accepted = bool(product.get("previewAngles"))
        attention = list(product.get("previewBaseAttention", [])) + stats["attention"]
        rows.append({
            "productId": product_id,
            "product": product["name"],
            "baseImage": product.get("previewBaseOriginalPath") if accepted else (f"FLAGGED MASK — {product['whiteBaseImages'][0]['originalPath']}" if product.get("whiteBaseImages") else "FLAGGED — no white-background gallery image"),
            "status": "white-background" if accepted else "flagged",
            "maskConfidence": product.get("maskConfidence", 0) if accepted else 0,
            "variantsRendered": stats["variantsRendered"],
            "livePreviewAngles": len(product.get("previewAngles", [])),
            "attention": attention,
        })
    for unmatched in manifest.get("unmatched", []):
        rows.append({"productId": unmatched["id"], "product": unmatched["name"], "baseImage": "Not inspected — official product unmatched", "status": "not-applicable", "maskConfidence": None, "variantsRendered": 0, "attention": ["Match the official product before assessing fabric options."]})
    return rows


def write_base_report(output: Path, generated: str, rows: list[dict[str, Any]]) -> None:
    report = {
        "generatedAt": generated,
        "scope": "Every app product; all products with genuine named fabric options were inspected across every published gallery angle.",
        "counts": {
            "rows": len(rows),
            "optionProducts": sum(row["status"] != "not-applicable" for row in rows),
            "whiteBackgroundProducts": sum(row["status"] == "white-background" for row in rows),
            "flaggedProducts": sum(row["status"] == "flagged" for row in rows),
            "variantsRendered": sum(row["variantsRendered"] for row in rows),
        },
        "thresholds": {"borderNearWhiteRatioExclusive": 0.90, "singleObjectConfidenceMinimum": 0.80, "maskConfidenceMinimum": 0.70},
        "products": rows,
    }
    (output / "base-image-report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    def cell(value: Any) -> str:
        return str(value).replace("|", "\\|").replace("\n", " ")
    lines = [
        "# White-background fabric preview report", "", f"Generated: {generated}", "",
        "Every option product was inspected across its website gallery. `FLAGGED` means no lifestyle image was substituted and live recolour is disabled. Variants rendered counts successful QA frames across accepted angles, including Current Fabric.", "",
        "| Product | Base image used | Mask confidence | Variants rendered | Needs attention |",
        "|---|---|---:|---:|---|",
    ]
    for row in rows:
        confidence = "—" if row["maskConfidence"] is None else f"{row['maskConfidence']:.1%}"
        attention = "; ".join(row["attention"]) or ("None" if row["status"] == "white-background" else "—")
        lines.append(f"| {cell(row['product'])} (`{cell(row['productId'])}`) | {cell(row['baseImage'])} | {confidence} | {row['variantsRendered']} | {cell(attention)} |")
    (output / "base-image-report.md").write_text("\n".join(lines) + "\n")


def refresh_current_bases(products: list[dict[str, Any]], output: Path) -> None:
    """Resume a rendered checkpoint with lossless Current images only.

    Existing accepted angle IDs and colour QA decisions are left untouched. The
    source hash and deterministic mask must still match before a base is written.
    """
    for index, product in enumerate(products, 1):
        angles = product.get("previewAngles", [])
        if not angles:
            continue
        closeup = current_closeup(product, output)
        for angle in angles:
            original_path = output / angle["originalBaseImage"]
            source = next(item for item in product["whiteBaseImages"] if item["angleId"] == angle["angleId"])
            if hashlib.sha256(original_path.read_bytes()).hexdigest() != source.get("storedSha256"):
                raise RuntimeError(f"Original base changed for {product['id']} / {angle['angleId']}")
            base = load(original_path)
            prepared = build_upholstery_mask(base, closeup)
            if not prepared.get("accepted"):
                raise RuntimeError(f"Accepted mask no longer reproduces for {product['id']} / {angle['angleId']}")
            with Image.open(output / angle["maskImage"]) as mask_image:
                installed_mask = mask_image.getchannel("A")
            if not np.array_equal(np.asarray(installed_mask), np.asarray(prepared["upholsteryMask"])):
                raise RuntimeError(f"Installed mask differs for {product['id']} / {angle['angleId']}")
            clean = clean_white_base(base, prepared["subjectMask"])
            current_image, _ = pure_white_at_1200(clean, prepared["subjectMask"])
            current_image.save(output / angle["baseImage"], "WEBP", lossless=True, method=6)
        print(f"Lossless Current [{index}/{len(products)}] {product['id']}: {len(angles)} angle(s)", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT / "fabric-output")
    parser.add_argument("--delay", type=float, default=0.15)
    parser.add_argument("--skip-closeup-repair", action="store_true")
    parser.add_argument("--current-only", action="store_true", help="Only refresh accepted Current bases as lossless WebP")
    args = parser.parse_args()
    output = args.input.resolve()
    manifest_path = output / "fabric-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    products = [product for product in manifest["products"].values() if product.get("hasOptions")]
    if args.current_only:
        refresh_current_bases(products, output)
        return 0
    errors: list[dict[str, str]] = []
    repaired_closeups = 0
    if not args.skip_closeup_repair:
        errors, repaired_closeups = repair_current_closeups(products, output, args.delay)
    angle_recovery_errors = recover_similar_angles(products, output, args.delay)
    quality: list[dict[str, Any]] = []
    angle_rows: list[dict[str, Any]] = []
    product_stats: dict[str, dict[str, Any]] = {}
    for product_index, product in enumerate(products, 1):
        accepted, angle_reports = prepare_product(product, output)
        angle_rows.extend(angle_reports)
        stats = {"variantsRendered": 0, "attention": []}
        product_stats[product["id"]] = stats
        if not accepted:
            flag_product(product)
            contact_sheet(product, None, {}, output)
            continue
        # Optimistically expose only colours with a genuine close-up. Front QA
        # below can still reject an individual combination.
        for fabric, colour in all_colours(product):
            colour["flagReasons"] = []
            closeup_path = output / (colour.get("closeupPath") or "")
            if closeup_path.is_file():
                colour["renderRgb"] = median_colour(load(closeup_path)).round(2).tolist()
            if colour.get("current"):
                colour["variantPath"] = accepted[0]["baseImage"] if accepted else None
                colour["variantKind"] = "white-base" if accepted else "unavailable"
                colour["previewUnavailable"] = not accepted
            elif accepted and closeup_path.is_file():
                colour["variantPath"] = None
                colour["variantKind"] = "white-mask"
                colour["previewUnavailable"] = False
            else:
                colour["variantPath"] = None
                colour["variantKind"] = "unavailable"
                colour["previewUnavailable"] = True
                colour["flagReasons"] = ["missing-closeup"]
        stats["variantsRendered"] += len(accepted)  # cleaned Current Fabric angles
        thumbnails: dict[str, Image.Image] = {}
        rejected_extra_angles: set[str] = set()
        for fabric, colour in all_colours(product):
            if colour.get("current") or colour.get("variantKind") != "white-mask":
                continue
            closeup_path = output / colour["closeupPath"]
            closeup = load(closeup_path)
            key = f"{fabric['id']}::{colour['id']}"
            for angle in list(accepted):
                if angle["angleId"] in rejected_extra_angles:
                    continue
                try:
                    rendered, metrics = white_masked_render(angle["_clean"], angle["_mask"], closeup, angle["_subject"], angle["_shadow"])
                    metrics.update({"productId": product["id"], "angleId": angle["angleId"], "fabricId": fabric["id"], "colourId": colour["id"], "name": colour["name"]})
                    quality.append(metrics)
                    if metrics["flags"]:
                        colour["flagReasons"] = metrics["flags"]
                        if angle["angleId"] == "front":
                            colour["variantKind"] = "unavailable"
                            colour["previewUnavailable"] = True
                            break
                        rejected_extra_angles.add(angle["angleId"])
                        stats["attention"].append(f"Optional {angle['angleId']} removed after render QA: {', '.join(metrics['flags'])}")
                        continue
                    stats["variantsRendered"] += 1
                    if angle["angleId"] == "front" and not colour.get("previewUnavailable"):
                        thumbnails[key] = contain(rendered, (184, 135))
                except Exception as error:
                    reason = f"render-error:{error}"
                    colour["flagReasons"] = [reason]
                    if angle["angleId"] == "front":
                        colour["variantKind"] = "unavailable"
                        colour["previewUnavailable"] = True
                        break
                    rejected_extra_angles.add(angle["angleId"])
                    stats["attention"].append(f"Optional {angle['angleId']} removed: {reason}")
        if rejected_extra_angles:
            accepted = [angle for angle in accepted if angle["angleId"] == "front" or angle["angleId"] not in rejected_extra_angles]
            product["previewAngles"] = [public_angle(angle) for angle in accepted]
        contact_sheet(product, accepted[0]["_clean"], thumbnails, output)
        print(f"Render [{product_index}/{len(products)}] {product['id']}: {stats['variantsRendered']} QA frames, {len(product['previewAngles'])} live angle(s)", flush=True)

    # Report every material/hex mismatch without treating hex as render truth.
    mismatches = []
    median_cache: dict[str, np.ndarray] = {}
    for product in products:
        for fabric, colour in all_colours(product):
            closeup_path = output / (colour.get("closeupPath") or "")
            if not colour.get("hex") or not closeup_path.is_file():
                continue
            official = np.array([int(colour["hex"][i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)
            key = str(closeup_path)
            if key not in median_cache:
                median_cache[key] = median_colour(load(closeup_path))
            measured = median_cache[key]
            difference = delta_e(official, measured)
            if difference > 20:
                mismatches.append({"productId": product["id"], "fabricId": fabric["id"], "colourId": colour["id"], "name": colour["name"], "officialHex": colour["hex"], "swatchMedianRgb": measured.round(2).tolist(), "deltaE76": difference})
    generated = datetime.now(timezone.utc).isoformat()
    rows = base_report_rows(manifest, product_stats)
    write_base_report(output, generated, rows)
    flat = [(product, fabric, colour) for product in products for fabric, colour in all_colours(product)]
    report = {
        "generatedAt": generated,
        "counts": {
            "contactSheets": len(products),
            "whiteBackgroundProducts": sum(bool(product.get("previewAngles")) for product in products),
            "flaggedBaseProducts": sum(not product.get("previewAngles") for product in products),
            "whiteBackgroundAngles": sum(len(product.get("previewAngles", [])) for product in products),
            "renderedApproved": sum(colour.get("variantKind") == "white-mask" for _, _, colour in flat),
            "renderedVariantChecks": len(quality),
            "officialVariantImages": 0,
            "previewUnavailable": sum(bool(colour.get("previewUnavailable")) and not colour.get("current") for _, _, colour in flat),
            "currentCloseupsRepaired": repaired_closeups,
            "materialHexMismatches": len(mismatches),
            "imageDownloadErrors": len(errors),
            "angleRecoveryErrors": len(angle_recovery_errors),
        },
        "thresholds": {"deltaE76Max": 25, "unmaskedMeanMax": 4, "maskLeakRatioMax": 0.02, "shadowMeanMax": 4, "highlightIncreaseMax": 0.04, "edgeHaloRatioMax": 0.02, "hexMismatchReviewDeltaE76": 20},
        "renderChecks": quality,
        "maskChecks": angle_rows,
        "materialHexMismatches": mismatches,
        "imageDownloadErrors": errors,
        "angleRecoveryErrors": angle_recovery_errors,
        "flagged": [{"productId": product["id"], "fabricId": fabric["id"], "colourId": colour["id"], "name": colour["name"], "reasons": colour.get("flagReasons", ["no-accepted-white-background-front-base"])} for product, fabric, colour in flat if colour.get("previewUnavailable") and not colour.get("current")],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    (output / "quality-report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    lines = ["# Fabric preview QA", "", f"Generated: {generated}", "", "Live variants use audited white bases and aligned upholstery masks on-device; every combination was also rendered for these QA checks. Lifestyle photographs are never recoloured.", "", "## Counts", ""] + [f"- **{key}:** {value}" for key, value in report["counts"].items()]
    lines += ["", "[Full white-base product table](base-image-report.md)", "", "## Material swatch / hex mismatches", "", "Swatch photographs are treated as the colour reference; mismatches are reported, not silently corrected to hex.", ""]
    lines += [f"- {item['productId']} / {item['fabricId']} / {item['name']}: {item['officialHex']}, measured RGB {item['swatchMedianRgb']}, ΔE76 {item['deltaE76']:.2f}" for item in mismatches] or ["None above the review threshold."]
    (output / "quality-report.md").write_text("\n".join(lines) + "\n")
    links = "\n".join(f'<li><a href="contact-sheets/{html.escape(product["id"])}.webp">{html.escape(product["name"])}</a> <code>{html.escape(product["id"])}</code></li>' for product in products)
    (output / "contact-sheet-index.html").write_text(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Official fabric contact sheets</title><style>body{{font:16px system-ui;max-width:1000px;margin:32px auto;padding:0 18px;color:#291f24}}li{{margin:9px 0}}code{{color:#74676d;font-size:12px}}</style></head><body><h1>White-background fabric contact sheets</h1><p>{len(products)} option products · flagged products show close-ups only. Original lifestyle galleries are not recoloured.</p><p><a href="base-image-report.md">Full product/base/mask table</a> · <a href="quality-report.json">Machine-readable QA</a> · <a href="quality-report.md">QA summary</a></p><ul>{links}</ul></body></html>')
    print(json.dumps(report["counts"], indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
