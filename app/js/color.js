/* Colorways color science. Mirrors tools/colorlib.py and the Excel workbook formulas:
 * sRGB (D65) -> CIE XYZ -> CIELAB -> LCh, CIEDE2000 distance, and one color-family rule set.
 * Works as a browser global (window.CWColor) and as a Node module (for tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CWColor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var XN = 0.95047, YN = 1.0, ZN = 1.08883;
  var EPS = 216 / 24389;
  var KAPPA = 24389 / 27;
  var RAD = Math.PI / 180;

  var FAMILIES = [
    { name: 'Black', hex: '#1A1A1A', range: 'Lightness below 12, or below 22 with almost no color' },
    { name: 'Gray', hex: '#8C8C8C', range: 'Almost no color (chroma under 5, or under 10 for cool hues), mid lightness' },
    { name: 'White', hex: '#F7F7F5', range: 'Lightness 92+ with almost no color' },
    { name: 'Cream & Ivory', hex: '#F3E9D2', range: 'Very light (85+) warm tints, chroma under 30' },
    { name: 'Beige & Taupe', hex: '#C8B79E', range: 'Warm neutrals: sand, tan, greige, taupe' },
    { name: 'Brown & Wood', hex: '#7A5230', range: 'Darker warm tones: walnut, oak, caramel, cognac, leather' },
    { name: 'Red & Burgundy', hex: '#9E1B32', range: 'Saturated or deep reds: crimson, oxblood, maroon, wine' },
    { name: 'Pink & Blush', hex: '#E8A0B4', range: 'Light or vivid pinks: blush, rose, fuchsia, salmon pink' },
    { name: 'Orange & Terracotta', hex: '#D2693C', range: 'Coral, terracotta, rust, copper, orange' },
    { name: 'Yellow & Gold', hex: '#D9A928', range: 'Mustard, ochre, brass, gold, butter yellow' },
    { name: 'Green', hex: '#3E7D4F', range: 'Olive, sage, emerald, forest, mint' },
    { name: 'Teal & Aqua', hex: '#2A9D9A', range: 'Teal, turquoise, aqua, pool blue-green' },
    { name: 'Blue', hex: '#3A6FB0', range: 'Sky, cobalt, cerulean, steel, periwinkle' },
    { name: 'Navy', hex: '#1F2A4A', range: 'Deep blues with lightness under 30' },
    { name: 'Purple & Plum', hex: '#6E3B73', range: 'Violet, plum, aubergine, lilac, magenta' }
  ];

  function isHex(s) {
    return typeof s === 'string' && /^#?[0-9a-fA-F]{6}$/.test(s.trim());
  }

  function normHex(s) {
    var t = s.trim().replace('#', '').toUpperCase();
    return '#' + t;
  }

  function hexToRgb(hex) {
    if (!isHex(hex)) throw new Error('bad hex: ' + hex);
    var s = hex.trim().replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  function rgbToHex(rgb) {
    return '#' + rgb.map(function (c) {
      var v = Math.max(0, Math.min(255, Math.round(c)));
      return (v < 16 ? '0' : '') + v.toString(16).toUpperCase();
    }).join('');
  }

  function lin(c8) {
    var c = c8 / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function f(t) {
    return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
  }

  function rgbToLab(rgb) {
    var r = lin(rgb[0]), g = lin(rgb[1]), b = lin(rgb[2]);
    var x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN;
    var y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / YN;
    var z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / ZN;
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function hexToLab(hex) {
    return rgbToLab(hexToRgb(hex));
  }

  function labToLch(lab) {
    var c = Math.hypot(lab[1], lab[2]);
    var h = c < 1e-4 ? 0 : ((Math.atan2(lab[2], lab[1]) / RAD) % 360 + 360) % 360;
    return [lab[0], c, h];
  }

  function gam(c) {
    c = Math.max(0, Math.min(1, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }

  function labToRgb(lab) {
    var L = lab[0], a = lab[1], b = lab[2];
    var fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    var xr = Math.pow(fx, 3) > EPS ? Math.pow(fx, 3) : (116 * fx - 16) / KAPPA;
    var yr = L > KAPPA * EPS ? Math.pow((L + 16) / 116, 3) : L / KAPPA;
    var zr = Math.pow(fz, 3) > EPS ? Math.pow(fz, 3) : (116 * fz - 16) / KAPPA;
    var x = xr * XN, y = yr * YN, z = zr * ZN;
    var r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    var g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
    var bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
    return [gam(r) * 255, gam(g) * 255, gam(bl) * 255];
  }

  function labToHex(lab) {
    return rgbToHex(labToRgb(lab));
  }

  function deltaE2000(lab1, lab2) {
    var L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
    var L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
    var c1 = Math.hypot(a1, b1), c2 = Math.hypot(a2, b2);
    var cbar7 = Math.pow((c1 + c2) / 2, 7);
    var g = 0.5 * (1 - Math.sqrt(cbar7 / (cbar7 + Math.pow(25, 7))));
    var a1p = (1 + g) * a1, a2p = (1 + g) * a2;
    var c1p = Math.hypot(a1p, b1), c2p = Math.hypot(a2p, b2);
    var h1p = (a1p === 0 && b1 === 0) ? 0 : ((Math.atan2(b1, a1p) / RAD) % 360 + 360) % 360;
    var h2p = (a2p === 0 && b2 === 0) ? 0 : ((Math.atan2(b2, a2p) / RAD) % 360 + 360) % 360;
    var dLp = L2 - L1, dCp = c2p - c1p, dhp;
    if (c1p * c2p === 0) dhp = 0;
    else {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
    }
    var dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(RAD * dhp / 2);
    var Lbar = (L1 + L2) / 2, cbarp = (c1p + c2p) / 2, hbar;
    if (c1p * c2p === 0) hbar = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hbar = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbar = (h1p + h2p + 360) / 2;
    else hbar = (h1p + h2p - 360) / 2;
    var t = 1 - 0.17 * Math.cos(RAD * (hbar - 30)) + 0.24 * Math.cos(RAD * 2 * hbar) +
      0.32 * Math.cos(RAD * (3 * hbar + 6)) - 0.20 * Math.cos(RAD * (4 * hbar - 63));
    var dTheta = 30 * Math.exp(-Math.pow((hbar - 275) / 25, 2));
    var rc = 2 * Math.sqrt(Math.pow(cbarp, 7) / (Math.pow(cbarp, 7) + Math.pow(25, 7)));
    var sl = 1 + 0.015 * Math.pow(Lbar - 50, 2) / Math.sqrt(20 + Math.pow(Lbar - 50, 2));
    var sc = 1 + 0.045 * cbarp, sh = 1 + 0.015 * cbarp * t;
    var rt = -Math.sin(RAD * 2 * dTheta) * rc;
    return Math.sqrt(Math.pow(dLp / sl, 2) + Math.pow(dCp / sc, 2) + Math.pow(dHp / sh, 2) +
      rt * (dCp / sc) * (dHp / sh));
  }

  function neutral(L) {
    return L >= 92 ? 'White' : (L < 22 ? 'Black' : 'Gray');
  }

  /* Color family rules. Keep in sync with tools/colorlib.py and the Excel formula in tools/build.py. */
  function familyLch(L, C, h) {
    if (L < 12) return 'Black';
    if (C < 5) return neutral(L);
    if (h >= 35 && h < 120) {
      if (C < 30 && L >= 85) return 'Cream & Ivory';
      if (C < 30 && L >= 55) return 'Beige & Taupe';
      if (C < 18 && L < 35) return 'Brown & Wood';
      if (C < 18) return 'Beige & Taupe';
    } else if (C < 10) {
      return neutral(L);
    }
    if (h >= 25 && h < 95 && ((C < 45 && L < 70) || (C < 55 && L < 46))) return 'Brown & Wood';
    if (h >= 345 || h < 20) return L < 45 ? 'Red & Burgundy' : 'Pink & Blush';
    if (h < 55) {
      if ((C >= 70 && h < 45) || L < 40) return 'Red & Burgundy';
      if (L >= 70 && h < 35) return 'Pink & Blush';
      return 'Orange & Terracotta';
    }
    if (h < 75) return 'Orange & Terracotta';
    if (h < 100) return 'Yellow & Gold';
    if (h < 112) return L >= 75 ? 'Yellow & Gold' : 'Green';
    if (h < 180) return 'Green';
    if (h < 225) return 'Teal & Aqua';
    if (h < 310) return L < 30 ? 'Navy' : 'Blue';
    return 'Purple & Plum';
  }

  function familyOfLab(lab) {
    var lch = labToLch(lab);
    return familyLch(lch[0], lch[1], lch[2]);
  }

  function familyOfHex(hex) {
    return familyOfLab(hexToLab(hex));
  }

  function familyHex(name) {
    for (var i = 0; i < FAMILIES.length; i++) if (FAMILIES[i].name === name) return FAMILIES[i].hex;
    return '#999999';
  }

  /* Closest named shade (CIEDE2000) within the color's own family. shades: {family: [[name, hex], ...]}.
   * Keep in sync with nearest_shade in tools/colorlib.py. */
  var shadeLabCache = {};
  function nearestShade(lab, family, shades) {
    var list = (shades && shades[family]) || [], best = null;
    for (var i = 0; i < list.length; i++) {
      var hx = list[i][1];
      var sl = shadeLabCache[hx] || (shadeLabCache[hx] = hexToLab(hx));
      var d = deltaE2000(lab, sl);
      if (!best || d < best.dE) best = { name: list[i][0], dE: d, hex: hx };
    }
    return best;
  }

  /* WCAG relative luminance, used to pick readable ink on top of a swatch. */
  function luminance(hex) {
    var rgb = hexToRgb(hex).map(lin);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function inkOn(hex) {
    var l = luminance(hex);
    return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#111111' : '#FFFFFF';
  }

  return {
    FAMILIES: FAMILIES,
    isHex: isHex,
    normHex: normHex,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    rgbToLab: rgbToLab,
    hexToLab: hexToLab,
    labToLch: labToLch,
    labToRgb: labToRgb,
    labToHex: labToHex,
    deltaE2000: deltaE2000,
    familyLch: familyLch,
    familyOfLab: familyOfLab,
    familyOfHex: familyOfHex,
    familyHex: familyHex,
    nearestShade: nearestShade,
    luminance: luminance,
    inkOn: inkOn
  };
});
