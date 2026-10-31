/* Colorways model: turns hotel data into the hotel stripe, the key swatch, color-family
 * shares, and color-search scores. Pure functions (no DOM), so they run in Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./color.js'));
  else root.CWModel = factory(root.CWColor);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var MODES = ['area', 'time', 'equal'];
  var UNDOCUMENTED = 'Not yet documented';

  function typeInfo(vocab, type) {
    var list = (vocab && vocab.spaceTypes) || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === type) return list[i];
    return { name: type, order: 99, sqft: 1000, dwell: 0.5 };
  }

  function num(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  /* How much of the stripe a space gets. area: square feet (published, measured, or the
   * space type's default); time: hours a typical guest spends there; equal: one share each. */
  function spaceWeight(space, mode, vocab) {
    var info = typeInfo(vocab, space.type);
    if (mode === 'equal') return 1;
    if (mode === 'time') {
      var h = num(space.dwell);
      return h != null ? h : info.dwell;
    }
    var a = num(space.sqft);
    return a != null && a > 0 ? a : info.sqft;
  }

  /* Share of a space that its logged colors describe (Coverage_Pct, 0-100). A source that
   * names one feature, such as a chandelier, covers only part of the room; the rest of the
   * block is shown as not yet documented instead of being painted with that one color. */
  function coverageOf(space) {
    var c = num(space.coverage);
    return c == null ? 1 : Math.max(0, Math.min(1, c / 100));
  }

  function colorsOf(space) {
    return (space.colors || []).filter(function (c) { return C.isHex(c.hex); });
  }

  function normalizedColors(space) {
    var cols = colorsOf(space);
    var total = cols.reduce(function (s, c) { return s + (num(c.share) || 0); }, 0);
    return cols.map(function (c) {
      var lab = C.hexToLab(c.hex);
      return Object.assign({}, c, {
        hex: C.normHex(c.hex),
        lab: lab,
        lch: C.labToLch(lab),
        family: C.familyOfLab(lab),
        frac: total > 0 ? (num(c.share) || 0) / total : 1 / cols.length
      });
    });
  }

  /* The hotel stripe: spaces in guest-journey order, widths by weighting mode, each space
   * filled with its colors in proportion to their share of that space. */
  function stripe(hotel, mode, vocab, opts) {
    opts = opts || {};
    var only = opts.spaceTypes && opts.spaceTypes.length ? opts.spaceTypes : null;
    var segs = [];
    (hotel.spaces || []).forEach(function (sp, idx) {
      if (only && only.indexOf(sp.type) < 0) return;
      var cols = normalizedColors(sp);
      if (!cols.length) return;
      var w = spaceWeight(sp, mode, vocab);
      if (!(w > 0)) return;
      segs.push({ space: sp, idx: idx, order: typeInfo(vocab, sp.type).order, weight: w, colors: cols, coverage: coverageOf(sp) });
    });
    segs.sort(function (a, b) { return a.order - b.order || a.idx - b.idx; });
    var total = segs.reduce(function (s, g) { return s + g.weight; }, 0);
    segs.forEach(function (g) { g.fraction = total > 0 ? g.weight / total : 0; });
    return { segments: segs, total: total, mode: mode };
  }

  /* Share of the whole stay (under the chosen weighting) that falls in each color family,
   * plus the share not yet documented. Fractions sum to 1. */
  function familyBreakdown(hotel, mode, vocab) {
    var st = stripe(hotel, mode, vocab);
    var acc = {}, unknown = 0;
    st.segments.forEach(function (g) {
      g.colors.forEach(function (c) {
        acc[c.family] = (acc[c.family] || 0) + g.fraction * c.frac * g.coverage;
      });
      unknown += g.fraction * (1 - g.coverage);
    });
    var out = C.FAMILIES.map(function (f) { return { family: f.name, hex: f.hex, fraction: acc[f.name] || 0 }; })
      .filter(function (x) { return x.fraction > 0; });
    if (unknown > 1e-9) out.push({ family: UNDOCUMENTED, hex: null, fraction: unknown, undocumented: true });
    return out;
  }

  /* The simplified key swatch: the most striking colors, favoring photo-op regions, vivid
   * colors, and spaces with high photo-op scores. Independent of the weighting mode so it
   * stays stable while the stripe changes. Greedy pick keeps chips visibly distinct. */
  function keySwatches(hotel, n, minDE) {
    n = n || 5;
    minDE = minDE == null ? 12 : minDE;
    var cands = [];
    (hotel.spaces || []).forEach(function (sp) {
      var photo = num(sp.photoOp) != null ? sp.photoOp : 3;
      normalizedColors(sp).forEach(function (c) {
        var chroma = Math.min(c.lch[1], 80);
        var score = Math.sqrt(c.frac) * (0.6 + chroma / 50) * (1 + 0.2 * (photo - 3)) * (c.key ? 1.6 : 1);
        cands.push({ hex: c.hex, lab: c.lab, family: c.family, name: c.name || '', space: sp.type,
          venue: sp.venue || '', source: c.source || '', key: !!c.key, score: score });
      });
    });
    (hotel.spots || []).forEach(function (spot) {
      var photo = num(spot.photoOp) != null ? spot.photoOp : 4;
      normalizedColors(spot).forEach(function (c) {
        var chroma = Math.min(c.lch[1], 80);
        var score = Math.sqrt(c.frac) * (0.6 + chroma / 50) * (1 + 0.2 * (photo - 3)) * 1.6;
        cands.push({ hex: c.hex, lab: c.lab, family: c.family, name: c.name || '', space: spot.spaceType,
          venue: spot.name, source: c.source || '', key: true, score: score });
      });
    });
    cands.sort(function (a, b) { return b.score - a.score; });
    var picked = [];
    for (var i = 0; i < cands.length && picked.length < n; i++) {
      var ok = picked.every(function (p) { return C.deltaE2000(p.lab, cands[i].lab) >= minDE; });
      if (ok) picked.push(cands[i]);
    }
    return picked;
  }

  /* Color search. targets: [{hex, family?}]. A family target matches any color of that
   * family; a hex target scores by CIEDE2000 closeness. Prominent colors count more. */
  function scoreHotel(hotel, targets, opts) {
    opts = opts || {};
    var only = opts.spaceTypes && opts.spaceTypes.length ? opts.spaceTypes : null;
    var pool = [];
    (hotel.spaces || []).forEach(function (sp) {
      if (only && only.indexOf(sp.type) < 0) return;
      var cov = coverageOf(sp);
      normalizedColors(sp).forEach(function (c) { pool.push({ c: c, sp: sp, share: c.frac * cov }); });
    });
    (hotel.spots || []).forEach(function (spot) {
      if (only && only.indexOf(spot.spaceType) < 0) return;
      normalizedColors(spot).forEach(function (c) {
        pool.push({ c: c, sp: { type: spot.spaceType, venue: spot.name }, share: c.frac, spot: spot });
      });
    });
    if (!pool.length || !targets.length) return { score: 0, matches: [] };
    var matches = targets.map(function (t) {
      var tlab = C.hexToLab(t.hex);
      var best = null;
      pool.forEach(function (p) {
        var dE = C.deltaE2000(tlab, p.c.lab);
        var close = Math.max(0, 1 - dE / 25);
        if (t.family) close = p.c.family === t.family ? 1 : close * 0.8;
        var prominence = 0.5 + 0.5 * Math.min(1, p.share / 0.3);
        var s = close * prominence;
        if (!best || s > best.s) best = { s: s, dE: dE, color: p.c, space: p.sp, share: p.share, spot: p.spot };
      });
      return {
        target: t, score: best.s, dE: best.dE, hex: best.color.hex, family: best.color.family,
        spaceType: best.space.type, venue: best.space.venue || '', share: best.share,
        spotName: best.spot ? best.spot.name : ''
      };
    });
    var mean = matches.reduce(function (s, m) { return s + m.score; }, 0) / matches.length;
    return { score: Math.round(mean * 1000) / 10, matches: matches };
  }

  function round6(x) { return Math.round(x * 1e6) / 1e6; }

  /* Classify a scene's palette (a photo spot or any color list with shares). Same rules as
   * color_character in tools/colorlib.py and the Color_Character formula on the Spots tab. */
  function colorCharacter(colors) {
    var cols = (colors || []).filter(function (c) { return C.isHex(c.hex); });
    if (!cols.length) return null;
    var total = cols.reduce(function (s, c) { return s + Math.max(0, num(c.share) || 0); }, 0);
    var fam = {}, meanC = 0;
    cols.forEach(function (c) {
      var w = total > 0 ? Math.max(0, num(c.share) || 0) / total : 1 / cols.length;
      var lch = C.labToLch(C.hexToLab(c.hex));
      var f = C.familyLch(lch[0], lch[1], lch[2]);
      fam[f] = (fam[f] || 0) + w;
      meanC += w * lch[1];
    });
    Object.keys(fam).forEach(function (k) { fam[k] = round6(fam[k]); });
    meanC = round6(meanC);
    var ranked = Object.keys(fam).map(function (k) { return fam[k]; }).sort(function (a, b) { return b - a; });
    var top = ranked[0], second = ranked.length > 1 ? ranked[1] : 0;
    var n10 = ranked.filter(function (v) { return v >= 0.1; }).length;
    var ch;
    if (meanC < 12) ch = 'Tonal neutral';
    else if (top >= 0.75) ch = 'Monochromatic';
    else if (second >= 0.3 && top + second >= 0.8) ch = 'Two-tone';
    else if (n10 >= 3 && meanC >= 20) ch = 'Rich multicolor';
    else if (top >= 0.5) ch = 'Dominant color';
    else ch = 'Balanced';
    var topFamily = null;
    for (var i = 0; i < C.FAMILIES.length; i++) {
      if (fam[C.FAMILIES[i].name] === top) { topFamily = C.FAMILIES[i].name; break; }
    }
    return { character: ch, topFamily: topFamily, topShare: top, secondShare: second, families10: n10, meanChroma: meanC, families: fam };
  }

  /* Best palette archetype for a set of hexes (see archetype_match in tools/colorlib.py). */
  function archetypeMatch(hexes, archetypes) {
    var labs = (hexes || []).filter(C.isHex).map(C.hexToLab), best = { name: null, score: 0 };
    if (!labs.length) return best;
    (archetypes || []).forEach(function (a) {
      var sc = a.hexes.reduce(function (s, t) {
        var tl = C.hexToLab(t), m = Infinity;
        labs.forEach(function (l) { m = Math.min(m, C.deltaE2000(tl, l)); });
        return s + Math.max(0, 1 - m / 15);
      }, 0) / a.hexes.length;
      if (sc > best.score) best = { name: a.name, score: sc };
    });
    return best;
  }

  /* Every color the hotel shows, across spaces and photo spots: near-duplicates merged (Delta E under 3),
   * grouped by family in a fixed order, light to dark, each with its nearest named shade. */
  function hotelSpectrum(hotel, vocab) {
    var shades = vocab && vocab.shades;
    var items = [];
    (hotel.spaces || []).forEach(function (sp) {
      var cov = coverageOf(sp);
      normalizedColors(sp).forEach(function (c) { items.push({ hex: c.hex, lab: c.lab, family: c.family, w: c.frac * cov, where: sp.type }); });
    });
    (hotel.spots || []).forEach(function (spot) {
      normalizedColors(spot).forEach(function (c) { items.push({ hex: c.hex, lab: c.lab, family: c.family, w: c.frac * 0.5, where: spot.name }); });
    });
    var merged = [];
    items.forEach(function (it) {
      for (var i = 0; i < merged.length; i++) {
        if (C.deltaE2000(merged[i].lab, it.lab) < 3) { merged[i].w += it.w; return; }
      }
      merged.push({ hex: it.hex, lab: it.lab, family: it.family, w: it.w, where: it.where });
    });
    var order = {};
    C.FAMILIES.forEach(function (f, i) { order[f.name] = i; });
    merged.sort(function (a, b) { return order[a.family] - order[b.family] || b.lab[0] - a.lab[0]; });
    merged.forEach(function (m) {
      var s = C.nearestShade(m.lab, m.family, shades);
      m.shade = s ? s.name : '';
    });
    return merged;
  }

  function countColors(hotel) {
    return (hotel.spaces || []).reduce(function (s, sp) { return s + colorsOf(sp).length; }, 0);
  }

  /* The weakest evidence behind a hotel's colors, so the UI can label it honestly. */
  function dataQuality(hotel) {
    var seen = { Measured: 0, Described: 0, Estimated: 0 };
    (hotel.spaces || []).forEach(function (sp) {
      colorsOf(sp).forEach(function (c) { seen[c.source] = (seen[c.source] || 0) + 1; });
    });
    if (seen.Estimated) return 'Estimated';
    if (seen.Described) return 'Described';
    if (seen.Measured) return 'Measured';
    return 'None';
  }

  return {
    MODES: MODES,
    UNDOCUMENTED: UNDOCUMENTED,
    coverageOf: coverageOf,
    typeInfo: typeInfo,
    spaceWeight: spaceWeight,
    normalizedColors: normalizedColors,
    stripe: stripe,
    familyBreakdown: familyBreakdown,
    keySwatches: keySwatches,
    scoreHotel: scoreHotel,
    countColors: countColors,
    colorCharacter: colorCharacter,
    archetypeMatch: archetypeMatch,
    hotelSpectrum: hotelSpectrum,
    dataQuality: dataQuality
  };
});
