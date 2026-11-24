/* Glimmerkin AR, phase 0: put your Glimmerkin on a table, stroke it, teach it tricks by drawing shapes, and flick
   berries for it to catch. Runs as WebXR immersive-ar in Chrome on Android, or as a preview on any screen. */
import * as THREE from 'three';
import { TAU, clamp, petLook, petLevel, stageOf, STAGES, FORMS, PET_TRICKS, LEARN_AT, PET_TRICK_TIME, shapeOf, SPOTS, favSpot, localDay, readSaveCode, newPet } from './glim.js';
import { buildCreature, glowTexture } from './creature.js';

const $ = s => document.querySelector(s);
const SIZE = 0.11;            // metres: about the size of a small toy on a table
const STORE = 'glimar.pet';

/* ---------- the creature's save (its own, in this browser) ---------- */
function load() { try { const p = JSON.parse(localStorage.getItem(STORE)); return p && typeof p.seed === 'number' ? p : null; } catch (e) { return null; } }
let P = load() || newPet();
P.tricks = P.tricks || {}; P.joy = P.joy ?? 55; P.belly = P.belly ?? 62;
let saveT = 0;
function save() { try { localStorage.setItem(STORE, JSON.stringify(P)); } catch (e) { } }

/* ---------- three.js ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
$('#stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 20);
function aim(menu) { camera.position.set(0, 0.25, menu ? 0.62 : 0.58); camera.lookAt(0, menu ? -0.035 : 0.06, 0); }
aim(true);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8877aa, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(0.3, 1, 0.6); scene.add(sun);
const BG = new THREE.Color(0x241640);
scene.background = BG;

const world = new THREE.Group(); scene.add(world);          // the spot on the table
const table = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.025, 64), new THREE.MeshToonMaterial({ color: 0x8a5a3c }));
table.position.y = -0.0125; world.add(table);
const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.006, 8, 64), new THREE.MeshBasicMaterial({ color: 0x5a3622 })); rim.rotation.x = Math.PI / 2; world.add(rim);
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.062, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.9 }));
reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);

let C = null, look = null;
function rebuild() {
  if (C) world.remove(C.root);
  look = petLook(P); C = buildCreature(look, SIZE); world.add(C.root);
  const st = stageOf(petLevel(P.xp || 0));
  $('#name').textContent = P.name;
  $('#form').textContent = look.form ? FORMS[look.form] : STAGES[st];
  $('#menu-name').textContent = P.name + ', ' + ($('#form').textContent).toLowerCase();
  hud();
}

/* ---------- state ---------- */
let mode = 'menu', T = 0, placed = true, popT = 1;
const A = { trick: null, praise: null, mood: null, moodT: 0, squash: 0, tilt: 0, wiggle: 0, off: new THREE.Vector3(), goal: null, yaw: 0, selfT: 50, hugT: 0, hugged: false, strokes: 0 };
let toss = null, catchRun = 0;

/* ---------- sound: tiny synthesised chirps, as the game makes its own ---------- */
let AC = null;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f0, f1, dur, type, vol, at) {
  const ac = AC; if (!ac) return; const t = ac.currentTime + (at || 0), o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function sfx(k) {
  if (!AC) return;
  if (k === 'chirp') { tone(700, 1300, 0.12, 'sine', 0.14); tone(900, 1500, 0.1, 'sine', 0.1, 0.12); }
  else if (k === 'try') tone(500, 380, 0.18, 'triangle', 0.12);
  else if (k === 'purr') tone(95, 80, 0.35, 'sawtooth', 0.04);
  else if (k === 'grow') [523, 659, 784, 1046].forEach((f, i) => tone(f, f * 1.01, 0.18, 'sine', 0.12, i * 0.09));
  else if (k === 'munch') [0, 0.12, 0.24].forEach(a => tone(220, 150, 0.08, 'square', 0.05, a));
  else if (k === 'toss') tone(300, 900, 0.2, 'sine', 0.08);
  else if (k === 'miss') tone(400, 200, 0.3, 'triangle', 0.1);
  else if (k === 'pop') tone(600, 900, 0.08, 'sine', 0.12);
}

/* ---------- particles: hearts and stars ---------- */
function shapeTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  if (kind === 'heart') { g.fillStyle = '#ff6fa0'; g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(4, 34, 8, 8, 32, 20); g.bezierCurveTo(56, 8, 60, 34, 32, 54); g.fill(); }
  else { g.fillStyle = '#ffe27a'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 28; g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.fill(); }
  return new THREE.CanvasTexture(c);
}
const TEX = { heart: shapeTex('heart'), star: shapeTex('star') };
const parts = [];
function burst(p, n, kind, o) {
  o = o || {};
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX[kind], transparent: true, depthWrite: false }));
    const sz = (o.size || 0.014) * (0.7 + Math.random() * 0.6); sp.scale.setScalar(sz); sp.position.copy(p); scene.add(sp);
    const a = Math.random() * TAU, sp2 = (o.v || 0.12) * (0.5 + Math.random());
    const v = o.dir ? o.dir.clone().multiplyScalar(sp2 * 2).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.05, (Math.random() - 0.5) * 0.08)) : new THREE.Vector3(Math.cos(a) * sp2, (o.up || 0.1) + Math.random() * 0.1, Math.sin(a) * sp2);
    parts.push({ sp, v, life: o.life || 1, t: 0, g: o.g ?? 0.05, sz });
  }
}
function tickParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.t += dt; q.v.y -= q.g * dt; q.sp.position.addScaledVector(q.v, dt);
    const k = q.t / q.life; q.sp.material.opacity = 1 - k * k;
    if (q.t >= q.life) { scene.remove(q.sp); q.sp.material.dispose(); parts.splice(i, 1); }
  }
}

/* ---------- words on screen ---------- */
let toastT = null;
function toast(msg, ms) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms || 2600); }
const floats = [];
function floatText(p, msg) { const el = document.createElement('div'); el.className = 'float'; el.textContent = msg; $('#overlay').appendChild(el); floats.push({ el, p: p.clone(), t: 0 }); }
const vTmp = new THREE.Vector3();
function toScreen(p) { const cam = viewCam(); vTmp.copy(p).project(cam); return { x: (vTmp.x + 1) / 2 * window.innerWidth, y: (1 - vTmp.y) / 2 * window.innerHeight, front: vTmp.z < 1 }; }
function tickFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; const s = toScreen(f.p);
    f.el.style.transform = 'translate(' + (s.x - 60) + 'px,' + (s.y - 40 - f.t * 50) + 'px)'; f.el.style.opacity = String(1 - Math.max(0, f.t - 0.8) / 0.6);
    if (f.t > 1.4) { f.el.remove(); floats.splice(i, 1); }
  }
}
function meter(id, v) { const el = $(id); el.style.width = clamp(v, 0, 100) + '%'; el.classList.toggle('low', v < 30); }
function hud() {
  meter('#joy', P.joy); meter('#belly', P.belly);
  const n = Object.keys(PET_TRICKS).filter(k => (P.tricks[k] || 0) >= LEARN_AT).length; $('#tricks-n').textContent = n + ' of 8';
}

/* ---------- cameras and rays ---------- */
function viewCam() { if (mode === 'ar') { const xc = renderer.xr.getCamera(); return xc.cameras && xc.cameras[0] ? xc.cameras[0] : xc; } return camera; }
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hitAt(x, y) {
  if (!C || !world.visible) return null;
  ndc.set(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1); ray.setFromCamera(ndc, viewCam());
  const h = ray.intersectObjects(C.hits, false); return h.length ? h[0].point.clone() : null;
}
const camPos = new THREE.Vector3(), camQ = new THREE.Quaternion();
function camPose() { const c = viewCam(); c.updateMatrixWorld(); c.matrixWorld.decompose(camPos, camQ, vTmp); }
const headP = new THREE.Vector3();
function head() { return C.headWorld(headP).clone(); }

/* ---------- care and tricks, by the game's rules ---------- */
function setMood(m, t) { A.mood = m; A.moodT = t; }
function knows(k) { return (P.tricks[k] || 0) >= LEARN_AT; }
function strokeTick(spot, p) {
  P.joy = Math.min(100, P.joy + 1.3); A.strokes++;
  if (A.strokes % 2 === 0) burst(p, 1, 'heart', { v: 0.03, up: 0.08, g: -0.02, life: 1.1 });
  if (spot === 'head') { A.squash = Math.max(A.squash, 0.06); setMood('happy', 1.1); }
  else if (spot === 'tummy') { A.wiggle = 0.7; setMood('happy', 1); }
  else A.tilt = (spot === 'left' ? -1 : 1) * 0.12;
  if (spot === favSpot(P.seed)) {
    burst(p, 3, 'star', { v: 0.06, up: 0.06, size: 0.01, g: 0 });
    if (A.strokes % 2 === 0) sfx('purr');
    const day = localDay(); if (!P.spot || P.spot.day !== day) P.spot = { day, found: false };
    if (!P.spot.found) { P.spot.found = true; sfx('pop'); toast('That\'s the spot! ' + P.name + ' loves a stroke on ' + SPOTS[spot] + ' today.', 3600); }
  }
  praiseTrick(); hud();
}
function doTrick(k, self) {
  if (A.trick || toss) return;
  const good = knows(k), T0 = PET_TRICKS[k];
  A.trick = { k, t: 0, good, dur: k === 'chase' || k === 'roll' ? 1.8 : PET_TRICK_TIME + 0.2, fx: false };
  sfx(good ? 'chirp' : 'try');
  if (good) { if (self) floatText(head(), T0.does[0].toUpperCase() + T0.does.slice(1) + '!'); else toast(P.name + ' ' + T0.does + '!', 1800); return; }
  A.praise = { k, until: T + A.trick.dur + 4, done: false };
  const n = P.tricks[k] || 0;
  toast(P.name + ' ' + T0.tries + '. Stroke it to praise it' + (n ? ' (' + n + ' of ' + LEARN_AT + ')' : '') + '.', 3000);
}
function praiseTrick() {
  const pr = A.praise; if (!pr || pr.done || T > pr.until) return;
  pr.done = true; const n = P.tricks[pr.k] = Math.min(LEARN_AT, (P.tricks[pr.k] || 0) + 1);
  floatText(head(), n >= LEARN_AT ? 'Learned!' : n + ' of ' + LEARN_AT);
  if (n >= LEARN_AT) { sfx('grow'); burst(head(), 22, 'star', { v: 0.15, up: 0.15, life: 1.1 }); toast(P.name + ' has learned to ' + PET_TRICKS[pr.k].name + '! Draw ' + PET_TRICKS[pr.k].shape + ' and it will.', 4200); A.praise = null; }
  hud(); save(); renderTricks();
}
const ease = u => u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
function trickPose(o, tr) {
  const u = clamp(tr.t / tr.dur, 0, 1), e = ease(u), g = tr.good, s1 = Math.sin(Math.PI * u);
  switch (tr.k) {
    case 'spin': o.spin = g ? e * TAU : s1 * 1.3; o.lift += s1 * SIZE * (g ? 0.12 : 0.04); if (g) o.mood = 'happy'; break;
    case 'wiggle': o.wiggle = (g ? 1.2 : 0.5) * s1; o.mood = 'happy'; break;
    case 'leap': { const air = u < 0.15 || u > 0.85 ? 0 : Math.sin(Math.PI * (u - 0.15) / 0.7); o.lift += air * (g ? 0.13 : 0.04); o.squash = u < 0.15 ? 0.16 * Math.sin(Math.PI * u / 0.15) : u > 0.85 ? 0.16 * Math.sin(Math.PI * (u - 0.85) / 0.15) : -0.08 * air; if (g) o.mood = 'happy'; break; }
    case 'bow': o.pitch = s1 * (g ? 0.6 : 0.22); o.mood = u > 0.3 && u < 0.7 ? 'happy' : o.mood; break;
    case 'kiss': o.pitch = s1 * (g ? 0.3 : 0.12); o.mood = 'happy';
      if (!tr.fx && u > 0.5) { tr.fx = true; camPose(); const d = camPos.clone().sub(head()).normalize(); burst(head(), g ? 6 : 1, 'heart', { dir: d, v: 0.08, g: 0, life: 1.4, size: 0.02 }); } break;
    case 'roll': o.roll = g ? -e * TAU : -s1 * 0.8; o.dx = s1 * SIZE * (g ? 0.6 : 0.2); o.lift += Math.abs(Math.sin(o.roll)) * SIZE * 0.25; o.mood = 'happy'; break;
    case 'chase': { const r = SIZE * 0.3, a = g ? e * 2 * TAU : s1 * Math.PI * 0.7; o.dx = Math.sin(a) * r; o.dz = (Math.cos(a) - 1) * r; o.spin = a + Math.PI / 2 * Math.min(1, u * 6, (1 - u) * 6); o.lift += Math.abs(Math.sin(u * 40)) * SIZE * 0.05; o.mood = 'happy'; break; }
    case 'pose': o.stretch = s1 * (g ? 0.18 : 0.07); o.tilt += s1 * (g ? 0.28 : 0.1); o.mood = 'happy';
      if (g && !tr.fx && u > 0.45) { tr.fx = true; burst(head(), 14, 'star', { v: 0.12, up: 0.1 }); } break;
  }
}

/* ---------- catch: a berry flicked up flies in an arc, and it leaps to catch it ---------- */
const berryMesh = (() => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), new THREE.MeshToonMaterial({ color: 0xd8326b })); const l = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshToonMaterial({ color: 0x3fa35a })); l.scale.set(0.006, 0.002, 0.003); l.position.y = 0.011; g.add(b, l); return g; })();
const GRAV = 3.2;
function launch(vx, vy) {
  if (toss || !world.visible) return;
  if (P.belly >= 100) { toast(P.name + ' is full.'); return; }
  camPose();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQ), down = new THREE.Vector3(0, -1, 0).applyQuaternion(camQ);
  const start = camPos.clone().addScaledVector(fwd, 0.12).addScaledVector(down, 0.06);
  const home = world.localToWorld(new THREE.Vector3(0, 0, 0)), mouthY = home.y + C.size.h * 1.7;
  const hor = new THREE.Vector3(home.x - start.x, 0, home.z - start.z), dist = hor.length();
  const power = clamp(vy / 1600, 0.45, 1.6), f = clamp(0.5 + 0.5 * power, 0.72, 1.3);
  const side = new THREE.Vector3(right.x, 0, right.z).normalize();
  const aim = new THREE.Vector3(start.x, 0, start.z).addScaledVector(hor, f).addScaledVector(side, clamp(vx / Math.max(vy, 1), -1, 1) * dist * 0.35);
  const Tf = clamp(0.45 + 0.4 * dist, 0.55, 1.1);
  const v = new THREE.Vector3((aim.x - start.x) / Tf, (mouthY - start.y + 0.5 * GRAV * Tf * Tf) / Tf, (aim.z - start.z) / Tf);
  const aimLocal = world.worldToLocal(new THREE.Vector3(aim.x, home.y, aim.z)); aimLocal.y = 0;
  const reach = aimLocal.length() < 0.2;
  scene.add(berryMesh); berryMesh.position.copy(start); berryMesh.visible = true;
  toss = { v, t: 0, T: Tf, reach, aimLocal, caught: false, landed: false, restT: 0, floorY: home.y };
  A.goal = reach ? aimLocal : null; sfx('toss');
}
function tickToss(dt) {
  if (!toss) return;
  const q = toss; q.t += dt;
  if (!q.caught && !q.landed) {
    q.v.y -= GRAV * dt; berryMesh.position.addScaledVector(q.v, dt); berryMesh.rotation.x += dt * 8;
    if (q.reach && q.t >= q.T) {
      q.caught = true; berryMesh.visible = false; scene.remove(berryMesh);
      P.belly = Math.min(100, P.belly + 18); P.joy = Math.min(100, P.joy + 3); catchRun++; P.catchBest = Math.max(P.catchBest || 0, catchRun);
      setMood('eat', 1.2); sfx('munch'); floatText(head(), catchRun > 1 ? catchRun + ' in a row!' : 'Caught!');
      if (catchRun === 10) toast('Ten catches in a row!', 3000);
      hud(); save(); setTimeout(() => { if (toss === q) toss = null; A.goal = new THREE.Vector3(); }, 1200);
    } else if (berryMesh.position.y <= q.floorY + 0.011 && q.v.y < 0) {
      if (Math.abs(q.v.y) > 0.4 && !q.bounced) { q.bounced = true; q.v.y *= -0.35; q.v.x *= 0.5; q.v.z *= 0.5; berryMesh.position.y = q.floorY + 0.011; }
      else { q.landed = true; berryMesh.position.y = q.floorY + 0.011; catchRun = 0; setMood('sad', 1.2); sfx('miss'); toast(P.name + ' missed it. Flick harder or softer to reach it.', 2400); }
    }
    if (berryMesh.position.y < q.floorY - 1) { q.landed = true; }
  } else if (q.landed) { q.restT += dt; berryMesh.scale.setScalar(Math.max(0.01, 1 - Math.max(0, q.restT - 1) * 2)); if (q.restT > 1.5) { scene.remove(berryMesh); berryMesh.scale.setScalar(1); toss = null; A.goal = new THREE.Vector3(); } }
}

/* ---------- each frame ---------- */
function tick(dt) {
  if (!C) return;
  T += dt;
  // needs fall slowly, as in the game (Belly 1 per 6 min, Joy 1 per 4 min 40 s)
  P.belly = Math.max(0, P.belly - dt / 360); P.joy = Math.max(0, P.joy - dt / 280);
  if ((saveT += dt) > 5) { saveT = 0; save(); hud(); }
  const o = { lift: 0, squash: 0, tilt: 0, pitch: 0, roll: 0, spin: 0, dx: 0, dz: 0, wiggle: 0, stretch: 0, lean: 0, mood: null };
  if (A.moodT > 0) { A.moodT -= dt; o.mood = A.mood; }
  A.squash = Math.max(0, A.squash - dt * 0.15); A.tilt *= Math.pow(0.02, dt); A.wiggle = Math.max(0, A.wiggle - dt);
  o.squash = A.squash; o.tilt = A.tilt; o.wiggle = A.wiggle;
  // a hug: a finger held still on it
  if (ptr && ptr.hit && ptr.moved < 10 && T - ptr.t0 > 0.6) {
    o.lean = 0.15; o.mood = 'happy'; A.hugT += dt;
    if (A.hugT > 0.7) { A.hugT = 0; strokeTick(ptr.spot, ptr.hit); }
    if (!ptr.big && T - ptr.t0 > 3.6) { ptr.big = true; const hp = head(); for (let i = 0; i < 10; i++) burst(hp, 1, 'heart', { v: 0.1, up: 0.05, g: 0, life: 1.3 }); sfx('grow'); toast('A big hug!', 1600); }
  }
  if (A.trick) { A.trick.t += dt; trickPose(o, A.trick); if (A.trick.t >= A.trick.dur) A.trick = null; }
  // showing off a learned trick when happy
  if (!A.trick && !ptr && !toss && P.joy >= 60) { A.selfT -= dt; if (A.selfT <= 0) { A.selfT = 40 + Math.random() * 40; const ks = Object.keys(PET_TRICKS).filter(knows); if (ks.length) doTrick(ks[(Math.random() * ks.length) | 0], true); } }
  // moving to catch, and back home
  if (A.goal) {
    const d = A.goal.clone().sub(A.off); d.y = 0; const dist = d.length();
    const left = toss && !toss.caught ? Math.max(0.05, toss.T - 0.25 - toss.t) : 0.8, sp = Math.min(dist / left, 0.6);
    if (dist > 0.003) { A.off.addScaledVector(d.normalize(), Math.min(dist, sp * dt)); o.lift += Math.abs(Math.sin(T * 16)) * 0.012; }
    else if (!toss) A.goal = null;
  }
  if (toss && toss.reach && !toss.caught) { const left = toss.T - toss.t; if (left < 0.3) { o.lift += Math.sin(Math.PI * clamp(1 - left / 0.3, 0, 1) * 0.5) * 0.03; o.squash -= 0.05; } o.mood = 'idle'; }
  C.root.position.set(A.off.x, 0, A.off.z);
  // face the phone, or the berry in flight
  camPose(); const target = toss && !toss.caught && !toss.landed ? berryMesh.position : camPos;
  const tl = world.worldToLocal(target.clone()); const want = Math.atan2(tl.x - A.off.x, tl.z - A.off.z);
  let da = want - A.yaw; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; A.yaw += da * Math.min(1, dt * 6); C.root.rotation.y = A.yaw;
  // pop in when placed
  if (popT < 1) { popT = Math.min(1, popT + dt * 2.5); const k = popT < 0.7 ? popT / 0.7 * 1.15 : 1.15 - (popT - 0.7) / 0.3 * 0.15; C.root.scale.setScalar(Math.max(0.001, k)); }
  C.update(dt, T, o);
  tickParts(dt); tickFloats(dt); tickToss(dt);
}

/* ---------- touch ---------- */
let ptr = null;
const draw = $('#draw'), dg = draw.getContext('2d');
function sizeDraw() { const d = Math.min(2, window.devicePixelRatio || 1); draw.width = window.innerWidth * d; draw.height = window.innerHeight * d; dg.setTransform(d, 0, 0, d, 0, 0); }
sizeDraw();
function drawPath() {
  dg.clearRect(0, 0, window.innerWidth, window.innerHeight); if (!ptr || ptr.hit || ptr.path.length < 2 || ptr.moved < 12) return;
  dg.lineCap = 'round'; dg.lineJoin = 'round'; dg.strokeStyle = 'rgba(255,207,107,.85)'; dg.lineWidth = 5; dg.beginPath(); ptr.path.forEach((p, i) => i ? dg.lineTo(p.x, p.y) : dg.moveTo(p.x, p.y)); dg.stroke();
}
const touch = $('#touch');
touch.addEventListener('pointerdown', e => {
  if (mode === 'menu') return; audio(); e.preventDefault();
  if (ptr) return; touch.setPointerCapture && touch.setPointerCapture(e.pointerId);
  const hit = placed ? hitAt(e.clientX, e.clientY) : null;
  ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: T, path: [{ x: e.clientX, y: e.clientY }], moved: 0, acc: 0, hit, spot: hit ? C.spotAt(hit) : null, big: false };
  A.hugT = 0;
});
touch.addEventListener('pointermove', e => {
  if (!ptr || e.pointerId !== ptr.id) return;
  const d = Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y); ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved += d;
  if (ptr.hit) {
    const h = hitAt(e.clientX, e.clientY);
    if (h) { ptr.hit = h; ptr.spot = C.spotAt(h); ptr.acc += d; while (ptr.acc >= 34) { ptr.acc -= 34; strokeTick(ptr.spot, h); } }
  } else { ptr.path.push({ x: e.clientX, y: e.clientY }); drawPath(); }
});
function endPtr(e) {
  if (!ptr || e.pointerId !== ptr.id) return;
  const q = ptr; ptr = null; dg.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (!placed) { if (q.moved < 24) placeHere(); return; }
  if (q.hit) { if (q.moved < 10 && T - q.t0 < 0.4) { setMood('happy', 0.8); A.squash = 0.1; sfx('pop'); } return; }
  if (q.moved < 12) return;
  const k = shapeOf(q.path); if (k) doTrick(k, false);
  else toast('Draw a circle, a zigzag, a swipe up or down, a heart, a star, a spiral or a swipe across.', 2600);
}
touch.addEventListener('pointerup', endPtr);
touch.addEventListener('pointercancel', e => { if (ptr && e.pointerId === ptr.id) { ptr = null; dg.clearRect(0, 0, window.innerWidth, window.innerHeight); } });

// the berry button: flick up from it to throw, tap to toss one straight to it
const bb = $('#berry'); let flick = null;
bb.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio(); flick = { id: e.pointerId, pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }] }; bb.setPointerCapture && bb.setPointerCapture(e.pointerId); });
bb.addEventListener('pointermove', e => { if (flick && e.pointerId === flick.id) flick.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() }); });
bb.addEventListener('pointerup', e => {
  if (!flick || e.pointerId !== flick.id) return; const now = performance.now(); flick.pts.push({ x: e.clientX, y: e.clientY, t: now });
  // speed over the last tenth of a second, or over the whole flick when it was quick
  const pts = flick.pts, quick = now - pts[0].t < 500, recent = quick ? pts : pts.filter(p => now - p.t < 100);
  const a = recent.length > 1 ? recent[0] : pts[Math.max(0, pts.length - 2)], b = pts[pts.length - 1], dt = Math.max(16, b.t - a.t) / 1000;
  const vy = -(b.y - a.y) / dt, vx = (b.x - a.x) / dt, total = pts[0].y - b.y; flick = null;
  if (vy > 450 && total > 30) launch(vx, vy); else if (total < 12) launch(0, 1600);
});

/* ---------- AR ---------- */
let xrSession = null, hitSource = null, lastHit = null, anchor = null, arOK = false;
function placeHere() {
  if (!lastHit) { toast('Move your phone slowly over a table until the gold ring shows.'); return; }
  const m = new THREE.Matrix4().fromArray(lastHit.pose.transform.matrix); world.position.setFromMatrixPosition(m); world.quaternion.identity();
  world.visible = true; placed = true; popT = 0; reticle.visible = false; A.off.set(0, 0, 0); A.goal = null;
  anchor = null; if (lastHit.result.createAnchor) lastHit.result.createAnchor().then(a => { anchor = a; }).catch(() => { });
  sfx('chirp'); toast('Say hello to ' + P.name + '. Stroke it, draw a shape for a trick, or flick a berry.', 3600);
  $('#place-hint').classList.remove('on');
}
async function startAR() {
  audio();
  try {
    const s = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'anchors'], domOverlay: { root: $('#overlay') } });
    renderer.xr.setReferenceSpaceType('local'); await renderer.xr.setSession(s);
    xrSession = s; const viewer = await s.requestReferenceSpace('viewer'); hitSource = await s.requestHitTestSource({ space: viewer });
    s.addEventListener('end', () => { xrSession = null; hitSource = null; anchor = null; lastHit = null; leave(); });
    mode = 'ar'; placed = false; world.visible = false; table.visible = rim.visible = false; scene.background = null;
    $('#menu').classList.add('off'); $('#hud').classList.add('on'); $('#move').hidden = false; $('#place-hint').classList.add('on');
    if (!s.domOverlayState) toast('This phone has no overlay for AR, so the buttons will not show.', 4000);
  } catch (e) { toast('AR could not start: ' + (e && e.message || e), 4000); }
}
function xrFrame(frame) {
  const ref = renderer.xr.getReferenceSpace(); if (!ref) return;
  if (hitSource) {
    const rs = frame.getHitTestResults(hitSource); lastHit = null;
    for (const r of rs) { const pose = r.getPose(ref); if (!pose) continue; const m = pose.transform.matrix; if (m[5] > 0.75) { lastHit = { result: r, pose }; break; } } // a flat, upward-facing surface
    reticle.visible = !placed && !!lastHit; if (lastHit) reticle.matrix.fromArray(lastHit.pose.transform.matrix);
    $('#place-hint').textContent = lastHit ? 'Tap to put ' + P.name + ' here' : 'Move your phone slowly over a table or the floor';
  }
  if (anchor && frame.trackedAnchors && frame.trackedAnchors.has(anchor)) { const p = frame.getPose(anchor.anchorSpace, ref); if (p) world.position.setFromMatrixPosition(new THREE.Matrix4().fromArray(p.transform.matrix)); }
}
$('#overlay').addEventListener('beforexrselect', e => e.preventDefault());

/* ---------- menu, preview and leaving ---------- */
function preview() {
  audio(); aim(false); mode = 'preview'; placed = true; world.visible = true; table.visible = rim.visible = true; scene.background = BG; popT = 0;
  $('#menu').classList.add('off'); $('#hud').classList.add('on'); $('#move').hidden = true;
  toast('Stroke ' + P.name + ', draw a shape on the sky for a trick, or flick a berry up from the button.', 3600);
}
function leave() {
  if (xrSession) { xrSession.end(); return; }
  aim(true); mode = 'menu'; placed = true; world.visible = true; table.visible = rim.visible = true; world.position.set(0, 0, 0); scene.background = BG; reticle.visible = false;
  $('#menu').classList.remove('off'); $('#hud').classList.remove('on'); $('#place-hint').classList.remove('on'); save();
}
$('#start-ar').addEventListener('click', startAR);
$('#start-preview').addEventListener('click', preview);
$('#leave').addEventListener('click', e => { e.stopPropagation(); leave(); });
$('#move').addEventListener('click', e => { e.stopPropagation(); placed = false; world.visible = false; anchor = null; $('#place-hint').classList.add('on'); });
function sheet(id, on) { $(id).classList.toggle('on', on); }
$('#tricks-btn').addEventListener('click', e => { e.stopPropagation(); renderTricks(); sheet('#tricks', true); });
$('#tricks-close').addEventListener('click', () => sheet('#tricks', false));
function renderTricks() {
  $('#tricks-list').innerHTML = Object.entries(PET_TRICKS).map(([k, t]) => { const n = P.tricks[k] || 0; return '<li><b>' + t.shape[0].toUpperCase() + t.shape.slice(1) + '</b> to ' + t.name + '<span>' + (n >= LEARN_AT ? 'Learned' : n + ' of ' + LEARN_AT) + '</span></li>'; }).join('');
}
$('#bring').addEventListener('click', () => { $('#code').value = ''; $('#code-err').textContent = ''; sheet('#import', true); });
$('#import-cancel').addEventListener('click', () => sheet('#import', false));
$('#import-ok').addEventListener('click', () => {
  try {
    const S = readSaveCode($('#code').value), p = S.pet;
    P = { name: p.name, seed: p.seed, xp: p.xp || 0, diet: p.diet || {}, marks: p.marks || [], form: p.form || null, ...(p.hue0 !== undefined ? { hue0: p.hue0 } : {}), tricks: Object.assign({}, p.tricks || {}), joy: p.joy ?? 55, belly: p.belly ?? 62, catchBest: (S.j && S.j.catchBest) || 0 };
    save(); rebuild(); sheet('#import', false); toast(P.name + ' is here.', 2400);
  } catch (err) { $('#code-err').textContent = err.message; }
});
$('#fresh').addEventListener('click', () => { if (!confirmFresh()) return; P = newPet(); save(); rebuild(); toast('Meet ' + P.name + '.'); });
function confirmFresh() { const b = $('#fresh'); if (b.dataset.sure) { delete b.dataset.sure; b.textContent = 'New creature'; return true; } b.dataset.sure = '1'; b.textContent = 'Tap again to replace ' + P.name; setTimeout(() => { delete b.dataset.sure; b.textContent = 'New creature'; }, 3000); return false; }

async function checkAR() {
  const st = $('#ar-status');
  if (!window.isSecureContext) { st.textContent = 'AR needs the page opened over https.'; return; }
  if (!navigator.xr) { st.textContent = 'This browser has no WebXR. On Android, open this page in Chrome.'; return; }
  try { arOK = await navigator.xr.isSessionSupported('immersive-ar'); } catch (e) { arOK = false; }
  $('#start-ar').disabled = !arOK;
  st.textContent = arOK ? 'Point your phone at a table, then tap the gold ring.' : 'AR is not available here. It needs Chrome on an ARCore Android phone. The preview works anywhere.';
}

window.addEventListener('resize', () => { if (renderer.xr.isPresenting) return; camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); sizeDraw(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

rebuild(); checkAR();
const clock = new THREE.Clock();
renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(0.05, clock.getDelta());
  if (frame && mode === 'ar') xrFrame(frame);
  if (mode === 'menu') { C.root.rotation.y = Math.sin(T * 0.4) * 0.5; C.update(dt, T += dt, {}); }
  else tick(dt);
  renderer.render(scene, camera);
});

/* For the browser test: read the state, and find the creature on screen. */
window.__glim = {
  get P() { return P; }, get mode() { return mode; }, get trick() { return A.trick && A.trick.k; }, get toss() { return !!toss; }, get praise() { return A.praise; },
  screenOfHead() { return toScreen(head()); }, screenOfBody() { const p = C.root.localToWorld(new THREE.Vector3(0, C.size.h * 0.9, 0)); return toScreen(p); },
  favSpot: () => favSpot(P.seed), look: () => look
};
