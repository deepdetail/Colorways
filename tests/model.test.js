const test = require('node:test');
const assert = require('node:assert');
const M = require('../app/js/model.js');

const vocab = {
  spaceTypes: [
    { name: 'Lobby', order: 2, sqft: 5000, dwell: 0.3 },
    { name: 'Guest Room', order: 5, sqft: 450, dwell: 9 },
    { name: 'Pool', order: 9, sqft: 8000, dwell: 2 }
  ]
};
const hotel = {
  id: 'T-1', name: 'Test Hotel',
  spaces: [
    { type: 'Pool', photoOp: 5, colors: [{ hex: '#2A9D9A', share: 70, key: true }, { hex: '#F7F7F5', share: 30 }] },
    { type: 'Lobby', sqft: 6000, photoOp: 4, colors: [{ hex: '#0F5E46', share: 50 }, { hex: '#C9A227', share: 50 }] },
    { type: 'Guest Room', colors: [{ hex: '#C8B79E', share: 3 }, { hex: '#1F2A4A', share: 1 }] },
    { type: 'Spa', colors: [] }
  ]
};

test('stripe orders spaces by guest journey and skips spaces without colors', () => {
  const st = M.stripe(hotel, 'area', vocab);
  assert.deepStrictEqual(st.segments.map((g) => g.space.type), ['Lobby', 'Guest Room', 'Pool']);
});

test('area mode uses published square feet, else the type default', () => {
  const st = M.stripe(hotel, 'area', vocab);
  assert.deepStrictEqual(st.segments.map((g) => g.weight), [6000, 450, 8000]);
  assert.ok(Math.abs(st.segments.reduce((s, g) => s + g.fraction, 0) - 1) < 1e-12);
});

test('time and equal modes', () => {
  assert.deepStrictEqual(M.stripe(hotel, 'time', vocab).segments.map((g) => g.weight), [0.3, 9, 2]);
  assert.deepStrictEqual(M.stripe(hotel, 'equal', vocab).segments.map((g) => g.fraction), [1 / 3, 1 / 3, 1 / 3]);
});

test('color shares normalize within each space', () => {
  const room = M.stripe(hotel, 'equal', vocab).segments[1];
  assert.deepStrictEqual(room.colors.map((c) => c.frac), [0.75, 0.25]);
});

test('family breakdown sums to 1 and reflects weights', () => {
  const fb = M.familyBreakdown(hotel, 'equal', vocab);
  const total = fb.reduce((s, f) => s + f.fraction, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
  const teal = fb.find((f) => f.family === 'Teal & Aqua');
  assert.ok(Math.abs(teal.fraction - 0.7 / 3) < 1e-12);
});

test('key swatch favors the flagged photo-op color and keeps chips distinct', () => {
  const ks = M.keySwatches(hotel, 5);
  assert.strictEqual(ks[0].hex, '#2A9D9A');
  for (let i = 0; i < ks.length; i++)
    for (let j = i + 1; j < ks.length; j++)
      assert.ok(require('../app/js/color.js').deltaE2000(ks[i].lab, ks[j].lab) >= 12);
});

test('search: exact color scores higher than a far color; space filter narrows the pool', () => {
  const near = M.scoreHotel(hotel, [{ hex: '#2A9D9A' }]);
  const far = M.scoreHotel(hotel, [{ hex: '#FF00FF' }]);
  assert.ok(near.score > far.score);
  assert.strictEqual(near.matches[0].spaceType, 'Pool');
  const lobbyOnly = M.scoreHotel(hotel, [{ hex: '#2A9D9A' }], { spaceTypes: ['Lobby'] });
  assert.strictEqual(lobbyOnly.matches[0].spaceType, 'Lobby');
  assert.ok(lobbyOnly.score < near.score);
});

test('search by family matches any shade in that family', () => {
  const r = M.scoreHotel(hotel, [{ hex: '#3E7D4F', family: 'Green' }]);
  assert.strictEqual(r.matches[0].family, 'Green');
  assert.ok(r.score >= 50);
});

test('data quality reports the weakest evidence', () => {
  const h = { spaces: [{ type: 'Lobby', colors: [{ hex: '#111111', source: 'Measured' }, { hex: '#222222', source: 'Described' }] }] };
  assert.strictEqual(M.dataQuality(h), 'Described');
  assert.strictEqual(M.dataQuality({ spaces: [] }), 'None');
});

test('coverage: undocumented share is reported, not painted with the logged colors', () => {
  const h = { spaces: [
    { type: 'Lobby', coverage: 40, colors: [{ hex: '#C9919A', share: 100 }] },
    { type: 'Guest Room', colors: [{ hex: '#1F2A4A', share: 100 }] }
  ] };
  const fb = M.familyBreakdown(h, 'equal', vocab);
  const pink = fb.find((f) => f.family === 'Pink & Blush');
  const navy = fb.find((f) => f.family === 'Navy');
  const unk = fb.find((f) => f.undocumented);
  assert.ok(Math.abs(pink.fraction - 0.2) < 1e-12);
  assert.ok(Math.abs(navy.fraction - 0.5) < 1e-12);
  assert.ok(Math.abs(unk.fraction - 0.3) < 1e-12);
  assert.ok(Math.abs(fb.reduce((s, f) => s + f.fraction, 0) - 1) < 1e-12);
  assert.strictEqual(M.stripe(h, 'equal', vocab).segments[0].coverage, 0.4);
});

test('coverage lowers search prominence for a color that only covers part of a space', () => {
  const full = { spaces: [{ type: 'Lobby', colors: [{ hex: '#C9919A', share: 100 }] }] };
  const part = { spaces: [{ type: 'Lobby', coverage: 10, colors: [{ hex: '#C9919A', share: 100 }] }] };
  const t = [{ hex: '#C9919A' }];
  assert.ok(M.scoreHotel(full, t).score > M.scoreHotel(part, t).score);
});
