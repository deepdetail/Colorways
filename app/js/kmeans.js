/* Palette extraction: k-means++ clustering in CIELAB, with seeded randomness so the same
 * photo always yields the same palette. Browser global CWKmeans, or a Node module. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./color.js'));
  else root.CWKmeans = factory(root.CWColor);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* RGBA bytes -> flat Lab array. Skips transparent pixels and, optionally, blown
   * highlights and crushed shadows (which say more about exposure than about the room). */
  function pixelsToLab(rgba, opts) {
    opts = opts || {};
    var step = Math.max(1, opts.step || 1);
    var ignore = !!opts.ignoreExtremes;
    var out = [];
    var cache = new Map();
    for (var i = 0; i < rgba.length; i += 4 * step) {
      if (rgba[i + 3] < 128) continue;
      var key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
      var lab = cache.get(key);
      if (!lab) {
        lab = C.rgbToLab([rgba[i], rgba[i + 1], rgba[i + 2]]);
        cache.set(key, lab);
      }
      if (ignore && (lab[0] > 97 || lab[0] < 3)) continue;
      out.push(lab[0], lab[1], lab[2]);
    }
    return new Float64Array(out);
  }

  function dist2(p, i, c) {
    var dl = p[i] - c[0], da = p[i + 1] - c[1], db = p[i + 2] - c[2];
    return dl * dl + da * da + db * db;
  }

  /* labs: flat Float64Array [L,a,b,...]. Returns clusters sorted by share, largest first. */
  function kmeans(labs, k, opts) {
    opts = opts || {};
    var n = labs.length / 3;
    if (n === 0) return [];
    k = Math.max(1, Math.min(k, n));
    var rand = mulberry32(opts.seed == null ? 7 : opts.seed);
    var maxIter = opts.maxIter || 24;
    var centers = [];
    var first = Math.floor(rand() * n) * 3;
    centers.push([labs[first], labs[first + 1], labs[first + 2]]);
    var d = new Float64Array(n);
    for (var i = 0; i < n; i++) d[i] = dist2(labs, i * 3, centers[0]);
    while (centers.length < k) {
      var sum = 0;
      for (i = 0; i < n; i++) sum += d[i];
      if (sum === 0) break;
      var r = rand() * sum, idx = 0;
      for (i = 0; i < n; i++) { r -= d[i]; if (r <= 0) { idx = i; break; } }
      var c = [labs[idx * 3], labs[idx * 3 + 1], labs[idx * 3 + 2]];
      centers.push(c);
      for (i = 0; i < n; i++) d[i] = Math.min(d[i], dist2(labs, i * 3, c));
    }
    var assign = new Int32Array(n).fill(-1);
    var counts;
    for (var iter = 0; iter < maxIter; iter++) {
      var changed = 0;
      for (i = 0; i < n; i++) {
        var best = 0, bd = Infinity;
        for (var j = 0; j < centers.length; j++) {
          var dd = dist2(labs, i * 3, centers[j]);
          if (dd < bd) { bd = dd; best = j; }
        }
        if (assign[i] !== best) { assign[i] = best; changed++; }
      }
      var sums = centers.map(function () { return [0, 0, 0]; });
      counts = new Array(centers.length).fill(0);
      for (i = 0; i < n; i++) {
        var a = assign[i];
        sums[a][0] += labs[i * 3]; sums[a][1] += labs[i * 3 + 1]; sums[a][2] += labs[i * 3 + 2];
        counts[a]++;
      }
      for (j = 0; j < centers.length; j++) {
        if (counts[j] > 0) centers[j] = [sums[j][0] / counts[j], sums[j][1] / counts[j], sums[j][2] / counts[j]];
      }
      if (changed === 0) break;
    }
    var clusters = [];
    for (j = 0; j < centers.length; j++) {
      if (counts[j] > 0) clusters.push({ lab: centers[j], count: counts[j] });
    }
    clusters = mergeClose(clusters, opts.mergeDE == null ? 5 : opts.mergeDE);
    clusters.sort(function (x, y) { return y.count - x.count; });
    return clusters.map(function (cl) {
      return {
        lab: cl.lab,
        hex: C.labToHex(cl.lab),
        family: C.familyOfLab(cl.lab),
        count: cl.count,
        share: cl.count / n
      };
    });
  }

  /* Merge clusters that a person would not tell apart (CIEDE2000 below the threshold). */
  function mergeClose(clusters, threshold) {
    var merged = true;
    while (merged && clusters.length > 1) {
      merged = false;
      outer:
      for (var i = 0; i < clusters.length; i++) {
        for (var j = i + 1; j < clusters.length; j++) {
          if (C.deltaE2000(clusters[i].lab, clusters[j].lab) < threshold) {
            var a = clusters[i], b = clusters[j], t = a.count + b.count;
            clusters[i] = {
              lab: [0, 1, 2].map(function (q) { return (a.lab[q] * a.count + b.lab[q] * b.count) / t; }),
              count: t
            };
            clusters.splice(j, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
    return clusters;
  }

  /* Mean color in linear light (physically meaningful average of light), as hex. */
  function averageHex(rgba) {
    var r = 0, g = 0, b = 0, n = 0;
    for (var i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) continue;
      r += lin(rgba[i]); g += lin(rgba[i + 1]); b += lin(rgba[i + 2]); n++;
    }
    if (!n) return '#000000';
    return C.rgbToHex([unlin(r / n), unlin(g / n), unlin(b / n)]);
  }

  function lin(c8) {
    var c = c8 / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function unlin(c) {
    var v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return v * 255;
  }

  /* Dominant color of a frame: the largest cluster of a small k-means. */
  function dominantHex(rgba, k) {
    var labs = pixelsToLab(rgba, { step: 1 });
    var cl = kmeans(labs, k || 4, { maxIter: 10, seed: 3 });
    return cl.length ? cl[0].hex : '#000000';
  }

  return {
    mulberry32: mulberry32,
    pixelsToLab: pixelsToLab,
    kmeans: kmeans,
    mergeClose: mergeClose,
    averageHex: averageHex,
    dominantHex: dominantHex
  };
});
