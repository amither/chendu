#!/usr/bin/env python3
"""Draw simple PWA icons (orange square, white sun) as PNG using only the stdlib."""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "public"
ORANGE, WHITE = (252, 139, 23), (255, 255, 255)


def png(size):
    c, r = size / 2, size * 0.28
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            d2 = (x - c + .5) ** 2 + (y - c + .5) ** 2
            row += bytes(WHITE if d2 <= r * r else ORANGE)
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(t, data):
        return struct.pack(">I", len(data)) + t + data + struct.pack(">I", zlib.crc32(t + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


OUT.mkdir(parents=True, exist_ok=True)
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    (OUT / name).write_bytes(png(size))
