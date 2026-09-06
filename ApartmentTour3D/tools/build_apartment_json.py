"""
בונה את data/apartment.json — המודל שהאפליקציה טוענת.

מאחד שלושה מקורות:
  1. data/plan-source.json — טבלת הקירות, הפתחים והחדרים, שנמדדה מהתכנית ועוגנה
     בקווי המידה שלה (ראה verification.checks שם).
  2. חילוץ אוטומטי מה-PDF — אביזרי חשמל ותקשורת עם קודי מעגל וגבהי התקנה,
     וקווי המים, הניקוז והמיזוג.
  3. data/furniture.json — ריהוט וכלים סניטריים "להמחשה בלבד", לפי הערת המתכנן.

הרצה:  python tools/build_apartment_json.py
"""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import extract_systems as es
from pdf_layers import PT_TO_CM, Pt, Seg, load_sheets

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BOUNDS = (5.6, 2.9, 19.75, 13.75)


# ----------------------------------------------------------------------------
# עזרים
# ----------------------------------------------------------------------------


def point_in_polygon(x: float, z: float, poly: list[list[float]]) -> bool:
    inside = False
    n = len(poly)
    for i in range(n):
        x0, z0 = poly[i]
        x1, z1 = poly[(i + 1) % n]
        if (z0 > z) != (z1 > z):
            xin = x0 + (z - z0) * (x1 - x0) / (z1 - z0)
            if x < xin:
                inside = not inside
    return inside


def polygon_area(poly: list[list[float]]) -> float:
    total = 0.0
    for i in range(len(poly)):
        x0, z0 = poly[i]
        x1, z1 = poly[(i + 1) % len(poly)]
        total += x0 * z1 - x1 * z0
    return abs(total) / 2.0


def room_at(x: float, z: float, rooms: list[dict]) -> str | None:
    """החדר שמכיל את הנקודה; חדר-משנה (מטבח) גובר על החדר שהוא חלק ממנו."""
    hits = [r for r in rooms if point_in_polygon(x, z, r["polygon"])]
    if not hits:
        return None
    sub = [r for r in hits if r.get("part_of")]
    return (sub or hits)[0]["id"]


def nearest_room(p: Pt, rooms: list[dict], max_dist: float = 0.8) -> str | None:
    """אביזר שיושב בתוך עובי קיר משויך לחדר הקרוב אליו."""
    best_id, best = None, max_dist
    for r in rooms:
        poly = r["polygon"]
        for i in range(len(poly)):
            ax, az = poly[i]
            bx, bz = poly[(i + 1) % len(poly)]
            dx, dz = bx - ax, bz - az
            span = dx * dx + dz * dz
            t = 0.0 if span == 0 else max(0.0, min(1.0, ((p.x - ax) * dx + (p.z - az) * dz) / span))
            d = math.hypot(p.x - (ax + t * dx), p.z - (az + t * dz))
            if d < best:
                best_id, best = r["id"], d
    return best_id


def chain_polylines(segs: list[Seg], tol: float = 0.03) -> list[list[Pt]]:
    """משרשר קטעים לקווים רציפים, לצורך ציור קווי מערכות בתלת-ממד."""
    key = lambda p: (round(p.x / tol), round(p.z / tol))  # noqa: E731
    ends: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, s in enumerate(segs):
        ends[key(s.a)].append(i)
        ends[key(s.b)].append(i)

    used = [False] * len(segs)
    lines: list[list[Pt]] = []
    for i, s in enumerate(segs):
        if used[i]:
            continue
        used[i] = True
        pts = [s.a, s.b]
        for at_start in (True, False):
            while True:
                end = pts[0] if at_start else pts[-1]
                nxt = None
                for j in ends[key(end)]:
                    if used[j]:
                        continue
                    cand = segs[j]
                    if cand.a.dist(end) <= tol:
                        nxt, other = j, cand.b
                        break
                    if cand.b.dist(end) <= tol:
                        nxt, other = j, cand.a
                        break
                if nxt is None:
                    break
                used[nxt] = True
                if at_start:
                    pts.insert(0, other)
                else:
                    pts.append(other)
        if len(pts) >= 2:
            lines.append(pts)
    return lines


def simplify(pts: list[Pt], tol: float = 0.01) -> list[Pt]:
    """מסיר נקודות ביניים קוליניאריות."""
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = out[-1], pts[i], pts[i + 1]
        cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
        if abs(cross) > tol:
            out.append(b)
    out.append(pts[-1])
    return out


# ----------------------------------------------------------------------------
# בנייה
# ----------------------------------------------------------------------------


class Builder:
    def __init__(self) -> None:
        self.src = json.loads((DATA / "plan-source.json").read_text(encoding="utf-8"))
        self.furniture_src = json.loads((DATA / "furniture.json").read_text(encoding="utf-8"))
        self.sheets, self.tf, self.doc = load_sheets()
        self.ox = self.src["origin"]["x"]
        self.oz = self.src["origin"]["z"]

    # -- טרנספורמציה לראשית הצירים של המודל --------------------------------
    def X(self, x: float) -> float:
        return round(x - self.ox, 4)

    def Z(self, z: float) -> float:
        return round(z - self.oz, 4)

    def P(self, p: Pt) -> dict[str, float]:
        return {"x": self.X(p.x), "z": self.Z(p.z)}

    # -- קירות ופתחים -------------------------------------------------------
    def walls(self) -> tuple[list[dict], list[dict]]:
        openings_by_wall: dict[str, list[dict]] = defaultdict(list)
        openings: list[dict] = []
        wall_index = {w["id"]: w for w in self.src["walls"]}

        for o in self.src["openings"]:
            w = wall_index[o["wall"]]
            offset = round(o["from"] - w["lo"], 4)
            width = round(o["to"] - o["from"], 4)
            entry = {
                "id": o["id"],
                "wall": o["wall"],
                "kind": o["kind"],
                "name_he": o["name_he"],
                "offset": offset,
                "width": width,
                "sill": o["sill"],
                "height": o["height"],
            }
            for key in ("hinge", "toward", "max_deg", "leaves", "shutter", "glazing", "plan_note"):
                if key in o:
                    entry[key] = o[key]
            openings.append(entry)
            openings_by_wall[o["wall"]].append(entry)

        walls: list[dict] = []
        ceil = self.src["ceilings"]
        for w in self.src["walls"]:
            height = w.get("height", ceil["structural_m"])
            if w["axis"] == "h":
                start, end = Pt(w["lo"], (w["c0"] + w["c1"]) / 2), Pt(w["hi"], (w["c0"] + w["c1"]) / 2)
            else:
                start, end = Pt((w["c0"] + w["c1"]) / 2, w["lo"]), Pt((w["c0"] + w["c1"]) / 2, w["hi"])
            walls.append(
                {
                    "id": w["id"],
                    "name_he": w["name_he"],
                    "type": w["type"],
                    "axis": w["axis"],
                    "start": self.P(start),
                    "end": self.P(end),
                    "thickness": round(w["c1"] - w["c0"], 4),
                    "length": round(w["hi"] - w["lo"], 4),
                    "height": height,
                    "openings": [o["id"] for o in openings_by_wall[w["id"]]],
                }
            )
        return walls, openings

    # -- חדרים --------------------------------------------------------------
    def rooms(self) -> list[dict]:
        levels = self.src["levels"]
        ceil = self.src["ceilings"]
        out = []
        for r in self.src["rooms"]:
            poly = [[self.X(p[0]), self.Z(p[1])] for p in r["polygon"]]
            if r["ceiling"] == "open":
                height = None
            elif r["ceiling"] == "dropped":
                height = ceil["dropped_m"]
            else:
                height = ceil["structural_m"]
            out.append(
                {
                    "id": r["id"],
                    "name_he": r["name_he"],
                    "name_en": r["name_en"],
                    "level": r["level"],
                    "y": levels[r["level"]]["y"],
                    "plan_elevation": levels[r["level"]]["plan_elevation"],
                    "polygon": poly,
                    "area_m2": round(polygon_area(poly), 2),
                    "ceiling": {"type": r["ceiling"], "height": height},
                    "outdoor": r.get("outdoor", False),
                    "part_of": r.get("part_of"),
                    "slope_percent": r.get("slope_percent"),
                }
            )
        return out

    # -- חשמל ותקשורת -------------------------------------------------------
    def electrical(self, rooms: list[dict]) -> tuple[list[dict], list[dict]]:
        src_rooms = self.src["rooms"]
        walls = self.src["walls"]
        devices: list[Device] = []
        seen: list[Pt] = []
        counter = defaultdict(int)

        for sheet_index in (1, 4):
            sheet = self.sheets[sheet_index]
            annotations = es.read_annotations(sheet, BOUNDS)
            blobs = [
                b
                for b in es.cluster_blobs(sheet, "electrical", radius=0.13, min_points=4)
                if BOUNDS[0] <= b.centre.x <= BOUNDS[2]
                and BOUNDS[1] <= b.centre.z <= BOUNDS[3]
                and 0.03 <= b.size <= 0.55
            ]
            for centre, circuit, height_cm, tags in es.device_anchors(blobs, annotations, max_link=0.40):
                if any(centre.dist(p) < 0.16 for p in seen):
                    continue  # אותו אביזר מופיע גם בגיליון המטבח המוגדל
                seen.append(centre)

                on_wall = es.distance_to_wall(centre, walls) <= 0.30
                kind, name_he = es.classify(circuit, height_cm, tags, on_wall)
                room = room_at(centre.x, centre.z, src_rooms) or nearest_room(centre, src_rooms)

                if kind == "luminaire_ceiling":
                    pos, wall_id, facing = centre, None, None
                    room_def = next((r for r in rooms if r["id"] == room), None)
                    ceiling_h = (room_def or {}).get("ceiling", {}).get("height") or 2.55
                    height = ceiling_h - 0.02
                else:
                    pos, wall_id, facing = es.snap_to_wall(centre, walls)
                    if height_cm and 20 <= height_cm <= 260:
                        height = height_cm / 100.0
                    else:
                        height = es.DEFAULT_HEIGHTS.get(kind, 0.9)

                counter[kind] += 1
                devices.append(
                    {
                        "id": f"{kind}_{counter[kind]:02d}",
                        "system": "comms" if kind.startswith(("comms", "outlet_")) or kind == "smart_panel" else "electrical",
                        "kind": kind,
                        "name_he": name_he,
                        "position": {"x": self.X(pos.x), "y": round(height, 3), "z": self.Z(pos.z)},
                        "wall": wall_id,
                        "facing": list(facing) if facing else None,
                        "circuit": circuit,
                        "height_cm": round(height * 100),
                        "tags": tags,
                        "room": room,
                    }
                )

        self.add_missing_switches(devices, rooms)
        circuits = self.build_circuits(devices)
        return devices, circuits

    def add_missing_switches(self, devices: list[dict], rooms: list[dict]) -> None:
        """
        מעגל תאורה שיש לו גופים אך לא נמצא לו מתג בתכנית מקבל מתג משוער ליד
        משקוף הדלת של החדר. הוא מסומן ב-``inferred`` כדי שיהיה ברור בממשק
        שזו השלמה שלנו ולא סימון שמופיע בתכנית.
        """
        by_circuit: dict[str, list[dict]] = defaultdict(list)
        for d in devices:
            if d["circuit"]:
                by_circuit[d["circuit"]].append(d)

        openings = {o["id"]: o for o in self.src["openings"]}
        wall_index = {w["id"]: w for w in self.src["walls"]}
        counter = len([d for d in devices if d["kind"] == "switch"])

        for code, members in by_circuit.items():
            if code.split("/")[0] not in es.LIGHTING_GROUPS:
                continue
            if any(m["kind"] == "switch" for m in members):
                continue
            lights = [m for m in members if m["kind"].startswith("luminaire")]
            if not lights:
                continue
            room_id = lights[0]["room"]
            room_src = next((r for r in self.src["rooms"] if r["id"] == room_id), None)
            spot = self._switch_spot(room_src, openings, wall_index)
            if spot is None:
                continue
            pos, facing, wall_id = spot
            counter += 1
            devices.append(
                {
                    "id": f"switch_{counter:02d}",
                    "system": "electrical",
                    "kind": "switch",
                    "name_he": "מפסק (השלמה — לא מסומן בתכנית)",
                    "position": {"x": self.X(pos.x), "y": 1.2, "z": self.Z(pos.z)},
                    "wall": wall_id,
                    "facing": list(facing),
                    "circuit": code,
                    "height_cm": 120,
                    "tags": [],
                    "room": room_id,
                    "inferred": True,
                }
            )

    @staticmethod
    def _switch_spot(room: dict | None, openings: dict, walls: dict) -> tuple[Pt, tuple[float, float], str] | None:
        """מקום סביר למתג: 15 ס\"מ מצד הידית של הדלת הקרובה ביותר לחדר."""
        if room is None:
            return None
        poly = room["polygon"]
        cx = sum(p[0] for p in poly) / len(poly)
        cz = sum(p[1] for p in poly) / len(poly)

        best = None
        for o in openings.values():
            if "door" not in o["kind"]:
                continue
            w = walls[o["wall"]]
            mid = (o["from"] + o["to"]) / 2
            centre = Pt(mid, (w["c0"] + w["c1"]) / 2) if w["axis"] == "h" else Pt((w["c0"] + w["c1"]) / 2, mid)
            d = math.hypot(centre.x - cx, centre.z - cz)
            if best is None or d < best[0]:
                best = (d, o, w)
        if best is None:
            return None

        _d, o, w = best
        # מציבים את המתג בצד הפתח שנמצא בתוך החדר
        if w["axis"] == "h":
            x = o["to"] + 0.15 if o["to"] + 0.15 < w["hi"] - 0.05 else o["from"] - 0.15
            face, normal = (w["c1"], 1.0) if cz > w["c1"] else (w["c0"], -1.0)
            return Pt(x, face), (0.0, normal), w["id"]
        z = o["to"] + 0.15 if o["to"] + 0.15 < w["hi"] - 0.05 else o["from"] - 0.15
        face, normal = (w["c1"], 1.0) if cx > w["c1"] else (w["c0"], -1.0)
        return Pt(face, z), (normal, 0.0), w["id"]

    @staticmethod
    def build_circuits(devices: list[dict]) -> list[dict]:
        """
        מקבץ אביזרים לפי קוד המעגל — זהו הקישור "איזה מתג מדליק מה" שמופיע
        בתכנית עצמה. מעגל עם יותר ממתג אחד הוא מפסק מחליף (two-way).
        """
        groups: dict[str, list[dict]] = defaultdict(list)
        for d in devices:
            if d["circuit"]:
                groups[d["circuit"]].append(d)

        out: list[dict] = []
        for code, members in sorted(groups.items(), key=lambda kv: (int(kv[0].split("/")[0]), kv[0])):
            switches = [m["id"] for m in members if m["kind"] == "switch"]
            loads = [m["id"] for m in members if m["kind"].startswith("luminaire")]
            sockets = [m["id"] for m in members if m["kind"] == "socket"]
            rooms = sorted({m["room"] for m in members if m["room"]})
            group = code.split("/")[0]
            out.append(
                {
                    "code": code,
                    "kind": "lighting" if group in es.LIGHTING_GROUPS else "power",
                    "mode": "two_way" if len(switches) > 1 else "single",
                    "switches": switches,
                    "loads": loads,
                    "sockets": sockets,
                    "rooms": rooms,
                    "default_on": False,
                }
            )
        return out

    # -- אינסטלציה ומיזוג ---------------------------------------------------
    def piping(self) -> list[dict]:
        systems = [
            (2, "water", "hot_cold", "מים חמים/קרים וגז", 0.02),
            (0, "drain", "drain", 'ניקוז 2"', 0.05),
            (3, "hvac", "refrigerant", "צנרת גז מיזוג", 0.016),
        ]
        out: list[dict] = []
        for sheet_index, layer, system, name_he, radius in systems:
            sheet = self.sheets[sheet_index]
            segs = [
                s
                for s in sheet.segs(layer)
                if BOUNDS[0] <= s.a.x <= BOUNDS[2]
                and BOUNDS[1] <= s.a.z <= BOUNDS[3]
                and BOUNDS[0] <= s.b.x <= BOUNDS[2]
                and BOUNDS[1] <= s.b.z <= BOUNDS[3]
                and s.length > 0.05
            ]
            for i, line in enumerate(chain_polylines(segs)):
                pts = simplify(line)
                length = sum(pts[j].dist(pts[j + 1]) for j in range(len(pts) - 1))
                if length < 0.35 or len(pts) < 2:
                    continue
                out.append(
                    {
                        "id": f"{system}_{i:03d}",
                        "system": system,
                        "name_he": name_he,
                        "radius": radius,
                        "points": [self.P(p) for p in pts],
                        "length": round(length, 2),
                    }
                )
        return out

    # -- ריהוט --------------------------------------------------------------
    def furniture(self) -> list[dict]:
        out = []
        for f in self.furniture_src["items"]:
            out.append(
                {
                    **f,
                    "position": {"x": self.X(f["position"]["x"]), "z": self.Z(f["position"]["z"])},
                    "illustrative": True,
                }
            )
        return out

    # -- מידות --------------------------------------------------------------
    def dimensions(self) -> list[dict]:
        out = []
        for check in self.src["verification"]["checks"]:
            axis, a, b = check["measure"]
            out.append(
                {
                    "label_he": check["label"],
                    "value_cm": check["expected_cm"],
                    "axis": axis,
                    "from": self.X(a) if axis == "x" else self.Z(a),
                    "to": self.X(b) if axis == "x" else self.Z(b),
                }
            )
        return out

    # -- הרכבה --------------------------------------------------------------
    def build(self) -> dict:
        walls, openings = self.walls()
        rooms = self.rooms()
        devices, circuits = self.electrical(rooms)
        model = {
            "meta": {
                "project_he": "כלניות 17 — טירת הכרמל",
                "developer_he": "עמרם אברהם אמנות הבניה",
                "apartment_type": "C",
                "floors": "2-15",
                "apartment_numbers": [8, 13, 18, 23, 28, 33, 38, 43, 48, 53, 58, 63, 68, 73],
                "revision": "0",
                "plan_date": "04.12.25",
                "scale": "1:50",
                "units": "meters",
                "axes": "X ימינה, Z דרומה, Y מעלה — כמו בתכנית במבט-על",
                "origin_he": "פינת צפון-מערב של מעטפת הדירה כולל המרפסת",
                "reference_level_m": self.src["reference_level_m"],
                "extraction": {
                    "source_pdf": "data/source-plan-type-C.pdf",
                    "pt_to_cm": round(PT_TO_CM, 5),
                    "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "generator": "tools/build_apartment_json.py",
                },
            },
            "levels": self.src["levels"],
            "ceilings": self.src["ceilings"],
            "walls": walls,
            "openings": openings,
            "rooms": rooms,
            "devices": devices,
            "circuits": circuits,
            "piping": self.piping(),
            "furniture": self.furniture(),
            "dimensions": self.dimensions(),
            "notes_he": [
                "סימון אביזרי ריהוט, כלים סניטרים וכדומה הינו להמחשה בלבד.",
                "המידות מתייחסות לחלקי בניין שונים בין קירות בטון/בניה/גבס ללא ציפויים.",
                "כל התכניות כפופות לשינויים עפ\"י החלטת הקבלן ו/או יועצי הפרויקט.",
                "במידה ויותקן תנור חימום במקלחת המתז יהיה בטמפ' 141 מעלות.",
            ],
        }
        return model


def main() -> None:
    builder = Builder()
    model = builder.build()
    payload = json.dumps(model, ensure_ascii=False, indent=1)
    out = DATA / "apartment.json"
    out.write_text(payload, encoding="utf-8")
    # עותק תחת public/ כדי שהאפליקציה תטען אותו ישירות בזמן ריצה
    served = ROOT / "public" / "data" / "apartment.json"
    served.parent.mkdir(parents=True, exist_ok=True)
    served.write_text(payload, encoding="utf-8")

    print(f"נכתב: {out}")
    print(f"נכתב: {served}")
    print(f"  קירות:   {len(model['walls'])}")
    print(f"  פתחים:   {len(model['openings'])}")
    print(f"  חדרים:   {len(model['rooms'])}")
    print(f"  אביזרים: {len(model['devices'])}")
    print(f"  מעגלים:  {len(model['circuits'])}")
    print(f"  צנרת:    {len(model['piping'])}")
    print(f"  ריהוט:   {len(model['furniture'])}")


if __name__ == "__main__":
    main()
