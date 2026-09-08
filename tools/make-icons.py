#!/usr/bin/env python3
"""Generate every app icon from the ASCII brand mark.

The mark is three lanes:

     ▄  ▄  ▄
     █  █  █
     █  █  █
     █  █  █
     ▀  ▀  ▀

On a 9x5 character grid the bars sit in columns 1, 4 and 7, and each bar runs
from halfway down the first row (▄) to halfway down the last row (▀), so it is
four rows tall. A monospace cell is 0.6 as wide as it is tall, which makes the
inked area 7 bar-widths across and 20/3 bar-widths tall: very nearly square.

Everything below is derived from that, so the icons and the ASCII cannot drift
apart. Re-run after changing the geometry:

    python3 tools/make-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

TRANSPARENT = (0, 0, 0, 0)
BG_BLACK = (0, 0, 0, 255)    # used only for iOS home screen apple-touch-icon
FG = (255, 176, 0, 255)      # --amber

BARS = 3
BAR_UNITS = 1                # each bar is one unit wide
GAP_UNITS = 2                # two units of space between bars
INK_UNITS_W = BARS * BAR_UNITS + (BARS - 1) * GAP_UNITS   # 7
INK_UNITS_H = 20 / 3         # 4 rows / 0.6 cell aspect

TARGET_INK_FRACTION = 0.72   # how much of the canvas the mark fills
OUT = Path(__file__).resolve().parent.parent


def render(size: int, bg=TRANSPARENT) -> Image.Image:
    """Draw the mark at `size` px, snapped to whole pixels so it stays crisp."""
    bar_w = max(1, round(size * TARGET_INK_FRACTION / INK_UNITS_W))
    bar_h = round(bar_w * INK_UNITS_H)

    # Never let the bars run past the canvas at very small sizes.
    while bar_h > size - 2 and bar_w > 1:
        bar_w -= 1
        bar_h = round(bar_w * INK_UNITS_H)

    ink_w = INK_UNITS_W * bar_w
    x0 = (size - ink_w) // 2
    y0 = (size - bar_h) // 2

    img = Image.new("RGBA", (size, size), bg)
    draw = ImageDraw.Draw(img)
    for i in range(BARS):
        x = x0 + i * (BAR_UNITS + GAP_UNITS) * bar_w
        draw.rectangle([x, y0, x + bar_w - 1, y0 + bar_h - 1], fill=FG)
    return img


def main() -> None:
    # 1. Generate crisp vector SVG icon (transparent)
    svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="15" y="16" width="10" height="67" fill="#ffb000"/>
  <rect x="45" y="16" width="10" height="67" fill="#ffb000"/>
  <rect x="75" y="16" width="10" height="67" fill="#ffb000"/>
</svg>
"""
    (OUT / "icon.svg").write_text(svg_content)
    print("icon.svg                  vector (transparent)")

    svg_black = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="15" y="16" width="10" height="67" fill="#000000"/>
  <rect x="45" y="16" width="10" height="67" fill="#000000"/>
  <rect x="75" y="16" width="10" height="67" fill="#000000"/>
</svg>
"""
    (OUT / "icon-black.svg").write_text(svg_black)
    print("icon-black.svg            vector (black, transparent)")

    # 2. Transparent PNGs for browser tabs and manifest
    pngs = {
        "icon.png": 512,             # master
        "icon-512.png": 512,         # manifest
        "icon-192.png": 192,         # manifest
        "icon-32.png": 32,           # standard browser favicon
        "icon-16.png": 16,           # standard browser favicon
    }
    for name, size in pngs.items():
        img = render(size, bg=TRANSPARENT)
        img.save(OUT / name, "PNG", optimize=True)
        print(f"{name:24} {size}x{size} (transparent)")

    # 3. Apple touch icon (transparent background)
    touch_img = render(180, bg=TRANSPARENT)
    touch_img.save(OUT / "apple-touch-icon.png", "PNG", optimize=True)
    print(f"{'apple-touch-icon.png':24} 180x180 (transparent)")

    # 4. Multi-res favicon.ico with transparent background
    ico_sizes = [16, 32, 48, 64]
    base = render(max(ico_sizes), bg=TRANSPARENT)
    base.save(OUT / "favicon.ico", format="ICO", sizes=[(s, s) for s in ico_sizes])
    print(f"{'favicon.ico':24} {', '.join(f'{s}x{s}' for s in ico_sizes)} (transparent)")


if __name__ == "__main__":
    main()
