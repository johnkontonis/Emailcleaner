#!/usr/bin/env python3
"""Generate the app icons. Re-run after changing the mark or palette:

    python3 scripts/make_icons.py

Writes icons/icon-192.png, icons/icon-512.png and icons/apple-touch-icon.png.
Uses Pillow if it is available, and falls back to hand-written PNG chunks so the
icons can still be produced in a bare environment.
"""

import os
import struct
import zlib

BG = (18, 24, 31)
FG = (53, 192, 138)
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

SIZES = {"icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180}


def draw(size):
    """A split square: the costing mark, half filled, half outlined."""
    px = [[BG for _ in range(size)] for _ in range(size)]
    pad = round(size * 0.22)
    inner = size - 2 * pad
    stroke = max(2, round(size * 0.055))
    mid = pad + inner // 2

    for y in range(pad, pad + inner):
        for x in range(pad, pad + inner):
            on_border = (
                y < pad + stroke
                or y >= pad + inner - stroke
                or x < pad + stroke
                or x >= pad + inner - stroke
            )
            if x < mid or on_border:
                px[y][x] = FG
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
