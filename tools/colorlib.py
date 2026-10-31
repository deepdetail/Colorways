"""Colorways color science (Python reference implementation).

Mirrors app/js/color.js and the formulas in the Excel workbook. All three use
the same constants so results match: sRGB (D65) -> CIE XYZ -> CIELAB -> LCh,
CIEDE2000 for perceptual distance, and one rule set for color families.
"""
import math

XN, YN, ZN = 0.95047, 1.00000, 1.08883
EPS = 216 / 24389          # 0.008856...
KAPPA = 24389 / 27         # 903.296...

FAMILIES = [
    # name, representative hex (display only), plain-language range
    ("Black", "#1A1A1A", "Lightness below 12, or below 22 with almost no color"),
    ("Gray", "#8C8C8C", "Almost no color (chroma under 5, or under 10 for cool hues), mid lightness"),
    ("White", "#F7F7F5", "Lightness 92+ with almost no color"),
    ("Cream & Ivory", "#F3E9D2", "Very light (85+) warm tints, chroma under 30"),
    ("Beige & Taupe", "#C8B79E", "Warm neutrals: sand, tan, greige, taupe"),
    ("Brown & Wood", "#7A5230", "Darker warm tones: walnut, oak, caramel, cognac, leather"),
    ("Red & Burgundy", "#9E1B32", "Saturated or deep reds: crimson, oxblood, maroon, wine"),
    ("Pink & Blush", "#E8A0B4", "Light or vivid pinks: blush, rose, fuchsia, salmon pink"),
    ("Orange & Terracotta", "#D2693C", "Coral, terracotta, rust, copper, orange"),
    ("Yellow & Gold", "#D9A928", "Mustard, ochre, brass, gold, butter yellow"),
    ("Green", "#3E7D4F", "Olive, sage, emerald, forest, mint"),
    ("Teal & Aqua", "#2A9D9A", "Teal, turquoise, aqua, pool blue-green"),
    ("Blue", "#3A6FB0", "Sky, cobalt, cerulean, steel, periwinkle"),
    ("Navy", "#1F2A4A", "Deep blues with lightness under 30"),
    ("Purple & Plum", "#6E3B73", "Violet, plum, aubergine, lilac, magenta"),
]
FAMILY_NAMES = [f[0] for f in FAMILIES]


def hex_to_rgb(hex_str):
    s = hex_str.strip().lstrip("#")
    if len(s) != 6:
        raise ValueError(f"bad hex: {hex_str!r}")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return "#" + "".join(f"{max(0, min(255, round(c))):02X}" for c in rgb)


def _lin(c8):
    c = c8 / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _f(t):
    return t ** (1 / 3) if t > EPS else (KAPPA * t + 16) / 116


def rgb_to_lab(rgb):
    r, g, b = (_lin(c) for c in rgb)
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN
    y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / YN
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / ZN
    fx, fy, fz = _f(x), _f(y), _f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def hex_to_lab(hex_str):
    return rgb_to_lab(hex_to_rgb(hex_str))


def lab_to_lch(lab):
    L, a, b = lab
    c = math.hypot(a, b)
    h = 0.0 if c < 1e-4 else math.degrees(math.atan2(b, a)) % 360
    return (L, c, h)


def lab_to_rgb(lab):
    L, a, b = lab
    fy = (L + 16) / 116
    fx = fy + a / 500
    fz = fy - b / 200
    xr = fx ** 3 if fx ** 3 > EPS else (116 * fx - 16) / KAPPA
    yr = ((L + 16) / 116) ** 3 if L > KAPPA * EPS else L / KAPPA
    zr = fz ** 3 if fz ** 3 > EPS else (116 * fz - 16) / KAPPA
    x, y, z = xr * XN, yr * YN, zr * ZN
    r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
    g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z
    bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z

    def gam(c):
        c = max(0.0, min(1.0, c))
        return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

    return tuple(gam(c) * 255 for c in (r, g, bl))


def delta_e_2000(lab1, lab2):
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    c1, c2 = math.hypot(a1, b1), math.hypot(a2, b2)
    cbar7 = ((c1 + c2) / 2) ** 7
    g = 0.5 * (1 - math.sqrt(cbar7 / (cbar7 + 25 ** 7)))
    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = 0.0 if (a1p == 0 and b1 == 0) else math.degrees(math.atan2(b1, a1p)) % 360
    h2p = 0.0 if (a2p == 0 and b2 == 0) else math.degrees(math.atan2(b2, a2p)) % 360
    dLp = L2 - L1
    dCp = c2p - c1p
    if c1p * c2p == 0:
        dhp = 0.0
    else:
        dhp = h2p - h1p
        if dhp > 180:
            dhp -= 360
        elif dhp < -180:
            dhp += 360
    dHp = 2 * math.sqrt(c1p * c2p) * math.sin(math.radians(dhp / 2))
    Lbar = (L1 + L2) / 2
    cbarp = (c1p + c2p) / 2
    if c1p * c2p == 0:
        hbar = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbar = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hbar = (h1p + h2p + 360) / 2
    else:
        hbar = (h1p + h2p - 360) / 2
    t = (1 - 0.17 * math.cos(math.radians(hbar - 30)) + 0.24 * math.cos(math.radians(2 * hbar))
         + 0.32 * math.cos(math.radians(3 * hbar + 6)) - 0.20 * math.cos(math.radians(4 * hbar - 63)))
    d_theta = 30 * math.exp(-(((hbar - 275) / 25) ** 2))
    rc = 2 * math.sqrt(cbarp ** 7 / (cbarp ** 7 + 25 ** 7))
    sl = 1 + 0.015 * (Lbar - 50) ** 2 / math.sqrt(20 + (Lbar - 50) ** 2)
    sc = 1 + 0.045 * cbarp
    sh = 1 + 0.015 * cbarp * t
    rt = -math.sin(math.radians(2 * d_theta)) * rc
    return math.sqrt((dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh))


def family_lch(L, C, h):
    """Color family rules. Keep in sync with app/js/color.js and tools/build.py (Excel formula)."""
    if L < 12:
        return "Black"
    if C < 5:
        return "White" if L >= 92 else ("Black" if L < 22 else "Gray")
    if 35 <= h < 120:                      # warm, low-chroma neutrals
        if C < 30 and L >= 85:
            return "Cream & Ivory"
        if C < 30 and L >= 55:
            return "Beige & Taupe"
        if C < 18 and L < 35:
            return "Brown & Wood"
        if C < 18:
            return "Beige & Taupe"
    elif C < 10:                           # cool or pinkish low-chroma neutrals
        return "White" if L >= 92 else ("Black" if L < 22 else "Gray")
    if 25 <= h < 95 and ((C < 45 and L < 70) or (C < 55 and L < 46)):  # wood, leather, caramel
        return "Brown & Wood"
    if h >= 345 or h < 20:
        return "Red & Burgundy" if L < 45 else "Pink & Blush"
    if h < 55:
        if (C >= 70 and h < 45) or L < 40:
            return "Red & Burgundy"
        if L >= 70 and h < 35:
            return "Pink & Blush"
        return "Orange & Terracotta"
    if h < 75:
        return "Orange & Terracotta"
    if h < 100:
        return "Yellow & Gold"
    if h < 112:                            # pure yellow sits near 103 degrees; dark versions read olive
        return "Yellow & Gold" if L >= 75 else "Green"
    if h < 180:
        return "Green"
    if h < 225:
        return "Teal & Aqua"
    if h < 310:
        return "Navy" if L < 30 else "Blue"
    return "Purple & Plum"


def family_of_hex(hex_str):
    return family_lch(*lab_to_lch(hex_to_lab(hex_str)))
