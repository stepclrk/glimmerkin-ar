/* Rules and looks taken from the Glimmerkin game (github.com/stepclrk/glimmerkin), so the creature here is the
   same creature. Copied, not changed: RNG and mulberry, EL_HUE, KINDS hues, makeName, petLevel, stageOf, petLook
   (without costumes and crowns), cornersOf, shapeOf, PET_TRICKS, LEARN_AT, localDay and the favourite spot.
   Source files: src/core.js, src/draw.js, src/play.js, src/things.js, src/game.js. */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D2R = Math.PI / 180;

function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function RNG(seed) {
  const f = mulberry(seed >>> 0);
  return {
    f,
    int: (a, b) => a + Math.floor(f() * (b - a + 1)),
    pick: arr => arr[Math.floor(f() * arr.length)],
    chance: p => f() < p,
    shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  };
}

export const EL_HUE = { ember: 14, tide: 200, stone: 262, bloom: 118, gale: 170, glow: 48 };
export const BERRY = { ember: 'Emberberry', tide: 'Tideplum', stone: 'Pebblenut', bloom: 'Mossfig', gale: 'Cloudpuff', glow: 'Glowdrop' };
export const FORMS = { ember: 'Sunflare', tide: 'Tidecaller', stone: 'Cairnheart', bloom: 'Wildcrown', gale: 'Skydancer', glow: 'Starlantern' };
export const STAGES = ['Hatchling', 'Fledgling', 'Wanderer', 'Mythic'];

export function makeName(r) {
  const a = ['Pip', 'Mo', 'Lu', 'Zu', 'Ki', 'No', 'Bri', 'Fen', 'Ta', 'Wob', 'Nim', 'Ol', 'Dab', 'Tiz', 'Um', 'Puk', 'Ro', 'Vee', 'Yum', 'Sno', 'Qui', 'Bo', 'Em', 'Fi'];
  const b = ['bo', 'mi', 'lu', 'zu', 'ki', 'no', 'ble', 'fen', 'ta', 'wick', 'nim', 'lo', 'dab', 'tiz', 'puk', 'ro', 'vee', 'kin', 'pet', 'sy', 'dle', 'ra', 'bit', 'moss'];
  return r.pick(a) + r.pick(b);
}
export function petLevel(xp) { let L = 1; while (xp >= 7.5 * L * (L + 1) + 5 * L) L++; return L; }
export function stageOf(L) { return L >= 10 ? 3 : L >= 6 ? 2 : L >= 3 ? 1 : 0; }

function formLook(f) {
  const base = { form: f, antlers: false, wings: false };
  if (f === 'tide') base.ears = 'fin';
  if (f === 'stone') { base.ears = 'horn'; base.bw = 1.08; }
  if (f === 'gale') { base.ears = 'long'; base.float = 0.12; }
  if (f === 'glow') base.ears = 'antenna';
  return base;
}
/* The Glimmerkin's look, exactly as the game works it out from its seed, bond, diet, marks and form. */
export function petLook(pet) {
  const stage = stageOf(petLevel(pet.xp || 0)), r = RNG(pet.seed), base = pet.hue0 !== undefined ? pet.hue0 : 285 + r.f() * 45;
  let sx = Math.cos(base * D2R) * 2.5, sy = Math.sin(base * D2R) * 2.5;
  const diet = Object.entries(pet.diet || {}).filter(e => e[1] > 0.05).sort((a, b) => b[1] - a[1]);
  for (const [el, v] of diet) { sx += Math.cos(EL_HUE[el] * D2R) * v; sy += Math.sin(EL_HUE[el] * D2R) * v; }
  const feats = diet.filter(e => e[1] >= 1.4).slice(0, stage >= 2 ? 2 : 1).map(e => e[0]);
  return {
    kind: 'kin', hue: (Math.atan2(sy, sx) / D2R + 360) % 360, sat: 72, bw: 1.0, bh: 0.92, top: 0.62,
    ears: ['round', 'point', 'point', 'long'][stage], tail: ['none', 'puff', 'curl', 'curl'][stage], pattern: stage >= 1 ? 'spots' : 'none',
    eyeS: 1.12, cheek: true, phase: 0.5, float: 0, feats, stage, gem: stage >= 2, antlers: stage >= 3, wings: stage >= 3, marks: pet.marks || [],
    ...(stage >= 3 && pet.form ? formLook(pet.form) : {})
  };
}

/* ---------- tricks (src/play.js) ---------- */
export const PET_TRICKS = {
  spin: { name: 'spin', does: 'spins round', tries: 'tries to spin', shape: 'a circle' },
  wiggle: { name: 'wiggle', does: 'wiggles', tries: 'tries to wiggle', shape: 'a zigzag' },
  leap: { name: 'leap', does: 'leaps high', tries: 'tries to leap', shape: 'a swipe up' },
  bow: { name: 'bow', does: 'takes a bow', tries: 'tries to bow', shape: 'a swipe down' },
  kiss: { name: 'blow a kiss', does: 'blows you a kiss', tries: 'tries to blow a kiss', shape: 'a heart' },
  roll: { name: 'roll over', does: 'rolls over', tries: 'tries to roll over', shape: 'a swipe across' },
  chase: { name: 'chase its tail', does: 'chases its tail', tries: 'tries to chase its tail', shape: 'a spiral' },
  pose: { name: 'strike a pose', does: 'strikes a pose', tries: 'tries to strike a pose', shape: 'a star' }
};
export const LEARN_AT = 5, PET_TRICK_TIME = 1.3;

export function cornersOf(path) {
  const pts = [path[0]];
  for (let i = 1; i < path.length; i++) { const b = path[i]; let a = pts[pts.length - 1], d = Math.hypot(b.x - a.x, b.y - a.y); while (d >= 10) { const u = 10 / d; a = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; pts.push(a); d = Math.hypot(b.x - a.x, b.y - a.y); } }
  const hd = []; for (let i = 1; i < pts.length; i++) hd.push(Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x));
  const out = []; for (let i = 1; i + 1 < hd.length; i++) { let da = hd[i + 1] - hd[i - 1]; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; if (Math.abs(da) > 1.5) { out.push(pts[i]); i += 2; } }
  return out;
}
/* What shape a finger drew: a circle, a heart, a star, a spiral, a zigzag, or a swipe up, down or across. */
export function shapeOf(path) {
  if (!path || path.length < 4) return null;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, len = 0, turn = 0, flips = 0, dir = 0, ext = path[0].x;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    if (!i) continue; const q = path[i - 1]; len += Math.hypot(p.x - q.x, p.y - q.y);
    if (i > 1) { const o = path[i - 2], a1 = Math.atan2(q.y - o.y, q.x - o.x), a2 = Math.atan2(p.y - q.y, p.x - q.x); let da = a2 - a1; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; if (Math.hypot(p.x - q.x, p.y - q.y) > 1 && Math.hypot(q.x - o.x, q.y - o.y) > 1) turn += da; }
    if (!dir) { if (Math.abs(p.x - ext) > 14) { dir = Math.sign(p.x - ext); ext = p.x; } }
    else if ((p.x - ext) * dir > 0) ext = p.x; else if (Math.abs(p.x - ext) > 14) { flips++; dir = -dir; ext = p.x; }
  }
  const w = x1 - x0, h = y1 - y0, a = path[0], b = path[path.length - 1], ddx = b.x - a.x, ddy = b.y - a.y;
  const closed = w > 40 && h > 40 && Math.hypot(ddx, ddy) < Math.max(w, h) * 0.6;
  if (Math.abs(turn) > Math.PI * 3.3 && w > 40 && h > 40) return 'chase';
  if (closed) {
    const cs = cornersOf(path);
    if (cs.length >= 4) return 'pose';
    if (cs.some(q => q.y > y1 - h * 0.3 && Math.abs(q.x - (x0 + x1) / 2) < w * 0.3)) return 'kiss';
    if (Math.abs(turn) > Math.PI * 1.5) return 'spin';
  }
  if (flips >= 3 && w > 50) return 'wiggle';
  if (Math.abs(ddy) > 70 && Math.abs(ddx) < Math.abs(ddy) * 0.6 && len < Math.abs(ddy) * 1.6) return ddy < 0 ? 'leap' : 'bow';
  if (Math.abs(ddx) > 70 && Math.abs(ddy) < Math.abs(ddx) * 0.6 && len < Math.abs(ddx) * 1.6) return 'roll';
  return null;
}

/* ---------- the favourite spot (src/play.js) ---------- */
export const SPOTS = { head: 'the top of its head', left: 'the cheek on the left', right: 'the cheek on the right', tummy: 'its tummy' };
export function localDay() { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
export function favSpot(seed) { const r = RNG(localDay() * 7 + 13 + (seed % 100000)); return r.pick(Object.keys(SPOTS)); }

/* ---------- a save code from the game's "Keep a copy" (src/game.js saveCode) ---------- */
export function readSaveCode(code) {
  code = String(code || '').trim();
  if (!code.startsWith('GLIM1.')) throw new Error('That is not a Glimmerkin save code. It starts with GLIM1.');
  let S;
  try { S = JSON.parse(decodeURIComponent(escape(atob(code.slice(6).replace(/\s+/g, ''))))); }
  catch (e) { throw new Error('That code could not be read. Copy it again from Keep a copy in the game.'); }
  if (!S || !S.pet || typeof S.pet.seed !== 'number') throw new Error('That code has no Glimmerkin in it.');
  return S;
}
export function newPet() {
  const seed = (Math.random() * 2147483646) | 0, r = RNG(seed);
  return { name: makeName(r), seed, xp: 0, belly: 62, joy: 55, diet: {}, marks: [], tricks: {} };
}
