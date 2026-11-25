/* Browser test of the game loop in the preview: hatch an egg by rubbing it, open Where to?, pick a party, then play
   whole quests to the portal by tapping the board and choosing littles on the sheets, and come home with the loot.
   Prints ALL CHECKS PASSED or what failed. Same setup as preview.test.mjs (BASE_URL, THREE_PATH, SHOTS_DIR), and
   QUESTS for how many quests to play (default 3). */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/';
const SHOTS = process.env.SHOTS_DIR || 'shots';
const QUESTS = +(process.env.QUESTS || 3);
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
await page.evaluate(() => localStorage.clear());
await page.goto(BASE);
await page.waitForFunction(() => window.__glim, null, { timeout: 15000 });
await page.click('#start-preview');
await page.waitForTimeout(600);
const st = () => page.evaluate(() => { const S = window.__glim.S; return { littles: S.littles.length, eggs: S.eggs.length, quests: S.quests, dust: S.dust, rest: S.pet.rest, pantry: Object.values(S.pantry).reduce((a, b) => a + b, 0), xp: S.littles.map(l => l.xp || 0) }; });
check((await st()).littles === 2, 'a new game starts with two littles');
check(await page.isVisible('#where') && !(await page.isVisible('#q-home')), 'the nest buttons show, the quest ones do not');
await page.screenshot({ path: SHOTS + '/q1-nest.png' });

// an egg hatches when rubbed warm
await page.evaluate(() => window.__glim.addEgg(true));
await page.waitForTimeout(300);
for (let n = 0; n < 30 && (await st()).eggs; n++) {
  const e = await page.evaluate(() => window.__glim.S.eggs.length && window.__glim.screenOfEgg(0)); if (!e) break;
  await page.mouse.move(e.x - 12, e.y); await page.mouse.down();
  for (let i = 0; i < 4; i++) { await page.mouse.move(e.x + 12, e.y, { steps: 4 }); await page.mouse.move(e.x - 12, e.y, { steps: 4 }); }
  await page.mouse.up(); await page.waitForTimeout(100);
}
await page.waitForTimeout(1500);
let s = await st();
check(s.eggs === 0 && s.littles === 3, 'rubbing the egg hatches it into a third little (eggs ' + s.eggs + ', littles ' + s.littles + ')');
check(await page.evaluate(() => !!window.__glim.S.littles[2].kind2), 'a twin egg hatches a twin little');
await page.screenshot({ path: SHOTS + '/q2-hatched.png' });

async function idle() { await page.waitForFunction(() => { const d = window.__glim.quest(); return !d || (!d.Q.busy && !d.Q.walking); }, null, { timeout: 20000 }); await page.waitForTimeout(80); }
async function sheetPick() {   // choose the first littles who can, on whichever sheet opened
  await page.waitForTimeout(350);
  const b = await page.$('#sheet.on button[data-do="send"]:not([disabled]), #sheet.on button[data-do="pair"]:not([disabled])');
  if (!b) { await page.click('#sheet.on button[data-do="x"]').catch(() => { }); return false; }
  await b.click(); return true;
}

for (let n = 1; n <= QUESTS; n++) {
  await page.evaluate(() => window.__glim.setRest(100));
  const before = await st();
  await page.click('#where'); await page.waitForTimeout(400);
  check(await page.isVisible('#sheet.on button[data-do="go"]'), 'quest ' + n + ': Where to? offers portals');
  if (n === 1) {   // take all three littles
    for (const id of await page.$$eval('#sheet .chip:not(.on)', bs => bs.map(b => b.dataset.arg))) { await page.click('#sheet .chip[data-arg="' + id + '"]'); await page.waitForTimeout(250); }
    check(await page.$$eval('#sheet .chip.on', b => b.length) === 3, 'three littles can come along');
    await page.screenshot({ path: SHOTS + '/q3-where.png' });
  }
  await page.click('#sheet.on button[data-do="go"]');
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => { const d = window.__glim.quest(); return d && { W: d.w.W, H: d.w.H, need: d.w.need, name: d.w.name, biome: d.w.biome }; });
  check(!!info && await page.isVisible('#q-home') && !(await page.isVisible('#where')), 'quest ' + n + ' begins: ' + (info && info.name + ', ' + info.W + 'x' + info.H + ', ' + info.need + ' shards'));
  if (!info) break;
  if (n === 1) await page.screenshot({ path: SHOTS + '/q4-board.png' });
  await page.waitForTimeout(500);

  // one real tap on a reachable floor tile walks there
  if (n === 1) {
    const t = await page.evaluate(() => { const d = window.__glim.quest(), w = d.w, prev = d.reach(); for (const k of prev.keys()) { const x = k % w.W, y = (k - x) / w.W; if ((x !== d.Q.px || y !== d.Q.py) && !w.cells[k].item) return { x, y, p: d.screen(x, y) }; } return null; });
    if (t) { await page.mouse.click(t.p.x, t.p.y); await page.waitForTimeout(200); await idle(); const at = await page.evaluate(() => { const q = window.__glim.quest().Q; return [q.px, q.py]; }); check(at[0] === t.x && at[1] === t.y, 'tapping a tile on screen walks there'); }
  }

  let steps = 0, ok = false;
  while (steps++ < 80) {
    await idle();
    const plan = await page.evaluate(() => {
      const d = window.__glim.quest(); if (!d) return { home: true };
      const q = d.Q, w = d.w, prev = d.reach(), cells = w.cells, kxy = k => [k % w.W, (k - k % w.W) / w.W];
      if (q.loot.shards >= w.need && prev.has(w.exit.y * w.W + w.exit.x)) return { tap: [w.exit.x, w.exit.y], why: 'portal' };
      for (const k of prev.keys()) if (cells[k].item && cells[k].item.k === 'shard' && !cells[k].item.bonus) return { tap: kxy(k), why: 'shard' };
      if (w.plate && !q.gateOpen && prev.has(w.plate.y * w.W + w.plate.x)) return { tap: [w.plate.x, w.plate.y], why: 'plate', sheet: true };
      if (w.gate && q.gateOpen && !q.gateLatched && prev.has(w.gate.y * w.W + w.gate.x)) return { tap: [w.gate.x, w.gate.y], why: 'gate' };
      const tgt = []; cells.forEach((c, k) => { const [x, y] = kxy(k); if ((c.enemy || (c.t === 'ob' && !c.cleared)) && d.near(prev, x, y) >= 0) tgt.push({ k, x, y, crit: !!c.crit }); if (c.t === 'islet' && c.item && c.item.k === 'shard') tgt.push({ k, x, y, crit: true, isl: true }); });
      tgt.sort((a, b) => b.crit - a.crit);
      const tried = window.__tried || (window.__tried = new Set());
      const t = tgt.find(t => !tried.has(t.k)); if (t) { tried.add(t.k); return { tap: [t.x, t.y], why: t.isl ? 'islet' : 'blocker', sheet: true }; }
      for (const k of prev.keys()) if (cells[k].item) return { tap: kxy(k), why: 'loot' };
      return { stuck: true, shards: q.loot.shards, need: w.need };
    });
    if (plan.home) { ok = true; break; }
    if (plan.stuck) { console.log('     stuck', JSON.stringify(plan)); break; }
    await page.evaluate(([x, y]) => window.__glim.quest().tap(x, y), plan.tap);
    if (plan.sheet) { if (await sheetPick()) await page.evaluate(() => { window.__tried = new Set(); }); }
    if (plan.why === 'blocker' && n === 1 && !globalThis.shot) { globalThis.shot = 1; await page.waitForTimeout(500); await page.screenshot({ path: SHOTS + '/q5-sending.png' }); }
    await page.waitForTimeout(150);
    if (plan.why === 'portal') { await page.waitForTimeout(1800); }
  }
  await page.evaluate(() => { window.__tried = new Set(); });
  const home = await page.waitForFunction(() => !window.__glim.quest(), null, { timeout: 5000 }).then(() => true, () => false);
  check(ok && home, 'quest ' + n + ' played through to the portal in ' + steps + ' moves');
  if (!home) { await page.screenshot({ path: SHOTS + '/q-stuck-' + n + '.png' }); await page.click('#q-home'); await page.waitForTimeout(300); await page.click('#sheet.on button[data-do="go"]'); await page.waitForTimeout(600); }
  const title = await page.textContent('#sheet.on h2').catch(() => '');
  check(title === 'Through the portal', 'the results sheet says Through the portal (got ' + title + ')');
  if (n === 1) await page.screenshot({ path: SHOTS + '/q6-results.png' });
  await page.click('#sheet.on button[data-do="x"]'); await page.waitForTimeout(400);
  s = await st();
  check(s.quests === before.quests + 1 && s.dust > before.dust, 'quest ' + n + ' counted and paid stardust (' + before.dust + ' → ' + s.dust + ')');
  check(s.xp.reduce((a, b) => a + b) > before.xp.reduce((a, b) => a + b), 'littles gained experience');
  check(s.rest <= 75 + 1, 'the trip cost Rest');
  check(await page.isVisible('#where'), 'back at the nest');
}

// heading home early halves the stardust and does not count
await page.evaluate(() => window.__glim.setRest(100));
const b4 = await st();
await page.click('#where'); await page.waitForTimeout(300); await page.click('#sheet.on button[data-do="go"]'); await page.waitForTimeout(800);
await page.click('#q-home'); await page.waitForTimeout(300); await page.click('#sheet.on button[data-do="go"]'); await page.waitForTimeout(500);
check(await page.textContent('#sheet.on h2') === 'Home again' && (await st()).quests === b4.quests, 'Head home ends a quest early without counting it');
await page.click('#sheet.on button[data-do="x"]');

// too tired to travel
await page.evaluate(() => window.__glim.setRest(10));
await page.click('#where'); await page.waitForTimeout(300);
check(await page.$$eval('#sheet.on button[data-do="go"]', bs => bs.every(b => b.disabled)), 'a tired Glimmerkin cannot set out');
await page.click('#sheet.on button[data-do="x"]');

// the save survives a reload
const saved = await st(); await page.reload(); await page.waitForFunction(() => window.__glim, null, { timeout: 15000 });
const again = await st();
check(again.quests === saved.quests && again.littles === saved.littles && Math.floor(again.dust) === Math.floor(saved.dust), 'the save survives a reload');

check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
