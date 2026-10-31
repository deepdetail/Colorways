const test = require('node:test');
const assert = require('node:assert');
const C = require('../app/js/color.js');
const K = require('../app/js/kmeans.js');

function image(blocks) {
  // blocks: [[hex, pixelCount], ...] -> RGBA bytes
  const out = [];
  for (const [hex, count] of blocks) {
    const [r, g, b] = C.hexToRgb(hex);
    for (let i = 0; i < count; i++) out.push(r, g, b, 255);
  }
  return new Uint8ClampedArray(out);
}

test('recovers three flat colors and their shares', () => {
  const img = image([['#0F5E46', 600], ['#F3E9D2', 300], ['#C9A227', 100]]);
  const cl = K.kmeans(K.pixelsToLab(img), 6, { seed: 1 });
  assert.strictEqual(cl.length, 3, 'duplicates merge away');
  assert.strictEqual(cl[0].hex, '#0F5E46');
  assert.ok(Math.abs(cl[0].share - 0.6) < 1e-9);
  assert.strictEqual(cl[1].hex, '#F3E9D2');
  assert.strictEqual(cl[2].hex, '#C9A227');
  assert.strictEqual(cl[2].family, 'Yellow & Gold');
});

test('same input and seed give the same palette', () => {
  const rand = K.mulberry32(42);
  const bytes = new Uint8ClampedArray(4000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 4 === 3 ? 255 : Math.floor(rand() * 256);
  const a = K.kmeans(K.pixelsToLab(bytes), 8, { seed: 9 }).map((c) => c.hex);
  const b = K.kmeans(K.pixelsToLab(bytes), 8, { seed: 9 }).map((c) => c.hex);
  assert.deepStrictEqual(a, b);
});

test('ignoreExtremes skips blown highlights and crushed shadows; transparent pixels are skipped', () => {
  const img = image([['#FFFFFF', 50], ['#000000', 50], ['#2A9D9A', 10]]);
  const labs = K.pixelsToLab(img, { ignoreExtremes: true });
  assert.strictEqual(labs.length / 3, 10);
  const clear = new Uint8ClampedArray([10, 20, 30, 0]);
  assert.strictEqual(K.pixelsToLab(clear).length, 0);
});

test('linear-light average of black and white is a mid gray, not #808080', () => {
  const img = image([['#000000', 1], ['#FFFFFF', 1]]);
  assert.strictEqual(K.averageHex(img), '#BCBCBC');
});

test('dominant color picks the largest region', () => {
  const img = image([['#9E1B32', 70], ['#F7F7F5', 30]]);
  assert.strictEqual(K.dominantHex(img), '#9E1B32');
});
