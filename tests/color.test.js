const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const C = require('../app/js/color.js');
const ref = require('./reference_colors.json');

test('CIEDE2000 matches Sharma et al. (2005) reference pairs', () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [61, -5, 29], 22.8977],
    [[50, 2.5, 0], [56, -27, -3], 31.903],
    [[50, 2.5, 0], [58, 24, 15], 19.4535]
  ];
  for (const [a, b, want] of pairs) {
    assert.ok(Math.abs(C.deltaE2000(a, b) - want) < 1e-4, `${a} vs ${b}`);
    assert.ok(Math.abs(C.deltaE2000(b, a) - want) < 1e-4, 'symmetric');
  }
});

test('sRGB white and black map to L* 100 and 0', () => {
  const w = C.hexToLab('#FFFFFF');
  assert.ok(Math.abs(w[0] - 100) < 0.01 && Math.abs(w[1]) < 0.01 && Math.abs(w[2]) < 0.01);
  assert.deepStrictEqual(C.hexToLab('#000000').map((v) => Math.round(v * 1000) / 1000), [0, 0, 0]);
});

test('Lab round trip returns the same hex', () => {
  for (const [hex] of ref) assert.strictEqual(C.labToHex(C.hexToLab(hex)), hex.toUpperCase());
});

test('every reference color lands in its expected family', () => {
  for (const [hex, fam, name] of ref) assert.strictEqual(C.familyOfHex(hex), fam, `${name} ${hex}`);
});

test('each family swatch classifies as its own family', () => {
  for (const f of C.FAMILIES) assert.strictEqual(C.familyOfHex(f.hex), f.name);
});

test('readable ink: dark on light swatches, light on dark ones', () => {
  assert.strictEqual(C.inkOn('#F7F7F5'), '#111111');
  assert.strictEqual(C.inkOn('#1F2A4A'), '#FFFFFF');
});

test('hex validation', () => {
  assert.ok(C.isHex('#a1b2c3') && C.isHex('A1B2C3'));
  assert.ok(!C.isHex('#12345') && !C.isHex('blue') && !C.isHex(null));
  assert.throws(() => C.hexToRgb('nope'));
});
