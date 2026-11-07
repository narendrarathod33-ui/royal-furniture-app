import unittest

import numpy as np
from PIL import Image

import scripts.fabrics.render as render


class MaskedRenderTests(unittest.TestCase):
    def test_reviewed_masks_preserve_complete_background_and_protected_regions(self):
        rng = np.random.default_rng(4)
        closeup = np.clip(rng.normal(0, 2, (128, 128, 3)) + np.array([120, 110, 100]), 0, 255).astype("uint8")
        for product_id, config in render.MASKS.items():
            with self.subTest(product=product_id):
                render.current_product_id = product_id
                base = render.load(render.ROOT / config["base"])
                mask = Image.open(render.ROOT / config["mask"]).convert("RGBA")
                result, metrics = render.masked_render(base, mask, Image.fromarray(closeup))
                self.assertEqual(result.size, (1200, 1200))
                self.assertEqual(metrics["unmaskedMean"], 0)
                self.assertEqual(metrics["maskLeakRatio"], 0)
                self.assertLess(metrics["deltaE76"], 1)
                self.assertEqual(metrics["flags"], [])
                self.assertTrue(all(region["maskMax"] == 0 for region in metrics["protected"].values()))


if __name__ == "__main__":
    unittest.main()
