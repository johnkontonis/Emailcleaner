#!/usr/bin/env python3
"""Generate the Roost app icons. Re-run after changing the mark or palette:

    python3 scripts/make_icons.py

Writes icons/icon-192.png, icons/icon-512.png and icons/apple-touch-icon.png.
Draws the roost mark — comb, head, beak, perch — in G&T brand amber on brand
black, matching the inline SVG in index.html. Hand-written PNG chunks, so it
runs in a bare environment with no imaging libraries.
"""

import os
import struct
import zlib

BG = (26, 26, 26)      # G&T brand black #1A1A1A
FG = (232, 160, 32)    # G&T brand amber #E8A020
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

SIZES = {"icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180}


def draw(size):
    """The roost mark on a 0–90 design grid, scaled to the icon size."""
    px = [[BG for _ in range(size)] for _ in range(size)]
    s = size / 90.0

    def circle(cx, cy, r, colour):
        cx, cy, r = cx * s, cy * s, r * s
        x0, x1 = max(0, int(cx - r) - 1), min(size, int(cx + r) + 2)
        y0, y1 = max(0, int(cy - r) - 1), min(size, int(cy + r) + 2)
        for y in range(y0, y1):
            for x in range(x0, x1):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                    px[y][x] = colour

    def triangle(p1, p2, p3, colour):
        pts = [(x * s, y * s) for x, y in (p1, p2, p3)]
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]

        def side(a, b, x, y):
            return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])

        for y in range(max(0, int(min(ys))), min(size, int(max(ys)) + 2)):
            for x in range(max(0, int(min(xs))), min(size, int(max(xs)) + 2)):
                cx, cy = x + 0.5, y + 0.5
                d1 = side(pts[0], pts[1], cx, cy)
                d2 = side(pts[1], pts[2], cx, cy)
                d3 = side(pts[2], pts[0], cx, cy)
                if (d1 >= 0 and d2 >= 0 and d3 >= 0) or (d1 <= 0 and d2 <= 0 and d3 <= 0):
                    px[y][x] = colour

    def bar(x, y, w, h, colour):
        for yy in range(int(y * s), min(size, int((y + h) * s) + 1)):
            for xx in range(int(x * s), min(size, int((x + w) * s) + 1)):
                px[yy][xx] = colour

    # comb
    circle(30, 24, 9, FG)
    circle(45, 17, 9, FG)
    circle(60, 24, 9, FG)
    # head, beak, eye
    circle(45, 46, 23, FG)
    triangle((66, 40), (82, 47), (66, 54), FG)
    circle(53, 40, 4, BG)
    # the perch
    bar(12, 74, 66, 6, FG)
    return px


def write_png(path, px):
    size = len(px)
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("3B", *px[y][x]) for x in range(size))
        for y in range(size)
    )

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as fh:
        fh.write(png)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, size in SIZES.items():
        path = os.path.join(OUT, name)
        write_png(path, draw(size))
        print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    main()
