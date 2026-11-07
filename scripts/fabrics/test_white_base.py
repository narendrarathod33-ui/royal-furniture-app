import unittest

import numpy as np
from PIL import Image, ImageDraw

from scripts.fabrics.white_base import analyse_candidate, build_upholstery_mask, clean_white_base


def product_image(two_objects: bool = False) -> Image.Image:
    image = Image.new("RGB", (400, 400), "white")
    draw = ImageDraw.Draw(image)
    # Soft neutral contact shadow, one contrasting pillow and two dark legs.
    draw.ellipse((65, 292, 335, 326), fill=(239, 239, 239))
    draw.rounded_rectangle((75, 105, 325, 280), radius=24, fill=(181, 157, 125))
    draw.rectangle((92, 275, 112, 312), fill=(45, 42, 39))
    draw.rectangle((288, 275, 308, 312), fill=(45, 42, 39))
    draw.rounded_rectangle((220, 130, 290, 200), radius=12, fill=(145, 35, 45))
    if two_objects:
        draw.rectangle((350, 120, 390, 290), fill=(80, 80, 80))
    return image


class WhiteBaseTests(unittest.TestCase):
    def test_white_product_is_accepted_but_lifestyle_and_multiple_objects_are_flagged(self):
        accepted = analyse_candidate(product_image())
        self.assertTrue(accepted["whiteBackground"], accepted)
        self.assertGreater(accepted["borderWhiteRatio"], 0.90)
        lifestyle = product_image()
        draw = ImageDraw.Draw(lifestyle)
        draw.rectangle((0, 0, 400, 30), fill=(190, 180, 170))
        self.assertFalse(analyse_candidate(lifestyle)["whiteBackground"])
        self.assertFalse(analyse_candidate(product_image(two_objects=True))["whiteBackground"])

    def test_mask_excludes_background_shadow_legs_and_contrasting_pillow(self):
        base = product_image()
        closeup = Image.new("RGB", (64, 64), (181, 157, 125))
        result = build_upholstery_mask(base, closeup)
        self.assertTrue(result["accepted"], result)
        mask = np.asarray(result["upholsteryMask"])
        shadow = np.asarray(result["shadowMask"])
        self.assertGreater(mask[190, 150], 250)
        self.assertEqual(mask[160, 255], 0)  # contrasting red pillow
        self.assertEqual(mask[300, 100], 0)  # dark wooden leg
        self.assertEqual(mask[30, 30], 0)    # white background
        self.assertEqual(mask[315, 200], 0)  # soft contact shadow
        self.assertGreater(shadow[307, 200], 0)
        self.assertGreaterEqual(result["maskConfidence"], 0.70)

    def test_clean_base_preserves_shadow_and_makes_background_pure_white(self):
        base = product_image()
        result = build_upholstery_mask(base, Image.new("RGB", (64, 64), (181, 157, 125)))
        clean = clean_white_base(base, result["subjectMask"])
        pixels = np.asarray(clean)
        self.assertEqual(pixels[20, 20].tolist(), [255, 255, 255])
        self.assertEqual(pixels[307, 200].tolist(), [239, 239, 239])
        # The original source remains separate and unchanged by this operation.
        self.assertEqual(base.getpixel((20, 20)), (255, 255, 255))


if __name__ == "__main__":
    unittest.main()
