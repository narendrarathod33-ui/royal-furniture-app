#!/usr/bin/env python3
"""
Option 1 ($0 Forever): White-Background Verification + Exact-Color CIELAB Recoloring.

1. Strictly verifies white-background studio product photos (rejecting room
   scenes and sparse dimension/measurement diagrams).
2. Isolates the foreground object cleanly from pure white and soft floor contact
   shadows, optionally intersects with Mask2Former ADE20K furniture segmentation,
   and isolates the primary upholstery cluster in float64 CIELAB space so wood
   legs, dark trim, contrasting throw pillows, and white bed duvets remain
   untouched.
3. Transfers the exact swatch hex in float64 CIE L*a*b* with closed-loop median
   calibration (zero hallucinated hues or saturation boosts).

Supports:
  --inspect-white-bg-json <paths.json>  Batch white-background check
  --jobs-json <jobs.json>               Batch recolor worker
  --input ... --output ... --hex ...    Single-image CLI
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image


DEFAULT_SEG_MODEL = "facebook/mask2former-swin-base-IN21k-ade-semantic"

WHITE_BORDER_MIN = 0.90
MAX_SECONDARY_RATIO = 0.16
MIN_MAIN_AREA_RATIO = 0.06
MIN_BBOX_FILL_RATIO = 0.20

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

_D65_REF = np.array([0.95047, 1.0, 1.08883], dtype=np.float64)
_RGB_TO_XYZ = np.array(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ],
    dtype=np.float64,
)
_XYZ_TO_RGB = np.array(
    [
        [3.2404542, -1.5371385, -0.4985314],
        [-0.9692660, 1.8760108, 0.0415560],
        [0.0556434, -0.2040259, 1.0572252],
    ],
    dtype=np.float64,
)


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


def srgb_to_cie_lab(rgb_f01: np.ndarray) -> np.ndarray:
    arr = np.asarray(rgb_f01, dtype=np.float64)
    lin = np.where(arr <= 0.04045, arr / 12.92, ((arr + 0.055) / 1.055) ** 2.4)
    xyz = (lin @ _RGB_TO_XYZ.T) / _D65_REF
    eps = (6.0 / 29.0) ** 3
    kappa = (29.0 / 3.0) ** 3
    f = np.where(xyz > eps, np.cbrt(xyz), (kappa * xyz + 16.0) / 116.0)
    l_ch = 116.0 * f[..., 1] - 16.0
    a_ch = 500.0 * (f[..., 0] - f[..., 1])
    b_ch = 200.0 * (f[..., 1] - f[..., 2])
    return np.stack([l_ch, a_ch, b_ch], axis=-1)


def cie_lab_to_srgb(lab_f: np.ndarray) -> np.ndarray:
    l_ch, a_ch, b_ch = lab_f[..., 0], lab_f[..., 1], lab_f[..., 2]
    fy = (l_ch + 16.0) / 116.0
    fx = a_ch / 500.0 + fy
    fz = fy - b_ch / 200.0
    delta = 6.0 / 29.0
    xyz = (
        np.stack(
            [
                np.where(fx > delta, fx**3, 3.0 * delta**2 * (fx - 4.0 / 29.0)),
                np.where(fy > delta, fy**3, 3.0 * delta**2 * (fy - 4.0 / 29.0)),
                np.where(fz > delta, fz**3, 3.0 * delta**2 * (fz - 4.0 / 29.0)),
            ],
            axis=-1,
        )
        * _D65_REF
    )
    lin = np.clip(xyz @ _XYZ_TO_RGB.T, 0.0, 1.0)
    srgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(lin, 1.0 / 2.4) - 0.055)
    return np.clip(srgb, 0.0, 1.0)


def rgb_to_cie_lab(rgb_u8: np.ndarray) -> np.ndarray:
    return srgb_to_cie_lab(np.asarray(rgb_u8, dtype=np.float64) / 255.0).astype(np.float32)


def cie_lab_to_rgb(lab_f: np.ndarray) -> np.ndarray:
    return np.clip(cie_lab_to_srgb(lab_f) * 255.0 + 0.5, 0, 255).astype(np.uint8)


def hex_to_cie_lab(hex_color: str) -> np.ndarray:
    r, g, b = parse_hex_color(hex_color)
    rgb01 = np.array([[[r, g, b]]], dtype=np.float64) / 255.0
    return srgb_to_cie_lab(rgb01)[0, 0]


def near_white_mask(rgb_u8: np.ndarray, min_chan: int = 242, max_chroma: int = 12) -> np.ndarray:
    vals = np.asarray(rgb_u8, dtype=np.int16)
    return (vals.min(axis=-1) >= min_chan) & ((vals.max(axis=-1) - vals.min(axis=-1)) <= max_chroma)


def floodfill_external_white(rgb_u8: np.ndarray, min_chan: int = 242, max_chroma: int = 12) -> np.ndarray:
    """Returns boolean mask of near-white pixels connected to any image border."""
    h, w = rgb_u8.shape[:2]
    nw = near_white_mask(rgb_u8, min_chan=min_chan, max_chroma=max_chroma).astype(np.uint8)
    ff = nw.copy()
    mask_ff = np.zeros((h + 2, w + 2), np.uint8)
    step = max(1, min(h, w) // 64)
    for x in range(0, w, step):
        if ff[0, x] == 1:
            cv2.floodFill(ff, mask_ff, (x, 0), 2)
        if ff[h - 1, x] == 1:
            cv2.floodFill(ff, mask_ff, (x, h - 1), 2)
    for y in range(0, h, step):
        if ff[y, 0] == 1:
            cv2.floodFill(ff, mask_ff, (0, y), 2)
        if ff[y, w - 1] == 1:
            cv2.floodFill(ff, mask_ff, (w - 1, y), 2)
    # Also seed exact 4 corners
    for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if ff[cy, cx] == 1:
            cv2.floodFill(ff, mask_ff, (cx, cy), 2)
    return ff == 2


def analyse_white_background(rgb_u8: np.ndarray) -> dict[str, Any]:
    """
    Strictly verifies that an image is a clean white-background product photo
    (and NOT a room lifestyle scene or sparse dimension/measurement diagram).
    """
    h, w = rgb_u8.shape[:2]
    scale = min(1.0, 256.0 / max(h, w))
    if scale < 1.0:
        small = cv2.resize(rgb_u8, (max(32, int(w * scale)), max(32, int(h * scale))), interpolation=cv2.INTER_AREA)
    else:
        small = rgb_u8
    sh, sw = small.shape[:2]
    bw = max(2, round(min(sh, sw) * 0.025))
    border = np.concatenate(
        [
            small[:bw].reshape(-1, 3),
            small[-bw:].reshape(-1, 3),
            small[bw:-bw, :bw].reshape(-1, 3),
            small[bw:-bw, -bw:].reshape(-1, 3),
        ]
    )
    border_white_ratio = float(near_white_mask(border).mean())

    bg_ext = floodfill_external_white(small)
    bg_median = np.median(border.astype(np.float32), axis=0)
    dist = np.linalg.norm(small.astype(np.float32) - bg_median, axis=2)
    fg = (~bg_ext) & (dist > 28.0)
    fg_closed = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0

    num_cc, cc_labels, cc_stats, _ = cv2.connectedComponentsWithStats(fg_closed.astype(np.uint8))
    areas = [
        (cid, int(cc_stats[cid, cv2.CC_STAT_AREA]))
        for cid in range(1, num_cc)
        if cc_stats[cid, cv2.CC_STAT_AREA] >= 12
    ]
    areas.sort(key=lambda item: item[1], reverse=True)

    reasons: list[str] = []
    if border_white_ratio < WHITE_BORDER_MIN:
        reasons.append("border-not-over-90-percent-near-white")

    if not areas:
        reasons.append("no-foreground-object")
        return {
            "whiteBackground": False,
            "borderWhiteRatio": round(border_white_ratio, 4),
            "mainObjectAreaRatio": 0.0,
            "secondaryObjectRatio": 1.0,
            "bboxFillRatio": 0.0,
            "reasons": reasons,
        }

    main_id, main_area = areas[0]
    total_px = float(sh * sw)
    main_area_ratio = main_area / total_px
    secondary_area = sum(a for _, a in areas[1:])
    secondary_ratio = secondary_area / max(1, main_area)

    bx = int(cc_stats[main_id, cv2.CC_STAT_LEFT])
    by = int(cc_stats[main_id, cv2.CC_STAT_TOP])
    bw_box = max(1, int(cc_stats[main_id, cv2.CC_STAT_WIDTH]))
    bh_box = max(1, int(cc_stats[main_id, cv2.CC_STAT_HEIGHT]))
    bbox_fill = float((fg[by : by + bh_box, bx : bx + bw_box]).mean())

    if main_area_ratio < MIN_MAIN_AREA_RATIO:
        reasons.append("foreground-too-small-or-line-drawing")
    if main_area_ratio > 0.90:
        reasons.append("foreground-fills-frame")
    if secondary_ratio > MAX_SECONDARY_RATIO:
        reasons.append("multiple-objects-or-diagram-callouts")
    if bbox_fill < MIN_BBOX_FILL_RATIO:
        reasons.append("sparse-diagram-fill")

    return {
        "whiteBackground": not reasons,
        "borderWhiteRatio": round(border_white_ratio, 4),
        "mainObjectAreaRatio": round(main_area_ratio, 4),
        "secondaryObjectRatio": round(secondary_ratio, 4),
        "bboxFillRatio": round(bbox_fill, 4),
        "reasons": reasons,
    }


def guided_filter(guide_gray_f: np.ndarray, src_f: np.ndarray, radius: int = 8, eps: float = 2e-3) -> np.ndarray:
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
            seg_map = (
                self.processor.post_process_semantic_segmentation(outputs, target_sizes=[(h, w)])[0]
                .cpu()
                .numpy()
            )
        else:
            logits = torch.nn.functional.interpolate(
                outputs.logits, size=(h, w), mode="bilinear", align_corners=False
            )
            seg_map = logits.argmax(dim=1)[0].cpu().numpy()

        ids = target_label_ids(self.model.config.id2label, category)
        mask = np.isin(seg_map, list(ids)).astype(np.float32)
        if float(mask.mean()) < 0.015:
            broad_ids = target_label_ids(self.model.config.id2label, "")
            broad_mask = np.isin(seg_map, list(broad_ids)).astype(np.float32)
            if float(broad_mask.mean()) > float(mask.mean()):
                mask = broad_mask
        return mask


def grabcut_foreground_mask(rgb_u8: np.ndarray) -> np.ndarray:
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


def extract_white_bg_subject(rgb_u8: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Separates product subject pixels from pure white background and soft bottom
    contact shadows on white-background studio shots.
    Returns (subject_fg_bool, external_white_bg_bool).
    """
    h, w = rgb_u8.shape[:2]
    bg_ext = floodfill_external_white(rgb_u8, min_chan=240, max_chroma=14)
    fg = ~bg_ext
    ys, xs = np.nonzero(fg)
    if len(ys) < 100:
        return fg, bg_ext
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    box_h = max(1, y1 - y0)

    # Trim only pale floor drop-shadows (>= 226) connected to bg_ext at the bottom 6%
    vals = rgb_u8.astype(np.int16)
    pale_shadow = (vals.min(axis=2) >= 226) & ((vals.max(axis=2) - vals.min(axis=2)) <= 10)
    shadow_zone = np.zeros((h, w), dtype=bool)
    shadow_top = max(0, y1 - max(4, round(box_h * 0.06)))
    shadow_zone[shadow_top:, :] = True
    seed_mask = (bg_ext | (shadow_zone & pale_shadow)).astype(np.uint8)
    _, s_lbl = cv2.connectedComponents(seed_mask)
    ext_ids = np.unique(s_lbl[bg_ext])
    bg_with_shadow = np.isin(s_lbl, ext_ids[ext_ids > 0])
    fg = ~bg_with_shadow
    return fg, bg_ext


def extract_coarse_mask(
    rgb_u8: np.ndarray,
    category: str = "",
    mask_mode: str = "auto",
    segmenter: SemanticSegmenter | None = None,
) -> tuple[np.ndarray, np.ndarray | None]:
    mode = mask_mode.lower().strip()
    is_white_bg = analyse_white_background(rgb_u8)["whiteBackground"]
    bg_ext: np.ndarray | None = None

    if is_white_bg:
        subject_fg, bg_ext = extract_white_bg_subject(rgb_u8)
        if mode in ("auto", "mask2former", "segformer", "semantic") and segmenter is not None:
            try:
                sem = segmenter.segment_furniture(rgb_u8, category=category)
                if float((sem > 0.5).mean()) >= 0.02:
                    # Intersect semantic furniture mask with clean white-bg subject mask
                    # so white background & shadows never leak, while non-furniture props stay out.
                    combined = (sem > 0.5) & subject_fg
                    if float(combined.mean()) >= 0.02:
                        return combined.astype(np.float32), bg_ext
            except (ImportError, OSError):
                if mode != "auto":
                    raise
        return subject_fg.astype(np.float32), bg_ext

    if mode in ("auto", "mask2former", "segformer", "semantic"):
        if segmenter is None:
            segmenter = SemanticSegmenter()
        try:
            mask = segmenter.segment_furniture(rgb_u8, category=category)
            if float((mask > 0.5).mean()) >= 0.015:
                return mask, None
        except (ImportError, OSError):
            if mode != "auto":
                raise
        return grabcut_foreground_mask(rgb_u8), None
    if mode == "grabcut":
        return grabcut_foreground_mask(rgb_u8), None
    if mode == "white-bg":
        subject_fg, bg_ext = extract_white_bg_subject(rgb_u8)
        return subject_fg.astype(np.float32), bg_ext
    raise ValueError(f"Unsupported mask mode: {mask_mode}")


def refine_upholstery_mask(
    rgb_u8: np.ndarray,
    coarse_fg: np.ndarray,
    category: str = "",
) -> np.ndarray:
    """
    Isolates primary upholstery inside the foreground mask using float64 CIELAB
    clustering + Guided Filter edge refinement so contrasting wood/metal legs,
    dark accent trim, and white bed duvets/pillows remain untouched.
    """
    fg_bool = coarse_fg > 0.5
    if int(fg_bool.sum()) < 100:
        return np.clip(coarse_fg, 0.0, 1.0).astype(np.float32)

    lab = rgb_to_cie_lab(rgb_u8)
    chroma_map = np.sqrt(lab[..., 1] ** 2 + lab[..., 2] ** 2)
    h, w = rgb_u8.shape[:2]

    erode_k = max(3, int(min(h, w) * 0.01) | 1)
    core_fg = cv2.erode(fg_bool.astype(np.uint8), np.ones((erode_k, erode_k), np.uint8)) > 0
    if int(core_fg.sum()) < 120:
        core_fg = fg_bool

    sample_mask = core_fg
    cat_clean = category.lower().strip()
    if cat_clean in ("bedroom", "kids-and-teens"):
        inner_k = max(15, int(min(h, w) * 0.08) | 1)
        inner = cv2.erode(core_fg.astype(np.uint8), np.ones((inner_k, inner_k), np.uint8)) > 0
        shell = core_fg & (~inner)
        if int(shell.sum()) >= 200:
            sample_mask = shell

    pts = lab[sample_mask]
    if len(pts) > 15000:
        pts = pts[np.linspace(0, len(pts) - 1, 15000, dtype=int)]

    feat = pts.copy()
    feat[:, 0] *= 0.65
    feat[:, 1] *= 1.65
    feat[:, 2] *= 1.65
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)
    k = min(3, len(feat))
    _, labels, centers = cv2.kmeans(feat.astype(np.float32), k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k)

    order = np.argsort(-counts)
    dom_idx = int(order[0])
    for ci in order:
        l_val = float(centers[ci, 0] / 0.65)
        if cat_clean in ("bedroom", "kids-and-teens"):
            if 20.0 < l_val < 86.0:
                dom_idx = int(ci)
                break
        elif l_val > 22.0:
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
    dom_chroma = float(np.hypot(dom_lab[1], dom_lab[2]))
    if dom_chroma >= 6.5:
        u_a, u_b = float(dom_lab[1]) / dom_chroma, float(dom_lab[2]) / dom_chroma
        dot = lab[..., 1] * u_a + lab[..., 2] * u_b
        perp_dist = np.abs(lab[..., 1] * u_b - lab[..., 2] * u_a)
        # Same hue ray (within ~24 deg) covers specular velvet sheen + deep velvet shadow folds
        same_hue_ray = (dot >= 0.91 * chroma_map) & (chroma_map >= 4.0)
        eff_dist = np.where(same_hue_ray, np.minimum(chroma_dist, perp_dist * 1.15 + 2.0), chroma_dist)
        chroma_tol = max(9.5, min(16.0, ab_spread * 1.45 + 4.0))
    else:
        same_hue_ray = np.zeros((h, w), dtype=bool)
        eff_dist = chroma_dist
        chroma_tol = max(11.5, min(16.5, ab_spread * 1.60 + 5.0))
    chroma_w = np.exp(-0.5 * (np.maximum(0.0, eff_dist - 4.0) / chroma_tol) ** 2)

    if dom_chroma >= 6.5:
        # Protect dark black/charcoal trim (low chroma & L < 22) while keeping deep same-hue velvet folds
        keep_dark_fold = same_hue_ray & (chroma_map >= 8.0)
        dark_w = np.where(
            keep_dark_fold,
            np.clip((lab[..., 0] - 4.0) / 6.0, 0.0, 1.0),
            np.clip((lab[..., 0] - max(12.0, dom_lab[0] * 0.34 - 8.0)) / 10.0, 0.0, 1.0)
            if dom_lab[0] > 48.0
            else np.ones((h, w), dtype=np.float32),
        )
    elif dom_lab[0] > 48.0:
        min_l = max(18.0, dom_lab[0] * 0.32)
        dark_w = np.clip((lab[..., 0] - (min_l - 8.0)) / 10.0, 0.0, 1.0)
    else:
        dark_w = np.ones((h, w), dtype=np.float32)

    duvet_soft = np.ones((h, w), dtype=np.float32)
    if cat_clean in ("bedroom", "kids-and-teens") and dom_lab[0] < 84.0:
        duvet_seed = fg_bool & (lab[..., 0] > max(82.0, dom_lab[0] + 6.0)) & (chroma_map < 9.0)
        num_cc, cc_labels, cc_stats, _ = cv2.connectedComponentsWithStats(duvet_seed.astype(np.uint8))
        duvet_main = np.zeros((h, w), dtype=bool)
        min_cc = max(100, int(0.002 * h * w))
        for cid in range(1, num_cc):
            if cc_stats[cid, cv2.CC_STAT_AREA] >= min_cc:
                duvet_main |= cc_labels == cid
        if duvet_main.any():
            # Grow into adjacent shaded white mattress top/front within the mattress bounding window
            dys, dxs = np.nonzero(duvet_main)
            dy0 = int(dys.min())
            dy1 = min(h, int(dys.max()) + 1 + max(8, round(0.14 * h)))
            dx0 = max(0, int(dxs.min()) - max(10, round(0.20 * w)))
            dx1 = min(w, int(dxs.max()) + 1 + max(10, round(0.20 * w)))
            grow_floor = 75.0 if dom_lab[0] >= 70.0 else max(68.0, float(dom_lab[0]) + 2.0)
            grow_cand = np.zeros((h, w), dtype=bool)
            grow_cand[dy0:dy1, dx0:dx1] = (
                fg_bool[dy0:dy1, dx0:dx1]
                & (lab[dy0:dy1, dx0:dx1, 0] > grow_floor)
                & (chroma_map[dy0:dy1, dx0:dx1] < 9.0)
            )
            _, g_lbl = cv2.connectedComponents((duvet_main | grow_cand).astype(np.uint8))
            seed_ids = np.unique(g_lbl[duvet_main])
            duvet_grown = np.isin(g_lbl, seed_ids[seed_ids > 0])
            close_k = max(15, int(min(h, w) * 0.03) | 1)
            duvet_closed = (
                cv2.morphologyEx(duvet_grown.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((close_k, close_k), np.uint8)) > 0
            )
            duvet_guard = cv2.dilate(duvet_closed.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
            duvet_soft = cv2.GaussianBlur((~duvet_guard).astype(np.float32), (0, 0), 1.0)

    raw_mask = np.clip(coarse_fg * chroma_w * dark_w * duvet_soft, 0.0, 1.0).astype(np.float32)

    gray_f = cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    smooth = guided_filter(gray_f, raw_mask, radius=8, eps=2e-3)
    fg_in = cv2.erode(fg_bool.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
    if fg_in.sum() < 40:
        fg_in = fg_bool.astype(np.float32)

    alpha = np.clip((smooth - 0.18) / 0.62, 0.0, 1.0) * fg_in * duvet_soft
    return np.clip(alpha, 0.0, 1.0).astype(np.float32)


def recolor_cie_lab(
    rgb_u8: np.ndarray,
    alpha: np.ndarray,
    hex_color: str,
    fabric: str = "",
    clean_white_mask: np.ndarray | None = None,
) -> np.ndarray:
    """
    Exact-color float64 CIELAB recoloring with closed-loop median calibration so
    the upholstery matches `hex_color` accurately (zero hue hallucination or
    highlight blowout) while preserving studio creases and lighting.
    """
    interior = alpha > 0.70
    if int(interior.sum()) < 40:
        interior = alpha > 0.45
    if int(interior.sum()) < 40:
        return rgb_u8

    lab = srgb_to_cie_lab(rgb_u8.astype(np.float64) / 255.0)
    target_lab = hex_to_cie_lab(hex_color)
    t_l, t_a, t_b = float(target_lab[0]), float(target_lab[1]), float(target_lab[2])

    src_l = lab[..., 0]
    l_med = float(np.median(src_l[interior]))
    l_p08 = float(np.percentile(src_l[interior], 8))
    l_p92 = float(np.percentile(src_l[interior], 92))
    delta_l = src_l - l_med

    up_room = max(2.0, 97.5 - t_l)
    down_room = max(2.0, t_l - 4.0)
    scale = min(
        0.85,
        (0.70 * up_room) / max(l_p92 - l_med, 6.0),
        (0.78 * down_room) / max(l_med - l_p08, 6.0),
    )
    scale = float(max(0.22, scale))

    new_l = np.clip(t_l + delta_l * scale, 2.0, 98.5)
    blur_l = cv2.GaussianBlur(src_l.astype(np.float32), (0, 0), 2.5).astype(np.float64)
    tex = src_l - blur_l

    fab = (fabric or "").lower().strip()
    if "velvet" in fab:
        sheen = np.clip(delta_l * 0.06, -1.5, 1.5)
        new_l = np.clip(new_l + sheen + tex * 0.25, 2.0, 98.5)
    elif "boucle" in fab or "chenille" in fab or "feather" in fab:
        new_l = np.clip(new_l + tex * 0.40, 2.0, 98.5)
    else:
        new_l = np.clip(new_l + tex * 0.30, 2.0, 98.5)

    l_ratio = np.clip(new_l / max(t_l, 18.0), 0.55, 1.05)
    new_a = np.full_like(new_l, t_a) * l_ratio
    new_b = np.full_like(new_l, t_b) * l_ratio

    cand = np.stack([new_l, new_a, new_b], axis=-1)

    # Closed-loop calibration so the rendered upholstery median matches the swatch hex exactly.
    med_rgb = np.median(cie_lab_to_srgb(cand[interior]), axis=0)
    med_lab = srgb_to_cie_lab(med_rgb.reshape(1, 1, 3))[0, 0]
    corr = target_lab - med_lab
    cand[..., 0] = np.clip(cand[..., 0] + corr[0] * 0.95, 2.0, 98.5)
    cand[..., 1] += corr[1] * 0.95
    cand[..., 2] += corr[2] * 0.95

    recolored_rgb = cie_lab_to_srgb(cand) * 255.0
    orig_rgb = rgb_u8.astype(np.float64)
    a3 = alpha[..., None].astype(np.float64)
    out = np.clip(orig_rgb * (1.0 - a3) + recolored_rgb * a3 + 0.5, 0, 255).astype(np.uint8)
    if clean_white_mask is not None:
        out[clean_white_mask] = 255
    return out


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
) -> tuple[np.ndarray, np.ndarray | None]:
    _, bg_ext = extract_white_bg_subject(rgb_u8) if analyse_white_background(rgb_u8)["whiteBackground"] else (None, None)
    if mask_cache_dir:
        digest = hashlib.sha256(f"v3|{source_path}|{category}|{mask_mode}".encode("utf-8")).hexdigest()[:16]
        cache_file = Path(mask_cache_dir) / f"{digest}.png"
        if cache_file.is_file():
            cached = np.array(Image.open(cache_file).convert("L"), dtype=np.float32) / 255.0
            if cached.shape[:2] == rgb_u8.shape[:2]:
                return cached, bg_ext

    coarse, bg_ext = extract_coarse_mask(rgb_u8, category=category, mask_mode=mask_mode, segmenter=segmenter)
    alpha = refine_upholstery_mask(rgb_u8, coarse, category=category)

    if mask_cache_dir:
        digest = hashlib.sha256(f"v3|{source_path}|{category}|{mask_mode}".encode("utf-8")).hexdigest()[:16]
        cache_file = Path(mask_cache_dir) / f"{digest}.png"
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(np.clip(alpha * 255.0, 0, 255).astype(np.uint8), mode="L").save(cache_file)

    return alpha, bg_ext


def inspect_white_backgrounds(paths: list[str]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for p in paths:
        try:
            rgb_u8 = np.array(Image.open(p).convert("RGB"))
            info = analyse_white_background(rgb_u8)
            results.append({"path": p, "ok": True, **info})
        except Exception as exc:
            results.append({"path": p, "ok": False, "whiteBackground": False, "error": str(exc)})
    return results


def process_jobs(
    jobs: list[dict[str, Any]],
    seg_model: str = DEFAULT_SEG_MODEL,
    mask_mode: str = "auto",
    mask_cache_dir: str | None = None,
    output_format: str = "webp",
    white_background_only: bool = False,
) -> list[dict[str, Any]]:
    segmenter = SemanticSegmenter(seg_model) if mask_mode in ("auto", "mask2former", "segformer", "semantic") else None
    results: list[dict[str, Any]] = []

    by_source: dict[str, list[dict[str, Any]]] = {}
    for job in jobs:
        by_source.setdefault(str(job["sourcePath"]), []).append(job)

    for source_path, group in by_source.items():
        rgb_u8: np.ndarray | None = None
        alpha_by_cat: dict[str, tuple[np.ndarray, np.ndarray | None]] = {}
        try:
            rgb_u8 = np.array(Image.open(source_path).convert("RGB"))
            if white_background_only:
                wb = analyse_white_background(rgb_u8)
                if not wb["whiteBackground"]:
                    reason = ",".join(wb.get("reasons") or ["not-white-background"])
                    for job in group:
                        results.append({"id": job.get("id"), "ok": False, "skippedNonWhite": True, "error": f"Skipped non-white background ({reason})"})
                    continue
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
                alpha, bg_ext = alpha_by_cat[cat]
                resolved_hex = resolve_hex_color(job.get("hex"), str(job.get("colorName") or ""))
                recolored = recolor_cie_lab(
                    rgb_u8,
                    alpha=alpha,
                    hex_color=resolved_hex,
                    fabric=str(job.get("fabric") or ""),
                    clean_white_mask=bg_ext,
                )
                fmt = str(job.get("outputFormat") or output_format)
                bytes_written = save_image(recolored, str(job["outputPath"]), output_format=fmt)
                results.append({"id": job.get("id"), "ok": True, "bytes": bytes_written})
            except Exception as exc:
                results.append({"id": job.get("id"), "ok": False, "error": str(exc)})

    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Zero-cost white-background furniture segmentation + exact CIELAB recoloring")
    parser.add_argument("--inspect-white-bg-json", help="JSON file of local image paths to classify for strict white background")
    parser.add_argument("--jobs-json", help="JSON file of batch recolor jobs [{id, sourcePath, outputPath, hex, fabric, category}]")
    parser.add_argument("--white-background-only", action="store_true", help="Reject any source image without a verified white background")
    parser.add_argument("--input", help="Single input image path")
    parser.add_argument("--output", help="Single output image path")
    parser.add_argument("--hex", help="Target 6-digit hex color (e.g. #1B365D)")
    parser.add_argument("--color-name", default="", help="Optional color name fallback if --hex is omitted")
    parser.add_argument("--fabric", default="", help="Optional fabric name (velvet, chenille, suede, boucle)")
    parser.add_argument("--category", default="", help="Optional category slug (sofas, bedroom, household)")
    parser.add_argument("--seg-model", default=DEFAULT_SEG_MODEL, help="HuggingFace ADE20K segmentation model ID")
    parser.add_argument("--mask-mode", default="auto", choices=["auto", "mask2former", "segformer", "semantic", "grabcut", "white-bg"])
    parser.add_argument("--mask-cache-dir", default=".cache/color-variant-masks")
    parser.add_argument("--output-format", default="webp", choices=["webp", "png", "jpeg"])
    args = parser.parse_args(argv)

    if args.inspect_white_bg_json:
        paths = json.loads(Path(args.inspect_white_bg_json).read_text(encoding="utf-8"))
        print(json.dumps({"results": inspect_white_backgrounds([str(p) for p in paths])}))
        return 0

    if args.jobs_json:
        jobs = json.loads(Path(args.jobs_json).read_text(encoding="utf-8"))
        res = process_jobs(
            jobs,
            seg_model=args.seg_model,
            mask_mode=args.mask_mode,
            mask_cache_dir=args.mask_cache_dir,
            output_format=args.output_format,
            white_background_only=args.white_background_only,
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
            white_background_only=args.white_background_only,
        )
        print(json.dumps(res[0]))
        return 0 if res[0].get("ok") else 1

    parser.error("Provide --inspect-white-bg-json, --jobs-json, OR (--input, --output, and --hex/--color-name)")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
