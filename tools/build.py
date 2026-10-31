#!/usr/bin/env python3
"""Build Colorways deliverables from the seed data.

Reads data/vocab.json and data/seed/hotels.json and writes:
  app/data/seed.js                               data for the web prototype
  deliverables/Colorways_Hotel_Color_Index.xlsx  the working spreadsheet

Run from anywhere: python3 tools/build.py
"""
import datetime
import json
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.utils.indexed_list import IndexedList
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import colorlib  # noqa: E402

VERSION = "0.2"
TODAY = datetime.date.today().isoformat()
XLSX = ROOT / "deliverables" / "Colorways_Hotel_Color_Index.xlsx"
SEED_JS = ROOT / "app" / "data" / "seed.js"

# Rows pre-filled with formulas. Copy the last row's gray cells down to extend.
CAP_HOTELS, CAP_SPACES, CAP_SWATCHES = 150, 800, 600

HOTEL_DEFAULTS = {
    "brand": "", "city": "", "state": "", "region": "", "status": "Unverified", "opened": "", "redesign": "",
    "architect": "", "interiorDesigner": "", "primaryStyle": "", "secondaryStyle": "", "era": "", "genre": "",
    "palette": "", "keyFamilies": [], "photoOp": "", "media": "", "rooms": None, "stdRoomSqft": None,
    "meetingSqft": None, "distinctiveness": None, "researchStatus": "Not started", "wave": "Backlog", "notes": "",
    "sources": [], "spaces": [],
}
SPACE_DEFAULTS = {
    "venue": "", "sqft": None, "sqftSource": "", "coverage": None, "dwell": None, "style": "", "era": "", "genre": "", "mood": [],
    "lighting": "", "materials": "", "photoOp": None, "confidence": "", "evidence": "", "url": "",
    "captureStatus": "Not shot", "notes": "", "colors": [],
}


class SeedError(ValueError):
    pass


def check(value, allowed, what, ctx):
    if value in ("", None):
        return
    if value not in allowed:
        raise SeedError(f"{ctx}: {what} {value!r} is not in the vocabulary")


def normalize(vocab, seed):
    types = {t["name"]: t for t in vocab["spaceTypes"]}
    sources = {s["name"] for s in vocab["colorSources"]}
    hotels, seen = [], set()
    for raw in seed["hotels"]:
        h = {**HOTEL_DEFAULTS, **raw}
        hid = h["id"]
        if hid in seen:
            raise SeedError(f"duplicate hotel id {hid}")
        seen.add(hid)
        ctx = hid
        check(h["region"], vocab["regions"], "region", ctx)
        check(h["status"], vocab["hotelStatus"], "status", ctx)
        check(h["primaryStyle"], vocab["styles"], "style", ctx)
        check(h["secondaryStyle"], vocab["styles"], "style", ctx)
        check(h["era"], vocab["eras"], "era", ctx)
        check(h["genre"], vocab["genres"], "genre", ctx)
        check(h["wave"], vocab["waves"], "wave", ctx)
        check(h["researchStatus"], vocab["researchStatus"], "research status", ctx)
        for f in h["keyFamilies"]:
            check(f, colorlib.FAMILY_NAMES, "key family", ctx)
        spaces, present = [], set()
        for i, rs in enumerate(h["spaces"]):
            sp = {**SPACE_DEFAULTS, **rs}
            sctx = f"{hid} space {i + 1}"
            if sp["type"] not in types:
                raise SeedError(f"{sctx}: space type {sp['type']!r} is not in the vocabulary")
            check(sp["sqftSource"], vocab["areaSources"], "area source", sctx)
            check(sp["confidence"], vocab["confidence"], "confidence", sctx)
            check(sp["captureStatus"], vocab["captureStatus"], "capture status", sctx)
            check(sp["lighting"], vocab["lighting"], "lighting", sctx)
            if sp["coverage"] is not None and not 0 <= sp["coverage"] <= 100:
                raise SeedError(f"{sctx}: coverage must be 0-100")
            cols = []
            for c in sp["colors"]:
                c = {"name": "", "share": None, "key": False, "reason": "", "source": "Described", **c}
                colorlib.hex_to_rgb(c["hex"])  # raises on a bad hex
                c["hex"] = "#" + c["hex"].strip().lstrip("#").upper()
                check(c["source"], sources, "color source", sctx)
                if c["key"] and not c["reason"]:
                    c["reason"] = "Photo-op"
                check(c["reason"], vocab["keyReasons"], "key reason", sctx)
                cols.append(c)
            sp["colors"] = cols
            sp["_i"] = i
            present.add(sp["type"])
            spaces.append(sp)
        for t in vocab["defaultSpaces"]:
            if t not in present:
                spaces.append({**SPACE_DEFAULTS, "type": t, "placeholder": True, "_i": 999})
        spaces.sort(key=lambda s: (types[s["type"]]["order"], s["_i"]))
        counts = {}
        for s in spaces:
            counts[s["type"]] = counts.get(s["type"], 0) + 1
        running = {}
        for s in spaces:
            code = types[s["type"]]["code"]
            if counts[s["type"]] > 1:
                running[s["type"]] = running.get(s["type"], 0) + 1
                s["id"] = f"{hid}-{code}{running[s['type']]}"
            else:
                s["id"] = f"{hid}-{code}"
            for r, c in enumerate(s["colors"], start=1):
                c["rank"] = r
                c["id"] = f"{s['id']}-C{r}"
            del s["_i"]
        h["spaces"] = spaces
        hotels.append(h)
    wave_rank = {w: i for i, w in enumerate(vocab["waves"])}

    def has_colors(h):
        return any(s["colors"] for s in h["spaces"])

    hotels.sort(key=lambda h: (0 if has_colors(h) else 1, wave_rank.get(h["wave"], 9),
                               -(h["distinctiveness"] or 0), h["name"]))
    return hotels


def write_seed_js(vocab, hotels, media):
    v = {k: val for k, val in vocab.items() if not k.startswith("_")}
    data = {"version": VERSION, "generated": TODAY, "vocab": v, "hotels": hotels, "media": media}
    SEED_JS.parent.mkdir(parents=True, exist_ok=True)
    SEED_JS.write_text(
        "/* Generated by tools/build.py from data/seed/hotels.json and data/vocab.json. Do not edit by hand. */\n"
        "window.CW_SEED = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")


# ---------------------------------------------------------------- workbook

ARIAL = "Arial"
F_HEAD = Font(name=ARIAL, size=10, bold=True, color="1D1B18")
F_TITLE = Font(name=ARIAL, size=18, bold=True, color="1D1B18")
F_H2 = Font(name=ARIAL, size=12, bold=True, color="1D1B18")
F_BODY = Font(name=ARIAL, size=10, color="1D1B18")
F_MUTED = Font(name=ARIAL, size=10, color="6B665E")
F_LINK = Font(name=ARIAL, size=10, color="1F4E99", underline="single")
FILL_IN = PatternFill("solid", start_color="FFF2CC", end_color="FFF2CC")
FILL_AUTO = PatternFill("solid", start_color="E7E6E6", end_color="E7E6E6")
FILL_EXAMPLE = PatternFill("solid", start_color="EEF5E9", end_color="EEF5E9")
WRAP = Alignment(wrap_text=True, vertical="top")
TOP = Alignment(vertical="top")


def ink(hexstr):
    return "111111" if luminance(hexstr) > 0.18 else "FFFFFF"


def luminance(hexstr):
    r, g, b = (colorlib._lin(c) for c in colorlib.hex_to_rgb(hexstr))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def header(ws, cols):
    for i, (name, kind, width, note) in enumerate(cols, start=1):
        c = ws.cell(row=1, column=i, value=name)
        c.font = F_HEAD
        c.fill = FILL_IN if kind == "in" else FILL_AUTO
        c.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = width
        if note:
            c.comment = Comment(note, "Colorways")
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "C2"


def col_of(cols, name):
    for i, c in enumerate(cols, start=1):
        if c[0] == name:
            return get_column_letter(i)
    raise KeyError(name)


def list_dv(ws, rng, ref, prompt=None):
    dv = DataValidation(type="list", formula1=ref, allow_blank=True)
    dv.errorStyle = "warning"
    dv.errorTitle = "Not in the list"
    dv.error = "This value is not in the Lists tab. Keep it anyway, or pick from the list."
    dv.showErrorMessage = True
    if prompt:
        dv.promptTitle = "Colorways"
        dv.prompt = prompt
        dv.showInputMessage = True
    ws.add_data_validation(dv)
    dv.add(rng)


def family_formula(L, C, h):
    """Excel version of colorlib.family_lch. Keep in sync."""
    neutral = f'IF({L}>=92,"White",IF({L}<22,"Black","Gray"))'
    warm = f"AND({h}>=35,{h}<120)"
    steps = [
        (f"{L}<12", '"Black"'),
        (f"{C}<5", neutral),
        (f"AND({warm},{C}<30,{L}>=85)", '"Cream & Ivory"'),
        (f"AND({warm},{C}<30,{L}>=55)", '"Beige & Taupe"'),
        (f"AND({warm},{C}<18,{L}<35)", '"Brown & Wood"'),
        (f"AND({warm},{C}<18)", '"Beige & Taupe"'),
        (f"AND(OR({h}<35,{h}>=120),{C}<10)", neutral),
        (f"AND({h}>=25,{h}<95,OR(AND({C}<45,{L}<70),AND({C}<55,{L}<46)))", '"Brown & Wood"'),
        (f"OR({h}>=345,{h}<20)", f'IF({L}<45,"Red & Burgundy","Pink & Blush")'),
        (f"{h}<55", f'IF(OR(AND({C}>=70,{h}<45),{L}<40),"Red & Burgundy",'
                    f'IF(AND({L}>=70,{h}<35),"Pink & Blush","Orange & Terracotta"))'),
        (f"{h}<75", '"Orange & Terracotta"'),
        (f"{h}<100", '"Yellow & Gold"'),
        (f"{h}<112", f'IF({L}>=75,"Yellow & Gold","Green")'),
        (f"{h}<180", '"Green"'),
        (f"{h}<225", '"Teal & Aqua"'),
        (f"{h}<310", f'IF({L}<30,"Navy","Blue")'),
    ]
    expr = '"Purple & Plum"'
    for cond, val in reversed(steps):
        expr = f"IF({cond},{val},{expr})"
    return f'=IF({L}="","",{expr})'


HOTEL_COLS = [
    ("Hotel_ID", "in", 12, "Short unique code, e.g. NSH-NOEL (city code + name)."),
    ("Hotel_Name", "in", 30, None),
    ("Brand_Collection", "in", 24, None),
    ("City", "in", 14, None),
    ("State", "in", 7, None),
    ("Region", "in", 11, None),
    ("Status", "in", 11, "Open only when a 2025-2026 source confirms it. Otherwise Unverified."),
    ("Opened", "in", 14, "Year as text, with context if needed, e.g. '1930 (Noel Hotel); reopened 2017'."),
    ("Last_Redesign", "in", 22, None),
    ("Architect", "in", 24, None),
    ("Interior_Designer", "in", 30, None),
    ("Primary_Style", "in", 18, None),
    ("Secondary_Style", "in", 18, None),
    ("Design_Era", "in", 20, "The era the design references (not necessarily the build year)."),
    ("Genre", "in", 18, "The story the hotel tells, like a film genre."),
    ("Signature_Palette_Described", "in", 44, "Short description with quotes from cited sources."),
    ("Key_Family_1", "in", 15, None),
    ("Key_Family_2", "in", 15, None),
    ("Key_Family_3", "in", 15, None),
    ("Signature_Photo_Op", "in", 34, None),
    ("Media_Editorial_Film", "in", 40, "Magazine features, fashion shoots, film/TV. Details go in Media_Sources."),
    ("Rooms", "in", 8, None),
    ("Std_Room_sqft", "in", 10, None),
    ("Meeting_Space_sqft", "in", 11, None),
    ("Distinctiveness_1to5", "in", 10, "How strong and recognizable the color story is (1 = generic, 5 = iconic)."),
    ("Research_Status", "in", 16, None),
    ("Wave", "in", 16, None),
    ("Sources", "in", 40, "Main source URLs. Full list on the Sources tab."),
    ("Notes", "in", 44, "Open questions and conflicts between sources."),
    ("Spaces_Logged", "auto", 9, "Calculated: rows on the Spaces tab for this hotel."),
    ("Colors_Logged", "auto", 9, "Calculated: rows on the Swatches tab for this hotel."),
    ("Measured_Colors", "auto", 10, "Calculated: swatches with Color_Source = Measured."),
    ("Top_Family_by_Area", "auto", 16, "Calculated from Stripes_Area: the color family covering the most documented area."),
    ("Documented_Share_Area", "auto", 11, "Calculated: share of the hotel's logged spaces (by area) that sourced colors describe. Read Top_Family_by_Area with this: a top family at 30% documented is a weak signal."),
]

SPACE_COLS = [
    ("Space_ID", "in", 18, "Hotel_ID + space code, e.g. NSH-NOEL-LOB. Must be unique."),
    ("Hotel_ID", "in", 12, None),
    ("Space_Type", "in", 18, None),
    ("Venue", "in", 26, "Named venue if any, e.g. TY Bar."),
    ("Area_sqft", "in", 10, "Square feet if published or measured. Leave blank to use the space type default."),
    ("Area_Source", "in", 12, None),
    ("Coverage_Pct", "in", 9, "Share of the space (0-100) that the logged colors describe. 100 for a measured photo set. Lower when a source names one feature, e.g. a chandelier. The rest shows as Not yet documented. Seed values are estimates."),
    ("Dwell_Hours", "in", 9, "Hours a typical guest spends here. Leave blank to use the type default."),
    ("Style", "in", 16, None),
    ("Era", "in", 16, None),
    ("Genre", "in", 16, None),
    ("Mood_Tags", "in", 18, "Comma-separated, from the Moods list."),
    ("Lighting", "in", 14, None),
    ("Materials_Motifs", "in", 22, None),
    ("Photo_Op_1to5", "in", 9, "How strong a photo moment this space is."),
    ("Confidence", "in", 10, "High = measured from your calibrated shoot; Medium = direct quote; Low = paraphrase or inference."),
    ("Source_Evidence", "in", 48, "Quote or file names behind the colors."),
    ("Capture_Status", "in", 11, None),
    ("Notes", "in", 30, None),
    ("Hotel_Name", "auto", 26, "Calculated."),
    ("Journey_Order", "auto", 8, "Calculated from the space type: left-to-right position in the stripe."),
    ("Area_Used_sqft", "auto", 10, "Calculated: Area_sqft if given, else the type default from Lists."),
    ("Dwell_Used_h", "auto", 9, "Calculated: Dwell_Hours if given, else the type default from Lists."),
    ("Colors_Logged", "auto", 8, "Calculated."),
    ("Key_Swatch_Hex", "auto", 10, "Calculated: first swatch marked Key_Swatch = Y."),
]

SWATCH_COLS = [
    ("Swatch_ID", "in", 22, "Space_ID + -C + rank."),
    ("Space_ID", "in", 18, None),
    ("Rank", "in", 6, "1 = largest share in the space."),
    ("Hex", "in", 9, "Format #RRGGBB."),
    ("Color_Name", "in", 26, None),
    ("Share_Pct", "in", 8, "Share of this space's logged colors, 0-100. Normalized per space, so they need not total 100."),
    ("Key_Swatch", "in", 7, "Y if this color belongs in the simplified key swatch (photo-op or signature)."),
    ("Key_Reason", "in", 14, None),
    ("Color_Source", "in", 11, "Measured, Described or Estimated. See README."),
    ("Evidence", "in", 30, None),
    ("Hotel_ID", "auto", 11, "Calculated from Space_ID."),
    ("Space_Type", "auto", 16, "Calculated from Space_ID."),
    ("Family", "auto", 17, "Calculated from L*, C*, h with the same rules as the web app (see Lists)."),
    ("L*", "auto", 6, "CIELAB lightness, 0 (black) to 100 (white). Calculated."),
    ("a*", "auto", 6, "CIELAB green (-) to red (+). Calculated."),
    ("b*", "auto", 6, "CIELAB blue (-) to yellow (+). Calculated."),
    ("C*", "auto", 6, "Chroma: how colorful. Calculated."),
    ("Hue_deg", "auto", 7, "Hue angle in CIELAB, 0-360. Calculated."),
    ("Share_in_Space", "auto", 8, "Calculated: Share_Pct / total Share_Pct of the space's logged colors."),
    ("Coverage", "auto", 8, "Calculated from Spaces: Coverage_Pct / 100 (blank = 100%)."),
    ("Area_Used_sqft", "auto", 9, "Calculated from Spaces."),
    ("Weighted_sqft", "auto", 10, "Calculated: Share_in_Space x Coverage x Area_Used_sqft. Feeds Stripes_Area."),
    ("Dwell_Used_h", "auto", 8, "Calculated from Spaces."),
    ("Weighted_hours", "auto", 9, "Calculated: Share_in_Space x Coverage x Dwell_Used_h. Feeds Stripes_Time."),
    ("R", "helper", 5, None), ("G", "helper", 5, None), ("B", "helper", 5, None),
    ("R_lin", "helper", 7, None), ("G_lin", "helper", 7, None), ("B_lin", "helper", 7, None),
    ("X_n", "helper", 7, None), ("Y_n", "helper", 7, None), ("Z_n", "helper", 7, None),
    ("f_x", "helper", 7, None), ("f_y", "helper", 7, None), ("f_z", "helper", 7, None),
    ("Lookup_Key", "helper", 18, None),
]


def letters(cols):
    return {name: get_column_letter(i) for i, (name, *_) in enumerate(cols, start=1)}


H, SP, SW = letters(HOTEL_COLS), letters(SPACE_COLS), letters(SWATCH_COLS)


def rng(sheet, col, cap):
    return f"{sheet}!${col}$2:${col}${cap + 1}"


def write_inputs(ws, r, cols, values, wrap=()):
    for i, (name, kind, *_) in enumerate(cols, start=1):
        if kind != "in":
            continue
        v = values.get(name)
        cell = ws.cell(row=r, column=i, value=None if v in ("", None) else v)
        cell.alignment = WRAP if name in wrap else TOP


def build_lists(wb, vocab):
    ws = wb.create_sheet("Lists")
    refs = {}
    ws["A1"], ws["B1"], ws["C1"], ws["D1"], ws["E1"] = "Space_Type", "Journey_Order", "Default_sqft", "Default_Dwell_h", "Code"
    for c in "ABCDE":
        ws[f"{c}1"].font = F_HEAD
        ws[f"{c}1"].fill = FILL_IN
    ws["C1"].comment = Comment("Planning assumptions, not facts about any hotel. Used only when a space has no published or measured area.", "Colorways")
    ws["D1"].comment = Comment("Planning assumptions for a typical one-night leisure stay. Used only when a space has no measured dwell time.", "Colorways")
    for r, t in enumerate(vocab["spaceTypes"], start=2):
        ws.cell(row=r, column=1, value=t["name"])
        ws.cell(row=r, column=2, value=t["order"])
        ws.cell(row=r, column=3, value=t["sqft"]).number_format = "#,##0"
        ws.cell(row=r, column=4, value=t["dwell"])
        ws.cell(row=r, column=5, value=t["code"])
    n = len(vocab["spaceTypes"]) + 1
    refs["space"] = f"Lists!$A$2:$A${n}"
    refs["space_order"] = f"Lists!$B$2:$B${n}"
    refs["space_sqft"] = f"Lists!$C$2:$C${n}"
    refs["space_dwell"] = f"Lists!$D$2:$D${n}"

    ws["G1"], ws["H1"], ws["I1"] = "Color_Family", "Swatch_Hex", "Range (CIELAB rules, same as the web app)"
    for c in "GHI":
        ws[f"{c}1"].font = F_HEAD
        ws[f"{c}1"].fill = FILL_AUTO
    for r, (name, hx, rng) in enumerate(colorlib.FAMILIES, start=2):
        ws.cell(row=r, column=7, value=name)
        c = ws.cell(row=r, column=8, value=hx)
        c.fill = PatternFill("solid", start_color=hx[1:], end_color=hx[1:])
        c.font = Font(name=ARIAL, size=10, color=ink(hx))
        ws.cell(row=r, column=9, value=rng)
    refs["family"] = f"Lists!$G$2:$G${len(colorlib.FAMILIES) + 1}"

    simple = [
        ("styles", "Styles"), ("eras", "Design_Eras"), ("genres", "Genres"), ("moods", "Moods"), ("lighting", "Lighting"),
        ("colorSources", "Color_Source"), ("confidence", "Confidence"), ("regions", "Region"), ("hotelStatus", "Hotel_Status"),
        ("researchStatus", "Research_Status"), ("areaSources", "Area_Source"), ("captureStatus", "Capture_Status"),
        ("keyReasons", "Key_Reason"), ("mediaTypes", "Media_Type"), ("rightsStatus", "Rights_Status"), ("waves", "Wave"),
        ("yesno", "Yes_No"),
    ]
    col = 11
    for key, title in simple:
        values = ["Y", "N"] if key == "yesno" else vocab[key]
        if key == "colorSources":
            values = [s["name"] for s in values]
        L = get_column_letter(col)
        ws[f"{L}1"] = title
        ws[f"{L}1"].font = F_HEAD
        ws[f"{L}1"].fill = FILL_IN
        for r, val in enumerate(values, start=2):
            ws.cell(row=r, column=col, value=val)
        refs[key] = f"Lists!${L}$2:${L}${len(values) + 1}"
        ws.column_dimensions[L].width = max(12, min(34, max(len(str(v)) for v in values) + 2))
        col += 1
    for L, w in {"A": 20, "B": 9, "C": 11, "D": 11, "E": 7, "G": 20, "H": 11, "I": 60}.items():
        ws.column_dimensions[L].width = w
    ws.freeze_panes = "A2"
    return refs


def build_hotels(wb, hotels, refs):
    ws = wb.create_sheet("Hotels", 1)
    header(ws, HOTEL_COLS)
    c = H
    for r, h in enumerate(hotels, start=2):
        fams = (h["keyFamilies"] + ["", "", ""])[:3]
        write_inputs(ws, r, HOTEL_COLS, {
            "Hotel_ID": h["id"], "Hotel_Name": h["name"], "Brand_Collection": h["brand"], "City": h["city"],
            "State": h["state"], "Region": h["region"], "Status": h["status"], "Opened": h["opened"],
            "Last_Redesign": h["redesign"], "Architect": h["architect"], "Interior_Designer": h["interiorDesigner"],
            "Primary_Style": h["primaryStyle"], "Secondary_Style": h["secondaryStyle"], "Design_Era": h["era"],
            "Genre": h["genre"], "Signature_Palette_Described": h["palette"], "Key_Family_1": fams[0],
            "Key_Family_2": fams[1], "Key_Family_3": fams[2], "Signature_Photo_Op": h["photoOp"],
            "Media_Editorial_Film": h["media"], "Rooms": h["rooms"], "Std_Room_sqft": h["stdRoomSqft"],
            "Meeting_Space_sqft": h["meetingSqft"], "Distinctiveness_1to5": h["distinctiveness"],
            "Research_Status": h["researchStatus"], "Wave": h["wave"],
            "Sources": "\n".join(s["url"] for s in h["sources"][:3]), "Notes": h["notes"],
        }, wrap={"Interior_Designer", "Signature_Palette_Described", "Signature_Photo_Op", "Media_Editorial_Film",
                 "Sources", "Notes"})
    last = len(hotels) + 1
    sp_hotel = rng("Spaces", SP["Hotel_ID"], CAP_SPACES)
    sw_hotel = rng("Swatches", SW["Hotel_ID"], CAP_SWATCHES)
    sw_src = rng("Swatches", SW["Color_Source"], CAP_SWATCHES)
    for r in range(2, CAP_HOTELS + 2):
        ws[f"{c['Spaces_Logged']}{r}"] = f'=IF($A{r}="","",COUNTIF({sp_hotel},$A{r}))'
        ws[f"{c['Colors_Logged']}{r}"] = f'=IF($A{r}="","",COUNTIF({sw_hotel},$A{r}))'
        ws[f"{c['Measured_Colors']}{r}"] = f'=IF($A{r}="","",COUNTIFS({sw_hotel},$A{r},{sw_src},"Measured"))'
        ws[f"{c['Top_Family_by_Area']}{r}"] = (
            f'=IF(OR($A{r}="",Stripes_Area!$S{r}="",Stripes_Area!$S{r}=0),"",IF(MAX(Stripes_Area!$C{r}:$Q{r})=0,"",'
            f'INDEX(Stripes_Area!$C$1:$Q$1,MATCH(MAX(Stripes_Area!$C{r}:$Q{r}),Stripes_Area!$C{r}:$Q{r},0))))')
        ws[f"{c['Documented_Share_Area']}{r}"] = (f'=IF(OR($A{r}="",Stripes_Area!$S{r}="",Stripes_Area!$S{r}=0),"",'
                                                  f'1-Stripes_Area!$R{r})')
        ws[f"{c['Documented_Share_Area']}{r}"].number_format = "0%"
        for name in ("Rooms", "Std_Room_sqft", "Meeting_Space_sqft"):
            ws[f"{c[name]}{r}"].number_format = "#,##0"
    end = CAP_HOTELS + 1
    list_dv(ws, f"{c['Region']}2:{c['Region']}{end}", refs["regions"])
    list_dv(ws, f"{c['Status']}2:{c['Status']}{end}", refs["hotelStatus"])
    for k in ("Primary_Style", "Secondary_Style"):
        list_dv(ws, f"{c[k]}2:{c[k]}{end}", refs["styles"])
    list_dv(ws, f"{c['Design_Era']}2:{c['Design_Era']}{end}", refs["eras"])
    list_dv(ws, f"{c['Genre']}2:{c['Genre']}{end}", refs["genres"])
    for k in ("Key_Family_1", "Key_Family_2", "Key_Family_3"):
        list_dv(ws, f"{c[k]}2:{c[k]}{end}", refs["family"])
    list_dv(ws, f"{c['Research_Status']}2:{c['Research_Status']}{end}", refs["researchStatus"])
    list_dv(ws, f"{c['Wave']}2:{c['Wave']}{end}", refs["waves"])
    dv = DataValidation(type="whole", operator="between", formula1="1", formula2="5", allow_blank=True)
    dv.error, dv.errorTitle, dv.showErrorMessage = "Use a whole number from 1 to 5.", "Distinctiveness", True
    ws.add_data_validation(dv)
    dv.add(f"{c['Distinctiveness_1to5']}2:{c['Distinctiveness_1to5']}{end}")
    family_cf(ws, f"{c['Key_Family_1']}2:{c['Key_Family_3']}{end}")
    family_cf(ws, f"{c['Top_Family_by_Area']}2:{c['Top_Family_by_Area']}{end}")
    ws.auto_filter.ref = f"A1:{get_column_letter(len(HOTEL_COLS))}{last}"


def build_spaces(wb, hotels, refs):
    ws = wb.create_sheet("Spaces", 2)
    header(ws, SPACE_COLS)
    c = SP
    r = 2
    for h in hotels:
        for s in h["spaces"]:
            write_inputs(ws, r, SPACE_COLS, {
                "Space_ID": s["id"], "Hotel_ID": h["id"], "Space_Type": s["type"], "Venue": s["venue"],
                "Area_sqft": s["sqft"], "Area_Source": s["sqftSource"], "Coverage_Pct": s["coverage"],
                "Dwell_Hours": s["dwell"], "Style": s["style"], "Era": s["era"], "Genre": s["genre"],
                "Mood_Tags": ", ".join(s["mood"]), "Lighting": s["lighting"], "Materials_Motifs": s["materials"],
                "Photo_Op_1to5": s["photoOp"], "Confidence": s["confidence"],
                "Source_Evidence": s["evidence"] + (("  " + s["url"]) if s["url"] else ""),
                "Capture_Status": s["captureStatus"],
                "Notes": s["notes"] or ("Placeholder from the default capture plan; delete if the hotel has no such space."
                                        if s.get("placeholder") else ""),
            }, wrap={"Source_Evidence", "Notes"})
            r += 1
    last = r - 1
    h_id, h_name = rng("Hotels", H["Hotel_ID"], CAP_HOTELS), rng("Hotels", H["Hotel_Name"], CAP_HOTELS)
    sw_space, sw_hex = rng("Swatches", SW["Space_ID"], CAP_SWATCHES), rng("Swatches", SW["Hex"], CAP_SWATCHES)
    sw_key = rng("Swatches", SW["Lookup_Key"], CAP_SWATCHES)
    t, a, d = c["Space_Type"], c["Area_sqft"], c["Dwell_Hours"]
    for r in range(2, CAP_SPACES + 2):
        ws[f"{c['Hotel_Name']}{r}"] = f'=IF($B{r}="","",IFERROR(INDEX({h_name},MATCH($B{r},{h_id},0)),"(unknown hotel)"))'
        ws[f"{c['Journey_Order']}{r}"] = f'=IF(${t}{r}="","",IFERROR(INDEX({refs["space_order"]},MATCH(${t}{r},{refs["space"]},0)),""))'
        ws[f"{c['Area_Used_sqft']}{r}"] = (f'=IF(${t}{r}="","",IF(AND(ISNUMBER(${a}{r}),${a}{r}>0),${a}{r},'
                                           f'IFERROR(INDEX({refs["space_sqft"]},MATCH(${t}{r},{refs["space"]},0)),"")))')
        ws[f"{c['Dwell_Used_h']}{r}"] = (f'=IF(${t}{r}="","",IF(ISNUMBER(${d}{r}),${d}{r},'
                                         f'IFERROR(INDEX({refs["space_dwell"]},MATCH(${t}{r},{refs["space"]},0)),"")))')
        ws[f"{c['Colors_Logged']}{r}"] = f'=IF($A{r}="","",COUNTIF({sw_space},$A{r}))'
        ws[f"{c['Key_Swatch_Hex']}{r}"] = f'=IF($A{r}="","",IFERROR(INDEX({sw_hex},MATCH($A{r}&"|Y",{sw_key},0)),""))'
        ws[f"{a}{r}"].number_format = "#,##0"
        ws[f"{c['Area_Used_sqft']}{r}"].number_format = "#,##0"
    end = CAP_SPACES + 1
    list_dv(ws, f"{c['Hotel_ID']}2:{c['Hotel_ID']}{end}", h_id)
    list_dv(ws, f"{c['Space_Type']}2:{c['Space_Type']}{end}", refs["space"])
    list_dv(ws, f"{c['Area_Source']}2:{c['Area_Source']}{end}", refs["areaSources"])
    list_dv(ws, f"{c['Style']}2:{c['Style']}{end}", refs["styles"])
    list_dv(ws, f"{c['Era']}2:{c['Era']}{end}", refs["eras"])
    list_dv(ws, f"{c['Genre']}2:{c['Genre']}{end}", refs["genres"])
    list_dv(ws, f"{c['Lighting']}2:{c['Lighting']}{end}", refs["lighting"])
    list_dv(ws, f"{c['Confidence']}2:{c['Confidence']}{end}", refs["confidence"])
    list_dv(ws, f"{c['Capture_Status']}2:{c['Capture_Status']}{end}", refs["captureStatus"])
    for col_name, lo, hi, title, msg in (("Photo_Op_1to5", "1", "5", "Photo-op score", "Use a whole number from 1 to 5."),):
        dv = DataValidation(type="whole", operator="between", formula1=lo, formula2=hi, allow_blank=True)
        dv.error, dv.errorTitle, dv.showErrorMessage = msg, title, True
        ws.add_data_validation(dv)
        dv.add(f"{c[col_name]}2:{c[col_name]}{end}")
    cdv = DataValidation(type="decimal", operator="between", formula1="0", formula2="100", allow_blank=True)
    cdv.error, cdv.errorTitle, cdv.showErrorMessage = "Coverage is a number from 0 to 100.", "Coverage", True
    ws.add_data_validation(cdv)
    cdv.add(f"{c['Coverage_Pct']}2:{c['Coverage_Pct']}{end}")
    ws.auto_filter.ref = f"A1:{get_column_letter(len(SPACE_COLS))}{last}"
    return last


def build_swatches(wb, hotels, refs):
    ws = wb.create_sheet("Swatches", 3)
    header(ws, SWATCH_COLS)
    r = 2
    for h in hotels:
        for s in h["spaces"]:
            for col in s["colors"]:
                write_inputs(ws, r, SWATCH_COLS, {
                    "Swatch_ID": col["id"], "Space_ID": s["id"], "Rank": col["rank"], "Hex": col["hex"],
                    "Color_Name": col["name"], "Share_Pct": col["share"], "Key_Swatch": "Y" if col["key"] else "N",
                    "Key_Reason": col["reason"], "Color_Source": col["source"],
                    "Evidence": col.get("evidence") or (s["evidence"][:120] if s["evidence"] else ""),
                })
                r += 1
    last = r - 1
    S = CAP_SWATCHES + 1
    w = SW
    sp_id = rng("Spaces", SP["Space_ID"], CAP_SPACES)

    def lookup(name, default):
        return f'IFERROR(INDEX({rng("Spaces", SP[name], CAP_SPACES)},MATCH($B{{r}},{sp_id},0)),{default})'

    for r in range(2, S + 1):
        x = {k: f"{v}{r}" for k, v in w.items()}
        hexc = f"${w['Hex']}{r}"
        f = {
            "Hotel_ID": f'=IF($B{r}="","",' + lookup("Hotel_ID", '"(unknown space)"').format(r=r) + ")",
            "Space_Type": f'=IF($B{r}="","",' + lookup("Space_Type", '""').format(r=r) + ")",
            "Family": family_formula(x["L*"], x["C*"], x["Hue_deg"]),
            "L*": f'=IF({x["f_y"]}="","",116*{x["f_y"]}-16)',
            "a*": f'=IF({x["f_x"]}="","",500*({x["f_x"]}-{x["f_y"]}))',
            "b*": f'=IF({x["f_y"]}="","",200*({x["f_y"]}-{x["f_z"]}))',
            "C*": f'=IF({x["L*"]}="","",SQRT({x["a*"]}^2+{x["b*"]}^2))',
            "Hue_deg": f'=IF({x["L*"]}="","",IF({x["C*"]}<0.0001,0,MOD(DEGREES(ATAN2({x["a*"]},{x["b*"]})),360)))',
            "Share_in_Space": (f'=IF(OR($B{r}="",${w["Share_Pct"]}{r}=""),"",IFERROR(${w["Share_Pct"]}{r}/'
                               f'SUMIF($B$2:$B${S},$B{r},${w["Share_Pct"]}$2:${w["Share_Pct"]}${S}),""))'),
            "Coverage": (f'=IF($B{r}="","",IFERROR(IF(ISNUMBER(' + lookup("Coverage_Pct", '""').format(r=r) + '),'
                         + lookup("Coverage_Pct", '""').format(r=r) + '/100,1),1))'),
            "Area_Used_sqft": f'=IF($B{r}="","",' + lookup("Area_Used_sqft", '""').format(r=r) + ")",
            "Weighted_sqft": (f'=IF(OR({x["Share_in_Space"]}="",{x["Coverage"]}="",{x["Area_Used_sqft"]}=""),0,'
                              f'{x["Share_in_Space"]}*{x["Coverage"]}*{x["Area_Used_sqft"]})'),
            "Dwell_Used_h": f'=IF($B{r}="","",' + lookup("Dwell_Used_h", '""').format(r=r) + ")",
            "Weighted_hours": (f'=IF(OR({x["Share_in_Space"]}="",{x["Coverage"]}="",{x["Dwell_Used_h"]}=""),0,'
                               f'{x["Share_in_Space"]}*{x["Coverage"]}*{x["Dwell_Used_h"]})'),
            "R": f'=IF(LEN({hexc})<>7,"",HEX2DEC(MID({hexc},2,2)))',
            "G": f'=IF(LEN({hexc})<>7,"",HEX2DEC(MID({hexc},4,2)))',
            "B": f'=IF(LEN({hexc})<>7,"",HEX2DEC(MID({hexc},6,2)))',
        }
        for src, dst in (("R", "R_lin"), ("G", "G_lin"), ("B", "B_lin")):
            v = x[src]
            f[dst] = f'=IF({v}="","",IF({v}/255<=0.04045,{v}/255/12.92,(({v}/255+0.055)/1.055)^2.4))'
        rl, gl, bl = x["R_lin"], x["G_lin"], x["B_lin"]
        f["X_n"] = f'=IF({rl}="","",(0.4124564*{rl}+0.3575761*{gl}+0.1804375*{bl})/0.95047)'
        f["Y_n"] = f'=IF({rl}="","",0.2126729*{rl}+0.7151522*{gl}+0.072175*{bl})'
        f["Z_n"] = f'=IF({rl}="","",(0.0193339*{rl}+0.119192*{gl}+0.9503041*{bl})/1.08883)'
        for src, dst in (("X_n", "f_x"), ("Y_n", "f_y"), ("Z_n", "f_z")):
            v = x[src]
            f[dst] = f'=IF({v}="","",IF({v}>0.00885645167903563,{v}^(1/3),(903.296296296296*{v}+16)/116))'
        f["Lookup_Key"] = f'=IF($B{r}="","",$B{r}&"|"&${w["Key_Swatch"]}{r})'
        for name, formula in f.items():
            ws[x[name]] = formula
        for name in ("L*", "a*", "b*", "C*", "Hue_deg"):
            ws[x[name]].number_format = "0.0"
        for name in ("Share_in_Space", "Coverage"):
            ws[x[name]].number_format = "0%"
        for name in ("Area_Used_sqft", "Weighted_sqft"):
            ws[x[name]].number_format = "#,##0"
        ws[x["Weighted_hours"]].number_format = "0.00"
    for name, kind, *_ in SWATCH_COLS:
        if kind == "helper":
            ws.column_dimensions[w[name]].outlineLevel = 1
            ws.column_dimensions[w[name]].hidden = True
    list_dv(ws, f"{w['Space_ID']}2:{w['Space_ID']}{S}", sp_id)
    list_dv(ws, f"{w['Key_Swatch']}2:{w['Key_Swatch']}{S}", refs["yesno"])
    list_dv(ws, f"{w['Key_Reason']}2:{w['Key_Reason']}{S}", refs["keyReasons"])
    list_dv(ws, f"{w['Color_Source']}2:{w['Color_Source']}{S}", refs["colorSources"])
    hx = w["Hex"]
    hexdv = DataValidation(type="custom", allow_blank=True,
                           formula1=f'AND(LEN({hx}2)=7,LEFT({hx}2,1)="#",ISNUMBER(HEX2DEC(MID({hx}2,2,6))))')
    hexdv.error, hexdv.errorTitle, hexdv.showErrorMessage = "Use the format #RRGGBB, for example #1F5F8B.", "Hex color", True
    ws.add_data_validation(hexdv)
    hexdv.add(f"{hx}2:{hx}{S}")
    sharedv = DataValidation(type="decimal", operator="between", formula1="0", formula2="100", allow_blank=True)
    sharedv.error, sharedv.errorTitle, sharedv.showErrorMessage = "Share is a number from 0 to 100.", "Share", True
    ws.add_data_validation(sharedv)
    sharedv.add(f"{w['Share_Pct']}2:{w['Share_Pct']}{S}")
    family_cf(ws, f"{w['Family']}2:{w['Family']}{S}")
    ws.auto_filter.ref = f"A1:{w['Weighted_hours']}{last}"
    return last


def family_cf(ws, rng_):
    for name, hx, _ in colorlib.FAMILIES:
        fill = PatternFill("solid", start_color=hx[1:], end_color=hx[1:])
        ws.conditional_formatting.add(rng_, CellIsRule(operator="equal", formula=[f'"{name}"'], fill=fill,
                                                       font=Font(name=ARIAL, color=ink(hx))))


UNDOC_FILL = "E6E2DA"


def build_stripes(wb, n_hotels, title, sheet, weight_name, total_name, total_note, space_weight_name):
    ws = wb.create_sheet(sheet)
    fams = colorlib.FAMILIES
    ws["A1"], ws["B1"] = "Hotel_ID", "Hotel_Name"
    for cc in ("A1", "B1"):
        ws[cc].font = F_HEAD
        ws[cc].fill = FILL_AUTO
    for j, (name, hx, _) in enumerate(fams):
        cell = ws.cell(row=1, column=3 + j, value=name)
        cell.font = Font(name=ARIAL, size=9, bold=True, color=ink(hx))
        cell.fill = PatternFill("solid", start_color=hx[1:], end_color=hx[1:])
        cell.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
        ws.column_dimensions[get_column_letter(3 + j)].width = 10
    und = ws.cell(row=1, column=18, value="Not yet documented")
    und.font = Font(name=ARIAL, size=9, bold=True, color="4A463F")
    und.fill = PatternFill("solid", start_color=UNDOC_FILL, end_color=UNDOC_FILL)
    und.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
    und.comment = Comment("Share of the documented spaces that the logged colors do not describe (from Coverage_Pct).", "Colorways")
    tot = ws.cell(row=1, column=19, value=total_name)
    tot.font, tot.fill = F_HEAD, FILL_AUTO
    tot.comment = Comment(total_note, "Colorways")
    ws.row_dimensions[1].height = 34
    ws.column_dimensions["A"].width = 11
    ws.column_dimensions["B"].width = 34
    ws.column_dimensions["R"].width = 11
    ws.column_dimensions["S"].width = 13
    S = CAP_SWATCHES + 1
    weight = rng("Swatches", SW[weight_name], CAP_SWATCHES)
    sw_hotel = rng("Swatches", SW["Hotel_ID"], CAP_SWATCHES)
    sw_fam = rng("Swatches", SW["Family"], CAP_SWATCHES)
    sp_weight = rng("Spaces", SP[space_weight_name], CAP_SPACES)
    sp_hotel = rng("Spaces", SP["Hotel_ID"], CAP_SPACES)
    sp_colors = rng("Spaces", SP["Colors_Logged"], CAP_SPACES)
    for r in range(2, CAP_HOTELS + 2):
        ws[f"A{r}"] = f'=IF(Hotels!${H["Hotel_ID"]}{r}="","",Hotels!${H["Hotel_ID"]}{r})'
        ws[f"B{r}"] = f'=IF(Hotels!${H["Hotel_ID"]}{r}="","",Hotels!${H["Hotel_Name"]}{r})'
        ws[f"S{r}"] = f'=IF($A{r}="","",SUMIFS({sp_weight},{sp_hotel},$A{r},{sp_colors},">0"))'
        ws[f"S{r}"].number_format = "#,##0.0"
        for j in range(len(fams)):
            L = get_column_letter(3 + j)
            ws[f"{L}{r}"] = f'=IF($A{r}="","",IFERROR(SUMIFS({weight},{sw_hotel},$A{r},{sw_fam},{L}$1)/$S{r},0))'
            ws[f"{L}{r}"].number_format = "0%"
        ws[f"R{r}"] = f'=IF(OR($A{r}="",$S{r}="",$S{r}=0),"",MAX(0,1-SUM($C{r}:$Q{r})))'
        ws[f"R{r}"].number_format = "0%"
    for j, (name, hx, _) in enumerate(fams):
        L = get_column_letter(3 + j)
        ws.conditional_formatting.add(f"{L}2:{L}{CAP_HOTELS + 1}",
                                      ColorScaleRule(start_type="num", start_value=0, start_color="FFFFFF",
                                                     end_type="num", end_value=1, end_color=hx[1:]))
    ws.conditional_formatting.add(f"R2:R{CAP_HOTELS + 1}",
                                  ColorScaleRule(start_type="num", start_value=0, start_color="FFFFFF",
                                                 end_type="num", end_value=1, end_color="BDB6AA"))
    ws.freeze_panes = "C2"
    last = n_hotels + 1
    chart = BarChart()
    chart.type = "bar"
    chart.grouping = "percentStacked"
    chart.overlap = 100
    chart.gapWidth = 40
    chart.title = title
    chart.style = 2
    data = Reference(ws, min_col=3, max_col=18, min_row=1, max_row=last)
    cats = Reference(ws, min_col=2, min_row=2, max_row=last)
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    fills = [hx for _, hx, _ in fams] + ["#" + UNDOC_FILL]
    for s, hx in zip(chart.series, fills):
        s.graphicalProperties.solidFill = hx[1:]
        s.graphicalProperties.line.solidFill = "FFFFFF"
        s.graphicalProperties.line.width = 12700
    chart.x_axis.scaling.orientation = "maxMin"
    chart.x_axis.delete = False
    chart.y_axis.delete = False
    chart.y_axis.number_format = "0%"
    chart.y_axis.majorGridlines = None
    chart.legend.position = "b"
    chart.height = max(12, 0.62 * n_hotels)
    chart.width = 26
    ws.add_chart(chart, "U2")
    note = ws.cell(row=CAP_HOTELS + 3, column=1,
                   value="Each bar is one hotel's documented spaces split by color family; gray is the part no source describes yet. "
                         "Hotels with no colors show an empty bar. Described colors are approximations from cited text, not measurements.")
    note.font = F_MUTED
    return ws


def build_media(wb, media, refs):
    ws = wb.create_sheet("Media_Sources")
    cols = [("Media_ID", "in", 10, None), ("Hotel_ID", "in", 12, None), ("Media_Type", "in", 18, None),
            ("Outlet", "in", 22, None), ("Title", "in", 46, None), ("Date", "in", 11, None), ("Credit", "in", 18, "Photographer or publication credit."),
            ("URL", "in", 50, None), ("Spaces_Featured", "in", 24, None),
            ("Rights_Status", "in", 18, "Reference only (link) = do not republish images; link or describe. Licensed/Owned = may display per terms."),
            ("Notes", "in", 30, None)]
    header(ws, cols)
    for r, m in enumerate(media, start=2):
        vals = [f"MED-{r - 1:03d}", m["hotelId"], m["type"], m["outlet"], m["title"], m.get("date") or None, m.get("credit") or None,
                m["url"], m.get("spaces") or None, m["rights"], m.get("notes") or None]
        for i, v in enumerate(vals, start=1):
            ws.cell(row=r, column=i, value=v).alignment = TOP
    list_dv(ws, "B2:B500", f"Hotels!$A$2:$A${CAP_HOTELS + 1}")
    list_dv(ws, "C2:C500", refs["mediaTypes"])
    list_dv(ws, "J2:J500", refs["rightsStatus"])
    ws.auto_filter.ref = f"A1:K{len(media) + 1}"


def build_capture(wb, refs):
    ws = wb.create_sheet("Capture_Log")
    cols = [("Capture_ID", "in", 12, None), ("Date", "in", 11, None), ("Hotel_ID", "in", 12, None), ("Space_ID", "in", 18, None),
            ("Media", "in", 8, "Photo or Video."), ("Files", "in", 34, None), ("Device", "in", 16, None), ("Time_of_Day", "in", 11, None),
            ("Lighting", "in", 14, None), ("White_Balance", "in", 22, "Gray card, ColorChecker, or Auto. Gray card or better is needed for Measured colors."),
            ("Calibration_Target_in_Frame", "in", 12, "Y if a gray card or color chart appears in a reference frame."),
            ("Rights", "in", 16, None), ("Analyzed", "in", 9, "Y once run through the Colorways Analyze tab."), ("Notes", "in", 34, None)]
    header(ws, cols)
    example = ["EXAMPLE", "2026-11-14", "NSH-NOEL", "NSH-NOEL-LOB", "Photo", "NSH-NOEL_LOB_20261114_001-012.dng", "iPhone (ProRAW)",
               "10:30", "Natural daylight", "Gray card", "Y", "Owned", "N", "Example row showing the format. Delete it."]
    for i, v in enumerate(example, start=1):
        cell = ws.cell(row=2, column=i, value=v)
        cell.fill = FILL_EXAMPLE
        cell.font = F_MUTED
    list_dv(ws, "C2:C1000", f"Hotels!$A$2:$A${CAP_HOTELS + 1}")
    list_dv(ws, "D2:D1000", f"Spaces!$A$2:$A${CAP_SPACES + 1}")
    list_dv(ws, "I2:I1000", refs["lighting"])
    list_dv(ws, "K2:K1000", refs["yesno"])
    list_dv(ws, "L2:L1000", refs["rightsStatus"])
    list_dv(ws, "M2:M1000", refs["yesno"])


def build_sources(wb, hotels):
    ws = wb.create_sheet("Sources")
    header(ws, [("Hotel_ID", "in", 12, None), ("Source", "in", 60, None), ("URL", "in", 90, None)])
    r = 2
    for h in hotels:
        for s in h["sources"]:
            ws.cell(row=r, column=1, value=h["id"])
            ws.cell(row=r, column=2, value=s["label"])
            cell = ws.cell(row=r, column=3, value=s["url"])
            cell.hyperlink = s["url"]
            cell.font = F_LINK
            r += 1
    ws.auto_filter.ref = f"A1:C{max(2, r - 1)}"


def build_readme(wb, vocab, hotels, n_spaces, n_swatches):
    ws = wb.active
    ws.title = "README"
    ws.column_dimensions["A"].width = 26
    ws.column_dimensions["B"].width = 110
    with_colors = sum(1 for h in hotels if any(s["colors"] for s in h["spaces"]))
    rows = [
        ("Colorways Hotel Color Index", None, F_TITLE),
        (f"Version {VERSION}, built {TODAY} from data/seed/hotels.json by tools/build.py", None, F_MUTED),
        (None, None, None),
        ("What this is", "A log of hotels split into their key spaces, with each space's colors, styles, eras and genres. "
                         "It feeds the hotel stripe: a band per stay where each space is a block sized by area (or time) "
                         "and filled with its colors.", None),
        ("Current contents", f"{len(hotels)} hotels, {n_spaces} spaces, {n_swatches} color swatches. "
                             f"{with_colors} hotels have colors so far.", None),
        (None, None, None),
        ("How to use it", None, F_H2),
        ("1. Hotels", "One row per property. Add new hotels at the bottom. Status is Open only when a 2025-2026 source confirms it.", None),
        ("2. Spaces", "One row per key space (lobby, bar, room...). Every hotel starts with a default capture plan; delete rows that do not exist.", None),
        ("3. Swatches", "One row per color per space. Type the Hex and Share_Pct; the gray columns compute CIELAB values and the color family.", None),
        ("4. Stripes_Area / _Time", "Color-family share of each hotel's stay, weighted by square feet or by hours. The chart is the spreadsheet version of the stripe.", None),
        ("5. Capture_Log", "Log every shoot: files, lighting, white balance, rights. Needed before a color can be marked Measured.", None),
        ("6. Media_Sources", "Magazine shoots, films and promo material per hotel, with rights status. Reference only means link, do not republish.", None),
        (None, None, None),
        ("Legend", None, F_H2),
        ("Yellow header", "You type here (inputs). Dropdowns come from the Lists tab; you can type other values after a warning.", None),
        ("Gray header", "Calculated automatically. Do not type over these. To add rows past the pre-filled range, copy the last row's gray cells down.", None),
        ("Green row", "Example row showing the expected format. Delete it once you have real rows.", None),
        (None, None, None),
        ("Color sources", None, F_H2),
    ]
    rows += [(s["name"], s["meaning"], None) for s in vocab["colorSources"]]
    rows += [
        (None, None, None),
        ("Important caveats", None, F_H2),
        ("Seed colors", "Every seeded color is Described: a hex approximated from a cited written description, checked to fall in the "
                        "named color family. Shares are estimates of how a source lists colors. None are measurements yet.", None),
        ("Quotes", "Seed quotes come from search-result excerpts of the cited pages (pages could not be opened during research). "
                   "Spot-check each quote on the page before publishing.", None),
        ("Defaults", "Space-type square feet and dwell hours on the Lists tab are planning assumptions, used only when a space has "
                     "no published or measured value.", None),
        ("Area weighting", "Square feet measure the building, not the experience: a 6-acre pool deck or a casino can swamp a 450 sq ft "
                           "room. Compare with Stripes_Time (hours) before drawing conclusions.", None),
        ("Families", "15 color families from CIELAB lightness, chroma and hue. The same rules run in the web app "
                     "(app/js/color.js) and here (Swatches column M).", None),
    ]
    for r, (a, b, font) in enumerate(rows, start=1):
        if a is not None:
            ca = ws.cell(row=r, column=1, value=a)
            ca.font = font or F_HEAD
            ca.alignment = TOP
        if b is not None:
            cb = ws.cell(row=r, column=2, value=b)
            cb.font = F_BODY
            cb.alignment = WRAP
    ws["A16"].fill = FILL_IN
    ws["A17"].fill = FILL_AUTO
    ws["A18"].fill = FILL_EXAMPLE


def build_workbook(vocab, hotels, media):
    wb = Workbook()
    # Make Arial the base font (font id 0), so every unformatted cell, including ones you type into later, is Arial.
    wb._fonts = IndexedList([Font(name=ARIAL, size=10)])
    wb._named_styles["Normal"].font = Font(name=ARIAL, size=10)
    n_spaces = sum(len(h["spaces"]) for h in hotels)
    n_swatches = sum(len(s["colors"]) for h in hotels for s in h["spaces"])
    if len(hotels) > CAP_HOTELS or n_spaces > CAP_SPACES or n_swatches > CAP_SWATCHES:
        raise SeedError("seed is larger than the pre-filled workbook capacity; raise the CAP_* constants")
    build_readme(wb, vocab, hotels, n_spaces, n_swatches)
    refs = build_lists(wb, vocab)
    build_hotels(wb, hotels, refs)
    build_spaces(wb, hotels, refs)
    build_swatches(wb, hotels, refs)
    build_stripes(wb, len(hotels), "Hotel stripes by color family, weighted by square feet", "Stripes_Area",
                  "Weighted_sqft", "Documented_sqft", "Total area (Area_Used_sqft) of this hotel's spaces that have colors logged.",
                  "Area_Used_sqft")
    build_stripes(wb, len(hotels), "Hotel stripes by color family, weighted by guest hours", "Stripes_Time",
                  "Weighted_hours", "Documented_hours", "Total guest hours (Dwell_Used_h) of this hotel's spaces that have colors logged.",
                  "Dwell_Used_h")
    build_media(wb, media, refs)
    build_capture(wb, refs)
    build_sources(wb, hotels)
    wb.move_sheet("Lists", offset=len(wb.sheetnames))
    wb.calculation.fullCalcOnLoad = True
    XLSX.parent.mkdir(parents=True, exist_ok=True)
    wb.save(XLSX)
    return n_spaces, n_swatches


DICT_MD = ROOT / "docs" / "DATA_DICTIONARY.md"
KIND = {"in": "Input", "auto": "Calculated", "helper": "Hidden helper"}


def write_dictionary(vocab):
    def table(cols):
        rows = ["| Column | Type | Notes |", "|---|---|---|"]
        for name, kind, _, note in cols:
            rows.append(f"| {name} | {KIND[kind]} | {(note or '').replace('|', '/')} |")
        return "\n".join(rows)

    fam_rows = ["| Family | Swatch hex | Range |", "|---|---|---|"]
    fam_rows += [f"| {n} | `{h}` | {r} |" for n, h, r in colorlib.FAMILIES]
    sp_rows = ["| Space type | Code | Journey order | Default sq ft | Default hours | Covers |", "|---|---|---|---|---|---|"]
    sp_rows += [f"| {t['name']} | {t['code']} | {t['order']} | {t['sqft']:,} | {t['dwell']} | {t['hint']} |" for t in vocab["spaceTypes"]]
    text = f"""# Data dictionary

_Generated by tools/build.py on {TODAY} from the same column definitions that build the workbook. Edit tools/build.py or data/vocab.json, not this file._

The workbook (deliverables/Colorways_Hotel_Color_Index.xlsx) is a small relational model:
**Hotels** (one row per property) -> **Spaces** (one row per key space) -> **Swatches** (one row per color per space).
Stripes_Area and Stripes_Time roll swatches up into each hotel's color-family shares. Yellow headers are inputs;
gray headers are calculated.

## IDs

- Hotel_ID: city code + short name, e.g. `NSH-NOEL`.
- Space_ID: Hotel_ID + space code, e.g. `NSH-NOEL-LOB`; a number is added when a hotel has two spaces of one type (`LV-FONT-LOB1`, `LV-FONT-LOB2`). Spaces measured in the app get `-M1`, `-M2`.
- Swatch_ID: Space_ID + `-C` + rank, e.g. `NSH-NOEL-LOB-C1`.

## Hotels

{table(HOTEL_COLS)}

## Spaces

{table(SPACE_COLS)}

## Swatches

{table(SWATCH_COLS)}

## Stripes_Area and Stripes_Time

One row per hotel (same row order as Hotels). Columns C to Q hold each color family's share of the hotel's documented
spaces, R holds the share not yet documented (from Coverage_Pct), and S holds the total weight (square feet or guest
hours of spaces that have colors logged). Shares in C to R sum to 100%. The 100% stacked bar chart beside the table is
the spreadsheet version of the hotel stripe, by family.

## How a family share is computed

For each swatch: Share_in_Space = Share_Pct / (sum of Share_Pct in that space); Weighted = Share_in_Space x Coverage x
weight of the space (Area_Used_sqft or Dwell_Used_h). A hotel's family share = sum of Weighted for that family / sum of
the weights of its spaces that have colors. The web app computes exactly the same thing (app/js/model.js), and
tests/test_build.py plus the LibreOffice recalculation check confirm the two agree.

## Color families (CIELAB rules)

Hex -> sRGB -> linear RGB -> CIE XYZ (D65) -> CIELAB (L*, a*, b*) -> chroma C* and hue angle h. The family rules use
L*, C* and h, in this order: very dark is Black; almost no chroma is White, Gray or Black by lightness; warm low-chroma
colors (hue 35 to 120) are Cream & Ivory, Beige & Taupe or Brown & Wood by lightness; cool low-chroma colors are Gray;
mid-chroma warm darks are Brown & Wood; everything else is assigned by hue angle with lightness splits (for example
Navy is a blue with L* under 30). Full rules: tools/colorlib.py `family_lch`.

{chr(10).join(fam_rows)}

## Space types and defaults

Defaults are planning assumptions, used only when a space has no published or measured value.

{chr(10).join(sp_rows)}

## Vocabularies

Styles, design eras, genres, moods, lighting, regions, statuses and the rest live in data/vocab.json and on the
Lists tab. Dropdowns warn (but allow) values outside the list, so new terms can be added on the fly and folded into
data/vocab.json later.

## Capacity

Formulas are pre-filled for {CAP_HOTELS} hotels, {CAP_SPACES} spaces and {CAP_SWATCHES} swatches. To go further,
copy the last row's gray cells down, or raise the CAP_* constants in tools/build.py and rebuild.
"""
    DICT_MD.write_text(text, encoding="utf-8")


def main():
    vocab = json.loads((ROOT / "data" / "vocab.json").read_text(encoding="utf-8"))
    seed = json.loads((ROOT / "data" / "seed" / "hotels.json").read_text(encoding="utf-8"))
    hotels = normalize(vocab, seed)
    write_seed_js(vocab, hotels, seed.get("media", []))
    n_spaces, n_swatches = build_workbook(vocab, hotels, seed.get("media", []))
    write_dictionary(vocab)
    with_colors = sum(1 for h in hotels if any(s["colors"] for s in h["spaces"]))
    print(f"hotels={len(hotels)} with_colors={with_colors} spaces={n_spaces} swatches={n_swatches}")
    print(f"wrote {SEED_JS.relative_to(ROOT)}, {XLSX.relative_to(ROOT)} and {DICT_MD.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
