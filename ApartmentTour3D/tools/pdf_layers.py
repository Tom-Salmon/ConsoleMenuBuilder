"""
הפרדת שכבות מתוך תכנית ה-PDF והמרה לקואורדינטות תכנית במטרים.

ה-PDF הוא ייצוא וקטורי בקנ"מ 1:50. כל שכבה לוגית (אדריכלות / ריהוט / מידות /
חשמל / מים / ניקוז / מיזוג) מיוצגת בצבע קו קבוע, ולכן ניתן להפריד אותן בוודאות.

מערכת הצירים של התכנית:
    plan_x  – ימינה כפי שרואים את הגיליון, במטרים
    plan_z  – מטה כפי שרואים את הגיליון, במטרים
דף ה-PDF מסובב ב-270°, כלומר הגאומטריה שמורה במרחב הלא-מסובב ויש לסובב אותה
בחזרה: plan_x נגזר מ-y של ה-PDF ו-plan_z נגזר מ-x של ה-PDF בכיוון הפוך.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

# ----------------------------------------------------------------------------
# קבועים
# ----------------------------------------------------------------------------

#: קנה מידה 1:50. נקודת PDF אחת = 1/72 אינץ' = 0.352778 מ"מ על הנייר,
#: ובמציאות פי 50 מזה. אומת מול שרשראות המידות בתכנית (1377/1121/1016/738/642...)
PT_TO_CM = 25.4 / 72.0 / 10.0 * 50.0  # = 1.76389 ס"מ לכל נקודת PDF
PT_TO_M = PT_TO_CM / 100.0

SRC_PDF = Path(__file__).resolve().parent.parent / "data" / "source-plan-type-C.pdf"

#: מיפוי צבע קו -> שכבה לוגית. הצבעים נדגמו מכל ששת הגיליונות.
LAYER_BY_COLOR: dict[tuple[int, int, int], str] = {
    (0, 0, 0): "arch",  # אדריכלות: קירות, פתחים, קשתות פתיחה
    (128, 128, 128): "furniture",  # ריהוט וכלים סניטריים (להמחשה בלבד)
    (63, 0, 255): "dimension",  # שרשראות מידות
    (255, 0, 0): "electrical",  # חשמל
    (221, 110, 0): "water",  # מים חמים/קרים + גז
    (0, 255, 0): "drain",  # ניקוז/ביוב 2"
    (127, 191, 255): "hvac",  # מיזוג אוויר — קו גז
    (255, 191, 127): "hvac",  # מיזוג אוויר — קו נוזל
    # טקסט עברי על גבי התכנית מומר לעקומות מתאר ומצויר בשכבה נפרדת. אין בו
    # גאומטריה שימושית (וגם לא ניתן לקרוא אותו כטקסט), ולכן הוא מסומן ומוסר.
    (221, 0, 0): "annotation_text",
    (219, 219, 219): "underlay",  # גאומטריית רקע דהויה בגיליון המיזוג
    (220, 220, 220): "underlay",
}

#: שכבות שאינן נושאות גאומטריה שימושית לבנייה
IGNORED_LAYERS = {"annotation_text", "underlay"}

#: אילו גיליונות נושאים איזו שכבה (אינדקס דף מבסיס 0)
SHEET_ROLES = {
    0: "architecture",
    1: "electrical",
    2: "plumbing",
    3: "hvac",
    4: "kitchen_detail",
    5: "legend",
}


# ----------------------------------------------------------------------------
# טיפוסים
# ----------------------------------------------------------------------------


@dataclass(frozen=True)
class Pt:
    """נקודה במרחב התכנית (מטרים)."""

    x: float
    z: float

    def dist(self, other: "Pt") -> float:
        return math.hypot(self.x - other.x, self.z - other.z)

    def as_dict(self) -> dict[str, float]:
        return {"x": round(self.x, 4), "z": round(self.z, 4)}


@dataclass(frozen=True)
class Seg:
    """קטע ישר במרחב התכנית (מטרים)."""

    a: Pt
    b: Pt
    layer: str
    width: float = 0.0

    @property
    def length(self) -> float:
        return self.a.dist(self.b)

    @property
    def is_horizontal(self) -> bool:
        return abs(self.a.z - self.b.z) < 1e-4

    @property
    def is_vertical(self) -> bool:
        return abs(self.a.x - self.b.x) < 1e-4

    @property
    def angle_deg(self) -> float:
        return math.degrees(math.atan2(self.b.z - self.a.z, self.b.x - self.a.x)) % 180.0


@dataclass
class TextItem:
    """מקטע טקסט עם מיקומו במרחב התכנית."""

    text: str
    pos: Pt
    size: float


@dataclass
class Sheet:
    """גיליון בודד לאחר הפרדת שכבות."""

    index: int
    role: str
    segments: dict[str, list[Seg]] = field(default_factory=dict)
    curves: dict[str, list[list[Pt]]] = field(default_factory=dict)
    texts: list[TextItem] = field(default_factory=list)

    def segs(self, layer: str) -> list[Seg]:
        return self.segments.get(layer, [])


# ----------------------------------------------------------------------------
# טרנספורמציה
# ----------------------------------------------------------------------------


class PlanTransform:
    """
    ממיר קואורדינטות PDF (נקודות, מרחב לא-מסובב) לקואורדינטות תכנית (מטרים).

    הכיול נעשה פעם אחת מגבולות הגאומטריה של כל הגיליונות יחד, כך שכל ששת
    הגיליונות משתמשים באותה ראשית צירים בדיוק. הראשית תוזז בהמשך אל פינת
    הדירה על ידי :meth:`rebase`.
    """

    def __init__(self, x_max_pt: float, y_min_pt: float) -> None:
        self.x_max_pt = x_max_pt
        self.y_min_pt = y_min_pt
        self.offset_x = 0.0
        self.offset_z = 0.0

    def pt(self, x_pt: float, y_pt: float) -> Pt:
        return Pt(
            (y_pt - self.y_min_pt) * PT_TO_M - self.offset_x,
            (self.x_max_pt - x_pt) * PT_TO_M - self.offset_z,
        )

    def rebase(self, origin: Pt) -> None:
        """מזיז את ראשית הצירים כך ש-``origin`` יהפוך ל-(0,0)."""
        self.offset_x += origin.x
        self.offset_z += origin.z

    def to_pdf(self, p: Pt) -> tuple[float, float]:
        """הטרנספורמציה ההפוכה — לצורך ציור ה-overlay מעל הרסטר."""
        y_pt = (p.x + self.offset_x) / PT_TO_M + self.y_min_pt
        x_pt = self.x_max_pt - (p.z + self.offset_z) / PT_TO_M
        return x_pt, y_pt


# ----------------------------------------------------------------------------
# קריאה
# ----------------------------------------------------------------------------


def _color_key(color) -> tuple[int, int, int] | None:
    if color is None:
        return None
    return tuple(int(round(c * 255)) for c in color[:3])  # type: ignore[return-value]


def _classify(color, fill) -> str | None:
    for candidate in (color, fill):
        key = _color_key(candidate)
        if key in LAYER_BY_COLOR:
            return LAYER_BY_COLOR[key]
    return None


def _flatten_bezier(p0, p1, p2, p3, steps: int = 12):
    """מדגם עקומת בזייה קובית לרשימת נקודות."""
    for i in range(steps + 1):
        t = i / steps
        u = 1.0 - t
        yield (
            u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
            u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
        )


def geometry_bounds(doc: pymupdf.Document) -> tuple[float, float, float, float]:
    """גבולות כל הגאומטריה הוקטורית בכל הגיליונות, בנקודות PDF."""
    x0 = y0 = math.inf
    x1 = y1 = -math.inf
    for page in doc:
        for drawing in page.get_drawings():
            rect = drawing.get("rect")
            if rect is None:
                continue
            x0, y0 = min(x0, rect.x0), min(y0, rect.y0)
            x1, y1 = max(x1, rect.x1), max(y1, rect.y1)
    return x0, y0, x1, y1


def load_sheets(pdf_path: Path = SRC_PDF) -> tuple[list[Sheet], PlanTransform, pymupdf.Document]:
    """קורא את כל הגיליונות ומחזיר אותם מופרדים לשכבות במרחב התכנית."""
    doc = pymupdf.open(pdf_path)
    x0, y0, x1, _y1 = geometry_bounds(doc)
    tf = PlanTransform(x_max_pt=x1, y_min_pt=y0)

    sheets: list[Sheet] = []
    for index, page in enumerate(doc):
        sheet = Sheet(index=index, role=SHEET_ROLES.get(index, f"sheet{index}"))
        for drawing in page.get_drawings():
            layer = _classify(drawing.get("color"), drawing.get("fill"))
            if layer is None or layer in IGNORED_LAYERS:
                continue
            width = drawing.get("width") or 0.0
            bucket = sheet.segments.setdefault(layer, [])
            curve_bucket = sheet.curves.setdefault(layer, [])
            for item in drawing["items"]:
                kind = item[0]
                if kind == "l":
                    a, b = item[1], item[2]
                    bucket.append(Seg(tf.pt(a.x, a.y), tf.pt(b.x, b.y), layer, width))
                elif kind == "c":
                    pts = list(_flatten_bezier(item[1], item[2], item[3], item[4]))
                    curve_bucket.append([tf.pt(px, py) for px, py in pts])
                elif kind == "re":
                    r = item[1]
                    corners = [
                        tf.pt(r.x0, r.y0),
                        tf.pt(r.x1, r.y0),
                        tf.pt(r.x1, r.y1),
                        tf.pt(r.x0, r.y1),
                    ]
                    for i in range(4):
                        bucket.append(Seg(corners[i], corners[(i + 1) % 4], layer, width))
                elif kind == "qu":
                    quad = item[1]
                    corners = [
                        tf.pt(quad.ul.x, quad.ul.y),
                        tf.pt(quad.ur.x, quad.ur.y),
                        tf.pt(quad.lr.x, quad.lr.y),
                        tf.pt(quad.ll.x, quad.ll.y),
                    ]
                    for i in range(4):
                        bucket.append(Seg(corners[i], corners[(i + 1) % 4], layer, width))

        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span["text"].strip()
                    if not text:
                        continue
                    bbox = span["bbox"]
                    cx = (bbox[0] + bbox[2]) / 2
                    cy = (bbox[1] + bbox[3]) / 2
                    sheet.texts.append(TextItem(text, tf.pt(cx, cy), span.get("size", 0.0)))

        sheets.append(sheet)

    return sheets, tf, doc


__all__ = [
    "PT_TO_CM",
    "PT_TO_M",
    "SRC_PDF",
    "Pt",
    "Seg",
    "Sheet",
    "TextItem",
    "PlanTransform",
    "load_sheets",
    "geometry_bounds",
]
