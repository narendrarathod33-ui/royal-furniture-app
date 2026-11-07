#!/usr/bin/env python3
"""Offline masked rendering, pixel QA and per-product contact sheets.

Only reviewed, aligned mask/photo pairs are recoloured. Rejected renders are
kept under qa-rejected/ for inspection and are never installed as app assets.
Original images for QA are downloaded sequentially and cached; no API requests
are made by this script.
"""
from __future__ import annotations

import argparse
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

from scripts.fabrics.extract import colour_asset_id, load_catalog
MASKS = {
    "7072-serafina-corner-sofa": {
        "base": "assets/images/catalog-live/serafina-corner-sofa.webp",
        "mask": "assets/images/fabric-masks/serafina-corner-sofa.png",
        "protected": {
            "wall": (0.5, 0.02, 0.45, 0.28), "artwork": (0.25, 0.08, 0.21, 0.17),
            "plantTop": (0.01, 0.2, 0.045, 0.05), "plantMiddle": (0.02, 0.29, 0.06, 0.04),
            "leftBrownPillow": (0.205, 0.46, 0.035, 0.04), "leftWhitePillow": (0.3, 0.44, 0.04, 0.05),
            "rightLightPillow": (0.61, 0.42, 0.05, 0.04), "rightDarkPillow": (0.705, 0.415, 0.03, 0.035),
            "leftFoot": (0.19, 0.724, 0.04, 0.007), "chaiseFoot": (0.82, 0.681, 0.06, 0.012),
            "rug": (0.0, 0.8, 1.0, 0.2),
        },
    },
    "6219-trento-single-seater-sofa": {
        "base": "assets/images/catalog-live/trento-single-seater-sofa.webp",
        "mask": "assets/images/fabric-masks/trento-single-seater-sofa.png",
        "protected": {
            "lamp": (0.0, 0.0, 0.16, 0.85), "wallArt": (0.36, 0.0, 0.54, 0.23),
            "leftWall": (0.0, 0.25, 0.16, 0.55), "sideTable": (0.84, 0.46, 0.16, 0.42),
            "rug": (0.0, 0.92, 1.0, 0.08),
        },
    },
}


def font(size: int, bold: bool = False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)
    except OSError:
        return ImageFont.load_default()


def median_colour(image: Image.Image) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    h, w = rgb.shape[:2]
    core = rgb[h // 10 : max(h // 10 + 1, h * 9 // 10), w // 10 : max(w // 10 + 1, w * 9 // 10)]
    return np.median(core.reshape(-1, 3), axis=0)


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


def rect_pixels(region: tuple[float, float, float, float], width: int, height: int) -> tuple[slice, slice]:
    x, y, w, h = region
    return slice(int(y * height), max(int(y * height) + 1, int((y + h) * height))), slice(int(x * width), max(int(x * width) + 1, int((x + w) * width)))


def masked_render(base: Image.Image, mask: Image.Image, closeup: Image.Image) -> tuple[Image.Image, dict[str, Any]]:
    width = 1200
    height = round(base.height * width / base.width)
    base = base.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
    alpha_image = mask.getchannel("A").resize((width, height), Image.Resampling.LANCZOS)
    # Protected core rectangles are hard exclusions, including resampling fringe.
    protected_alpha = np.asarray(alpha_image).copy()
    for region in MASKS[current_product_id]["protected"].values():
        ys, xs = rect_pixels(region, width, height)
        protected_alpha[ys, xs] = 0
    alpha_image = Image.fromarray(protected_alpha, "L")
    alpha = np.asarray(alpha_image, dtype=np.float32) / 255.0
    source = np.asarray(base, dtype=np.float32)
    target = median_colour(closeup)
    luminance = source @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    inside = alpha > 0.95
    if inside.sum() < 1000:
        raise ValueError("Aligned upholstery mask has too few interior pixels")
    typical = float(np.median(luminance[inside]))
    relative = np.clip(luminance / max(typical, 1), 0.32, 1.8) ** 0.88
    rendered = target[None, None, :] * relative[..., None]
    # Real close-up high-frequency detail supplies weave without projecting the
    # swatch photo, its lighting or its edges onto the furniture.
    texture = closeup.convert("L").resize((420, 420), Image.Resampling.LANCZOS)
    texture_array = np.asarray(texture, dtype=np.float32)
    blurred = np.asarray(texture.filter(ImageFilter.GaussianBlur(3)), dtype=np.float32)
    detail = np.clip(texture_array - blurred, -14, 14) * 0.2
    tiled = np.tile(detail, (math.ceil(height / 420), math.ceil(width / 420)))[:height, :width]
    rendered = np.clip(rendered + tiled[..., None], 0, 255)
    output = source * (1 - alpha[..., None]) + rendered * alpha[..., None]
    output = Image.fromarray(np.uint8(np.clip(output + 0.5, 0, 255)), "RGB")
    # Compare before lossy encoding, then repeat essential checks on the saved file.
    changed = np.asarray(output, dtype=np.float32)
    difference = np.abs(changed - source).mean(axis=2)
    unmasked = np.asarray(alpha_image) == 0
    background_mean = float(difference[unmasked].mean())
    leak_ratio = float((difference[unmasked] > 12).mean())
    protected = {}
    flags = []
    for name, region in MASKS[current_product_id]["protected"].items():
        ys, xs = rect_pixels(region, width, height)
        mask_max = int(np.asarray(alpha_image)[ys, xs].max())
        mean = float(difference[ys, xs].mean())
        over = float((difference[ys, xs] > 12).mean())
        protected[name] = {"maskMax": mask_max, "mean": mean, "over12": over}
        if mask_max or mean >= 4 or over >= 0.02:
            flags.append(f"protected:{name}")
    rendered_median = np.median(changed[inside], axis=0)
    colour_difference = delta_e(rendered_median, target)
    if colour_difference > 25:
        flags.append("colour-difference")
    if background_mean >= 4 or leak_ratio >= 0.02:
        flags.append("mask-leak")
    base_blown = (source > 250).all(axis=2) & inside
    rendered_blown = (changed > 250).all(axis=2) & inside
    highlight_increase = float((rendered_blown.sum() - base_blown.sum()) / inside.sum())
    if highlight_increase > 0.04:
        flags.append("blown-highlights")
    return output, {
        "swatchMedianRgb": target.round(2).tolist(), "renderedMedianRgb": rendered_median.round(2).tolist(),
        "deltaE76": colour_difference, "unmaskedMean": background_mean, "maskLeakRatio": leak_ratio,
        "protected": protected, "highlightIncrease": highlight_increase, "flags": flags,
    }


def load(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    return copy


@lru_cache(maxsize=1024)
def contain_file(path: str, size: tuple[int, int]) -> Image.Image:
    """Decode/resize a shared official asset once across all contact sheets."""
    return contain(load(Path(path)), size)


def repair_current_closeups(products: list[dict[str, Any]], output: Path, delay: float) -> tuple[list[dict[str, str]], int]:
    """Give each official Current Fabric close-up a collision-free local path.

    Early extractor runs used the UI id `current` as a filename. No API request is
    needed to repair that: the manifest already carries each official image URL.
    """
    session = requests.Session()
    session.headers.update({"User-Agent": "RoyalFurnitureInternalDemoFabricQA/1.0", "Accept": "image/webp,image/*,*/*;q=0.8"})
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
                    colour["closeupPath"] = None
                    colour["swatchPath"] = None
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
                        colour["closeupPath"] = None
                        colour["swatchPath"] = None
                        continue
                with Image.open(destination) as image:
                    colour["closeupWidth"], colour["closeupHeight"] = image.size
                colour["closeupPath"] = destination.relative_to(output).as_posix()
                colour["swatchPath"] = thumbnail.relative_to(output).as_posix()
    return errors, downloaded


def download_originals(products: list[dict[str, Any]], output: Path, delay: float) -> tuple[dict[str, Path], list[dict[str, str]], list[str]]:
    session = requests.Session()
    session.headers.update({"User-Agent": "RoyalFurnitureInternalDemoFabricQA/1.0", "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"})
    originals: dict[str, Path] = {}
    errors = []
    catalogue_fallbacks: list[str] = []
    # Older harvested manifests missed the API's direct primary_images.web.url
    # shape. Their existing official catalogue photo is a valid original for QA;
    # use it locally instead of repeating hundreds of product API requests.
    catalogue_originals = {product["id"]: product.get("remoteImage") for product in load_catalog()}
    last = 0.0
    for index, product in enumerate(products, 1):
        product_id = product["id"]
        if product_id in MASKS:
            originals[product_id] = ROOT / MASKS[product_id]["base"]
            continue
        destination = output / "originals" / f"{product_id}.webp"
        if destination.exists():
            originals[product_id] = destination
            continue
        url = product.get("baseImageSourceUrl")
        if not url and catalogue_originals.get(product_id):
            url = catalogue_originals[product_id]
            catalogue_fallbacks.append(product_id)
        if not url:
            errors.append({"productId": product_id, "error": "No primary original URL"})
            continue
        try:
            remaining = delay - (time.monotonic() - last)
            if remaining > 0:
                time.sleep(remaining)
            response = session.get(url, timeout=(15, 45))
            last = time.monotonic()
            if response.status_code in (401, 403):
                raise PermissionError(f"Original-image access blocked ({response.status_code}); stopping")
            response.raise_for_status()
            with Image.open(io.BytesIO(response.content)) as image:
                image = ImageOps.exif_transpose(image).convert("RGB")
                destination.parent.mkdir(parents=True, exist_ok=True)
                image.save(destination, "WEBP", quality=90, method=6)
            originals[product_id] = destination
            print(f"Original [{index}/{len(products)}] {product_id}", flush=True)
        except PermissionError:
            raise
        except Exception as error:
            errors.append({"productId": product_id, "url": url, "error": str(error)})
    return originals, errors, catalogue_fallbacks


def contact_sheet(product: dict[str, Any], original: Image.Image | None, output: Path) -> Path:
    entries = [(fabric, colour) for fabric in product["fabricTypes"] for colour in fabric["colours"]]
    columns, card_w, card_h, header = 5, 200, 220, 68
    rows = math.ceil(len(entries) / columns)
    sheet = Image.new("RGB", (columns * card_w, header + rows * card_h), "#F5F1F2")
    draw = ImageDraw.Draw(sheet)
    draw.text((14, 12), product["name"], fill="#291F24", font=font(20, True))
    draw.text((14, 42), f"{product['id']} · original + {len(entries)} official options", fill="#74676D", font=font(11))
    original_thumb = contain(original, (184, 135)) if original else None
    for index, (fabric, colour) in enumerate(entries):
        x, y = (index % columns) * card_w, header + (index // columns) * card_h
        draw.rectangle((x + 4, y + 4, x + card_w - 5, y + card_h - 5), fill="#FFFFFF", outline="#E0D7DA")
        thumb = original_thumb
        if colour.get("variantPath"):
            candidate = output / colour["variantPath"]
            if candidate.exists():
                thumb = contain_file(str(candidate), (184, 135))
        if thumb:
            sheet.paste(thumb, (x + (card_w - thumb.width) // 2, y + 10 + (135 - thumb.height) // 2))
        else:
            draw.text((x + 20, y + 65), "ORIGINAL UNAVAILABLE", fill="#A3272E", font=font(11, True))
        label = "CURRENT FABRIC" if colour.get("current") else colour["name"]
        if colour.get("previewUnavailable") and not colour.get("current"):
            draw.rectangle((x + 8, y + 113, x + card_w - 9, y + 139), fill="#A3272E")
            draw.text((x + 15, y + 119), "PREVIEW UNAVAILABLE", fill="#FFFFFF", font=font(10, True))
            closeup_path = output / (colour.get("closeupPath") or "")
            if closeup_path.is_file():
                swatch = contain_file(str(closeup_path), (38, 38))
                sheet.paste(swatch, (x + card_w - 48, y + 98))
        draw.text((x + 10, y + 150), f"{fabric['name']} · {label}"[:31], fill="#291F24", font=font(10, True))
        draw.text((x + 10, y + 169), str(colour.get("code") or "Code not listed")[:30], fill="#74676D", font=font(9))
        status = "OUT OF STOCK" if colour.get("available") is False else colour.get("variantKind", "unavailable").upper()
        draw.text((x + 10, y + 190), status, fill="#A3272E" if colour.get("available") is False else "#74676D", font=font(9))
    path = output / "contact-sheets" / f"{product['id']}.webp"
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, "WEBP", quality=78, method=6)
    return path


def main() -> int:
    global current_product_id
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT / "fabric-output")
    parser.add_argument("--delay", type=float, default=0.15)
    parser.add_argument("--skip-original-download", action="store_true")
    args = parser.parse_args()
    output = args.input.resolve()
    manifest_path = output / "fabric-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    products = [product for product in manifest["products"].values() if product.get("hasOptions")]
    errors: list[dict[str, str]] = []
    originals: dict[str, Path] = {}
    repaired_closeups = 0
    catalogue_fallbacks: list[str] = []
    if not args.skip_original_download:
        repair_errors, repaired_closeups = repair_current_closeups(products, output, args.delay)
        originals, original_errors, catalogue_fallbacks = download_originals(products, output, args.delay)
        errors = repair_errors + original_errors
    for product_id, config in MASKS.items():
        originals[product_id] = ROOT / config["base"]
    quality = []
    for product in products:
        current_product_id = product["id"]
        for fabric in product["fabricTypes"]:
            for colour in fabric["colours"]:
                if colour.get("current") or colour.get("variantKind") == "official":
                    continue
                colour["previewUnavailable"] = True
                colour["variantPath"] = None
                colour["variantKind"] = "unavailable"
                if product["id"] not in MASKS:
                    continue
                closeup_path = output / (colour.get("closeupPath") or "")
                if not closeup_path.is_file():
                    colour["flagReasons"] = ["missing-closeup"]
                    continue
                try:
                    base = load(ROOT / MASKS[product["id"]]["base"])
                    mask = Image.open(ROOT / MASKS[product["id"]]["mask"]).convert("RGBA")
                    rendered, metrics = masked_render(base, mask, load(closeup_path))
                    relative = f"assets/variants/{product['id']}/{fabric['id']}-{colour['id']}.webp"
                    destination = output / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    rendered.save(destination, "WEBP", quality=95, method=6)
                    metrics.update({"productId": product["id"], "fabricId": fabric["id"], "colourId": colour["id"], "name": colour["name"]})
                    quality.append(metrics)
                    if metrics["flags"]:
                        rejected = output / "qa-rejected" / relative
                        rejected.parent.mkdir(parents=True, exist_ok=True)
                        destination.replace(rejected)
                        colour["flagReasons"] = metrics["flags"]
                    else:
                        colour["variantPath"] = relative
                        colour["variantKind"] = "rendered"
                        colour["previewUnavailable"] = False
                except Exception as error:
                    colour["flagReasons"] = [f"render-error:{error}"]
        original_path = originals.get(product["id"])
        original = load(original_path) if original_path and original_path.is_file() else None
        contact_sheet(product, original, output)
    # Report every material/hex mismatch without treating hex as the render truth.
    # Products share official close-ups, so decode each unique image only once.
    mismatches = []
    median_cache: dict[str, np.ndarray] = {}
    for product in products:
        for fabric in product["fabricTypes"]:
            for colour in fabric["colours"]:
                closeup_path = output / (colour.get("closeupPath") or "")
                if not colour.get("hex") or not closeup_path.is_file():
                    continue
                official = np.array([int(colour["hex"][i:i+2], 16) for i in (1, 3, 5)], dtype=np.float32)
                key = str(closeup_path)
                if key not in median_cache:
                    median_cache[key] = median_colour(load(closeup_path))
                measured = median_cache[key]
                difference = delta_e(official, measured)
                if difference > 20:
                    mismatches.append({"productId": product["id"], "fabricId": fabric["id"], "colourId": colour["id"], "name": colour["name"], "officialHex": colour["hex"], "swatchMedianRgb": measured.round(2).tolist(), "deltaE76": difference})
    all_colours = [(product, fabric, colour) for product in products for fabric in product["fabricTypes"] for colour in fabric["colours"]]
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "contactSheets": len(products), "renderedApproved": sum(colour.get("variantKind") == "rendered" for _, _, colour in all_colours),
            "officialVariantImages": sum(colour.get("variantKind") == "official" for _, _, colour in all_colours),
            "previewUnavailable": sum(bool(colour.get("previewUnavailable")) and not colour.get("current") for _, _, colour in all_colours),
            "currentCloseupsRepaired": repaired_closeups, "catalogueOriginalFallbacks": len(catalogue_fallbacks),
            "materialHexMismatches": len(mismatches), "imageDownloadErrors": len(errors),
        },
        "thresholds": {"deltaE76Max": 25, "unmaskedMeanMax": 4, "maskLeakRatioMax": 0.02, "protectedMeanMax": 4, "highlightIncreaseMax": 0.04, "hexMismatchReviewDeltaE76": 20},
        "renderChecks": quality, "materialHexMismatches": mismatches, "imageDownloadErrors": errors, "catalogueOriginalFallbacks": catalogue_fallbacks,
        "flagged": [{"productId": product["id"], "fabricId": fabric["id"], "colourId": colour["id"], "name": colour["name"], "reasons": colour.get("flagReasons", ["no-aligned-mask-or-official-photo"])} for product, fabric, colour in all_colours if colour.get("previewUnavailable") and not colour.get("current")],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    (output / "quality-report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    lines = ["# Fabric preview QA", "", f"Generated: {report['generatedAt']}", "", "## Counts", ""] + [f"- **{key}:** {value}" for key, value in report["counts"].items()]
    lines += ["", "## Material swatch / hex mismatches", "", "Swatch photographs are treated as the colour reference; mismatches are reported, not silently corrected to hex.", ""]
    lines += [f"- {item['productId']} / {item['fabricId']} / {item['name']}: {item['officialHex']}, measured RGB {item['swatchMedianRgb']}, ΔE76 {item['deltaE76']:.2f}" for item in mismatches] or ["None above the review threshold."]
    (output / "quality-report.md").write_text("\n".join(lines) + "\n")
    links = "\n".join(f'<li><a href="contact-sheets/{html.escape(product["id"])}.webp">{html.escape(product["name"])}</a> <code>{html.escape(product["id"])}</code></li>' for product in products)
    (output / "contact-sheet-index.html").write_text(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Official fabric contact sheets</title><style>body{{font:16px system-ui;max-width:1000px;margin:32px auto;padding:0 18px;color:#291f24}}li{{margin:9px 0}}code{{color:#74676d;font-size:12px}}</style></head><body><h1>Fabric contact sheets</h1><p>{len(products)} products · original plus every official option. Rejected previews are explicitly flagged.</p><p><a href="quality-report.json">Machine-readable QA</a> · <a href="quality-report.md">QA summary</a></p><ul>{links}</ul></body></html>')
    print(json.dumps(report["counts"], indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
