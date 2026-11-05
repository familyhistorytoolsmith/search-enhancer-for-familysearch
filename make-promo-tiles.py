"""Chrome Web Store promo tiles for Search Enhancer for FamilySearch.

Writes two PNGs into store/:
  promo-tile-440x280.png   the small promo tile
  marquee-1400x560.png     the marquee promo tile

Design (the checklist's item 2.6, 31 October 2026): the blue icon on the left, the name and
"Unofficial · pre-filled record searches" on the right, on a plain light background. The marquee
adds the site list underneath. Nothing of FamilySearch's own artwork is used; the icon is
redrawn here at tile resolution from the shipped icon128.png's geometry (a 128-px bitmap would
go soft at marquee size).

The help page (docs/index.html) uses the same two tiles as its banner - the marquee on a wide screen,
the small tile on a phone. A default run therefore also fills docs/img/ (GitHub Pages serves docs/
only): a copy of both tiles, plus promo-tile-880x560.png, the small tile at twice the size for the
dense screens phones have.

Run:  python make-promo-tiles.py            (from the repo root; needs Pillow + Segoe UI fonts)
      python make-promo-tiles.py <outdir>   (elsewhere, e.g. for a preview; docs/img/ is left alone)
"""

import os
import shutil
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "store")
WEB_DIR = None if len(sys.argv) > 1 else os.path.join(HERE, "docs", "img")   # the help page's copies
FONT_DIR = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")

# Palette — the Feature Guide's / checklist's house colours plus the icon's blues.
NAVY = (31, 58, 95)        # #1f3a5f  title
INK = (27, 27, 27)         # #1b1b1b
MUTED = (90, 98, 112)      # #5a6270  secondary text
BG = (246, 248, 251)       # #f6f8fb  plain light background
ICON_BLUE_TL = (37, 108, 154)
ICON_BLUE_BR = (22, 78, 115)
ICON_DARK = (33, 43, 48)   # #212b30  magnifier
ICON_YELLOW = (255, 196, 0)
ICON_LINE = (122, 143, 156)
ICON_LENS = (241, 250, 255)
ICON_LENS_EDGE = (115, 157, 184)

SS = 2  # supersampling factor: draw at 2x, downscale with Lanczos


def font(name, px):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), px)


# ----------------------------------------------------------------------------------------------
# The icon, redrawn. `size` = the finished edge in pixels; everything is scaled from the 128 grid.
# ----------------------------------------------------------------------------------------------
def draw_icon(size):
    s = size / 128.0
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Blue rounded square with a diagonal gradient (top-left lighter, bottom-right darker).
    grad = Image.new("RGBA", (size, size))
    gp = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2.0 * (size - 1))
            gp[x, y] = tuple(int(a + (b - a) * t) for a, b in zip(ICON_BLUE_TL, ICON_BLUE_BR)) + (255,)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([4 * s, 4 * s, 123 * s, 123 * s], radius=14 * s, fill=255)
    im.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(im)
    # The page: a pale border, then white, then the yellow header band and three grey lines.
    d.rounded_rectangle([31 * s, 27 * s, 88 * s, 98 * s], radius=2.5 * s, fill=(185, 196, 201))
    d.rounded_rectangle([34 * s, 30 * s, 85 * s, 95 * s], radius=2 * s, fill=(255, 255, 255))
    d.rounded_rectangle([34 * s, 30 * s, 85 * s, 42 * s], radius=2 * s, fill=ICON_YELLOW)
    d.rectangle([34 * s, 36 * s, 85 * s, 40 * s], fill=ICON_YELLOW)
    for y in (49, 58, 67, 76):
        d.rectangle([39 * s, y * s, 80 * s, (y + 1.6) * s], fill=ICON_LINE)

    # The magnifier: handle first (under the ring), then the translucent lens, then the ring.
    cx, cy, r = 86 * s, 78 * s, 30 * s
    hx0, hy0 = cx + r * 0.62, cy + r * 0.62
    hx1, hy1 = 118 * s, 116 * s
    d.line([(hx0, hy0), (hx1, hy1)], fill=ICON_DARK, width=int(round(11 * s)))
    d.ellipse([hx1 - 5.5 * s, hy1 - 5.5 * s, hx1 + 5.5 * s, hy1 + 5.5 * s], fill=ICON_DARK)
    # Lens glass: a pale tint that lets the page lines and the blue show through, denser at the
    # centre, bluer and thinner towards the rim (the shipped icon's look).
    inner = r - 5 * s
    steps = max(8, int(inner))
    glass = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    g = ImageDraw.Draw(glass)
    for i in range(steps, 0, -1):
        rr = inner * i / steps
        t = (i / steps) ** 2.2
        col = tuple(int(a + (b - a) * t) for a, b in zip(ICON_LENS, ICON_LENS_EDGE))
        alpha = int(205 - 70 * t)
        g.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col + (alpha,))
    im.alpha_composite(glass)
    d = ImageDraw.Draw(im)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ICON_DARK, width=int(round(6 * s)))
    return im


def fit_font(name, text, max_width, start_px, min_px=10):
    """The largest size (from start_px downwards) at which `text` fits in max_width."""
    px = start_px
    while px > min_px:
        f = font(name, px)
        if f.getlength(text) <= max_width:
            return f
        px -= 1
    return font(name, min_px)


# ----------------------------------------------------------------------------------------------
# The tile. All measurements in finished pixels; drawn at SS x and downscaled.
# ----------------------------------------------------------------------------------------------
def make_tile(width, height, icon_px, margin, gap, title_px, tag_px, sites_px, out_path):
    W, H = width * SS, height * SS
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)

    icon = draw_icon(icon_px * SS)
    ix = margin * SS
    iy = (H - icon.height) // 2
    im.paste(icon, (ix, iy), icon)

    tx = ix + icon.width + gap * SS
    text_w = W - tx - margin * SS

    lines = []  # (text, font, colour, gap-after)
    title_lines = ["Search Enhancer", "for FamilySearch"]
    tf = min((fit_font("seguisb.ttf", t, text_w, title_px * SS) for t in title_lines), key=lambda f: f.size)
    for t in title_lines:
        lines.append((t, tf, NAVY, int(tf.size * 0.06)))
    lines[-1] = (lines[-1][0], tf, NAVY, int(tf.size * 0.42))

    tag = "Unofficial  \u00b7  pre-filled record searches"
    gf = fit_font("segoeui.ttf", tag, text_w, tag_px * SS)
    lines.append((tag, gf, INK, int(gf.size * 0.45)))

    if sites_px:
        sites = ["Ancestry \u00b7 MyHeritage \u00b7 Findmypast \u00b7 FreeBMD \u00b7 GRO Index",
                 "ScotlandsPeople \u00b7 RootsIreland \u00b7 IrishGenealogy \u00b7 newspapers"]
        sf = min((fit_font("segoeui.ttf", t, text_w, sites_px * SS) for t in sites), key=lambda f: f.size)
        for t in sites:
            lines.append((t, sf, MUTED, int(sf.size * 0.25)))

    # Measure the block (ascent/descent from the font metrics, not the glyph boxes, so lines sit evenly).
    heights = []
    for text, f, col, after in lines:
        asc, desc = f.getmetrics()
        heights.append(asc + desc)
    total = sum(heights) + sum(l[3] for l in lines[:-1])
    y = (H - total) // 2
    for (text, f, col, after), h in zip(lines, heights):
        d.text((tx, y), text, font=f, fill=col)
        y += h + after

    final = im.resize((width, height), Image.LANCZOS)
    final.save(out_path, optimize=True)
    return final


SMALL_NAME = "promo-tile-440x280.png"
MARQUEE_NAME = "marquee-1400x560.png"


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    small = make_tile(440, 280, icon_px=150, margin=34, gap=30, title_px=34, tag_px=16, sites_px=0,
                      out_path=os.path.join(OUT_DIR, SMALL_NAME))
    marquee = make_tile(1400, 560, icon_px=300, margin=120, gap=84, title_px=78, tag_px=36, sites_px=27,
                        out_path=os.path.join(OUT_DIR, MARQUEE_NAME))
    for name, im in ((SMALL_NAME, small), (MARQUEE_NAME, marquee)):
        print(f"{name}: {im.size[0]}x{im.size[1]}")

    if WEB_DIR:
        os.makedirs(WEB_DIR, exist_ok=True)
        for name in (SMALL_NAME, MARQUEE_NAME):
            shutil.copyfile(os.path.join(OUT_DIR, name), os.path.join(WEB_DIR, name))
        # The small tile's measurements, doubled.
        big = make_tile(880, 560, icon_px=300, margin=68, gap=60, title_px=68, tag_px=32, sites_px=0,
                        out_path=os.path.join(WEB_DIR, "promo-tile-880x560.png"))
        print(f"docs/img: both tiles copied, promo-tile-880x560.png: {big.size[0]}x{big.size[1]}")


if __name__ == "__main__":
    main()
