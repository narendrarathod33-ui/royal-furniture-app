#!/usr/bin/env python3
"""Re-render and verify compressed white-base variants without storing them all."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
from PIL import Image

from scripts.fabrics.render import delta_e, load, median_colour, pure_white_at_1200, white_masked_render
from scripts.fabrics.white_base import build_upholstery_mask, clean_white_base


def compressed(image: Image.Image) -> Image.Image:
    """Match the browser's lossless PNG data URL, including decoded pixels."""
    buffer = io.BytesIO()
    image.save(buffer, "PNG", compress_level=1)
    buffer.seek(0)
    with Image.open(buffer) as encoded:
        return encoded.convert("RGB")


def encoded_metrics(uncompressed: Image.Image, encoded: Image.Image, subject: Image.Image, shadow: Image.Image, alpha: Image.Image, target: Any = None) -> dict[str, Any]:
    size = encoded.size
    source = np.asarray(uncompressed, dtype=np.float32)
    changed = np.asarray(encoded, dtype=np.float32)
    subject_array = np.asarray(subject.convert("L").resize(size, Image.Resampling.LANCZOS)) == 0
    shadow_array = np.asarray(shadow.convert("L").resize(size, Image.Resampling.LANCZOS)) > 12
    alpha_array = np.asarray(alpha.convert("L").resize(size, Image.Resampling.LANCZOS)) == 0
    difference = np.abs(changed - source).mean(axis=2)
    background_difference = np.abs(changed[subject_array] - 255)
    inside = ~alpha_array
    row = {
        "size": [size[0], size[1]],
        "unmaskedMean": float(difference[alpha_array].mean()),
        "maskLeakRatio": float((difference[alpha_array] > 12).mean()),
        "backgroundMeanFromPureWhite": float(background_difference.mean()),
        "backgroundOver12": float((background_difference > 12).mean()),
        "backgroundExactWhiteRatio": float((background_difference == 0).all(axis=1).mean()),
        "contactShadowMean": float(difference[shadow_array].mean()) if shadow_array.any() else 0.0,
        "contactShadowOver12": float((difference[shadow_array] > 12).mean()) if shadow_array.any() else 0.0,
        "flags": [],
    }
    if row["unmaskedMean"] >= 4 or row["maskLeakRatio"] >= 0.02:
        row["flags"].append("encoded-mask-leak")
    if row["backgroundMeanFromPureWhite"] >= 4 or row["backgroundOver12"] > 0:
        row["flags"].append("encoded-background-not-white")
    if row["contactShadowMean"] >= 4 or row["contactShadowOver12"] >= 0.02:
        row["flags"].append("encoded-contact-shadow-change")
    if target is not None and inside.any():
        row["deltaE76"] = delta_e(np.median(changed[inside], axis=0), target)
        if row["deltaE76"] > 25:
            row["flags"].append("encoded-colour-difference")
    return row


def command_text(value: Any) -> str:
    """Escape a GitHub workflow command without exposing multiline log markup."""
    return str(value).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def print_summary(report: dict[str, Any]) -> None:
    flagged = [row for row in report.get("variants", []) if row.get("flags")]
    flag_counts = Counter(flag for row in flagged for flag in row["flags"])
    summary = {
        "valid": report.get("valid"),
        "checkedEncodedVariants": report.get("checkedEncodedVariants", 0),
        "checkedDynamicVariants": report.get("checkedDynamicVariants", 0),
        "integrityErrors": len(report.get("originalIntegrityErrors", [])),
        "flagCounts": dict(flag_counts),
        "flagged": [{"productId": row["productId"], "angleId": row.get("angleId"), "colourId": row.get("colourId"), "flags": row["flags"]} for row in flagged][:100],
    }
    print(json.dumps(summary, indent=2))
    if report.get("valid"):
        return
    print(f"::error::Encoded fabric QA failed: {len(flagged)} flagged frames; {command_text(dict(flag_counts))}")
    for row in flagged[:10]:
        identifier = " / ".join(str(row.get(key, "current")) for key in ("productId", "angleId", "colourId"))
        metrics = {key: row.get(key) for key in ("unmaskedMean", "maskLeakRatio", "backgroundMeanFromPureWhite", "backgroundOver12", "contactShadowMean", "contactShadowOver12", "deltaE76") if key in row}
        print(f"::error::{command_text(identifier)}: {command_text(row['flags'])}; {command_text(metrics)}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, help="Summarize an existing encoded report without rendering")
    args = parser.parse_args()
    if args.report:
        report = json.loads(args.report.read_text())
        print_summary(report)
        return 0 if report.get("valid") else 1
    manifest = json.loads((ROOT / "app/data/fabricManifest.json").read_text())
    rows = []
    integrity_errors = []
    for product in manifest["products"].values():
        angles = product.get("previewAngles", [])
        if not product.get("hasOptions") or not angles:
            continue
        current = next(colour for fabric in product["fabricTypes"] for colour in fabric["colours"] if colour.get("current"))
        current_closeup_path = ROOT / (current.get("closeupPath") or "")
        current_closeup = load(current_closeup_path) if current_closeup_path.is_file() else None
        for angle in angles:
            original_path = ROOT / angle["originalBaseImage"]
            original_bytes = original_path.read_bytes()
            source_info = next(item for item in product["whiteBaseImages"] if item["angleId"] == angle["angleId"])
            if source_info.get("storedSha256") and hashlib.sha256(original_bytes).hexdigest() != source_info["storedSha256"]:
                integrity_errors.append({"productId": product["id"], "angleId": angle["angleId"], "path": angle["originalBaseImage"]})
            base = load(original_path)
            prepared = build_upholstery_mask(base, current_closeup)
            if not prepared.get("accepted"):
                rows.append({"productId": product["id"], "angleId": angle["angleId"], "kind": "mask", "flags": ["installed-mask-no-longer-reproducible"]})
                continue
            clean = clean_white_base(base, prepared["subjectMask"])
            current_image, _ = pure_white_at_1200(clean, prepared["subjectMask"])
            current_encoded = load(ROOT / angle["baseImage"])
            metrics = encoded_metrics(current_image, current_encoded, prepared["subjectMask"], prepared["shadowMask"], prepared["upholsteryMask"])
            rows.append({"productId": product["id"], "angleId": angle["angleId"], "kind": "current", "variantPath": angle["baseImage"], **metrics})
            for fabric in product["fabricTypes"]:
                for colour in fabric["colours"]:
                    if colour.get("variantKind") != "white-mask" or colour.get("previewUnavailable"):
                        continue
                    closeup_path = ROOT / colour["closeupPath"]
                    closeup = load(closeup_path)
                    target = median_colour(closeup)
                    rendered, render_metrics = white_masked_render(clean, prepared["upholsteryMask"], closeup, prepared["subjectMask"], prepared["shadowMask"])
                    encoded = compressed(rendered)
                    metrics = encoded_metrics(rendered, encoded, prepared["subjectMask"], prepared["shadowMask"], prepared["upholsteryMask"], target)
                    metrics["flags"] = list(dict.fromkeys(render_metrics["flags"] + metrics["flags"]))
                    rows.append({"productId": product["id"], "angleId": angle["angleId"], "kind": "dynamic", "fabricId": fabric["id"], "colourId": colour["id"], "name": colour["name"], **metrics})
        print(f"Encoded QA {product['id']}: {len(angles)} angle(s)", flush=True)
    report = {
        "valid": bool(rows) and not integrity_errors and not any(row["flags"] for row in rows),
        "checkedEncodedVariants": len(rows),
        "checkedCurrentBases": sum(row["kind"] == "current" for row in rows),
        "checkedDynamicVariants": sum(row.get("kind") == "dynamic" for row in rows),
        "originalIntegrityErrors": integrity_errors,
        "thresholds": {"deltaE76Max": 25, "unmaskedMeanMax": 4, "maskLeakRatioMax": 0.02, "backgroundMeanMax": 4, "backgroundOver12Max": 0, "shadowMeanMax": 4, "highlightIncreaseMax": 0.04},
        "variants": rows,
    }
    destination = ROOT / "docs/fabric-qa/encoded-quality-report.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print_summary(report)
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
