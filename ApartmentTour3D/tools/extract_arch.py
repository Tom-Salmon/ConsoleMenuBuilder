"""
חילוץ הגאומטריה האדריכלית: קירות, עוביים ופתחים.

השיטה מנצלת שתי תכונות של התכנית עצמה:

1. **גוף כל קיר מלא בהצללה של קווי 45°**, בעוד ששאר הגאומטריה השחורה (מסגרות
   חלונות, כנפי דלתות, קווי ריצוף) אינה מוצללת. רסטור ההצללה נותן מסכה בינארית
   שאומרת בוודאות "כאן יש קיר".
2. **פני הקירות מצוירים כקווים ישרים ארוכים** בשכבה השחורה. מכאן מגיע העובי
   המדויק — לא מהמסכה, שרזולוציית הרסטור שלה גסה יותר.

לכן: מזווגים כל שני קווי פנים מקבילים, ומאשרים את הזוג רק אם המרווח ביניהם מוצלל
ומיד מחוצה להם אין הצללה. הערת המתכנן בתכנית קובעת שהמידות הן "בין קירות
בטון/בניה/גבס ללא ציפויים", ולכן כשנמצאות כמה חזיתות כמעט-חופפות (קו מבנה וקו
טיח) נבחר הזוג הדק ביותר — המבני.

הפתחים הם הרווחים שבהם ההצללה נקטעת לאורך הקיר. כיוון פתיחת דלת נקבע לפי קשתות
הפתיחה, שמצוירות בתכנית כקווים מקווקווים — ולכן נמדדות בספירת "תמיכה" של מקטעי
מקף שנופלים על רביע המעגל המועמד.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field

import numpy as np
from scipy import ndimage

from pdf_layers import Pt, Seg, Sheet

#: רזולוציית מסכת ההצללה, במטרים
RES = 0.005
#: טווח עובי קיר סביר
MIN_WALL_T, MAX_WALL_T = 0.045, 0.40
#: אורך מזערי של קיר שנשמר
MIN_WALL_LEN = 0.30
#: רוחב מזערי של רווח בקיר שנחשב פתח
MIN_OPENING = 0.40
#: רוחב מרבי של פתח בודד (מעבר לזה זה כבר "אין קיר")
MAX_OPENING = 3.20


# ----------------------------------------------------------------------------
# מסכת ההצללה
# ----------------------------------------------------------------------------


@dataclass
class Grid:
    """מסכת גופי הקירות המרוסטרת."""

    mask: np.ndarray  # [iz, ix]
    x0: float
    z0: float
    res: float

    def at(self, x: float, z: float) -> bool:
        ix = int((x - self.x0) / self.res)
        iz = int((z - self.z0) / self.res)
        if 0 <= iz < self.mask.shape[0] and 0 <= ix < self.mask.shape[1]:
            return bool(self.mask[iz, ix])
        return False

    def coverage(self, points) -> float:
        pts = list(points)
        if not pts:
            return 0.0
        return sum(1 for x, z in pts if self.at(x, z)) / len(pts)


def _is_hatch_angle(seg: Seg) -> bool:
    return 40.0 < seg.angle_deg < 50.0 or 130.0 < seg.angle_deg < 140.0


def hatch_segments(sheet: Sheet) -> list[Seg]:
    """
    קטעי ההצללה של גופי הקירות.

    קירות הבטון והבנייה מוצללים בקווי 45° בשכבה השחורה. מחיצות הגבס מוצללות
    בהצללה צולבת בשכבה האפורה — אותה שכבה שנושאת גם את הריהוט, ולכן מסננים לפי
    אורך: הצללת מחיצה היא קטעים קצרים וצפופים, בעוד שסימון ה-X שמסמן חדר הוא
    שני אלכסונים באורך של מטרים.
    """
    out = [s for s in sheet.segs("arch") if _is_hatch_angle(s) and 0.03 < s.length < 2.5]
    out += [s for s in sheet.segs("furniture") if _is_hatch_angle(s) and 0.02 < s.length < 0.32]
    return out


def _draw_line(mask: np.ndarray, x0: int, z0: int, x1: int, z1: int) -> None:
    n = max(abs(x1 - x0), abs(z1 - z0)) + 1
    xs = np.linspace(x0, x1, n).round().astype(int)
    zs = np.linspace(z0, z1, n).round().astype(int)
    ok = (xs >= 0) & (xs < mask.shape[1]) & (zs >= 0) & (zs < mask.shape[0])
    mask[zs[ok], xs[ok]] = True


def build_wall_mask(sheet: Sheet, res: float = RES, pad: float = 0.3) -> Grid:
    """מרסטר את ההצללה וסוגר מורפולוגית את הרווחים בין הקווים."""
    segs = hatch_segments(sheet)
    if not segs:
        raise RuntimeError("לא נמצאה הצללת קירות בגיליון")

    xs = [p.x for s in segs for p in (s.a, s.b)]
    zs = [p.z for s in segs for p in (s.a, s.b)]
    x0, z0 = min(xs) - pad, min(zs) - pad
    w = int((max(xs) - x0 + pad) / res) + 1
    h = int((max(zs) - z0 + pad) / res) + 1

    mask = np.zeros((h, w), dtype=bool)
    for s in segs:
        _draw_line(
            mask,
            int(round((s.a.x - x0) / res)),
            int(round((s.a.z - z0) / res)),
            int(round((s.b.x - x0) / res)),
            int(round((s.b.z - z0) / res)),
        )

    r = max(2, int(round(0.03 / res)))
    closed = ndimage.binary_closing(mask, structure=np.ones((r, r), bool), border_value=0)
    labels, count = ndimage.label(closed)
    if count:
        sizes = ndimage.sum(closed, labels, range(1, count + 1))
        keep = np.zeros(count + 1, bool)
        keep[1:] = sizes >= (0.03 / (res * res))
        closed = keep[labels]
    return Grid(closed, x0, z0, res)


# ----------------------------------------------------------------------------
# קווי פנים
# ----------------------------------------------------------------------------


@dataclass(frozen=True)
class FaceLine:
    """קו פני קיר: קואורדינטה קבועה על ציר אחד וטווח על הציר השני."""

    axis: str  # 'h' = קו אופקי (z קבוע), 'v' = קו אנכי (x קבוע)
    c: float
    lo: float
    hi: float

    @property
    def length(self) -> float:
        return self.hi - self.lo


def face_lines(sheet: Sheet, min_len: float = 0.15, join_gap: float = 0.08) -> tuple[list[FaceLine], list[FaceLine]]:
    """אוסף קווי פנים אופקיים ואנכיים, ממוזגים לאורך."""
    horiz: dict[float, list[tuple[float, float]]] = defaultdict(list)
    vert: dict[float, list[tuple[float, float]]] = defaultdict(list)
    for s in sheet.segs("arch"):
        if s.length < min_len:
            continue
        if s.is_horizontal:
            horiz[round(s.a.z, 3)].append((min(s.a.x, s.b.x), max(s.a.x, s.b.x)))
        elif s.is_vertical:
            vert[round(s.a.x, 3)].append((min(s.a.z, s.b.z), max(s.a.z, s.b.z)))

    def merge(groups: dict[float, list[tuple[float, float]]], axis: str) -> list[FaceLine]:
        out: list[FaceLine] = []
        for c, spans in groups.items():
            spans.sort()
            lo, hi = spans[0]
            for a, b in spans[1:]:
                if a <= hi + join_gap:
                    hi = max(hi, b)
                else:
                    out.append(FaceLine(axis, c, lo, hi))
                    lo, hi = a, b
            out.append(FaceLine(axis, c, lo, hi))
        return sorted(out, key=lambda f: (f.c, f.lo))

    return merge(horiz, "h"), merge(vert, "v")


# ----------------------------------------------------------------------------
# קירות
# ----------------------------------------------------------------------------


@dataclass
class WallBand:
    """קיר: ציר, שתי חזיתות, וטווח לאורך."""

    axis: str
    c0: float
    c1: float
    lo: float
    hi: float

    @property
    def thickness(self) -> float:
        return self.c1 - self.c0

    @property
    def centre(self) -> float:
        return (self.c0 + self.c1) / 2

    @property
    def length(self) -> float:
        return self.hi - self.lo

    @property
    def start(self) -> Pt:
        return Pt(self.lo, self.centre) if self.axis == "h" else Pt(self.centre, self.lo)

    @property
    def end(self) -> Pt:
        return Pt(self.hi, self.centre) if self.axis == "h" else Pt(self.centre, self.hi)

    def point_at(self, t: float, offset: float = 0.0) -> Pt:
        """נקודה במרחק ``t`` מתחילת הקיר, בהיסט ``offset`` מציר הקיר."""
        if self.axis == "h":
            return Pt(self.lo + t, self.centre + offset)
        return Pt(self.centre + offset, self.lo + t)


def _samples(band_axis: str, lo: float, hi: float, c: float, n: int = 48):
    for i in range(n):
        t = lo + (hi - lo) * (i + 0.5) / n
        yield (t, c) if band_axis == "h" else (c, t)


def _runs(line: np.ndarray) -> list[tuple[int, int]]:
    """רצפי True ברצועה בינארית, כ-(start, end_exclusive)."""
    idx = np.flatnonzero(np.diff(np.concatenate(([False], line, [False]))))
    return list(zip(idx[0::2], idx[1::2]))


def mask_bands(grid: Grid, axis: str) -> list[WallBand]:
    """
    מפרק את מסכת ההצללה לגופי קיר מלבניים.

    סורקים ניצבות לציר הקיר: בכל חתך מחפשים רצף "דק" (עד עובי קיר סביר), ומאחדים
    חתכים שכנים בעלי אותם גבולות לגוף אחד. כך מתקבלים כל הקירות, כולל מחיצות
    פנימיות שהזיווג בין חזיתות עלול לפספס.
    """
    mask = grid.mask
    max_t = int(MAX_WALL_T / grid.res)
    tol = max(1, int(round(0.025 / grid.res)))
    n_scan = mask.shape[1] if axis == "h" else mask.shape[0]

    bands: list[WallBand] = []
    open_runs: dict[tuple[int, int], int] = {}

    def close(key: tuple[int, int], start_i: int, end_i: int) -> None:
        a, b = key
        if axis == "h":
            bands.append(
                WallBand("h", grid.z0 + a * grid.res, grid.z0 + b * grid.res, grid.x0 + start_i * grid.res, grid.x0 + (end_i + 1) * grid.res)
            )
        else:
            bands.append(
                WallBand("v", grid.x0 + a * grid.res, grid.x0 + b * grid.res, grid.z0 + start_i * grid.res, grid.z0 + (end_i + 1) * grid.res)
            )

    for i in range(n_scan):
        line = mask[:, i] if axis == "h" else mask[i, :]
        current = {r for r in _runs(line) if 0 < r[1] - r[0] <= max_t}
        matched: dict[tuple[int, int], int] = {}
        for key, start_i in open_runs.items():
            hit = next((r for r in current if abs(r[0] - key[0]) <= tol and abs(r[1] - key[1]) <= tol), None)
            if hit is None:
                close(key, start_i, i - 1)
            else:
                matched[hit] = start_i
                current.discard(hit)
        for r in current:
            matched[r] = i
        open_runs = matched
    for key, start_i in open_runs.items():
        close(key, start_i, n_scan - 1)

    return [b for b in bands if b.length >= MIN_WALL_LEN and MIN_WALL_T <= b.thickness <= MAX_WALL_T]


def _snap(value: float, candidates: list[float], tol: float, prefer_up: bool) -> float:
    """
    מצמיד ערך שנמדד מהמסכה אל קו הפנים השחור הקרוב אליו.

    הסגירה המורפולוגית מנפחת את המסכה בכמה מילימטרים, ולכן פני הקיר האמיתיים הם
    קו שחור סמוך. כשיש כמה מועמדים (קו מבנה וקו טיח) בוחרים את הפנימי — המידות
    בתכנית הן "ללא ציפויים".
    """
    near = [c for c in candidates if abs(c - value) <= tol]
    if not near:
        return value
    best = min(near, key=lambda c: abs(c - value))
    ties = [c for c in near if abs(abs(c - value) - abs(best - value)) < 0.006]
    return max(ties) if prefer_up else min(ties)


def snap_bands(bands: list[WallBand], sheet: Sheet, tol: float = 0.05) -> list[WallBand]:
    """מצמיד את חזיתות הקירות שנמדדו מהמסכה אל קווי הפנים המדויקים."""
    horiz, vert = face_lines(sheet, min_len=0.10)
    z_lines = sorted({round(f.c, 4) for f in horiz})
    x_lines = sorted({round(f.c, 4) for f in vert})

    out: list[WallBand] = []
    for b in bands:
        cands = z_lines if b.axis == "h" else x_lines
        ends = x_lines if b.axis == "h" else z_lines
        c0 = _snap(b.c0, cands, tol, prefer_up=True)
        c1 = _snap(b.c1, cands, tol, prefer_up=False)
        if not MIN_WALL_T <= c1 - c0 <= MAX_WALL_T:
            c0, c1 = b.c0, b.c1
        lo = _snap(b.lo, ends, tol, prefer_up=False)
        hi = _snap(b.hi, ends, tol, prefer_up=True)
        if hi - lo < MIN_WALL_LEN:
            lo, hi = b.lo, b.hi
        out.append(WallBand(b.axis, round(c0, 4), round(c1, 4), round(lo, 4), round(hi, 4)))
    return out


def merge_collinear(bands: list[WallBand], max_gap: float = MAX_OPENING) -> list[WallBand]:
    """
    מאחד קטעי קיר קוליניאריים שהופרדו בפתח לקיר אחד.
    הפתח עצמו יזוהה בהמשך כרווח בהצללה לאורך הקיר המאוחד.
    """
    by_key: dict[tuple[str, float, float], list[WallBand]] = defaultdict(list)
    for b in bands:
        by_key[(b.axis, round(b.c0, 2), round(b.c1, 2))].append(b)

    merged: list[WallBand] = []
    for (axis, c0, c1), group in by_key.items():
        group.sort(key=lambda b: b.lo)
        cur = group[0]
        for nxt in group[1:]:
            if nxt.lo - cur.hi <= max_gap:
                cur = WallBand(axis, min(cur.c0, nxt.c0), max(cur.c1, nxt.c1), cur.lo, max(cur.hi, nxt.hi))
            else:
                merged.append(cur)
                cur = nxt
        merged.append(cur)
    return merged


def drop_contained(bands: list[WallBand]) -> list[WallBand]:
    """מסיר גופים שנבלעים בגוף אחר — בעיקר פינות שנספרו פעמיים."""
    bands = sorted(bands, key=lambda b: (-b.length, b.thickness))
    kept: list[WallBand] = []
    for b in bands:
        if any(_contains(k, b) for k in kept):
            continue
        kept.append(b)
    return kept


def _contains(big: WallBand, small: WallBand) -> bool:
    def box(b: WallBand):
        return (b.lo, b.c0, b.hi, b.c1) if b.axis == "h" else (b.c0, b.lo, b.c1, b.hi)

    ax0, az0, ax1, az1 = box(big)
    bx0, bz0, bx1, bz1 = box(small)
    ix = min(ax1, bx1) - max(ax0, bx0)
    iz = min(az1, bz1) - max(az0, bz0)
    if ix <= 0 or iz <= 0:
        return False
    area = (bx1 - bx0) * (bz1 - bz0)
    return area > 0 and (ix * iz) / area > 0.8


#: טווח עובי של מחיצה קלה שאינה מוצללת כלל
THIN_MIN, THIN_MAX = 0.045, 0.16
THIN_MIN_LEN = 0.55


def thin_partitions(grid: Grid, sheet: Sheet) -> list[WallBand]:
    """
    מחיצות קלות שאינן מוצללות כלל — מצוירות כשני קווים מקבילים וקרובים בלבד.

    מזוהות כזוג חזיתות דקות שהמרווח ביניהן ריק מהצללה ומגאומטריה אחרת, ושמחוצה
    להן אין קיר. הבדיקה "ריק מגאומטריה" היא שמונעת התפסה על מסגרות חלונות, שבהן
    מצויר גם זיגוג בין שני הקווים.
    """
    horiz, vert = face_lines(sheet, min_len=THIN_MIN_LEN, join_gap=0.05)
    interior = _interior_segments(sheet)

    out: list[WallBand] = []
    for lines, axis in ((horiz, "h"), (vert, "v")):
        for i, f1 in enumerate(lines):
            for f2 in lines[i + 1 :]:
                t = f2.c - f1.c
                if t < THIN_MIN:
                    continue
                if t > THIN_MAX:
                    break
                lo, hi = max(f1.lo, f2.lo), min(f1.hi, f2.hi)
                if hi - lo < THIN_MIN_LEN:
                    continue
                mid = (f1.c + f2.c) / 2
                if grid.coverage(_samples(axis, lo, hi, mid)) > 0.25:
                    continue  # כבר נתפס כקיר מוצלל
                if _strip_has_geometry(interior, axis, f1.c, f2.c, lo, hi):
                    continue  # מסגרת חלון/דלת, לא מחיצה
                out.append(WallBand(axis, f1.c, f2.c, lo, hi))
    return out


def _interior_segments(sheet: Sheet) -> list[Seg]:
    """קטעים שעשויים למלא מסגרת חלון — כל הקווים הקצרים בשכבה השחורה."""
    return [s for s in sheet.segs("arch") if s.length < 0.5]


def _strip_has_geometry(segs: list[Seg], axis: str, c0: float, c1: float, lo: float, hi: float) -> bool:
    """האם יש גאומטריה בתוך הרצועה שבין שתי החזיתות (למעט קרוב לקצוות)."""
    inner0, inner1 = c0 + 0.012, c1 - 0.012
    if inner1 <= inner0:
        return False
    margin = 0.06
    count = 0
    for s in segs:
        for p in (s.a, s.b):
            c = p.z if axis == "h" else p.x
            t = p.x if axis == "h" else p.z
            if inner0 < c < inner1 and lo + margin < t < hi - margin:
                count += 1
                if count > 6:
                    return True
    return False


def extract_walls(grid: Grid, sheet: Sheet) -> list[WallBand]:
    """הצינור המלא: מסכה -> מלבנים -> מחיצות קלות -> הצמדה -> איחוד -> ניקוי."""
    bands = mask_bands(grid, "h") + mask_bands(grid, "v")
    bands = snap_bands(bands, sheet)
    bands += thin_partitions(grid, sheet)
    bands = merge_collinear(bands)
    bands = drop_contained(bands)
    return sorted(bands, key=lambda b: -b.length)


# ----------------------------------------------------------------------------
# פתחים
# ----------------------------------------------------------------------------


@dataclass
class Gap:
    """רווח בהצללה לאורך קיר — מועמד לפתח."""

    band: WallBand
    start: float
    end: float

    @property
    def width(self) -> float:
        return self.end - self.start

    @property
    def centre(self) -> Pt:
        return self.band.point_at((self.start + self.end) / 2)


def find_gaps(grid: Grid, band: WallBand) -> list[Gap]:
    """מוצא קטעים לאורך הקיר שבהם גוף הקיר נעדר."""
    n = max(8, int(band.length / grid.res))
    step = band.length / n
    probes = [band.point_at(step * (i + 0.5)) for i in range(n)]
    filled = np.array([grid.at(p.x, p.z) for p in probes])
    gaps: list[Gap] = []
    idx = np.flatnonzero(np.diff(np.concatenate(([False], ~filled, [False]))))
    for s, e in zip(idx[0::2], idx[1::2]):
        start, end = s * step, e * step
        width = end - start
        if not MIN_OPENING <= width <= MAX_OPENING:
            continue
        # רווח שנוגע בקצה הקיר הוא בדרך כלל חיתוך עם קיר אחר ולא פתח
        if start < 0.02 or end > band.length - 0.02:
            continue
        gaps.append(Gap(band, start, end))
    return gaps


# ----------------------------------------------------------------------------
# קשתות פתיחה
# ----------------------------------------------------------------------------


def swing_dashes(sheet: Sheet) -> list[Pt]:
    """
    נקודות האמצע של מקטעי הקו המקווקו שמרכיבים את קשתות הפתיחה.
    קשת פתיחה מצוירת מקווקו, ולכן היא מופיעה כאוסף מקטעים קצרים לא-ציריים.
    """
    pts: list[Pt] = []
    for layer in ("arch", "furniture"):
        for s in sheet.segs(layer):
            if s.is_horizontal or s.is_vertical:
                continue
            ang = s.angle_deg
            if 44.0 < ang < 46.0 or 134.0 < ang < 136.0:
                continue  # הצללת קיר
            if s.length > 0.30:
                continue
            pts.append(Pt((s.a.x + s.b.x) / 2, (s.a.z + s.b.z) / 2))
    return pts


@dataclass
class SwingFit:
    """התאמת קשת פתיחה לפתח: באיזה קצה הציר ולאיזה צד נפתחת הכנף."""

    hinge: str  # 'start' או 'end' ביחס לכיוון הקיר
    toward: float  # +1 / -1 בכיוון הניצב לקיר
    support: float  # שיעור הנקודות שנמצאו על הקשת


def fit_swing(gap: Gap, dashes: list[Pt], tol: float = 0.035) -> SwingFit | None:
    """
    בודק את ארבע האפשרויות (שני קצוות × שני צדדים) וסופר כמה מקטעי מקף נופלים
    על רביע המעגל המתאים. האפשרות עם התמיכה הגבוהה ביותר היא כיוון הפתיחה.
    """
    band = gap.band
    radius = gap.width
    if radius < 0.4:
        return None
    near = [p for p in dashes if p.dist(gap.centre) < radius * 1.9]
    if len(near) < 12:
        return None

    best: SwingFit | None = None
    for hinge in ("start", "end"):
        pivot = band.point_at(gap.start if hinge == "start" else gap.end)
        for toward in (1.0, -1.0):
            on_arc = 0
            for p in near:
                d = p.dist(pivot)
                if abs(d - radius) > tol:
                    continue
                # רק הרביע שבצד הפתיחה נספר
                if band.axis == "h":
                    if (p.z - pivot.z) * toward < -tol:
                        continue
                    if hinge == "start" and p.x < pivot.x - tol:
                        continue
                    if hinge == "end" and p.x > pivot.x + tol:
                        continue
                else:
                    if (p.x - pivot.x) * toward < -tol:
                        continue
                    if hinge == "start" and p.z < pivot.z - tol:
                        continue
                    if hinge == "end" and p.z > pivot.z + tol:
                        continue
                on_arc += 1
            support = on_arc / len(near)
            if best is None or support > best.support:
                best = SwingFit(hinge, toward, support)
    if best is None or best.support < 0.25:
        return None
    return best


__all__ = [
    "Grid",
    "FaceLine",
    "WallBand",
    "Gap",
    "SwingFit",
    "build_wall_mask",
    "face_lines",
    "extract_walls",
    "find_gaps",
    "swing_dashes",
    "fit_swing",
    "hatch_segments",
]
