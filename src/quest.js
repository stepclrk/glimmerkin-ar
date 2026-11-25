/* Quests on the table: a world built by the game's own genWorld (src/core.js, unchanged), laid out as a small board.
   Tap a tile to walk, tap a blocker or a gloom to send a little, tap loot to have one fetch it. Collect the star shards,
   wake the portal and step through. The rules follow the game's src/quest.js; world rules, bosses, tools and errands
   are not in yet, so every world is made without them. */
/* global BIOMES, KINDS, OBST, GLOOMS, ELS, EL_HUE, BERRY, genWorld, flood, pathFrom, nearIn, passable, fightCost, scared, maxSparks */
import { lookOf, kindsOf, littleLevel, GROWN_AT, TAU, clamp } from './glim.js';
import { buildCreature } from './creature.js';

let X = null;          // what main.js shares: THREE, the scene, the save, sheets, sounds, particles
let Q = null;          // the quest under way
const TS = 0.042;      // metres a tile
const PET_S = 0.034, LIT_S = 0.022;
const BRIGHT = 2;      // stardust for each spark still unspent when the party steps through the portal
const $ = s => document.querySelector(s);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = u => u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;

export function initQuest(ctx) { X = ctx; $('#q-rally').addEventListener('click', e => { e.stopPropagation(); rally(); }); $('#q-home').addEventListener('click', e => { e.stopPropagation(); askHome(); }); $('#q-lits').addEventListener('click', e => { const b = e.target.closest('[data-lit]'); if (b && Q) openChip(Q.lits[+b.dataset.lit]); }); }
export const questActive = () => !!Q;
export const questSpan = () => Q ? Math.max(Q.world.W, Q.world.H * 0.8) * TS + 0.03 : 0.3;

/* ---------- the board ---------- */
const hsl = (a, l2) => new X.THREE.Color().setHSL(((a[0] % 360) + 360) % 360 / 360, a[1] / 100, (l2 ?? a[2]) / 100);
function key(x, y) { return y * Q.world.W + x; }
function xy(k) { const x = k % Q.world.W; return [x, (k - x) / Q.world.W]; }
function local(x, y, h) { const w = Q.world; return new X.THREE.Vector3((x - (w.W - 1) / 2) * TS, h || 0, (y - (w.H - 1) / 2) * TS); }
function worldAt(x, y, h) { return Q.board.localToWorld(local(x, y, h)); }

function buildBoard(w, B) {
  const T3 = X.THREE, g = new T3.Group(), mats = {}, geos = {};
  const M = (k, f) => mats[k] || (mats[k] = f()), G = (k, f) => geos[k] || (geos[k] = f());
  const toon = c => new T3.MeshToonMaterial({ color: c });
  const base = new T3.Mesh(new T3.BoxGeometry(w.W * TS + 0.024, 0.014, w.H * TS + 0.024), toon(new T3.Color(B.bg[1]))); base.position.y = -0.007; g.add(base);
  const edge = new T3.Mesh(new T3.BoxGeometry(w.W * TS + 0.03, 0.01, w.H * TS + 0.03), toon(new T3.Color(B.bg[0]))); edge.position.y = -0.012; g.add(edge);
  const pick = new T3.Mesh(new T3.PlaneGeometry(w.W * TS, w.H * TS).rotateX(-Math.PI / 2), new T3.MeshBasicMaterial({ visible: false })); pick.position.y = 0.006; g.add(pick);
  const tile = G('tile', () => new T3.BoxGeometry(TS * 0.94, 0.006, TS * 0.94));
  const objs = [];
  const r = mulberry(w.seed);
  w.cells.forEach((c, k) => {
    const x = k % w.W, y = (k - x) / w.W, p = local(x, y), o = { k };
    objs.push(o);
    if (c.t === 'wall' || c.t === 'islet') {
      if (c.t === 'wall') { const wt = new T3.Mesh(tile, M('wt', () => toon(hsl(B.fl, Math.max(8, B.fl[2] - 22))))); wt.position.copy(p).setY(0.003); g.add(wt); const m = wallMesh(B, r, M, G, toon); m.position.copy(p); m.rotation.y = r() * TAU; g.add(m); o.wall = m; return; }
      const isl = new T3.Group(); const d = new T3.Mesh(G('isl', () => new T3.CylinderGeometry(TS * 0.36, TS * 0.2, 0.01, 12)), M('isl', () => toon(hsl(B.fl, B.fl[2] + 8)))); isl.add(d); isl.position.copy(p).setY(0.03); g.add(isl); o.islet = isl;
      if (c.item) { o.item = itemMesh(c.item, M, G); o.item.position.set(0, 0.012, 0); isl.add(o.item); }
      return;
    }
    const tm = new T3.Mesh(tile, M('fl' + ((x + y) % 2), () => toon(hsl(B.fl, B.fl[2] + ((x + y) % 2 ? 4 : 0))))); tm.position.copy(p).setY(0.003); g.add(tm); o.tile = tm;
    if (c.t === 'ob') { o.ob = obMesh(c.ob, M, G, toon); o.ob.position.copy(p).setY(0.006); g.add(o.ob); }
    if (c.t === 'gate') {
      const gate = new T3.Group(); for (const sd of [-1, 1]) { const pl = new T3.Mesh(G('gp', () => new T3.BoxGeometry(0.008, 0.04, 0.008)), M('gp', () => toon(0x9aa4c8))); pl.position.set(sd * TS * 0.4, 0.02, 0); gate.add(pl); }
      const bar = new T3.Mesh(G('gb', () => new T3.BoxGeometry(TS * 0.8, 0.026, 0.004)), M('gb', () => new T3.MeshBasicMaterial({ color: 0x8ff0e0, transparent: true, opacity: 0.75 }))); bar.position.y = 0.017; gate.add(bar); o.bar = bar;
      const moon = new T3.Mesh(G('moon', () => new T3.CircleGeometry(0.006, 16)), M('moon', () => new T3.MeshBasicMaterial({ color: 0xfff6c4 }))); moon.position.set(0, 0.036, 0.003); gate.add(moon);
      const dx = x > 0 && w.cells[k - 1].t !== 'wall' ? 1 : 0; gate.rotation.y = dx ? Math.PI / 2 : 0; gate.position.copy(p).setY(0.006); g.add(gate);
    }
    if (w.plate && w.plate.x === x && w.plate.y === y) { const pl = new T3.Mesh(G('plate', () => new T3.CylinderGeometry(TS * 0.33, TS * 0.36, 0.004, 24)), M('plate', () => new T3.MeshToonMaterial({ color: 0xcfd8ff, emissive: 0x5a7cff, emissiveIntensity: 0.2 }))); pl.position.copy(p).setY(0.008); g.add(pl); o.plate = pl; }
    if (c.enemy) { o.enemy = gloomMesh(c.enemy, T3); o.enemy.position.copy(p).setY(0.006); g.add(o.enemy); }
    if (c.item) { o.item = itemMesh(c.item, M, G); o.item.position.copy(p).setY(0.016); g.add(o.item); }
    if (x === w.exit.x && y === w.exit.y) {
      const port = new T3.Group(); const ring = new T3.Mesh(new T3.TorusGeometry(0.016, 0.003, 8, 32), new T3.MeshBasicMaterial({ color: 0x8a76c8 })); ring.position.y = 0.022; port.add(ring);
      const disc = new T3.Mesh(new T3.CircleGeometry(0.015, 24), new T3.MeshBasicMaterial({ color: 0x3a2a6a, transparent: true, opacity: 0.8, side: T3.DoubleSide })); disc.position.y = 0.022; port.add(disc);
      port.position.copy(p).setY(0.006); g.add(port); o.portal = { port, ring, disc };
    }
  });
  return { g, objs, pick };
}
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function wallMesh(B, r, M, G, toon) {
  const T3 = X.THREE, m = new T3.Group(), wc = hsl(B.wc), s = 0.85 + r() * 0.3;
  if (B.wall === 'tree') { const t = new T3.Mesh(G('trunk', () => new T3.CylinderGeometry(0.004, 0.005, 0.016, 6)), M('trunk', () => toon(0x6b4a2e))); t.position.y = 0.008; m.add(t); const c = new T3.Mesh(G('crown', () => new T3.ConeGeometry(0.017, 0.034, 8)), M('crown', () => toon(wc))); c.position.y = 0.03; m.add(c); }
  else if (B.wall === 'basalt') { const c = new T3.Mesh(G('bas', () => new T3.CylinderGeometry(0.019, 0.02, 0.03, 6)), M('bas', () => toon(wc))); c.position.y = 0.015; m.add(c); }
  else if (B.wall === 'coral') { for (let i = 0; i < 3; i++) { const c = new T3.Mesh(G('cor', () => new T3.CapsuleGeometry(0.004, 0.022, 4, 8)), M('cor', () => toon(wc))); c.position.set((i - 1) * 0.008, 0.015, (i % 2) * 0.006); c.rotation.z = (i - 1) * 0.4; m.add(c); } }
  else if (B.wall === 'cloud') { for (let i = 0; i < 3; i++) { const c = new T3.Mesh(G('cld', () => new T3.SphereGeometry(0.012, 12, 10)), M('cld', () => toon(wc))); c.position.set((i - 1) * 0.01, 0.014 + (i % 2) * 0.008, 0); m.add(c); } }
  else if (B.wall === 'crystal') { const c = new T3.Mesh(G('cry', () => new T3.OctahedronGeometry(0.014)), M('cry', () => new T3.MeshToonMaterial({ color: wc, emissive: wc, emissiveIntensity: 0.25 }))); c.scale.y = 1.9; c.position.y = 0.026; m.add(c); }
  else { const c = new T3.Mesh(G('men', () => new T3.BoxGeometry(0.02, 0.04, 0.014)), M('men', () => toon(wc))); c.position.y = 0.02; m.add(c); }
  m.scale.set(s, s * 0.7, s); return m;   // kept low so the board stays readable from a phone held at an angle
}
function obMesh(ob, M, G, toon) {
  const T3 = X.THREE, g = new T3.Group();
  const add = (geo, mat, x, y, z, sc) => { const m = new T3.Mesh(geo, mat); m.position.set(x, y, z); if (sc) m.scale.set(...sc); g.add(m); return m; };
  if (ob === 'bramble') for (let i = 0; i < 5; i++) add(G('thorn', () => new T3.ConeGeometry(0.005, 0.024, 5)), M('thorn', () => toon(0x6a2a3a)), Math.cos(i * 1.3) * 0.009, 0.012, Math.sin(i * 1.3) * 0.009, null).rotation.set(Math.sin(i) * 0.5, 0, Math.cos(i) * 0.5);
  else if (ob === 'water') { add(G('pool', () => new T3.CylinderGeometry(TS * 0.45, TS * 0.45, 0.002, 20)), M('pool', () => new T3.MeshBasicMaterial({ color: 0x2f8fd8, transparent: true, opacity: 0.85 })), 0, 0.002, 0); add(G('ripple', () => new T3.TorusGeometry(TS * 0.25, 0.0012, 4, 24).rotateX(Math.PI / 2)), M('ripple', () => new T3.MeshBasicMaterial({ color: 0xbfefff })), 0, 0.004, 0); }
  else if (ob === 'boulder') add(G('bould', () => new T3.DodecahedronGeometry(0.017)), M('bould', () => toon(0x8a8796)), 0, 0.015, 0, [1, 0.85, 1]);
  else if (ob === 'chasm') add(G('hole', () => new T3.BoxGeometry(TS * 0.9, 0.002, TS * 0.9)), M('hole', () => new T3.MeshBasicMaterial({ color: 0x07040f })), 0, 0.001, 0);
  else if (ob === 'storm') { for (let i = 0; i < 3; i++) add(G('sc', () => new T3.SphereGeometry(0.01, 10, 8)), M('sc', () => toon(0x5c5f78)), (i - 1) * 0.009, 0.03 + (i % 2) * 0.005, 0); add(G('bolt', () => new T3.ConeGeometry(0.003, 0.02, 4)), M('bolt', () => new T3.MeshBasicMaterial({ color: 0xffe36b })), 0, 0.014, 0).rotation.x = Math.PI; }
  else if (ob === 'shadow') add(G('veil', () => new T3.BoxGeometry(TS * 0.86, 0.036, TS * 0.86)), M('veil', () => new T3.MeshBasicMaterial({ color: 0x1a0d33, transparent: true, opacity: 0.82 })), 0, 0.018, 0);
  else if (ob === 'fog') for (let i = 0; i < 4; i++) add(G('fogb', () => new T3.SphereGeometry(0.011, 10, 8)), M('fogb', () => new T3.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.7 })), Math.cos(i * 1.6) * 0.008, 0.012 + (i % 2) * 0.006, Math.sin(i * 1.6) * 0.008);
  else if (ob === 'ruin') { for (let i = 0; i < 3; i++) add(G('rs', () => new T3.BoxGeometry(0.012, 0.01, 0.01)), M('rs', () => toon(0x8e8a7e)), (i - 1) * 0.011, 0.005 + (i === 1 ? 0.009 : 0), 0); add(G('root', () => new T3.TorusGeometry(0.012, 0.0015, 4, 16)), M('root', () => toon(0x4f8a3a)), 0, 0.01, 0); }
  else if (ob === 'crystal') for (let i = 0; i < 3; i++) add(G('pcry', () => new T3.OctahedronGeometry(0.009)), M('pcry', () => new T3.MeshToonMaterial({ color: 0xff9ad8, emissive: 0xb04a9a, emissiveIntensity: 0.3 })), (i - 1) * 0.009, 0.016, 0, [1, 2, 1]);
  else add(G('unk', () => new T3.BoxGeometry(0.02, 0.02, 0.02)), M('unk', () => toon(0x888888)), 0, 0.01, 0);
  return g;
}
function itemMesh(it, M, G) {
  const T3 = X.THREE, g = new T3.Group();
  if (it.k === 'shard') g.add(new T3.Mesh(G('shard', () => new T3.OctahedronGeometry(0.008)), M(it.bonus ? 'bshard' : 'shard', () => new T3.MeshToonMaterial({ color: it.bonus ? 0x9fefff : 0xffd75a, emissive: it.bonus ? 0x2a8aa8 : 0xc08a10, emissiveIntensity: 0.5 }))));
  else if (it.k === 'berry') { const m = new T3.Mesh(G('berry', () => new T3.SphereGeometry(0.006, 12, 10)), new T3.MeshToonMaterial({ color: new T3.Color().setHSL(EL_HUE[it.el] / 360, 0.75, 0.55) })); g.add(m); if ((it.n || 1) > 1) { const m2 = m.clone(); m2.position.set(0.007, -0.002, 0.003); g.add(m2); } }
  else if (it.k === 'dew') { const m = new T3.Mesh(G('dew', () => new T3.SphereGeometry(0.006, 12, 10)), M('dew', () => new T3.MeshBasicMaterial({ color: 0x9fefff, transparent: true, opacity: 0.85 }))); m.scale.y = 1.3; g.add(m); }
  else if (it.k === 'egg') { const m = new T3.Mesh(G('qegg', () => new T3.SphereGeometry(0.007, 14, 10)), new T3.MeshToonMaterial({ color: new T3.Color().setHSL((it.hue || 0) / 360, 0.6, 0.82) })); m.scale.y = 1.35; g.add(m); }
  else { const b = new T3.Mesh(G('chest', () => new T3.BoxGeometry(0.014, 0.009, 0.01)), M('chest', () => new T3.MeshToonMaterial({ color: 0x8a5a2e }))); g.add(b); const l = new T3.Mesh(G('lid', () => new T3.BoxGeometry(0.015, 0.003, 0.011)), M('lid', () => new T3.MeshToonMaterial({ color: 0xffcf6b }))); l.position.y = 0.006; g.add(l); }
  return g;
}
function gloomMesh(e, T3) {
  const G = GLOOMS[e.g], g = new T3.Group(), s = e.boss ? 1.6 : 1;
  const body = new T3.Mesh(new T3.SphereGeometry(0.014 * s, 16, 12), new T3.MeshToonMaterial({ color: new T3.Color().setHSL(G.hue / 360, 0.45, 0.28), emissive: new T3.Color().setHSL(G.hue / 360, 0.8, 0.2), emissiveIntensity: 0.4 }));
  body.scale.y = 1.1; body.position.y = 0.015 * s; g.add(body);
  for (const sd of [-1, 1]) { const eye = new T3.Mesh(new T3.SphereGeometry(0.003 * s, 8, 6), new T3.MeshBasicMaterial({ color: 0xffe0f0 })); eye.position.set(sd * 0.005 * s, 0.018 * s, 0.012 * s); g.add(eye); }
  g.userData.body = body; return g;
}

/* ---------- starting a quest ---------- */
export function startQuest(portal, party) {
  const S = X.S, p = S.pet;
  if (p.rest < X.TRAVEL_REST) { X.toast(p.name + ' is too tired to travel.'); return; }
  const B = BIOMES.find(b => b.id === portal.biome) || BIOMES[0];
  const room = X.NEST_ROOM - S.littles.length - S.eggs.length;
  const world = genWorld(portal.seed, party.map(l => ({ kind: l.kind, kind2: l.kind2, max: maxSparks(l) })), S.quests, portal.size, B.id, { eggOk: room > 0, noRule: true, noPair: S.quests < 4, twin: S.quests >= 3 ? 0.15 : 0 });
  world.name = portal.name; p.rest -= 25; p.visits[B.id] = (p.visits[B.id] || 0) + 1;
  const bonus = p.joy >= 60 ? 1 : 0, sk = world.start.y * world.W + world.start.x;
  Q = {
    world, B, portal, px: world.start.x, py: world.start.y, fx: world.start.x, fy: world.start.y, trail: [sk, sk, sk, sk], yaw: Math.PI, hop: 0,
    lits: party.map((l, i) => ({ l, L: lookOf(l), i, kinds: kindsOf(l), fly: kindsOf(l).includes('gale'), x: world.start.x, y: world.start.y, sp: maxSparks(l) + bonus, max: maxSparks(l) + bonus, busy: false, stationed: false, acts: 0, lift: 0, yaw: Math.PI, dizzy: false })),
    gateOpen: false, gateLatched: false, rally: p.belly >= 60, full: p.belly >= 60, loot: { dust: 0, berries: {}, eggs: [], shards: 0 }, busy: false, done: false, walking: false, walkTok: 0, nextWalk: null, acted: false, sel: null
  };
  const b = buildBoard(world, B); Q.board = b.g; Q.objs = b.objs; Q.pick = b.pick; X.world.add(Q.board);
  Q.pet = buildCreature(X.petLook(X.S.pet), PET_S); Q.board.add(Q.pet.root);
  for (const f of Q.lits) { f.c = buildCreature(f.L, LIT_S * (littleLevel(f.l.xp || 0) >= GROWN_AT ? 1.12 : 1)); Q.board.add(f.c.root); }
  const sel = new X.THREE.Mesh(new X.THREE.RingGeometry(TS * 0.38, TS * 0.46, 24).rotateX(-Math.PI / 2), new X.THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 })); sel.visible = false; Q.board.add(sel); Q.selMesh = sel;
  X.save(); hudQuest(); X.sfx('gate');
  X.toast(bonus ? 'High spirits: every little carries an extra spark. Find ' + world.need + ' star shards to wake the portal.' : 'Find ' + world.need + ' star shards to wake the portal, then step through.', 4200);
}

/* ---------- the HUD ---------- */
function hudQuest() {
  if (!Q) return; const w = Q.world;
  $('#q-name').textContent = w.name; $('#q-shards').textContent = Math.min(Q.loot.shards, w.need) + ' of ' + w.need + ' star shards' + (Q.loot.shards >= w.need ? ': the portal is awake' : '');
  $('#q-lits').innerHTML = Q.lits.map((f, i) => '<button class="lit' + (f.stationed ? ' held' : '') + (f.dizzy ? ' dizzy' : '') + '" data-lit="' + i + '" style="--h:' + Math.round(f.L.hue) + '"><b>' + X.esc(f.l.name) + '</b><span>' + '●'.repeat(Math.max(0, f.sp)) + '<i>' + '○'.repeat(Math.max(0, f.max - f.sp)) + '</i></span></button>').join('');
  $('#q-rally').disabled = !Q.rally;
}

/* ---------- each frame ---------- */
const tmpV = () => new X.THREE.Vector3();
export function questTick(dt, T) {
  if (!Q) return;
  const w = Q.world, cam = X.camPose();
  // the Glimmerkin, facing where it goes
  const pp = local(Q.fx, Q.fy); Q.pet.root.position.copy(pp);
  const blank = () => ({ lift: 0, squash: 0, tilt: 0, pitch: 0, roll: 0, spin: 0, dx: 0, dz: 0, wiggle: 0, stretch: 0, lean: 0, mood: null });
  const po = blank(); po.lift = Q.hop * PET_S; if (Q.moodT > 0) { Q.moodT -= dt; po.mood = 'happy'; }
  if (Q.trick) { Q.trick.t += dt; X.trickPose(po, Q.trick, PET_S); if (Q.trick.t >= Q.trick.dur) Q.trick = null; }
  Q.pet.root.rotation.y = turnTo(Q.pet.root.rotation.y, Q.yaw, dt * 10); Q.pet.update(dt, T, po);
  // littles follow the trail, unless sent off or holding the plate
  Q.lits.forEach((f, i) => {
    if (!f.busy && !f.stationed) { const [tx, ty] = xy(Q.trail[Math.min(Q.trail.length - 1, i + 1)]); const k = Math.min(1, dt * 8); const ox = f.x, oy = f.y; f.x += (tx - f.x) * k; f.y += (ty - f.y) * k; if (Math.hypot(f.x - ox, f.y - oy) > 0.001) f.yaw = Math.atan2(f.x - ox, f.y - oy); }
    const lp = local(f.x, f.y), off = !f.busy && !f.stationed && Math.abs(f.x - Q.fx) + Math.abs(f.y - Q.fy) < 0.2 ? (i - (Q.lits.length - 1) / 2) * TS * 0.3 : 0;
    f.c.root.position.copy(lp).add(new X.THREE.Vector3(off, 0, TS * 0.15 * (off ? 1 : 0)));
    const lo = blank(); lo.lift = f.lift; if (f.dizzy) lo.wiggle = 0.3; if (f.moodT > 0) { f.moodT -= dt; lo.mood = 'happy'; } if (f.stationed) lo.mood = 'happy';
    f.c.root.rotation.y = turnTo(f.c.root.rotation.y, f.yaw, dt * 10); f.c.update(dt, T + i * 1.3, lo);
  });
  // the board: things bob, glooms wobble and watch you, the portal wakes
  for (const o of Q.objs) {
    if (o.item) { o.item.rotation.y += dt * 1.5; o.item.position.y = (o.islet ? 0.012 : 0.016) + Math.sin(T * 2 + o.k) * 0.002; }
    if (o.islet) o.islet.position.y = 0.03 + Math.sin(T * 1.3 + o.k) * 0.003;
    if (o.enemy) { const b = o.enemy.userData.body; b.scale.set(1 + Math.sin(T * 3 + o.k) * 0.06, 1.1 - Math.sin(T * 3 + o.k) * 0.06, 1); const c = X.world.worldToLocal(cam.clone()); const e = o.enemy.position; o.enemy.rotation.y = Math.atan2(c.x - e.x, c.z - e.z) - (Q.board.rotation.y || 0); if (o.shake) o.enemy.position.x = local(...xy(o.k)).x + Math.sin(T * 60) * 0.002; }
    if (o.bar) o.bar.visible = !Q.gateOpen;
    if (o.plate) o.plate.material.emissiveIntensity = Q.gateOpen && !Q.gateLatched ? 0.9 : 0.2;
    if (o.portal) { const awake = Q.loot.shards >= w.need; o.portal.ring.material.color.set(awake ? 0xffd75a : 0x8a76c8); o.portal.disc.material.color.set(awake ? 0xfff0b0 : 0x3a2a6a); o.portal.ring.rotation.z += dt * (awake ? 3 : 0.5); const c = X.world.worldToLocal(cam.clone()); o.portal.port.rotation.y = Math.atan2(c.x - o.portal.port.position.x, c.z - o.portal.port.position.z); }
  }
  if (Q.sel && T - Q.sel.t < 0.6) { Q.selMesh.visible = true; Q.selMesh.position.copy(local(Q.sel.x, Q.sel.y, 0.008)); Q.selMesh.material.opacity = 0.9 * (1 - (T - Q.sel.t) / 0.6); } else Q.selMesh.visible = false;
  Q.T = T;
}
function turnTo(cur, want, k) { let da = want - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; return cur + da * Math.min(1, k); }

/* ---------- walking and collecting ---------- */
function at3(k, h) { const [x, y] = xy(k); return worldAt(x, y, h ?? 0.03); }
function collectAt(k, fetched) {
  const q = Q, c = q.world.cells[k], it = c.item; if (!it) return;
  c.item = null; const o = q.objs[k]; if (o.item) { o.item.parent.remove(o.item); o.item = null; }
  const p = at3(k); q.moodT = 0.6;
  if (it.k === 'shard') { if (it.bonus) { q.loot.dust += 8; X.floatText(p, '+8 stardust', '#b9f3ff'); } else { q.loot.shards++; X.floatText(p, q.loot.shards >= q.world.need ? 'The way out wakes' : 'Star shard'); } X.burst(p, 12, 'star', { v: 0.06, up: 0.06, size: 0.01 }); X.sfx('shard'); }
  else if (it.k === 'berry') { const n = (it.n || 1) * (q.lits.some(f => f.kinds.includes('bloom')) ? 2 : 1); q.loot.berries[it.el] = (q.loot.berries[it.el] || 0) + n; X.floatText(p, '+' + n + ' ' + BERRY[it.el]); X.sfx('pop'); }
  else if (it.k === 'dew') { const n = q.lits.some(f => f.kinds.includes('tide')) ? 2 : 1; for (const f of q.lits) f.sp = Math.min(f.max, f.sp + n); X.floatText(p, '+' + n + ' spark' + (n > 1 ? 's' : '') + ' each', '#9fefff'); X.sfx('skill'); }
  else if (it.k === 'egg') { q.loot.eggs.push({ hue: it.hue, twin: !!it.twin }); X.floatText(p, it.twin ? 'A twin egg!' : 'An egg!', '#ffc2dc'); X.burst(p, 14, 'star', { v: 0.06, up: 0.06, size: 0.01 }); X.sfx('shard'); }
  else if (it.k === 'chest') { q.loot.dust += it.dust; X.floatText(p, '+' + it.dust + ' stardust'); X.burst(p, 14, 'star', { v: 0.06, up: 0.06, size: 0.01 }); X.sfx('shard'); }
  hudQuest();
}
function walkTo(k) { if (Q.walking) { Q.nextWalk = k; Q.walkTok++; return; } doWalk(k); }
async function doWalk(k) {
  const q = Q, w = q.world, tok = ++q.walkTok, prev = flood(w, q.px, q.py, q); if (!prev.has(k)) return;
  q.walking = true;
  for (const step of pathFrom(prev, k).slice(1)) {
    if (Q !== q || tok !== q.walkTok || q.done) break;
    const [x, y] = xy(step), x0 = q.fx, y0 = q.fy;
    if (!passable(w, x, y, q)) { X.sfx('no'); break; }
    q.yaw = Math.atan2(x - x0, y - y0);
    await X.anim(0.16, u => { q.fx = lerp(x0, x, u); q.fy = lerp(y0, y, u); q.hop = Math.sin(u * Math.PI) * 0.12; });
    if (Q !== q) return;
    q.px = x; q.py = y; q.fx = x; q.fy = y; q.hop = 0; q.trail.unshift(step); if (q.trail.length > 6) q.trail.length = 6; X.sfx('step'); collectAt(step);
    if (w.gate && x === w.gate.x && y === w.gate.y && !q.gateLatched) latchGate('The gate knows you now and stays open.');
    if (x === w.exit.x && y === w.exit.y && tok === q.walkTok) { arriveExit(); break; }
  }
  q.walking = false;
  if (Q === q && q.nextWalk !== null && !q.done && !q.busy) { const n = q.nextWalk; q.nextWalk = null; doWalk(n); } else if (Q === q) q.nextWalk = null;
}
function latchGate(msg) {
  const q = Q, w = q.world; q.gateLatched = true; q.gateOpen = true; const f = q.lits.find(z => z.stationed);
  X.burst(worldAt(w.gate.x, w.gate.y, 0.03), 14, 'star', { v: 0.06, up: 0.05, size: 0.01 });
  if (f) { f.stationed = false; f.x = q.px; f.y = q.py; msg += ' ' + f.l.name + ' hops back.'; }
  X.toast(msg, 3600); hudQuest();
}
async function arriveExit() {
  const q = Q, w = q.world, left = w.need - q.loot.shards;
  if (left > 0) { X.toast('The portal is asleep. ' + left + ' more star shard' + (left > 1 ? 's' : '') + ' to find.'); X.sfx('no'); return; }
  q.done = true; X.sfx('win'); const p = worldAt(q.px, q.py, 0.03); X.burst(p, 30, 'star', { v: 0.1, up: 0.1, size: 0.012, life: 1.2 });
  const spare = q.lits.reduce((n, f) => n + f.sp, 0);
  if (spare) { for (const f of q.lits) if (f.sp) X.burst(f.c.root.getWorldPosition(tmpV()), 4 * f.sp, 'star', { v: 0.05, up: 0.12, g: -0.05, size: 0.008, life: 1.2 }); X.floatText(p, 'Bright finish +' + spare * BRIGHT + ' stardust', '#ffe6a0'); }
  await X.anim(0.9, u => { q.hop = Math.abs(Math.sin(u * Math.PI * 3)) * 0.3; }); if (Q === q) finishQuest(true);
}

/* ---------- sending littles ---------- */
async function littleTravel(f, keys, sp) { for (const k of keys) { const [x, y] = xy(k), x0 = f.x, y0 = f.y; if (Math.hypot(x - x0, y - y0) > 1.5) { await littleFly(f, x, y); continue; } if (x !== x0 || y !== y0) f.yaw = Math.atan2(x - x0, y - y0); await X.anim(sp || 0.09, u => { f.x = lerp(x0, x, u); f.y = lerp(y0, y, u); f.lift = Math.sin(u * Math.PI) * TS * 0.15; }); } }
async function littleFly(f, x, y) { const x0 = f.x, y0 = f.y, d = Math.hypot(x - x0, y - y0); f.yaw = Math.atan2(x - x0, y - y0); await X.anim(0.2 + d * 0.08, u => { const e = ease(u); f.x = lerp(x0, x, e); f.y = lerp(y0, y, e); f.lift = Math.sin(u * Math.PI) * TS * 0.9; }); }
function beginAct(f) { Q.busy = true; Q.walkTok++; Q.nextWalk = null; Q.acted = true; f.busy = true; }
function endAct(f) { f.busy = false; f.lift = 0; if (Q) { Q.busy = false; hudQuest(); } }
async function lunge(f, nk, x, y) { const [nx, ny] = xy(nk); f.yaw = Math.atan2(x - nx, y - ny); await X.anim(0.24, u => { const s = Math.sin(u * Math.PI); f.x = nx + (x - nx) * 0.5 * s; f.y = ny + (y - ny) * 0.5 * s; f.lift = s * TS * 0.2; }); }
const FX = { bramble: 0xff7a3a, water: 0x9fe8ff, boulder: 0xc8b8ff, chasm: 0x8fe07a, storm: 0xdff0ff, shadow: 0xffe27a, fog: 0xffffff, ruin: 0x9fe07a, crystal: 0xff9ad8 };
function clearFx(k, label) {
  const q = Q, c = q.world.cells[k], o = q.objs[k], p = at3(k, 0.02);
  X.burst(p, 18, c.ob === 'shadow' || c.ob === 'water' ? 'star' : 'dot', { v: 0.08, up: 0.06, size: 0.008, color: FX[c.ob] || 0xffffff }); X.sfx('skill');
  c.cleared = true; if (o.ob) { const m = o.ob; X.anim(0.35, u => m.scale.setScalar(Math.max(0.001, 1 - u))).then(() => m.parent && m.parent.remove(m)); o.ob = null; }
  X.floatText(p, label);
}
async function sendClear(f, k) {
  const q = Q, w = q.world, [x, y] = xy(k), c = w.cells[k], prev = flood(w, q.px, q.py, q), near = nearIn(w, prev, x, y); if (near < 0) return;
  beginAct(f); const path = pathFrom(prev, near); await littleTravel(f, path); await lunge(f, near, x, y); if (Q !== q) return;
  clearFx(k, KINDS[OBST[c.ob].by].verb + '!'); f.sp--; f.acts++; hudQuest();
  await X.wait(0.2); await littleTravel(f, path.slice().reverse()); endAct(f);
}
async function sendPair(fs, k) {
  const q = Q, w = q.world, [x, y] = xy(k), c = w.cells[k], prev = flood(w, q.px, q.py, q), near = nearIn(w, prev, x, y); if (near < 0) return;
  const O = OBST[c.ob], path = pathFrom(prev, near); fs.forEach(f => beginAct(f));
  await Promise.all(fs.map((f, i) => (async () => { await X.wait(i * 0.12); await littleTravel(f, path); })()));
  await Promise.all(fs.map(f => lunge(f, near, x, y))); if (Q !== q) return;
  clearFx(k, O.skill + '!'); const cost = fs.length > 1 ? 1 : 2; fs.forEach(f => { f.sp -= cost; f.acts += 2; }); hudQuest();
  await X.wait(0.2); await Promise.all(fs.map(f => littleTravel(f, path.slice().reverse()))); fs.forEach(f => { f.busy = false; f.lift = 0; }); endAct(fs[0]);
}
async function sendFight(f, k) {
  const q = Q, w = q.world, [x, y] = xy(k), c = w.cells[k], prev = flood(w, q.px, q.py, q), near = nearIn(w, prev, x, y); if (near < 0) return;
  const e = c.enemy; if (!e || scared(e, f.l.kind)) return;
  const cost = fightCost(e, f.kinds, false), o = q.objs[k];
  beginAct(f); const path = pathFrom(prev, near); await littleTravel(f, path);
  for (let i = 0; i < 3; i++) { await lunge(f, near, x, y); if (Q !== q) return; o.shake = true; X.sfx('hit'); X.burst(at3(k, 0.02), 5, 'dot', { v: 0.05, up: 0.04, size: 0.006 }); setTimeout(() => { o.shake = false; }, 160); }
  f.sp -= cost; f.acts += 2;
  const p = at3(k, 0.025), G = GLOOMS[e.g]; c.enemy = null; q.loot.dust += 3;
  if (o.enemy) { const m = o.enemy; X.anim(0.4, u => { m.scale.setScalar(Math.max(0.001, 1 + u * 0.5 - u * 1.5)); m.position.y = 0.006 + u * 0.02; }).then(() => m.parent && m.parent.remove(m)); o.enemy = null; }
  X.burst(p, 24, 'dot', { v: 0.1, up: 0.08, size: 0.008, color: new X.THREE.Color().setHSL(G.hue / 360, 0.7, 0.6) }); X.floatText(p, 'Poof! +3 stardust'); X.sfx('skill');
  hudQuest(); await X.wait(0.2); await littleTravel(f, path.slice().reverse()); endAct(f);
}
async function sendFetch(f, k, fly) {
  const q = Q, w = q.world, [x, y] = xy(k);
  beginAct(f);
  if (fly) { await littleFly(f, x, y); if (Q !== q) return; collectAt(k, true); f.sp--; f.acts++; hudQuest(); await X.wait(0.12); await littleFly(f, q.px, q.py); }
  else { const prev = flood(w, q.px, q.py, q); if (!prev.has(k)) { endAct(f); return; } const path = pathFrom(prev, k); await littleTravel(f, path, 0.07); if (Q !== q) return; collectAt(k, true); await X.wait(0.08); await littleTravel(f, path.slice().reverse(), 0.07); }
  endAct(f);
}
async function sendStation(f) {
  const q = Q, w = q.world, pk = key(w.plate.x, w.plate.y), prev = flood(w, q.px, q.py, q); if (!prev.has(pk)) return;
  beginAct(f); await littleTravel(f, pathFrom(prev, pk)); if (Q !== q) return;
  f.stationed = true; q.gateOpen = true; X.sfx('gate'); X.burst(worldAt(w.gate.x, w.gate.y, 0.03), 18, 'star', { v: 0.06, up: 0.06, size: 0.01 });
  X.toast('The moon gate stays open while ' + f.l.name + ' holds the plate.', 3600); endAct(f);
}
function recall(f) {
  const q = Q; if (q.busy || !f.stationed) return;
  f.stationed = false; q.gateOpen = q.gateLatched; f.x = q.px; f.y = q.py; q.walkTok++; q.nextWalk = null;
  X.sfx('pop'); X.toast(f.l.name + ' pops back to your side. The gate closes.'); hudQuest();
}
function rally() {
  if (!Q || Q.busy || Q.done) return;
  if (!Q.rally) { X.toast(Q.full ? 'Already rallied on this quest.' : 'Rally needs a Belly of 60 or more when you set out.'); X.sfx('no'); return; }
  Q.rally = false; Q.full = true; for (const f of Q.lits) f.sp = Math.min(f.max, f.sp + 1);
  X.burst(Q.pet.root.getWorldPosition(tmpV()).add(new X.THREE.Vector3(0, 0.03, 0)), 12, 'heart', { v: 0.06, up: 0.06, size: 0.01 }); X.sfx('grow');
  X.toast(X.S.pet.name + ' rallies the littles. One spark each.'); hudQuest();
}
function askHome() {
  if (!Q || Q.done) return;
  X.openSheet('<h2>Head home?</h2><p>You keep everything you found, but only half the stardust.</p><div class="btns"><button class="ghost" data-do="stay">Stay</button><button data-do="go">Head home</button></div>', { stay: X.closeSheet, go: () => { X.closeSheet(); finishQuest(false); } });
}

/* ---------- tapping the board ---------- */
export function questTap(sx, sy) {
  const q = Q; if (!q || q.done) return;
  if (X.sheetOpen()) X.closeSheet();
  const h = X.rayAt(sx, sy).intersectObject(q.pick, false)[0]; if (!h) return;
  const lp = q.board.worldToLocal(h.point.clone()), w = q.world;
  const x = Math.round(lp.x / TS + (w.W - 1) / 2), y = Math.round(lp.z / TS + (w.H - 1) / 2); if (x < 0 || y < 0 || x >= w.W || y >= w.H) return;
  tapCell(x, y);
}
function tapCell(x, y) {
  const q = Q, w = q.world; if (q.busy) { X.toast('Wait a moment: a little is busy.'); return; }
  const k = key(x, y), c = w.cells[k], prev = flood(w, q.px, q.py, q); q.sel = { x, y, t: q.T || 0 };
  if (w.plate && w.plate.x === x && w.plate.y === y) return openPlate(prev);
  if (c.enemy) return openTarget(k, 'enemy', prev);
  if (c.t === 'ob' && !c.cleared) return openTarget(k, 'ob', prev);
  if (c.t === 'gate' && !q.gateOpen) { X.openSheet('<h2>Moon gate</h2><p>Sealed. Somewhere in this world lies a moon plate. The gate opens while a little sits on it, and once you walk through, it stays open.</p><div class="btns"><button data-do="x">OK</button></div>', { x: X.closeSheet }); return; }
  if (c.t === 'islet') { if (c.item) openTarget(k, 'fetch', prev); return; }
  if (prev.has(k)) {
    if (c.item && !(x === q.px && y === q.py)) { const free = q.lits.filter(f => !f.stationed && !f.busy); if (free.length) { q.fetchN = (q.fetchN || 0) + 1; return sendFetch(free[q.fetchN % free.length], k, false); } }
    return walkTo(k);
  }
  if (c.item) return openTarget(k, 'fetch', prev);
  if (c.t !== 'wall') { X.toast('No way through yet.'); X.sfx('no'); }
}
const pips = f => '●'.repeat(Math.max(0, f.sp)) + '○'.repeat(Math.max(0, f.max - f.sp));
function row(i, label, cost, why) { const f = Q.lits[i]; return '<button class="row lit-row" data-do="send" data-arg="' + i + '"' + (why ? ' disabled' : '') + ' style="--h:' + Math.round(f.L.hue) + '"><b>' + X.esc(f.l.name) + ' <small>' + pips(f) + '</small></b><small>' + (why || label + (cost ? ', ' + cost + ' spark' + (cost > 1 ? 's' : '') : '')) + '</small></button>'; }
function openTarget(k, type, prev) {
  const q = Q, w = q.world, [x, y] = xy(k), c = w.cells[k], reach = nearIn(w, prev, x, y) >= 0, free = f => f.stationed ? 'Holding the moon plate' : f.busy ? 'Busy' : null;
  if (type === 'enemy') {
    const e = c.enemy, G = GLOOMS[e.g];
    const rows = q.lits.map((f, i) => { const cost = fightCost(e, f.kinds, false); return row(i, 'Chase it off', cost, free(f) || (scared(e, f.l.kind) ? 'Too scared to go near it' : !reach ? 'Out of reach for now' : f.sp < cost ? 'Not enough sparks' : null)); }).join('');
    X.openSheet('<h2>' + G.name + '</h2><p>It blocks the way. Weak to ' + KINDS[G.weak].label + ' littles, which chase it off for a spark less, and Ember littles are fierce. It scares ' + KINDS[G.scares].label + ' littles.</p>' + rows + '<div class="btns"><button class="ghost" data-do="x">Not now</button></div>', { x: X.closeSheet, send: i => { X.closeSheet(); sendFight(q.lits[+i], k); } });
  } else if (type === 'ob') {
    const O = OBST[c.ob];
    if (O.pair) {
      const [A, B] = O.pair, opts = [];
      q.lits.forEach((f, i) => { if (!free(f) && f.kinds.includes(A) && f.kinds.includes(B) && f.sp >= 2) opts.push({ ids: [i], label: f.l.name + ' alone, 2 sparks' }); });
      q.lits.forEach((a, i) => q.lits.forEach((b, j) => { if (i < j && !free(a) && !free(b) && a.sp >= 1 && b.sp >= 1 && ((a.kinds.includes(A) && b.kinds.includes(B)) || (a.kinds.includes(B) && b.kinds.includes(A)))) opts.push({ ids: [i, j], label: a.l.name + ' and ' + b.l.name + ', 1 spark each' }); }));
      const rows = opts.slice(0, 4).map((o, n) => '<button class="row" data-do="pair" data-arg="' + n + '"' + (reach ? '' : ' disabled') + '><b>' + X.esc(o.label) + '</b><small>' + (reach ? O.skill : 'Out of reach for now') + '</small></button>').join('') || '<p>' + 'It takes a ' + KINDS[A].label + ' little and a ' + KINDS[B].label + ' little together, or a twin with both, and nobody here can.</p>';
      X.openSheet('<h2>' + O.name + '</h2><p>' + X.esc(O.text) + '</p>' + rows + '<div class="btns"><button class="ghost" data-do="x">Not now</button></div>', { x: X.closeSheet, pair: n => { X.closeSheet(); sendPair(opts[+n].ids.map(i => q.lits[i]), k); } });
    } else {
      const rows = q.lits.map((f, i) => row(i, KINDS[O.by].verb, 1, free(f) || (!f.kinds.includes(O.by) ? 'Cannot: it takes a ' + KINDS[O.by].label + ' little' : !reach ? 'Out of reach for now' : f.sp < 1 ? 'No sparks left' : null))).join('');
      X.openSheet('<h2>' + O.name + '</h2><p>' + X.esc(O.text) + '</p>' + rows + '<div class="btns"><button class="ghost" data-do="x">Not now</button></div>', { x: X.closeSheet, send: i => { X.closeSheet(); sendClear(q.lits[+i], k); } });
    }
  } else {
    const rows = q.lits.map((f, i) => row(i, 'Fly to fetch it', 1, free(f) || (!f.fly ? 'Only a flier can reach it' : f.sp < 1 ? 'No sparks left' : null))).join('');
    X.openSheet('<h2>Out of reach</h2><p>A Gale little flies to fetch anything in sight.</p>' + rows + '<div class="btns"><button class="ghost" data-do="x">Not now</button></div>', { x: X.closeSheet, send: i => { X.closeSheet(); sendFetch(q.lits[+i], k, true); } });
  }
}
function openPlate(prev) {
  const q = Q, w = q.world, held = q.lits.find(f => f.stationed);
  if (q.gateLatched) { X.toast('The gate stays open now.'); return; }
  if (held) { X.openSheet('<h2>Moon plate</h2><p>' + X.esc(held.l.name) + ' is holding the gate open.</p><div class="btns"><button data-do="back">Call ' + X.esc(held.l.name) + ' back</button><button class="ghost" data-do="x">Leave it there</button></div>', { x: X.closeSheet, back: () => { X.closeSheet(); recall(held); } }); return; }
  const reach = prev.has(key(w.plate.x, w.plate.y));
  const rows = q.lits.map((f, i) => row(i, 'Sit on the plate', 0, f.busy ? 'Busy' : !reach ? 'Out of reach for now' : null)).join('');
  X.openSheet('<h2>Moon plate</h2><p>While a little sits here, the moon gate stays open. Walk through it and it stays open for good.</p>' + rows + '<div class="btns"><button class="ghost" data-do="x">Not now</button></div>', { x: X.closeSheet, send: i => { X.closeSheet(); sendStation(q.lits[+i]); } });
}
function openChip(f) {
  if (!f) return;
  X.openSheet('<h2>' + X.esc(f.l.name) + '</h2><p>' + X.esc(X.littleLine(f.l)) + ' ' + f.sp + ' of ' + f.max + ' sparks left on this quest.</p><div class="btns">' + (f.stationed ? '<button data-do="back">Call it back</button>' : '') + '<button class="ghost" data-do="x">OK</button></div>', { x: X.closeSheet, back: () => { X.closeSheet(); recall(f); } });
}

/* ---------- coming home ---------- */
function finishQuest(success) {
  const q = Q, S = X.S, p = S.pet, lines = [];
  let dust = q.loot.dust + q.loot.shards * 3 + (success ? 15 : 0); if (!success) dust = Math.floor(dust / 2);
  const bright = success ? q.lits.reduce((n, f) => n + f.sp, 0) : 0; if (bright) { dust += bright * BRIGHT; lines.push('Bright finish: ' + bright + (bright > 1 ? ' sparks' : ' spark') + ' left over, worth ' + bright * BRIGHT + ' stardust.'); }
  for (const k in q.loot.berries) S.pantry[k] = (S.pantry[k] || 0) + q.loot.berries[k];
  if (success && q.full) { S.pantry[q.B.el] = (S.pantry[q.B.el] || 0) + 1; q.loot.berries[q.B.el] = (q.loot.berries[q.B.el] || 0) + 1; lines.push('Full belly: ' + p.name + ' found one more ' + BERRY[q.B.el] + ' on the way home.'); }
  let eggs = 0; for (const e of q.loot.eggs) { if (S.littles.length + S.eggs.length < X.NEST_ROOM) { S.eggs.push({ hue: e.hue, seed: (Math.random() * 2147483646) | 0, warm: 0, twin: e.twin }); eggs++; } else { dust += 12; lines.push('The nest is full, so an egg turned into 12 stardust.'); } }
  if (eggs) lines.push(eggs > 1 ? eggs + ' eggs are waiting in the nest. Rub them warm to hatch them.' : 'An egg is waiting in the nest. Rub it warm to hatch it.');
  for (const f of q.lits) { const b = littleLevel(f.l.xp || 0), m0 = maxSparks(f.l); f.l.xp = (f.l.xp || 0) + (success ? 3 : 1) + f.acts; const a = littleLevel(f.l.xp); if (a > b) lines.push(f.l.name + ' reached level ' + a + (maxSparks(f.l) > m0 ? ' and now carries one more spark.' : '.') + (b < GROWN_AT && a >= GROWN_AT ? ' ' + f.l.name + ' is all grown up.' : '')); }
  if (success) { S.quests++; p.joy = clamp(p.joy + 12, 0, 100); } p.belly = clamp(p.belly - 10, 0, 100);
  S.dust += dust; X.rollPortals(true);
  const name = q.world.name; X.world.remove(q.board); Q = null;
  const up = X.gainXp(dust); if (up) lines.unshift(up); else X.rebuild();
  X.save(); X.hud(); X.done();
  const berries = Object.entries(q.loot.berries).map(([k, n]) => n + ' ' + BERRY[k]).join(', ');
  X.openSheet('<h2>' + (success ? 'Through the portal' : 'Home again') + '</h2><p>' + (success ? X.esc(name) + ' folds shut behind you. ' : 'You slip back the way you came. ') + X.esc(p.name) + ' is ' + (success ? 'delighted.' : 'glad to be home.') + '</p><ul class="loot"><li><b>' + dust + '</b> stardust</li>' + (berries ? '<li>' + X.esc(berries) + '</li>' : '') + (q.loot.eggs.length ? '<li>' + q.loot.eggs.length + ' egg' + (q.loot.eggs.length > 1 ? 's' : '') + '</li>' : '') + '</ul>' + lines.map(l => '<p>' + X.esc(l) + '</p>').join('') + '<div class="btns"><button data-do="x">Back to the nest</button></div>', { x: X.closeSheet });
}

/* For the browser test. */
export function questDebug(toScreen) {
  return Q && {
    Q, w: Q.world, tap: (x, y) => tapCell(x, y),
    screen: (x, y) => toScreen(worldAt(x, y, 0.006)),
    reach: () => flood(Q.world, Q.px, Q.py, Q), near: (prev, x, y) => nearIn(Q.world, prev, x, y)
  };
}
