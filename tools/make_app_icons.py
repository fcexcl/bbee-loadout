"""生成 PWA / favicon 图标（开发辅助；不依赖任何游戏素材）。

用法：
    python tools/make_app_icons.py --out assets
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw

BG = (11, 14, 19, 255)
PANEL = (21, 27, 36, 255)
COLORS = [
    (255, 107, 74, 255),   # 火
    (245, 197, 24, 255),   # 电
    (122, 208, 106, 255),  # 毒
    (87, 184, 255, 255),   # 冰
    (160, 107, 255, 255),  # 暗
    (232, 240, 255, 255),  # 光
    (255, 157, 92, 255),   # 刃
]


def hexagon(cx: float, cy: float, r: float) -> list[tuple[float, float]]:
    return [(cx + r * math.cos(math.pi / 3 * i - math.pi / 6),
             cy + r * math.sin(math.pi / 3 * i - math.pi / 6)) for i in range(6)]


def draw(scale: int) -> Image.Image:
    s = 512 * scale
    im = Image.new("RGBA", (s, s), BG)
    d = ImageDraw.Draw(im)

    def sc(v: float) -> float:
        return v * s / 512

    d.rounded_rectangle([sc(16), sc(16), sc(496), sc(496)], radius=sc(96), fill=PANEL,
                        outline=(42, 52, 66, 255), width=max(1, int(sc(3))))
    cx = cy = sc(256)
    ring = sc(150)
    small = sc(58)
    # 中心 + 六个环上的小六边形
    for i, color in enumerate(COLORS):
        a = math.pi / 3 * i - math.pi / 2
        x, y = cx + ring * math.cos(a), cy + ring * math.sin(a)
        d.polygon(hexagon(x, y, small), fill=color, outline=BG, width=max(1, int(sc(6))))
    d.polygon(hexagon(cx, cy, sc(96)), fill=(207, 214, 224, 255), outline=BG, width=max(1, int(sc(8))))
    d.polygon(hexagon(cx, cy, sc(42)), fill=BG, outline=None)
    return im


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=Path("assets"), type=Path)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    big = draw(1)
    big.save(args.out / "app-512.png", "PNG", optimize=True)
    big.resize((192, 192), Image.LANCZOS).save(args.out / "app-192.png", "PNG", optimize=True)
    big.resize((32, 32), Image.LANCZOS).save(args.out / "favicon-32.png", "PNG", optimize=True)
    for name in ("app-512.png", "app-192.png", "favicon-32.png"):
        print(name, (args.out / name).stat().st_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
