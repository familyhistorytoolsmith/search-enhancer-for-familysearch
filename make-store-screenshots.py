"""Composes the Chrome Web Store screenshots (1280x800) from Kevin's 4K captures (3840x2160, the
person page at his usual zoom, the Search Records card in the right column at x 2456-3520).

    python make-store-screenshots.py 2.1 before.jpg after.jpg [out.png]
    python make-store-screenshots.py 2.2 findmypast.jpg ancestry.jpg [out.png]
    python make-store-screenshots.py 2.3 gro-menu.jpg gro-results.jpg [out.png]

2.1 - the Search Records card before and after, side by side (the release checklist's item 2.1). Both
      captures must be the same person at the same scroll position, so the card sits at the same place;
      the card is located by its border lines, cropped, scaled to one width and laid out left (before)
      and right (after) with a thin divider. The after card runs past the bottom of the capture (the
      menu is long), so its lower edge fades out.
2.2 - two partner menus side by side: Findmypast open on Doris Marjorie Withers (the whole card, from
      its top: the sibling rows show that every partner row is a menu) and Ancestry open on George
      Wilson Stephenson (a fragment of the card from just above its row, the capture being scrolled).
      The crop points are the text-row positions measured on those two captures (ROWS_22).
2.3 - the GRO automation: the GRO Index menu open (a fragment of the card around it, Doris Marjorie
      Withers) top left, what the click does beside it, and across the bottom the gro.gov.uk results
      strip that click produced - the one record found, with the mother's maiden name the form was
      given. (The checklist proposed FreeBMD too; the site was down when the captures were taken.)

Only the card is used - the FamilySearch header with the user's name never reaches the output.
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 800
FONT_DIR = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
NAVY = (31, 58, 95)        # #1f3a5f  title (the promo tiles' colour)
INK = (27, 27, 27)
MUTED = (90, 98, 112)
BG = (246, 248, 251)       # #f6f8fb  the promo tiles' background
DIVIDER = (205, 211, 222)

MARGIN = 24
GAP = 40                   # between the two cards; the divider runs down its middle
RADIUS_SRC = 16            # the FamilySearch card's corner radius at 4K (approximate)
FADE_PX = 64               # a card running off the capture: its fade-out height (output px)
CARD_SIDES = (2456, 3520)  # the card's left and right border columns in every capture of this layout


def font(name, px):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), px)


# ----------------------------------------------------------------------------- finding the card

def card_box(im, min_run=800):
    """The Search Records card's bounding box (left, top, right, bottom), found by its border lines.

    A card border is a run of dark pixels at least `min_run` wide on one row, right of the page's
    middle (the right column: Research Help above, Search Records below) and never page-wide (the maroon
    header bar). A line with white below it and page grey above is a card's TOP, the reverse a BOTTOM;
    the lowest top is the Search Records card, paired with the next bottom - None when the card runs off
    the capture. The vertical borders sit a corner radius outside the top line's run, so they are read
    off a blank row just inside the card.
    """
    g = im.convert("L")
    px = g.load()
    half = im.width // 2
    max_run = int(im.width * 0.45)
    runs = []  # (y, x_start, x_end)
    for y in range(im.height):
        x = half
        while x < im.width:
            if px[x, y] < 200:
                x0 = x
                while x < im.width and px[x, y] < 200:
                    x += 1
                if min_run <= x - x0 <= max_run:  # a card's width, never a page-wide bar
                    runs.append((y, x0, x - 1))
            x += 1
    lines = []  # [y_first, y_last, a, b]
    for y, a, b in runs:
        if lines and y - lines[-1][1] <= 3:
            lines[-1][1] = y
            lines[-1][2], lines[-1][3] = min(a, lines[-1][2]), max(b, lines[-1][3])
        else:
            lines.append([y, y, a, b])

    def kind(ln):
        y0, y1, a, b = ln
        mid = (a + b) // 2
        below = px[mid, min(im.height - 1, y1 + 6)]
        above = px[mid, max(0, y0 - 6)]
        return "top" if below >= 250 and above < 250 else "bottom"

    tops = [ln for ln in lines if kind(ln) == "top"]
    if not tops:
        raise SystemExit("no card top found - is this a FamilySearch person page capture?")
    top = tops[-1]
    bottoms = [ln for ln in lines if kind(ln) == "bottom" and ln[0] > top[1]]
    bottom = bottoms[0][0] if bottoms else None
    # the vertical borders: the dark columns just outside the top line's run, on a blank row inside
    y = top[1] + 8
    a, b = top[2], top[3]
    lefts = [x for x in range(a - 24, a + 1) if px[x, y] < 200]
    rights = [x for x in range(b, b + 25) if px[x, y] < 200]
    left = lefts[0] if lefts else a
    right = rights[-1] if rights else b
    return left, top[0], right, bottom


# ----------------------------------------------------------------------------- drawing

def fragment(im, box, width, fade=(0, 0), rounded=(True, True)):
    """A piece of the card cropped at `box` (left, top, right, bottom - inclusive source px), scaled to
    `width`, as RGBA: corners rounded on the edges that are real card borders, the other edges faded
    over `fade` = (top px, bottom px) of OUTPUT height."""
    left, top, right, bottom = box
    crop = im.crop((left, top, right + 1, bottom + 1))
    scale = width / crop.width
    size = (width, max(1, round(crop.height * scale)))
    card = crop.resize(size, Image.LANCZOS).convert("RGBA")
    r = max(4, round(RADIUS_SRC * scale))
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    y0 = 0 if rounded[0] else -r            # an unrounded edge: push the rectangle's corners off-canvas
    y1 = size[1] - 1 if rounded[1] else size[1] - 1 + r
    d.rounded_rectangle((0, y0, size[0] - 1, y1), radius=r, fill=255)
    ft, fb = fade
    for y in range(0, ft):
        d.line((0, y, size[0], y), fill=round(255 * y / ft))
    for y in range(size[1] - fb, size[1]):
        d.line((0, y, size[0], y), fill=round(255 * (size[1] - y) / fb))
    card.putalpha(mask)
    return card


def shadow_for(card, fade=(0, 0), blur=10, offset=(0, 4), alpha=70):
    """A soft shadow under the card. Where the card fades, the shadow is gone BEFORE the fade starts
    (else it shows through the translucent band as a grey stripe)."""
    pad = blur * 3
    size = (card.width + pad * 2, card.height + pad * 2)
    sh = Image.new("RGBA", size, (0, 0, 0, 0))
    a = card.getchannel("A").point(lambda v: v * alpha // 255)
    sh.paste((20, 30, 50, 255), (pad + offset[0], pad + offset[1]), a)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    ft, fb = fade
    if ft or fb:
        ramp = Image.new("L", size, 255)
        d = ImageDraw.Draw(ramp)
        if ft:
            start = pad + ft
            for y in range(0, start + 40):
                d.line((0, y, size[0], y), fill=max(0, round(255 * (y - start) / 40)))
        if fb:
            end = pad + card.height - fb
            for y in range(end - 40, size[1]):
                d.line((0, y, size[0], y), fill=max(0, round(255 * (end - y) / 40)))
        sh.putalpha(ImageChops.multiply(sh.getchannel("A"), ramp))
    return sh, pad


def text_centered(draw, cx, y, text, f, fill):
    w = draw.textlength(text, font=f)
    draw.text((cx - w / 2, y), text, font=f, fill=fill)


def page(labels, cards, fades, top, note=None, note_under=1, title_px=32, sub_px=17):
    """Two cards side by side with headings, a divider and an optional note under one card."""
    canvas = Image.new("RGBA", (W, H), BG + (255,))
    draw = ImageDraw.Draw(canvas)
    title_f, sub_f, note_f = font("seguisb.ttf", title_px), font("segoeui.ttf", sub_px), font("segoeui.ttf", 16)
    card_w = cards[0].width
    x0 = (W - (2 * card_w + GAP)) // 2
    xs = (x0, x0 + card_w + GAP)
    for x, (title, sub), card, fade in zip(xs, labels, cards, fades):
        cx = x + card_w / 2
        text_centered(draw, cx, top - 78, title, title_f, NAVY)
        text_centered(draw, cx, top - 34, sub, sub_f, MUTED)
        sh, pad = shadow_for(card, fade)
        canvas.alpha_composite(sh, (x - pad, top - pad))
        canvas.alpha_composite(card, (x, top))
    dx = x0 + card_w + GAP // 2
    dh = max(c.height for c in cards)
    draw.line((dx, top, dx, top + dh - FADE_PX // 2), fill=DIVIDER, width=1)
    if note:
        glyph, text = note
        ny = top + cards[note_under].height + 14
        if ny + 24 <= H - 12:
            nx = xs[note_under] + 4
            if glyph:
                tick_f = font("seguisym.ttf", 16)  # Segoe UI has no check mark; Segoe UI Symbol does
                draw.text((nx, ny), glyph, font=tick_f, fill=MUTED)
                nx += draw.textlength(glyph, font=tick_f)
            draw.text((nx, ny), text, font=note_f, fill=MUTED)
    return canvas.convert("RGB")


# ----------------------------------------------------------------------------- the shots

def compose21(before_path, after_path, out_path):
    before = Image.open(before_path).convert("RGB")
    after = Image.open(after_path).convert("RGB")
    bb, ab = card_box(before), card_box(after)
    print("before card", bb, "after card", ab)
    card_w = (W - 2 * MARGIN - GAP) // 2
    cards, fades = [], []
    for src, box in ((before, bb), (after, ab)):
        left, top, right, bottom = box
        off = bottom is None
        fade = (0, FADE_PX if off else 0)
        cards.append(fragment(src, (left, top, right, src.height - 1 if off else bottom), card_w, fade, (True, not off)))
        fades.append(fade)
    labels = (("Before", "FamilySearch\u2019s own Search Records panel"),
              ("After", "with Search Enhancer: the FamilySearch menu opened"))
    out = page(labels, cards, fades, top=100,
               note=("\u2713", " greyed entries: a matching record is already attached to this person"))
    out.save(out_path, optimize=True)
    print("wrote", out_path, out.size)


# Text-row positions (source y) measured on the two 2.2 captures - the crop points below are chosen
# between rows so no line of text is cut. Findmypast (Doris): card top 449 ... FreeBMD row 2056-2081,
# GRO Index row 2137- (cut by the capture). Ancestry (George): FamilySearch row text ends 449, the
# Ancestry row 484-534 ... Public Member Trees 2115-2141, capture ends 2159.
ROWS_22 = {
    "findmypast": {"top": 449, "bottom": 2125, "fade": (0, 14), "rounded": (True, False), "caret": (2578, 860, 940)},
    "ancestry": {"top": 462, "bottom": 2159, "fade": (11, 0), "rounded": (False, False), "caret": (2578, 470, 550)},
}


def erase_caret(im, x, y0, y1):
    """The text caret the click left before the opened row's label (a 2px dark bar at column `x`,
    51px tall, in both 2.2 captures - the label text starts 2-4px to its right) is painted white."""
    px = im.convert("L").load()
    ys = [y for y in range(y0, y1) if px[x, y] < 120]
    if not ys:
        return im
    im = im.copy()
    ImageDraw.Draw(im).rectangle((x - 2, ys[0] - 2, x + 1, ys[-1] + 2), fill=(255, 255, 255))
    return im


def compose22(fmp_path, anc_path, out_path, top=88):
    fmp = Image.open(fmp_path).convert("RGB")
    anc = Image.open(anc_path).convert("RGB")
    left, right = CARD_SIDES
    avail = H - top - 24
    tallest = max(r["bottom"] - r["top"] + 1 for r in ROWS_22.values())
    scale = avail / tallest
    card_w = round((right - left + 1) * scale)
    cards, fades = [], []
    for src, key in ((fmp, "findmypast"), (anc, "ancestry")):
        r = ROWS_22[key]
        if "caret" in r:
            src = erase_caret(src, *r["caret"])
        cards.append(fragment(src, (left, r["top"], right, r["bottom"]), card_w, r["fade"], r["rounded"]))
        fades.append(r["fade"])
    labels = (("Findmypast", "Doris Marjorie Withers, 1902\u20131980"),
              ("Ancestry", "George Wilson Stephenson, 1832\u20131889"))
    out = page(labels, cards, fades, top=top, title_px=30, sub_px=16)
    out.save(out_path, optimize=True)
    print("wrote", out_path, out.size, "cards", [c.size for c in cards], "scale %.3f" % scale)


# 2.3 crop points, measured on the two captures (Doris Marjorie Withers LHWF-ZSP). The menu is a
# fragment of the Search Records card from above the FreeBMD row to below the Newspapers row (rows
# 1601-1945: FreeBMD, GRO Index open, BIRTHS, "GRO births - 1902 +-2", Newspapers), the caret the
# click left before "GRO Index" erased. The results strip is the gro.gov.uk results table: its header,
# the one highlighted record and the "1 Record(s) Found" lines (the ordering-options box above is noise).
ROWS_23 = {
    "gro": {"top": 1572, "bottom": 1972, "fade": (8, 8), "rounded": (False, False), "caret": (2578, 1655, 1735)},
    "results": {"box": (520, 1335, 2125, 1700)},
}


def wrap(draw, text, f, width):
    """Word-wrap `text` to `width` px for font `f`."""
    lines, line = [], ""
    for word in text.split():
        probe = (line + " " + word).strip()
        if draw.textlength(probe, font=f) <= width:
            line = probe
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def compose23(menu_path, results_path, out_path):
    menu = Image.open(menu_path).convert("RGB")
    results = Image.open(results_path).convert("RGB")
    left, right = CARD_SIDES
    canvas = Image.new("RGBA", (W, H), BG + (255,))
    draw = ImageDraw.Draw(canvas)
    title_f, sub_f = font("seguisb.ttf", 30), font("segoeui.ttf", 16)
    head_f, body_f = font("seguisb.ttf", 21), font("segoeui.ttf", 17)

    text_centered(draw, W / 2, 16, "The GRO index, searched in one click", title_f, NAVY)
    text_centered(draw, W / 2, 56,
                  "gro.gov.uk has no search links, so the extension fills its form from the tree and presses Search",
                  sub_f, MUTED)

    # top left: the menu fragment
    r = ROWS_23["gro"]
    top, x = 108, 40
    card_w = 660
    card = fragment(erase_caret(menu, *r["caret"]), (left, r["top"], right, r["bottom"]), card_w, r["fade"], r["rounded"])
    sh, pad = shadow_for(card, r["fade"])
    canvas.alpha_composite(sh, (x - pad, top - pad))
    canvas.alpha_composite(card, (x, top))

    # top right: what the click does
    tx, tw = x + card_w + 48, W - (x + card_w + 48) - 40
    y = top + 2
    draw.text((tx, y), "GRO births \u2014 1902 \u00b12: what the click does", font=head_f, fill=NAVY)
    y += 40
    paras = ("Opens gro.gov.uk in one reused tab and fills its form from the tree: surname, forenames, sex, "
             "the year 1902 \u00b12 and the mother\u2019s maiden name, Milner.",
             "Presses Search for you. Logged out? It waits for your login, then runs the search.")
    for para in paras:
        for line in wrap(draw, para, body_f, tw):
            draw.text((tx, y), line, font=body_f, fill=INK)
            y += 25
        y += 10

    # bottom: the results strip, full width
    bx = ROWS_23["results"]["box"]
    strip_w = 1200
    strip = fragment(results, bx, strip_w, (0, 0), (True, True))
    strip_top = max(top + card.height, y) + 118
    sx = (W - strip_w) // 2
    text_centered(draw, W / 2, strip_top - 64, "One click later, on gro.gov.uk", font("seguisb.ttf", 26), NAVY)
    text_centered(draw, W / 2, strip_top - 28,
                  "one record \u2014 the mother\u2019s maiden name sent from the tree narrows the index to her",
                  sub_f, MUTED)
    sh, pad = shadow_for(strip)
    canvas.alpha_composite(sh, (sx - pad, strip_top - pad))
    canvas.alpha_composite(strip, (sx, strip_top))
    out = canvas.convert("RGB")
    out.save(out_path, optimize=True)
    print("wrote", out_path, out.size, "menu", card.size, "strip", strip.size, "strip top", strip_top,
          "ends", strip_top + strip.height)


SHOTS = {
    "2.1": (compose21, 2, os.path.join("store", "screenshot-1-search-records-before-after.png")),
    "2.2": (compose22, 2, os.path.join("store", "screenshot-2-partner-menus.png")),
    "2.3": (compose23, 2, os.path.join("store", "screenshot-3-gro-index.png")),
}

if __name__ == "__main__":
    shot = sys.argv[1] if len(sys.argv) > 1 else None
    if shot not in SHOTS or len(sys.argv) < 2 + SHOTS[shot][1]:
        sys.exit(__doc__)
    fn, n, default_out = SHOTS[shot]
    paths = sys.argv[2:2 + n]
    out = sys.argv[2 + n] if len(sys.argv) > 2 + n else default_out
    fn(*paths, out)
