"""
תצוגת בקרה בכיוון התכנית (ולא בכיוון הגיליון המסובב).

מצייר את שכבות ה-PDF ואת הגאומטריה שחולצה זו על גבי זו, כדי לבדוק בעין שכל קיר,
פתח ואביזר יושבים במקום. זהו הכלי המרכזי לאימות הצינור.

    python tools/plan_preview.py --layers arch,furniture --mask
    python tools/plan_preview.py --walls --openings
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import extract_arch as ea
from pdf_layers import Pt, load_sheets

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "plan"

LAYER_COLOURS = {
    "arch": (0, 0, 0),
    "furniture": (150, 150, 150),
    "dimension": (120, 120, 255),
    "electrical": (220, 0, 0),
    "water": (225, 130, 0),
    "drain": (0, 170, 0),
    "hvac": (0, 150, 220),
}


class Canvas:
    def __init__(self, x0: float, z0: float, x1: float, z1: float, scale: int = 140) -> None:
        self.x0, self.z0, self.scale = x0, z0, scale
        self.img = Image.new("RGB", (int((x1 - x0) * scale), int((z1 - z0) * scale)), "white")
        self.draw = ImageDraw.Draw(self.img, "RGBA")

    def px(self, x: float, z: float) -> tuple[float, float]:
        return ((x - self.x0) * self.scale, (z - self.z0) * self.scale)

    def line(self, a: Pt, b: Pt, colour, width: int = 1) -> None:
        self.draw.line([self.px(a.x, a.z), self.px(b.x, b.z)], fill=colour, width=width)

    def dot(self, p: Pt, colour, r: float = 3) -> None:
        x, y = self.px(p.x, p.z)
        self.draw.ellipse([x - r, y - r, x + r, y + r], fill=colour)

    def label(self, p: Pt, text: str, colour=(0, 0, 200)) -> None:
        x, y = self.px(p.x, p.z)
        self.draw.text((x + 3, y - 5), text, fill=colour)

    def save(self, name: str) -> Path:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        path = OUT_DIR / name
        self.img.save(path)
        print(f"נכתב: {path}  ({self.img.width}x{self.img.height})")
        return path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--layers", default="arch")
    ap.add_argument("--sheet", type=int, default=0)
    ap.add_argument("--mask", action="store_true")
    ap.add_argument("--walls", action="store_true")
    ap.add_argument("--openings", action="store_true")
    ap.add_argument("--scale", type=int, default=140)
    ap.add_argument("--bounds", default="5.3,2.9,19.9,13.9")
    ap.add_argument("--out", default="preview.png")
    args = ap.parse_args()

    x0, z0, x1, z1 = (float(v) for v in args.bounds.split(","))
    sheets, tf, doc = load_sheets()
    sheet = sheets[args.sheet]
    canvas = Canvas(x0, z0, x1, z1, args.scale)

    if args.mask:
        grid = ea.build_wall_mask(sheets[0])
        ys, xs = np.nonzero(grid.mask[::2, ::2])
        for iz, ix in zip(ys, xs):
            canvas.draw.point(
                canvas.px(grid.x0 + ix * 2 * grid.res, grid.z0 + iz * 2 * grid.res),
                fill=(255, 205, 255),
            )

    for layer in args.layers.split(","):
        colour = LAYER_COLOURS.get(layer, (0, 0, 0))
        for s in sheet.segs(layer):
            if layer == "arch" and (39 < s.angle_deg < 51 or 129 < s.angle_deg < 141):
                continue
            canvas.line(s.a, s.b, colour, 1)
        for poly in sheet.curves.get(layer, []):
            for i in range(len(poly) - 1):
                canvas.line(poly[i], poly[i + 1], colour, 1)

    if args.walls or args.openings:
        grid = ea.build_wall_mask(sheets[0])
        walls = ea.extract_walls(grid, sheets[0])
        dashes = ea.swing_dashes(sheets[0]) if args.openings else []
        for i, w in enumerate(walls):
            if args.walls:
                canvas.line(w.start, w.end, (255, 0, 0, 200), 3)
                canvas.label(w.start, f"{i}·{w.thickness*100:.0f}", (200, 0, 0))
            if args.openings:
                for gap in ea.find_gaps(grid, w):
                    canvas.line(w.point_at(gap.start), w.point_at(gap.end), (255, 140, 0, 255), 5)
                    fit = ea.fit_swing(gap, dashes)
                    tag = f"{gap.width*100:.0f}" + (f" {fit.hinge}{fit.toward:+.0f}" if fit else "")
                    canvas.label(gap.centre, tag, (200, 90, 0))

    canvas.save(args.out)


if __name__ == "__main__":
    main()
