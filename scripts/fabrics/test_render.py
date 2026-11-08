import hashlib
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

import scripts.fabrics.render as render
from scripts.fabrics.test_white_base import product_image
from scripts.fabrics.white_base import build_upholstery_mask, clean_white_base


class WhiteMaskedRenderTests(unittest.TestCase):
    def test_white_render_preserves_background_shadow_and_non_upholstery(self):
        base = product_image()
        closeup = Image.new("RGB", (128, 128), (181, 157, 125))
        prepared = build_upholstery_mask(base, closeup)
        self.assertTrue(prepared["accepted"], prepared)
        clean = clean_white_base(base, prepared["subjectMask"])
        result, metrics = render.white_masked_render(clean, prepared["upholsteryMask"], closeup, prepared["subjectMask"], prepared["shadowMask"])
        self.assertEqual(result.size, (1200, 1200))
        self.assertEqual(metrics["unmaskedMean"], 0)
        self.assertEqual(metrics["maskLeakRatio"], 0)
        self.assertTrue(metrics["backgroundPureWhite"])
        self.assertEqual(metrics["contactShadow"]["maskMax"], 0)
        self.assertEqual(metrics["contactShadow"]["mean"], 0)
        self.assertLess(metrics["deltaE76"], 1)
        self.assertEqual(metrics["flags"], [])
        pixels = np.asarray(result)
        self.assertEqual(pixels[20, 20].tolist(), [255, 255, 255])
        # Original lifestyle-like regions are impossible here: every non-product
        # background pixel is pure white, not a fallback lifestyle photograph.

    def test_checkpoint_resume_refreshes_only_lossless_current_base(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            original = output / "assets/base/example.jpg"
            original.parent.mkdir(parents=True)
            product_image().save(original, "JPEG", quality=100, subsampling=0)
            closeup_path = output / "assets/fabrics/current.webp"
            closeup_path.parent.mkdir(parents=True)
            closeup = Image.new("RGB", (128, 128), (181, 157, 125))
            closeup.save(closeup_path, "WEBP", lossless=True)
            base = render.load(original)
            prepared = build_upholstery_mask(base, closeup)
            self.assertTrue(prepared["accepted"])
            mask_path = output / "assets/masks/example.png"
            mask_path.parent.mkdir(parents=True)
            render.rgba_mask(prepared["upholsteryMask"]).save(mask_path)
            current_path = output / "assets/variants/example/current.webp"
            current_path.parent.mkdir(parents=True)
            current_path.write_bytes(b"old lossy placeholder")
            product = {
                "id": "example", "previewAngles": [{"angleId": "front", "originalBaseImage": "assets/base/example.jpg", "baseImage": "assets/variants/example/current.webp", "maskImage": "assets/masks/example.png"}],
                "whiteBaseImages": [{"angleId": "front", "storedSha256": hashlib.sha256(original.read_bytes()).hexdigest()}],
                "fabricTypes": [{"colours": [{"current": True, "closeupPath": "assets/fabrics/current.webp"}]}],
            }
            original_hash = original.read_bytes()
            render.refresh_current_bases([product], output)
            clean = clean_white_base(base, prepared["subjectMask"])
            expected, _ = render.pure_white_at_1200(clean, prepared["subjectMask"])
            self.assertTrue(np.array_equal(np.asarray(render.load(current_path)), np.asarray(expected)))
            self.assertEqual(original.read_bytes(), original_hash)
            self.assertEqual(product["previewAngles"][0]["baseImage"], "assets/variants/example/current.webp")

    def test_browser_png_encoding_is_pixel_lossless(self):
        from scripts.fabrics.verify_encoded import compressed

        source = product_image()
        encoded = compressed(source)
        self.assertEqual(encoded.size, source.size)
        self.assertTrue(np.array_equal(np.asarray(source), np.asarray(encoded)))


if __name__ == "__main__":
    unittest.main()
