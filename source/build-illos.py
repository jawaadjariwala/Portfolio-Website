#!/usr/bin/env python3
"""Split the generated illustrations into two alpha masks so the page can
colour them live from the section palette.

Each source is black linework + one or two flat greys on white. Treating the
drawing as two inks:
    line ink  — coverage rises from the darkest flat grey (fw) down to black
    fill ink  — coverage rises from white down to fw, so a lighter second grey
                lands as a tint of the same fill colour rather than a new one
Anti-aliased edges fall out of the same maths, so the masks stay smooth.

Writes assets/illo-<name>-line.webp and -fill.webp, cropped to content.
"""
import glob, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

MARGIN = 0.02          # of the cropped width, kept around the drawing
MAXW   = 700           # displays at 300 CSS px, so this covers 2x
LEVELS = 16            # alpha steps; see the note in build()

def darkest_flat_grey(g):
    """The grey the artist used as the main fill: darkest tone that survives
    erosion (i.e. covers real area, not just anti-aliased edges)."""
    best = None
    for lo in range(140, 215, 6):
        m = (g >= lo) & (g < lo + 12)
        if m.mean() < 0.004:
            continue
        if ndimage.binary_erosion(m, np.ones((5, 5))).mean() > m.mean() * 0.25:
            best = lo + 6
            break
    return best if best is not None else 160

def build(path, outdir):
    name = os.path.basename(path).replace('illo-', '').replace('.png', '')
    g = np.asarray(Image.open(path).convert('L')).astype(np.float32)
    fw = float(darkest_flat_grey(g))

    line = np.clip((fw - g) / fw, 0, 1)
    fill = np.clip((255.0 - g) / (255.0 - fw), 0, 1)

    ink = np.maximum(line, fill)
    ys, xs = np.where(ink > 0.12)
    pad = int((xs.max() - xs.min()) * MARGIN)
    y0, y1 = max(0, ys.min() - pad), min(g.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(g.shape[1], xs.max() + pad + 1)

    # an opaque silhouette of the whole drawing, so the striped disc behind is
    # knocked out rather than showing through the lighter (tinted) fills
    solid = np.clip(ink * 3.0, 0, 1)

    out = []
    for label, arr in (('line', line), ('fill', fill), ('solid', solid)):
        a = (arr[y0:y1, x0:x1] * 255).astype(np.uint8)
        im = Image.fromarray(a, 'L')
        im.thumbnail((MAXW, MAXW * 3), Image.LANCZOS)
        # Quantise the alpha: flat art only needs a few levels for its
        # anti-aliased edges, and WebP stores alpha losslessly, so this is the
        # only real lever on file size (106KB -> 19KB at 16 levels).
        step = 255 // (LEVELS - 1)
        im = im.point(lambda v: int(round(v * (LEVELS - 1) / 255)) * step)
        # the mask is pure alpha; the colour comes from CSS
        rgba = Image.new('RGBA', im.size, (0, 0, 0, 0)); rgba.putalpha(im)
        f = os.path.join(outdir, 'illo-%s-%s.webp' % (name, label))
        rgba.save(f, quality=80, method=6)
        out.append((f, rgba.size, os.path.getsize(f) // 1024))
    print('%-10s fw=%3d  crop=%dx%d  %s' % (name, fw, x1 - x0, y1 - y0,
          '  '.join('%s %dx%d %dKB' % (os.path.basename(f), s[0], s[1], k) for f, s, k in out)))
    return name, out[0][1]

if __name__ == '__main__':
    outdir = sys.argv[1] if len(sys.argv) > 1 else 'assets'
    for p in sorted(glob.glob('source/raw/illo-*.png')):
        build(p, outdir)
