import unittest

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


if __name__ == "__main__":
    unittest.main()
