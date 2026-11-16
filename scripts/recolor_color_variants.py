#!/usr/bin/env python3
"""
Option 1 ($0 Forever): Neural Furniture Segmentation + CIELAB Upholstery Recoloring.

Segments furniture pieces with `facebook/mask2former-swin-base-IN21k-ade-semantic`
(ADE20K semantic segmentation on CPU, zero API cost), isolates the primary
upholstery cluster in CIELAB space (protecting wood/metal legs, dark contrast
throw cushions, and printed duvets), refines mask boundaries with a fast Guided
Filter, and transfers swatch hex + fabric sheen/texture in CIELAB space.

Supports single-image CLI mode and batch JSON worker mode (`--jobs-json`) called
by `scripts/generate-color-variants.mjs --engine free-lab`.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image


DEFAULT_SEG_MODEL = "facebook/mask2former-swin-base-IN21k-ade-semantic"

# ADE20K semantic label substrings mapped per catalog category so walls, floors,
# rugs, coffee tables, plants, and curtains are never modified.
CATEGORY_LABELS: dict[str, tuple[str, ...]] = {
    "sofas": ("sofa", "armchair", "chair", "swivel chair", "ottoman", "stool", "bench"),
    "bedroom": ("bed", "ottoman", "bench", "wardrobe", "chest of drawers", "cabinet"),
    "kids-and-teens": ("bed", "sofa", "chair", "ottoman", "bench", "desk"),
    "household": (
        "chair",
        "stool",
        "ottoman",
        "vase",
        "pot",
        "sculpture",
        "lamp",
        "table",
        "plate",
        "tray",
    ),
}
DEFAULT_FURNITURE_LABELS: tuple[str, ...] = (
    "sofa",
    "armchair",
    "chair",
    "swivel chair",
    "bed",
    "ottoman",
    "stool",
    "bench",
)


FALLBACK_COLOR_NAMES: dict[str, str] = {
    "navy": "#1E3557",
    "emerald": "#1F5747",
    "charcoal": "#3B3D40",
    "greige": "#B8B2A6",
    "terracotta": "#B66047",
    "ivory": "#F3EEE2",
    "cream": "#F5F1E8",
    "taupe": "#9B8D7E",
    "walnut": "#5C4033",
    "maroon": "#5E2329",
    "olive": "#6B7045",
    "mint": "#B7CCC1",
    "beige": "#D5C6B0",
    "black": "#222224",
    "grey": "#8A8D8F",
    "gray": "#8A8D8F",
    "white": "#F4F2EE",
    "brown": "#6D4C3D",
    "blue": "#3B5E82",
    "green": "#4A6B58",
    "red": "#8B2E36",
    "pink": "#D4A3A8",
    "gold": "#C5A059",
    "yellow": "#D9B45A",
}


def resolve_hex_color(hex_color: str | None, color_name: str = "") -> str:
    clean = str(hex_color or "").strip().lstrip("#")
    if len(clean) == 6 and all(ch in "0123456789abcdefABCDEF" for ch in clean):
        return f"#{clean.upper()}"
    lower = str(color_name or "").lower()
    for word, fallback in FALLBACK_COLOR_NAMES.items():
        if word in lower:
            return fallback
    return "#C8BFA8"


def parse_hex_color(hex_color: str) -> tuple[int, int, int]:
    clean = str(hex_color or "").strip().lstrip("#")
    if len(clean) != 6:
        raise ValueError(f"Expected 6-digit hex color, got {hex_color!r}")
    return (int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16))


def rgb_to_cie_lab(rgb_u8: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2LAB).astype(np.float32)
    lab[..., 0] *= 100.0 / 255.0
    lab[..., 1] -= 128.0
    lab[..., 2] -= 128.0
    return lab


def cie_lab_to_rgb(lab_f: np.ndarray) -> np.ndarray:
    out = np.empty_like(lab_f, dtype=np.float32)
    out[..., 0] = np.clip(lab_f[..., 0] * (255.0 / 100.0), 0.0, 255.0)
    out[..., 1] = np.clip(lab_f[..., 1] + 128.0, 0.0, 255.0)
    out[..., 2] = np.clip(lab_f[..., 2] + 128.0, 0.0, 255.0)
    return cv2.cvtColor(out.astype(np.uint8), cv2.COLOR_LAB2RGB)


def hex_to_cie_lab(hex_color: str) -> np.ndarray:
    r, g, b = parse_hex_color(hex_color)
    rgb = np.array([[[r, g, b]]], dtype=np.uint8)
    return rgb_to_cie_lab(rgb)[0, 0]


def guided_filter(guide_gray_f: np.ndarray, src_f: np.ndarray, radius: int = 10, eps: float = 2e-3) -> np.ndarray:
    k = (2 * radius + 1, 2 * radius + 1)
    mean_i = cv2.boxFilter(guide_gray_f, -1, k)
    mean_p = cv2.boxFilter(src_f, -1, k)
    mean_ip = cv2.boxFilter(guide_gray_f * src_f, -1, k)
    cov_ip = mean_ip - mean_i * mean_p
    mean_ii = cv2.boxFilter(guide_gray_f * guide_gray_f, -1, k)
    var_i = mean_ii - mean_i * mean_i
    a = cov_ip / (var_i + eps)
    b = mean_p - a * mean_i
    mean_a = cv2.boxFilter(a, -1, k)
    mean_b = cv2.boxFilter(b, -1, k)
    return np.clip(mean_a * guide_gray_f + mean_b, 0.0, 1.0)


def target_label_ids(id2label: dict[int | str, str], category: str = "") -> set[int]:
    wanted = CATEGORY_LABELS.get(category.lower().strip(), DEFAULT_FURNITURE_LABELS)
    matched: set[int] = set()
    for raw_id, raw_name in id2label.items():
        name = str(raw_name).lower().strip()
        # Match whole comma-separated synonyms inside ADE20K label names
        tokens = [part.strip() for part in name.split(",")]
        if any(w == tok or w in tok.split() for tok in tokens for w in wanted):
            matched.add(int(raw_id))
    return matched


class SemanticSegmenter:
    """Lazy-loads Mask2Former / SegFormer ADE20K once per worker run."""

    def __init__(self, model_id: str = DEFAULT_SEG_MODEL):
        self.model_id = model_id
        self.processor = None
        self.model = None

    def _ensure_loaded(self) -> None:
        if self.model is not None:
            return
        import torch
        from transformers import (
            AutoImageProcessor,
            AutoModelForSemanticSegmentation,
            Mask2FormerForUniversalSegmentation,
        )

        torch.set_num_threads(max(1, min(4, os.cpu_count() or 2)))
        self.processor = AutoImageProcessor.from_pretrained(self.model_id)
        if "mask2former" in self.model_id.lower():
            self.model = Mask2FormerForUniversalSegmentation.from_pretrained(self.model_id)
        else:
            self.model = AutoModelForSemanticSegmentation.from_pretrained(self.model_id)
        self.model.eval()

    def segment_furniture(self, rgb_u8: np.ndarray, category: str = "") -> np.ndarray:
        import torch

        self._ensure_loaded()
        pil_img = Image.fromarray(rgb_u8)
        inputs = self.processor(images=pil_img, return_tensors="pt")
        with torch.no_grad():
            outputs = self.model(**inputs)

        h, w = rgb_u8.shape[:2]
        if hasattr(self.processor, "post_process_semantic_segmentation"):
            seg_map = self.processor.post_process_semantic_segmentation(
                outputs, target_sizes=[(h, w)]
            )[0].cpu().numpy()
        else:
            logits = torch.nn.functional.interpolate(
                outputs.logits, size=(h, w), mode="bilinear", align_corners=False
            )
            seg_map = logits.argmax(dim=1)[0].cpu().numpy()

        ids = target_label_ids(self.model.config.id2label, category)
        mask = np.isin(seg_map, list(ids)).astype(np.float32)
        if float(mask.mean()) < 0.015:
            # Fallback to all general furniture classes if category-specific match was tiny
            broad_ids = target_label_ids(self.model.config.id2label, "")
            broad_mask = np.isin(seg_map, list(broad_ids)).astype(np.float32)
            if float(broad_mask.mean()) > float(mask.mean()):
                mask = broad_mask
        return mask


def grabcut_foreground_mask(rgb_u8: np.ndarray) -> np.ndarray:
    """Fallback center-prior foreground segmentation when neural weights are unavailable."""
    h, w = rgb_u8.shape[:2]
    size = 384
    small = cv2.resize(rgb_u8, (size, size), interpolation=cv2.INTER_AREA)
    rect = (int(0.06 * size), int(0.18 * size), int(0.88 * size), int(0.68 * size))
    sm_mask = np.zeros((size, size), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(small, sm_mask, rect, bgd, fgd, 4, cv2.GC_INIT_WITH_RECT)
    fg = np.where((sm_mask == 1) | (sm_mask == 3), 1.0, 0.0).astype(np.float32)
    return cv2.resize(fg, (w, h), interpolation=cv2.INTER_LINEAR)


def extract_coarse_mask(
    rgb_u8: np.ndarray,
    category: str = "",
    mask_mode: str = "auto",
    segmenter: SemanticSegmenter | None = None,
) -> np.ndarray:
    mode = mask_mode.lower().strip()
    if mode in ("auto", "mask2former", "segformer", "semantic"):
        if segmenter is None:
            segmenter = SemanticSegmenter()
        mask = segmenter.segment_furniture(rgb_u8, category=category)
        if float((mask > 0.5).mean()) >= 0.015:
            return mask
        # Small decor pieces (candle holders, trays) sometimes miss ADE20K furniture labels
        return grabcut_foreground_mask(rgb_u8)
    if mode == "grabcut":
        return grabcut_foreground_mask(rgb_u8)
    raise ValueError(f"Unsupported mask mode: {mask_mode}")


def refine_upholstery_mask(
    rgb_u8: np.ndarray,
    coarse_fg: np.ndarray,
    category: str = "",
) -> np.ndarray:
    """
    Isolates primary upholstery inside the furniture mask using weighted CIELAB
    clustering + edge-aware Guided Filter refinement so contrasting wood legs,
    black trim, and dark accent cushions remain untouched.
    """
    fg_bool = coarse_fg > 0.5
    if int(fg_bool.sum()) < 100:
        return np.clip(coarse_fg, 0.0, 1.0).astype(np.float32)

    lab = rgb_to_cie_lab(rgb_u8)
    h, w = rgb_u8.shape[:2]

    # Erode slightly to avoid background edge contamination when sampling upholstery
    erode_k = max(3, int(min(h, w) * 0.01) | 1)
    core_fg = cv2.erode((coarse_fg > 0.5).astype(np.uint8), np.ones((erode_k, erode_k), np.uint8)) > 0
    if int(core_fg.sum()) < 120:
        core_fg = fg_bool

    # For beds, sample outer perimeter (headboard/footboard) where upholstery lives
    # rather than the patterned center duvet.
    sample_mask = core_fg
    if category.lower().strip() in ("bedroom", "kids-and-teens"):
        inner_k = max(15, int(min(h, w) * 0.09) | 1)
        inner = cv2.erode(core_fg.astype(np.uint8), np.ones((inner_k, inner_k), np.uint8)) > 0
        shell = core_fg & (~inner)
        if int(shell.sum()) >= 200:
            sample_mask = shell

    pts = lab[sample_mask]
    if len(pts) > 15000:
        idx = np.linspace(0, len(pts) - 1, 15000, dtype=int)
        pts = pts[idx]

    feat = pts.copy()
    feat[:, 0] *= 0.65
    feat[:, 1] *= 1.65
    feat[:, 2] *= 1.65
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)
    k = min(3, len(feat))
    _, labels, centers = cv2.kmeans(feat.astype(np.float32), k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k)

    # Prefer the largest non-black cluster unless the whole piece is dark
    order = np.argsort(-counts)
    dom_idx = int(order[0])
    for ci in order:
        if (centers[ci, 0] / 0.65) > 22.0:
            dom_idx = int(ci)
            break

    dom_lab = np.array(
        [centers[dom_idx, 0] / 0.65, centers[dom_idx, 1] / 1.65, centers[dom_idx, 2] / 1.65],
        dtype=np.float32,
    )

    cluster_pts = pts[labels.flatten() == dom_idx]
    if len(cluster_pts) > 20:
        ab_spread = float(
            np.percentile(
                np.sqrt((cluster_pts[:, 1] - dom_lab[1]) ** 2 + (cluster_pts[:, 2] - dom_lab[2]) ** 2),
                85,
            )
        )
    else:
        ab_spread = 6.0

    chroma_dist = np.sqrt((lab[..., 1] - dom_lab[1]) ** 2 + (lab[..., 2] - dom_lab[2]) ** 2)
    chroma_tol = max(7.5, min(14.5, ab_spread * 1.45 + 3.5))
    chroma_w = np.exp(-0.5 * (np.maximum(0.0, chroma_dist - 4.0) / chroma_tol) ** 2)

    # Protect dark walnut/black accent cushions & legs when dominant fabric is mid/light
    if dom_lab[0] > 52.0:
        min_l = dom_lab[0] * 0.44
        dark_w = np.clip((lab[..., 0] - (min_l - 8.0)) / 10.0, 0.0, 1.0)
    else:
        dark_w = 1.0

    # For beds, guard high-contrast printed duvets whose lightness is bright white
    # while frame upholstery is colored.
    if category.lower().strip() in ("bedroom", "kids-and-teens") and dom_lab[0] < 76.0:
        bright_duvet = np.where(lab[..., 0] > max(84.0, dom_lab[0] + 15.0), 0.0, 1.0)
        dark_w = dark_w * bright_duvet

    raw_mask = np.clip(coarse_fg * chroma_w * dark_w, 0.0, 1.0).astype(np.float32)

    gray_f = cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    smooth = guided_filter(gray_f, raw_mask, radius=10, eps=2e-3)
    # Clamp strictly inside the semantic furniture mask so recoloring never bleeds onto rugs or walls.
    outer_bound = np.clip(cv2.GaussianBlur(coarse_fg.astype(np.float32), (0, 0), 1.0), 0.0, 1.0)

    alpha = np.clip((smooth - 0.16) / 0.64, 0.0, 1.0) * outer_bound
    return np.clip(alpha, 0.0, 1.0).astype(np.float32)


def recolor_cie_lab(
    rgb_u8: np.ndarray,
    alpha: np.ndarray,
    hex_color: str,
    fabric: str = "",
) -> np.ndarray:
    """
    Transfers target swatch color & fabric tactile response onto the masked
    upholstery while preserving relative shading, creases, and studio lighting.
    """
    upholstery = alpha > 0.55
    if int(upholstery.sum()) < 40:
        return rgb_u8

    lab = rgb_to_cie_lab(rgb_u8)
    target_lab = hex_to_cie_lab(hex_color)
    t_l, t_a, t_b = float(target_lab[0]), float(target_lab[1]), float(target_lab[2])

    src_l = lab[..., 0]
    l_med = float(np.percentile(src_l[upholstery], 55))
    l_iqr = max(6.0, float(np.percentile(src_l[upholstery], 90) - np.percentile(src_l[upholstery], 10)))
    delta_l = src_l - l_med

    if t_l < 45.0:
        scale = float(np.clip(0.55 + (t_l / 90.0), 0.45, 0.90))
    elif t_l > 82.0:
        scale = 0.72
    else:
        scale = 0.85

    new_l = np.clip(t_l + delta_l * scale, 4.0, 98.0)
    blur_l = cv2.GaussianBlur(src_l, (0, 0), 3.0)
    tex = src_l - blur_l

    fab = (fabric or "").lower().strip()
    if "velvet" in fab:
        sheen = np.clip((delta_l / max(10.0, l_iqr)) * 4.5, -2.5, 4.5)
        new_l = np.clip(new_l + sheen + tex * 0.75, 4.0, 98.0)
        chroma_boost = 1.06
    elif "suede" in fab:
        new_l = np.clip(new_l + 1.5 + tex * 0.60, 6.0, 97.0)
        chroma_boost = 0.94
    elif "boucle" in fab or "chenille" in fab or "feather" in fab:
        new_l = np.clip(new_l + tex * 1.15, 4.0, 98.0)
        chroma_boost = 1.00
    else:
        new_l = np.clip(new_l + tex * 0.90, 4.0, 98.0)
        chroma_boost = 1.00

    chroma_att = np.clip(1.0 - np.maximum(0.0, new_l - 88.0) / 14.0, 0.35, 1.0)
    chroma_att *= np.clip(new_l / 22.0, 0.55, 1.0)
    new_a = t_a * chroma_boost * chroma_att
    new_b = t_b * chroma_boost * chroma_att

    recolored_lab = np.stack([new_l, new_a, new_b], axis=-1)
    recolored_rgb = cie_lab_to_rgb(recolored_lab).astype(np.float32)
    orig_rgb = rgb_u8.astype(np.float32)
    a3 = alpha[..., None]
    blended = orig_rgb * (1.0 - a3) + recolored_rgb * a3
    return np.clip(blended, 0, 255).astype(np.uint8)


def save_image(rgb_u8: np.ndarray, output_path: str, output_format: str = "webp", quality: int = 88) -> int:
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(f"{out.name}.tmp-{os.getpid()}")
    fmt = output_format.upper()
    if fmt == "JPG":
        fmt = "JPEG"
    save_kwargs: dict[str, Any] = {}
    if fmt == "WEBP":
        save_kwargs = {"quality": quality, "method": 4}
    elif fmt == "JPEG":
        save_kwargs = {"quality": quality}
    Image.fromarray(rgb_u8).save(tmp, format=fmt, **save_kwargs)
    os.replace(tmp, out)
    return out.stat().st_size


def load_or_compute_mask(
    source_path: str,
    rgb_u8: np.ndarray,
    category: str,
    mask_mode: str,
    mask_cache_dir: str | None,
    segmenter: SemanticSegmenter | None,
) -> np.ndarray:
    if mask_cache_dir:
        digest = hashlib.sha256(f"{source_path}|{category}|{mask_mode}".encode("utf-8")).hexdigest()[:16]
        cache_file = Path(mask_cache_dir) / f"{digest}.png"
        if cache_file.is_file():
            cached = np.array(Image.open(cache_file).convert("L"), dtype=np.float32) / 255.0
            if cached.shape[:2] == rgb_u8.shape[:2]:
                return cached

    coarse = extract_coarse_mask(rgb_u8, category=category, mask_mode=mask_mode, segmenter=segmenter)
    alpha = refine_upholstery_mask(rgb_u8, coarse, category=category)

    if mask_cache_dir:
        digest = hashlib.sha256(f"{source_path}|{category}|{mask_mode}".encode("utf-8")).hexdigest()[:16]
        cache_file = Path(mask_cache_dir) / f"{digest}.png"
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(np.clip(alpha * 255.0, 0, 255).astype(np.uint8), mode="L").save(cache_file)

    return alpha


def process_jobs(
    jobs: list[dict[str, Any]],
    seg_model: str = DEFAULT_SEG_MODEL,
    mask_mode: str = "auto",
    mask_cache_dir: str | None = None,
    output_format: str = "webp",
) -> list[dict[str, Any]]:
    segmenter = SemanticSegmenter(seg_model) if mask_mode in ("auto", "mask2former", "segformer", "semantic") else None
    results: list[dict[str, Any]] = []

    # Group by source image so each product photo is segmented only once across all swatches.
    by_source: dict[str, list[dict[str, Any]]] = {}
    for job in jobs:
        by_source.setdefault(str(job["sourcePath"]), []).append(job)

    for source_path, group in by_source.items():
        rgb_u8: np.ndarray | None = None
        alpha_by_cat: dict[str, np.ndarray] = {}
        try:
            rgb_u8 = np.array(Image.open(source_path).convert("RGB"))
        except Exception as exc:
            for job in group:
                results.append({"id": job.get("id"), "ok": False, "error": f"Failed to open source {source_path}: {exc}"})
            continue

        for job in group:
            try:
                cat = str(job.get("category") or "")
                if cat not in alpha_by_cat:
                    alpha_by_cat[cat] = load_or_compute_mask(
                        source_path=source_path,
                        rgb_u8=rgb_u8,
                        category=cat,
                        mask_mode=mask_mode,
                        mask_cache_dir=mask_cache_dir,
                        segmenter=segmenter,
                    )
                alpha = alpha_by_cat[cat]
                resolved_hex = resolve_hex_color(job.get("hex"), str(job.get("colorName") or ""))
                recolored = recolor_cie_lab(
                    rgb_u8,
                    alpha=alpha,
                    hex_color=resolved_hex,
                    fabric=str(job.get("fabric") or ""),
                )
                fmt = str(job.get("outputFormat") or output_format)
                bytes_written = save_image(recolored, str(job["outputPath"]), output_format=fmt)
                results.append({"id": job.get("id"), "ok": True, "bytes": bytes_written})
            except Exception as exc:
                results.append({"id": job.get("id"), "ok": False, "error": str(exc)})

    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Zero-cost neural furniture segmentation + CIELAB recoloring")
    parser.add_argument("--jobs-json", help="JSON file of batch recolor jobs [{id, sourcePath, outputPath, hex, fabric, category}]")
    parser.add_argument("--input", help="Single input image path")
    parser.add_argument("--output", help="Single output image path")
    parser.add_argument("--hex", help="Target 6-digit hex color (e.g. #1B365D)")
    parser.add_argument("--color-name", default="", help="Optional color name fallback if --hex is omitted")
    parser.add_argument("--fabric", default="", help="Optional fabric name (velvet, chenille, suede, boucle)")
    parser.add_argument("--category", default="", help="Optional category slug (sofas, bedroom, household)")
    parser.add_argument("--seg-model", default=DEFAULT_SEG_MODEL, help="HuggingFace ADE20K segmentation model ID")
    parser.add_argument("--mask-mode", default="auto", choices=["auto", "mask2former", "segformer", "semantic", "grabcut"])
    parser.add_argument("--mask-cache-dir", default=".cache/color-variant-masks")
    parser.add_argument("--output-format", default="webp", choices=["webp", "png", "jpeg"])
    args = parser.parse_args(argv)

    if args.jobs_json:
        jobs = json.loads(Path(args.jobs_json).read_text(encoding="utf-8"))
        res = process_jobs(
            jobs,
            seg_model=args.seg_model,
            mask_mode=args.mask_mode,
            mask_cache_dir=args.mask_cache_dir,
            output_format=args.output_format,
        )
        print(json.dumps({"results": res}))
        return 1 if any(not item.get("ok") for item in res) else 0

    if args.input and args.output and (args.hex or args.color_name):
        res = process_jobs(
            [
                {
                    "id": "single",
                    "sourcePath": args.input,
                    "outputPath": args.output,
                    "hex": args.hex or "",
                    "colorName": args.color_name,
                    "fabric": args.fabric,
                    "category": args.category,
                    "outputFormat": args.output_format,
                }
            ],
            seg_model=args.seg_model,
            mask_mode=args.mask_mode,
            mask_cache_dir=args.mask_cache_dir,
            output_format=args.output_format,
        )
        print(json.dumps(res[0]))
        return 0 if res[0].get("ok") else 1

    parser.error("Provide --jobs-json OR (--input, --output, and --hex/--color-name)")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
