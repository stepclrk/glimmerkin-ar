/* Browser test of the room, in the preview's pretend room (a table on a floor, a stool, a wall): the room map, roaming
   between surfaces and up the wall, Come here, fetching a berry that lands on the floor, hide and seek, and the egg
   hunt. Prints ALL CHECKS PASSED or what failed.
   Run: python3 -m http.server 8765 (in the repo), then node test/room.test.mjs. BASE_URL, THREE_PATH and SHOTS_DIR as
   in test/preview.test.mjs. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/';
const SHOTS = process.env.SHOTS_DIR || 'shots';
fs.mkdirSync(SHOTS, { recursive: true });
const fails = [], errors = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) { fails.push(what); if (errors.length) console.log('     page errors so far: ' + errors.join(' | ')); } };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1 });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
if (process.env.THREE_PATH) await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: process.env.THREE_PATH, contentType: 'application/javascript' }));
await page.route('https://fonts.**', r => r.abort());

await page.goto(BASE);
await page.waitForFunction(() => window.__glim, null, { timeout: 15000 });
await page.click('#start-preview'); await page.waitForTimeout(500);
const E = (f, a) => page.evaluate(f, a);
const pet = () => E(() => window.__glim.pet());
const idle = (ms) => page.waitForFunction(() => !window.__glim.pet().moving, null, { timeout: ms || 15000 });

check(await E(() => window.__glim.room().surfs.length) === 1, 'before roaming, the room is just the nest');
check(await page.isHidden('#come'), 'no Come here button while it stays by the nest');

// turn on roaming from the Play sheet
await page.click('#play'); await page.waitForTimeout(400);
check(/Roam the room/.test(await page.textContent('#sheet')), 'the Play sheet offers Roam the room');
await page.click('#sheet.on button[data-do="roam"]'); await page.waitForTimeout(600);
const rm = await E(() => window.__glim.room());
const floor = rm.surfs.find(s => s.label === 'the floor'), stool = rm.surfs.find(s => s.kind === 'flat' && s !== floor && s.y > -0.4 && s.y < -0.2);
check(!!floor && floor.n > 40, 'the pretend room has a floor (' + JSON.stringify(rm.surfs) + ')');
check(!!stool, 'and a stool, a surface of its own');
check(rm.walls > 10, 'and a wall (' + rm.walls + ' points)');
check(await page.isVisible('#come'), 'Come here shows while it roams');
await E(() => window.__glim.think(1e9));   // keep the brain still while the test drives it
await page.screenshot({ path: SHOTS + '/room-1-roam.png' });

// down to the floor: it walks to the table's edge and hops down
await E(id => window.__glim.goSurf(id), floor.id);
await page.waitForTimeout(400);
let p = await pet(); check(p.moving, 'sent to the floor, it sets off');
await idle(); p = await pet();
check(Math.abs(p.y - floor.y) < 0.02 && p.surf === floor.id, 'it ends up on the floor (y ' + p.y.toFixed(3) + ')');
await page.screenshot({ path: SHOTS + '/room-2-floor.png' });

// up onto the stool
await E(id => window.__glim.goSurf(id), stool.id); await idle(); p = await pet();
check(p.surf === stool.id && Math.abs(p.y - stool.y) < 0.02, 'it hops up onto the stool (y ' + p.y.toFixed(3) + ')');

// up the wall and back down
await E(() => window.__glim.cling()); await page.waitForFunction(() => window.__glim.pet().cling, null, { timeout: 12000 }).catch(() => { });
p = await pet(); check(p.cling, 'it hops up and clings to the wall');
await page.screenshot({ path: SHOTS + '/room-3-wall.png' });
await page.waitForFunction(() => !window.__glim.pet().cling && !window.__glim.pet().moving, null, { timeout: 20000 }).catch(() => { });
p = await pet(); check(!p.cling && p.surf, 'and comes back down to a surface');

// Come here: to the surface nearest in front of the camera
await page.click('#come'); await page.waitForTimeout(300); check((await pet()).moving, 'Come here sends it towards you');
await idle(); p = await pet(); check(p.z > 0.15, 'it comes to the front of the room (z ' + p.z.toFixed(2) + ')');

// the brain: left alone, it goes somewhere by itself
const before = await pet(); await E(() => window.__glim.think(0)); await page.waitForTimeout(300);
let wandered = false; for (let i = 0; i < 6 && !wandered; i++) { const q = await pet(); wandered = q.moving || Math.hypot(q.x - before.x, q.z - before.z) > 0.05; if (!wandered) { await E(() => window.__glim.think(0)); await page.waitForTimeout(400); } }
check(wandered, 'left alone, it wanders off by itself');
await E(() => window.__glim.think(1e9)); await idle(20000);

// a berry that lands on the floor: it runs to fetch it and eats it there
await E(() => window.__glim.goSurf(window.__glim.room().surfs.find(s => s.kind === 'nest').id)); await idle();
const bel0 = (await E(() => window.__glim.P.belly));
const bb = await page.locator('#berry').boundingBox(), bx = bb.x + bb.width / 2, by = bb.y + bb.height / 2;
await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.move(bx + 90, by - 320, { steps: 2 }); await page.mouse.up();
await page.waitForFunction(() => /fetch/.test(document.querySelector('#toast').textContent), null, { timeout: 6000 }).catch(() => { });
check(/fetch/.test(await page.textContent('#toast')), 'a berry that sails past lands on the floor and it runs to fetch it');
await page.waitForFunction(() => !window.__glim.toss, null, { timeout: 20000 }).catch(() => { });
check((await E(() => window.__glim.P.belly)) > bel0 + 10, 'it eats the berry where it landed');

// hide and seek
await page.click('#play'); await page.waitForTimeout(400); await page.click('#sheet.on button[data-do="seek"]'); await page.waitForTimeout(300);
let g = await E(() => window.__glim.game());
check(g.k === 'seek' && g.phase === 'count', 'hide and seek starts with a count');
check(await page.isVisible('#count'), 'the screen goes dark for the count');
await page.screenshot({ path: SHOTS + '/room-4-count.png' });
await E(() => window.__glim.skip(9.7)); await page.waitForTimeout(800);
g = await E(() => window.__glim.game());
check(g.phase === 'hunt' && await page.isHidden('#count'), 'after the count, the hunt begins');
check(g.spot && g.spot.label !== 'the nest', 'it hid away from the nest (' + JSON.stringify(g.spot) + ')');
await idle(); p = await pet(); check(p.visible && !p.moving, 'it is in its hiding place');
check(!(await E(() => window.__glim.arrow())), 'no arrow gives it away');
await page.screenshot({ path: SHOTS + '/room-5-hidden.png' });
const dust0 = await E(() => window.__glim.S.dust);
const hp = await E(() => window.__glim.screenOfBody());
await page.mouse.click(hp.x, hp.y); await page.waitForTimeout(400);
g = await E(() => window.__glim.game());
check(!g.k && (await E(() => window.__glim.S.dust)) > dust0, 'tapping it finds it, for stardust (' + await page.textContent('#toast') + ')');

// egg hunt
await E(() => window.__glim.think(1e9)); await idle(20000);
await page.click('#play'); await page.waitForTimeout(400); await page.click('#sheet.on button[data-do="eggs"]'); await page.waitForTimeout(300);
g = await E(() => window.__glim.game()); check(g.k === 'eggs' && g.eggs.length >= 3, 'the egg hunt hides ' + g.eggs.length + ' eggs');
await E(() => window.__glim.skip(5)); await page.waitForTimeout(600);
await page.screenshot({ path: SHOTS + '/room-6-eggs.png' });
const pantry0 = await E(() => Object.values(window.__glim.S.pantry).reduce((a, b) => a + b, 0));
for (let i = 0; i < 8; i++) {
  g = await E(() => window.__glim.game()); if (!g.k) break;
  const e = g.eggs.find(z => !z.done && z.front); if (!e) break;
  await page.mouse.click(e.x, e.y); await page.waitForTimeout(500);
}
g = await E(() => window.__glim.game());
check(!g.k, 'tapping every egg finds them all and ends the hunt');
check((await E(() => Object.values(window.__glim.S.pantry).reduce((a, b) => a + b, 0))) > pantry0, 'eggs bring berries for the pantry');

// back to the nest
await page.click('#play'); await page.waitForTimeout(400); await page.click('#sheet.on button[data-do="roam"]'); await page.waitForTimeout(400);
check(await page.isHidden('#come') && (await pet()).on === false, 'Keep it near the nest turns roaming off');
check(!errors.length, 'no errors on the page' + (errors.length ? ': ' + errors.join(' | ') : ''));

await browser.close();
console.log(fails.length ? '\n' + fails.length + ' CHECK(S) FAILED' : '\nALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
