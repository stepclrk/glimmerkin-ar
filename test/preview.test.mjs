/* Browser test of the preview (no AR): placement on the table, stroking, every trick shape, teaching a trick,
   catching a berry, and bringing in a creature from a save code. Prints ALL CHECKS PASSED or what failed.
   Run: python3 -m http.server 8765 (in the repo), then node test/preview.test.mjs
   BASE_URL to test elsewhere; THREE_PATH to serve three.module.js from disk when the CDN is not reachable;
   SHOTS_DIR for screenshots. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');   // a local or global install

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/';
const SHOTS = process.env.SHOTS_DIR || 'shots';
fs.mkdirSync(SHOTS, { recursive: true });
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) { fails.push(what); if (errors.length) console.log('     page errors so far: ' + errors.join(' | ')); } };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
if (process.env.THREE_PATH) await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: process.env.THREE_PATH, contentType: 'application/javascript' }));
await page.route('https://fonts.**', r => r.abort());

await page.goto(BASE);
await page.waitForFunction(() => window.__glim, null, { timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: SHOTS + '/1-menu.png' });
check(await page.textContent('#ar-status').then(t => /AR is not available|no WebXR|https/.test(t)), 'menu says AR is unavailable in a desktop browser');

await page.click('#start-preview');
await page.waitForTimeout(700);
check(await page.evaluate(() => window.__glim.mode) === 'preview', 'preview starts');

const G = () => page.evaluate(() => ({ trick: window.__glim.trick, tricks: Object.assign({}, window.__glim.P.tricks), joy: window.__glim.P.joy, belly: window.__glim.P.belly, toss: window.__glim.toss }));
async function drawPath(pts) { await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down(); for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 2 }); await page.mouse.up(); }
const cx = 200, cy = 180;   // open sky above the creature
const circle = Array.from({ length: 41 }, (_, i) => [cx + Math.cos(i / 40 * Math.PI * 2) * 70, cy + Math.sin(i / 40 * Math.PI * 2) * 70]);
const spiral = Array.from({ length: 80 }, (_, i) => { const a = i / 79 * Math.PI * 4.4, r = 30 + i * 0.6; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const zigzag = [[100, 150], [300, 170], [100, 190], [300, 210], [100, 230]].flatMap((p, i, a) => i ? Array.from({ length: 8 }, (_, k) => [a[i - 1][0] + (p[0] - a[i - 1][0]) * (k + 1) / 8, a[i - 1][1] + (p[1] - a[i - 1][1]) * (k + 1) / 8]) : [p]);
const up = Array.from({ length: 10 }, (_, i) => [200, 300 - i * 15]);
const down = Array.from({ length: 10 }, (_, i) => [200, 150 + i * 15]);
const across = Array.from({ length: 10 }, (_, i) => [80 + i * 22, 200]);
const star = []; for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; const p = [cx + Math.cos(a) * 90, cy + 20 + Math.sin(a) * 90]; if (star.length) { const q = star[star.length - 1]; for (let k = 1; k <= 6; k++) star.push([q[0] + (p[0] - q[0]) * k / 6, q[1] + (p[1] - q[1]) * k / 6]); } else star.push(p); }
const heart = Array.from({ length: 61 }, (_, i) => { const t = Math.PI / 2 + i / 60 * Math.PI * 2; return [cx + 5 * 16 * Math.sin(t) ** 3, cy - 5 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]; });

async function strokeBody() {
  const b = await page.evaluate(() => window.__glim.screenOfBody());
  await page.mouse.move(b.x - 20, b.y); await page.mouse.down();
  for (let i = 0; i < 6; i++) { await page.mouse.move(b.x + 20, b.y + 4, { steps: 6 }); await page.mouse.move(b.x - 20, b.y - 4, { steps: 6 }); }
  await page.mouse.up();
}
async function waitTrickEnd() { await page.waitForFunction(() => !window.__glim.trick, null, { timeout: 5000 }); }

// every shape gives its trick
for (const [name, path] of [['spin', circle], ['wiggle', zigzag], ['leap', up], ['bow', down], ['roll', across], ['chase', spiral], ['pose', star], ['kiss', heart]]) {
  await drawPath(path); await page.waitForTimeout(150);
  const s = await G(); check(s.trick === name, 'drawing gives ' + name + ' (got ' + s.trick + ')');
  if (name === 'roll') await page.screenshot({ path: SHOTS + '/3-trick-roll.png' });
  await waitTrickEnd();
  await page.waitForTimeout(4200);   // let the praise window close
}

// stroking raises Joy and praises a trick try
const j0 = (await G()).joy;
await drawPath(circle); await page.waitForTimeout(200); await strokeBody();
let s = await G();
check(s.joy > j0 + 3, 'stroking raises Joy (' + j0.toFixed(1) + ' to ' + s.joy.toFixed(1) + ')');
check(s.tricks.spin === 1, 'a stroke after a try is praise (spin ' + s.tricks.spin + ' of 5)');
await page.screenshot({ path: SHOTS + '/2-stroked.png' });
await waitTrickEnd();
for (let i = 0; i < 4; i++) { await drawPath(circle); await page.waitForTimeout(200); await strokeBody(); await waitTrickEnd(); }
s = await G(); check(s.tricks.spin === 5, 'five praised tries teach spin (' + s.tricks.spin + ')');
check(/learned to spin/.test(await page.textContent('#toast')), 'a toast says it has learned to spin');
await page.click('#tricks-btn'); await page.waitForTimeout(400);
check(/Learned/.test(await page.textContent('#tricks-list')), 'the tricks sheet lists spin as learned');
await page.screenshot({ path: SHOTS + '/4-tricks-sheet.png' });
await page.click('#sheet.on button[data-do="x"]'); await page.waitForTimeout(400);

// a gentle tap on the berry tosses one straight to it, which it catches
const bel0 = (await G()).belly;
await page.click('#berry'); await page.waitForTimeout(300);
check((await G()).toss, 'tapping the berry throws one');
await page.screenshot({ path: SHOTS + '/5-berry-flying.png' });
await page.waitForFunction(() => !window.__glim.toss, null, { timeout: 6000 });
s = await G(); check(s.belly > bel0 + 10, 'it catches the berry and Belly rises (' + bel0.toFixed(1) + ' to ' + s.belly.toFixed(1) + ')');

// a hard flick sails past and lands on the table
const bb = await page.locator('#berry').boundingBox();
const bx = bb.x + bb.width / 2, by = bb.y + bb.height / 2;
await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.move(bx + 60, by - 300, { steps: 3 }); await page.mouse.up();
await page.waitForTimeout(100);
check((await G()).toss, 'flicking the berry throws one');
await page.waitForFunction(() => !window.__glim.toss, null, { timeout: 6000 });

// bring in a grown-up Mythic creature from a save code
await page.click('#leave'); await page.waitForTimeout(400);
const code = await page.evaluate(() => 'GLIM1.' + btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, pet: { name: 'Lumoss', seed: 424242, xp: 900, diet: { glow: 2, bloom: 1.6 }, marks: ['halo', 'freckles', 'bellystar'], form: 'glow', tricks: { leap: 5 } }, j: { catchBest: 4 } })))));
await page.click('#bring'); await page.fill('#code', 'nonsense'); await page.click('#import-ok');
check(/not a Glimmerkin save code/.test(await page.textContent('#code-err')), 'a bad code is refused with a reason');
await page.fill('#code', code); await page.click('#import-ok'); await page.waitForTimeout(600);
s = await page.evaluate(() => ({ name: window.__glim.P.name, form: document.querySelector('#form').textContent, look: window.__glim.look() }));
check(s.name === 'Lumoss' && s.form === 'Starlantern', 'the code brings in Lumoss, a Starlantern (' + s.name + ', ' + s.form + ')');
await page.click('#start-preview'); await page.waitForTimeout(1500);
await page.screenshot({ path: SHOTS + '/6-mythic.png' });

check(errors.length === 0, 'no errors on the page' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails.length ? fails.length + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
