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
