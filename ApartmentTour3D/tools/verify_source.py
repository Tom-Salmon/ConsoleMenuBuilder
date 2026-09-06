"""
בדיקת שפיות של data/plan-source.json מול המידות הכתובות בתכנית, ותצוגת בקרה.

    python tools/verify_source.py            # בדיקות מספריות
    python tools/verify_source.py --preview  # + ציור המודל מעל שכבות התכנית
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from pdf_layers import Pt, load_sheets
from plan_preview import Canvas

DATA = Path(__file__).resolve().parent.parent / "data"


def load_source() -> dict:
    return json.loads((DATA / "plan-source.json").read_text(encoding="utf-8"))


def run_checks(src: dict) -> int:
    print("בדיקת מידות מול התכנית")
    print("-" * 62)
    failures = 0
    for check in src["verification"]["checks"]:
        _axis, a, b = check["measure"]
        got = round(abs(b - a) * 100, 1)
        expected = check["expected_cm"]
        delta = got - expected
        ok = abs(delta) <= 2.0
        failures += 0 if ok else 1
        print(f"  {'✓' if ok else '✗'} {check['label']:<22} תכנית={expected:>5} מודל={got:>7.1f}  Δ={delta:+.1f} ס\"מ")
    print("-" * 62)
    print("כל הבדיקות עברו" if failures == 0 else f"{failures} בדיקות נכשלו")
    return failures


def wall_box(w: dict) -> tuple[float, float, float, float]:
    if w["axis"] == "h":
        return w["lo"], w["c0"], w["hi"], w["c1"]
    return w["c0"], w["lo"], w["c1"], w["hi"]


def preview(src: dict) -> None:
    sheets, _tf, _doc = load_sheets()
    sheet = sheets[0]
    canvas = Canvas(5.3, 2.9, 19.9, 13.9, 140)

    for s in sheet.segs("arch"):
        canvas.line(s.a, s.b, (205, 205, 205), 1)
    for s in sheet.segs("furniture"):
        canvas.line(s.a, s.b, (225, 225, 225), 1)

    colours = {
        "concrete_ext": (40, 40, 40, 200),
        "concrete_mamad": (30, 80, 180, 200),
        "block": (150, 90, 40, 200),
        "gypsum": (0, 150, 90, 200),
        "parapet": (170, 120, 200, 200),
        "louver_screen": (200, 160, 40, 200),
    }
    by_id = {w["id"]: w for w in src["walls"]}
    for w in src["walls"]:
        x0, z0, x1, z1 = wall_box(w)
        canvas.draw.rectangle(
            [canvas.px(x0, z0), canvas.px(x1, z1)],
            fill=colours.get(w["type"], (0, 0, 0, 180)),
        )

    for o in src["openings"]:
        w = by_id[o["wall"]]
        if w["axis"] == "h":
            box = (o["from"], w["c0"] - 0.02, o["to"], w["c1"] + 0.02)
        else:
            box = (w["c0"] - 0.02, o["from"], w["c1"] + 0.02, o["to"])
        colour = (255, 130, 0, 235) if "door" in o["kind"] or o["kind"] == "sliding" else (0, 190, 255, 235)
        canvas.draw.rectangle([canvas.px(box[0], box[1]), canvas.px(box[2], box[3])], fill=colour)
        cx = (box[0] + box[2]) / 2
        cz = (box[1] + box[3]) / 2
        canvas.label(Pt(cx, cz), o["id"].replace("door_", "").replace("win_", ""), (150, 60, 0))

    for r in src["rooms"]:
        poly = r["polygon"]
        cx = sum(p[0] for p in poly) / len(poly)
        cz = sum(p[1] for p in poly) / len(poly)
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            canvas.line(Pt(*a), Pt(*b), (255, 0, 0, 160), 2)
        canvas.label(Pt(cx, cz), r["id"], (200, 0, 0))

    canvas.save("preview_source.png")


DEVICE_COLOURS = {
    "switch": (255, 0, 0),
    "socket": (200, 60, 60),
    "luminaire_ceiling": (255, 170, 0),
    "luminaire_wall": (255, 200, 90),
    "smart_panel": (150, 60, 220),
    "outlet_tv": (90, 90, 110),
    "outlet_data": (60, 140, 240),
    "comms_fiber": (160, 110, 250),
    "appliance_point": (240, 140, 0),
}

PIPE_COLOURS = {"hot_cold": (225, 130, 0), "drain": (0, 170, 0), "refrigerant": (0, 150, 220)}


def model_preview(src: dict) -> None:
    """
    מצייר את האביזרים והצנרת שחולצו מעל שכבות התכנית המקוריות.

    זו הבדיקה שמוודאת שהחילוץ האוטומטי של מערכות החשמל והאינסטלציה נחת במקום
    הנכון: כל נקודה צריכה לשבת על הסמל שממנו היא נגזרה.
    """
    model = json.loads((DATA / "apartment.json").read_text(encoding="utf-8"))
    ox, oz = src["origin"]["x"], src["origin"]["z"]
    sheets, _tf, _doc = load_sheets()
    canvas = Canvas(5.3, 2.9, 19.9, 13.9, 150)

    for layer, colour in (("arch", (215, 215, 215)), ("electrical", (255, 195, 195))):
        for s in sheets[1].segs(layer):
            canvas.line(s.a, s.b, colour, 1)

    for pipe in model["piping"]:
        colour = PIPE_COLOURS.get(pipe["system"], (0, 0, 0))
        pts = [Pt(p["x"] + ox, p["z"] + oz) for p in pipe["points"]]
        for i in range(len(pts) - 1):
            canvas.line(pts[i], pts[i + 1], colour, 2)

    for device in model["devices"]:
        p = Pt(device["position"]["x"] + ox, device["position"]["z"] + oz)
        canvas.dot(p, DEVICE_COLOURS.get(device["kind"], (0, 0, 0)), 5)
        tag = device["circuit"] or device["kind"][:4]
        canvas.label(p, tag, (0, 0, 0))

    canvas.save("preview_model.png")
    kinds = {}
    for d in model["devices"]:
        kinds[d["kind"]] = kinds.get(d["kind"], 0) + 1
    print("\nאביזרים שחולצו:")
    for kind, count in sorted(kinds.items(), key=lambda kv: -kv[1]):
        print(f"  {kind:<20} {count}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true", help="ציור הקירות והפתחים מעל התכנית")
    ap.add_argument("--model", action="store_true", help="ציור האביזרים והצנרת מעל התכנית")
    args = ap.parse_args()
    src = load_source()
    failed = run_checks(src)
    if args.preview:
        preview(src)
    if args.model:
        model_preview(src)
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
