"""
Generates the Pastor app's launcher, PWA and favicon icons.

    python scripts/generate_icons.py

The app had no icon at all — an emoji favicon and no manifest — so there was
nothing for a home screen to show. Rather than invent a mark, this draws the
one the app already uses: the teal "PF" tile at the top of the sign-in screen
(src/features/auth/Login.tsx), same gradient, same Sora ExtraBold, same ink.

Swap in real artwork later by replacing `draw_tile` — the sizes and file names
below are what the manifest and index.html expect.

Sora is read straight from the self-hosted WOFF2 in the Congregant app's
node_modules: FreeType opens WOFF2 and honours its weight axis, so no font
conversion or extra Python packages are needed.
"""

import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
OUT = os.path.join(APP, "public", "icons")
SORA = os.path.join(os.path.dirname(APP), "Congregant", "node_modules",
                    "@fontsource-variable", "sora", "files", "sora-latin-wght-normal.woff2")

# From Login.tsx: linear-gradient(135deg, #00C9A7, #00A88C), label --color-on-accent.
TEAL_TOP = (0x00, 0xC9, 0xA7)
TEAL_BOTTOM = (0x00, 0xA8, 0x8C)
INK = (0x08, 0x12, 0x1F)

# The sign-in tile is rounded-2xl (16px) on 64px: a quarter of its side.
TILE_RADIUS = 0.25
# The sign-in tile sets 20px text on 64px. Slightly larger here, because a
# home-screen icon is read at arm's length and far smaller.
TEXT_HEIGHT = 0.38
# letterSpacing -1px at 20px.
TRACKING_EM = -0.05

SS = 4  # supersampling


def gradient(size):
    """135deg: top-left to bottom-right."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    span = 2 * (size - 1) or 1
    for y in range(size):
        for x in range(size):
            t = (x + y) / span
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TEAL_TOP, TEAL_BOTTOM))
    return img


def draw_label(img):
    """'PF' in Sora 800, optically centred, with the sign-in tile's tracking."""
    size = img.width
    draw = ImageDraw.Draw(img)

    # Size the font by cap height, not em, so the glyphs land at TEXT_HEIGHT.
    probe = ImageFont.truetype(SORA, 1000)
    probe.set_variation_by_axes([800])
    _, top, _, bottom = probe.getbbox("PF")
    font = ImageFont.truetype(SORA, max(1, round(1000 * TEXT_HEIGHT * size / (bottom - top))))
    font.set_variation_by_axes([800])

    tracking = TRACKING_EM * font.size
    widths = [font.getlength(ch) for ch in "PF"]
    total = sum(widths) + tracking * (len(widths) - 1)
    _, g_top, _, g_bottom = font.getbbox("PF")

    x = (size - total) / 2
    y = (size - (g_bottom - g_top)) / 2 - g_top
    for ch, w in zip("PF", widths):
        draw.text((x, y), ch, font=font, fill=INK)
        x += w + tracking


def draw_tile(size, rounded):
    """The full mark at `size`. Rounded corners for browsers; square where the
    platform applies its own mask."""
    big = size * SS
    img = gradient(big)
    draw_label(img)
    img = img.resize((size, size), Image.LANCZOS).convert("RGBA")

    if rounded:
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1],
                                               radius=round(big * TILE_RADIUS), fill=255)
        img.putalpha(mask.resize((size, size), Image.LANCZOS))
    return img


def write(img, name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    img.save(path, "PNG", optimize=True)
    print("  %-40s %6.1f KB" % (os.path.relpath(path, APP), os.path.getsize(path) / 1024))


def main():
    if not os.path.exists(SORA):
        raise SystemExit("Sora not found at %s — run `npm install` in Congregant first." % SORA)

    print("Pastor icons")
    # `any`: the tile exactly as the sign-in screen draws it.
    write(draw_tile(192, rounded=True), "icon-192.png")
    write(draw_tile(512, rounded=True), "icon-512.png")
    # `maskable`: full bleed — Android cuts its own shape. The label is 38% of
    # the side, well inside the 80% safe circle.
    write(draw_tile(512, rounded=False).convert("RGB"), "icon-512-maskable.png")
    # iOS rounds the corners itself and renders transparency as black.
    write(draw_tile(180, rounded=False).convert("RGB"), "apple-touch-icon.png")
    write(draw_tile(32, rounded=True), "favicon-32.png")


if __name__ == "__main__":
    main()
