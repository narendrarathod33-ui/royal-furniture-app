#!/usr/bin/env python3
"""Two-way Excel bridge for the product catalog.

EXPORT
    python3 data/tools/catalog_xlsx.py export [output.xlsx]
        Writes the full catalog (app/data/catalogData.ts) to an Excel workbook:
        a README sheet, a Products sheet (every editable field), and a Leaves
        reference sheet.

IMPORT
    python3 data/tools/catalog_xlsx.py import <file.xlsx>
        Applies the workbook back onto the app:
          - catalog fields      -> app/data/catalogData.ts
          - detail columns      -> app/data/catalogOverrides.ts (merged on top of
                                   the harvested product-page details)
          - leaves column       -> app/data/leafProducts.ts (browse-filter lists)
        Rows match by `id`. New ids add products (see LAUNCHING below). A row
        with remove=1 deletes that product everywhere. Import aborts without
        writing anything when a row is invalid or a required row is missing.

AFTER AN IMPORT
    The dev server (Metro, watch mode) rebuilds automatically; refresh the
    browser to see the changes.

LAUNCHING A PRODUCT (new rows)
    One row per product; give it a fresh id (lowercase-with-hyphens), name,
    category, subcategory, price_aed, list_price_aed and image_url. To launch
    a product with SIZE OPTIONS (the size dropdown), add one row PER SIZE:
    same base name with the size appended, same category, its own id and
    price, e.g.
        aurora-bed-180x200  | Aurora Bed - 180x200 cm | furniture | bedroom | 1450
        aurora-bed-200x200  | Aurora Bed - 200x200 cm | furniture | bedroom | 1750
    The app groups them into one listing card with an "n sizes" badge and a
    size dropdown whose prices follow each row. `leaves` (optional) is a
    comma-separated list of leaf slugs (Leaves sheet) the product should
    appear under in leaf-filtered listings.
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[2]
CATALOG_TS = ROOT / "app" / "data" / "catalogData.ts"
LEAVES_TS = ROOT / "app" / "data" / "catalogLeaves.ts"
LEAF_PRODUCTS_TS = ROOT / "app" / "data" / "leafProducts.ts"
OVERRIDES_TS = ROOT / "app" / "data" / "catalogOverrides.ts"
DETAIL_TS = ROOT / "app" / "data" / "productDetails.ts"

# Excel column name -> (catalog key, kind)
COLUMNS = [
    ("id", "id", "id"),
    ("name", "n", "text"),
    ("category", "c", "slug"),
    ("subcategory", "sc", "slug"),
    ("subcategory_name", "scn", "text"),
    ("description", "d", "text"),
    ("price_aed", "o", "int"),
    ("list_price_aed", "l", "int"),
    ("discount_percent", "pc", "int"),
    ("labels", "lb", "labels"),
    ("stock_status", "st", "text"),
    ("delivery_days", "dl", "int"),
    ("free_delivery", "fd", "bool"),
    ("free_assembly", "fa", "bool"),
    ("image_url", "remoteImage", "text"),
]
# Excel column name -> (override key, kind). Imported into catalogOverrides.ts.
OVERRIDE_COLUMNS = [
    ("gallery_urls", "gallery", "pipe"),
    ("colors", "colors", "colors"),
    ("fabrics", "fabrics", "list"),
    ("dimensions", "dimensions", "rows"),
    ("materials", "material", "rows"),
    ("specs", "specs", "rows"),
    ("warranty", "warranty", "rows"),
    ("assembly", "assembly", "rows"),
    ("info_text", "info", "text"),
    ("sku", "sku", "text"),
    ("rating", "rating", "rating"),
    ("views_24h", "views", "int"),
    ("stock_count", "stock", "stockcount"),
    ("delivery_estimate", "deliveryEstimate", "text"),
    ("delivery_date", "deliveryDate", "text"),
    ("customizable", "customizable", "bool"),
    ("size_customizable", "sizeCustomizable", "bool"),
]
# Special behaviour columns (not stored as overrides).
SPECIAL_COLUMNS = ["leaves", "remove"]
SECTION_COLUMNS = {"dimensions", "material", "specs", "warranty", "assembly"}
EDITABLE = [name for name, _, kind in COLUMNS if kind != "id"] + [name for name, _, _ in OVERRIDE_COLUMNS] + SPECIAL_COLUMNS
ALL_COLUMN_NAMES = [name for name, _, _ in COLUMNS] + [name for name, _, _ in OVERRIDE_COLUMNS] + SPECIAL_COLUMNS

HEADER_FILLS = {
    "id": PatternFill("solid", fgColor="DDDDDD"),
    "catalog": PatternFill("solid", fgColor="DA1921"),
    "detail": PatternFill("solid", fgColor="282984"),
    "special": PatternFill("solid", fgColor="127A44"),
}


def parse_jsonish(text: str, anchor: str) -> object:
    at = text.index(anchor)
    body = text[text.index("{", at) : text.rindex("}") + 1]
    return json.loads(re.sub(r",\s*([\]}])", r"\1", body))


def parse_ts_array(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    body = text[text.index("[") : text.rindex("]") + 1]
    return json.loads(re.sub(r",\s*([\]}])", r"\1", body))


def parse_overrides_ts() -> dict:
    return parse_jsonish(OVERRIDES_TS.read_text(encoding="utf-8"), "catalogOverrides")


def parse_leaf_products_ts() -> dict[str, list[str]]:
    return parse_jsonish(LEAF_PRODUCTS_TS.read_text(encoding="utf-8"), "leafProducts")


def write_catalog_ts(products: list[dict]) -> None:
    text = "export const catalogData = " + json.dumps(products, indent=2, ensure_ascii=False) + " as const;\n"
    CATALOG_TS.write_text(text, encoding="utf-8")
    touch_detail_module()


def write_overrides_ts(overrides: dict) -> None:
    header = (
        "/**\n"
        " * Sheet-driven overrides merged on top of the harvested product details.\n"
        " *\n"
        " * Generated by `data/tools/catalog_xlsx.py import` from the Excel detail\n"
        " * columns (gallery_urls, colors, fabrics, dimensions, materials, specs,\n"
        " * warranty, assembly, info_text, sku, rating, views_24h, stock_count,\n"
        " * delivery_estimate, delivery_date, customizable, size_customizable).\n"
        " * Keys are catalogue product ids; every field is optional.\n"
        " */\n"
        "export type CatalogOverride = {\n"
        "  /** Extra gallery images — absolute https URLs or PRODUCT_IMAGE_BASE-relative paths. */\n"
        "  gallery?: string[];\n"
        "  /** Colour swatches. A name that already exists on the product is updated in place. */\n"
        "  colors?: { name: string; hex?: string; image?: string }[];\n"
        "  /** Extra fabric names. */\n"
        "  fabrics?: string[];\n"
        "  /** Rows merged into (or added as) named info sections, e.g. \"dimensions\". */\n"
        "  sections?: { name: string; rows: { label: string; value: string }[] }[];\n"
        "  /** General Information paragraph shown on the product page. */\n"
        "  info?: string;\n"
        "  /** Schema.org-style SKU shown on the page. */\n"
        "  sku?: string;\n"
        "  /** Average rating (0–5). */\n"
        "  rating?: number;\n"
        "  /** \"n views in 24 hrs\" counter. */\n"
        "  views?: number;\n"
        "  /** Per-order availability cap. */\n"
        "  stock?: { count?: number };\n"
        "  /** Delivery estimate text, e.g. \"7\". */\n"
        "  deliveryEstimate?: string;\n"
        "  /** The page's delivery date, e.g. \"2026-11-01\". */\n"
        "  deliveryDate?: string;\n"
        "  /** Made-to-order (customisation) flag. */\n"
        "  customizable?: boolean;\n"
        "  /** Size-dropdown (\"### Size\" step) flag. */\n"
        "  sizeCustomizable?: boolean;\n"
        "};\n\n"
    )
    text = header + "export const catalogOverrides: Record<string, CatalogOverride> = " + json.dumps(overrides, indent=2, ensure_ascii=False) + ";\n"
    OVERRIDES_TS.write_text(text, encoding="utf-8")
    touch_detail_module()


def write_leaf_products_ts(leaf_map: dict[str, list[str]]) -> None:
    text = "export const leafProducts = " + json.dumps(leaf_map, indent=2, ensure_ascii=False) + " as const;\n"
    LEAF_PRODUCTS_TS.write_text(text, encoding="utf-8")
    touch_detail_module()


def touch_detail_module() -> None:
    """Bump productDetails.ts's mtime so the dev bundler re-reads its imports
    (some watchers miss rewrites of files created after startup)."""
    if DETAIL_TS.exists():
        os.utime(DETAIL_TS, None)


def norm_text(value: str) -> str:
    """Excel normalizes CRLF line endings in cells on save — compare normalized."""
    return value.replace("\r\n", "\n")


def coerce(kind: str, value, where: str):
    """None/empty cells mean 'not set' — callers decide between skip and default."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    if kind == "int":
        try:
            num = float(value)
        except (TypeError, ValueError):
            raise SystemExit(f"{where}: expected a number, got {value!r}") from None
        if num != int(num) or num < 0:
            raise SystemExit(f"{where}: expected a whole number >= 0, got {value!r}")
        return int(num)
    if kind == "bool":
        if isinstance(value, str):
            value = value.strip().lower()
        if value in (1, "1", True, "yes", "y", "true"):
            return 1
        if value in (0, "0", False, "no", "n", "false", ""):
            return 0
        raise SystemExit(f"{where}: expected 1/0, yes/no or true/false, got {value!r}")
    if kind == "labels":
        return [part.strip() for part in str(value).split(",") if part.strip()]
    if kind == "pipe":
        return [part.strip() for part in str(value).split("|") if part.strip()]
    if kind == "list":
        return [part.strip() for part in str(value).split(",") if part.strip()]
    if kind == "colors":
        colors = []
        for entry in str(value).split("|"):
            entry = entry.strip()
            if not entry:
                continue
            match = re.match(r"^(.*?)\s*(#[0-9a-fA-F]{6})?\s*(https?://\S+)?$", entry)
            name = (match.group(1) or "").strip() if match else entry
            hex_value = (match.group(2) or "").strip() if match else ""
            image = (match.group(3) or "").strip() if match else ""
            if not name:
                raise SystemExit(f"{where}: colour entry {entry!r} needs a name, e.g. `Beige #D8C7B0`")
            color = {"name": name}
            if hex_value:
                color["hex"] = hex_value
            if image:
                color["image"] = image
            colors.append(color)
        return colors
    if kind == "rows":
        rows = []
        for entry in str(value).split("|"):
            entry = entry.strip()
            if not entry:
                continue
            if ":" not in entry:
                raise SystemExit(f"{where}: entry {entry!r} must look like `Label: value` (separate rows with |)")
            label, row_value = entry.split(":", 1)
            rows.append({"label": label.strip(), "value": row_value.strip()})
        return rows
    if kind == "rating":
        try:
            num = float(value)
        except (TypeError, ValueError):
            raise SystemExit(f"{where}: expected a number, got {value!r}") from None
        if not 0 <= num <= 5:
            raise SystemExit(f"{where}: rating must be between 0 and 5")
        return round(num, 1)
    if kind == "stockcount":
        try:
            num = int(float(value))
        except (TypeError, ValueError):
            raise SystemExit(f"{where}: expected a whole number, got {value!r}") from None
        if num < 0:
            raise SystemExit(f"{where}: stock_count must be >= 0")
        return {"count": num}
    return norm_text(str(value))


def to_ts_override(columns: dict) -> dict:
    """{column name: value} -> CatalogOverride JSON (section columns merged)."""
    ts: dict = {}
    sections: dict[str, list] = {}
    for name, value in columns.items():
        if not value:
            continue
        if name in SECTION_COLUMNS:
            key = {"dimensions": "dimensions", "materials": "material", "specs": "specs", "warranty": "warranty", "assembly": "assembly"}[name]
            sections[key] = value
        elif name == "info_text":
            ts["info"] = value
        elif name == "sku":
            ts["sku"] = value
        elif name == "rating":
            ts["rating"] = value
        elif name == "views_24h":
            ts["views"] = value
        elif name == "stock_count":
            ts["stock"] = value
        elif name == "delivery_estimate":
            ts["deliveryEstimate"] = value
        elif name == "delivery_date":
            ts["deliveryDate"] = value
        elif name == "customizable":
            ts["customizable"] = bool(value)
        elif name == "size_customizable":
            ts["sizeCustomizable"] = bool(value)
        elif name == "gallery_urls":
            ts["gallery"] = value
        elif name == "colors":
            ts["colors"] = value
        elif name == "fabrics":
            ts["fabrics"] = value
    if sections:
        ts["sections"] = [{"name": key, "rows": rows} for key, rows in sections.items()]
    return ts


def sheet_products(ws, products, overrides: dict, leaf_map: dict[str, list[str]]) -> None:
    all_columns = [(n, k, "catalog") for n, k, _ in COLUMNS] + [(n, k, "detail") for n, k, _ in OVERRIDE_COLUMNS] + [(n, None, "special") for n in SPECIAL_COLUMNS]
    for col, (name, _, group) in enumerate(all_columns, start=1):
        cell = ws.cell(row=1, column=col, value=name)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = HEADER_FILLS[group]
    membership: dict[str, list[str]] = {}
    for slug, ids in leaf_map.items():
        for pid in ids:
            membership.setdefault(pid, []).append(slug)
    def safe_text(value):
        """Neutralise formula injection: openpyxl stores leading `=` as a live
        formula (verified data_type='f'), so prefix spreadsheet-dangerous
        leading characters with an apostrophe (Excel/Sheets render it as text)."""
        if isinstance(value, str) and value[:1] in ("=", "+", "@"):
            return "'" + value
        return value

    for row, product in enumerate(products, start=2):
        override = overrides.get(product["id"], {})
        for col, (name, key, kind) in enumerate(COLUMNS, start=1):
            value = product.get(key)
            if kind == "labels":
                value = ", ".join(value or [])
            ws.cell(row=row, column=col, value=safe_text(value))
        base = len(COLUMNS)
        for col, (name, key, kind) in enumerate(OVERRIDE_COLUMNS, start=base + 1):
            if key in SECTION_COLUMNS:
                value = next((s["rows"] for s in override.get("sections", []) if s["name"] == key), None)
            else:
                value = override.get(key)
            if value is None:
                continue
            if kind == "list":
                value = ", ".join(value)
            elif kind == "pipe":
                value = " | ".join(value)
            elif kind == "colors":
                value = " | ".join(
                    entry["name"] + ((" " + entry["hex"]) if entry.get("hex") else "") + ((" " + entry["image"]) if entry.get("image") else "")
                    for entry in value
                )
            elif kind == "rows":
                value = " | ".join(f"{row['label']}: {row['value']}" for row in value)
            elif kind == "bool":
                value = 1 if value else 0
            elif kind == "stockcount":
                value = value.get("count")
            ws.cell(row=row, column=col, value=safe_text(value))
        special_base = base + len(OVERRIDE_COLUMNS)
        ws.cell(row=row, column=special_base + 1, value=", ".join(sorted(membership.get(product["id"], []))))
    widths = [34, 38, 14, 16, 16, 60, 11, 14, 11, 22, 13, 9, 10, 10, 55,
              55, 36, 18, 45, 45, 45, 45, 45, 40, 10, 9, 12, 14, 14, 10, 11, 10, 24]
    for col, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(col)].width = width
    ws.freeze_panes = "B2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(all_columns))}{len(products) + 1}"
    for row in ws.iter_rows(min_row=2, min_col=6, max_col=6):
        for cell in row:
            cell.alignment = Alignment(wrap_text=True, vertical="top")


def sheet_readme(wb) -> None:
    ws = wb.create_sheet("README", 0)
    ws.column_dimensions["A"].width = 118
    lines = [
        ("ROYAL FURNITURE — FULL CATALOG (editable)", True),
        ("Source of truth: app/data/catalogData.ts · one row per product · generated by data/tools/catalog_xlsx.py", False),
        ("", False),
        ("HOW TO SEE YOUR CHANGES IN THE APP (LIVE)", True),
        ("Option 1 - Google Drive/Sheets (recommended): keep this catalog as a Google Sheet,", False),
        ("   paste data/tools/google-apps-script-sync.gs into Extensions > Apps Script, then", False),
        ("   'Catalog > Sync now' (or the 5-minute auto-sync) pushes edits straight to the app.", False),
        ("Option 2 - upload the saved .xlsx into the Arena chat; the live bridge applies it.", False),
        ("Either way the running app updates itself within a few seconds.", False),
        ("", False),
        ("RULES", True),
        ("- `id` is the match key: never rename it. Everything else is editable.", False),
        ("- price_aed / list_price_aed / delivery_days: whole numbers (AED, no decimals).", False),
        ("- discount_percent: auto-recomputed from list vs price when either changes.", False),
        ("- labels: comma-separated, e.g. `Trending, Best Seller` (these draw the card badges).", False),
        ("- stock_status: `in_stock` or `out_of_stock`. free_delivery / free_assembly: 1 or 0.", False),
        ("- category / subcategory: existing slugs only (see the Leaves sheet). Changing them", False),
        ("  moves the product between browse filters.", False),
        ("", False),
        ("PICTURES & PRODUCT-PAGE DETAILS (blue columns)", True),
        ("- image_url: main photo. gallery_urls: detail-page photos, separated by |.", False),
        ("- colors: `Beige #D8C7B0 | Oak #C19A6B` (name + hex; an image URL may follow).", False),
        ("- fabrics: comma-separated, e.g. `Fabric, Leatherette`.", False),
        ("- dimensions / materials / specs / warranty / assembly: rows separated by |,", False),
        ("  each `Label: value`, e.g. `Width: 120 cm | Depth: 60 cm | Height: 45 cm`.", False),
        ("- info_text: the General Information paragraph on the product page.", False),
        ("- sku, rating (0-5), views_24h, stock_count, delivery_estimate, delivery_date:", False),
        ("  the product-page facts. customizable / size_customizable: 1 or 0.", False),
        ("- Own photos: share the file publicly (Drive: anyone-with-link) and ask the", False),
        ("  assistant for a direct link, or use any public image URL.", False),
        ("", False),
        ("LAUNCHING A NEW PRODUCT (size options, filters)", True),
        ("- Add a row with a NEW id (lowercase-with-hyphens): name, category, subcategory,", False),
        ("  price_aed, list_price_aed and image_url are required; the rest get sensible defaults.", False),
        ("- SIZE OPTIONS = one row PER SIZE: same base name with the size appended, same", False),
        ("  category, own id and price. Example:", False),
        ("    aurora-bed-180x200 | Aurora Bed - 180x200 cm | furniture | bedroom | 1450 | 1900", False),
        ("    aurora-bed-200x200 | Aurora Bed - 200x200 cm | furniture | bedroom | 1750 | 2200", False),
        ("  The app merges them into one card with a size dropdown (prices follow each row).", False),
        ("- leaves (green): comma-separated leaf slugs (Leaves sheet) the product appears", False),
        ("  under in leaf-filtered listings, e.g. `coffee-table`.", False),
        ("- remove (green): set 1 to delete that product everywhere (catalog, filters, details).", False),
        ("", False),
        ("SHEET GUIDE", True),
        ("- Products: the full catalog. Red = listing fields, blue = product-page details,", False),
        ("  green = launch/remove controls.", False),
        ("- Leaves: read-only reference of leaf slugs, parents and product counts.", False),
    ]
    for row, (text, bold) in enumerate(lines, start=1):
        cell = ws.cell(row=row, column=1, value=text)
        cell.font = Font(bold=bold, size=13 if row == 1 else 11)


def sheet_leaves(wb) -> None:
    leaves = parse_ts_array(LEAVES_TS)
    catalog = parse_ts_array(CATALOG_TS)
    counts = Counter((p["c"], p["sc"]) for p in catalog)
    ws = wb.create_sheet("Leaves")
    headers = ["leaf_slug", "leaf_name", "category", "subcategory", "products_in_browse"]
    for col, name in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col, value=name)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="282984")
    for row, leaf in enumerate(leaves, start=2):
        ws.cell(row=row, column=1, value=leaf["slug"])
        ws.cell(row=row, column=2, value=leaf["name"])
        ws.cell(row=row, column=3, value=leaf["category"])
        ws.cell(row=row, column=4, value=leaf["subcategory"])
        ws.cell(row=row, column=5, value=counts.get((leaf["category"], leaf["subcategory"]), 0))
    for col, width in enumerate([26, 26, 14, 16, 20], start=1):
        ws.column_dimensions[get_column_letter(col)].width = width
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:E{len(leaves) + 1}"


def cmd_export(output: Path) -> None:
    products = parse_ts_array(CATALOG_TS)
    overrides = parse_overrides_ts() if OVERRIDES_TS.exists() else {}
    leaf_map = parse_leaf_products_ts() if LEAF_PRODUCTS_TS.exists() else {}
    wb = Workbook()
    ws = wb.active
    ws.title = "Products"
    sheet_products(ws, products, overrides, leaf_map)
    sheet_readme(wb)
    sheet_leaves(wb)
    wb.save(output)
    print(f"exported {len(products)} products -> {output}")


def cmd_import(xlsx_path: Path) -> None:
    products = parse_ts_array(CATALOG_TS)
    by_id: dict[str, dict] = {p["id"]: p for p in products}
    current_overrides = parse_overrides_ts() if OVERRIDES_TS.exists() else {}
    leaf_map = parse_leaf_products_ts() if LEAF_PRODUCTS_TS.exists() else {}
    valid_subcats = {(p["c"], p["sc"]): p.get("scn") for p in products}
    known_categories = {p["c"] for p in products}

    wb = load_workbook(xlsx_path, read_only=True, data_only=True)
    if "Products" not in wb.sheetnames:
        raise SystemExit("no `Products` sheet found — is this the exported catalog workbook?")
    ws = wb["Products"]
    rows = ws.iter_rows(values_only=True)
    header = [str(cell).strip() if cell is not None else "" for cell in next(rows)]
    key_by_name: dict[str, tuple] = {name: (key, kind, "catalog") for name, key, kind in COLUMNS}
    key_by_name.update({name: (key, kind, "detail") for name, key, kind in OVERRIDE_COLUMNS})
    key_by_name.update({name: (name, "raw", "special") for name in SPECIAL_COLUMNS})
    unknown = [h for h in header if h and h not in key_by_name]
    if unknown:
        raise SystemExit(f"unrecognized column(s) {unknown} — export a fresh workbook instead of restructuring it")
    if "id" not in header:
        raise SystemExit("the sheet has no `id` column")
    id_col = header.index("id")
    detail_names = {name for name, _, _ in OVERRIDE_COLUMNS}
    detail_columns_present = any(name in detail_names for name in header)
    leaves_col = header.index("leaves") if "leaves" in header else None
    remove_col = header.index("remove") if "remove" in header else None

    field_hits: Counter[str] = Counter()
    seen: set[str] = set()
    removed: list[str] = []
    added: list[str] = []
    changed_products: set[str] = set()
    desired_overrides: dict[str, dict] = {}
    desired_leaves: dict[str, set[str]] = {}
    leaves_touched = False

    for row_no, row in enumerate(rows, start=2):
        if row is None or all(cell is None or str(cell).strip() == "" for cell in row):
            continue
        if id_col >= len(row) or row[id_col] in (None, ""):
            raise SystemExit(f"row {row_no}: missing id")
        pid = str(row[id_col]).strip()
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", pid):
            raise SystemExit(f"row {row_no}: id `{pid}` must be lowercase letters/digits/hyphens (no spaces)")
        seen.add(pid)

        cell_map: dict[str, object] = {}
        for col_no, name in enumerate(header):
            if not name or name == "id" or col_no >= len(row):
                continue
            cell_map[name] = row[col_no]

        wants_remove = False
        if remove_col is not None and remove_col < len(row):
            wants_remove = coerce("bool", row[remove_col], f"row {row_no} (remove)") == 1

        if wants_remove:
            if pid in by_id:
                del by_id[pid]
                removed.append(pid)
            desired_overrides[pid] = {}
            desired_leaves[pid] = set()
            continue

        detail_values: dict[str, object] = {}
        for name in detail_names:
            if name in cell_map:
                key, kind, _ = key_by_name[name]
                detail_values[name] = coerce(kind, cell_map[name], f"row {row_no} ({name})")
        desired_overrides[pid] = to_ts_override(detail_values)

        if leaves_col is not None and leaves_col < len(row):
            raw = cell_map.get("leaves")
            wanted = {part.strip() for part in str(raw or "").split(",") if part.strip()}
            known_leaf_slugs = set(leaf_map)
            unknown_leaves = wanted - known_leaf_slugs
            if unknown_leaves:
                raise SystemExit(f"row {row_no} (`{pid}`): unknown leaves {sorted(unknown_leaves)} — use slugs from the Leaves sheet; import aborted (nothing written)")
            desired_leaves[pid] = wanted

        if pid not in by_id:
            # ---- new product launch ----
            required = {"name": "name", "category": "category", "subcategory": "subcategory", "price_aed": "price_aed", "list_price_aed": "list_price_aed"}
            missing = [label for label in required if cell_map.get(label) in (None, "")]
            if missing:
                raise SystemExit(f"row {row_no}: new product `{pid}` is missing {missing} — fill those cells; import aborted (nothing written)")
            if cell_map["category"] not in known_categories:
                raise SystemExit(f"row {row_no}: new product `{pid}` has unknown category `{cell_map['category']}`; import aborted (nothing written)")
            if cell_map.get("image_url") in (None, ""):
                raise SystemExit(f"row {row_no}: new product `{pid}` needs image_url (the main product photo); import aborted (nothing written)")
            product: dict = {"id": pid}
            for name, key, kind in COLUMNS:
                if key == "id":
                    continue
                product[key] = coerce(kind, cell_map.get(name), f"row {row_no} ({name})") if cell_map.get(name) not in (None, "") else {"n": "", "c": "", "sc": "", "scn": "", "d": "", "o": 0, "l": 0, "pc": 0, "lb": [], "st": "in_stock", "dl": 7, "fd": 1, "fa": 1, "remoteImage": ""}[key]
            if not product["scn"]:
                product["scn"] = valid_subcats.get((product["c"], product["sc"])) or product["sc"].replace("-", " ").title()
            if product["l"] <= product["o"]:
                raise SystemExit(f"row {row_no}: list_price_aed must be greater than price_aed for `{pid}`; import aborted (nothing written)")
            product["pc"] = max(0, min(100, round((product["l"] - product["o"]) / product["l"] * 100)))
            by_id[pid] = product
            added.append(pid)
            changed_products.add(pid)
            field_hits["new product"] += 1
            continue

        # ---- existing product field updates ----
        product = by_id[pid]
        price_touched = False
        for col_no, name in enumerate(header):
            if not name or name == "id" or col_no >= len(row):
                continue
            key, kind, group = key_by_name[name]
            if group != "catalog":
                continue  # detail/special columns handled above
            new_value = coerce(kind, row[col_no], f"row {row_no} ({name})")
            if new_value is None:
                continue  # empty cell = no change
            old_value = product.get(key)
            if isinstance(new_value, str) and isinstance(old_value, str):
                if norm_text(new_value) == norm_text(old_value):
                    continue
            elif new_value == old_value:
                continue
            if name in ("price_aed", "list_price_aed"):
                price_touched = True
            product[key] = new_value
            field_hits[name] += 1
            changed_products.add(pid)
        if price_touched:
            recomputed = round((product["l"] - product["o"]) / product["l"] * 100) if product["l"] else 0
            recomputed = max(0, min(100, recomputed))
            if recomputed != product["pc"]:
                product["pc"] = recomputed
                field_hits["discount_percent(auto)"] += 1
                changed_products.add(pid)

    missing = [pid for pid in by_id if pid not in seen]
    if missing:
        raise SystemExit(f"{len(missing)} product row(s) are missing from the sheet (e.g. {missing[:3]}) — export a fresh copy instead of deleting rows; import aborted (nothing written)")

    # ---- leaf membership diff ----
    current_membership: dict[str, set[str]] = {}
    for slug, ids in leaf_map.items():
        for pid in ids:
            current_membership.setdefault(pid, set()).add(slug)
    new_leaf_map = {slug: list(ids) for slug, ids in leaf_map.items()}
    for pid, wanted in desired_leaves.items():
        current = current_membership.get(pid, set())
        if wanted == current:
            continue
        leaves_touched = True
        for slug in current - wanted:
            new_leaf_map[slug] = [x for x in new_leaf_map.get(slug, []) if x != pid]
        for slug in wanted - current:
            new_leaf_map.setdefault(slug, []).append(pid)
    # products removed this run must leave every leaf list
    for pid in removed:
        for slug, ids in new_leaf_map.items():
            if pid in ids:
                new_leaf_map[slug] = [x for x in ids if x != pid]
                leaves_touched = True

    final_overrides: dict[str, dict] = {}
    if detail_columns_present:
        final_overrides = {pid: ov for pid, ov in ((p, desired_overrides.get(p, {})) for p in by_id) if ov}
    else:
        final_overrides = {pid: ov for pid, ov in current_overrides.items() if pid in by_id and ov}
        for pid in removed:
            final_overrides.pop(pid, None)
    overrides_changed = final_overrides != {pid: ov for pid, ov in current_overrides.items() if ov}

    if not changed_products and not overrides_changed and not leaves_touched:
        print("no changes detected — catalog left untouched")
        return

    if changed_products or removed or added:
        write_catalog_ts(list(by_id.values()))
    if overrides_changed:
        write_overrides_ts(final_overrides)
    if leaves_touched:
        write_leaf_products_ts(new_leaf_map)

    summary = ", ".join(f"{name}: {count}" for name, count in sorted(field_hits.items()))
    bits = []
    if added:
        bits.append(f"{len(added)} new product(s) [{', '.join(added[:4])}{'…' if len(added) > 4 else ''}]")
    if removed:
        bits.append(f"{len(removed)} removed [{', '.join(removed[:4])}{'…' if len(removed) > 4 else ''}]")
    if changed_products - set(added):
        bits.append(f"{len(changed_products - set(added))} updated product(s)")
    if overrides_changed:
        bits.append(f"details for {len(final_overrides)} product(s)")
    if leaves_touched:
        bits.append("filter lists")
    print(f"imported: {'; '.join(bits) if bits else 'nothing'} -> app/data/")
    print(f"fields updated — {summary or 'none'}")


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in {"export", "import"}:
        print(__doc__)
        raise SystemExit(2)
    if sys.argv[1] == "export":
        output = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "royal-furniture-catalog.xlsx"
        cmd_export(output)
    else:
        if len(sys.argv) != 3:
            print(__doc__)
            raise SystemExit(2)
        cmd_import(Path(sys.argv[2]))


if __name__ == "__main__":
    main()
