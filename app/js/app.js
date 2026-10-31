/* Colorways prototype UI. Plain browser JavaScript: no build step and no network calls.
 * Photos and videos are read locally through canvas; nothing is uploaded anywhere. */
(function () {
  'use strict';

  var C = window.CWColor, K = window.CWKmeans, M = window.CWModel;
  var SEED = window.CW_SEED || { vocab: { spaceTypes: [] }, hotels: [] };
  var V = SEED.vocab;
  var STORE = 'colorways.v1.user';

  var MODE_HELP = {
    area: 'Width by area: each space is sized by its square footage (published or measured, otherwise a labeled default for that space type).',
    time: 'Width by time: each space is sized by the hours a typical guest spends there on a one-night stay (labeled defaults unless measured).',
    equal: 'Equal width: every space gets the same share, the cleanest way to compare hotels side by side.'
  };

  var S = {
    mode: 'area',
    user: loadUser(),
    hotels: [],
    targets: [{ hex: '#1F5F8B' }, { hex: '#C9A227' }],
    searchSpaces: [],
    analyze: { images: [], palette: null },
    barcode: null
  };

  /* ---------- small helpers ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'text') n.textContent = v;
        else if (k === 'class') n.className = v;
        else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    (kids || []).forEach(function (c) {
      if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function swatch(tag, hex, cls) {
    var n = el(tag, cls ? { class: cls } : null);
    if (C.isHex(hex)) n.style.background = C.normHex(hex);
    return n;
  }

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '' && isFinite(+v)) return +v;
    return null;
  }

  function fmtPct(x) {
    if (x > 0 && x < 0.01) return '<1%';
    return Math.round(x * 100) + '%';
  }

  function fmtNum(n) { return n == null ? '' : Number(n).toLocaleString('en-US'); }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function place(h) { return [h.city, h.state].filter(Boolean).join(', '); }

  function safeUrl(u) { return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null; }

  function spaceName(sp) { return sp.venue ? sp.type + ' (' + sp.venue + ')' : sp.type; }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  function download(name, content, type) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain' });
    var a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  var exportState = null;

  function offer(title, name, content, type, hint) {
    var d = $('#export');
    exportState = { name: name, content: content, type: type };
    $('#x-title').textContent = title;
    $('#x-hint').textContent = hint || 'Download the file, or copy the text and paste it into the workbook.';
    var isImage = content instanceof Blob;
    $('#x-text').hidden = isImage;
    $('#x-copy').hidden = isImage;
    $('#x-img').hidden = !isImage;
    if (isImage) {
      $('#x-img').src = URL.createObjectURL(content);
      $('#x-img').alt = title;
    } else {
      $('#x-text').value = content;
    }
    d.showModal();
  }

  function copyText(text) {
    function fallback() {
      var ta = $('#x-text');
      ta.hidden = false;
      ta.focus();
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      toast(ok ? 'Copied.' : 'Select the text and copy it with your keyboard.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Copied.'); }, fallback);
    } else {
      fallback();
    }
  }

  function csv(rows) {
    return rows.map(function (r) {
      return r.map(function (v) {
        var s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n') + '\n';
  }

  /* ---------- storage and data ---------- */

  function loadUser() {
    try {
      var d = JSON.parse(localStorage.getItem(STORE));
      if (d && Array.isArray(d.hotels)) return d;
    } catch (e) { /* storage unavailable or empty */ }
    return { hotels: [] };
  }

  function saveUser() {
    try {
      localStorage.setItem(STORE, JSON.stringify(S.user));
    } catch (e) {
      toast('This browser blocked local storage. Use "JSON backup" to keep your work.');
    }
  }

  function refreshData() {
    var byId = {};
    var list = (SEED.hotels || []).map(function (h) {
      var c = Object.assign({}, h, { spaces: (h.spaces || []).slice(), spots: (h.spots || []).slice(), motifs: h.motifs || [] });
      byId[c.id] = c;
      return c;
    });
    S.user.hotels.forEach(function (u) {
      var spaces = (u.spaces || []).map(function (s) { return Object.assign({ user: true }, s); });
      var spots = (u.spots || []).map(function (s) { return Object.assign({ user: true }, s); });
      var base = byId[u.id];
      if (base) {
        base.spaces = base.spaces.concat(spaces);
        base.spots = base.spots.concat(spots);
        if (u.walkthrough) base.walkthrough = u.walkthrough;
        base.hasUser = true;
      } else {
        var c = Object.assign({}, u, { spaces: spaces, spots: spots, motifs: u.motifs || [], hasUser: true, isUser: true });
        list.push(c);
        byId[c.id] = c;
      }
    });
    S.hotels = list;
  }

  function hotelById(id) {
    for (var i = 0; i < S.hotels.length; i++) if (S.hotels[i].id === id) return S.hotels[i];
    return null;
  }

  /* ---------- tooltip ---------- */

  var tipEl = $('#tooltip');

  function showTip(x, y, rows) {
    tipEl.textContent = '';
    rows.forEach(function (r, i) {
      if (i === 0) tipEl.appendChild(el('div', { class: 'tv' }, [r.hex ? swatch('i', r.hex) : null, r.text]));
      else tipEl.appendChild(el('div', { class: 'tl', text: r.text }));
    });
    tipEl.hidden = false;
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var px = Math.min(window.innerWidth - w - 8, x + 14);
    var py = y + 16;
    if (py + h > window.innerHeight - 8) py = y - h - 12;
    tipEl.style.left = Math.max(8, px) + 'px';
    tipEl.style.top = Math.max(8, py) + 'px';
  }

  function hideTip() { tipEl.hidden = true; }

  function bindTip(node, rowsFn) {
    node.addEventListener('pointermove', function (e) { showTip(e.clientX, e.clientY, rowsFn()); });
    node.addEventListener('pointerleave', hideTip);
  }

  /* ---------- stripe rendering ---------- */

  function areaNote(sp) {
    return num(sp.sqft) != null && sp.sqft > 0 ? (sp.sqftSource || 'Published') : 'type default';
  }

  function spaceShare(g, mode) {
    var pct = fmtPct(g.fraction);
    if (mode === 'area') return pct + ' of the stay by area (' + fmtNum(Math.round(g.weight)) + ' sq ft, ' + areaNote(g.space) + ')';
    if (mode === 'time') return pct + ' of the stay by time (' + g.weight + ' h' + (num(g.space.dwell) == null ? ', type default' : '') + ')';
    return pct + ' of the stay (equal widths)';
  }

  function colorTip(c, g, mode) {
    return [
      { hex: c.hex, text: c.hex + '  ' + c.family },
      { text: fmtPct(c.frac * g.coverage) + ' of ' + spaceName(g.space) + (c.name ? ': ' + c.name : '') },
      { text: spaceShare(g, mode) },
      { text: 'Source: ' + (c.source || 'n/a') + (c.key ? ' · key swatch' : '') }
    ];
  }

  function segLabel(g, mode) {
    return spaceName(g.space) + ', ' + spaceShare(g, mode) + '. Colors: ' +
      g.colors.map(function (c) { return c.hex + ' ' + c.family + ' ' + fmtPct(c.frac * g.coverage); }).join(', ') +
      (g.coverage < 1 ? ', ' + fmtPct(1 - g.coverage) + ' not yet documented' : '');
  }

  function shortType(t) {
    return ({
      'Arrival & Facade': 'Arrival', 'Corridor & Elevator': 'Corridor', 'Cafe & Breakfast': 'Cafe',
      'Garden & Grounds': 'Grounds', 'Signature Restaurant': 'Restaurant', 'Bar & Lounge': 'Bar',
      'Ballroom & Events': 'Events', 'Retail & Other': 'Other'
    })[t] || t;
  }

  function fitLabels(row) {
    $all('span', row).forEach(function (s) {
      if (s.scrollWidth > s.clientWidth + 1) s.textContent = '';
    });
  }

  function stripeEl(hotel, opts) {
    opts = opts || {};
    var mode = opts.mode || S.mode;
    var st = M.stripe(hotel, mode, V, { spaceTypes: opts.spaceTypes });
    if (!st.segments.length) return el('div', { class: 'stripe-empty', text: 'No colors logged yet' });
    var wrap = el('div', { class: 'stripe-wrap' });
    var bar = el('div', {
      class: 'stripe' + (opts.size ? ' ' + opts.size : ''),
      role: 'group',
      'aria-label': 'Hotel stripe, ' + st.segments.length + ' spaces'
    });
    var labels = opts.labels ? el('div', { class: 'seg-labels', 'aria-hidden': 'true' }) : null;
    st.segments.forEach(function (g) {
      var blk = el('div', { class: 'seg-block', tabindex: '0', role: 'img', 'aria-label': segLabel(g, mode) });
      blk.style.flex = g.fraction + ' 1 0';
      g.colors.forEach(function (c) {
        var cs = swatch('div', c.hex, 'chip-stripe');
        cs.style.flex = (c.frac * g.coverage) + ' 1 0';
        bindTip(cs, function () { return colorTip(c, g, mode); });
        blk.appendChild(cs);
      });
      if (g.coverage < 1) {
        var un = el('div', { class: 'chip-stripe chip-unknown' });
        un.style.flex = (1 - g.coverage) + ' 1 0';
        bindTip(un, function () {
          return [{ text: M.UNDOCUMENTED }, { text: fmtPct(1 - g.coverage) + ' of ' + spaceName(g.space) + ' has no sourced color yet' },
            { text: spaceShare(g, mode) }];
        });
        blk.appendChild(un);
      }
      blk.addEventListener('focus', function () {
        var r = blk.getBoundingClientRect();
        showTip(r.left, r.bottom, [{ text: spaceName(g.space) }, { text: spaceShare(g, mode) },
          { text: g.colors.length + ' colors, top: ' + g.colors[0].hex + ' ' + g.colors[0].family }]);
      });
      blk.addEventListener('blur', hideTip);
      bar.appendChild(blk);
      if (labels) {
        var lb = el('span', { text: shortType(g.space.type) });
        lb.style.flex = g.fraction + ' 1 0';
        labels.appendChild(lb);
      }
    });
    wrap.appendChild(bar);
    if (labels) {
      wrap.appendChild(labels);
      requestAnimationFrame(function () { fitLabels(labels); });
    }
    return wrap;
  }

  function keyRow(keys, large) {
    var row = el('div', { class: 'keyrow' + (large ? ' large' : ''), role: 'list', 'aria-label': 'Key swatch' });
    keys.forEach(function (k) {
      var where = k.space ? (k.venue ? k.space + ' (' + k.venue + ')' : k.space) : '';
      var chip = el('div', { class: 'key', role: 'listitem', 'aria-label': k.hex + ' ' + k.family + (where ? ', ' + where : '') },
        [swatch('div', k.hex, 'sw'), el('span', { class: 'hx', text: k.hex })]);
      bindTip(chip, function () {
        var rows = [{ hex: k.hex, text: k.hex + '  ' + k.family }];
        if (k.name) rows.push({ text: k.name });
        if (where) rows.push({ text: where });
        if (k.source) rows.push({ text: 'Source: ' + k.source });
        if (k.share != null) rows.push({ text: fmtPct(k.share) + ' of the walkthrough' });
        return rows;
      });
      row.appendChild(chip);
    });
    return row;
  }

  function barcodeMini(colors) {
    var b = el('div', { class: 'barcode-mini', role: 'img', 'aria-label': 'Walkthrough barcode, ' + colors.length + ' frames' });
    colors.forEach(function (hx) { var s = swatch('span', hx); b.appendChild(s); });
    return b;
  }

  /* ---------- shades, spectrum, spots ---------- */

  var ARCH_MIN = 0.65;
  var CHAR_ORDER = ['Monochromatic', 'Two-tone', 'Rich multicolor', 'Dominant color', 'Balanced', 'Tonal neutral'];

  function shadeOf(hex) {
    var lab = C.hexToLab(hex), sh = C.nearestShade(lab, C.familyOfLab(lab), V.shades);
    return sh ? sh.name : '';
  }

  function spectrumEl(h, tall) {
    var sp = M.hotelSpectrum(h, V);
    if (!sp.length) return null;
    var bar = el('div', { class: 'spectrum' + (tall ? ' tall' : ''), role: 'img',
      'aria-label': 'Every color across the hotel: ' + sp.length + ' distinct colors' });
    sp.forEach(function (c) {
      var chip = swatch('span', c.hex);
      bindTip(chip, function () { return [{ hex: c.hex, text: c.hex + '  ' + c.shade }, { text: c.family }, { text: c.where }]; });
      bar.appendChild(chip);
    });
    return bar;
  }

  function shadeGroups(spec) {
    var box = el('div', { class: 'shade-groups' }), byFam = {};
    spec.forEach(function (c) { (byFam[c.family] = byFam[c.family] || []).push(c); });
    C.FAMILIES.forEach(function (f) {
      var list = byFam[f.name];
      if (!list) return;
      var chips = el('div', { class: 'shade-row-chips' });
      list.forEach(function (c) {
        var chip = el('span', { class: 'shade-chip' }, [swatch('i', c.hex), c.shade || c.hex]);
        bindTip(chip, function () { return [{ hex: c.hex, text: c.hex + '  ' + c.shade }, { text: c.where }]; });
        chips.appendChild(chip);
      });
      box.appendChild(el('div', { class: 'shade-row' }, [el('span', { class: 'shade-fam', text: f.name + ' (' + list.length + ')' }), chips]));
    });
    return box;
  }

  function charBadge(r) {
    if (!r) return null;
    return el('span', { class: 'badge char', title: 'Average chroma ' + Math.round(r.meanChroma) + '; top family ' + r.topFamily + ' ' + fmtPct(r.topShare) },
      [swatch('i', C.familyHex(r.topFamily)), r.character]);
  }

  function paletteBar(colors, tall) {
    var cols = M.normalizedColors({ colors: colors });
    if (!cols.length) return el('div', { class: 'stripe-empty', text: 'Colors not published yet: measure on site' });
    var bar = el('div', { class: 'stripe' + (tall ? '' : ' thin'), role: 'img',
      'aria-label': cols.map(function (c) { return c.hex + ' ' + fmtPct(c.frac); }).join(', ') });
    var blk = el('div', { class: 'seg-block' });
    blk.style.flex = '1 1 0';
    cols.forEach(function (c) {
      var cs = swatch('div', c.hex, 'chip-stripe');
      cs.style.flex = c.frac + ' 1 0';
      bindTip(cs, function () {
        return [{ hex: c.hex, text: c.hex + '  ' + shadeOf(c.hex) }, { text: fmtPct(c.frac) + (c.name ? ' · ' + c.name : '') },
          { text: c.family + (c.material ? ' · ' + c.material : '') + (c.finish ? ', ' + c.finish.toLowerCase() : '') },
          { text: 'Source: ' + (c.source || 'n/a') }];
      });
      blk.appendChild(cs);
    });
    bar.appendChild(blk);
    return bar;
  }

  function spotCard(spot, h, showHotel) {
    var r = M.colorCharacter(spot.colors);
    var card = el('article', { class: 'card spot-card' + (showHotel ? '' : ' flat') });
    if (showHotel) card.appendChild(el('p', { class: 'meta', text: h.name + ' · ' + place(h) }));
    card.appendChild(el('h3', { text: spot.name }));
    var tags = el('div', { class: 'tags' });
    [spot.type, spot.access, spot.spaceType, spot.bestTime && spot.bestTime !== 'Any' ? spot.bestTime : null].filter(Boolean)
      .forEach(function (t, i) { tags.appendChild(el('span', { class: 'tag' + (i === 1 && t === 'Public' ? ' public' : ''), text: t })); });
    card.appendChild(tags);
    card.appendChild(paletteBar(spot.colors, true));
    if (r) {
      var names = (spot.colors || []).map(function (c) { return shadeOf(c.hex); })
        .filter(function (v, i, a) { return v && a.indexOf(v) === i; });
      card.appendChild(el('div', { class: 'spot-char' }, [charBadge(r), el('span', { class: 'muted', text: names.join(', ') })]));
    }
    if (spot.tip) card.appendChild(el('p', { class: 'tip', text: 'Tip: ' + spot.tip }));
    var ev = el('p', { class: 'evidence' });
    if (spot.evidence) ev.appendChild(document.createTextNode(spot.evidence + ' '));
    var u = safeUrl(spot.url);
    if (u) ev.appendChild(el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: 'source' }));
    card.appendChild(ev);
    var status = spot.user ? 'Measured' : ((spot.colors || []).length ? 'Described (approx.)' : 'To capture');
    card.appendChild(el('div', { class: 'card-foot' }, [
      el('span', { class: 'badge ' + (spot.user ? 'measured' : (status === 'To capture' ? 'none' : 'described')), text: status }),
      spot.confidence ? el('span', { text: spot.confidence + ' confidence' }) : null,
      showHotel ? el('button', { type: 'button', class: 'btn ghost', text: 'Open hotel', onclick: function () { openDetail(h.id); } }) : null
    ]));
    return card;
  }

  function allSpots() {
    var out = [];
    S.hotels.forEach(function (h) {
      (h.spots || []).forEach(function (sp) { out.push({ spot: sp, hotel: h, ch: M.colorCharacter(sp.colors) }); });
    });
    return out;
  }

  function renderSpots() {
    var q = $('#s-q').value.trim().toLowerCase(), ch = $('#s-char').value, ty = $('#s-type').value;
    var ac = $('#s-access').value, fam = $('#s-fam').value;
    var all = allSpots();
    var list = all.filter(function (x) {
      if (q && [x.hotel.name, x.hotel.city, x.spot.name, x.spot.type].join(' ').toLowerCase().indexOf(q) < 0) return false;
      if (ch && (!x.ch || x.ch.character !== ch)) return false;
      if (ty && x.spot.type !== ty) return false;
      if (ac && x.spot.access !== ac) return false;
      if (fam && (!x.ch || !x.ch.families[fam])) return false;
      return true;
    });
    list.sort(function (a, b) {
      var ca = a.ch ? 0 : 1, cb = b.ch ? 0 : 1;
      if (ca !== cb) return ca - cb;
      var pa = num(a.spot.photoOp) || 0, pb = num(b.spot.photoOp) || 0;
      if (pa !== pb) return pb - pa;
      return (b.ch ? b.ch.meanChroma : 0) - (a.ch ? a.ch.meanChroma : 0);
    });
    var grid = $('#spots-grid');
    grid.textContent = '';
    list.forEach(function (x) { grid.appendChild(spotCard(x.spot, x.hotel, true)); });
    if (!list.length) grid.appendChild(el('p', { class: 'empty', text: 'No spots match these filters.' }));
    var pub = all.filter(function (x) { return x.spot.access === 'Public'; }).length;
    $('#spots-count').textContent = list.length + ' of ' + all.length + ' spots shown · ' + pub + ' public · ' +
      all.filter(function (x) { return x.ch; }).length + ' with palettes';
  }


  /* ---------- index ---------- */

  function fillSelect(sel, values, allLabel) {
    sel.textContent = '';
    if (allLabel) sel.appendChild(el('option', { value: '', text: allLabel }));
    values.forEach(function (v) {
      var o = typeof v === 'string' ? { value: v, text: v } : v;
      sel.appendChild(el('option', { value: o.value, text: o.text }));
    });
  }

  function passes(h) {
    var q = $('#f-q').value.trim().toLowerCase();
    if (q && [h.name, h.city, h.state, h.brand].join(' ').toLowerCase().indexOf(q) < 0) return false;
    var r = $('#f-region').value, st = $('#f-style').value, er = $('#f-era').value, ge = $('#f-genre').value;
    if (r && h.region !== r) return false;
    if (st && h.primaryStyle !== st && h.secondaryStyle !== st) return false;
    if (er && h.era !== er) return false;
    if (ge && h.genre !== ge) return false;
    var d = $('#f-data').value;
    if (d === 'colors' && !M.countColors(h)) return false;
    if (d === 'measured' && M.dataQuality(h) !== 'Measured' &&
      !(h.spaces || []).some(function (s) { return (s.colors || []).some(function (c) { return c.source === 'Measured'; }); })) return false;
    return true;
  }

  function byDefault(a, b) {
    var ca = M.countColors(a) ? 1 : 0, cb = M.countColors(b) ? 1 : 0;
    if (ca !== cb) return cb - ca;
    var da = a.distinctiveness || 0, db = b.distinctiveness || 0;
    if (da !== db) return db - da;
    return a.name.localeCompare(b.name);
  }

  function hotelCard(h) {
    var q = M.dataQuality(h);
    var card = el('article', { class: 'card', tabindex: '0', 'aria-label': h.name + ', ' + place(h) + '. Open details.' });
    card.appendChild(el('header', null, [
      el('h3', { text: h.name }),
      el('p', { class: 'meta', text: [place(h), h.brand].filter(Boolean).join(' · ') })
    ]));
    card.appendChild(stripeEl(h, { labels: true }));
    var spec = spectrumEl(h, false);
    if (spec) card.appendChild(spec);
    if (h.walkthrough && h.walkthrough.colors) card.appendChild(barcodeMini(h.walkthrough.colors));
    var ks = M.keySwatches(h, 5);
    if (ks.length) card.appendChild(keyRow(ks));
    var tags = el('div', { class: 'tags' });
    [h.primaryStyle, h.era, h.genre].filter(Boolean).forEach(function (t) { tags.appendChild(el('span', { class: 'tag', text: t })); });
    card.appendChild(tags);
    var dist = num(h.distinctiveness);
    card.appendChild(el('div', { class: 'card-foot' }, [
      el('span', { class: 'badge ' + q.toLowerCase(), text: q === 'None' ? 'Not captured yet' : q + (q === 'Described' ? ' (approx.)' : '') }),
      el('span', { text: plural((h.spaces || []).length, 'space') + ' · ' + plural(M.countColors(h), 'color') + ' · ' + plural((h.spots || []).length, 'spot') }),
      dist ? el('span', { class: 'dots', title: 'Distinctiveness ' + dist + ' of 5', 'aria-label': 'Distinctiveness ' + dist + ' of 5',
        text: '●'.repeat(dist) + '○'.repeat(Math.max(0, 5 - dist)) }) : null
    ]));
    card.addEventListener('click', function () { openDetail(h.id); });
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target === card) openDetail(h.id); });
    return card;
  }

  function renderIndex() {
    var hs = S.hotels.filter(passes).sort(byDefault);
    var grid = $('#hotel-grid');
    grid.textContent = '';
    hs.forEach(function (h) { grid.appendChild(hotelCard(h)); });
    if (!hs.length) grid.appendChild(el('p', { class: 'empty', text: 'No hotels match these filters.' }));
    var withColors = S.hotels.filter(function (h) { return M.countColors(h); }).length;
    $('#index-count').textContent = hs.length + ' of ' + S.hotels.length + ' hotels shown · ' + withColors + ' have colors logged';
    $('#mode-help').textContent = MODE_HELP[S.mode];
  }

  function setMode(m) {
    S.mode = m;
    $all('.seg button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.mode === m)); });
    renderIndex();
  }

  /* ---------- detail ---------- */

  function famBar(h) {
    var fb = M.familyBreakdown(h, S.mode, V);
    var box = el('div');
    if (!fb.length) return box;
    var bar = el('div', { class: 'famsbar', role: 'img',
      'aria-label': 'Color families: ' + fb.map(function (f) { return f.family + ' ' + fmtPct(f.fraction); }).join(', ') });
    fb.forEach(function (f) {
      var b = f.undocumented ? el('div', { class: 'unknown' }) : swatch('div', f.hex);
      b.style.flex = f.fraction + ' 1 0';
      if (!f.undocumented) b.style.color = C.inkOn(f.hex);
      b.textContent = fmtPct(f.fraction);
      bindTip(b, function () { return [{ hex: f.hex, text: fmtPct(f.fraction) }, { text: f.family }]; });
      bar.appendChild(b);
    });
    var legend = el('div', { class: 'legend' });
    fb.forEach(function (f) {
      legend.appendChild(el('span', null, [f.undocumented ? el('i', { class: 'unknown' }) : swatch('i', f.hex), f.family]));
    });
    box.appendChild(bar);
    box.appendChild(legend);
    requestAnimationFrame(function () {
      $all('div', bar).forEach(function (d) { if (d.scrollWidth > d.clientWidth + 1) d.textContent = ''; });
    });
    return box;
  }

  function fact(label, value) {
    if (value == null || value === '') return null;
    return el('div', null, [el('dt', { text: label }), el('dd', { text: String(value) })]);
  }

  function evidenceCell(sp) {
    var td = el('td', { class: 'evidence' });
    if (sp.evidence) td.appendChild(document.createTextNode(sp.evidence + ' '));
    var u = safeUrl(sp.url);
    if (u) td.appendChild(el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: 'source' }));
    return td;
  }

  function colorsCell(sp) {
    var td = el('td');
    var cols = M.normalizedColors(sp), cov = M.coverageOf(sp);
    if (!cols.length) {
      td.appendChild(el('span', { class: 'muted', text: sp.captureStatus === 'Planned' ? 'Shoot planned' : 'Not captured yet' }));
      return td;
    }
    var box = el('div', { class: 'cchips' });
    cols.forEach(function (c) {
      box.appendChild(el('div', { class: 'cchip' }, [
        swatch('i', c.hex),
        el('code', { text: c.hex }),
        el('span', { text: c.family + (c.name ? ' · ' + c.name : '') }),
        el('span', { class: 'muted', text: fmtPct(c.frac * cov) + ' ' + (c.source || '').charAt(0) + (c.key ? ' ★' : '') })
      ]));
    });
    td.appendChild(box);
    return td;
  }

  function openDetail(id) {
    var h = hotelById(id);
    if (!h) return;
    var d = $('#detail');
    d.textContent = '';
    var head = el('div', { class: 'd-head' }, [
      el('h2', { id: 'd-title', text: h.name }),
      el('p', { class: 'meta muted', text: [place(h), h.brand, h.status].filter(Boolean).join(' · ') }),
      el('button', { class: 'btn ghost d-close', type: 'button', text: 'Close', onclick: function () { d.close(); } })
    ]);
    head.appendChild(stripeEl(h, { size: 'tall', labels: true }));
    var ks = M.keySwatches(h, 5);
    if (ks.length) {
      head.appendChild(el('h2', { class: 'small', text: 'Key swatch' }));
      head.appendChild(keyRow(ks, true));
    }
    head.appendChild(el('p', { class: 'mode-help', text: MODE_HELP[S.mode] + ' Change it on the Index.' }));
    d.appendChild(head);

    var body = el('div', { class: 'd-body' });
    var facts = el('dl', { class: 'facts' });
    [
      fact('Opened', h.opened), fact('Last redesign', h.redesign), fact('Architect', h.architect),
      fact('Interior design', h.interiorDesigner), fact('Style', [h.primaryStyle, h.secondaryStyle].filter(Boolean).join(' / ')),
      fact('Design era', h.era), fact('Genre', h.genre), fact('Signature palette (as described)', h.palette),
      fact('Signature photo op', h.photoOp), fact('Media and editorial', h.media), fact('Rooms', h.rooms),
      fact('Research status', h.researchStatus), fact('Wave', h.wave), fact('Open questions', h.notes)
    ].forEach(function (f) { if (f) facts.appendChild(f); });
    body.appendChild(facts);

    var spec = M.hotelSpectrum(h, V);
    if (spec.length) {
      body.appendChild(el('h2', { class: 'small', text: 'Every color across the hotel, by family and shade (' + spec.length + ')' }));
      body.appendChild(spectrumEl(h, true));
      body.appendChild(shadeGroups(spec));
    }
    if ((h.spots || []).length) {
      body.appendChild(el('h2', { class: 'small', text: 'Photo spots worth shooting (' + h.spots.length + ')' }));
      var sg = el('div', { class: 'grid spots-grid' });
      h.spots.forEach(function (sp) { sg.appendChild(spotCard(sp, h, false)); });
      body.appendChild(sg);
    }
    if ((h.motifs || []).length) {
      body.appendChild(el('h2', { class: 'small', text: 'Motifs' }));
      var ml = el('div', { class: 'motifs' });
      h.motifs.forEach(function (m) {
        var arch = m.hexes && m.hexes.length ? M.archetypeMatch(m.hexes, V.archetypes) : { name: null, score: 0 };
        var chips = el('span', { class: 'motif-chips' });
        (m.hexes || []).forEach(function (hx) {
          var i = swatch('i', hx);
          bindTip(i, function () { return [{ hex: hx, text: hx + '  ' + shadeOf(hx) }]; });
          chips.appendChild(i);
        });
        var u = safeUrl(m.url);
        var meta = [m.type, m.where, arch.score >= ARCH_MIN ? 'Archetype: ' + arch.name + ' (' + Math.round(arch.score * 100) + '% match)' : null];
        ml.appendChild(el('div', { class: 'motif' }, [chips, el('div', null, [
          el('strong', { text: m.name }),
          el('div', { class: 'muted small-print', text: meta.filter(Boolean).join(' · ') }),
          el('div', { class: 'evidence' }, [m.evidence || '', u ? ' ' : '', u ? el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: 'source' }) : null])
        ])]));
      });
      body.appendChild(ml);
    }
    if (M.countColors(h)) {
      body.appendChild(el('h2', { class: 'small', text: 'Color families across the stay (' + S.mode + ' weighting)' }));
      body.appendChild(famBar(h));
    }

    body.appendChild(el('h2', { class: 'small', text: 'Spaces (table view)' }));
    var st = M.stripe(h, S.mode, V);
    var shareBySpace = new Map(st.segments.map(function (g) { return [g.space, g.fraction]; }));
    var table = el('table', { class: 'data' });
    table.appendChild(el('thead', null, [el('tr', null, [
      el('th', { text: 'Space' }), el('th', { text: 'Venue' }), el('th', { class: 'num', text: 'Area (sq ft)' }),
      el('th', { class: 'num', text: 'Share of stripe' }), el('th', { class: 'num', text: 'Documented' }),
      el('th', { text: 'Colors (share of space, source)' }),
      el('th', { text: 'Evidence' })
    ])]));
    var tb = el('tbody');
    (h.spaces || []).slice().sort(function (a, b) {
      return M.typeInfo(V, a.type).order - M.typeInfo(V, b.type).order;
    }).forEach(function (sp) {
      var area = num(sp.sqft) != null && sp.sqft > 0 ? fmtNum(sp.sqft) + ' (' + (sp.sqftSource || 'Published') + ')'
        : fmtNum(M.typeInfo(V, sp.type).sqft) + ' (type default)';
      var share = shareBySpace.has(sp) ? fmtPct(shareBySpace.get(sp)) : '';
      var documented = (sp.colors || []).length ? fmtPct(M.coverageOf(sp)) : '';
      tb.appendChild(el('tr', null, [
        el('td', { text: sp.type + (sp.user ? ' (yours)' : '') }), el('td', { text: sp.venue || '' }),
        el('td', { class: 'num', text: area }), el('td', { class: 'num', text: share }),
        el('td', { class: 'num', text: documented }), colorsCell(sp), evidenceCell(sp)
      ]));
    });
    table.appendChild(tb);
    body.appendChild(el('div', { class: 'table-wrap' }, [table]));
    body.appendChild(el('p', { class: 'muted small-print', text: 'Source letters: M = Measured, D = Described (hex approximated from a cited description), E = Estimated. ★ marks a key swatch color. Documented is the share of the space the logged colors describe; the rest shows hatched in the stripe.' }));

    if (h.sources && h.sources.length) {
      body.appendChild(el('h2', { class: 'small', text: 'Sources' }));
      var ul = el('ul', { class: 'sources' });
      h.sources.forEach(function (s) {
        var u = safeUrl(s.url);
        ul.appendChild(el('li', null, [u ? el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: s.label || u }) : document.createTextNode(s.label || '')]));
      });
      body.appendChild(ul);
    }
    d.appendChild(body);
    d.showModal();
  }

  /* ---------- search ---------- */

  function renderTargets() {
    var box = $('#targets');
    box.textContent = '';
    S.targets.forEach(function (t, i) {
      var input = el('input', { type: 'color', value: t.hex.toLowerCase(), 'aria-label': 'Color ' + (i + 1) });
      input.addEventListener('input', function () { S.targets[i] = { hex: input.value.toUpperCase() }; renderTargets(); renderResults(); });
      box.appendChild(el('div', { class: 'target' }, [
        input,
        el('code', { text: C.normHex(t.hex) }),
        el('span', { class: 'fam', text: t.family ? 'any ' + t.family : C.familyOfHex(t.hex) }),
        el('button', { type: 'button', 'aria-label': 'Remove color ' + (i + 1), text: '×',
          onclick: function () { S.targets.splice(i, 1); renderTargets(); renderResults(); } })
      ]));
    });
    $('#add-target').disabled = S.targets.length >= 5;
  }

  function renderFamilyChips() {
    var box = $('#family-chips');
    box.textContent = '';
    C.FAMILIES.forEach(function (f) {
      box.appendChild(el('button', { type: 'button', class: 'fchip', onclick: function () {
        if (S.targets.length >= 5) { toast('Up to five colors. Remove one first.'); return; }
        S.targets.push({ hex: f.hex, family: f.name });
        renderTargets();
        renderResults();
        renderShadeChips(f.name);
      } }, [swatch('i', f.hex), f.name]));
    });
    var pre = $('#preset-chips');
    pre.textContent = '';
    (V.archetypes || []).forEach(function (a) {
      var dots = el('span', { class: 'dots-row' });
      a.hexes.forEach(function (hx) { dots.appendChild(swatch('i', hx)); });
      pre.appendChild(el('button', { type: 'button', class: 'fchip preset', title: a.hint, onclick: function () {
        S.targets = a.hexes.slice(0, 5).map(function (hx) { return { hex: hx }; });
        renderTargets();
        renderResults();
        toast('Searching for the ' + a.name + ' palette: ' + a.hint.toLowerCase() + '.');
      } }, [dots, a.name]));
    });
  }

  function renderShadeChips(family) {
    var box = $('#shade-chips'), list = (V.shades || {})[family] || [];
    box.textContent = '';
    box.hidden = !list.length;
    if (!list.length) return;
    box.appendChild(el('span', { class: 'muted small-print', text: 'Shades of ' + family + ':' }));
    list.forEach(function (sh) {
      box.appendChild(el('button', { type: 'button', class: 'fchip', onclick: function () {
        if (S.targets.length >= 5) { toast('Up to five colors. Remove one first.'); return; }
        S.targets.push({ hex: sh[1] });
        renderTargets();
        renderResults();
      } }, [swatch('i', sh[1]), sh[0]]));
    });
  }


  function renderSpaceFilter() {
    var box = $('#space-filter');
    box.textContent = '';
    var present = {};
    S.hotels.forEach(function (h) {
      (h.spaces || []).forEach(function (sp) { if ((sp.colors || []).length) present[sp.type] = true; });
    });
    (V.spaceTypes || []).filter(function (t) { return present[t.name]; }).forEach(function (t) {
      var cb = el('input', { type: 'checkbox', value: t.name });
      cb.checked = S.searchSpaces.indexOf(t.name) >= 0;
      cb.addEventListener('change', function () {
        S.searchSpaces = $all('#space-filter input:checked').map(function (x) { return x.value; });
        renderResults();
      });
      box.appendChild(el('label', null, [cb, t.name]));
    });
  }

  function renderResults() {
    var list = $('#results');
    list.textContent = '';
    if (!S.targets.length) {
      list.appendChild(el('li', { class: 'empty', text: 'Add a color, tap a family, or match an inspiration image.' }));
      return;
    }
    var scored = S.hotels.map(function (h) {
      return { h: h, r: M.scoreHotel(h, S.targets, { spaceTypes: S.searchSpaces }) };
    }).filter(function (x) { return x.r.score > 0; }).sort(function (a, b) { return b.r.score - a.r.score; }).slice(0, 25);
    if (!scored.length) {
      list.appendChild(el('li', { class: 'empty', text: 'No hotel has colors logged in those spaces yet.' }));
      return;
    }
    scored.forEach(function (x) {
      var why = el('div', { class: 'why' });
      x.r.matches.forEach(function (m) {
        var label = (m.spotName ? 'Spot: ' + m.spotName : m.spaceType + (m.venue ? ' (' + m.venue + ')' : '')) +
          ' · ' + shadeOf(m.hex) + ' · ΔE ' + m.dE.toFixed(1);
        why.appendChild(el('span', { class: 'whychip', title: 'Your ' + C.normHex(m.target.hex) + ' matched ' + m.hex }, [
          swatch('i', m.target.hex), swatch('i', m.hex), label
        ]));
      });
      var li = el('li', { class: 'result', tabindex: '0' }, [
        el('div', { class: 'score' }, [String(Math.round(x.r.score)), el('small', { text: 'match' })]),
        el('div', null, [
          el('h3', { class: 'card-title', text: x.h.name }),
          el('p', { class: 'meta muted', text: place(x.h) }),
          stripeEl(x.h, { size: 'thin', spaceTypes: S.searchSpaces }),
          why
        ])
      ]);
      li.addEventListener('click', function () { openDetail(x.h.id); });
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter') openDetail(x.h.id); });
      list.appendChild(li);
    });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Could not read ' + file.name)); };
      img.src = URL.createObjectURL(file);
    });
  }

  function sampleCanvas(img, maxSide) {
    var s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    var cv = el('canvas', { width: w, height: h });
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas: cv, ctx: ctx, w: w, h: h };
  }

  function useInspiration(file) {
    loadImage(file).then(function (img) {
      var c = sampleCanvas(img, 200);
      var labs = K.pixelsToLab(c.ctx.getImageData(0, 0, c.w, c.h).data, { ignoreExtremes: true });
      var cl = K.kmeans(labs, 6, { seed: 4 }).slice(0, 4);
      S.targets = cl.map(function (x) { return { hex: x.hex }; });
      renderTargets();
      renderResults();
      toast('Searching with ' + cl.length + ' colors from your image.');
    }).catch(function (e) { toast(e.message); });
  }

  /* ---------- analyze ---------- */

  function populateHotelSelects() {
    var sorted = S.hotels.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var opts = sorted.map(function (h) { return { value: h.id, text: h.name + (place(h) ? ' · ' + place(h) : '') }; });
    var an = $('#an-hotel'), keep = an.value;
    fillSelect(an, [{ value: '', text: 'Choose a hotel' }].concat(opts).concat([{ value: '__new', text: '+ New hotel' }]));
    an.value = keep && (keep === '__new' || hotelById(keep)) ? keep : '';
    var bc = $('#bc-hotel'), keepB = bc.value;
    fillSelect(bc, [{ value: '', text: 'Choose a hotel' }].concat(opts));
    bc.value = keepB && hotelById(keepB) ? keepB : '';
  }

  function drawItem(item, live) {
    var cv = item.canvas, ctx = cv.getContext('2d');
    ctx.drawImage(item.img, 0, 0, cv.width, cv.height);
    item.regions.concat(live ? [live] : []).forEach(function (r) {
      var x = r.x * cv.width, y = r.y * cv.height, w = r.w * cv.width, h = r.h * cv.height;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeRect(x, y, w, h);
      ctx.lineWidth = 2; ctx.strokeStyle = '#FFFFFF'; ctx.strokeRect(x, y, w, h);
      ctx.font = '600 ' + Math.max(12, Math.round(cv.width / 45)) + 'px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, Math.max(0, y - 22), 78, 20);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('Photo op', x + 6, Math.max(14, y - 7));
    });
  }

  function attachRegionDrawing(item) {
    var cv = item.canvas, start = null, live = null;
    function pt(e) {
      var r = cv.getBoundingClientRect();
      return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    }
    cv.addEventListener('pointerdown', function (e) { start = pt(e); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) {
      if (!start) return;
      var p = pt(e);
      live = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      drawItem(item, live);
    });
    cv.addEventListener('pointerup', function () {
      if (live && live.w > 0.02 && live.h > 0.02) item.regions.push(live);
      start = null; live = null;
      drawItem(item);
    });
  }

  function renderAnalyzeImages() {
    var box = $('#an-images');
    box.textContent = '';
    S.analyze.images.forEach(function (item, idx) {
      var w = Math.min(900, item.img.naturalWidth);
      var h = Math.round(w * item.img.naturalHeight / item.img.naturalWidth);
      item.canvas = el('canvas', { width: w, height: h, 'aria-label': 'Photo ' + item.name + '. Drag to mark photo-op regions.' });
      drawItem(item);
      attachRegionDrawing(item);
      box.appendChild(el('div', { class: 'an-img' }, [
        item.canvas,
        el('div', { class: 'row' }, [
          el('span', { text: item.name }),
          el('span', null, [
            el('button', { type: 'button', class: 'btn ghost', text: 'Clear regions', onclick: function () { item.regions = []; drawItem(item); } }),
            el('button', { type: 'button', class: 'btn ghost danger', text: 'Remove', onclick: function () {
              S.analyze.images.splice(idx, 1);
              renderAnalyzeImages();
            } })
          ])
        ])
      ]));
    });
    $('#an-run').disabled = !S.analyze.images.length;
  }

  function addImages(files) {
    Array.prototype.forEach.call(files, function (file) {
      if (!/^image\//.test(file.type)) return;
      loadImage(file).then(function (img) {
        S.analyze.images.push({ name: file.name, img: img, regions: [] });
        renderAnalyzeImages();
      }).catch(function (e) { toast(e.message); });
    });
  }

  function concatLabs(parts) {
    var n = parts.reduce(function (s, p) { return s + p.length; }, 0);
    var out = new Float64Array(n), o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  function runAnalyze() {
    var k = +$('#an-k').value, ignore = $('#an-extremes').checked;
    var parts = [], regions = [];
    var nImg = S.analyze.images.length;
    S.analyze.images.forEach(function (it) {
      var c = sampleCanvas(it.img, 240);
      parts.push(K.pixelsToLab(c.ctx.getImageData(0, 0, c.w, c.h).data, { ignoreExtremes: ignore }));
      it.regions.forEach(function (r) {
        var x = Math.floor(r.x * c.w), y = Math.floor(r.y * c.h);
        var w = Math.max(1, Math.round(r.w * c.w)), h = Math.max(1, Math.round(r.h * c.h));
        regions.push({ labs: K.pixelsToLab(c.ctx.getImageData(x, y, w, h).data, { ignoreExtremes: ignore }), area: r.w * r.h, image: it.name });
      });
    });
    var labs = concatLabs(parts);
    if (!labs.length) { toast('No usable pixels. Try unchecking "Ignore blown highlights".'); return; }
    var pal = K.kmeans(labs, k, { seed: 11, mergeDE: 3 }).map(function (cl) {
      return { hex: cl.hex, lab: cl.lab, family: cl.family, share: cl.share, key: false, name: '' };
    });
    var spots = [];
    regions.forEach(function (rg) {
      if (!rg.labs.length) return;
      var rc = K.kmeans(rg.labs, 5, { seed: 5, mergeDE: 4 });
      spots.push({ name: 'Photo spot ' + (spots.length + 1), type: 'Other', access: 'Public', bestTime: 'Any', image: rg.image,
        colors: rc.filter(function (x) { return x.share >= 0.04; }).map(function (x) { return { hex: x.hex, share: Math.round(x.share * 1000) / 10 }; }) });
      rc.filter(function (x) { return x.share >= 0.25; }).forEach(function (x) {
        var nearest = null, nd = Infinity;
        pal.forEach(function (p) { var dd = C.deltaE2000(p.lab, x.lab); if (dd < nd) { nd = dd; nearest = p; } });
        if (nearest && nd < 8) nearest.key = true;
        else pal.push({ hex: x.hex, lab: x.lab, family: x.family, share: x.share * rg.area / nImg, key: true, name: '' });
      });
    });
    var total = pal.reduce(function (s, p) { return s + p.share; }, 0);
    pal.forEach(function (p) { p.share = p.share / total; });
    pal.sort(function (a, b) { return b.share - a.share; });
    S.analyze.palette = pal;
    S.analyze.spots = spots;
    renderPalette();
  }

  function renderPalette() {
    var box = $('#an-result');
    box.textContent = '';
    var pal = S.analyze.palette;
    if (!pal) return;
    var panel = el('div', { class: 'panel' });
    panel.appendChild(el('h2', { class: 'small', text: 'Measured palette (' + pal.length + ' colors)' }));
    var list = el('div', { class: 'palette' });
    pal.forEach(function (p) {
      var name = el('input', { class: 'pname', placeholder: 'Name (optional)', value: p.name, 'aria-label': 'Name for ' + p.hex });
      name.addEventListener('input', function () { p.name = name.value; });
      var star = el('button', { type: 'button', class: 'star', 'aria-pressed': String(p.key), text: p.key ? 'Key swatch' : 'Mark key' });
      star.addEventListener('click', function () { p.key = !p.key; renderPalette(); });
      list.appendChild(el('div', { class: 'pchip' }, [
        swatch('i', p.hex), el('code', { text: p.hex }), el('span', { class: 'pfam', text: p.family + ' · ' + shadeOf(p.hex) }),
        el('span', { class: 'num', text: fmtPct(p.share) }), name, star
      ]));
    });
    panel.appendChild(list);
    var preview = { spaces: [{ type: $('#an-type').value, photoOp: +$('#an-photo').value,
      colors: pal.map(function (p) { return { hex: p.hex, share: p.share * 100, key: p.key }; }) }] };
    panel.appendChild(el('h2', { class: 'small', text: 'This space as a stripe block' }));
    panel.appendChild(stripeEl(preview, { mode: 'equal' }));
    (S.analyze.spots || []).forEach(function (sp, i) {
      if (i === 0) panel.appendChild(el('h2', { class: 'small', text: 'Photo spots from your marked regions' }));
      var name = el('input', { value: sp.name, 'aria-label': 'Spot name' });
      name.addEventListener('input', function () { sp.name = name.value; });
      var type = el('select', { 'aria-label': 'Spot type' }), access = el('select', { 'aria-label': 'Access' }), best = el('select', { 'aria-label': 'Best time' });
      fillSelect(type, V.spotTypes || []); type.value = sp.type;
      fillSelect(access, V.access || []); access.value = sp.access;
      fillSelect(best, V.bestTime || []); best.value = sp.bestTime;
      type.addEventListener('change', function () { sp.type = type.value; });
      access.addEventListener('change', function () { sp.access = access.value; });
      best.addEventListener('change', function () { sp.bestTime = best.value; });
      panel.appendChild(el('div', { class: 'spot-edit' }, [
        el('div', { class: 'form-grid' }, [el('label', null, ['Spot name', name]), el('label', null, ['Type', type]),
          el('label', null, ['Access', access]), el('label', null, ['Best time', best])]),
        paletteBar(sp.colors, true),
        el('div', { class: 'spot-char' }, [charBadge(M.colorCharacter(sp.colors)), el('span', { class: 'muted', text: 'from ' + sp.image })])
      ]));
    });
    panel.appendChild(el('div', { class: 'row' }, [
      el('button', { type: 'button', class: 'btn primary', text: 'Save space to dataset', onclick: saveSpace })
    ]));
    box.appendChild(panel);
  }

  function typeCode(t) {
    var info = M.typeInfo(V, t);
    return info.code || t.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
  }

  function userHotelFor(id) {
    for (var i = 0; i < S.user.hotels.length; i++) if (S.user.hotels[i].id === id) return S.user.hotels[i];
    var base = hotelById(id);
    var rec = { id: id, name: base ? base.name : id, city: base ? base.city : '', state: base ? base.state : '', spaces: [] };
    S.user.hotels.push(rec);
    return rec;
  }

  function saveSpace() {
    var sel = $('#an-hotel').value;
    if (!sel) { toast('Choose a hotel first.'); return; }
    var rec;
    if (sel === '__new') {
      var name = $('#an-new-name').value.trim();
      if (!name) { toast('Give the new hotel a name.'); return; }
      var base = 'USR-' + slug(name).slice(0, 14).toUpperCase(), id = base, n = 2;
      while (hotelById(id)) id = base + '-' + (n++);
      rec = { id: id, name: name, city: $('#an-new-city').value.trim(), state: $('#an-new-state').value.trim().toUpperCase(),
        status: 'Open', wave: 'Backlog', spaces: [] };
      S.user.hotels.push(rec);
    } else {
      rec = userHotelFor(sel);
    }
    var type = $('#an-type').value;
    var files = S.analyze.images.map(function (i) { return i.name; }).join('; ');
    var sqft = num($('#an-sqft').value);
    var spaceRec = {
      id: rec.id + '-' + typeCode(type) + '-M' + (rec.spaces.length + 1),
      type: type,
      venue: $('#an-venue').value.trim(),
      sqft: sqft,
      sqftSource: sqft != null ? $('#an-sqft-src').value : 'Type default',
      coverage: 100,
      dwell: null,
      photoOp: +$('#an-photo').value,
      lighting: $('#an-light').value,
      confidence: 'High',
      evidence: files,
      captureStatus: 'Analyzed',
      colors: S.analyze.palette.map(function (p, i) {
        return { hex: p.hex, name: p.name, share: Math.round(p.share * 1000) / 10, key: p.key,
          reason: p.key ? 'Photo-op' : (i === 0 ? 'Dominant' : 'Accent'), source: 'Measured', evidence: files, shade: shadeOf(p.hex) };
      })
    };
    rec.spaces.push(spaceRec);
    rec.spots = rec.spots || [];
    (S.analyze.spots || []).forEach(function (sp) {
      rec.spots.push({
        id: rec.id + '-SPM' + (rec.spots.length + 1), spaceId: spaceRec.id, spaceType: type, name: sp.name || 'Photo spot',
        type: sp.type, access: sp.access, bestTime: sp.bestTime, photoOp: +$('#an-photo').value, tip: '', confidence: 'High',
        evidence: sp.image, url: '', captureStatus: 'Analyzed', rights: 'Owned',
        colors: sp.colors.map(function (c) {
          return { hex: c.hex, share: c.share, key: true, reason: 'Photo-op', source: 'Measured', shade: shadeOf(c.hex), evidence: sp.image };
        })
      });
    });
    saveUser();
    refreshData();
    populateHotelSelects();
    $('#an-hotel').value = rec.id;
    toggleNewHotel();
    renderIndex();
    renderSpaceFilter();
    renderUserSummary();
    var nSpots = (S.analyze.spots || []).length;
    S.analyze = { images: [], palette: null, spots: [] };
    renderAnalyzeImages();
    $('#an-result').textContent = '';
    renderSpots();
    if (nSpots) toast('Saved ' + type + ' and ' + nSpots + ' photo spot' + (nSpots > 1 ? 's' : '') + ' to ' + rec.name + '.');
    toast('Saved ' + type + ' to ' + rec.name + '. It now shows in the Index as Measured.');
  }

  function toggleNewHotel() {
    var isNew = $('#an-hotel').value === '__new';
    $all('.newhotel').forEach(function (n) { n.hidden = !isNew; });
  }

  function renderUserSummary() {
    var hs = S.user.hotels, sp = 0, co = 0, wt = 0, spots = 0;
    hs.forEach(function (h) {
      spots += (h.spots || []).length;
      sp += (h.spaces || []).length;
      (h.spaces || []).forEach(function (s) { co += (s.colors || []).length; });
      if (h.walkthrough) wt++;
    });
    $('#user-summary').textContent = hs.length
      ? sp + ' measured spaces, ' + spots + ' photo spots and ' + co + ' colors across ' + hs.length + ' hotels' + (wt ? ', plus ' + wt + ' walkthrough barcodes' : '') + ', saved in this browser.'
      : 'Nothing measured yet. Saved spaces stay in this browser until you export or clear them.';
  }

  /* ---------- exports ---------- */

  var HOTEL_COLS = ['Hotel_ID', 'Hotel_Name', 'Brand_Collection', 'City', 'State'];
  var SPACE_COLS = ['Space_ID', 'Hotel_ID', 'Space_Type', 'Venue', 'Area_sqft', 'Area_Source', 'Coverage_Pct', 'Dwell_Hours', 'Style', 'Era',
    'Genre', 'Mood_Tags', 'Lighting', 'Materials_Motifs', 'Photo_Op_1to5', 'Confidence', 'Source_Evidence', 'Capture_Status', 'Notes'];
  var SWATCH_COLS = ['Swatch_ID', 'Space_ID', 'Spot_ID', 'Rank', 'Hex', 'Color_Name', 'Shade', 'Material', 'Finish', 'Share_Pct',
    'Key_Swatch', 'Key_Reason', 'Color_Source', 'Evidence'];
  var SPOT_COLS = ['Spot_ID', 'Hotel_ID', 'Space_ID', 'Spot_Name', 'Spot_Type', 'Access', 'Best_Time', 'Photo_Op_1to5', 'Photo_Tip',
    'Confidence', 'Source_Evidence', 'Rights_Status', 'Capture_Status', 'Notes'];

  function exportHotels() {
    var rows = [HOTEL_COLS];
    S.user.hotels.forEach(function (h) { rows.push([h.id, h.name, h.brand || '', h.city || '', h.state || '']); });
    offer('Hotels CSV', 'colorways-hotels.csv', csv(rows), 'text/csv');
  }

  function exportSpaces() {
    var rows = [SPACE_COLS];
    S.user.hotels.forEach(function (h) {
      (h.spaces || []).forEach(function (s) {
        rows.push([s.id, h.id, s.type, s.venue || '', s.sqft == null ? '' : s.sqft, s.sqftSource || '',
          s.coverage == null ? '' : s.coverage, s.dwell == null ? '' : s.dwell,
          s.style || '', s.era || '', s.genre || '', (s.mood || []).join(', '), s.lighting || '', s.materials || '',
          s.photoOp == null ? '' : s.photoOp, s.confidence || '', s.evidence || '', s.captureStatus || '', s.notes || '']);
      });
    });
    offer('Spaces CSV', 'colorways-spaces.csv', csv(rows), 'text/csv');
  }

  function exportSwatches() {
    var rows = [SWATCH_COLS];
    S.user.hotels.forEach(function (h) {
      (h.spaces || []).forEach(function (s) {
        (s.colors || []).forEach(function (c, i) {
          rows.push([s.id + '-C' + (i + 1), s.id, '', i + 1, c.hex, c.name || '', c.shade || shadeOf(c.hex), c.material || '', c.finish || '',
            c.share, c.key ? 'Y' : 'N', c.reason || '', c.source || 'Measured', c.evidence || '']);
        });
      });
      (h.spots || []).forEach(function (sp) {
        (sp.colors || []).forEach(function (c, i) {
          rows.push([sp.id + '-C' + (i + 1), sp.spaceId, sp.id, i + 1, c.hex, c.name || '', c.shade || shadeOf(c.hex), c.material || '', c.finish || '',
            c.share, 'Y', c.reason || 'Photo-op', c.source || 'Measured', c.evidence || '']);
        });
      });
    });
    offer('Swatches CSV', 'colorways-swatches.csv', csv(rows), 'text/csv');
  }

  function exportSpots() {
    var rows = [SPOT_COLS];
    S.user.hotels.forEach(function (h) {
      (h.spots || []).forEach(function (sp) {
        rows.push([sp.id, h.id, sp.spaceId, sp.name, sp.type, sp.access, sp.bestTime, sp.photoOp == null ? '' : sp.photoOp, sp.tip || '',
          sp.confidence || '', sp.evidence || '', sp.rights || '', sp.captureStatus || '', sp.notes || '']);
      });
    });
    offer('Spots CSV', 'colorways-spots.csv', csv(rows), 'text/csv');
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) { toast('That file is not valid JSON.'); return; }
      if (!data || !Array.isArray(data.hotels)) { toast('Expected a Colorways JSON backup with a "hotels" list.'); return; }
      var added = 0;
      data.hotels.forEach(function (h) {
        if (!h || typeof h.id !== 'string' || typeof h.name !== 'string') return;
        var rec = null;
        for (var i = 0; i < S.user.hotels.length; i++) if (S.user.hotels[i].id === h.id) rec = S.user.hotels[i];
        if (!rec) { rec = { id: h.id, name: h.name, city: h.city || '', state: h.state || '', spaces: [] }; S.user.hotels.push(rec); }
        (Array.isArray(h.spaces) ? h.spaces : []).forEach(function (s) {
          if (!s || typeof s.type !== 'string') return;
          var exists = rec.spaces.some(function (x) { return x.id === s.id; });
          if (!exists) { rec.spaces.push(s); added++; }
        });
        if (h.walkthrough && Array.isArray(h.walkthrough.colors)) rec.walkthrough = h.walkthrough;
        rec.spots = rec.spots || [];
        (Array.isArray(h.spots) ? h.spots : []).forEach(function (sp) {
          if (sp && typeof sp.name === 'string' && !rec.spots.some(function (x) { return x.id === sp.id; })) rec.spots.push(sp);
        });
      });
      saveUser(); refreshData(); populateHotelSelects(); renderIndex(); renderSpaceFilter(); renderUserSummary();
      toast('Imported ' + added + ' spaces.');
    };
    reader.readAsText(file);
  }

  /* ---------- walkthrough barcode ---------- */

  function seek(video, t) {
    return new Promise(function (resolve) {
      var done = false;
      function finish() { if (!done) { done = true; video.removeEventListener('seeked', finish); resolve(); } }
      video.addEventListener('seeked', finish);
      setTimeout(finish, 4000);
      video.currentTime = t;
    });
  }

  function sampleVideo(file, bars, mode, onBar) {
    var url = URL.createObjectURL(file);
    var video = el('video', { muted: true, playsinline: true, preload: 'auto' });
    video.muted = true;
    video.src = url;
    return new Promise(function (resolve, reject) {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('error', function () { reject(new Error('decode')); }, { once: true });
    }).then(function () {
      var dur = video.duration;
      if (!isFinite(dur) || dur <= 0 || !video.videoWidth) throw new Error('decode');
      var cw = 64, ch = Math.max(1, Math.round(64 * video.videoHeight / video.videoWidth));
      var cv = el('canvas', { width: cw, height: ch });
      var ctx = cv.getContext('2d', { willReadFrequently: true });
      var out = [];
      var i = 0;
      function next() {
        if (i >= bars) { URL.revokeObjectURL(url); return out; }
        var t = Math.min(dur - 0.001, (i + 0.5) * dur / bars);
        return seek(video, t).then(function () {
          ctx.drawImage(video, 0, 0, cw, ch);
          var data = ctx.getImageData(0, 0, cw, ch).data;
          var hex = mode === 'dominant' ? K.dominantHex(data, 4) : K.averageHex(data);
          out.push(hex);
          onBar(i, hex);
          i++;
          return next();
        });
      }
      return next();
    });
  }

  function runBarcode() {
    var file = $('#bc-file').files[0];
    if (!file) return;
    var bars = +$('#bc-bars').value, mode = $('#bc-mode').value;
    var prog = $('#bc-progress'), run = $('#bc-run'), cv = $('#bc-canvas'), ctx = cv.getContext('2d');
    prog.hidden = false; prog.value = 0; run.disabled = true;
    ctx.clearRect(0, 0, cv.width, cv.height);
    $('#bc-out').hidden = false;
    $('#bc-keys').textContent = '';
    var w = cv.width / bars;
    return sampleVideo(file, bars, mode, function (i, hex) {
      prog.value = (i + 1) / bars;
      ctx.fillStyle = hex;
      ctx.fillRect(Math.floor(i * w), 0, Math.ceil(w) + 1, cv.height);
    }).then(function (colors) {
      S.barcode = { colors: colors, mode: mode, bars: bars, file: file.name, date: new Date().toISOString().slice(0, 10) };
      var labs = new Float64Array(colors.length * 3);
      colors.forEach(function (hx, j) { labs.set(C.hexToLab(hx), j * 3); });
      var ks = K.kmeans(labs, 5, { seed: 2 }).map(function (x) { return { hex: x.hex, family: x.family, share: x.share }; });
      $('#bc-keys').appendChild(keyRow(ks, true));
    }).catch(function (err) {
      toast(err && err.message === 'decode'
        ? 'This browser cannot decode that video. Try an MP4 (H.264) or WebM clip.'
        : 'Could not read that video.');
    }).then(function () { prog.hidden = true; run.disabled = false; });
  }

  /* ---------- guess the hotel ---------- */

  var G = { seed: 0, round: 0, score: 0, answered: 0, current: null, done: false };

  function dateSeed() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function gameItems() {
    var items = [];
    S.hotels.forEach(function (h) {
      var spec = M.hotelSpectrum(h, V);
      if (spec.length >= 4) items.push({ kind: 'Hotel spectrum', hotel: h, colors: spec.map(function (c) { return { hex: c.hex, share: 1 }; }) });
      (h.spots || []).forEach(function (sp) {
        if ((sp.colors || []).length) items.push({ kind: 'Photo spot', hotel: h, spot: sp, colors: sp.colors });
      });
    });
    return items;
  }

  function newRound() {
    var items = gameItems();
    var hotels = S.hotels.filter(function (h) { return M.hotelSpectrum(h, V).length; });
    if (items.length < 1 || hotels.length < 4) {
      $('#g-palette').textContent = 'Not enough hotels with colors yet. Measure a few more spaces first.';
      return;
    }
    var rand = K.mulberry32(G.seed * 1000 + G.round);
    var item = items[Math.floor(rand() * items.length)];
    var others = hotels.filter(function (h) { return h.id !== item.hotel.id; });
    var opts = [item.hotel];
    while (opts.length < 4 && others.length) opts.push(others.splice(Math.floor(rand() * others.length), 1)[0]);
    for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
    G.current = { item: item, answered: false };
    $('#g-kind').textContent = item.kind + (item.spot ? ': ' + item.spot.type : '');
    var pal = $('#g-palette');
    pal.textContent = '';
    pal.appendChild(paletteBar(item.colors, true));
    $('#g-hint').textContent = '';
    var hint = el('button', { type: 'button', class: 'btn ghost', text: 'Need a hint?', onclick: function () {
      var h = item.hotel;
      $('#g-hint').textContent = 'Hint: ' + [h.region, h.primaryStyle, h.genre].filter(Boolean).join(' · ');
    } });
    var box = $('#g-options');
    box.textContent = '';
    opts.forEach(function (h) {
      box.appendChild(el('button', { type: 'button', class: 'btn g-opt', 'data-id': h.id, text: h.name, onclick: function () { answer(h.id); } }));
    });
    box.appendChild(hint);
    $('#g-result').textContent = '';
    renderScore();
  }

  function renderScore() {
    $('#g-score').textContent = 'Score ' + G.score + ' of ' + G.answered;
  }

  function answer(id) {
    if (!G.current || G.current.answered) return;
    var item = G.current.item, ok = id === item.hotel.id;
    G.current.answered = true;
    G.answered++;
    if (ok) G.score++;
    $all('.g-opt').forEach(function (b) {
      b.disabled = true;
      if (b.getAttribute('data-id') === item.hotel.id) b.classList.add('right');
      else if (b.getAttribute('data-id') === id) b.classList.add('wrong');
    });
    var res = $('#g-result');
    res.textContent = '';
    res.appendChild(el('p', null, [el('strong', { text: ok ? 'Yes. ' : 'Not quite. ' }),
      item.hotel.name + ', ' + place(item.hotel) + (item.spot ? ': ' + item.spot.name : '')]));
    res.appendChild(stripeEl(item.hotel, { size: 'thin' }));
    res.appendChild(el('button', { type: 'button', class: 'btn', text: 'Open ' + item.hotel.name, onclick: function () { openDetail(item.hotel.id); } }));
    renderScore();
  }

  /* ---------- method page ---------- */

  function renderMethod() {
    var src = $('#m-sources');
    src.textContent = '';
    var dl = el('dl', { class: 'facts' });
    (V.colorSources || []).forEach(function (s) { dl.appendChild(fact(s.name, s.meaning)); });
    src.appendChild(dl);

    var ft = $('#m-families');
    ft.textContent = '';
    ft.appendChild(el('thead', null, [el('tr', null, [el('th', { text: 'Family' }), el('th', { text: 'Swatch' }), el('th', { text: 'Range' })])]));
    var tb = el('tbody');
    C.FAMILIES.forEach(function (f) {
      tb.appendChild(el('tr', null, [el('td', { text: f.name }), el('td', null, [swatch('span', f.hex, 'fam-sw')]), el('td', { text: f.range })]));
    });
    ft.appendChild(tb);
    $all('.fam-sw', ft).forEach(function (s) { s.style.display = 'inline-block'; s.style.width = '48px'; s.style.height = '18px'; s.style.borderRadius = '4px'; });

    var ms = $('#m-shades');
    ms.textContent = '';
    Object.keys(V.shades || {}).forEach(function (fam) {
      var chips = el('div', { class: 'shade-row-chips' });
      V.shades[fam].forEach(function (sh) { chips.appendChild(el('span', { class: 'shade-chip' }, [swatch('i', sh[1]), sh[0]])); });
      ms.appendChild(el('div', { class: 'shade-row' }, [el('span', { class: 'shade-fam', text: fam }), chips]));
    });
    var mc = $('#m-chars');
    mc.textContent = '';
    mc.appendChild(el('thead', null, [el('tr', null, [el('th', { text: 'Character' }), el('th', { text: 'Rule' })])]));
    var mcb = el('tbody');
    (V.colorCharacters || []).forEach(function (c) { mcb.appendChild(el('tr', null, [el('td', { text: c.name }), el('td', { text: c.meaning })])); });
    mc.appendChild(mcb);
    var ma = $('#m-arch');
    ma.textContent = '';
    ma.appendChild(el('thead', null, [el('tr', null, [el('th', { text: 'Archetype' }), el('th', { text: 'Colors' }), el('th', { text: 'What it is' })])]));
    var mab = el('tbody');
    (V.archetypes || []).forEach(function (a) {
      var dots = el('span', { class: 'dots-row' });
      a.hexes.forEach(function (hx) { dots.appendChild(swatch('i', hx)); });
      mab.appendChild(el('tr', null, [el('td', { text: a.name }), el('td', null, [dots]), el('td', { text: a.hint })]));
    });
    ma.appendChild(mab);

    var stb = $('#m-spaces');
    stb.textContent = '';
    stb.appendChild(el('thead', null, [el('tr', null, [
      el('th', { text: 'Space type' }), el('th', { class: 'num', text: 'Journey order' }), el('th', { text: 'Zone' }),
      el('th', { class: 'num', text: 'Default sq ft' }), el('th', { class: 'num', text: 'Default hours' }), el('th', { text: 'Covers' })
    ])]));
    var tb2 = el('tbody');
    (V.spaceTypes || []).forEach(function (t) {
      tb2.appendChild(el('tr', null, [el('td', { text: t.name + (t.liminal ? ' (liminal)' : '') }), el('td', { class: 'num', text: String(t.order) }),
        el('td', { text: t.zone || '' }),
        el('td', { class: 'num', text: fmtNum(t.sqft) }), el('td', { class: 'num', text: String(t.dwell) }), el('td', { text: t.hint || '' })]));
    });
    stb.appendChild(tb2);
  }

  /* ---------- routing and wiring ---------- */

  function route() {
    var v = (location.hash || '#index').slice(1);
    if (!document.getElementById('view-' + v)) v = 'index';
    $all('.view').forEach(function (s) { s.hidden = s.id !== 'view-' + v; });
    $all('.tabs a').forEach(function (a) {
      if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    hideTip();
    if (v === 'search') renderResults();
    if (v === 'spots') renderSpots();
    if (v === 'game' && !G.current) newRound();
  }

  function init() {
    refreshData();
    fillSelect($('#f-region'), V.regions || [], 'All regions');
    fillSelect($('#f-style'), V.styles || [], 'All styles');
    fillSelect($('#f-era'), V.eras || [], 'All eras');
    fillSelect($('#f-genre'), V.genres || [], 'All genres');
    ['#f-q', '#f-region', '#f-style', '#f-era', '#f-genre', '#f-data'].forEach(function (s) {
      $(s).addEventListener('input', renderIndex);
    });
    $all('.seg button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });

    fillSelect($('#s-char'), CHAR_ORDER, 'Any character');
    fillSelect($('#s-type'), V.spotTypes || [], 'Any type');
    fillSelect($('#s-access'), V.access || [], 'Any access');
    fillSelect($('#s-fam'), C.FAMILIES.map(function (f) { return f.name; }), 'Any color');
    ['#s-q', '#s-char', '#s-type', '#s-access', '#s-fam'].forEach(function (sel) { $(sel).addEventListener('input', renderSpots); });
    G.seed = dateSeed();
    $('#g-next').addEventListener('click', function () { G.round++; newRound(); });
    $('#g-new').addEventListener('click', function () { G.seed = Math.floor(Math.random() * 1e6); G.round = 0; G.score = 0; G.answered = 0; newRound(); });

    $('#add-target').addEventListener('click', function () {
      if (S.targets.length < 5) { S.targets.push({ hex: '#E2725B' }); renderTargets(); renderResults(); }
    });
    $('#clear-targets').addEventListener('click', function () { S.targets = []; renderTargets(); renderResults(); });
    $('#inspo').addEventListener('change', function (e) { if (e.target.files[0]) useInspiration(e.target.files[0]); e.target.value = ''; });

    fillSelect($('#an-type'), (V.spaceTypes || []).map(function (t) { return t.name; }));
    fillSelect($('#an-sqft-src'), V.areaSources || []);
    $('#an-sqft-src').value = 'Estimated';
    fillSelect($('#an-light'), V.lighting || []);
    $('#an-hotel').addEventListener('change', toggleNewHotel);
    $('#an-k').addEventListener('input', function () { $('#an-k-out').textContent = $('#an-k').value + ' colors'; });
    $('#an-files').addEventListener('change', function (e) { addImages(e.target.files); e.target.value = ''; });
    var drop = $('#an-drop');
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); addImages(e.dataTransfer.files); });
    $('#an-run').addEventListener('click', runAnalyze);
    $('#exp-hotels').addEventListener('click', exportHotels);
    $('#exp-spaces').addEventListener('click', exportSpaces);
    $('#exp-swatches').addEventListener('click', exportSwatches);
    $('#exp-spots').addEventListener('click', exportSpots);
    $('#exp-json').addEventListener('click', function () {
      offer('JSON backup', 'colorways-backup.json', JSON.stringify(S.user, null, 2), 'application/json',
        'Keep this backup somewhere safe; Import JSON restores it in any browser.');
    });
    $('#imp-json').addEventListener('change', function (e) { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
    var clearArmed = null;
    $('#clear-user').addEventListener('click', function () {
      var btn = $('#clear-user');
      if (!clearArmed) {
        btn.textContent = 'Click again to delete everything';
        toast('This deletes all measured data saved in this browser. Export a JSON backup first if you want to keep it.');
        clearArmed = setTimeout(function () { clearArmed = null; btn.textContent = 'Clear my data'; }, 5000);
        return;
      }
      clearTimeout(clearArmed);
      clearArmed = null;
      btn.textContent = 'Clear my data';
      S.user = { hotels: [] }; saveUser(); refreshData(); populateHotelSelects(); renderIndex(); renderSpaceFilter(); renderUserSummary();
      toast('Cleared.');
    });

    $('#bc-file').addEventListener('change', function (e) {
      $('#bc-run').disabled = !e.target.files.length;
      $('#bc-name').textContent = e.target.files.length ? e.target.files[0].name : 'MP4 (H.264) or WebM';
    });
    $('#bc-run').addEventListener('click', runBarcode);
    $('#bc-download').addEventListener('click', function () {
      $('#bc-canvas').toBlob(function (b) {
        if (b) offer('Walkthrough barcode', 'walkthrough-barcode.png', b, 'image/png',
          'Download the PNG. If downloads are blocked here, press and hold (or right-click) the image to save it.');
      }, 'image/png');
    });
    $('#x-close').addEventListener('click', function () { $('#export').close(); });
    $('#x-download').addEventListener('click', function () {
      if (exportState) download(exportState.name, exportState.content, exportState.type);
    });
    $('#x-copy').addEventListener('click', function () { if (exportState) copyText(exportState.content); });
    $('#export').addEventListener('click', function (e) { if (e.target === $('#export')) $('#export').close(); });
    $('#bc-save').addEventListener('click', function () {
      var id = $('#bc-hotel').value;
      if (!S.barcode) { toast('Generate a barcode first.'); return; }
      if (!id) { toast('Choose a hotel.'); return; }
      userHotelFor(id).walkthrough = S.barcode;
      saveUser(); refreshData(); renderIndex(); renderUserSummary();
      toast('Walkthrough saved. It shows under the stripe on the hotel card.');
    });

    var d = $('#detail');
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    d.addEventListener('close', hideTip);

    populateHotelSelects();
    renderIndex();
    renderTargets();
    renderFamilyChips();
    renderSpaceFilter();
    renderUserSummary();
    renderMethod();
    window.addEventListener('hashchange', route);
    route();
  }

  window.CWApp = { state: S, game: G, refresh: function () { refreshData(); renderIndex(); }, openDetail: openDetail, runBarcode: runBarcode, sampleVideo: sampleVideo };
  init();
})();
