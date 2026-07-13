# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Generate ModHeaders extension icons.

Run:
    uv run tools/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

SIZES = (16, 32, 48, 128)

# Engineering instrumentation aesthetic:
# warm near-black tile with electric-lime mark.
BG = (10, 10, 9)            # #0a0a09
FG = (190, 242, 100)        # #bef264 lime


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded-square solid background
    radius = max(2, size // 5)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BG)

    # Subtle inner stroke for crispness on light backgrounds
    inner_alpha = (FG[0], FG[1], FG[2], 38)
    draw.rounded_rectangle(
        (0, 0, size - 1, size - 1),
        radius=radius,
        outline=inner_alpha,
        width=max(1, size // 64),
    )

    # Three horizontal lines + filled square block ("header" mark)
    line_w = max(1, round(size * 0.10))
    pad_x = round(size * 0.22)
    right = size - pad_x
    short_right = pad_x + round((right - pad_x) * 0.58)

    y_top = round(size * 0.30)
    y_mid = round(size * 0.50)
    y_bot = round(size * 0.70)

    # Square (not round) caps — matches the CSS stroke-linecap: square
    for x_end, y in ((right, y_top), (short_right, y_mid), (right, y_bot)):
        draw.rectangle(
            (pad_x - line_w / 2, y - line_w / 2, x_end + line_w / 2, y + line_w / 2),
            fill=FG,
        )

    # Solid square block on the right of the middle line
    block_size = max(3, round(size * 0.15))
    cx = right
    cy = y_mid
    draw.rectangle(
        (cx - block_size / 2, cy - block_size / 2, cx + block_size / 2, cy + block_size / 2),
        fill=FG,
    )

    return img


def main():
    for s in SIZES:
        path = OUT / f"icon-{s}.png"
        make_icon(s).save(path)
        print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
