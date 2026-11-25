/* Rules and looks taken from the Glimmerkin game (github.com/stepclrk/glimmerkin), so the creatures here are the same
   creatures. src/core.js is the game's own file, copied unchanged and loaded first as a plain script, so its names
   (RNG, KINDS, BIOMES, genWorld, flood and the rest) are globals here. This file adds what lives in the game's other
   files: lookFor and petLook (src/draw.js, without costumes and crowns), the trick recogniser and the favourite spot
   (src/play.js), localDay (src/things.js), newLittle and the save code (src/game.js), gainXp's arithmetic
   (src/home.js) and the little tricks. */
/* global RNG, KINDS, EL_HUE, ELS, makeName, petLevel, stageOf, maxSparks */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D2R = Math.PI / 180;

/* ---------- looks (src/draw.js) ---------- */
const EAR_SETS = { ember: ['point', 'horn', 'point'], tide: ['fin', 'antenna', 'round'], stone: ['round', 'horn', 'round'], bloom: ['long', 'round', 'point'], gale: ['antenna', 'long', 'antenna'], glow: ['antenna', 'round', 'long'] };
export function lookFor(kind, seed, kind2) {
  const r = RNG(seed), K = KINDS[kind];
  const L = {
    kind, hue: K.hue[0] + r.f() * (K.hue[1] - K.hue[0]), sat: kind === 'stone' ? 36 : kind === 'gale' ? 56 : 76,
    bw: 0.84 + r.f() * 0.3, bh: 0.8 + r.f() * 0.26, top: 0.5 + r.f() * 0.35,
    ears: r.pick(EAR_SETS[kind]), tail: r.pick(['puff', 'curl', 'none', 'puff']), pattern: r.pick(['spots', 'stripes', 'none', 'spots']),
    eyeS: 0.92 + r.f() * 0.3, cheek: r.chance(0.75), phase: r.f() * TAU,
    float: kind === 'gale' ? 0.26 : kind === 'glow' ? 0.13 : 0, feats: [kind]
  };
  if (kind2) { L.feats = [kind, kind2]; L.hue2 = (KINDS[kind2].hue[0] + KINDS[kind2].hue[1]) / 2; L.pattern = 'spots'; L.twin = true; L.float = Math.max(L.float, kind2 === 'gale' ? 0.26 : kind2 === 'glow' ? 0.13 : 0); }
  return L;
}
export const GROWN_AT = 6;
export function lookOf(l) { const L = lookFor(l.kind, l.seed, l.kind2); if (littleLevel(l.xp || 0) >= GROWN_AT) L.grown = true; if (l.mark) L.marks = [l.mark]; return L; }
export function littleLevel(xp) { let L = 1; while (xp >= 3 * L * (L + 1)) L++; return L; }
export const kindsOf = l => l.kind2 ? [l.kind, l.kind2] : [l.kind];
function formLook(f) {
  const base = { form: f, antlers: false, wings: false };
  if (f === 'tide') base.ears = 'fin';
  if (f === 'stone') { base.ears = 'horn'; base.bw = 1.08; }
  if (f === 'gale') { base.ears = 'long'; base.float = 0.12; }
  if (f === 'glow') base.ears = 'antenna';
  return base;
}
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
/* Each kind of little has a trick of its own, which it does when the Glimmerkin does a learned one. */
export const LITTLE_TRICK = { ember: 'leap', tide: 'spin', stone: 'bow', bloom: 'wiggle', gale: 'roll', glow: 'pose' };
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

/* ---------- a new game, and a save code from the game's "Keep a copy" (src/game.js) ---------- */
export function newLittle(kind, r, kind2) { const l = { id: 'l' + Math.floor(r.f() * 1e9).toString(36) + Date.now().toString(36).slice(-3), kind, name: makeName(r), seed: r.int(1, 2147483646), xp: 0 }; if (kind2) l.kind2 = kind2; return l; }
export function newGame() {
  const seed = (Math.random() * 2147483646) | 0, r = RNG(seed), kinds = r.shuffle(Object.keys(KINDS).slice()).slice(0, 2);
  const pantry = {}; for (let i = 0; i < 4; i++) { const el = r.pick(ELS); pantry[el] = (pantry[el] || 0) + 1; }
  return { v: 1, pet: { name: makeName(r), seed, xp: 0, belly: 62, joy: 55, rest: 100, asleep: false, diet: {}, ate: {}, marks: [], tricks: {}, visits: {} }, littles: kinds.map(k => newLittle(k, r)), eggs: [], pantry, quests: 0, dust: 0, portals: null, party: [], j: {} };
}
export function readSaveCode(code) {
  code = String(code || '').trim();
  if (!code.startsWith('GLIM1.')) throw new Error('That is not a Glimmerkin save code. It starts with GLIM1.');
  let S;
  try { S = JSON.parse(decodeURIComponent(escape(atob(code.slice(6).replace(/\s+/g, ''))))); }
  catch (e) { throw new Error('That code could not be read. Copy it again from Keep a copy in the game.'); }
  if (!S || !S.pet || typeof S.pet.seed !== 'number') throw new Error('That code has no Glimmerkin in it.');
  return S;
}
/* What comes across from the game's save: the creature, its littles, eggs, pantry, quest count and stardust. */
export function fromGame(G) {
  const p = G.pet, S = newGame();
  S.pet = { name: p.name, seed: p.seed, xp: p.xp || 0, belly: p.belly ?? 62, joy: p.joy ?? 55, rest: p.rest ?? 100, asleep: false, diet: p.diet || {}, ate: p.ate || {}, marks: p.marks || [], form: p.form || null, tricks: Object.assign({}, p.tricks || {}), visits: p.visits || {}, ...(p.hue0 !== undefined ? { hue0: p.hue0 } : {}) };
  if (Array.isArray(G.littles) && G.littles.length) S.littles = G.littles.filter(l => l && KINDS[l.kind]).map(l => ({ id: l.id, kind: l.kind, ...(l.kind2 ? { kind2: l.kind2 } : {}), name: l.name, seed: l.seed, xp: l.xp || 0 }));
  S.eggs = (G.eggs || []).map(e => ({ hue: e.hue || 0, seed: e.seed || ((Math.random() * 2147483646) | 0), warm: 0, twin: !!e.twin }));
  S.pantry = {}; for (const el of ELS) if (G.pantry && G.pantry[el] > 0) S.pantry[el] = G.pantry[el];
  S.quests = G.quests || 0; S.dust = G.dust || 0; S.j = { catchBest: (G.j && G.j.catchBest) || 0 };
  return S;
}

