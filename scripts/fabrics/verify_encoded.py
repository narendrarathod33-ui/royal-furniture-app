#!/usr/bin/env python3
"""Verify the actual compressed WebP files installed for masked variants."""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
from PIL import Image

from scripts.fabrics.render import MASKS, delta_e, load, median_colour, rect_pixels


def main() -> int:
    manifest = json.loads((ROOT / "app/data/fabricManifest.json").read_text())
    rows = []
    for product_id, config in MASKS.items():
        product = manifest["products"].get(product_id)
        if not product:
            continue
        base_original = load(ROOT / config["base"])
        mask_original = Image.open(ROOT / config["mask"]).convert("RGBA")
        for fabric in product["fabricTypes"]:
            for colour in fabric["colours"]:
                if colour.get("variantKind") != "rendered" or not colour.get("variantPath"):
                    continue
                variant = load(ROOT / colour["variantPath"])
                width, height = variant.size
                base = base_original.resize((width, height), Image.Resampling.LANCZOS)
                alpha_image = mask_original.getchannel("A").resize((width, height), Image.Resampling.LANCZOS)
                protected_alpha = np.asarray(alpha_image).copy()
                for region in config["protected"].values():
                    ys, xs = rect_pixels(region, width, height)
                    protected_alpha[ys, xs] = 0
                alpha_image = Image.fromarray(protected_alpha, "L")
                source = np.asarray(base, dtype=np.float32)
                changed = np.asarray(variant, dtype=np.float32)
                alpha = np.asarray(alpha_image)
                difference = np.abs(changed - source).mean(axis=2)
                unmasked = alpha == 0
                inside = alpha > 242
                closeup = load(ROOT / colour["closeupPath"])
                target = median_colour(closeup)
                rendered_median = np.median(changed[inside], axis=0)
                protected = {}
                flags = []
                for name, region in config["protected"].items():
                    ys, xs = rect_pixels(region, width, height)
                    metric = {"maskMax": int(alpha[ys, xs].max()), "mean": float(difference[ys, xs].mean()), "over12": float((difference[ys, xs] > 12).mean())}
                    protected[name] = metric
                    if metric["maskMax"] or metric["mean"] >= 4 or metric["over12"] >= 0.02:
                        flags.append(f"protected:{name}")
                unmasked_mean = float(difference[unmasked].mean())
                leak_ratio = float((difference[unmasked] > 12).mean())
                if unmasked_mean >= 4 or leak_ratio >= 0.02:
                    flags.append("mask-leak")
                colour_difference = delta_e(rendered_median, target)
                if colour_difference > 25:
                    flags.append("colour-difference")
                base_blown = (source > 250).all(axis=2) & inside
                changed_blown = (changed > 250).all(axis=2) & inside
                highlight_increase = float((changed_blown.sum() - base_blown.sum()) / inside.sum())
                if highlight_increase > 0.04:
                    flags.append("blown-highlights")
                rows.append({
                    "productId": product_id, "fabricId": fabric["id"], "colourId": colour["id"], "name": colour["name"],
                    "variantPath": colour["variantPath"], "size": [width, height], "deltaE76": colour_difference,
                    "unmaskedMean": unmasked_mean, "maskLeakRatio": leak_ratio, "highlightIncrease": highlight_increase,
                    "protected": protected, "flags": flags,
                })
    report = {"valid": all(not row["flags"] for row in rows), "checkedEncodedVariants": len(rows), "thresholds": {"deltaE76Max": 25, "unmaskedMeanMax": 4, "maskLeakRatioMax": 0.02, "highlightIncreaseMax": 0.04}, "variants": rows}
    destination = ROOT / "docs/fabric-qa/encoded-quality-report.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"valid": report["valid"], "checkedEncodedVariants": len(rows), "flagged": [row["variantPath"] for row in rows if row["flags"]]}, indent=2))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
