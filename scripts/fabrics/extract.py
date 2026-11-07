#!/usr/bin/env python3
"""Extract Royal Furniture's real variant fabrics/colours and original imagery.

The extractor is deliberately sequential and rate-limited. Raw API responses and
existing image files are reused on subsequent runs. No colour, image, price or
availability is inferred: missing values remain null and failures are reported.

Usage:
  python3 scripts/fabrics/extract.py
  python3 scripts/fabrics/extract.py --product-id 7072-serafina-corner-sofa
  python3 scripts/fabrics/extract.py --delay 0.35 --output /tmp/fabric-output
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import time
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
API = "https://rylqus.ae/api/products/product-detail/{slug}/?format=json"
PAGE = "https://www.royalfurniture.ae/ae/en/{category}/{subcategory}/{slug}/"
CACHE = ROOT / ".cache" / "fabric-harvest"
USER_AGENT = "RoyalFurnitureInternalDemoFabricHarvest/1.0 (sequential cached catalogue refresh)"
GENERIC_COLOURS = {"selectable", "select", "default", "current fabric"}
CURRENT_FABRIC_NAMES = {"fabric", "current fabric", "fabric current"}


def load_catalog() -> list[dict[str, Any]]:
    source = (ROOT / "app/data/catalogData.ts").read_text()
    literal = source[source.index("=") + 1 :].strip()
    literal = re.sub(r"\s+as const;?\s*$", "", literal)
    literal = re.sub(r"^\s*//[^\n]*$", "", literal, flags=re.M)
    return json.loads(literal)


def slug_for(product_id: str) -> str:
    return re.sub(r"^\d+-", "", product_id.split("::size=")[0])


def stable_id(value: str) -> str:
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "unknown"


def valid_hex(value: Any) -> str | None:
    return value.upper() if isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value) else None


def image_url(node: Any) -> str | None:
    if not isinstance(node, dict):
        return None
    responsive = node.get("responsive_images") or node.get("images")
    if isinstance(responsive, dict):
        # Web/iPad originals are larger than mobile; never manufacture a resize URL.
        for key in ("web", "ipad", "mobile"):
            item = responsive.get(key)
            if isinstance(item, dict) and isinstance(item.get("url"), str):
                return item["url"]
    for key in ("url", "image", "variant_image"):
        if isinstance(node.get(key), str) and node[key].startswith("http"):
            return node[key]
    return None


def number(node: Any, keys: tuple[str, ...]) -> float | int | None:
    if not isinstance(node, dict):
        return None
    for key in keys:
        value = node.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return value
        if isinstance(value, str):
            try:
                parsed = float(value)
                return int(parsed) if parsed.is_integer() else parsed
            except ValueError:
                pass
    return None


def price(color: dict[str, Any]) -> tuple[float | int | None, float | int | None]:
    regions = color.get("region_prices") or color.get("regional_prices") or {}
    if not isinstance(regions, dict):
        regions = {}
    scoped = regions.get("ae") or regions.get("AE") or regions.get("default") or regions
    if not isinstance(scoped, dict):
        scoped = {}
    current = number(scoped, ("total_price", "offer_price", "sale_price", "variant_price", "price"))
    if current is None:
        current = number(color, ("total_price", "offer_price", "sale_price", "variant_price", "price"))
    base = number(scoped, ("total_base_price", "base_price", "list_price", "regular_price"))
    if base is None:
        base = number(color, ("total_base_price", "base_price", "list_price", "regular_price"))
    return current, base


def availability(color: dict[str, Any]) -> bool | None:
    status = color.get("stock_status")
    if isinstance(status, dict):
        text = str(status.get("status") or "").lower()
        count = number(status, ("stock_count",))
        if text in {"in_stock", "instock", "available"}:
            return count != 0
        if text in {"out_of_stock", "outofstock", "unavailable"}:
            return False
    if isinstance(color.get("stock"), (int, float)):
        return color["stock"] > 0
    return None


def build_mapping(catalog: list[dict[str, Any]]) -> dict[str, Any]:
    harvest_path = ROOT / "harvest/product-details.json"
    harvest = json.loads(harvest_path.read_text()) if harvest_path.exists() else {"details": {}}
    known = set((harvest.get("details") or {}).keys())
    products = []
    unmatched = []
    for product in catalog:
        slug = slug_for(product["id"])
        candidates = [slug, re.sub(r"-[0-9a-f]{6}$", "", slug)]
        matched = next((candidate for candidate in candidates if candidate in known), None)
        row = {
            "id": product["id"],
            "name": product["n"],
            "slug": matched or slug,
            "category": product.get("c"),
            "subcategory": product.get("sc"),
            "sourceUrl": API.format(slug=quote(matched or slug)),
            "productPageUrl": PAGE.format(category=quote(product.get("c") or ""), subcategory=quote(product.get("sc") or ""), slug=quote(matched or slug)),
            "match": "saved-official-slug" if matched else "unmatched-saved-slug",
        }
        products.append(row)
        if not matched:
            unmatched.append({"id": product["id"], "name": product["n"], "attemptedSlug": slug, "sourceUrl": row["sourceUrl"]})
    mapped = {row["slug"] for row in products if row["match"] == "saved-official-slug"}
    return {
        "products": products,
        "unmatched": unmatched,
        "officialSlugsNotInApp": sorted(known - mapped),
        "counts": {"appProducts": len(products), "savedMatches": len(products) - len(unmatched), "savedUnmatched": len(unmatched)},
    }


class Harvester:
    def __init__(self, output: Path, delay: float, refresh: bool):
        self.output = output
        self.delay = delay
        self.refresh = refresh
        self.raw_cache = CACHE / "api"
        self.raw_cache.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json", "locale": "en", "country": "ae"})
        self.last_request = 0.0
        self.downloads = 0
        self.reused = 0
        self.errors: list[dict[str, Any]] = []
        self.assets: dict[str, dict[str, str]] = {}

    def wait(self) -> None:
        remaining = self.delay - (time.monotonic() - self.last_request)
        if remaining > 0:
            time.sleep(remaining)

    def get(self, url: str) -> requests.Response:
        self.wait()
        try:
            response = self.session.get(url, timeout=(15, 60))
            self.last_request = time.monotonic()
        except requests.RequestException as error:
            self.last_request = time.monotonic()
            raise RuntimeError(f"Network request failed: {error}") from error
        if response.status_code in (401, 403):
            raise PermissionError(f"Access blocked ({response.status_code}) for {url}; stopping as requested")
        return response

    def api(self, slug: str) -> dict[str, Any]:
        path = self.raw_cache / f"{slug}.json"
        if path.exists() and not self.refresh:
            self.reused += 1
            return json.loads(path.read_text())
        url = API.format(slug=quote(slug))
        error: Exception | None = None
        for attempt in range(4):
            try:
                response = self.get(url)
                if response.status_code == 404:
                    raise FileNotFoundError(slug)
                if response.status_code == 429 or response.status_code >= 500:
                    raise RuntimeError(f"Temporary HTTP {response.status_code}")
                response.raise_for_status()
                payload = response.json()
                path.write_text(json.dumps(payload, ensure_ascii=False))
                return payload
            except FileNotFoundError:
                raise
            except PermissionError:
                raise
            except Exception as caught:  # retries are reported if all fail
                error = caught
                time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"Could not retrieve {slug}: {error}")

    def download(self, url: str | None, destination: Path, thumb: bool = True) -> dict[str, str] | None:
        if not url:
            return None
        if url in self.assets:
            return self.assets[url]
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                content = destination.read_bytes()
                self.reused += 1
            else:
                response = self.get(url)
                response.raise_for_status()
                content = response.content
                # Decode before saving so an HTML error page can never become an image.
                with Image.open(io.BytesIO(content)) as source:
                    source = ImageOps.exif_transpose(source).convert("RGB")
                    source.save(destination, "WEBP", quality=94, method=6)
                self.downloads += 1
            with Image.open(destination) as image:
                width, height = image.size
                if thumb:
                    thumbnail = destination.with_name(f"{destination.stem}-thumb.webp")
                    if not thumbnail.exists():
                        copy = image.copy()
                        copy.thumbnail((192, 192), Image.Resampling.LANCZOS)
                        copy.save(thumbnail, "WEBP", quality=84, method=6)
            result = {
                "path": destination.relative_to(self.output).as_posix(),
                "thumbPath": destination.with_name(f"{destination.stem}-thumb.webp").relative_to(self.output).as_posix() if thumb else destination.relative_to(self.output).as_posix(),
                "sourceUrl": url,
                "width": width,
                "height": height,
                "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
            }
            self.assets[url] = result
            return result
        except PermissionError:
            raise
        except Exception as error:
            self.errors.append({"kind": "image", "url": url, "error": str(error)})
            return None


def colour_asset_id(colour: dict[str, Any]) -> str:
    if not colour.get("current"):
        return colour["id"]
    official_id = colour.get("fabricColorId")
    if official_id is not None:
        return f"current-fc-{official_id}"
    digest = hashlib.sha256(str(colour.get("closeupSourceUrl") or "missing").encode()).hexdigest()[:12]
    return f"current-{digest}"


def extract_product(row: dict[str, Any], payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    data = payload.get("data") or payload
    primary = data.get("primary_images") or {}
    primary_info = primary.get("fabric_color_info") or {}
    current_variant_url = None
    types: OrderedDict[str, dict[str, Any]] = OrderedDict()
    for size in data.get("variants") or []:
        size_name = str(size.get("name") or "")
        for fabric in size.get("fabricsList") or []:
            fabric_name = str(fabric.get("name") or "").strip()
            if not fabric_name:
                continue
            type_id = stable_id(fabric_name)
            key = type_id
            type_row = types.setdefault(key, {
                "id": type_id,
                "name": fabric_name,
                "swatchSourceUrl": fabric.get("image"),
                "colours": OrderedDict(),
            })
            if not type_row.get("swatchSourceUrl") and fabric.get("image"):
                type_row["swatchSourceUrl"] = fabric["image"]
            for color in fabric.get("colorsList") or []:
                info = color.get("fabric_color_info") or {}
                colour_name = str(info.get("color_name") or color.get("name") or "").strip()
                if not colour_name:
                    continue
                generic = colour_name.strip().lower() in GENERIC_COLOURS
                current = generic and (fabric_name.strip().lower() in CURRENT_FABRIC_NAMES or info.get("id") == primary_info.get("id"))
                if generic and not current:
                    continue
                official_id = info.get("id") or color.get("id") or color.get("variant_id")
                colour_id = "current" if current else f"fc-{official_id}" if official_id is not None else stable_id(colour_name)
                current_price, list_price = price(color)
                available = availability(color)
                variant_url = color.get("variant_image") if isinstance(color.get("variant_image"), str) else None
                if current:
                    current_variant_url = variant_url or current_variant_url
                entry = type_row["colours"].get(colour_id)
                if not entry:
                    entry = {
                        "id": colour_id,
                        "name": "Current Fabric" if current else colour_name,
                        "officialName": colour_name,
                        "code": color.get("hex") or info.get("color_hex"),
                        "hex": valid_hex(color.get("hex") or info.get("color_hex")),
                        "fabricColorId": info.get("id"),
                        "closeupSourceUrl": info.get("fabric_color_image"),
                        "variantSourceUrl": variant_url,
                        "current": current,
                        "sizeVariants": [],
                    }
                    type_row["colours"][colour_id] = entry
                if not entry.get("closeupSourceUrl") and info.get("fabric_color_image"):
                    entry["closeupSourceUrl"] = info["fabric_color_image"]
                if not entry.get("variantSourceUrl") and variant_url:
                    entry["variantSourceUrl"] = variant_url
                if not type_row.get("swatchSourceUrl") and info.get("fabric_image"):
                    type_row["swatchSourceUrl"] = info["fabric_image"]
                entry["sizeVariants"].append({
                    "size": size_name,
                    "sku": color.get("sku"),
                    "available": available,
                    "stock": number(color.get("stock_status") or {}, ("stock_count",)) if isinstance(color.get("stock_status"), dict) else color.get("stock"),
                    "price": current_price,
                    "listPrice": list_price,
                })
    output_types = []
    all_colours = [colour for type_row in types.values() for colour in type_row["colours"].values()]
    has_named_options = any(not colour["current"] for colour in all_colours)
    baseline: dict[str, dict[str, Any]] = {}
    for colour in all_colours:
        if colour["current"]:
            for item in colour["sizeVariants"]:
                baseline[item["size"]] = item
    for type_row in types.values():
        colours = list(type_row.pop("colours").values())
        # Include Current Fabric only when some type has genuine named options.
        if not has_named_options or not colours:
            continue
        for colour in colours:
            variants = colour["sizeVariants"]
            available_values = [item["available"] for item in variants]
            colour["available"] = True if any(value is True for value in available_values) else False if available_values and all(value is False for value in available_values) else None
            deltas = []
            for item in variants:
                base = baseline.get(item["size"])
                delta = None
                if base and base.get("price") is not None and item.get("price") is not None:
                    delta = round(item["price"] - base["price"], 2)
                    deltas.append(delta)
                item["priceDelta"] = delta
            colour["priceDelta"] = deltas[0] if deltas and all(value == deltas[0] for value in deltas) and len(deltas) == len(variants) else None
            if colour["current"]:
                colour["variantSourceUrl"] = None
        type_row["colours"] = colours
        output_types.append(type_row)
    # A repeated/generic gallery URL is not evidence of colour-specific photography.
    variant_uses: dict[str, int] = {}
    for colour in all_colours:
        url = colour.get("variantSourceUrl")
        if url and not colour["current"]:
            variant_uses[url] = variant_uses.get(url, 0) + 1
    for colour in all_colours:
        url = colour.get("variantSourceUrl")
        if url and (variant_uses.get(url, 0) > 1 or url == current_variant_url):
            colour["variantSourceUrl"] = None
    primary_url = image_url(primary)
    for colour in all_colours:
        if colour.get("variantSourceUrl") == primary_url:
            colour["variantSourceUrl"] = None
    product = {
        "id": row["id"],
        "name": row["name"],
        "slug": row["slug"],
        "sourceUrl": row["sourceUrl"],
        "productPageUrl": row["productPageUrl"],
        "baseImageSourceUrl": primary_url,
        "hasOptions": bool(output_types),
        "fabricTypes": output_types,
    }
    assets = {"currentVariantUrl": current_variant_url}
    return product, assets


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--product-id", action="append", help="Limit to a catalogue id; repeatable")
    parser.add_argument("--delay", type=float, default=0.25, help="Minimum seconds between network requests")
    parser.add_argument("--output", type=Path, default=ROOT / "fabric-output")
    parser.add_argument("--refresh", action="store_true", help="Ignore cached raw API responses")
    args = parser.parse_args()
    if args.delay < 0.1:
        parser.error("--delay must be at least 0.1 seconds")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    catalog = load_catalog()
    mapping = build_mapping(catalog)
    selected = set(args.product_id or [])
    rows = [row for row in mapping["products"] if not selected or row["id"] in selected]
    if selected - {row["id"] for row in rows}:
        parser.error(f"Unknown product ids: {sorted(selected - {row['id'] for row in rows})}")
    harvester = Harvester(output, args.delay, args.refresh)
    products = []
    live_unmatched = []
    try:
        for index, row in enumerate(rows, 1):
            try:
                payload = harvester.api(row["slug"])
                product, _ = extract_product(row, payload)
                products.append(product)
                row["match"] = "live-api"
                print(f"[{index}/{len(rows)}] {row['slug']}: {sum(len(t['colours']) for t in product['fabricTypes'])} options", flush=True)
            except FileNotFoundError:
                live_unmatched.append({"id": row["id"], "name": row["name"], "slug": row["slug"], "reason": "HTTP 404"})
                row["match"] = "unmatched-live-404"
                print(f"[{index}/{len(rows)}] {row['slug']}: unmatched (404)", flush=True)
        # Download only after all product responses have been de-duplicated.
        for product in products:
            for fabric in product["fabricTypes"]:
                type_asset = harvester.download(fabric.get("swatchSourceUrl"), output / "assets/fabrics/types" / f"{fabric['id']}.webp")
                if type_asset:
                    fabric["swatchPath"] = type_asset["path"]
                    fabric["swatchThumbPath"] = type_asset["thumbPath"]
                for colour in fabric["colours"]:
                    closeup = harvester.download(colour.get("closeupSourceUrl"), output / "assets/fabrics" / fabric["id"] / f"{colour_asset_id(colour)}.webp")
                    if closeup:
                        colour["swatchPath"] = closeup["thumbPath"]
                        colour["closeupPath"] = closeup["path"]
                        colour["closeupWidth"] = closeup["width"]
                        colour["closeupHeight"] = closeup["height"]
                    # Only an explicit, non-current variant image is a genuine variant photo.
                    variant_url = colour.get("variantSourceUrl")
                    if variant_url and not colour["current"]:
                        variant = harvester.download(variant_url, output / "assets/variants" / product["id"] / f"{fabric['id']}-{colour['id']}.webp", thumb=False)
                        if variant:
                            colour["variantPath"] = variant["path"]
                            colour["variantKind"] = "official"
                            colour["previewUnavailable"] = False
                    else:
                        colour["variantPath"] = None
                        colour["variantKind"] = "unavailable"
                        colour["previewUnavailable"] = not colour["current"]
    except PermissionError as error:
        print(str(error), file=sys.stderr)
        return 2
    finally:
        # Always emit partial reports so a blocked/failing run never looks complete.
        mapping["liveUnmatched"] = live_unmatched
        mapping["counts"]["liveMatched"] = len(products)
        mapping["counts"]["liveUnmatched"] = len(live_unmatched)
        (output / "product-map.json").write_text(json.dumps(mapping, indent=2, ensure_ascii=False) + "\n")
    type_names = {(fabric["id"], fabric["name"]) for product in products for fabric in product["fabricTypes"]}
    colours = [(product, fabric, colour) for product in products for fabric in product["fabricTypes"] for colour in fabric["colours"]]
    report = {
        "harvestedAt": datetime.now(timezone.utc).isoformat(),
        "complete": len(products) + len(live_unmatched) == len(rows),
        "counts": {
            "appProducts": len(catalog),
            "requested": len(rows),
            "matched": len(products),
            "unmatched": len(live_unmatched),
            "productsWithOptions": sum(product["hasOptions"] for product in products),
            "fabricTypes": len(type_names),
            "productFabricTypes": sum(len(product["fabricTypes"]) for product in products),
            "coloursIncludingCurrent": len(colours),
            "namedColours": sum(not colour["current"] for _, _, colour in colours),
            "uniqueCloseups": len({colour.get("closeupSourceUrl") for _, _, colour in colours if colour.get("closeupSourceUrl")}),
            "imagesDownloaded": harvester.downloads,
            "cachedItemsReused": harvester.reused,
            "officialVariantImages": sum(bool(colour.get("variantPath")) for _, _, colour in colours),
        },
        "unmatched": live_unmatched,
        "errors": harvester.errors,
        "missingCloseups": [
            {"productId": product["id"], "fabricId": fabric["id"], "colourId": colour["id"], "name": colour["name"]}
            for product, fabric, colour in colours if not colour.get("closeupPath")
        ],
        "notes": [
            "Null values mean the website did not expose a usable value; nothing was invented.",
            "Current Fabric uses the original product image and is never recoloured.",
            "Repeated generic gallery images are not treated as official colour-variant photography.",
            "Products with only generic Selectable/Fabric entries have no selector.",
        ],
    }
    manifest = {
        "version": 1,
        "harvestedAt": report["harvestedAt"],
        "source": "https://rylqus.ae/api/products/product-detail/{slug}/",
        "products": {product["id"]: product for product in products},
        "unmatched": live_unmatched,
    }
    (output / "fabric-manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    (output / "extraction-report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(report["counts"], indent=2), flush=True)
    print(f"Output: {output}", flush=True)
    return 0 if not harvester.errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
