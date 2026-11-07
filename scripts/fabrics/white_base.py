"""White-background product detection and conservative upholstery masks.

The source JPEG is never edited. Detection is intentionally conservative: a
white border alone is not enough, and uncertain masks are flagged instead of
being presented as approved live previews.
"""
from __future__ import annotations

from collections import deque
from typing import Any

import numpy as np
from PIL import Image, ImageFilter

WHITE_BORDER_MIN = 0.90
SINGLE_OBJECT_MIN = 0.80
MASK_CONFIDENCE_MIN = 0.70


def resized_rgb(image: Image.Image, maximum: int = 512) -> Image.Image:
    copy = image.convert("RGB")
    copy.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
    return copy


def border_pixels(rgb: np.ndarray) -> np.ndarray:
    width = max(1, round(min(rgb.shape[:2]) * 0.02))
    return np.concatenate([
        rgb[:width].reshape(-1, 3), rgb[-width:].reshape(-1, 3),
        rgb[width:-width, :width].reshape(-1, 3), rgb[width:-width, -width:].reshape(-1, 3),
    ])


def near_white(rgb: np.ndarray) -> np.ndarray:
    values = np.asarray(rgb, dtype=np.int16)
    return (values.min(axis=-1) >= 245) & ((values.max(axis=-1) - values.min(axis=-1)) <= 10)


def border_white_ratio(image: Image.Image) -> float:
    rgb = np.asarray(resized_rgb(image, 256), dtype=np.uint8)
    return float(near_white(border_pixels(rgb)).mean())


def dilate(mask: np.ndarray, iterations: int = 1) -> np.ndarray:
    result = mask.astype(bool)
    for _ in range(iterations):
        padded = np.pad(result, 1)
        result = np.logical_or.reduce([padded[y:y + result.shape[0], x:x + result.shape[1]] for y in range(3) for x in range(3)])
    return result


def erode(mask: np.ndarray, iterations: int = 1) -> np.ndarray:
    result = mask.astype(bool)
    for _ in range(iterations):
        padded = np.pad(result, 1, constant_values=True)
        result = np.logical_and.reduce([padded[y:y + result.shape[0], x:x + result.shape[1]] for y in range(3) for x in range(3)])
    return result


def close(mask: np.ndarray, iterations: int = 1) -> np.ndarray:
    return erode(dilate(mask, iterations), iterations)


def components(mask: np.ndarray) -> list[dict[str, Any]]:
    """8-connected components without adding a heavyweight CV dependency."""
    height, width = mask.shape
    unseen = mask.copy()
    output = []
    for y, x in zip(*np.nonzero(mask)):
        if not unseen[y, x]:
            continue
        queue = deque([(int(y), int(x))])
        unseen[y, x] = False
        points = []
        while queue:
            cy, cx = queue.popleft()
            points.append((cy, cx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < height and 0 <= nx < width and unseen[ny, nx]:
                        unseen[ny, nx] = False
                        queue.append((ny, nx))
        ys = [point[0] for point in points]
        xs = [point[1] for point in points]
        output.append({"area": len(points), "bbox": (min(xs), min(ys), max(xs) + 1, max(ys) + 1), "points": points})
    return sorted(output, key=lambda item: item["area"], reverse=True)


def object_metrics(image: Image.Image) -> dict[str, Any]:
    rgb = np.asarray(resized_rgb(image, 160), dtype=np.float32)
    background = np.median(border_pixels(rgb), axis=0)
    distance = np.linalg.norm(rgb - background, axis=2)
    foreground = close(distance > 34, 2)
    significant = [item for item in components(foreground) if item["area"] >= 5]
    if not significant:
        return {"singleObject": False, "singleObjectConfidence": 0.0, "mainObjectAreaRatio": 0.0, "secondaryObjectRatio": None, "objectBounds": None}
    main = significant[0]
    secondary = sum(item["area"] for item in significant[1:])
    ratio = secondary / max(main["area"], 1)
    area_ratio = main["area"] / (rgb.shape[0] * rgb.shape[1])
    x0, y0, x1, y1 = main["bbox"]
    centre = ((x0 + x1) / 2 / rgb.shape[1], (y0 + y1) / 2 / rgb.shape[0])
    centre_score = max(0.0, 1.0 - (abs(centre[0] - 0.5) + abs(centre[1] - 0.52)))
    area_score = min(1.0, area_ratio / 0.08)
    separation_score = max(0.0, 1.0 - ratio / 0.35)
    confidence = max(0.0, min(1.0, 0.65 * separation_score + 0.2 * area_score + 0.15 * centre_score))
    return {
        "singleObject": bool(area_ratio >= 0.025 and ratio <= 0.20 and confidence >= SINGLE_OBJECT_MIN),
        "singleObjectConfidence": round(confidence, 5),
        "mainObjectAreaRatio": round(area_ratio, 5),
        "secondaryObjectRatio": round(ratio, 5),
        "objectBounds": [round(x0 / rgb.shape[1], 5), round(y0 / rgb.shape[0], 5), round(x1 / rgb.shape[1], 5), round(y1 / rgb.shape[0], 5)],
    }


def analyse_candidate(image: Image.Image) -> dict[str, Any]:
    ratio = border_white_ratio(image)
    object_info = object_metrics(image)
    reasons = []
    if ratio <= WHITE_BORDER_MIN:
        reasons.append("border-not-over-90-percent-near-white")
    if not object_info["singleObject"]:
        reasons.append("no-confident-single-main-object")
    return {
        "whiteBackground": not reasons,
        "borderWhiteRatio": round(ratio, 5),
        **object_info,
        "flagReasons": reasons,
    }


def average_hash(image: Image.Image) -> int:
    pixels = np.asarray(image.convert("L").resize((8, 8), Image.Resampling.LANCZOS), dtype=np.float32)
    bits = (pixels > pixels.mean()).reshape(-1)
    return int(sum(int(bit) << index for index, bit in enumerate(bits)))


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    value = np.asarray(rgb, dtype=np.float64) / 255.0
    value = np.where(value <= 0.04045, value / 12.92, ((value + 0.055) / 1.055) ** 2.4)
    matrix = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = value @ matrix.T / np.array([0.95047, 1.0, 1.08883])
    delta = 6 / 29
    f = np.where(xyz > delta**3, np.cbrt(xyz), xyz / (3 * delta**2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def delta_e(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.linalg.norm(rgb_to_lab(a) - rgb_to_lab(b), axis=-1)


def median_colour(image: Image.Image | None) -> np.ndarray | None:
    if image is None:
        return None
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    h, w = rgb.shape[:2]
    core = rgb[h // 10:max(h // 10 + 1, h * 9 // 10), w // 10:max(w // 10 + 1, w * 9 // 10)]
    return np.median(core.reshape(-1, 3), axis=0)


def kmeans(pixels: np.ndarray, count: int = 6) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Deterministic farthest-point seeded k-means on a bounded pixel sample."""
    if len(pixels) <= count:
        centres = pixels.copy()
        return centres, np.arange(len(pixels)), np.ones(len(pixels), dtype=int)
    centres = [np.median(pixels, axis=0)]
    while len(centres) < count:
        distance = np.min(np.stack([np.linalg.norm(pixels - centre, axis=1) for centre in centres]), axis=0)
        centres.append(pixels[int(np.argmax(distance))])
    centres_array = np.asarray(centres, dtype=np.float32)
    labels = np.zeros(len(pixels), dtype=int)
    for _ in range(12):
        distances = np.stack([np.linalg.norm(pixels - centre, axis=1) for centre in centres_array], axis=1)
        updated = distances.argmin(axis=1)
        if np.array_equal(updated, labels) and _ > 0:
            labels = updated
            break
        labels = updated
        for index in range(count):
            selected = pixels[labels == index]
            if len(selected):
                centres_array[index] = np.median(selected, axis=0)
    return centres_array, labels, np.bincount(labels, minlength=count)


def build_upholstery_mask(image: Image.Image, closeup: Image.Image | None = None) -> dict[str, Any]:
    """Return subject/shadow/upholstery masks and an explicit confidence score.

    Colour clusters separate the dominant current upholstery from contrasting
    pillows, wood and metal. Background and the soft contact shadow are never
    included in the recolouring mask.
    """
    small = resized_rgb(image, 512)
    rgb = np.asarray(small, dtype=np.float32)
    height, width = rgb.shape[:2]
    background = np.median(border_pixels(rgb), axis=0)
    distance = np.linalg.norm(rgb - background, axis=2)
    core = close(distance > 34, 2)
    main_components = [item for item in components(core) if item["area"] >= 8]
    candidate = analyse_candidate(image)
    if not main_components:
        return {"accepted": False, "maskConfidence": 0.0, "flagReasons": ["no-product-silhouette"], "candidate": candidate}
    main = main_components[0]
    x0, y0, x1, y1 = main["bbox"]
    main_mask = np.zeros((height, width), dtype=bool)
    for component in main_components:
        if component["area"] < main["area"] * 0.02:
            continue
        for y, x in component["points"]:
            main_mask[y, x] = True
    main_mask = close(main_mask, 2)
    # Include anti-aliased object edges only around the detected main object.
    region = np.zeros((height, width), dtype=bool)
    region[max(0, y0 - 4):min(height, y1 + 5), max(0, x0 - 4):min(width, x1 + 5)] = True
    object_alpha = np.clip((distance - 10) / 25, 0, 1) * region
    object_alpha[main_mask] = np.maximum(object_alpha[main_mask], 0.96)

    # A neutral soft shadow is retained only immediately below the product.
    shadow_zone = np.zeros((height, width), dtype=bool)
    shadow_x = max(2, round((x1 - x0) * 0.10))
    shadow_zone[max(0, y1 - max(8, round((y1 - y0) * 0.12))):min(height, y1 + max(8, round((y1 - y0) * 0.18))), max(0, x0 - shadow_x):min(width, x1 + shadow_x)] = True
    neutral = (rgb.max(axis=2) - rgb.min(axis=2)) <= 18
    shadow_alpha = np.clip((distance - 3) / 9, 0, 1) * shadow_zone * neutral * ~main_mask
    subject_alpha = np.maximum(object_alpha, shadow_alpha)

    sample_mask = (object_alpha > 0.96) & ~shadow_zone
    sample = rgb[sample_mask]
    if len(sample) < 100:
        return {"accepted": False, "maskConfidence": 0.0, "flagReasons": ["insufficient-product-colour-samples"], "candidate": candidate}
    rng = np.random.default_rng(41)
    if len(sample) > 8000:
        sample = sample[rng.choice(len(sample), 8000, replace=False)]
    centres, _, sizes = kmeans(sample)
    target = median_colour(closeup)
    centre_differences = delta_e(centres, np.broadcast_to(target, centres.shape)) if target is not None else np.zeros(len(centres))
    if target is not None:
        # Area prevents a tiny trim cluster from winning merely by colour.
        scores = centre_differences - np.log1p(sizes) * 1.5
        selected = int(np.argmin(scores))
        selected_difference = float(centre_differences[selected])
    else:
        selected = int(np.argmax(sizes))
        selected_difference = None
    chosen = {selected}
    for index, centre in enumerate(centres):
        if float(delta_e(centre, centres[selected])) <= 20 or (target is not None and centre_differences[index] <= 25):
            chosen.add(index)

    full_sample = rgb[sample_mask]
    # Assign in bounded chunks to avoid a large pixels×clusters temporary.
    upholstery = np.zeros((height, width), dtype=bool)
    flat_indices = np.flatnonzero(sample_mask.reshape(-1))
    flat_rgb = rgb.reshape(-1, 3)
    for start in range(0, len(flat_indices), 20000):
        indices = flat_indices[start:start + 20000]
        pixels = flat_rgb[indices]
        distances = np.stack([np.linalg.norm(pixels - centre, axis=1) for centre in centres], axis=1)
        labels = distances.argmin(axis=1)
        keep = np.isin(labels, list(chosen))
        upholstery.reshape(-1)[indices[keep]] = True
    upholstery = close(upholstery, 2) & (object_alpha > 0.45) & ~shadow_zone
    # Hard exclusions are intentional: no shadow, leg-only region or background
    # can be recoloured even if a colour cluster was similar to the fabric.
    upholstery[(shadow_alpha > 0.05) | (subject_alpha <= 0.05)] = False

    subject_area = max(1, int((object_alpha > 0.45).sum()))
    coverage = float((upholstery.sum()) / subject_area)
    mask_area_ratio = float(upholstery.sum() / (height * width))
    if 0.15 <= coverage <= 0.92:
        coverage_score = 1.0
    else:
        coverage_score = max(0.0, min(coverage / 0.15, (1.05 - coverage) / 0.13))
    colour_score = 0.55 if selected_difference is None else max(0.0, 1.0 - selected_difference / 65)
    confidence = max(0.0, min(1.0,
        candidate["singleObjectConfidence"] * 0.30 + colour_score * 0.30 + coverage_score * 0.25 + min(1.0, candidate["borderWhiteRatio"]) * 0.15,
    ))
    reasons = []
    if selected_difference is not None and selected_difference > 42:
        reasons.append("current-fabric-colour-differs-from-main-product-cluster")
    if coverage < 0.08:
        reasons.append("upholstery-coverage-too-low")
    if coverage > 0.96:
        reasons.append("upholstery-mask-includes-nearly-entire-product")
    if mask_area_ratio < 0.01:
        reasons.append("upholstery-mask-too-small")
    if confidence < MASK_CONFIDENCE_MIN:
        reasons.append("mask-confidence-below-0.70")
    accepted = candidate["whiteBackground"] and not reasons
    scale_x, scale_y = image.width / width, image.height / height
    def full_mask(values: np.ndarray, alpha: bool = False) -> Image.Image:
        data = np.uint8(np.clip(values, 0, 1) * 255) if alpha else np.uint8(values) * 255
        return Image.fromarray(data, "L").resize(image.size, Image.Resampling.LANCZOS)
    return {
        "accepted": accepted,
        "maskConfidence": round(confidence, 5),
        "maskCoverage": round(coverage, 5),
        "maskAreaRatio": round(mask_area_ratio, 5),
        "selectedClusterColourDifference": None if selected_difference is None else round(selected_difference, 5),
        "flagReasons": reasons or (["automatic-mask-review-recommended"] if accepted else []),
        "candidate": candidate,
        "upholsteryMask": full_mask(upholstery),
        "subjectMask": full_mask(subject_alpha, alpha=True),
        "shadowMask": full_mask(shadow_alpha, alpha=True),
        "backgroundColour": background.round(2).tolist(),
        "workSize": [width, height],
        "sourceScale": [scale_x, scale_y],
    }


def clean_white_base(image: Image.Image, subject_mask: Image.Image) -> Image.Image:
    """Composite the untouched product/shadow pixels over pure white."""
    alpha = np.asarray(subject_mask.convert("L").resize(image.size, Image.Resampling.LANCZOS), dtype=np.float32) / 255.0
    source = np.asarray(image.convert("RGB"), dtype=np.float32)
    white = np.full_like(source, 255)
    output = source * alpha[..., None] + white * (1 - alpha[..., None])
    return Image.fromarray(np.uint8(np.clip(output + 0.5, 0, 255)), "RGB")
