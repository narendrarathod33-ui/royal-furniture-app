#!/usr/bin/env python3
"""Install a reviewed harvest artifact and emit Metro's static asset registry."""
from __future__ import annotations
import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('artifact', type=Path, help='Directory containing fabric-manifest.json and assets/')
    args = parser.parse_args()
    source = args.artifact.resolve()
    manifest = source / 'fabric-manifest.json'
    if not manifest.is_file():
        parser.error(f'Missing {manifest}')
    data = json.loads(manifest.read_text())
    if data.get('version') != 1 or not isinstance(data.get('products'), dict):
        parser.error('Unsupported or incomplete fabric manifest')
    # Unknown stock must remain unknown; only unanimous explicit false values
    # make a colour globally unavailable (true means at least one size is available).
    added_current = 0
    duplicate_current = 0
    for product in data['products'].values():
        if not product.get('hasOptions'):
            continue
        types = product.get('fabricTypes', [])
        currents = [(fabric, colour) for fabric in types for colour in fabric.get('colours', []) if colour.get('current')]
        if not currents:
            types.insert(0, {
                'id': 'fabric-current', 'name': 'Fabric Current', 'swatchSourceUrl': None,
                'colours': [{'id': 'current', 'name': 'Current Fabric', 'officialName': 'Current Fabric', 'code': None, 'hex': None, 'fabricColorId': None, 'closeupSourceUrl': None, 'variantSourceUrl': None, 'variantPath': None, 'variantKind': 'unavailable', 'current': True, 'available': None, 'priceDelta': 0, 'previewUnavailable': False, 'sizeVariants': []}],
            })
            added_current += 1
        elif len(currents) > 1:
            keep = currents[0][1]
            for fabric, colour in currents[1:]:
                fabric['colours'] = [item for item in fabric['colours'] if item is not colour]
                duplicate_current += 1
            product['fabricTypes'] = [fabric for fabric in types if fabric.get('colours')]
            # Keep the first original entry; all others were duplicate UI rows.
            assert keep.get('current')
        for fabric in product.get('fabricTypes', []):
            for colour in fabric.get('colours', []):
                values = [item.get('available') for item in colour.get('sizeVariants', [])]
                colour['available'] = True if any(value is True for value in values) else False if values and all(value is False for value in values) else None
    target_assets = ROOT / 'assets/fabrics'
    target_variants = ROOT / 'assets/variants'
    for name, target in [('assets/fabrics', target_assets), ('assets/variants', target_variants)]:
        origin = source / name
        if origin.exists():
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(origin, target)
    manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    (ROOT / 'app/data/fabricManifest.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    if (source / 'product-map.json').is_file():
        shutil.copy2(source / 'product-map.json', ROOT / 'data/fabric-product-map.json')
    reports = ROOT / 'docs/fabric-qa'
    reports.mkdir(parents=True, exist_ok=True)
    for name in ('extraction-report.json', 'quality-report.json', 'quality-report.md', 'validation-report.json', 'contact-sheet-index.html'):
        if (source / name).is_file():
            shutil.copy2(source / name, reports / name)
    if (source / 'contact-sheets').is_dir():
        destination = reports / 'contact-sheets'
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(source / 'contact-sheets', destination)
    referenced = set()
    for product in data['products'].values():
        for fabric in product.get('fabricTypes', []):
            referenced.update(fabric.get(key) for key in ('swatchPath', 'swatchThumbPath'))
            for colour in fabric.get('colours', []):
                referenced.update(colour.get(key) for key in ('swatchPath', 'closeupPath', 'variantPath'))
    for folder in (target_assets, target_variants):
        if not folder.exists():
            continue
        for image in folder.rglob('*.webp'):
            if image.relative_to(ROOT).as_posix() not in referenced:
                image.unlink()
    paths = sorted({str(image) for folder in (target_assets, target_variants) if folder.exists() for image in folder.rglob('*.webp')})
    lines = [
        "import type { ImageSourcePropType } from 'react-native';",
        '',
        '/** Generated from reviewed official assets; every require is static for Metro. */',
        'export const generatedFabricImageAssets: Record<string, ImageSourcePropType> = {',
    ]
    for path in paths:
        key = Path(path).relative_to(ROOT).as_posix()
        require_path = '../../' + key
        lines.append(f"  {json.dumps(key)}: require({json.dumps(require_path)}),")
    lines += ['};', '']
    (ROOT / 'app/data/fabricAssets.ts').write_text('\n'.join(lines))
    (reports / 'install-report.json').write_text(json.dumps({'matchedProducts': len(data['products']), 'staticImageAssets': len(paths), 'currentEntriesAddedBecauseApiOmittedOriginalRow': added_current, 'duplicateCurrentEntriesRemoved': duplicate_current}, indent=2) + '\n')
    print(f'Installed {len(data["products"])} matched products and {len(paths)} static image assets; current additions {added_current}, duplicate originals removed {duplicate_current}')


if __name__ == '__main__':
    main()
