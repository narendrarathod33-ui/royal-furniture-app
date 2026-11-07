#!/usr/bin/env python3
"""Validate completeness and safety invariants of an official fabric artifact."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.fabrics.extract import load_catalog
GENERIC = {"selectable", "select", "default"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT / "fabric-output")
    args = parser.parse_args()
    root = args.input.resolve()
    manifest = json.loads((root / "fabric-manifest.json").read_text())
    catalog = load_catalog()
    expected = {product["id"] for product in catalog}
    matched = set(manifest["products"])
    unmatched = {row["id"] for row in manifest.get("unmatched", [])}
    errors = []
    warnings = []
    counts = {"appProducts": len(expected), "matched": len(matched), "unmatched": len(unmatched), "productsWithOptions": 0, "types": 0, "colours": 0, "currentFabrics": 0, "localAssets": 0, "previewUnavailable": 0, "whiteBackgroundProducts": 0, "flaggedBaseProducts": 0, "whiteMaskVariants": 0, "whiteBackgroundAngles": 0}
    if matched & unmatched or matched | unmatched != expected:
        errors.append({"kind": "coverage", "missing": sorted(expected - matched - unmatched), "duplicate": sorted(matched & unmatched), "unexpected": sorted((matched | unmatched) - expected)})
    type_names = set()
    for product_id, product in manifest["products"].items():
        if product["id"] != product_id:
            errors.append({"kind": "id-mismatch", "productId": product_id})
        if not product.get("hasOptions"):
            continue
        counts["productsWithOptions"] += 1
        currents = [(fabric, colour) for fabric in product["fabricTypes"] for colour in fabric["colours"] if colour.get("current")]
        if len(currents) != 1:
            errors.append({"kind": "current-fabric-count", "productId": product_id, "count": len(currents)})
        angles = product.get("previewAngles", [])
        if angles:
            counts["whiteBackgroundProducts"] += 1
            counts["whiteBackgroundAngles"] += len(angles)
            if angles[0].get("angleId") != "front":
                errors.append({"kind": "front-white-base-required", "productId": product_id})
            for angle in angles:
                if angle.get("borderWhiteRatio", 0) <= 0.90 or angle.get("singleObjectConfidence", 0) < 0.80 or angle.get("maskConfidence", 0) < 0.70:
                    errors.append({"kind": "white-base-threshold", "productId": product_id, "angleId": angle.get("angleId")})
                for key in ("baseImage", "maskImage", "originalBaseImage"):
                    if not angle.get(key) or not (root / angle[key]).is_file():
                        errors.append({"kind": "missing-white-base-asset", "productId": product_id, "angleId": angle.get("angleId"), "path": angle.get(key)})
        else:
            counts["flaggedBaseProducts"] += 1
            if not product.get("previewBaseAttention"):
                errors.append({"kind": "flagged-base-without-attention", "productId": product_id})
        for angle in product.get("whiteBaseImages", []):
            original = root / angle.get("originalPath", "")
            if not original.is_file():
                errors.append({"kind": "missing-preserved-original", "productId": product_id, "path": angle.get("originalPath")})
            elif angle.get("storedSha256") and hashlib.sha256(original.read_bytes()).hexdigest() != angle["storedSha256"]:
                errors.append({"kind": "original-base-modified", "productId": product_id, "path": angle.get("originalPath")})
        ids = set()
        for fabric in product["fabricTypes"]:
            type_names.add((fabric["id"], fabric["name"]))
            if fabric.get("swatchSourceUrl") and not fabric.get("swatchPath"):
                errors.append({"kind": "published-type-image-not-downloaded", "productId": product_id, "fabricId": fabric["id"]})
            elif not fabric.get("swatchSourceUrl"):
                warnings.append({"kind": "type-image-not-published", "productId": product_id, "fabricId": fabric["id"]})
            for key in ("swatchPath", "swatchThumbPath"):
                if fabric.get(key) and not (root / fabric[key]).is_file():
                    errors.append({"kind": "missing-type-image", "productId": product_id, "path": fabric[key]})
            for colour in fabric["colours"]:
                counts["colours"] += 1
                combination = f"{fabric['id']}::{colour['id']}"
                if combination in ids:
                    errors.append({"kind": "duplicate-combination", "productId": product_id, "id": combination})
                ids.add(combination)
                if colour["name"].strip().lower() in GENERIC and not colour.get("current"):
                    errors.append({"kind": "generic-colour", "productId": product_id, "id": combination})
                if colour.get("hex") is not None and not re.fullmatch(r"#[0-9A-Fa-f]{6}", colour["hex"]):
                    errors.append({"kind": "invented-or-invalid-hex", "productId": product_id, "id": combination, "value": colour["hex"]})
                if colour.get("closeupSourceUrl") and not colour.get("closeupPath"):
                    errors.append({"kind": "published-closeup-not-downloaded", "productId": product_id, "id": combination, "url": colour["closeupSourceUrl"]})
                elif not colour.get("closeupSourceUrl"):
                    warnings.append({"kind": "closeup-not-published", "productId": product_id, "id": combination})
                for key in ("swatchPath", "closeupPath"):
                    if colour.get(key):
                        counts["localAssets"] += 1
                        if not (root / colour[key]).is_file():
                            errors.append({"kind": "missing-colour-image", "productId": product_id, "id": combination, "path": colour[key]})
                if colour.get("variantPath"):
                    counts["localAssets"] += 1
                    if not (root / colour["variantPath"]).is_file():
                        errors.append({"kind": "missing-variant", "productId": product_id, "id": combination, "path": colour["variantPath"]})
                if colour.get("current"):
                    counts["currentFabrics"] += 1
                    if angles:
                        if colour.get("variantPath") != angles[0].get("baseImage") or colour.get("variantKind") != "white-base" or colour.get("previewUnavailable"):
                            errors.append({"kind": "current-not-white-base", "productId": product_id, "id": combination})
                    elif colour.get("variantPath") or not colour.get("previewUnavailable"):
                        errors.append({"kind": "flagged-current-has-live-preview", "productId": product_id, "id": combination})
                elif colour.get("previewUnavailable"):
                    counts["previewUnavailable"] += 1
                    if colour.get("variantPath"):
                        errors.append({"kind": "flagged-variant-shipped", "productId": product_id, "id": combination})
                    if angles and colour.get("variantKind") != "unavailable":
                        errors.append({"kind": "flagged-colour-kind", "productId": product_id, "id": combination})
                elif not angles:
                    errors.append({"kind": "live-colour-without-white-base", "productId": product_id, "id": combination})
                elif colour.get("variantKind") != "white-mask" or colour.get("variantPath"):
                    errors.append({"kind": "named-colour-not-white-mask", "productId": product_id, "id": combination})
                else:
                    counts["whiteMaskVariants"] += 1
                    rgb = colour.get("renderRgb")
                    if not isinstance(rgb, list) or len(rgb) != 3 or any(not isinstance(value, (int, float)) or value < 0 or value > 255 for value in rgb):
                        errors.append({"kind": "missing-swatch-render-colour", "productId": product_id, "id": combination})
    counts["types"] = len(type_names)
    report = {"valid": not errors, "counts": counts, "errors": errors, "sourceOmissions": warnings}
    (root / "validation-report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
