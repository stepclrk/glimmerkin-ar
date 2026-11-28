/* Games across the room: hide and seek (the Glimmerkin hides, preferring under tables and behind real things, and
   you hunt for it with the phone) and an egg hunt (it hides glimmer eggs around the room for you to find).
   Also the pretend room for the preview, so both work on a screen without AR. */
import * as THREE from 'three';
import { goTo, comeHere, stop as stopRoam, roam, home } from './roam.js';

let X = null;
const G = { k: null, phase: null, t: 0, count: 0, spot: null, seen: 0, giggleT: 4, hintT: 0, eggs: [], found: 0, idleT: 0, best: null };
export const game = G;
export function initPlay(ctx) { X = ctx; }
const $ = s => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
export const playing = () => !!G.k;
export const counting = () => G.phase === 'count';
export const hunting = () => G.k === 'seek' && G.phase === 'hunt';

/* ---------- picking hiding places ---------- */
function camLocal() { X.camPose(); return X.world.worldToLocal(X.camPos.clone()); }
function camFwd() { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(X.camQ); f.applyAxisAngle(new THREE.Vector3(0, 1, 0), -X.world.rotation.y); f.y = 0; return f.normalize(); }
/* Every cell scored as a hiding place: far enough away, under a table, out of the camera's sight, behind the player. */
function spots(minD) {
  const R = X.room, cam = camLocal(), fwd = camFwd(), out = [];
  for (const q of R.allCells()) {
    const h = Math.hypot(q.p.x - cam.x, q.p.z - cam.z); if (h < (minD ?? 0.8) || h > 6) continue;
    let sc = Math.min(h, 4) * 0.5 + rand(0, 1.5);
    if (R.covered(q.s, q.c)) sc += 3;
    const hid = X.hiddenFromCam(X.world.localToWorld(q.p.clone().add(new THREE.Vector3(0, 0.05, 0))));
    if (hid === true) sc += 2.5; else if (hid === false) sc -= 1;
    const dir = new THREE.Vector3(q.p.x - cam.x, 0, q.p.z - cam.z).normalize(); if (dir.dot(fwd) < 0) sc += 1;
    if (q.s.kind === 'nest') sc -= 1.5;
    out.push(Object.assign(q, { sc }));
  }
  return out.sort((a, b) => b.sc - a.sc);
}
export function canPlay() { return spots(0.6).length >= 3; }

/* ---------- the count: the screen goes dark while it hides ---------- */
function startCount(n, msg) {
  G.phase = 'count'; G.count = n; G.t = 0; const el = $('#count'); el.classList.add('on'); $('#count b').textContent = n; $('#count p').textContent = msg; X.sfx('pop');
}
function endCount() { G.phase = 'hunt'; G.t = 0; $('#count').classList.remove('on'); }

/* ---------- hide and seek ---------- */
export function startSeek() {
  if (G.k) stopGame(true);
  const p = X.S().pet; if (p.asleep) { X.toast(p.name + ' is asleep. Wake it first.'); return false; }
  const list = spots(0.9); if (list.length < 3) { X.toast('Look slowly around the room first, so ' + p.name + ' knows where it can hide.', 3400); return false; }
  const pickFrom = list.slice(0, Math.max(1, Math.ceil(list.length * 0.15)));
  G.spot = pickFrom[(Math.random() * pickFrom.length) | 0]; G.k = 'seek'; G.seen = 0; G.giggleT = rand(4, 6); G.hintT = 0;
  startCount(10, 'Cover your eyes and count! ' + p.name + ' is hiding.');
  goTo(G.spot.s, G.spot.p, { run: true });
  return true;
}
function foundIt(how) {
  const p = X.S().pet, secs = Math.round(G.t), S = X.S();
  const dust = 5 + Math.max(0, Math.floor((60 - secs) / 10));
  S.dust += dust; p.joy = Math.min(100, p.joy + 15); S.j.seekWins = (S.j.seekWins || 0) + 1;
  const best = S.j.seekBest && secs >= S.j.seekBest ? '' : ' A new best!'; if (!S.j.seekBest || secs < S.j.seekBest) S.j.seekBest = secs;
  X.A.trick = { k: 'leap', t: 0, good: true, dur: 1 }; X.setMood('happy', 2);
  X.burst(X.head(), 16, 'heart', { v: 0.1, up: 0.1 }); X.sfx('win'); X.floatText(X.head(), 'Found me!');
  X.toast('You found ' + p.name + ' ' + (how === 'tap' ? '' : 'peeking out ') + 'in ' + secs + ' seconds. +' + dust + ' stardust.' + best, 4000);
  X.gainXp(1); X.save(); X.hud(); finish(2.2);
}
function giveUp() {
  const p = X.S().pet; X.toast(p.name + ' couldn\'t wait any longer and comes out to find you. It was ' + X.room.label(G.spot.s) + (X.room.covered(G.spot.s, G.spot.c) ? ', underneath something' : '') + '.', 4200);
  X.sfx('chirp'); finish(0.5);
}
function finish(after) { G.k = null; G.phase = null; $('#play-hint').classList.remove('on'); setTimeout(() => { if (!G.k && !X.S().pet.asleep && !X.questActive()) comeHere(); }, after * 1000); }

/* ---------- egg hunt ---------- */
const eggGeo = new THREE.SphereGeometry(1, 20, 14);
function makeEgg(p, hue) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(eggGeo, new THREE.MeshToonMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.85, 0.7), emissive: new THREE.Color().setHSL(hue / 360, 1, 0.45), emissiveIntensity: 0.35 }));
  m.scale.set(0.018, 0.024, 0.018); m.position.y = 0.024; g.add(m);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffffff })); band.rotation.x = Math.PI / 2; m.add(band);
  g.position.copy(p); X.world.add(g); return { g, m, done: false };
}
export function startEggs(n) {
  if (G.k) stopGame(true);
  const p = X.S().pet; if (p.asleep) { X.toast(p.name + ' is asleep. Wake it first.'); return false; }
  const list = spots(0.6), chosen = [];
  for (const q of list) { if (chosen.every(c => c.p.distanceTo(q.p) > 0.45)) chosen.push(q); if (chosen.length >= (n || 5)) break; }
  if (chosen.length < 3) { X.toast('Look slowly around the room first, so ' + p.name + ' has places to hide the eggs.', 3400); return false; }
  G.k = 'eggs'; G.found = 0; G.idleT = 0;
  G.eggs = chosen.map((q, i) => Object.assign(makeEgg(q.p, (i * 67 + 40) % 360), { q }));
  G.eggs.forEach(e => { e.g.visible = false; });
  startCount(5, 'Cover your eyes! ' + p.name + ' is hiding ' + G.eggs.length + ' glimmer eggs around the room.');
  return true;
}
function findEgg(e) {
  if (e.done) return; e.done = true; G.found++; G.idleT = 0;
  const S = X.S(), at = e.m.getWorldPosition(new THREE.Vector3());
  const berry = X.ELS[(Math.random() * X.ELS.length) | 0];
  S.dust += 3; S.pantry[berry] = (S.pantry[berry] || 0) + 1;
  X.burst(at, 20, 'star', { v: 0.12, up: 0.1 }); X.sfx('shard'); X.floatText(at, '+3 stardust');
  X.anim(0.35, u => e.g.scale.setScalar(Math.max(0.001, 1 + u * 0.6 - u * u * 1.6))).then(() => { X.world.remove(e.g); });
  if (G.found >= G.eggs.length) {
    S.dust += 10; X.S().pet.joy = Math.min(100, X.S().pet.joy + 10); S.j.eggHunts = (S.j.eggHunts || 0) + 1;
    X.toast('All ' + G.eggs.length + ' glimmer eggs found! +10 stardust, and a berry for each egg in the pantry.', 4000); X.sfx('win');
    X.setMood('happy', 2); X.A.trick = { k: 'spin', t: 0, good: true, dur: 1.2 };
    G.eggs = []; finish(1.5);
  } else X.toast(G.found + ' of ' + G.eggs.length + ' found. A ' + X.BERRY[berry] + ' for the pantry.', 2200);
  X.save(); X.hud();
}

/* ---------- taps: a tap on the hidden Glimmerkin or on an egg. Returns true when the game used it. ---------- */
export function tap(x, y) {
  if (!G.k) return false;
  if (G.phase === 'count') return true;
  if (G.k === 'seek') { const h = X.rayAt(x, y).intersectObjects(X.C().hits, false); if (h.length) { foundIt('tap'); return true; } return false; }
  if (G.k === 'eggs') { const live = G.eggs.filter(e => !e.done && e.g.visible); const h = X.rayAt(x, y).intersectObjects(live.map(e => e.m), true); if (h.length) { const e = live.find(z => z.m === h[0].object || z.m === h[0].object.parent); if (e) { findEgg(e); return true; } } }
  return false;
}

export function stopGame(quiet) {
  if (!G.k) return;
  if (G.k === 'eggs') for (const e of G.eggs) X.world.remove(e.g);
  G.eggs = []; G.k = null; G.phase = null; $('#count').classList.remove('on'); $('#play-hint').classList.remove('on');
  if (!quiet) { stopRoam(); X.toast('Game over. ' + X.S().pet.name + ' comes out to play.', 2400); comeHere(); }
}

/* ---------- each frame ---------- */
export function tickPlay(dt) {
  if (!G.k) return;
  G.t += dt;
  if (G.phase === 'count') {
    const left = Math.max(0, G.count - Math.floor(G.t)); const b = $('#count b'); if (b.textContent !== String(left)) { b.textContent = left; if (left) X.sfx('step'); }
    if (G.t >= G.count) {
      if (G.k === 'seek' && (roam.step || roam.plan.length)) { stopRoam(); roam.plan.push({ k: 'poof', to: G.spot.p.clone(), s: G.spot.s.id }); }
      if (G.k === 'eggs') { G.eggs.forEach(e => { e.g.visible = true; }); home(); }
      endCount(); X.sfx('gate');
      hint(G.k === 'seek' ? 'Ready or not! Find ' + X.S().pet.name + '. Listen for its giggle.' : 'Find ' + G.eggs.length + ' glimmer eggs. Tap one when you see it.');
    }
    return;
  }
  if (G.k === 'seek') {
    const pet = X.C().root, at = X.head(), p = X.S().pet;
    // it giggles now and then, from where it is (left or right, near or far)
    if ((G.giggleT -= dt) <= 0) { G.giggleT = rand(6, 9); X.giggleAt(at); }
    // after half a minute a puff of sparkles rises above it now and then
    if (G.t > 30 && (G.hintT -= dt) <= 0) { G.hintT = 4; X.burst(at.clone().add(new THREE.Vector3(0, 0.04, 0)), 6, 'star', { v: 0.03, up: 0.25, g: -0.02, life: 1.6, size: 0.016 }); }
    // found when it is on screen, close enough, and nothing real is in front of it
    const cam = X.viewCam(), ndc = at.clone().project(cam), dist = at.distanceTo(X.camPose());
    const onScreen = ndc.z < 1 && Math.abs(ndc.x) < 0.8 && Math.abs(ndc.y) < 0.85 && pet.visible && !roam.step;
    const hid = X.hiddenFromCam(at);
    const seen = onScreen && (hid === false ? dist < 2.6 : hid === null && X.mode() === 'ar' ? dist < 1.1 : false);
    G.seen = seen ? G.seen + dt : 0; if (G.seen > 0.6) { foundIt('look'); return; }
    hint('Find ' + p.name + '! ' + Math.floor(G.t) + ' s');
    if (G.t > 90) giveUp();
  } else if (G.k === 'eggs') {
    const cam = X.camPose();
    for (const e of G.eggs) if (!e.done && e.g.visible && e.m.getWorldPosition(new THREE.Vector3()).distanceTo(cam) < 0.35) findEgg(e);
    if (!G.k) return;
    hint(G.found + ' of ' + G.eggs.length + ' glimmer eggs found');
    // stuck for a while: the Glimmerkin trots over to the nearest egg left
    if ((G.idleT += dt) > 35 && !roam.step && !roam.plan.length) {
      G.idleT = 0; const left = G.eggs.filter(e => !e.done); const c = X.world.worldToLocal(cam.clone());
      left.sort((a, b) => a.q.p.distanceTo(c) - b.q.p.distanceTo(c)); const e = left[0];
      if (e) { goTo(e.q.s, e.q.p.clone().add(new THREE.Vector3(0.1, 0, 0.06)), { run: true, then: () => { X.floatText(X.head(), 'Over here!'); X.setMood('happy', 1.5); X.sfx('chirp'); } }); }
    }
  }
}
function hint(msg) { const el = $('#play-hint'); el.textContent = msg; el.classList.add('on'); }

/* ---------- the pretend room for the preview: the table stands on a floor, beside a stool, in front of a wall ---------- */
export function previewRoom(R, world, show) {
  let g = world.getObjectByName('preview-room');
  if (!g) {
    g = new THREE.Group(); g.name = 'preview-room'; world.add(g);
    const FY = -0.55, mat = c => new THREE.MeshToonMaterial({ color: c });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 2.2), mat(0x5a4a7a)); floor.position.set(0, FY - 0.01, 0.44); g.add(floor);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, -FY, 16), mat(0x6a4430)); leg.position.y = FY / 2 - 0.012; g.add(leg);
    const stool = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.25, 0.26), mat(0x3f8a8a)); stool.position.set(0.56, FY + 0.125, 0.18); g.add(stool);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 0.02), mat(0x40335e)); wall.position.set(0, FY + 0.55, -0.66); g.add(wall);
    g.userData.occluders = [floor, leg, stool, wall];
  }
  g.visible = !!show;
  if (show) {
    R.seedNest(0.3);
    const FY = -0.55, up = new THREE.Vector3(0, 1, 0), out = new THREE.Vector3(0, 0, 1);
    for (let x = -0.66; x <= 0.67; x += 0.12) for (let z = -0.54; z <= 1.5; z += 0.12) { if (x > 0.38 && x < 0.74 && z > 0.0 && z < 0.36) continue; R.add(new THREE.Vector3(x, FY, z), up); }
    for (let x = 0.47; x <= 0.66; x += 0.1) for (let z = 0.09; z <= 0.28; z += 0.1) R.add(new THREE.Vector3(x, FY + 0.25, z), up);
    for (let x = -0.6; x <= 0.61; x += 0.15) for (let y = FY + 0.2; y <= FY + 0.9; y += 0.15) R.add(new THREE.Vector3(x, y, -0.645), out);
  }
  return g;
}
