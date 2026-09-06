"""
חילוץ מערכות: חשמל, תקשורת, מים, ניקוז ומיזוג אוויר.

כל מערכת מצוירת בצבע קו משלה, ולכן ההפרדה ודאית. הסמלים עצמם מצוירים כאשכולות
קטנים של קווים, והמידע הסמנטי נמצא בטקסט שלידם:

* **קוד מעגל** בצורה ``NN/M`` (למשל ``13/1``) — זהו החיבור בין מתג לגוף תאורה.
  מתג וגוף תאורה שנושאים את אותו קוד יושבים על אותו מעגל, וזה מה שמאפשר לבנות
  מיפוי אמיתי של "איזה מתג מדליק מה" במקום לנחש.
* **גובה התקנה** בצורה ``H=`` ואחריו מספר בסנטימטרים, בשורה נפרדת מתחתיו.
* **תגיות** כמו ``SMART``, ``TV``, ``TC``, ``N``, ``LC/APC``, ``HOLD``, ``x2``.

הסיווג לסוג אביזר נעשה לפי גובה ההתקנה בשילוב עם קבוצת המעגל, בהתאם למקרא
הסמלים שבגיליון 6 (ראה data/legend.json).
"""

from __future__ import annotations

import math
import re
from collections import defaultdict
from dataclasses import dataclass, field

from pdf_layers import Pt, Seg, Sheet, TextItem

CIRCUIT_RE = re.compile(r"^(\d{1,2})\s*/\s*(\d{1,2})$")
NUMBER_RE = re.compile(r"^\d{2,3}$")
TAGS = {"SMART", "TV", "TC", "N", "D", "A", "IR", "HOLD", "LC/APC", "K", "M", "T+P"}

#: קבוצות המעגלים בתכנית. המספר שלפני הלוכסן הוא מספר המעגל בלוח, והוא זה
#: שקובע אם מדובר בתאורה או בכוח — כך מקודדת התכנית, ולכן זהו הסיווג האמין
#: ביותר, אמין יותר מניחוש לפי צורת הסמל.
LIGHTING_GROUPS = {"12", "13", "17", "36", "37"}
POWER_GROUPS = {"10", "11", "14", "15", "16", "18", "19", "20", "21", "22", "23",
                "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35"}

#: גבהי התקנה אופייניים מהמקרא, לשימוש כשאין ``H=`` מפורש ליד הסמל
DEFAULT_HEIGHTS = {
    "switch": 1.2,
    "socket": 0.9,
    "socket_kitchen": 1.1,
    "luminaire_ceiling": 2.45,
    "luminaire_wall": 2.1,
    "comms": 0.4,
    "smart_panel": 1.4,
    "intercom": 1.5,
}


@dataclass
class Blob:
    """אשכול קווים אחד — סמל בודד בתכנית."""

    layer: str
    points: list[Pt] = field(default_factory=list)

    @property
    def centre(self) -> Pt:
        return Pt(
            sum(p.x for p in self.points) / len(self.points),
            sum(p.z for p in self.points) / len(self.points),
        )

    @property
    def size(self) -> float:
        xs = [p.x for p in self.points]
        zs = [p.z for p in self.points]
        return max(max(xs) - min(xs), max(zs) - min(zs))


@dataclass
class Device:
    """אביזר מערכת אחד, מוכן לכתיבה ל-apartment.json."""

    id: str
    system: str
    kind: str
    pos: Pt
    height: float
    circuit: str | None = None
    tags: list[str] = field(default_factory=list)
    room: str | None = None
    name_he: str = ""


# ----------------------------------------------------------------------------
# אשכולות סמלים
# ----------------------------------------------------------------------------


def cluster_blobs(sheet: Sheet, layer: str, radius: float = 0.10, min_points: int = 4) -> list[Blob]:
    """מקבץ את קווי השכבה לאשכולות — כל אשכול הוא סמל אחד בתכנית."""
    pts: list[Pt] = []
    for s in sheet.segs(layer):
        pts.extend((s.a, s.b))
    for poly in sheet.curves.get(layer, []):
        pts.extend(poly)
    if not pts:
        return []

    cell = radius
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, p in enumerate(pts):
        buckets[(int(p.x / cell), int(p.z / cell))].append(i)

    seen = [False] * len(pts)
    blobs: list[Blob] = []
    for i in range(len(pts)):
        if seen[i]:
            continue
        stack = [i]
        seen[i] = True
        members: list[Pt] = []
        while stack:
            j = stack.pop()
            p = pts[j]
            members.append(p)
            bx, bz = int(p.x / cell), int(p.z / cell)
            for dx in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for k in buckets.get((bx + dx, bz + dz), ()):
                        if not seen[k] and p.dist(pts[k]) <= radius:
                            seen[k] = True
                            stack.append(k)
        if len(members) >= min_points:
            blobs.append(Blob(layer, members))
    return blobs


# ----------------------------------------------------------------------------
# טקסט: קודי מעגלים, גבהים ותגיות
# ----------------------------------------------------------------------------


@dataclass
class Annotation:
    pos: Pt
    circuit: str | None = None
    height_cm: float | None = None
    tag: str | None = None


def read_annotations(sheet: Sheet, bounds: tuple[float, float, float, float]) -> list[Annotation]:
    """קורא קודי מעגלים, גבהים ותגיות מטקסט הגיליון."""
    x0, z0, x1, z1 = bounds
    items = [t for t in sheet.texts if x0 <= t.pos.x <= x1 and z0 <= t.pos.z <= z1]
    out: list[Annotation] = []

    numbers = [t for t in items if NUMBER_RE.match(t.text)]
    for t in items:
        text = t.text.strip()
        m = CIRCUIT_RE.match(text)
        if m:
            out.append(Annotation(t.pos, circuit=f"{int(m.group(1))}/{int(m.group(2))}"))
            continue
        if text.rstrip("= ").upper() in {"H", "H="} or text.startswith("H="):
            value = _height_value(text, t, numbers)
            if value is not None:
                out.append(Annotation(t.pos, height_cm=value))
            continue
        upper = text.upper()
        if upper in TAGS:
            out.append(Annotation(t.pos, tag=upper))
    return out


def _height_value(text: str, item: TextItem, numbers: list[TextItem]) -> float | None:
    """``H=`` והמספר שלו מגיעים לרוב כשני מקטעי טקסט נפרדים — מחברים אותם."""
    inline = re.search(r"H\s*=\s*(\d{2,3})", text, re.IGNORECASE)
    if inline:
        return float(inline.group(1))
    near = [n for n in numbers if abs(n.pos.x - item.pos.x) < 0.25 and 0 < n.pos.z - item.pos.z < 0.30]
    if not near:
        return None
    return float(min(near, key=lambda n: n.pos.z - item.pos.z).text)


def attach(blob_centre: Pt, annotations: list[Annotation], radius: float) -> tuple[str | None, float | None, list[str]]:
    """מוצא את קוד המעגל, הגובה והתגיות הקרובים ביותר לסמל."""
    circuit = height = None
    best_c = best_h = radius
    tags: list[str] = []
    for a in annotations:
        d = a.pos.dist(blob_centre)
        if d > radius:
            continue
        if a.circuit and d < best_c:
            circuit, best_c = a.circuit, d
        if a.height_cm and d < best_h:
            height, best_h = a.height_cm, d
        if a.tag and a.tag not in tags:
            tags.append(a.tag)
    return circuit, height, tags


# ----------------------------------------------------------------------------
# סיווג
# ----------------------------------------------------------------------------


def classify(
    circuit: str | None,
    height_cm: float | None,
    tags: list[str],
    on_wall: bool,
) -> tuple[str, str]:
    """
    מחזיר (kind, name_he).

    האבחנה המרכזית היא גאומטרית ולא סמלית: אביזר שמצויר צמוד לפני קיר הוא מתג
    או שקע, ואילו סמל שמצויר במרכז החדר הרחק מכל קיר הוא נקודת מאור בתקרה.
    מעל זה מוסיפים את גובה ההתקנה מהתכנית ואת קבוצת המעגל כדי להבחין בין מתג
    (H≈120, מעגל תאורה) לבין שקע (H≈90 או מעגל כוח).
    """
    if "SMART" in tags:
        return "smart_panel", "פנל תרחישים בית חכם"
    if "LC/APC" in tags:
        return "comms_fiber", "נקודת תקשורת — סיב אופטי"
    if "TV" in tags:
        return "outlet_tv", "נקודת טלוויזיה"
    if "TC" in tags or "N" in tags:
        return "outlet_data", "נקודת תקשורת/רשת"

    group = circuit.split("/")[0] if circuit else None

    if group in POWER_GROUPS:
        if height_cm is not None and height_cm >= 195:
            return "appliance_point", "נקודת הזנה גבוהה"
        return "socket", "בית תקע"

    if group in LIGHTING_GROUPS:
        if on_wall and (height_cm is None or 95 <= height_cm <= 150):
            return "switch", "מפסק"
        if height_cm is not None and 195 <= height_cm < 240 and on_wall:
            return "luminaire_wall", "נקודת מאור על הקיר"
        return "luminaire_ceiling", "נקודת מאור בתקרה"

    # בלי קוד מעגל: נסמכים על הגאומטריה בלבד
    if not on_wall:
        return "luminaire_ceiling", "נקודת מאור בתקרה"
    if height_cm is not None and height_cm >= 195:
        return "luminaire_wall", "נקודת מאור על הקיר"
    return "socket", "בית תקע"


def distance_to_wall(p: Pt, walls: list[dict]) -> float:
    """המרחק מהאביזר אל פני הקיר הקרוב ביותר (רק קירות שהאביזר נמצא לאורכם)."""
    best = math.inf
    for w in walls:
        if w["axis"] == "h":
            if not (w["lo"] - 0.05 <= p.x <= w["hi"] + 0.05):
                continue
            best = min(best, abs(p.z - w["c0"]), abs(p.z - w["c1"]))
        else:
            if not (w["lo"] - 0.05 <= p.z <= w["hi"] + 0.05):
                continue
            best = min(best, abs(p.x - w["c0"]), abs(p.x - w["c1"]))
    return best


def snap_to_wall(p: Pt, walls: list[dict], max_dist: float = 0.35) -> tuple[Pt, str | None, tuple[float, float] | None]:
    """
    מצמיד אביזר אל פני הקיר הקרוב אליו.

    בתכנית הסמל מצויר במרכזו על הקיר או מעט בצדו; בתלת-ממד הוא חייב לשבת על פני
    הקיר, אחרת הוא ייראה מרחף. מוחזר גם וקטור הפנייה של האביזר.
    """
    best = None
    for w in walls:
        if w["axis"] == "h":
            if not (w["lo"] - 0.1 <= p.x <= w["hi"] + 0.1):
                continue
            for face, normal in ((w["c0"], -1.0), (w["c1"], 1.0)):
                d = abs(p.z - face)
                if best is None or d < best[0]:
                    best = (d, Pt(p.x, face), w["id"], (0.0, normal))
        else:
            if not (w["lo"] - 0.1 <= p.z <= w["hi"] + 0.1):
                continue
            for face, normal in ((w["c0"], -1.0), (w["c1"], 1.0)):
                d = abs(p.x - face)
                if best is None or d < best[0]:
                    best = (d, Pt(face, p.z), w["id"], (normal, 0.0))
    if best is None or best[0] > max_dist:
        return p, None, None
    return best[1], best[2], best[3]


def device_anchors(
    blobs: list[Blob],
    annotations: list[Annotation],
    max_link: float = 0.32,
) -> list[tuple[Pt, str | None, float | None, list[str]]]:
    """
    בוחר אילו אשכולות הם באמת אביזרים.

    סמל מקוטע לעיתים לכמה אשכולות, וקווי החיווט מייצרים אשכולות מיותרים. לכן
    נשמרים רק אשכולות שאפשר לקשור אליהם מידע מהתכנית — קוד מעגל, גובה התקנה או
    תגית. אשכול בלי שום מידע כזה הוא רעש ולא אביזר.
    """
    anchors: list[tuple[Pt, str | None, float | None, list[str]]] = []
    used_annotations: set[int] = set()

    for blob in sorted(blobs, key=lambda b: -len(b.points)):
        centre = blob.centre
        circuit = height = None
        tags: list[str] = []
        linked: list[int] = []
        best_c = best_h = max_link
        for i, a in enumerate(annotations):
            if i in used_annotations:
                continue
            d = a.pos.dist(centre)
            if d > max_link:
                continue
            if a.circuit and d < best_c:
                circuit, best_c = a.circuit, d
                linked.append(i)
            elif a.height_cm and d < best_h:
                height, best_h = a.height_cm, d
                linked.append(i)
            elif a.tag and a.tag not in tags:
                tags.append(a.tag)
                linked.append(i)
        if circuit is None and height is None and not tags:
            continue
        used_annotations.update(linked)
        anchors.append((centre, circuit, height, tags))

    # איחוד אביזרים כפולים שנמצאים כמעט באותה נקודה
    merged: list[tuple[Pt, str | None, float | None, list[str]]] = []
    for centre, circuit, height, tags in anchors:
        hit = next((i for i, m in enumerate(merged) if m[0].dist(centre) < 0.14), None)
        if hit is None:
            merged.append((centre, circuit, height, tags))
        else:
            p, c, h, t = merged[hit]
            merged[hit] = (p, c or circuit, h if h is not None else height, sorted(set(t) | set(tags)))
    return merged


__all__ = [
    "Blob",
    "Device",
    "Annotation",
    "cluster_blobs",
    "read_annotations",
    "attach",
    "classify",
    "snap_to_wall",
    "distance_to_wall",
    "device_anchors",
    "LIGHTING_GROUPS",
    "POWER_GROUPS",
    "DEFAULT_HEIGHTS",
]
