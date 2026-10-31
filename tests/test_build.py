"""Checks that the workbook builder, the Python color library and the web app agree.

Run: python3 -m unittest discover -s tests -p "test_*.py"
"""
import json
import random
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build  # noqa: E402
import colorlib  # noqa: E402


def js_array(name):
    src = (ROOT / "app" / "js" / "app.js").read_text(encoding="utf-8")
    m = re.search(r"var " + name + r" = \[(.*?)\];", src, re.S)
    return re.findall(r"'([^']+)'", m.group(1))


class TestColumnsMatchApp(unittest.TestCase):
    """CSV exports from the app must paste straight into the workbook's input columns."""

    def inputs(self, cols):
        return [c[0] for c in cols if c[1] == "in"]

    def test_hotels_prefix(self):
        self.assertEqual(js_array("HOTEL_COLS"), self.inputs(build.HOTEL_COLS)[:5])

    def test_spaces(self):
        self.assertEqual(js_array("SPACE_COLS"), self.inputs(build.SPACE_COLS))

    def test_swatches(self):
        self.assertEqual(js_array("SWATCH_COLS"), self.inputs(build.SWATCH_COLS))

    def test_spots(self):
        self.assertEqual(js_array("SPOT_COLS"), self.inputs(build.SPOT_COLS))


class TestColorParity(unittest.TestCase):
    def test_reference_families(self):
        for hx, fam, name in json.loads((ROOT / "tests" / "reference_colors.json").read_text()):
            self.assertEqual(colorlib.family_of_hex(hx), fam, name)

    def test_js_matches_python_on_random_colors(self):
        rnd = random.Random(20261031)
        hexes = ["#%06X" % rnd.randrange(0, 0x1000000) for _ in range(3000)]
        js = subprocess.run(
            ["node", "-e", "const C=require('./app/js/color.js');const h=JSON.parse(require('fs').readFileSync(0,'utf8'));"
             "console.log(JSON.stringify(h.map(x=>{const l=C.hexToLab(x);return [l,C.familyOfHex(x)];})))"],
            input=json.dumps(hexes), capture_output=True, text=True, check=True, cwd=ROOT)
        out = json.loads(js.stdout)
        for hx, (lab, fam) in zip(hexes, out):
            py = colorlib.hex_to_lab(hx)
            self.assertLess(max(abs(a - b) for a, b in zip(lab, py)), 1e-9, hx)
            self.assertEqual(fam, colorlib.family_of_hex(hx), hx)


class TestShadeAndCharacterParity(unittest.TestCase):
    def setUp(self):
        self.vocab = json.loads((ROOT / "data" / "vocab.json").read_text())

    def test_every_shade_sits_in_its_family(self):
        for fam, lst in self.vocab["shades"].items():
            for name, hx in lst:
                self.assertEqual(colorlib.family_of_hex(hx), fam, name)

    def test_js_and_python_agree(self):
        rnd = random.Random(7)
        hexes = ["#%06X" % rnd.randrange(0, 0x1000000) for _ in range(800)]
        palettes = [[("#%06X" % rnd.randrange(0, 0x1000000), rnd.choice([5, 10, 15, 20, 25, 30, 40, 50]))
                     for _ in range(rnd.randint(1, 6))] for _ in range(400)]
        payload = {"hexes": hexes, "palettes": palettes, "shades": self.vocab["shades"]}
        js = subprocess.run(
            ["node", "-e", "const C=require('./app/js/color.js'),M=require('./app/js/model.js');"
             "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));"
             "const sh=d.hexes.map(h=>{const l=C.hexToLab(h);return C.nearestShade(l,C.familyOfLab(l),d.shades).name;});"
             "const ch=d.palettes.map(p=>{const r=M.colorCharacter(p.map(([hex,share])=>({hex,share})));return [r.character,r.topFamily];});"
             "console.log(JSON.stringify({sh,ch}))"],
            input=json.dumps(payload), capture_output=True, text=True, check=True, cwd=ROOT)
        out = json.loads(js.stdout)
        for hx, name in zip(hexes, out["sh"]):
            lab = colorlib.hex_to_lab(hx)
            self.assertEqual(name, colorlib.nearest_shade(lab, colorlib.family_lch(*colorlib.lab_to_lch(lab)), self.vocab["shades"])[0], hx)
        for pal, (ch, top) in zip(palettes, out["ch"]):
            py = colorlib.color_character(pal)
            self.assertEqual((ch, top), (py["character"], py["top_family"]), pal)


class TestSeed(unittest.TestCase):
    def setUp(self):
        self.vocab = json.loads((ROOT / "data" / "vocab.json").read_text())
        self.seed = json.loads((ROOT / "data" / "seed" / "hotels.json").read_text())
        self.hotels = build.normalize(self.vocab, self.seed)

    def test_ids_unique(self):
        ids = [s["id"] for h in self.hotels for s in h["spaces"]]
        self.assertEqual(len(ids), len(set(ids)))
        cids = [c["id"] for h in self.hotels for s in h["spaces"] for c in s["colors"]]
        self.assertEqual(len(cids), len(set(cids)))

    def test_every_color_is_sourced(self):
        for h in self.hotels:
            for s in h["spaces"]:
                if s["colors"]:
                    self.assertTrue(s["evidence"], f"{s['id']} has colors but no evidence")
                    self.assertIsNotNone(s["coverage"], f"{s['id']} has colors but no coverage")
                    for c in s["colors"]:
                        self.assertIn(c["source"], ("Described", "Measured", "Estimated"))

    def test_open_status_needs_a_source(self):
        for h in self.hotels:
            if h["status"] == "Open":
                self.assertTrue(h["sources"], f"{h['id']} is marked Open without a source")

    def test_bad_vocab_is_rejected(self):
        bad = json.loads(json.dumps(self.seed))
        bad["hotels"][0]["genre"] = "Not A Genre"
        with self.assertRaises(build.SeedError):
            build.normalize(self.vocab, bad)


if __name__ == "__main__":
    unittest.main()
