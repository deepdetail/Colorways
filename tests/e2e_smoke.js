/* End-to-end smoke test for the prototype in headless Chromium (Playwright).
 * Usage: node tests/e2e_smoke.js <photo.png> <walkthrough.webm> [screenshotDir]
 * Generates nothing on its own: pass a test photo and a short WebM clip. */
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const { chromium } = require('playwright');
const C = require('../app/js/color.js');

const [photo, video, shotDir] = process.argv.slice(2);
const APP = 'file://' + path.resolve(__dirname, '..', 'app', 'index.html');

function dE(a, b) { return C.deltaE2000(C.hexToLab(a), C.hexToLab(b)); }

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name), fullPage: false }); };

  if (shotDir) {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const mp = await mobile.newPage();
    await mp.goto(APP);
    await mp.waitForSelector('.card');
    await mp.evaluate(() => window.scrollTo(0, 560));
    await mp.screenshot({ path: path.join(shotDir, '07-mobile.png') });
    await mobile.close();
  }

  await page.goto(APP);
  await page.waitForSelector('.card');
  const cards = await page.locator('.card').count();
  assert.strictEqual(cards, 44, 'all seed hotels render');
  const first = await page.locator('.card h3').first().textContent();
  console.log('index ok:', cards, 'cards; first card:', first);
  await shot('01-index.png');

  for (const m of ['time', 'equal', 'area']) {
    await page.click(`.seg button[data-mode="${m}"]`);
    assert.strictEqual(await page.locator('.card').count(), 44);
  }

  await page.locator('.card', { hasText: 'Noelle' }).first().click();
  await page.waitForSelector('dialog[open]');
  const rows = await page.locator('dialog table.data tbody tr').count();
  assert.ok(rows >= 5, 'detail table lists spaces');
  console.log('detail ok:', rows, 'space rows for Noelle');
  assert.ok(await page.locator('dialog .spot-card').count() >= 4, 'Noelle detail lists its photo spots');
  assert.ok(await page.locator('dialog .motif').count() >= 1, 'Noelle detail lists its motif');
  assert.ok(await page.locator('dialog .shade-chip').count() >= 5, 'detail groups colors by shade');
  const archText = await page.locator('dialog .motif').first().textContent();
  assert.ok(archText.includes('Deco Pink and Green'), 'motif archetype shown: ' + archText);
  await shot('02-detail-noelle.png');
  await page.click('dialog .d-close');

  await page.goto(APP + '#spots');
  await page.waitForSelector('#spots-grid .spot-card');
  const nSpots = await page.locator('#spots-grid .spot-card').count();
  assert.strictEqual(nSpots, 24, 'all seed spots render');
  await page.selectOption('#s-char', 'Monochromatic');
  const nMono = await page.locator('#spots-grid .spot-card').count();
  assert.ok(nMono >= 5 && nMono < nSpots, 'character filter narrows the list');
  await page.selectOption('#s-char', '');
  await page.selectOption('#s-access', 'Public');
  console.log('spots ok:', nSpots, 'spots;', nMono, 'monochromatic;', await page.locator('#spots-grid .spot-card').count(), 'public');
  await page.selectOption('#s-access', '');
  await shot('08-spots.png');

  await page.goto(APP + '#game');
  await page.waitForSelector('.g-opt');
  assert.strictEqual(await page.locator('.g-opt').count(), 4, 'four choices');
  await page.locator('.g-opt').first().click();
  await page.waitForSelector('#g-result strong');
  const score = await page.textContent('#g-score');
  assert.ok(/Score [01] of 1/.test(score), score);
  console.log('game ok:', score.trim(), '|', (await page.textContent('#g-result p')).trim());
  await shot('09-game.png');

  await page.goto(APP + '#search');
  await page.waitForSelector('#results .result');
  const results = await page.locator('#results .result').count();
  console.log('search ok:', results, 'results for the default colors');
  await page.click('.fchip:has-text("Pink & Blush")');
  await page.waitForTimeout(100);
  const topPink = await page.locator('#results .result h3').first().textContent();
  console.log('after adding Pink & Blush, top result:', topPink);
  await shot('03-search.png');

  await page.goto(APP + '#analyze');
  await page.selectOption('#an-hotel', '__new');
  await page.fill('#an-new-name', 'Test Lobby Hotel');
  await page.fill('#an-new-city', 'Austin');
  await page.fill('#an-new-state', 'TX');
  await page.selectOption('#an-type', 'Lobby');
  await page.fill('#an-venue', 'Test lobby');
  await page.setInputFiles('#an-files', photo);
  await page.waitForSelector('#an-images canvas');
  const box = await page.locator('#an-images canvas').boundingBox();
  // Drag across the red block in the lower-right corner (x 70-100%, y 65-100%).
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.72);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.97, box.y + box.height * 0.97, { steps: 6 });
  await page.mouse.up();
  await page.selectOption('#an-k', '8').catch(() => {});
  await page.evaluate(() => { const k = document.querySelector('#an-k'); k.value = '8'; k.dispatchEvent(new Event('input')); });
  await page.click('#an-run');
  await page.waitForSelector('.palette .pchip');
  const aspots = await page.evaluate(() => window.CWApp.state.analyze.spots);
  assert.strictEqual(aspots.length, 1, 'one marked region becomes one spot');
  assert.ok(dE(aspots[0].colors[0].hex, '#8E1B2C') < 3, 'spot palette is the red region');
  await page.fill('.spot-edit input', 'Red velvet test wall');
  const pal = await page.evaluate(() => window.CWApp.state.analyze.palette.map((p) => ({ hex: p.hex, share: p.share, key: p.key })));
  console.log('palette:', JSON.stringify(pal));
  assert.ok(pal.some((p) => dE(p.hex, '#0F5E46') < 3 && Math.abs(p.share - 0.6) < 0.05), 'emerald at about 60%');
  assert.ok(pal.some((p) => dE(p.hex, '#8E1B2C') < 3 && p.key), 'red region flagged as key swatch');
  await shot('04-analyze.png');
  await page.click('text=Save space to dataset');
  await page.goto(APP + '#index');
  await page.fill('#f-q', 'Test Lobby');
  await page.waitForSelector('.card .badge.measured');
  console.log('saved measured space shows in the Index');
  await page.goto(APP + '#spots');
  await page.fill('#s-q', 'Red velvet test');
  await page.waitForSelector('#spots-grid .spot-card .badge.measured');
  const testChar = await page.textContent('#spots-grid .spot-card .badge.char');
  assert.ok(testChar.includes('Monochromatic'), 'measured spot classified: ' + testChar);
  console.log('measured spot shows in Photo spots as', testChar.trim());

  await page.goto(APP + '#analyze');
  await page.click('#exp-spaces');
  await page.waitForSelector('dialog#export[open]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#x-download')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  assert.strictEqual(await page.inputValue('#x-text'), csv, 'panel text equals the downloaded file');
  await page.click('#x-close');
  const head = csv.split('\n')[0];
  assert.ok(head.startsWith('Space_ID,Hotel_ID,Space_Type,Venue,Area_sqft,Area_Source,Coverage_Pct,'), head);
  const row = csv.split('\n').find((l) => l.includes(',Lobby,Test lobby,'));
  assert.ok(row && /^USR-TEST-LOBBY-[A-Z-]*-LOB-M1,USR-TEST-LOBBY-[A-Z-]*,Lobby,Test lobby,,Type default,100,/.test(row), 'exported row: ' + row);
  console.log('csv ok:', head);
  await page.click('#exp-swatches');
  await page.waitForSelector('dialog#export[open]');
  const sw = await page.inputValue('#x-text');
  assert.ok(sw.startsWith('Swatch_ID,Space_ID,Spot_ID,Rank,Hex,Color_Name,Shade,Material,Finish,Share_Pct,'), sw.split('\n')[0]);
  assert.ok(/-SPM1-C1,.*-LOB-M1,USR-[A-Z-]*-SPM1,1,#/.test(sw), 'spot swatch row exported');
  await page.click('#x-close');
  await page.click('#exp-spots');
  await page.waitForSelector('dialog#export[open]');
  const spc = await page.inputValue('#x-text');
  assert.ok(spc.includes('Red velvet test wall'), 'spots export has the measured spot');
  await page.click('#x-close');
  console.log('csv row:', row.slice(0, 120));

  await page.goto(APP + '#barcode');
  await page.setInputFiles('#bc-file', video);
  await page.selectOption('#bc-bars', '120');
  await page.click('#bc-run');
  await page.waitForFunction(() => window.CWApp.state.barcode && window.CWApp.state.barcode.colors.length === 120, null, { timeout: 120000 });
  const bars = await page.evaluate(() => window.CWApp.state.barcode.colors);
  const d0 = dE(bars[10], '#8E1B2C'), d1 = dE(bars[60], '#0F5E46'), d2 = dE(bars[110], '#C9A447');
  console.log('barcode ok: 120 bars; dE to source colors at 10/60/110 =', d0.toFixed(1), d1.toFixed(1), d2.toFixed(1));
  assert.ok(d0 < 8 && d1 < 8 && d2 < 8, 'bars follow the clip colors (allowing video compression)');
  await shot('05-barcode.png');

  await page.goto(APP + '#method');
  await shot('06-method.png');

  assert.deepStrictEqual(errors, [], 'no console errors');
  console.log('no console errors');
  await browser.close();
  console.log('E2E PASS');
})().catch((e) => { console.error('E2E FAIL:', e); process.exit(1); });
