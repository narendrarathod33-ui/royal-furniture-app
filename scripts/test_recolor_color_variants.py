import json
import os
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from scripts.recolor_color_variants import (
    process_jobs,
    recolor_cie_lab,
    refine_upholstery_mask,
    resolve_hex_color,
    target_label_ids,
)


class RecolorColorVariantsTests(unittest.TestCase):
    def test_target_label_ids_selects_only_category_furniture(self) -> None:
        id2label = {
            0: "wall",
            3: "floor, flooring",
            7: "bed",
            15: "table",
            23: "sofa, couch, lounge",
            28: "rug, carpet, carpeting",
            30: "armchair",
        }
        sofa_ids = target_label_ids(id2label, "sofas")
        self.assertEqual(sofa_ids, {23, 30})
        bed_ids = target_label_ids(id2label, "bedroom")
        self.assertEqual(bed_ids, {7})

    def test_resolve_hex_color_handles_explicit_and_named_fallbacks(self) -> None:
        self.assertEqual(resolve_hex_color("#1b365d"), "#1B365D")
        self.assertEqual(resolve_hex_color("", "Royal Navy Blue"), "#1E3557")
        self.assertEqual(resolve_hex_color(None, "Unknown Finish"), "#C8BFA8")

    def test_refine_upholstery_mask_and_recolor_protects_dark_legs_and_background(self) -> None:
        # Synthetic studio room: beige wall/floor background, cream sofa in center, dark wood legs
        img = np.full((240, 240, 3), (232, 224, 212), dtype=np.uint8)
        # Cream sofa body
        img[90:180, 40:200] = (224, 214, 198)
        # Subtle fold shading on sofa
        img[125:132, 45:195] = (198, 188, 174)
        # Dark walnut legs
        img[180:205, 50:65] = (45, 30, 22)
        img[180:205, 175:190] = (45, 30, 22)

        coarse = np.zeros((240, 240), dtype=np.float32)
        coarse[88:205, 38:202] = 1.0

        alpha = refine_upholstery_mask(img, coarse, category="sofas")
        self.assertGreater(float(alpha[110:170, 60:180].mean()), 0.85)
        self.assertLess(float(alpha[185:200, 52:63].mean()), 0.25)
        self.assertLess(float(alpha[10:70, 10:230].max()), 0.05)

        navy = recolor_cie_lab(img, alpha, "#1B365D", fabric="velvet")
        # Sofa center became decidedly blue (B > R)
        center = navy[115, 120]
        self.assertGreater(int(center[2]), int(center[0]) + 25)
        # Wall pixel stayed unchanged
        np.testing.assert_array_equal(navy[20, 20], img[20, 20])
        # Leg stayed dark brown (B not higher than R)
        leg = navy[192, 57]
        self.assertLess(int(leg[2]), int(leg[0]) + 5)

    def test_process_jobs_writes_webp_and_caches_masks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src_path = root / "sofa.png"
            out_path = root / "out" / "velvet--navy.webp"
            mask_dir = root / "masks"

            img = np.full((256, 256, 3), (242, 238, 232), dtype=np.uint8)
            img[80:190, 40:216] = (218, 208, 192)
            Image.fromarray(img).save(src_path)

            res = process_jobs(
                [
                    {
                        "id": "job-1",
                        "sourcePath": str(src_path),
                        "outputPath": str(out_path),
                        "hex": "#1B365D",
                        "fabric": "velvet",
                        "category": "sofas",
                        "outputFormat": "webp",
                    }
                ],
                mask_mode="grabcut",
                mask_cache_dir=str(mask_dir),
            )
            self.assertEqual(len(res), 1)
            self.assertTrue(res[0]["ok"])
            self.assertTrue(out_path.is_file())
            self.assertGreater(res[0]["bytes"], 100)
            self.assertTrue(any(mask_dir.glob("*.png")))


if __name__ == "__main__":
    unittest.main()
