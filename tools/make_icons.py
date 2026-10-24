"""把游戏内截取的原图批量转成仓库用的 WebP（开发辅助，运行时不需要）。

用法（需要 Pillow）：
    python tools/make_icons.py --src <png 目录> --out icons --size 256 --quality 82

约定：输入 480x480 PNG，输出同名 .webp；不改变卡牌数据，构建脚本只把 .png 换成 .webp。
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, type=Path)
    ap.add_argument("--out", default=Path("icons"), type=Path)
    ap.add_argument("--size", default=256, type=int)
    ap.add_argument("--quality", default=82, type=int)
    ap.add_argument("--expect", default=297, type=int)
    args = ap.parse_args()

    srcs = sorted(args.src.glob("*.png"))
    if args.expect and len(srcs) != args.expect:
        raise SystemExit(f"输入 PNG 数量 {len(srcs)} != {args.expect}：{args.src}")
    args.out.mkdir(parents=True, exist_ok=True)
    total = 0
    biggest = ("", 0)
    for p in srcs:
        with Image.open(p) as im:
            im = im.convert("RGBA")
            im.thumbnail((args.size, args.size), Image.LANCZOS)
            dst = args.out / (p.stem + ".webp")
            im.save(dst, "WEBP", quality=args.quality, method=6)
        n = dst.stat().st_size
        total += n
        if n > biggest[1]:
            biggest = (dst.name, n)
    print(f"converted {len(srcs)} files -> {args.out}  total={total/1024/1024:.2f} MiB  max={biggest[0]} {biggest[1]/1024:.1f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
