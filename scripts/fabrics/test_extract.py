import unittest

from scripts.fabrics.extract import extract_product, slug_for, valid_hex


ROW = {
    "id": "1-example-sofa",
    "name": "Example Sofa",
    "slug": "example-sofa",
    "sourceUrl": "https://example.invalid/api",
    "productPageUrl": "https://example.invalid/product",
}


def colour(identifier, name, price_value, stock=4, variant=None, info_id=None):
    return {
        "id": identifier,
        "name": name,
        "hex": "#A0B0C0" if name != "Selectable" else "#12235",
        "sku": f"sku-{identifier}",
        "stock_status": {"status": "in_stock" if stock else "out_of_stock", "stock_count": stock},
        "region_prices": {"total_price": price_value, "total_base_price": price_value + 100},
        "variant_image": variant,
        "fabric_color_info": {
            "id": info_id or identifier,
            "color_name": name,
            "fabric_color_image": f"https://img.invalid/{identifier}.jpg",
            "fabric_image": "https://img.invalid/type.jpg",
        },
    }


def payload(fabrics):
    return {"data": {
        "primary_images": {"responsive_images": {"web": {"url": "https://img.invalid/original.webp"}}, "fabric_color_info": {"id": 1}},
        "variants": [{"name": "Three Seater", "fabricsList": fabrics}],
    }}


class ExtractTests(unittest.TestCase):
    def test_current_fabric_survives_in_separate_type_and_price_is_per_size(self):
        product, _ = extract_product(ROW, payload([
            {"name": "Fabric Current", "colorsList": [colour(1, "Selectable", 1000)]},
            {"name": "VELVET", "colorsList": [colour(2, "REAL BLUE", 1100)]},
        ]))
        self.assertTrue(product["hasOptions"])
        self.assertEqual([f["name"] for f in product["fabricTypes"]], ["Fabric Current", "VELVET"])
        current = product["fabricTypes"][0]["colours"][0]
        named = product["fabricTypes"][1]["colours"][0]
        self.assertEqual(current["name"], "Current Fabric")
        self.assertIsNone(current["hex"])
        self.assertEqual(named["priceDelta"], 100)
        self.assertEqual(named["sizeVariants"][0]["priceDelta"], 100)

    def test_generic_only_product_is_not_an_option_product(self):
        product, _ = extract_product(ROW, payload([
            {"name": "Fabric", "colorsList": [colour(1, "Selectable", 1000)]},
        ]))
        self.assertFalse(product["hasOptions"])
        self.assertEqual(product["fabricTypes"], [])

    def test_repeated_variant_gallery_is_not_claimed_as_colour_photography(self):
        product, _ = extract_product(ROW, payload([
            {"name": "Fabric Current", "colorsList": [colour(1, "Selectable", 1000)]},
            {"name": "VELVET", "colorsList": [
                colour(2, "REAL BLUE", 1000, variant="https://img.invalid/gallery.webp"),
                colour(3, "REAL WHITE", 1000, variant="https://img.invalid/gallery.webp"),
            ]},
        ]))
        named = product["fabricTypes"][1]["colours"]
        self.assertEqual([c["variantSourceUrl"] for c in named], [None, None])

    def test_availability_and_invalid_hex_are_not_invented(self):
        product, _ = extract_product(ROW, payload([
            {"name": "Fabric Current", "colorsList": [colour(1, "Selectable", 1000)]},
            {"name": "SUEDE", "colorsList": [colour(2, "REAL WHITE", 1000, stock=0)]},
        ]))
        named = product["fabricTypes"][1]["colours"][0]
        self.assertFalse(named["available"])
        self.assertIsNone(valid_hex("#12235"))
        self.assertEqual(valid_hex("#a0b0c0"), "#A0B0C0")

    def test_current_direct_primary_image_shape_is_supported(self):
        data = payload([{"name": "VELVET", "colorsList": [colour(2, "REAL BLUE", 1000)]}])
        data["data"]["primary_images"] = {"web": {"url": "https://img.invalid/direct-original.webp", "width": 1080}}
        product, _ = extract_product(ROW, data)
        self.assertEqual(product["baseImageSourceUrl"], "https://img.invalid/direct-original.webp")

    def test_catalogue_id_prefix_is_not_part_of_live_slug(self):
        self.assertEqual(slug_for("7072-serafina-corner-sofa"), "serafina-corner-sofa")


if __name__ == "__main__":
    unittest.main()
