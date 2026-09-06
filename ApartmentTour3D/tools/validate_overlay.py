"""
כלי האימות: מצייר את הגאומטריה שחולצה מעל הרסטר של גיליון התכנית.

זהו שלב הבקרה החשוב ביותר בצינור — הוא מוודא שכל קיר, פתח ואביזר שחולצו יושבים
בדיוק על התכנית המקורית. הרצה:

    python tools/validate_overlay.py            # קירות ופתחים מעל גיליון 1
    python tools/validate_overlay.py --mask     # גם מסכת ההצללה
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageDraw

from extract_arch import build_wall_mask, extract_walls, find_gaps, swing_dashes
from pdf_layers import Pt, PlanTransform, load_sheets

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "plan"
DPI = 150


class Painter:
    """ממיר קואורדינטות תכנית לפיקסלים על הרסטר ומצייר עליו."""

    def __init__(self, page: pymupdf.Page, tf: PlanTransform, dpi: int = DPI) -> None:
        self.tf = tf
        self.scale = dpi / 72.0
        self.rot = page.rotation_matrix
        pix = page.get_pixmap(dpi=dpi)
        self.img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        self.draw = ImageDraw.Draw(self.img, "RGBA")

    def px(self, p: Pt) -> tuple[float, float]:
        x_pt, y_pt = self.tf.to_pdf(p)
        pt = pymupdf.Point(x_pt, y_pt) * self.rot
        return pt.x * self.scale, pt.y * self.scale

    def line(self, a: Pt, b: Pt, colour, width: int = 2) -> None:
        self.draw.line([self.px(a), self.px(b)], fill=colour, width=width)

    def rect(self, a: Pt, b: Pt, colour) -> None:
        (x0, y0), (x1, y1) = self.px(a), self.px(b)
        self.draw.rectangle([min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)], fill=colour)

    def dot(self, p: Pt, colour, r: int = 4) -> None:
        x, y = self.px(p)
        self.draw.ellipse([x - r, y - r, x + r, y + r], fill=colour)

    def text(self, p: Pt, s: str, colour=(0, 0, 160, 255)) -> None:
        x, y = self.px(p)
        self.draw.text((x + 4, y - 6), s, fill=colour)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.img.save(path)
        print(f"נכתב: {path}")


def paint_mask(painter: Painter, grid) -> None:
    ys, xs = np.nonzero(grid.mask[::4, ::4])
    for iz, ix in zip(ys, xs):
        p = Pt(grid.x0 + ix * 4 * grid.res, grid.z0 + iz * 4 * grid.res)
        x, y = painter.px(p)
        painter.draw.point((x, y), fill=(255, 0, 255, 160))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mask", action="store_true", help="לצייר גם את מסכת ההצללה")
    ap.add_argument("--sheet", type=int, default=0)
    ap.add_argument("--out", default="overlay_walls.png")
    args = ap.parse_args()

    sheets, tf, doc = load_sheets()
    sheet = sheets[0]
    grid = build_wall_mask(sheet)
    walls = extract_walls(grid, sheet)
    dashes = swing_dashes(sheet)

    painter = Painter(doc[args.sheet], tf)
    if args.mask:
        paint_mask(painter, grid)

    for p in dashes:
        painter.dot(p, (0, 160, 255, 120), 1)

    for i, w in enumerate(walls):
        painter.line(w.start, w.end, (255, 0, 0, 220), 3)
        painter.text(w.start, f"{i}:{w.thickness*100:.0f}")
        for gap in find_gaps(grid, w):
            painter.line(
                w.point_at(gap.start),
                w.point_at(gap.end),
                (0, 200, 0, 255),
                6,
            )

    painter.save(OUT_DIR / args.out)
    print(f"קירות: {len(walls)}  מקפי קשתות: {len(dashes)}")


if __name__ == "__main__":
    main()
