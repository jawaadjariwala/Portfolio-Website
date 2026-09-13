"""Split the portrait artwork into animatable layers.

Input : source/char-base-cutout.png  (artwork with background keyed to transparent, 1112x1106)
Output: assets/back.webp   everything static: background, neck, shirt (head area filled in)
        assets/head.webp   face + hair + ears, cut along the jaw/chin stroke (moves)
        assets/brow-left.png, assets/brow-right.png, assets/mouth.png, assets/eye-*.png
Prints the CSS geometry to paste into styles.css.  Run from the project root:
    python3 source/build-layers.py
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from collections import deque

SRC = 'source/char-base-cutout.png'
base = Image.open(SRC).convert('RGBA'); W, H = base.size
arr = np.array(base).astype(np.float32); bright = arr[:, :, :3].sum(axis=2)
DARK = bright < 480                      # purple strokes + hair; hatch lines / shirt / skin stay light


def dilate(mask, r):
    m = mask.copy()
    for _ in range(r):
        p = np.pad(m, 1)
        m = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:] | m)
    return m


def soft(mask, blur):
    return np.array(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))).astype(np.float32) / 255


def diffuse_fill(img, unknown, sources, iters):
    """Fill `unknown` pixels by iterative neighbour averaging seeded from `sources`."""
    fill = img.copy(); known = sources & ~unknown; fill[~known] = 0; cur = known.copy()
    for _ in range(iters):
        p = np.pad(fill, ((1, 1), (1, 1), (0, 0))); k = np.pad(cur.astype(np.float32), 1)
        acc = np.zeros_like(fill); cnt = np.zeros((H, W), dtype=np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            acc += p[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx] * k[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx][..., None]
            cnt += k[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx]
        grow = (~cur) & (cnt > 0) & unknown
        fill[grow] = acc[grow] / cnt[grow][:, None]; cur |= grow
    return fill, cur


def flood_outside(blocked):
    """Pixels reachable from the image border without crossing `blocked`."""
    out = np.zeros((H, W), dtype=bool); q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if not blocked[y, x] and not out[y, x]: out[y, x] = True; q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if not blocked[y, x] and not out[y, x]: out[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not out[ny, nx] and not blocked[ny, nx]:
                out[ny, nx] = True; q.append((ny, nx))
    return out


# ---------------- shirt mask: everything at/below the collar + shoulder stroke ----------------
# Per column, scan up from the bottom through the shirt fill; the first dark run is the collar or
# shoulder outline. The shirt starts at that stroke's TOP edge, so the stroke belongs to the shirt.
shirt_top = np.full(W, H, dtype=int)
for x in range(W):
    y = H - 1
    while y > 560:
        while y > 560 and not DARK[y, x]: y -= 1          # through the shirt fill
        if y <= 560: break
        run_bottom = y
        while y > 560 and DARK[y, x]: y -= 1              # through the stroke
        if run_bottom - y >= 2 or run_bottom > 850:      # a real stroke (the outline tapers near the edges)
            shirt_top[x] = y + 1 - 3                     # 3px margin so the stroke's antialiasing is included
            break
shirt_mask = np.zeros((H, W), dtype=bool)
for x in range(W):
    shirt_mask[shirt_top[x]:, x] = True

# ---------------- person silhouette: everything enclosed by strokes ----------------
blocked = dilate(DARK, 2)
outside = flood_outside(blocked)
assert not outside[250, 550] and not outside[560, 420], 'flood fill leaked into the face — raise DARK dilation'


def component(mask, seed):
    """Connected component of `mask` containing `seed` (y, x)."""
    keep = np.zeros_like(mask); q = deque([seed]); keep[seed] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not keep[ny, nx]:
                keep[ny, nx] = True; q.append((ny, nx))
    return keep


person = component(~outside, (250, 550))

# ---------------- head / neck cut: along the jaw + chin stroke ----------------
# The face interior is enclosed by the (continuous) jaw/chin stroke, so flood-fill it from inside.
# The head is everything in the silhouette above the jaw corners, plus a band of BAND px around the
# face interior: that band follows the chin curve exactly, covers the stroke, and keeps OVERLAP px of
# neck beneath it that fades out — so a vertical nudge never exposes a seam. The neck itself, its
# outline lines and the collar hooks all stay in the static back layer.
face_fill = component(~dilate(DARK, 1) & person, (250, 550))
assert not face_fill[760, 520], 'face flood leaked into the neck'
OVERLAP, FEATHER, JAW_CORNER_Y = 4, 4, 660
cut = np.full(W, JAW_CORNER_Y, dtype=int)     # columns with no face below: nothing under the jaw corners is head
for x in range(W):
    col = np.where(face_fill[:, x])[0]
    if len(col) == 0 or col.max() < 560: continue        # no jaw in this column (ear / temple only)
    y = col.max() + 1; light = 0; dark_run = 0; last_dark = col.max(); run_start = col.max()
    while y < H and person[y, x]:               # down through stubble + the chin stroke into the neck skin
        if DARK[y, x]:
            if light: dark_run = 0; run_start = y
            light = 0; dark_run += 1; last_dark = y
        else:
            light += 1
            if light >= 25: break               # a long light run = neck skin (or background)
        y += 1
    if dark_run > 40:                           # the last dark run was a neck outline line, not the jaw
        cut[x] = run_start + OVERLAP
    else:
        cut[x] = last_dark + 1 + OVERLAP
cut = np.array([cut[max(0, x - 2):x + 3].max() for x in range(W)])   # never undercut a neighbour's stroke
rows = np.arange(H)[:, None]
head_bin = component(person & (rows < cut[None, :]), (250, 550))
ramp = np.clip((cut[None, :] - rows) / FEATHER, 0, 1)                 # soft edge over the overlap
head_alpha = soft(head_bin, 0.8) * ramp
head_solid = head_bin & (rows < (cut - OVERLAP)[None, :])             # the stroke and everything above it
ys_, xs_ = np.where(face_fill); chin_x = int(np.median(xs_[ys_ >= ys_.max() - 3]))
PIVOT = (chin_x, int(cut[chin_x - 40:chin_x + 40].max()) - OVERLAP)  # bottom-centre of the chin stroke
print(f'# cut by column (every 24px from 330): {list(cut[330:780:24])}')

head = arr.copy(); head[:, :, 3] = arr[:, :, 3] * head_alpha

# back: ORIGINAL pixels everywhere except under the solid head (stroke and above), which is filled
# from its surroundings. The overlap rows below the stroke keep the real neck pixels, so the head's
# soft edge always blends original-over-original — no seams, no striping.
sources = ~head_solid & ~(dilate(head_solid, 24) & DARK)
fill, known = diffuse_fill(arr, head_solid, sources, 40)
back = arr.copy(); back[head_solid] = fill[head_solid]
back[:, :, 3] = np.where(head_solid, 255 * soft(known, 2), arr[:, :, 3])

# ---------------- brows & mouth (cut from the head, inpainted underneath) ----------------
def part_mask(box, thr_hi, yb=None, thr_lo=300):
    x0, y0, x1, y1 = box; m = np.zeros((H, W), dtype=bool); sub = bright[y0:y1, x0:x1]; mm = sub < thr_hi
    if yb is not None:                       # below yb only keep the very dark core (avoids the glasses rim)
        rows = np.arange(y0, y1)[:, None]; mm = np.where(rows >= yb, sub < thr_lo, mm)
    m[y0:y1, x0:x1] = mm; return m


def brow_mask(box, yb):
    """Brow strokes, with a per-column 'keep-out' line 2px above the glasses rim beneath them."""
    m = part_mask(box, 420, yb=yb)
    x0, y0, x1, y1 = box
    keep_out = np.full(W, H, dtype=int)
    for x in range(x0, x1):
        ys = np.where(m[:, x])[0]
        if len(ys) == 0: continue
        y = ys.max() + 1; gap = 0
        while y < y1 + 40:                       # first stroke below the brow after a light gap = the rim
            if bright[y, x] >= 480: gap += 1
            elif gap >= 2: break
            y += 1
        keep_out[x] = y - 2
        m[keep_out[x]:, x] = False
    # drop specks: keep only the brow's main stroke cluster
    ys, xs = np.where(m); seed = (int(np.median(ys)), int(np.median(xs)))
    if not m[seed]:
        d = ((ys - seed[0]) ** 2 + (xs - seed[1]) ** 2); i = int(np.argmin(d)); seed = (ys[i], xs[i])
    m = component(dilate(m, 1), seed) & m
    return m, keep_out


def mouth_mask(x0, x1, seed_x, y_lo, y_hi):
    """Only the mouth stroke: follow the dark run column by column outward from its centre."""
    col = bright[y_lo:y_hi, seed_x]; yc = y_lo + int(np.argmin(col))
    m = np.zeros((H, W), dtype=bool); track = np.full(W, -1, dtype=int)

    def run(x, yc):
        for d in range(0, 7):
            for yy in (yc - d, yc + d):
                if y_lo <= yy < y_hi and bright[yy, x] < 430:
                    a = b = yy
                    while a - 1 >= yy - 6 and bright[a - 1, x] < 430: a -= 1
                    while b + 1 <= yy + 6 and bright[b + 1, x] < 430: b += 1
                    return a, b
        return None

    for rng in (range(seed_x, x1), range(seed_x - 1, x0 - 1, -1)):
        y = yc
        for x in rng:
            r = run(x, y)
            if r is None: break
            m[r[0]:r[1] + 1, x] = True; y = (r[0] + r[1]) // 2; track[x] = y
    keep = np.zeros((H, W), dtype=bool)                  # band of ±9px around the tracked line
    for x in np.where(track >= 0)[0]:
        keep[track[x] - 9:track[x] + 10, x] = True
    return m, keep, track


bl, bl_keep = brow_mask((372, 294, 510, 348), 344)
br, br_keep = brow_mask((568, 298, 730, 352), 348)
mo, mo_keep, mo_track = mouth_mask(420, 645, 540, 548, 586)
band = lambda ko: np.array([[y < ko[x] for x in range(W)] for y in range(H)])   # rows above the keep-out line
PARTS = {
    'brow-left':  (bl, band(bl_keep)),
    'brow-right': (br, band(br_keep)),
    'mouth':      (mo, mo_keep),
}
geom = {}
for name, (m, allowed) in PARTS.items():
    m2 = dilate(m, 2) & allowed
    ring = dilate(m2, 14) & ~m2; src = ring & (bright > 520)          # skin-only sources
    filled, _ = diffuse_fill(head, m2, src, 60)
    head[m2] = filled[m2]; head[m2, 3] = 255
    blurred = np.array(Image.fromarray(head.astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32)
    inner = dilate(m, 1) & allowed; head[inner] = blurred[inner]
    ys_, xs_ = np.where(m2); pad = 12
    x0, y0 = max(xs_.min() - pad, 0), max(ys_.min() - pad, 0)
    x1, y1 = min(xs_.max() + pad + 1, W), min(ys_.max() + pad + 1, H)
    a = np.array(Image.fromarray((dilate(m, 3) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.4))).astype(np.float32)
    a[~allowed] = 0                                                      # hard clip: never touch the rim / moustache
    crop = arr[y0:y1, x0:x1].copy(); crop[:, :, 3] = a[y0:y1, x0:x1]
    Image.fromarray(crop.astype(np.uint8), 'RGBA').save(f'assets/{name}.png', optimize=True)
    geom[name] = (x0, y0, x1 - x0, y1 - y0)
    if name == 'mouth':
        xr = np.where(mo_track >= 0)[0].max()
        print(f'.mouth img{{ transform-origin: {(xr - x0) / (x1 - x0) * 100:.1f}% {(mo_track[xr] - y0) / (y1 - y0) * 100:.1f}%; }}')

Image.fromarray(head.astype(np.uint8), 'RGBA').save('assets/head.webp', 'WEBP', quality=92, method=6)
Image.fromarray(back.astype(np.uint8), 'RGBA').save('assets/back.webp', 'WEBP', quality=92, method=6)

# ---------------- eyes (interior crops, clipped in CSS to the eye opening) ----------------
EYES = {
    'left':  [(400, 395), (410, 388), (425, 383), (440, 381), (455, 382), (470, 385), (484, 391), (492, 397), (484, 401), (465, 403), (445, 403), (425, 402), (410, 400), (402, 398)],
    'right': [(602, 397), (612, 390), (626, 385), (642, 383), (656, 384), (670, 388), (682, 393), (690, 399), (682, 404), (665, 406), (645, 406), (626, 405), (612, 403), (604, 400)],
}
M = 12
for name, poly in EYES.items():
    xs = [p[0] for p in poly]; ys2 = [p[1] for p in poly]
    cx0, cy0, cx1, cy1 = min(xs) - M, min(ys2) - M, max(xs) + M, max(ys2) + M
    base.crop((cx0, cy0, cx1, cy1)).save(f'assets/eye-{name}.png', optimize=True)
    cw, ch = cx1 - cx0, cy1 - cy0
    pts = ', '.join(f'{(x - cx0) / cw * 100:.1f}% {(y - cy0) / ch * 100:.1f}%' for x, y in poly)
    geom[f'eye--{name}'] = (cx0, cy0, cw, ch, pts)

print(f'.head{{ transform-origin: {PIVOT[0] / W * 100:.2f}% {PIVOT[1] / H * 100:.2f}%; }}')
for k, g in geom.items():
    x0, y0, w, h = g[:4]
    print(f'.{k}{{ left:{x0 / W * 100:.3f}%; top:{y0 / H * 100:.3f}%; width:{w / W * 100:.3f}%; height:{h / H * 100:.3f}%; }} /* {w}x{h} */')
    if len(g) > 4: print(f'.{k}{{ clip-path: polygon({g[4]}); }}')

# ---------------- previews ----------------
bg = (244, 250, 254, 255)
def on_bg(a):
    c = Image.new('RGBA', (W, H), bg); c.alpha_composite(Image.fromarray(a.astype(np.uint8), 'RGBA')); return c
on_bg(head).save('/tmp/l_head.png'); on_bg(back).save('/tmp/l_back.png')
