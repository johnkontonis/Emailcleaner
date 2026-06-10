#!/usr/bin/env python3
"""Generate original home-screen icons for the 82-0 web app (no deps).

Draws a basketball mark on the app's dark/gold theme and writes PNGs with a
hand-rolled encoder, so it works without Pillow/ImageMagick. Original artwork —
no team logos or copyrighted material.
"""
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

BG_TOP = (26, 33, 48)
BG_BOT = (9, 12, 20)
BALL = (245, 185, 66)
BALL_EDGE = (190, 140, 40)
SEAM = (24, 18, 8)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def render(n):
    """Render an n x n RGBA bytearray (supersampled, then it's the master)."""
    buf = bytearray(n * n * 4)
    cx = cy = n / 2
    R = n * 0.33
    lw = n * 0.016  # seam line half-width
    for y in range(n):
        t = y / n
        bg = lerp(BG_TOP, BG_BOT, t)
        for x in range(n):
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            if d <= R:
                col = BALL
                # vertical + horizontal seams
                if abs(dx) < lw or abs(dy) < lw:
                    col = SEAM
                # two curved side seams (arcs of circles centered off-axis)
                for sgn in (-1, 1):
                    acx = cx + sgn * R
                    if abs(math.hypot(x - acx, y - cy) - R) < lw:
                        col = SEAM
                if d > R - n * 0.025:  # rim shading
                    col = BALL_EDGE
            else:
                col = bg
            i = (y * n + x) * 4
            buf[i] = col[0]
            buf[i + 1] = col[1]
            buf[i + 2] = col[2]
            buf[i + 3] = 255
    return buf, n


def downsample(master, mn, size):
    """Area-average master (mn x mn) down to size x size."""
    out = bytearray(size * size * 4)
    scale = mn / size
    for oy in range(size):
        y0, y1 = int(oy * scale), max(int(oy * scale) + 1, int((oy + 1) * scale))
        for ox in range(size):
            x0, x1 = int(ox * scale), max(int(ox * scale) + 1, int((ox + 1) * scale))
            r = g = b = cnt = 0
            for yy in range(y0, y1):
                for xx in range(x0, x1):
                    i = (yy * mn + xx) * 4
                    r += master[i]
                    g += master[i + 1]
                    b += master[i + 2]
                    cnt += 1
            j = (oy * size + ox) * 4
            out[j] = r // cnt
            out[j + 1] = g // cnt
            out[j + 2] = b // cnt
            out[j + 3] = 255
    return out


def png(width, height, rgba):
    def chunk(typ, data):
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    raw = bytearray()
    row = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * row : (y + 1) * row])
    idat = zlib.compress(bytes(raw), 9)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def main():
    master_n = 1024
    print("rendering master…")
    master, mn = render(master_n)
    for size, name in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
        print(f"writing {name} ({size}px)…")
        data = master if size == mn else downsample(master, mn, size)
        (OUT / name).write_bytes(png(size, size, data))
    print("done:", ", ".join(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
