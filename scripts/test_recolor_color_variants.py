import json
import os
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from scripts.recolor_color_variants import (
    analyse_white_background,
    extract_coarse_mask,
    hex_to_cie_lab,
    process_jobs,
    recolor_cie_lab,
    refine_upholstery_mask,
    resolve_hex_color,
    srgb_to_cie_lab,
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

    def test_analyse_white_background_accepts_studio_and_rejects_scene_and_diagram(self) -> None:
        # 1. Clean white studio furniture photo -> accepted
        studio = np.full((240, 240, 3), 255, dtype=np.uint8)
        studio[70:180, 40:200] = (182, 174, 162)
        studio[180:195, 50:62] = (42, 30, 22)
        res_studio = analyse_white_background(studio)
        self.assertTrue(res_studio["whiteBackground"], res_studio)

        # 2. Lifestyle room scene (colored walls/floor) -> rejected
        scene = np.full((240, 240, 3), (218, 206, 188), dtype=np.uint8)
        scene[150:, :] = (165, 138, 108)
        scene[80:180, 50:190] = (120, 125, 130)
        res_scene = analyse_white_background(scene)
        self.assertFalse(res_scene["whiteBackground"])
        self.assertIn("border-not-over-90-percent-near-white", res_scene["reasons"])

        # 3. Sparse dimension diagram on white background -> rejected
        diagram = np.full((240, 240, 3), 255, dtype=np.uint8)
        diagram[50:200, 30:32] = (40, 40, 40)
        diagram[50:52, 30:210] = (40, 40, 40)
        diagram[198:200, 30:210] = (40, 40, 40)
        diagram[50:200, 208:210] = (40, 40, 40)
        res_diag = analyse_white_background(diagram)
        self.assertFalse(res_diag["whiteBackground"])

    def test_exact_hex_accuracy_and_pure_white_background_on_studio_sofa(self) -> None:
        img = np.full((240, 240, 3), 255, dtype=np.uint8)
        img[70:175, 36:204] = (206, 198, 186)
        img[122:130, 42:198] = (176, 168, 156)
        img[175:195, 48:62] = (42, 28, 20)

        coarse, bg_ext = extract_coarse_mask(img, category="sofas", mask_mode="white-bg")
        self.assertIsNotNone(bg_ext)
        alpha = refine_upholstery_mask(img, coarse, category="sofas")

        for target_hex in ("#1B365D", "#DDE6E3", "#F5F1E8", "#B66047"):
            out = recolor_cie_lab(img, alpha, target_hex, fabric="velvet", clean_white_mask=bg_ext)
            interior = alpha > 0.80
            rendered_med = np.median(out[interior], axis=0).astype(np.float64) / 255.0
            rendered_lab = srgb_to_cie_lab(rendered_med.reshape(1, 1, 3))[0, 0]
            target_lab = hex_to_cie_lab(target_hex)
            delta_e = float(np.linalg.norm(rendered_lab - target_lab))
            self.assertLessEqual(delta_e, 2.0, f"{target_hex} drifted: deltaE={delta_e:.2f}")
            np.testing.assert_array_equal(out[5, 5], np.array([255, 255, 255], dtype=np.uint8))
            self.assertLess(int(out[185, 55, 2]), int(out[185, 55, 0]) + 5)

    def test_process_jobs_white_background_only_skips_room_scenes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scene_path = root / "scene.png"
            out_path = root / "out" / "navy.webp"
            scene = np.full((180, 180, 3), (210, 198, 182), dtype=np.uint8)
            scene[60:140, 30:150] = (140, 145, 150)
            Image.fromarray(scene).save(scene_path)

            res = process_jobs(
                [
                    {
                        "id": "scene-1",
                        "sourcePath": str(scene_path),
                        "outputPath": str(out_path),
                        "hex": "#1B365D",
                        "category": "sofas",
                    }
                ],
                mask_mode="grabcut",
                white_background_only=True,
            )
            self.assertFalse(res[0]["ok"])
            self.assertTrue(res[0].get("skippedNonWhite"))
            self.assertFalse(out_path.exists())


if __name__ == "__main__":
    unittest.main()
