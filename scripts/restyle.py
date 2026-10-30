#!/usr/bin/env python3
"""
Headless Blender 5 material restyle pass for desk props.

Usage:
  "/Applications/Blender 2.app/Contents/MacOS/Blender" -b --python scripts/restyle.py -- in.glb out.glb mapping.json [--prop <name>]

For each material in the input glTF/GLB, looks up its target swatch from art/palette.json via mapping.json:
  - Tints and flattens base colour textures in perceptual Oklab space towards the swatch while keeping
    value structure (labels, wear, panel lines) and removing stray hues, sensor grain, and broad baked light.
  - Sets roughness/metalness to the swatch's band (or remaps an existing roughness texture into that band).
  - Keeps normal maps (and optional occlusion/emission), optionally drops or downscales maps.
  - Untextured materials take the swatch directly.
  - Preserves exact glTF node names, hierarchy, transforms, and material names, and runs deterministically.
"""

import json
import os
import re
import struct
import sys
import bpy
import numpy as np


# ── Colour math (sRGB <-> Linear <-> Oklab) ──────────────────────────────────────────────────

def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * (c ** (1.0 / 2.4)) - 0.055)


def hex_to_srgb(hex_str: str) -> np.ndarray:
    h = hex_str.lstrip("#")
    return np.array([int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)], dtype=np.float64) / 255.0


def srgb_to_oklab(srgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    lin = srgb_to_linear(srgb)
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_ = np.cbrt(np.maximum(l, 0.0))
    m_ = np.cbrt(np.maximum(m, 0.0))
    s_ = np.cbrt(np.maximum(s, 0.0))
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    b_ok = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return L, a, b_ok


def oklab_to_srgb(L: np.ndarray, a: np.ndarray, b_ok: np.ndarray) -> np.ndarray:
    l_ = L + 0.3963377774 * a + 0.2158037573 * b_ok
    m_ = L - 0.1055613458 * a - 0.0638541728 * b_ok
    s_ = L - 0.0894841775 * a - 1.2914855480 * b_ok
    l = np.maximum(l_, 0.0) ** 3
    m = np.maximum(m_, 0.0) ** 3
    s = np.maximum(s_, 0.0) ** 3
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    lin = np.stack([r, g, b], axis=-1)
    return linear_to_srgb(lin)


# ── Deterministic image resampling & filtering in NumPy ──────────────────────────────────────

def resize_array_bilinear(arr: np.ndarray, new_h: int, new_w: int) -> np.ndarray:
    """Deterministic area/bilinear image resize in pure NumPy (arr shape: H x W [x C])."""
    h, w = arr.shape[:2]
    if h == new_h and w == new_w:
        return arr
    # If downscaling by integer factor, box-filter first to prevent aliasing
    while h >= new_h * 2 and w >= new_w * 2 and h % 2 == 0 and w % 2 == 0:
        arr = 0.25 * (arr[0::2, 0::2] + arr[1::2, 0::2] + arr[0::2, 1::2] + arr[1::2, 1::2])
        h, w = arr.shape[:2]
    if h == new_h and w == new_w:
        return arr
    ys = (np.arange(new_h, dtype=np.float64) + 0.5) * (h / new_h) - 0.5
    xs = (np.arange(new_w, dtype=np.float64) + 0.5) * (w / new_w) - 0.5
    ys = np.clip(ys, 0.0, h - 1.0)
    xs = np.clip(xs, 0.0, w - 1.0)
    y0 = np.floor(ys).astype(np.int32)
    x0 = np.floor(xs).astype(np.int32)
    y1 = np.minimum(y0 + 1, h - 1)
    x1 = np.minimum(x0 + 1, w - 1)
    wy = (ys - y0).reshape((new_h, 1) + (1,) * (arr.ndim - 2))
    wx = (xs - x0).reshape((1, new_w) + (1,) * (arr.ndim - 2))
    top = arr[y0][:, x0] * (1.0 - wx) + arr[y0][:, x1] * wx
    bot = arr[y1][:, x0] * (1.0 - wx) + arr[y1][:, x1] * wx
    return top * (1.0 - wy) + bot * wy


def gaussian_blur_2d(arr: np.ndarray, sigma: float) -> np.ndarray:
    """Separable 2D Gaussian blur with edge padding."""
    if sigma <= 0.15:
        return arr.copy()
    radius = max(1, int(round(sigma * 3.0)))
    x = np.arange(-radius, radius + 1, dtype=np.float64)
    kernel = np.exp(-0.5 * (x / sigma) ** 2)
    kernel /= kernel.sum()

    # Blur along X (axis 1)
    padded_x = np.pad(arr, ((0, 0), (radius, radius)), mode="edge")
    out_x = np.zeros_like(arr, dtype=np.float64)
    for i, k in enumerate(kernel):
        out_x += k * padded_x[:, i : i + arr.shape[1]]

    # Blur along Y (axis 0)
    padded_y = np.pad(out_x, ((radius, radius), (0, 0)), mode="edge")
    out_y = np.zeros_like(arr, dtype=np.float64)
    for i, k in enumerate(kernel):
        out_y += k * padded_y[i : i + arr.shape[0], :]
    return out_y


def masked_blur(arr: np.ndarray, mask: np.ndarray, sigma: float) -> np.ndarray:
    """Normalized convolution so unused UV background pixels never bleed into UV islands."""
    h, w = arr.shape
    # For large sigma, compute on a downsampled grid for speed & smoothness
    if sigma > 6.0 and min(h, w) > 128:
        scale = min(8, min(h, w) // 64)
        if scale >= 2:
            sh, sw = max(16, h // scale), max(16, w // scale)
            small_arr = resize_array_bilinear(arr * mask, sh, sw)
            small_msk = resize_array_bilinear(mask, sh, sw)
            num = gaussian_blur_2d(small_arr, sigma / scale)
            den = gaussian_blur_2d(small_msk, sigma / scale)
            small_res = num / np.maximum(den, 1e-5)
            return resize_array_bilinear(small_res, h, w)
    num = gaussian_blur_2d(arr * mask, sigma)
    den = gaussian_blur_2d(mask, sigma)
    return num / np.maximum(den, 1e-5)


def dilate_mask_3x3(mask_bool: np.ndarray, iterations: int = 1) -> np.ndarray:
    m = mask_bool
    for _ in range(iterations):
        p = np.pad(m, 1, mode="edge")
        m = (
            p[0:-2, 0:-2] | p[0:-2, 1:-1] | p[0:-2, 2:] |
            p[1:-1, 0:-2] | p[1:-1, 1:-1] | p[1:-1, 2:] |
            p[2:,   0:-2] | p[2:,   1:-1] | p[2:,   2:]
        )
    return m


# ── UV coverage mask for a material ──────────────────────────────────────────────────────────

def build_uv_mask(mat: bpy.types.Material, height: int, width: int) -> np.ndarray:
    """
    Rasterizes a 256x256 UV island mask for all mesh triangles assigned to `mat`,
    then upsamples to (height, width). Falls back to all-ones if no UVs exist.
    """
    grid_n = 256
    grid = np.zeros((grid_n, grid_n), dtype=bool)
    has_tris = False

    # Barycentric sample weights for sub-cell triangles
    bary_weights = []
    steps = 4
    for i in range(steps + 1):
        for j in range(steps + 1 - i):
            u = i / steps
            v = j / steps
            bary_weights.append((u, v, 1.0 - u - v))
    bary = np.array(bary_weights, dtype=np.float64)  # (K, 3)

    for obj in sorted(bpy.data.objects, key=lambda o: o.name):
        if obj.type != "MESH" or not obj.data:
            continue
        me = obj.data
        slots = [i for i, m in enumerate(me.materials) if m == mat]
        if not slots or not me.uv_layers.active or len(me.polygons) == 0:
            continue

        me.calc_loop_triangles()
        n_tris = len(me.loop_triangles)
        if n_tris == 0:
            continue

        poly_mats = np.zeros(len(me.polygons), dtype=np.int32)
        me.polygons.foreach_get("material_index", poly_mats)

        tri_polys = np.zeros(n_tris, dtype=np.int32)
        me.loop_triangles.foreach_get("polygon_index", tri_polys)

        tri_mask = np.isin(poly_mats[tri_polys], slots)
        if not np.any(tri_mask):
            continue

        tri_loops = np.zeros(n_tris * 3, dtype=np.int32)
        me.loop_triangles.foreach_get("loops", tri_loops)
        tri_loops = tri_loops.reshape((n_tris, 3))[tri_mask]

        uv_raw = np.zeros(len(me.uv_layers.active.data) * 2, dtype=np.float32)
        me.uv_layers.active.data.foreach_get("uv", uv_raw)
        uvs = uv_raw.reshape((-1, 2))[tri_loops]  # (T, 3, 2)
        has_tris = True

        # Vectorized barycentric samples: (T, K, 2)
        pts = (
            bary[None, :, 0:1] * uvs[:, 0:1, :]
            + bary[None, :, 1:2] * uvs[:, 1:2, :]
            + bary[None, :, 2:3] * uvs[:, 2:3, :]
        )
        pts_mod = np.mod(pts.reshape((-1, 2)), 1.0)
        xs = np.clip((pts_mod[:, 0] * grid_n).astype(np.int32), 0, grid_n - 1)
        ys = np.clip((pts_mod[:, 1] * grid_n).astype(np.int32), 0, grid_n - 1)
        grid[ys, xs] = True

        # Exact edge-function rasterization for every triangle spanning > 0.5 grid cells
        span = uvs.max(axis=1) - uvs.min(axis=1)
        if np.any(span.max(axis=1) > 0.99):
            # Tiled UV islands covering full [0, 1] domain
            return np.ones((height, width), dtype=bool)
        big_idx = np.where(span.max(axis=1) > (0.5 / grid_n))[0]
        for idx in big_idx:
            # Shift triangle contiguously so [0, 1] boundary crossings stay intact
            base_uv = np.floor(uvs[idx].min(axis=0))
            t = uvs[idx] - base_uv
            x0 = int(np.floor(t[:, 0].min() * grid_n))
            x1 = int(np.ceil(t[:, 0].max() * grid_n))
            y0 = int(np.floor(t[:, 1].min() * grid_n))
            y1 = int(np.ceil(t[:, 1].max() * grid_n))
            gx = (np.arange(x0, x1 + 1, dtype=np.float64) + 0.5) / grid_n
            gy = (np.arange(y0, y1 + 1, dtype=np.float64) + 0.5) / grid_n
            sub_x = gx[None, :]
            sub_y = gy[:, None]
            ax, ay = float(t[0, 0]), float(t[0, 1])
            bx, by = float(t[1, 0]), float(t[1, 1])
            cx, cy = float(t[2, 0]), float(t[2, 1])
            e0 = (bx - ax) * (sub_y - ay) - (by - ay) * (sub_x - ax)
            e1 = (cx - bx) * (sub_y - by) - (cy - by) * (sub_x - bx)
            e2 = (ax - cx) * (sub_y - cy) - (ay - cy) * (sub_x - cx)
            inside = ((e0 >= -1e-4) & (e1 >= -1e-4) & (e2 >= -1e-4)) | (
                (e0 <= 1e-4) & (e1 <= 1e-4) & (e2 <= 1e-4)
            )
            yi_sub = np.arange(y0, y1 + 1) % grid_n
            xi_sub = np.arange(x0, x1 + 1) % grid_n
            grid[np.ix_(yi_sub, xi_sub)] |= inside

    if not has_tris or not np.any(grid):
        return np.ones((height, width), dtype=bool)

    grid = dilate_mask_3x3(grid, iterations=2)
    yi = np.clip((np.arange(height) * grid_n) // height, 0, grid_n - 1)
    xi = np.clip((np.arange(width) * grid_n) // width, 0, grid_n - 1)
    return grid[yi[:, None], xi[None, :]]


# ── Image reading / writing helpers ──────────────────────────────────────────────────────────

def read_image_rgba(img: bpy.types.Image) -> np.ndarray:
    """
    Returns (H, W, 4) float64 array.
    For 8-bit sRGB images in Blender 5, img.pixels[:] holds raw sRGB [0,1].
    For float_buffer sRGB images, img.pixels[:] holds linear [0,1], so we convert to sRGB.
    """
    w, h = img.size[0], img.size[1]
    ch = img.channels
    raw = np.empty(w * h * ch, dtype=np.float32)
    img.pixels.foreach_get(raw)
    arr = raw.reshape((h, w, ch)).astype(np.float64)
    if ch == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), dtype=np.float64)], axis=-1)
    elif ch == 1:
        arr = np.concatenate([arr, arr, arr, np.ones((h, w, 1), dtype=np.float64)], axis=-1)
    if img.is_float and img.colorspace_settings.name == "sRGB":
        arr[..., :3] = linear_to_srgb(arr[..., :3])
    return np.clip(arr, 0.0, 1.0)


def create_blender_image(name: str, rgba: np.ndarray, colorspace: str) -> bpy.types.Image:
    """Creates a packed 8-bit deterministic Blender Image from (H, W, 4) float64 in [0, 1]."""
    h, w = rgba.shape[:2]
    img = bpy.data.images.new(name=name, width=w, height=h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = colorspace
    # Quantize deterministically to 8-bit grid so float rounding never varies
    q = np.round(np.clip(rgba, 0.0, 1.0) * 255.0) / 255.0
    flat = q.astype(np.float32).ravel()
    img.pixels.foreach_set(flat)
    img.pack()
    return img


# ── Texture restyling core ───────────────────────────────────────────────────────────────────

def restyle_base_color_array(
    rgba: np.ndarray,
    uv_mask: np.ndarray,
    swatch_srgb: np.ndarray,
    flatten: float,
    color_factor: np.ndarray | None = None,
) -> np.ndarray:
    """
    Tints and flattens `rgba` (sRGB [0,1]) towards `swatch_srgb` with strength `flatten` in [0, 1].
    - Preserves crisp edges (labels, numerals, panel lines) while suppressing photographic noise.
    - Suppresses broad baked directional lighting across UV islands.
    - Shifts median UV lightness and hue/chroma smoothly towards the swatch.
    - Fills unused UV padding outside `uv_mask` with swatch colour to prevent dark mipmap seam bleeding.
    """
    f = float(np.clip(flatten, 0.0, 1.0))
    rgb = rgba[..., :3].copy()
    alpha = rgba[..., 3:4].copy()

    if color_factor is not None:
        # glTF baseColorFactor is linear; multiply in linear space
        lin = srgb_to_linear(rgb) * np.clip(color_factor[:3], 0.0, 1.0)
        rgb = linear_to_srgb(lin)

    if f >= 0.999:
        out_rgb = np.broadcast_to(swatch_srgb.reshape((1, 1, 3)), rgb.shape).copy()
        return np.concatenate([out_rgb, alpha], axis=-1)

    h, w = rgb.shape[:2]
    mask_f = uv_mask.astype(np.float64)
    if mask_f.sum() < 16:
        mask_f = np.ones((h, w), dtype=np.float64)
        uv_mask = np.ones((h, w), dtype=bool)

    L, a, b_ok = srgb_to_oklab(rgb)
    Ls, as_, bs_ = srgb_to_oklab(swatch_srgb.reshape((1, 1, 3)))
    L_sw = float(Ls[0, 0])
    a_sw = float(as_[0, 0])
    b_sw = float(bs_[0, 0])

    # 1. Edge-preserving high-frequency grain suppression
    L_fine = masked_blur(L, mask_f, sigma=1.25)
    r_fine = L - L_fine
    tau = 0.042  # edges stronger than ~4% Oklab L (labels, panel seams, ticks) stay sharp
    edge_w = np.clip(np.abs(r_fine) / tau, 0.0, 1.0) ** 2
    noise_kill = 0.88 * f
    r_fine_clean = r_fine * ((1.0 - noise_kill) + noise_kill * edge_w)
    L_denoised = L_fine + r_fine_clean

    # 2. Separate broad baked directional lighting from local value structure (wear, labels, seams)
    broad_sigma = max(12.0, max(h, w) / 14.0)
    L_broad = masked_blur(L_denoised, mask_f, sigma=broad_sigma)

    valid_L = L_denoised[uv_mask]
    # Ignore pure-black UV gutter pixels that slipped inside coarse UV dilation if island interior isn't black
    non_gutter = valid_L[valid_L > 0.03]
    L_med = float(np.median(non_gutter if non_gutter.size >= 32 else valid_L))

    low_freq = L_broad - L_med
    detail_freq = L_denoised - L_broad

    # Broad baked light flattens faster than crisp local detail/labels
    k_low = (1.0 - f) * (1.0 - 0.35 * f)       # e.g. f=0.7 -> 0.23, f=0.45 -> 0.46
    k_detail = 1.0 - 0.52 * (f ** 1.35)        # e.g. f=0.7 -> 0.68, f=0.85 -> 0.58, f=1.0 -> 0.48
    if f > 0.85:
        # Smoothly taper remaining detail to 0 as flatten approaches 1.0
        k_detail *= (1.0 - f) / 0.15

    t_center = f ** 0.55
    L_center = (1.0 - t_center) * L_med + t_center * L_sw
    L_out = np.clip(L_center + k_low * low_freq + k_detail * detail_freq, 0.02, 0.985)

    # 3. Hue & chroma tinting towards swatch (with natural chroma taper near white labels & black seams)
    lo_ratio = np.clip(L_out / max(L_sw, 0.08), 0.0, 1.0) ** 0.75
    hi_ratio = np.clip((1.0 - L_out) / max(1.0 - L_sw, 0.08), 0.0, 1.0) ** 0.65
    chroma_env = np.where(L_out < L_sw, lo_ratio, hi_ratio)

    a_target = a_sw * chroma_env
    b_target = b_sw * chroma_env

    # Smooth stray chromatic noise in source (a, b) before blending
    a_src = masked_blur(a, mask_f, sigma=1.2)
    b_src = masked_blur(b_ok, mask_f, sigma=1.2)

    # Stray hues disappear more aggressively than value structure
    t_hue = float(np.clip(f * 1.22, 0.0, 1.0)) if f >= 0.5 else float(f ** 0.72 * 0.92)
    a_out = (1.0 - t_hue) * a_src + t_hue * a_target
    b_out = (1.0 - t_hue) * b_src + t_hue * b_target

    out_rgb = oklab_to_srgb(L_out, a_out, b_out)

    # Fill dark unused UV gutter padding with solid swatch colour so mipmapping never bleeds black seams
    if not np.all(uv_mask):
        gutter = (~uv_mask) & (L < 0.05)
        if np.any(gutter):
            bg = np.broadcast_to(swatch_srgb.reshape((1, 1, 3)), out_rgb.shape)
            out_rgb = np.where(gutter[..., None], bg, out_rgb)

    return np.concatenate([out_rgb, alpha], axis=-1)


def remap_orm_array(
    orm_rgba: np.ndarray,
    uv_mask: np.ndarray,
    rough_band: tuple[float, float],
    target_metalness: float,
    rough_factor: float,
    keep_occlusion: bool,
    flatten: float,
) -> tuple[np.ndarray | None, float]:
    """
    Remaps glTF ORM texture (R=Occlusion, G=Roughness, B=Metalness) into `rough_band` and `target_metalness`.
    Returns (new_orm_rgba, scalar_roughness). If the roughness map is nearly constant and occlusion is not
    needed, returns (None, mid_roughness) so the map can be dropped cleanly.
    """
    r_min, r_max = float(rough_band[0]), float(rough_band[1])
    r_mid = 0.5 * (r_min + r_max)

    g = np.clip(orm_rgba[..., 1] * rough_factor, 0.0, 1.0)
    valid = g[uv_mask] if np.any(uv_mask) else g.ravel()
    p05 = float(np.percentile(valid, 5))
    p95 = float(np.percentile(valid, 95))

    if (p95 - p05) < 0.025 and not keep_occlusion:
        return None, r_mid

    if (p95 - p05) < 0.025:
        g_out = np.full_like(g, r_mid)
    else:
        u = np.clip((g - p05) / (p95 - p05), 0.0, 1.0)
        g_out = r_min + u * (r_max - r_min)

    if keep_occlusion:
        ao = orm_rgba[..., 0]
        # Soften harsh baked AO slightly as flatten increases
        r_out = 1.0 - (1.0 - ao) * (1.0 - 0.35 * flatten)
    else:
        r_out = np.ones_like(g_out)

    b_out = np.full_like(g_out, float(target_metalness))
    a_out = np.ones_like(g_out)

    if not np.all(uv_mask):
        g_out = np.where(uv_mask, g_out, r_mid)
        r_out = np.where(uv_mask, r_out, 1.0)

    return np.stack([r_out, g_out, b_out, a_out], axis=-1), 1.0


# ── Shader graph inspection helpers ──────────────────────────────────────────────────────────

def find_upstream_tex_and_factor(socket, default_factor=1.0):
    """
    Traces upstream from a Principled BSDF socket to find (ShaderNodeTexImage | None, factor).
    Handles glTF importer's MIX (MULTIPLY) and MATH (MULTIPLY) wrapper nodes.
    """
    if socket is None or not socket.is_linked:
        return None, default_factor

    link = socket.links[0]
    node = link.from_node

    if node.type == "TEX_IMAGE" and node.image:
        return node, default_factor

    if node.type == "SEPARATE_COLOR":
        col_sock = node.inputs.get("Color")
        if col_sock and col_sock.is_linked and col_sock.links[0].from_node.type == "TEX_IMAGE":
            return col_sock.links[0].from_node, default_factor

    if node.type == "MATH" and node.operation == "MULTIPLY":
        fac = default_factor
        tex_node = None
        for inp in node.inputs:
            if inp.is_linked:
                t, sub_f = find_upstream_tex_and_factor(inp, 1.0)
                if t is not None:
                    tex_node = t
                    fac *= sub_f
            else:
                fac *= float(inp.default_value)
        return tex_node, fac

    if node.type == "MIX" and getattr(node, "blend_type", "") == "MULTIPLY":
        col_fac = np.ones(3, dtype=np.float64)
        tex_node = None
        for sock_name in ("A", "B"):
            inp = node.inputs.get(sock_name)
            if inp is None:
                continue
            if inp.is_linked:
                fn = inp.links[0].from_node
                if fn.type == "TEX_IMAGE" and fn.image:
                    tex_node = fn
            else:
                val = inp.default_value
                if hasattr(val, "__len__") and len(val) >= 3:
                    col_fac *= np.array([val[0], val[1], val[2]], dtype=np.float64)
        return tex_node, col_fac

    if node.type == "NORMAL_MAP":
        strength = float(node.inputs["Strength"].default_value) if "Strength" in node.inputs else 1.0
        col_sock = node.inputs.get("Color")
        if col_sock and col_sock.is_linked and col_sock.links[0].from_node.type == "TEX_IMAGE":
            return col_sock.links[0].from_node, strength

    return None, default_factor


def find_occlusion_tex(nt: bpy.types.NodeTree):
    for node in nt.nodes:
        if node.type == "GROUP" and node.node_tree and "glTF" in node.node_tree.name:
            occ = node.inputs.get("Occlusion")
            if occ and occ.is_linked:
                tex_node, _ = find_upstream_tex_and_factor(occ, 1.0)
                return node, tex_node
    return None, None


# ── glTF node-name fidelity helpers (restores duplicate sibling/cousin names if Blender suffixed .001) ──

def read_gltf_json_chunk(path: str) -> dict:
    if path.lower().endswith(".gltf"):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    with open(path, "rb") as f:
        magic, _ver, _total = struct.unpack("<4sII", f.read(12))
        if magic != b"glTF":
            raise ValueError(f"Not a valid GLB file: {path}")
        clen, ctype = struct.unpack("<II", f.read(8))
        if ctype != 0x4E4F534A:
            raise ValueError(f"First GLB chunk is not JSON: {path}")
        return json.loads(f.read(clen).decode("utf-8"))


def collect_parent_to_child_names(gltf_doc: dict) -> dict[str, list[str]]:
    """Maps parent path -> list of child names in the source glTF hierarchy."""
    nodes = gltf_doc.get("nodes", [])
    scenes = gltf_doc.get("scenes", [])
    if not scenes:
        return {}
    roots = scenes[gltf_doc.get("scene", 0)].get("nodes", [])
    by_parent: dict[str, list[str]] = {}

    def walk(idx: int, parent_path: str):
        n = nodes[idx]
        nm = n.get("name", "")
        by_parent.setdefault(parent_path, []).append(nm)
        cur_path = f"{parent_path}/{nm}"
        for c in n.get("children", []):
            walk(c, cur_path)

    for r in roots:
        walk(r, "")
    return by_parent


def fix_gltf_doc_nodes_and_generator(doc: dict, src_by_parent: dict[str, list[str]]) -> dict:
    nodes = doc.get("nodes", [])
    scenes = doc.get("scenes", [])
    if scenes and src_by_parent:
        roots = scenes[doc.get("scene", 0)].get("nodes", [])

        def fix_walk(idx: int, parent_path: str):
            n = nodes[idx]
            nm = n.get("name", "")
            expected = src_by_parent.get(parent_path, [])
            if nm not in expected:
                m = re.match(r"^(.*)\.\d{3,}$", nm)
                if m and m.group(1) in expected:
                    nm = m.group(1)
                    n["name"] = nm
            cur_path = f"{parent_path}/{nm}"
            for c in n.get("children", []):
                fix_walk(c, cur_path)

        for r in roots:
            fix_walk(r, "")

    if "asset" in doc:
        doc["asset"]["generator"] = "terminal-portfolio restyle.py (Blender 5)"
    return doc


def restore_exact_node_names_and_determinism_glb(glb_path: str, src_by_parent: dict[str, list[str]]):
    """
    1. Restores exact node names if the source glTF contained duplicate node names that Blender
       had to suffix with `.001`, `.002`, etc.
    2. Normalizes generator string & serializes JSON deterministically for byte-identical builds.
    """
    with open(glb_path, "rb") as f:
        header = f.read(12)
        magic, version, _total_len = struct.unpack("<4sII", header)
        if magic != b"glTF":
            return
        j_len, j_type = struct.unpack("<II", f.read(8))
        j_bytes = f.read(j_len)
        rest_chunks = f.read()

    doc = fix_gltf_doc_nodes_and_generator(json.loads(j_bytes.decode("utf-8")), src_by_parent)

    new_json = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    pad = (4 - (len(new_json) % 4)) % 4
    new_json_padded = new_json + (b" " * pad)
    total_len = 12 + 8 + len(new_json_padded) + len(rest_chunks)

    with open(glb_path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", version, total_len))
        f.write(struct.pack("<II", len(new_json_padded), j_type))
        f.write(new_json_padded)
        f.write(rest_chunks)


def restore_exact_node_names_and_determinism_gltf(gltf_path: str, src_by_parent: dict[str, list[str]]):
    with open(gltf_path, "r", encoding="utf-8") as f:
        doc = json.load(f)
    doc = fix_gltf_doc_nodes_and_generator(doc, src_by_parent)
    with open(gltf_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ── Mapping resolution ───────────────────────────────────────────────────────────────────────

def load_mapping_and_palette(mapping_path: str, in_path: str, out_path: str, explicit_prop: str | None, mat_names: set[str]):
    with open(mapping_path, "r", encoding="utf-8") as f:
        mapping = json.load(f)

    # Resolve palette swatches
    if "swatches" in mapping:
        swatches = mapping["swatches"]
    else:
        pal_rel = mapping.get("palette", "art/palette.json")
        candidates = [
            pal_rel,
            os.path.join(os.path.dirname(os.path.abspath(mapping_path)), os.path.basename(pal_rel)),
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(mapping_path))), pal_rel),
        ]
        pal_file = next((p for p in candidates if os.path.isfile(p)), None)
        if not pal_file:
            raise FileNotFoundError(f"Could not locate palette file '{pal_rel}' referenced by {mapping_path}")
        with open(pal_file, "r", encoding="utf-8") as pf:
            swatches = json.load(pf)["swatches"]

    # Direct single-prop mapping file: { "materials": { ... } }
    if "materials" in mapping and "props" not in mapping:
        return swatches, mapping

    props = mapping.get("props", {})
    norm_in = os.path.abspath(in_path).replace("\\", "/")
    out_stem = os.path.splitext(os.path.basename(out_path))[0]

    # 1. Explicit --prop <name>
    if explicit_prop:
        if explicit_prop not in props:
            raise KeyError(f"Prop '{explicit_prop}' not found in {mapping_path}")
        return swatches, props[explicit_prop]

    # 2. Match by source path suffix
    for pname, pcfg in props.items():
        src = pcfg.get("source", "").replace("\\", "/")
        if src and norm_in.endswith(src):
            return swatches, pcfg

    # 3. Match by output filename stem (e.g. lamp.glb or lamp-restyle.glb)
    for pname, pcfg in props.items():
        if out_stem == pname or out_stem.startswith(f"{pname}-") or out_stem.startswith(f"{pname}_"):
            return swatches, pcfg

    # 4. Match by source basename
    in_base = os.path.basename(norm_in)
    basename_matches = [
        pcfg for pcfg in props.values() if os.path.basename(pcfg.get("source", "")) == in_base
    ]
    if len(basename_matches) == 1:
        return swatches, basename_matches[0]

    # 5. Match by exact material name set
    mat_matches = [
        pcfg for pcfg in props.values() if set(pcfg.get("sourceMaterials", [])) == mat_names
    ]
    if len(mat_matches) == 1:
        return swatches, mat_matches[0]

    raise KeyError(
        f"Could not match '{in_path}' (materials={sorted(mat_names)}) to any entry in {mapping_path}. "
        f"Pass --prop <name> or add its source/materials to {mapping_path}."
    )


# ── Material transformation ──────────────────────────────────────────────────────────────────

def maybe_downscale_rgba(rgba: np.ndarray, max_dim: int | None) -> np.ndarray:
    if not max_dim or max_dim <= 0:
        return rgba
    h, w = rgba.shape[:2]
    longest = max(h, w)
    if longest <= max_dim:
        return rgba
    scale = max_dim / float(longest)
    new_h = max(1, int(round(h * scale)))
    new_w = max(1, int(round(w * scale)))
    return resize_array_bilinear(rgba, new_h, new_w)


def restyle_material(
    mat: bpy.types.Material,
    mat_cfg: dict,
    swatches: dict,
    prop_defaults: dict,
    image_cache: dict,
):
    sw_name = mat_cfg["swatch"]
    if sw_name not in swatches:
        raise KeyError(f"Unknown swatch '{sw_name}' on material '{mat.name}'")
    swatch = swatches[sw_name]
    swatch_srgb = hex_to_srgb(swatch["color"])
    swatch_lin = srgb_to_linear(swatch_srgb)

    flatten = float(mat_cfg.get("flatten", prop_defaults.get("flatten", 0.75)))
    target_rough = float(mat_cfg.get("roughness", swatch["roughness"]))
    target_metal = float(mat_cfg.get("metalness", swatch["metalness"]))
    half_band = float(mat_cfg.get("roughnessHalfSpan", 0.08))
    rough_band = tuple(
        mat_cfg.get(
            "roughnessBand",
            [max(0.03, round(target_rough - half_band, 3)), min(0.98, round(target_rough + half_band, 3))],
        )
    )
    drop_maps = set(mat_cfg.get("dropMaps", prop_defaults.get("dropMaps", [])))
    if "all" in drop_maps:
        drop_maps = {"baseColor", "roughness", "normal", "occlusion", "emission"}

    max_map_size = mat_cfg.get("maxMapSize", prop_defaults.get("maxMapSize"))
    map_sizes = mat_cfg.get("mapSizes", prop_defaults.get("mapSizes", {}))

    if mat.node_tree is None:
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return

    # Inspect existing connections before rebuilding clean glTF node graph
    bc_tex_node, bc_fac = find_upstream_tex_and_factor(
        bsdf.inputs.get("Base Color"), np.ones(3, dtype=np.float64)
    )
    rough_tex_node, rough_fac = find_upstream_tex_and_factor(bsdf.inputs.get("Roughness"), 1.0)
    norm_tex_node, norm_strength = find_upstream_tex_and_factor(bsdf.inputs.get("Normal"), 1.0)
    alpha_tex_node, _ = find_upstream_tex_and_factor(bsdf.inputs.get("Alpha"), 1.0)
    emiss_tex_node, _ = find_upstream_tex_and_factor(bsdf.inputs.get("Emission Color"), 1.0)
    _occ_group, occ_tex_node = find_occlusion_tex(nt)

    orig_alpha = float(bsdf.inputs["Alpha"].default_value) if "Alpha" in bsdf.inputs else 1.0
    orig_transmission = (
        float(bsdf.inputs["Transmission Weight"].default_value)
        if "Transmission Weight" in bsdf.inputs
        else 0.0
    )
    orig_emiss_col = (
        tuple(bsdf.inputs["Emission Color"].default_value)
        if "Emission Color" in bsdf.inputs
        else (0.0, 0.0, 0.0, 1.0)
    )
    orig_emiss_str = (
        float(bsdf.inputs["Emission Strength"].default_value)
        if "Emission Strength" in bsdf.inputs
        else 0.0
    )
    orig_blend = getattr(mat, "surface_render_method", "DITHERED")

    # Compute UV mask lazily at image resolution when needed
    uv_masks_by_shape: dict[tuple[int, int], np.ndarray] = {}

    def get_uv_mask(h: int, w: int) -> np.ndarray:
        if (h, w) not in uv_masks_by_shape:
            uv_masks_by_shape[(h, w)] = build_uv_mask(mat, h, w)
        return uv_masks_by_shape[(h, w)]

    # 1. Base colour texture (or untextured swatch)
    new_bc_img = None
    if bc_tex_node is not None and bc_tex_node.image is not None and "baseColor" not in drop_maps:
        src_img = bc_tex_node.image
        rgba = read_image_rgba(src_img)
        bc_max = map_sizes.get("baseColor", max_map_size)
        rgba = maybe_downscale_rgba(rgba, bc_max)
        uv_m = get_uv_mask(rgba.shape[0], rgba.shape[1])
        fac_arr = bc_fac if isinstance(bc_fac, np.ndarray) else None
        restyled_rgba = restyle_base_color_array(rgba, uv_m, swatch_srgb, flatten, fac_arr)
        new_bc_img = create_blender_image(f"{mat.name}_baseColor", restyled_rgba, "sRGB")

    # 2. Roughness / Metallic / Occlusion ORM texture (or flat swatch scalars)
    new_orm_img = None
    keep_occ = (occ_tex_node is not None and occ_tex_node.image is not None and "occlusion" not in drop_maps)
    if rough_tex_node is not None and rough_tex_node.image is not None and "roughness" not in drop_maps:
        orm_src = rough_tex_node.image
        orm_rgba = read_image_rgba(orm_src)
        # If occlusion came from a different texture, pack its red channel in
        if keep_occ and occ_tex_node.image != orm_src:
            occ_rgba = read_image_rgba(occ_tex_node.image)
            occ_rgba = resize_array_bilinear(occ_rgba, orm_rgba.shape[0], orm_rgba.shape[1])
            orm_rgba[..., 0] = occ_rgba[..., 0]
        orm_max = map_sizes.get("roughness", max_map_size)
        orm_rgba = maybe_downscale_rgba(orm_rgba, orm_max)
        uv_m = get_uv_mask(orm_rgba.shape[0], orm_rgba.shape[1])
        remapped_orm, scalar_r = remap_orm_array(
            orm_rgba,
            uv_m,
            rough_band,
            target_metal,
            float(rough_fac) if not isinstance(rough_fac, np.ndarray) else 1.0,
            keep_occ,
            flatten,
        )
        if remapped_orm is not None:
            new_orm_img = create_blender_image(f"{mat.name}_orm", remapped_orm, "Non-Color")
            final_rough_scalar = scalar_r
        else:
            final_rough_scalar = scalar_r
            keep_occ = False
    else:
        final_rough_scalar = target_rough
        if keep_occ:
            occ_rgba = read_image_rgba(occ_tex_node.image)
            occ_max = map_sizes.get("occlusion", max_map_size)
            occ_rgba = maybe_downscale_rgba(occ_rgba, occ_max)
            ao = 1.0 - (1.0 - occ_rgba[..., 0]) * (1.0 - 0.35 * flatten)
            packed = np.stack(
                [
                    ao,
                    np.full_like(ao, target_rough),
                    np.full_like(ao, target_metal),
                    np.ones_like(ao),
                ],
                axis=-1,
            )
            new_orm_img = create_blender_image(f"{mat.name}_orm", packed, "Non-Color")

    # 3. Normal map (kept unless dropped; optionally downscaled)
    new_norm_img = None
    if norm_tex_node is not None and norm_tex_node.image is not None and "normal" not in drop_maps:
        norm_src = norm_tex_node.image
        norm_max = map_sizes.get("normal", max_map_size)
        cache_key = ("normal", norm_src.name, norm_max)
        if cache_key in image_cache:
            new_norm_img = image_cache[cache_key]
        elif norm_max and max(norm_src.size[0], norm_src.size[1]) > norm_max:
            n_rgba = maybe_downscale_rgba(read_image_rgba(norm_src), norm_max)
            # Re-normalize tangent-space normal vectors after downscaling
            n_vec = n_rgba[..., :3] * 2.0 - 1.0
            n_len = np.maximum(np.linalg.norm(n_vec, axis=-1, keepdims=True), 1e-6)
            n_rgba[..., :3] = (n_vec / n_len) * 0.5 + 0.5
            new_norm_img = create_blender_image(f"{norm_src.name}_norm", n_rgba, "Non-Color")
            image_cache[cache_key] = new_norm_img
        else:
            new_norm_img = norm_src
            new_norm_img.colorspace_settings.name = "Non-Color"

    # 4. Emission (preserved or tinted to emissionSwatch unless dropped)
    new_emiss_img = None
    emiss_col = orig_emiss_col
    emiss_str = orig_emiss_str
    if "emission" in drop_maps:
        emiss_col = (0.0, 0.0, 0.0, 1.0)
        emiss_str = 0.0
    else:
        em_sw_name = mat_cfg.get("emissionSwatch")
        if "emissionStrength" in mat_cfg:
            emiss_str = float(mat_cfg["emissionStrength"])
        if emiss_tex_node is not None and emiss_tex_node.image is not None:
            em_rgba = read_image_rgba(emiss_tex_node.image)
            em_max = map_sizes.get("emission", max_map_size)
            em_rgba = maybe_downscale_rgba(em_rgba, em_max)
            if em_sw_name:
                em_srgb = hex_to_srgb(swatches[em_sw_name]["color"])
                # Multiply luminance mask of emission texture by target emission swatch
                em_lum = 0.2126 * em_rgba[..., 0] + 0.7152 * em_rgba[..., 1] + 0.0722 * em_rgba[..., 2]
                em_rgba[..., :3] = em_lum[..., None] * em_srgb.reshape((1, 1, 3))
            new_emiss_img = create_blender_image(f"{mat.name}_emission", em_rgba, "sRGB")
        elif em_sw_name:
            em_lin = srgb_to_linear(hex_to_srgb(swatches[em_sw_name]["color"]))
            emiss_col = (float(em_lin[0]), float(em_lin[1]), float(em_lin[2]), 1.0)

    # 5. Rebuild clean, deterministic glTF 2.0 Principled BSDF graph
    gltf_group_tree = bpy.data.node_groups.get("glTF Material Output")
    nt.nodes.clear()

    out_node = nt.nodes.new("ShaderNodeOutputMaterial")
    out_node.location = (300, 0)

    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    nt.links.new(bsdf.outputs["BSDF"], out_node.inputs["Surface"])

    if new_bc_img is not None:
        bc_node = nt.nodes.new("ShaderNodeTexImage")
        bc_node.location = (-400, 260)
        bc_node.image = new_bc_img
        nt.links.new(bc_node.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        if alpha_tex_node is not None and "alpha" not in mat_cfg and not mat_cfg.get("opaque", False):
            nt.links.new(bc_node.outputs["Alpha"], bsdf.inputs["Alpha"])
    else:
        bsdf.inputs["Base Color"].default_value = (
            float(swatch_lin[0]),
            float(swatch_lin[1]),
            float(swatch_lin[2]),
            1.0,
        )

    bsdf.inputs["Roughness"].default_value = float(final_rough_scalar)
    bsdf.inputs["Metallic"].default_value = float(target_metal)

    if new_orm_img is not None:
        orm_node = nt.nodes.new("ShaderNodeTexImage")
        orm_node.location = (-560, -20)
        orm_node.image = new_orm_img
        sep_node = nt.nodes.new("ShaderNodeSeparateColor")
        sep_node.location = (-280, -20)
        nt.links.new(orm_node.outputs["Color"], sep_node.inputs["Color"])
        if "roughness" not in drop_maps and rough_tex_node is not None:
            nt.links.new(sep_node.outputs["Green"], bsdf.inputs["Roughness"])
            nt.links.new(sep_node.outputs["Blue"], bsdf.inputs["Metallic"])
            bsdf.inputs["Roughness"].default_value = 1.0
            bsdf.inputs["Metallic"].default_value = 1.0
        if keep_occ:
            if gltf_group_tree is None:
                gltf_group_tree = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
                gltf_group_tree.interface.new_socket(
                    "Occlusion", in_out="INPUT", socket_type="NodeSocketFloat"
                )
            occ_node = nt.nodes.new("ShaderNodeGroup")
            occ_node.node_tree = gltf_group_tree
            occ_node.location = (300, -180)
            nt.links.new(sep_node.outputs["Red"], occ_node.inputs["Occlusion"])

    if new_norm_img is not None:
        n_tex = nt.nodes.new("ShaderNodeTexImage")
        n_tex.location = (-560, -300)
        n_tex.image = new_norm_img
        n_map = nt.nodes.new("ShaderNodeNormalMap")
        n_map.location = (-280, -300)
        n_map.inputs["Strength"].default_value = float(
            mat_cfg.get("normalStrength", norm_strength if not isinstance(norm_strength, np.ndarray) else 1.0)
        )
        nt.links.new(n_tex.outputs["Color"], n_map.inputs["Color"])
        nt.links.new(n_map.outputs["Normal"], bsdf.inputs["Normal"])

    if new_emiss_img is not None:
        em_tex = nt.nodes.new("ShaderNodeTexImage")
        em_tex.location = (-400, -540)
        em_tex.image = new_emiss_img
        nt.links.new(em_tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = float(emiss_str)
    else:
        bsdf.inputs["Emission Color"].default_value = emiss_col
        bsdf.inputs["Emission Strength"].default_value = float(emiss_str)

    # Transmission / Alpha / blend mode handling
    if "Transmission Weight" in bsdf.inputs:
        if mat_cfg.get("opaque", False):
            bsdf.inputs["Transmission Weight"].default_value = 0.0
        elif "transmission" in mat_cfg:
            bsdf.inputs["Transmission Weight"].default_value = float(mat_cfg["transmission"])
        elif "alpha" not in mat_cfg:
            bsdf.inputs["Transmission Weight"].default_value = orig_transmission

    if mat_cfg.get("opaque", False):
        bsdf.inputs["Alpha"].default_value = 1.0
        mat.surface_render_method = "DITHERED"
    elif "alpha" in mat_cfg:
        a_val = float(mat_cfg["alpha"])
        bsdf.inputs["Alpha"].default_value = a_val
        mat.surface_render_method = "BLENDED" if a_val < 0.999 else "DITHERED"
    else:
        bsdf.inputs["Alpha"].default_value = orig_alpha
        mat.surface_render_method = orig_blend


# ── CLI Entrypoint ───────────────────────────────────────────────────────────────────────────

def parse_args(argv: list[str]):
    if "--" not in argv:
        raise SystemExit(
            "usage: Blender -b --python scripts/restyle.py -- <in.glb|gltf> <out.glb|gltf> <mapping.json> [--prop <name>]"
        )
    args = argv[argv.index("--") + 1 :]
    pos = []
    prop_name = None
    i = 0
    while i < len(args):
        if args[i] == "--prop" and i + 1 < len(args):
            prop_name = args[i + 1]
            i += 2
        else:
            pos.append(args[i])
            i += 1
    if len(pos) != 3:
        raise SystemExit(
            "usage: Blender -b --python scripts/restyle.py -- <in.glb|gltf> <out.glb|gltf> <mapping.json> [--prop <name>]"
        )
    return pos[0], pos[1], pos[2], prop_name


def main():
    in_path, out_path, mapping_path, explicit_prop = parse_args(sys.argv)
    in_path = os.path.abspath(in_path)
    out_path = os.path.abspath(out_path)
    mapping_path = os.path.abspath(mapping_path)

    src_gltf_doc = read_gltf_json_chunk(in_path)
    src_by_parent = collect_parent_to_child_names(src_gltf_doc)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.image_settings.compression = 15

    bpy.ops.import_scene.gltf(filepath=in_path)

    scene_mats = {
        m.name: m
        for m in sorted(bpy.data.materials, key=lambda x: x.name)
        if m.name != "Dots Stroke" and m.users > 0
    }
    swatches, prop_cfg = load_mapping_and_palette(
        mapping_path, in_path, out_path, explicit_prop, set(scene_mats.keys())
    )

    if prop_cfg.get("dropVertexColors", False):
        for obj in sorted(bpy.data.objects, key=lambda o: o.name):
            if obj.type == "MESH" and obj.data and obj.data.color_attributes:
                while len(obj.data.color_attributes) > 0:
                    obj.data.color_attributes.remove(obj.data.color_attributes[0])

    mat_mappings = prop_cfg.get("materials", {})
    default_mat_cfg = prop_cfg.get("default")
    image_cache = {}

    for mname in sorted(scene_mats.keys()):
        mat = scene_mats[mname]
        cfg = mat_mappings.get(mname, default_mat_cfg)
        if cfg == "keep":  # already in the palette's spirit (e.g. resistor colour bands): leave it alone
            continue
        if cfg is None:
            raise KeyError(
                f"Material '{mname}' in '{in_path}' has no mapping entry in {mapping_path}"
            )
        restyle_material(mat, cfg, swatches, prop_cfg, image_cache)

    # Remove unused images so dropped textures are never packed into output
    used_images = set()
    for m in scene_mats.values():
        if m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    used_images.add(n.image)
    for img in list(bpy.data.images):
        if img not in used_images:
            bpy.data.images.remove(img)

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    export_fmt = "GLB" if out_path.lower().endswith(".glb") else "GLTF_SEPARATE"
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format=export_fmt,
        export_image_format="AUTO",
        export_unused_images=False,
        export_unused_textures=False,
        export_yup=True,
        export_apply=False,
    )

    if export_fmt == "GLB":
        restore_exact_node_names_and_determinism_glb(out_path, src_by_parent)
    else:
        restore_exact_node_names_and_determinism_gltf(out_path, src_by_parent)

    print(f"Restyled {len(scene_mats)} material(s): {os.path.basename(in_path)} -> {out_path}")


if __name__ == "__main__":
    main()
