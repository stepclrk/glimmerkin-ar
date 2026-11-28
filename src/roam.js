/* The Glimmerkin out in the room: walking across a surface, hopping between surfaces (table to floor, floor to sofa),
   clinging to a wall, or vanishing in sparkles when somewhere is too far to hop. A little brain picks where to go
   when it is left alone. Positions are in the nest's frame (the `world` group), as in src/room.js.
   main.js calls move() every frame in the nest; the rest is called from the HUD, the berry and the games. */
import * as THREE from 'three';

let X = null;
const M = { plan: [], step: null, surf: null, lastShift: null, cling: null, brainT: 6, on: false, face: null, moodT: 0, said: 0 };
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];

export function initRoam(ctx) { X = ctx; }
export const roam = M;

/* ---------- where things are ---------- */
const room = () => X.room;
function camLocal() { X.camPose(); return X.world.worldToLocal(X.camPos.clone()); }
function camFwdLocal() { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(X.camQ); f.applyAxisAngle(new THREE.Vector3(0, 1, 0), -X.world.rotation.y); f.y = 0; return f.lengthSq() > 1e-6 ? f.normalize() : new THREE.Vector3(0, 0, -1); }
export function surfNow() { return room().byId(M.surf) || room().on(X.A.off) || null; }
export function busy() { return !!(M.step || M.plan.length); }
export function away() { return M.cling || Math.abs(X.A.off.y) > 0.03 || Math.hypot(X.A.off.x, X.A.off.z) > 0.32; }

/* ---------- plans ---------- */
export function stop() { M.plan = []; M.step = null; }
/* Straight to the nest's centre, at once (before a quest, or when the room is forgotten). */
export function home() { stop(); M.cling = null; X.A.off.set(0, 0, 0); const n = room().surfs.find(s => s.kind === 'nest'); M.surf = n ? n.id : null; M.lastShift = null; if (X.C()) X.C().shadow.visible = true; }

/* Go to a point on a surface: walk, hop across (through the floor if need be), or vanish and reappear. */
export function goTo(s, p, o) {
  o = o || {}; const R = room(); stop(); const steps = [];
  if (M.cling) { const back = R.byId(M.cling.from) || nearestSurf(X.A.off); if (back) { const c = nearestCell(back, X.A.off); steps.push({ k: 'hop', to: c, s: back.id }); } else steps.push({ k: 'poof', to: p.clone(), s: s.id }); }
  const cur = M.cling ? (R.byId(M.cling.from) || nearestSurf(X.A.off)) : surfNow();
  if (!cur) steps.push({ k: 'poof', to: p.clone(), s: s.id });
  else if (cur === s) steps.push({ k: 'walk', to: p.clone() });
  else {
    const route = routeTo(cur, s);
    if (!route) steps.push({ k: 'poof', to: p.clone(), s: s.id });
    else { for (const b of route) { steps.push({ k: 'walk', to: b.from }); steps.push({ k: 'hop', to: b.to, s: b.s }); } steps.push({ k: 'walk', to: p.clone() }); }
  }
  for (const st of steps) { if (o.run) st.run = true; M.plan.push(st); }
  if (o.then) M.plan.push({ k: 'do', fn: o.then });
}
function hopOK(b, a, s) { if (!b) return false; const dy = (s.y + s.shift.y) - (a.y + a.shift.y); return b.d < 1.3 && dy < 1.2 && dy > -1.6; }
function routeTo(a, b) {
  const R = room(), d = R.bridge(a, b); if (hopOK(d, a, b)) return [Object.assign(d, { s: b.id })];
  const f = R.floor(); if (f && f !== a && f !== b) { const x = R.bridge(a, f), y = R.bridge(f, b); if (hopOK(x, a, f) && hopOK(y, f, b)) return [Object.assign(x, { s: f.id }), Object.assign(y, { s: b.id })]; }
  return null;
}
function nearestCell(s, p) { let best = null, bd = 1e9; for (const c of s.cells.values()) { const q = room().cellPos(s, c); const d = Math.hypot(q.x - p.x, q.z - p.z) + Math.abs(q.y - p.y) * 0.5; if (d < bd) { bd = d; best = q; } } return best; }
function nearestSurf(p) { let best = null, bd = 1e9; for (const s of room().surfs) { const q = nearestCell(s, p); if (!q) continue; const d = q.distanceTo(p); if (d < bd) { bd = d; best = s; } } return best; }
/* Up onto a wall: hop from the nearest cell of the surface below and cling there, facing the room. */
export function clingTo(w, from) { const R = room(); stop(); const c = nearestCell(from, w.p); goTo(from, c); M.plan.push({ k: 'hop', to: w.p.clone().addScaledVector(w.n, 0.035), wall: { n: w.n.clone(), from: from.id } }); M.plan.push({ k: 'wait', len: rand(4, 8) }); M.plan.push({ k: 'do', fn: () => { const back = R.byId(from.id); if (back) goTo(back, nearestCell(back, w.p)); } }); }

/* Come to the player: the spot on a surface below the phone, a little in front of it. */
export function comeHere(say) {
  const R = room(); if (!R.surfs.length) return false;
  const cam = camLocal(), want = cam.clone().addScaledVector(camFwdLocal(), 0.45);
  let best = null, bd = 1e9;
  for (const s of R.surfs) { const y = s.y + s.shift.y; if (y > cam.y - 0.2) continue; for (const c of s.cells.values()) { const q = R.cellPos(s, c, v1); const d = Math.hypot(q.x - want.x, q.z - want.z) + Math.max(0, cam.y - 0.5 - q.y) * 0.3; if (d < bd) { bd = d; best = { s, p: q.clone() }; } } }
  if (!best) return false;
  goTo(best.s, best.p, { run: true, then: () => { X.setMood('happy', 1.2); if (say) X.floatText(X.head(), say); } });
  return true;
}

/* ---------- the brain: what it does when left alone ---------- */
function think() {
  const R = room(), p = X.S().pet, cur = surfNow(); if (!cur) { if (R.surfs.length) home(); return; }
  if (p.joy < 30 && Date.now() - M.said > 40000) { M.said = Date.now(); comeHere('Play with me?'); return; }
  if (p.belly < 25 && Date.now() - M.said > 40000) { M.said = Date.now(); comeHere('Hungry…'); return; }
  const others = R.surfs.filter(s => s !== cur && s.cells.size >= 3 && (routeTo(cur, s) || s.kind === 'nest'));
  const walls = R.walls.filter(w => { const c = nearestCell(cur, w.p); if (!c) return false; const dy = w.p.y - c.y; return Math.hypot(c.x - w.p.x, c.z - w.p.z) < 0.7 && dy > 0.12 && dy < 0.8; });
  const r = Math.random();
  if (r < 0.32 || (!others.length && !walls.length && r < 0.8)) {          // wander about this surface
    const cs = R.cellsOf(cur).map(c => R.cellPos(cur, c)).filter(q => { const d = q.distanceTo(X.A.off); return d > 0.15 && d < 1; });
    if (cs.length) goTo(cur, pick(cs));
  } else if (r < 0.66 && others.length) {                                 // over to another surface
    const s = pick(others), cs = R.cellsOf(s); goTo(s, R.cellPos(s, pick(cs)));
  } else if (r < 0.78 && walls.length) clingTo(pick(walls), cur);         // up a wall for a look around
  else if (r < 0.92) comeHere();                                           // come and see you
  else { const n = R.surfs.find(s => s.kind === 'nest'); if (n) goTo(n, new THREE.Vector3(rand(-0.05, 0.05), 0, rand(-0.03, 0.05))); } // back to the littles
}

/* ---------- each frame: returns true when it is moving, so main.js knows not to fidget ---------- */
export function move(dt, o, quiet) {
  const A = X.A, R = room(), C = X.C();
  // follow the surface it stands on as tracking corrects it
  const s = R.byId(M.surf);
  if (s && !M.cling) { if (M.lastShift) A.off.add(v1.copy(s.shift).sub(M.lastShift)); M.lastShift = s.shift.clone(); } else M.lastShift = s ? s.shift.clone() : null;
  if (!M.step && M.plan.length) { M.step = M.plan.shift(); M.step.t = 0; M.step.from = A.off.clone(); if (M.step.k === 'hop' || M.step.k === 'poof') M.cling = null; }
  const st = M.step; M.face = null; let moving = false;
  if (st) {
    st.t += dt;
    if (st.k === 'walk') {
      v2.copy(st.to).sub(A.off); const dist = Math.hypot(v2.x, v2.z);
      const sp = st.speed ? st.speed(dist) : st.run ? 0.55 : 0.28;
      if (dist > 0.004 && st.t < 12) { const k = Math.min(1, sp * dt / dist); A.off.x += v2.x * k; A.off.z += v2.z * k; A.off.y += (st.to.y - A.off.y) * Math.min(1, dt * 8); o.lift += Math.abs(Math.sin(X.T() * (st.run ? 20 : 15))) * 0.012; M.face = st.to; moving = true; if (Math.random() < dt * 3) X.sfx('step'); }
      else { A.off.y = st.to.y; M.step = null; }
    } else if (st.k === 'hop') {
      const d = st.from.distanceTo(st.to), dur = st.dur || (st.dur = Math.min(1.3, 0.45 + d * 0.55));
      const crouch = 0.14, u = Math.min(1, Math.max(0, (st.t - crouch) / dur));
      if (st.t < crouch) { o.squash = Math.max(o.squash, 0.18 * st.t / crouch); M.face = st.to; }
      else {
        const up = Math.max(0.06, d * 0.3, st.to.y - st.from.y + 0.12);
        A.off.lerpVectors(st.from, st.to, u); A.off.y += up * 4 * u * (1 - u);
        o.squash = -0.1 * Math.sin(Math.PI * u); o.mood = 'happy'; M.face = st.to; moving = true;
        if (!st.sfx) { st.sfx = true; X.sfx('toss'); }
        if (Math.random() < dt * 25) X.burst(X.world.localToWorld(A.off.clone()).add(new THREE.Vector3(0, 0.03, 0)), 1, 'star', { v: 0.02, up: 0.01, g: 0, life: 0.5, size: 0.008 });
        if (u >= 1) { A.off.copy(st.to); M.step = null; X.sfx('pop'); A.squash = 0.12; if (st.wall) { M.cling = { n: st.wall.n, from: st.wall.from }; M.surf = null; } else { M.surf = st.s; M.lastShift = null; } }
      }
    } else if (st.k === 'poof') {
      if (!st.gone) { st.gone = true; X.burst(X.world.localToWorld(A.off.clone()).add(new THREE.Vector3(0, 0.05, 0)), 18, 'star', { v: 0.1, up: 0.08 }); X.sfx('skill'); C.root.visible = false; }
      if (st.t > 0.45) { A.off.copy(st.to); M.surf = st.s; M.lastShift = null; C.root.visible = true; X.burst(X.world.localToWorld(A.off.clone()).add(new THREE.Vector3(0, 0.05, 0)), 18, 'star', { v: 0.1, up: 0.08 }); X.sfx('pop'); A.squash = 0.15; M.step = null; }
      moving = true;
    } else if (st.k === 'wait') { if (st.t >= st.len) M.step = null; }
    else if (st.k === 'do') { M.step = null; st.fn(); }
  }
  // clinging to a wall: pressed to it, facing the room, paws spread
  if (M.cling) { o.squash -= 0.04; o.tilt += Math.sin(X.T() * 2) * 0.05; if (!moving) M.face = v2.copy(A.off).add(M.cling.n); }
  if (C) C.shadow.visible = !M.cling;
  // when left alone, it decides where to go next
  if (M.on && !quiet && !busy() && !X.S().pet.asleep) { M.brainT -= dt; if (M.brainT <= 0) { M.brainT = rand(6, 14); think(); } }
  return moving;
}
