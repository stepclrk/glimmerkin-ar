/* Glimmerkin AR: the nest on a real table (the Glimmerkin, its littles and eggs, feeding, sleep, tricks) and quests
   on a tabletop board. Runs as WebXR immersive-ar in Chrome on Android, or as a preview on any screen.
   src/core.js (the game's own) is loaded first, so its names are globals here. */
/* global BIOMES, KINDS, ELS, EL_HUE, BERRY, FORMS, STAGES, RNG, petLevel, stageOf, formFor, worldName, maxSparks */
import * as THREE from 'three';
import { TAU, clamp, petLook, lookOf, littleLevel, PET_TRICKS, LITTLE_TRICK, LEARN_AT, PET_TRICK_TIME, shapeOf, SPOTS, favSpot, localDay, readSaveCode, fromGame, newGame, newLittle } from './glim.js';
import { buildCreature } from './creature.js';
import { initQuest, startQuest, questTick, questTap, questActive, questDebug, questSpan } from './quest.js';
import { createRoom, createDepth } from './room.js';
import { initRoam, roam, move as roamMove, goTo, comeHere, home as roamHome, stop as stopRoam, away, surfNow } from './roam.js';
import { initPlay, game, playing, counting, startSeek, startEggs, stopGame, tickPlay, tap as playTap, previewRoom } from './play.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SIZE = 0.11, LSIZE = 0.06;     // metres: the Glimmerkin and a little, in the nest
const STORE = 'glimar.save', TRAVEL_REST = 25, NEST_ROOM = 8;

/* ---------- the save (its own, in this browser) ---------- */
function load() {
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && s.pet && typeof s.pet.seed === 'number') return s; } catch (e) { }
  try { const p = JSON.parse(localStorage.getItem('glimar.pet')); if (p && typeof p.seed === 'number') { const s = newGame(); Object.assign(s.pet, p); s.j.catchBest = p.catchBest || 0; return s; } } catch (e) { }
  return null;
}
let S = load() || newGame();
function fix() {
  const p = S.pet; p.tricks = p.tricks || {}; p.diet = p.diet || {}; p.ate = p.ate || {}; p.marks = p.marks || []; p.visits = p.visits || {};
  p.joy = p.joy ?? 55; p.belly = p.belly ?? 62; p.rest = p.rest ?? 100;
  S.littles = S.littles || []; S.eggs = S.eggs || []; S.pantry = S.pantry || {}; S.quests = S.quests || 0; S.dust = S.dust || 0; S.j = S.j || {}; S.party = S.party || [];
  // time away counts, capped at 10 hours, never taking Belly or Joy below 8 (as in the game)
  if (S.lastTick) { const m = Math.min(600, (Date.now() - S.lastTick) / 60000); if (m > 0) { p.belly = Math.max(Math.min(p.belly, 8), p.belly - m / 6); p.joy = Math.max(Math.min(p.joy, 8), p.joy - m / 4.67); p.rest = Math.min(100, p.rest + m * (p.asleep ? 15 : 1)); } }
}
fix();
let saveT = 0;
function save() { S.lastTick = Date.now(); try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { } }

/* ---------- three.js ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
$('#stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 20);
function aim(k) {   // the preview camera: far enough back that the nest, or the whole quest board, fits the screen's width
  if (k === 'room') { const tanW = Math.tan(camera.fov * Math.PI / 360) * camera.aspect, d = Math.max(1.6, 0.78 / tanW); camera.position.set(0, d * 0.55, d * 0.85); camera.lookAt(0, -0.3, -0.02); aimed = k; return; }
  const tanW = Math.tan(camera.fov * Math.PI / 360) * camera.aspect, base = k === 'quest' ? [0, 0.5, 0.42] : [0, 0.25, k === 'menu' ? 0.62 : 0.58];
  const half = k === 'quest' ? questSpan() / 2 + 0.02 : k === 'menu' ? 0.12 : 0.21, d0 = Math.hypot(base[1], base[2]), d = Math.max(d0, half / tanW * 1.05);
  camera.position.set(0, base[1] * d / d0, base[2] * d / d0); camera.lookAt(0, k === 'quest' ? 0 : k === 'menu' ? -0.035 : 0.06, k === 'quest' ? 0.03 : 0); aimed = k;
}
let aimed = 'menu';
aim('menu');
scene.add(new THREE.HemisphereLight(0xffffff, 0x8877aa, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(0.3, 1, 0.6); scene.add(sun);
const BG = new THREE.Color(0x241640); scene.background = BG;

const world = new THREE.Group(); scene.add(world);          // the spot on the table; +z faces the player
const table = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.025, 64), new THREE.MeshToonMaterial({ color: 0x8a5a3c }));
table.position.y = -0.0125; world.add(table);
const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.006, 8, 64), new THREE.MeshBasicMaterial({ color: 0x5a3622 })); rim.rotation.x = Math.PI / 2; world.add(rim);
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.062, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.9 }));
reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
const nest = new THREE.Group(); world.add(nest);
const room = createRoom(world);                              // the surfaces and walls around the nest, in the nest's frame
const depth = createDepth(THREE, renderer, scene);          // the real world's depth, where the phone has it

/* ---------- state ---------- */
let mode = 'menu', T = 0, placed = true, popT = 1;
const A = { trick: null, praise: null, mood: null, moodT: 0, squash: 0, tilt: 0, wiggle: 0, off: new THREE.Vector3(), goal: null, yaw: 0, selfT: 50, hugT: 0, strokes: 0 };
let toss = null, catchRun = 0, C = null, look = null, berryEl = null;
let LC = [];     // littles in the nest: { l, c, home, off, yaw, trick, hopT, moodT, mood }
let EG = [];     // eggs in the nest: { e, mesh, home }

/* ---------- animation helpers, shared with the quest ---------- */
const anims = [];
function anim(dur, fn) { return new Promise(res => anims.push({ t: 0, dur, fn, res })); }
const wait = s => anim(s, () => { });
function tickAnims(dt) { for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; const u = Math.min(1, a.t / a.dur); a.fn(u); if (u >= 1) { anims.splice(i, 1); a.res(); } } }

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
  else if (k === 'miss' || k === 'no') tone(400, 200, 0.25, 'triangle', 0.1);
  else if (k === 'pop') tone(600, 900, 0.08, 'sine', 0.12);
  else if (k === 'step') tone(420, 520, 0.05, 'sine', 0.04);
  else if (k === 'shard') [880, 1320].forEach((f, i) => tone(f, f * 1.02, 0.15, 'sine', 0.12, i * 0.08));
  else if (k === 'skill') tone(300, 1200, 0.25, 'sawtooth', 0.05);
  else if (k === 'hit') tone(160, 90, 0.12, 'square', 0.08);
  else if (k === 'win') [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.1, i * 0.1));
  else if (k === 'gate') tone(200, 400, 0.4, 'triangle', 0.1);
}

/* ---------- particles: hearts, stars, sparks and sleepy zeds ---------- */
function shapeTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  if (kind === 'heart') { g.fillStyle = '#ff6fa0'; g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(4, 34, 8, 8, 32, 20); g.bezierCurveTo(56, 8, 60, 34, 32, 54); g.fill(); }
  else if (kind === 'dot') { g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 22, 0, TAU); g.fill(); }
  else if (kind === 'z') { g.fillStyle = '#e8ddff'; g.font = 'bold 50px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('z', 32, 34); }
  else { g.fillStyle = '#ffe27a'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 28; g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.fill(); }
  return new THREE.CanvasTexture(c);
}
const TEX = { heart: shapeTex('heart'), star: shapeTex('star'), dot: shapeTex('dot'), z: shapeTex('z') };
const parts = [];
function burst(p, n, kind, o) {
  o = o || {};
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX[kind], transparent: true, depthWrite: false, color: o.color || 0xffffff }));
    const sz = (o.size || 0.014) * (0.7 + Math.random() * 0.6); sp.scale.setScalar(sz); sp.position.copy(p); scene.add(sp);
    const a = Math.random() * TAU, sp2 = (o.v || 0.12) * (0.5 + Math.random());
    const v = o.dir ? o.dir.clone().multiplyScalar(sp2 * 2).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.05, (Math.random() - 0.5) * 0.08)) : new THREE.Vector3(Math.cos(a) * sp2, (o.up ?? 0.1) + Math.random() * 0.1, Math.sin(a) * sp2);
    parts.push({ sp, v, life: o.life || 1, t: 0, g: o.g ?? 0.05 });
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
function floatText(p, msg, color) { const el = document.createElement('div'); el.className = 'float'; el.textContent = msg; if (color) el.style.color = color; $('#overlay').appendChild(el); floats.push({ el, p: p.clone(), t: 0 }); }
const vTmp = new THREE.Vector3();
function toScreen(p) { const cam = viewCam(); vTmp.copy(p).project(cam); return { x: (vTmp.x + 1) / 2 * window.innerWidth, y: (1 - vTmp.y) / 2 * window.innerHeight, front: vTmp.z < 1 }; }
function tickFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; const s = toScreen(f.p);
    f.el.style.transform = 'translate(' + (s.x - 70) + 'px,' + (s.y - 40 - f.t * 50) + 'px)'; f.el.style.opacity = String(1 - Math.max(0, f.t - 0.9) / 0.6);
    if (f.t > 1.5) { f.el.remove(); floats.splice(i, 1); }
  }
}
/* One sheet at a time, sliding up from the bottom. Buttons with data-do call the handler of that name. */
let sheetH = null;
function openSheet(html, handlers) { const el = $('#sheet'); el.innerHTML = html; sheetH = handlers || {}; el.classList.add('on'); el.scrollTop = 0; }
function closeSheet() { $('#sheet').classList.remove('on'); sheetH = null; }
$('#sheet').addEventListener('click', e => { const b = e.target.closest('[data-do]'); if (!b || b.disabled || !sheetH) return; audio(); const f = sheetH[b.dataset.do]; if (f) f(b.dataset.arg, b); });
const sheetOpen = () => $('#sheet').classList.contains('on');

function meter(id, v) { const el = $(id); el.style.width = clamp(v, 0, 100) + '%'; el.classList.toggle('low', v < 30); }
function hud() {
  const p = S.pet; meter('#joy', p.joy); meter('#belly', p.belly); meter('#rest', p.rest);
  const n = Object.keys(PET_TRICKS).filter(k => (p.tricks[k] || 0) >= LEARN_AT).length; $('#tricks-n').textContent = n + ' of 8';
  $('#dust').textContent = Math.floor(S.dust) + ' stardust · bond ' + petLevel(p.xp);
  $('#sleep').textContent = p.asleep ? 'Wake' : 'Sleep';
  if (!berryEl || !(S.pantry[berryEl] > 0)) berryEl = ELS.filter(k => S.pantry[k] > 0).sort((a, b) => S.pantry[b] - S.pantry[a])[0] || null;
  const total = ELS.reduce((n, k) => n + (S.pantry[k] || 0), 0);
  $('#berry').style.setProperty('--h', berryEl ? EL_HUE[berryEl] : 330);
  $('#berry-name').textContent = berryEl ? BERRY[berryEl] + ' ×' + S.pantry[berryEl] : 'No berries';
  $('#berry-change').hidden = ELS.filter(k => S.pantry[k] > 0).length < 2;
  $('#berry').classList.toggle('empty', !total);
}

/* ---------- cameras and rays ---------- */
function viewCam() { if (mode === 'ar') { const xc = renderer.xr.getCamera(); return xc.cameras && xc.cameras[0] ? xc.cameras[0] : xc; } return camera; }
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function rayAt(x, y) { ndc.set(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1); ray.setFromCamera(ndc, viewCam()); return ray; }
function hitAt(x, y, list) { if (!world.visible) return null; const h = rayAt(x, y).intersectObjects(list, false); return h.length ? h[0] : null; }
const camPos = new THREE.Vector3(), camQ = new THREE.Quaternion();
function camPose() { const c = viewCam(); c.updateMatrixWorld(); c.matrixWorld.decompose(camPos, camQ, vTmp); return camPos; }
const headP = new THREE.Vector3();
function head() { return C.headWorld(headP).clone(); }
function faceCamera() { camPose(); world.rotation.y = mode === 'ar' ? Math.atan2(camPos.x - world.position.x, camPos.z - world.position.z) : 0; }

/* ---------- building the nest ---------- */
function rebuild() {
  if (C) nest.remove(C.root);
  look = petLook(S.pet); C = buildCreature(look, SIZE); nest.add(C.root);
  const st = stageOf(petLevel(S.pet.xp || 0));
  $('#name').textContent = S.pet.name;
  $('#form').textContent = look.form ? FORMS[look.form].name : STAGES[st];
  $('#menu-name').textContent = S.pet.name + ', ' + ($('#form').textContent).toLowerCase() + (S.littles.length ? ', and ' + S.littles.length + ' little' + (S.littles.length > 1 ? 's' : '') : '');
  buildLittles(); buildEggs(); hud();
}
function homeSpot(i, n) { const a = n > 1 ? -1.25 + 2.5 * i / (n - 1) : 0.9; return new THREE.Vector3(Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.05 + 0.035); }
function buildLittles() {
  for (const f of LC) nest.remove(f.c.root);
  LC = S.littles.map((l, i) => { const c = buildCreature(lookOf(l), LSIZE * (littleLevel(l.xp || 0) >= 6 ? 1.12 : 1)); const home = homeSpot(i, S.littles.length); c.root.position.copy(home); nest.add(c.root); return { l, c, home, off: home.clone(), yaw: 0, trick: null, hopT: 4 + Math.random() * 8, mood: null, moodT: 0 }; });
}
const eggGeo = new THREE.SphereGeometry(1, 24, 16);
function buildEggs() {
  for (const g of EG) nest.remove(g.mesh);
  EG = S.eggs.map((e, i) => {
    const m = new THREE.Mesh(eggGeo, new THREE.MeshToonMaterial({ color: new THREE.Color().setHSL(e.hue / 360, 0.6, 0.82), emissive: new THREE.Color().setHSL(e.hue / 360, 1, 0.5), emissiveIntensity: 0 }));
    m.scale.set(0.022, 0.03, 0.022); const home = new THREE.Vector3(0.1 + (i % 2) * 0.045, 0.03, 0.1 + Math.floor(i / 2) * 0.045); m.position.copy(home); nest.add(m);
    if (e.twin) { const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffe27a })); band.rotation.x = Math.PI / 2; m.add(band); }
    return { e, mesh: m, home };
  });
}
const littlesOn = () => LC.map(f => f.c.hits).flat();

/* ---------- care, by the game's rules ---------- */
function setMood(m, t) { A.mood = m; A.moodT = t; }
function knows(k) { return (S.pet.tricks[k] || 0) >= LEARN_AT; }
function gainXp(n) {
  const p = S.pet, before = petLevel(p.xp); p.xp += n; const after = petLevel(p.xp);
  if (after <= before) return null;
  const s0 = stageOf(before), s1 = stageOf(after); if (s1 >= 3 && !p.form) p.form = formFor(p, p.visits);
  rebuild(); sfx('grow'); if (world.visible && mode !== 'menu' && !questActive()) burst(head(), 30, 'star', { v: 0.15, up: 0.15 });
  const grew = s1 >= 3 ? 'a Mythic ' + FORMS[p.form].name + ', with ' + FORMS[p.form].text : 'a ' + STAGES[s1];
  const line = s1 > s0 ? p.name + ' grew into ' + grew + '!' : p.name + ' reached bond level ' + after + '.';
  toast(line, 4200); return line;
}
function eat(el) {
  const p = S.pet; p.belly = clamp(p.belly + 18, 0, 100); p.joy = clamp(p.joy + 3, 0, 100);
  for (const k in p.diet) p.diet[k] *= 0.88; p.diet[el] = (p.diet[el] || 0) + 1; p.ate[el] = (p.ate[el] || 0) + 1;
  const was = look.feats.join(); if (!gainXp(1)) { const nl = petLook(p); if (nl.feats.join() !== was || Math.abs(nl.hue - look.hue) > 4) rebuild(); }
  if (look.feats.join() !== was && look.feats.length) toast(p.name + ' is taking on a ' + KINDS[look.feats[0]].label + ' glow.', 3000);
  save(); hud();
}
function strokeTick(spot, p) {
  if (S.pet.asleep) return;
  S.pet.joy = Math.min(100, S.pet.joy + 1.3); A.strokes++;
  if (A.strokes % 2 === 0) burst(p, 1, 'heart', { v: 0.03, up: 0.08, g: -0.02, life: 1.1 });
  if (spot === 'head') { A.squash = Math.max(A.squash, 0.06); setMood('happy', 1.1); }
  else if (spot === 'tummy') { A.wiggle = 0.7; setMood('happy', 1); }
  else A.tilt = (spot === 'left' ? -1 : 1) * 0.12;
  if (spot === favSpot(S.pet.seed)) {
    burst(p, 3, 'star', { v: 0.06, up: 0.06, size: 0.01, g: 0 });
    if (A.strokes % 2 === 0) sfx('purr');
    const day = localDay(); if (!S.spot || S.spot.day !== day) S.spot = { day, found: false };
    if (!S.spot.found) { S.spot.found = true; sfx('pop'); toast('That\'s the spot! ' + S.pet.name + ' loves a stroke on ' + SPOTS[spot] + ' today.', 3600); }
  }
  praiseTrick(); hud();
}
function doTrick(k, self) {
  if (A.trick || toss || S.pet.asleep) return;
  const good = knows(k), T0 = PET_TRICKS[k];
  A.trick = { k, t: 0, good, dur: k === 'chase' || k === 'roll' ? 1.8 : PET_TRICK_TIME + 0.2, fx: false };
  sfx(good ? 'chirp' : 'try');
  if (good) {
    LC.forEach((f, i) => setTimeout(() => { if (!f.trick && !S.pet.asleep) f.trick = { k: LITTLE_TRICK[f.l.kind], t: 0, good: true, dur: 1.3 }; }, 150 + i * 120));
    if (self) floatText(head(), T0.does[0].toUpperCase() + T0.does.slice(1) + '!'); else toast(S.pet.name + ' ' + T0.does + '!', 1800); return;
  }
  A.praise = { k, until: T + A.trick.dur + 4, done: false };
  const n = S.pet.tricks[k] || 0;
  toast(S.pet.name + ' ' + T0.tries + '. Stroke it to praise it' + (n ? ' (' + n + ' of ' + LEARN_AT + ')' : '') + '.', 3000);
}
function praiseTrick() {
  const pr = A.praise; if (!pr || pr.done || T > pr.until) return;
  pr.done = true; const n = S.pet.tricks[pr.k] = Math.min(LEARN_AT, (S.pet.tricks[pr.k] || 0) + 1);
  floatText(head(), n >= LEARN_AT ? 'Learned!' : n + ' of ' + LEARN_AT);
  if (n >= LEARN_AT) { sfx('grow'); burst(head(), 22, 'star', { v: 0.15, up: 0.15, life: 1.1 }); toast(S.pet.name + ' has learned to ' + PET_TRICKS[pr.k].name + '! Draw ' + PET_TRICKS[pr.k].shape + ' and it will.', 4200); A.praise = null; }
  hud(); save();
}
const ease = u => u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
/* How a trick poses a creature of size s at this moment. fx(kind) is called once, halfway, for its sparkle. */
function trickPose(o, tr, s, fx) {
  const u = clamp(tr.t / tr.dur, 0, 1), e = ease(u), g = tr.good, s1 = Math.sin(Math.PI * u);
  switch (tr.k) {
    case 'spin': o.spin = g ? e * TAU : s1 * 1.3; o.lift += s1 * s * (g ? 0.12 : 0.04); if (g) o.mood = 'happy'; break;
    case 'wiggle': o.wiggle = (g ? 1.2 : 0.5) * s1; o.mood = 'happy'; break;
    case 'leap': { const air = u < 0.15 || u > 0.85 ? 0 : Math.sin(Math.PI * (u - 0.15) / 0.7); o.lift += air * s * (g ? 1.2 : 0.36); o.squash = u < 0.15 ? 0.16 * Math.sin(Math.PI * u / 0.15) : u > 0.85 ? 0.16 * Math.sin(Math.PI * (u - 0.85) / 0.15) : -0.08 * air; if (g) o.mood = 'happy'; break; }
    case 'bow': o.pitch = s1 * (g ? 0.6 : 0.22); o.mood = u > 0.3 && u < 0.7 ? 'happy' : o.mood; break;
    case 'kiss': o.pitch = s1 * (g ? 0.3 : 0.12); o.mood = 'happy'; if (!tr.fx && u > 0.5) { tr.fx = true; fx && fx('kiss'); } break;
    case 'roll': o.roll = g ? -e * TAU : -s1 * 0.8; o.dx = s1 * s * (g ? 0.6 : 0.2); o.lift += Math.abs(Math.sin(o.roll)) * s * 0.25; o.mood = 'happy'; break;
    case 'chase': { const r = s * 0.3, a = g ? e * 2 * TAU : s1 * Math.PI * 0.7; o.dx = Math.sin(a) * r; o.dz = (Math.cos(a) - 1) * r; o.spin = a + Math.PI / 2 * Math.min(1, u * 6, (1 - u) * 6); o.lift += Math.abs(Math.sin(u * 40)) * s * 0.05; o.mood = 'happy'; break; }
    case 'pose': o.stretch = s1 * (g ? 0.18 : 0.07); o.tilt += s1 * (g ? 0.28 : 0.1); o.mood = 'happy'; if (g && !tr.fx && u > 0.45) { tr.fx = true; fx && fx('pose'); } break;
  }
}
const petFx = k => { if (k === 'kiss') { camPose(); const d = camPos.clone().sub(head()).normalize(); burst(head(), A.trick && A.trick.good ? 6 : 1, 'heart', { dir: d, v: 0.08, g: 0, life: 1.4, size: 0.02 }); } else burst(head(), 14, 'star', { v: 0.12, up: 0.1 }); };

/* ---------- sleep ---------- */
function setSleep(on) {
  const p = S.pet; if (on === p.asleep) return; p.asleep = on;
  if (on) { A.trick = null; stopRoam(); if (roam.cling) roamHome(); toast(p.name + ' curls up and falls asleep. Rest fills fifteen times as fast. Tap it to wake it.', 3400); }
  else { setMood('happy', 1.2); A.squash = 0.12; toast(p.name + ' wakes with a stretch.' + (p.rest >= TRAVEL_REST ? ' It is rested enough to travel.' : ''), 2600); }
  sfx(on ? 'try' : 'chirp'); hud(); save();
}

/* ---------- eggs and hatching: rubbed warm, as in the game ---------- */
function warmEgg(g, p) {
  g.e.warm = Math.min(100, (g.e.warm || 0) + 9); burst(p, 1, 'heart', { v: 0.02, up: 0.05, g: -0.02, life: 0.8, size: 0.01 });
  if (g.e.warm >= 100) hatch(g);
}
function hatch(g) {
  const e = g.e, r = RNG(e.seed || 1), ks = Object.keys(KINDS), k = r.pick(ks), k2 = e.twin ? r.pick(ks.filter(x => x !== k)) : undefined;
  const l = newLittle(k, r, k2); S.eggs.splice(S.eggs.indexOf(e), 1); S.littles.push(l);
  const at = g.mesh.getWorldPosition(new THREE.Vector3()); burst(at, 30, 'star', { v: 0.15, up: 0.12 }); sfx('win');
  rebuild(); save();
  toast('It hatched! Meet ' + l.name + ', ' + (k2 ? 'a twin ' + KINDS[k].label + ' and ' + KINDS[k2].label + ' little' : 'a little ' + KINDS[k].species) + '. ' + KINDS[k].does + '.', 4600);
}

/* ---------- catch: a berry flicked up flies in an arc, and it leaps to catch it ---------- */
const berryMat = new THREE.MeshToonMaterial({ color: 0xd8326b });
const berryMesh = (() => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), berryMat); const l = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshToonMaterial({ color: 0x3fa35a })); l.scale.set(0.006, 0.002, 0.003); l.position.y = 0.011; g.add(b, l); return g; })();
const GRAV = 3.2;
function launch(vx, vy) {
  if (toss || !world.visible || questActive()) return;
  const p = S.pet;
  if (p.asleep) { toast(p.name + ' is asleep. Tap it to wake it.'); return; }
  if (!berryEl) { toast('The pantry is empty. Every world you visit has berries.', 3000); return; }
  if (p.belly >= 97) { toast(p.name + ' is full.'); sfx('no'); return; }
  S.pantry[berryEl]--; const el = berryEl; hud();
  berryMat.color.setHSL(EL_HUE[el] / 360, 0.75, 0.55);
  camPose();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQ), down = new THREE.Vector3(0, -1, 0).applyQuaternion(camQ);
  const start = camPos.clone().addScaledVector(fwd, 0.12).addScaledVector(down, 0.06);
  const home = world.localToWorld(A.off.clone()), mouthY = home.y + C.size.h * 1.7;
  const hor = new THREE.Vector3(home.x - start.x, 0, home.z - start.z), dist = hor.length();
  const power = clamp(vy / 1600, 0.45, 1.6), f = clamp(0.5 + 0.5 * power, 0.72, 1.3);
  const side = new THREE.Vector3(right.x, 0, right.z).normalize();
  const aimP = new THREE.Vector3(start.x, 0, start.z).addScaledVector(hor, f).addScaledVector(side, clamp(vx / Math.max(vy, 1), -1, 1) * dist * 0.35);
  const Tf = clamp(0.45 + 0.4 * dist, 0.55, 1.1);
  const v = new THREE.Vector3((aimP.x - start.x) / Tf, (mouthY - start.y + 0.5 * GRAV * Tf * Tf) / Tf, (aimP.z - start.z) / Tf);
  const aimLocal = world.worldToLocal(new THREE.Vector3(aimP.x, home.y, aimP.z)); aimLocal.y = A.off.y;
  // it can reach a berry coming down within 20 cm of it, on the surface it stands on (and never from a wall)
  const near = Math.hypot(aimLocal.x - A.off.x, aimLocal.z - A.off.z) < 0.2, under = room.under(aimLocal.x, aimLocal.z, A.off.y + 0.05, 0.1);
  const reach = near && !roam.cling && !game.k && (!!under || !room.surfs.length);
  scene.add(berryMesh); berryMesh.position.copy(start); berryMesh.visible = true; berryMesh.scale.setScalar(1);
  toss = { v, t: 0, T: Tf, reach, el, caught: false, landed: false, restT: 0, floorY: home.y };
  stopRoam(); if (reach) roam.plan.push({ k: 'walk', to: aimLocal, speed: dist => { const left = toss && !toss.caught ? Math.max(0.05, toss.T - 0.25 - toss.t) : 0.8; return Math.min(dist / left, 0.6); } });
  sfx('toss');
}
function tickToss(dt) {
  if (!toss) return;
  const q = toss; q.t += dt;
  if (!q.caught && !q.landed) {
    const ground = groundUnder(berryMesh.position, q);     // what is under it before this step, so it cannot drop through
    q.v.y -= GRAV * dt; berryMesh.position.addScaledVector(q.v, dt); berryMesh.rotation.x += dt * 8;
    if (q.reach && q.t >= q.T) {
      q.caught = true; berryMesh.visible = false; scene.remove(berryMesh);
      eat(q.el); catchRun++; S.j.catchBest = Math.max(S.j.catchBest || 0, catchRun);
      setMood('eat', 1.2); sfx('munch'); floatText(head(), catchRun > 1 ? catchRun + ' in a row!' : 'Caught!');
      if (catchRun === 10) toast('Ten catches in a row!', 3000);
      setTimeout(() => { if (toss === q) toss = null; backToMiddle(); }, 1200);
    } else if (berryMesh.position.y <= ground + 0.011 && q.v.y < 0) {
      q.floorY = ground;
      if (Math.abs(q.v.y) > 0.4 && !q.bounced) { q.bounced = true; q.v.y *= -0.3; q.v.x *= 0.25; q.v.z *= 0.25; berryMesh.position.y = q.floorY + 0.011; }
      else if (q.surf && roam.on && !S.pet.asleep && !game.k) fetchBerry(q);
      else { q.landed = true; berryMesh.position.y = q.floorY + 0.011; catchRun = 0; setMood('sad', 1.2); sfx('miss'); S.pantry[q.el] = (S.pantry[q.el] || 0) + 1; hud(); toast(S.pet.name + ' missed it, so it goes back in the pantry. Flick harder or softer.', 2600); }
    }
    if (berryMesh.position.y < q.floorY - 1) { q.landed = true; }
  } else if (q.landed) { q.restT += dt; berryMesh.scale.setScalar(Math.max(0.01, 1 - Math.max(0, q.restT - 1) * 2)); if (q.restT > 1.5) { scene.remove(berryMesh); berryMesh.scale.setScalar(1); toss = null; backToMiddle(); } }
  else if (q.fetch && q.restT > 20) { scene.remove(berryMesh); toss = null; S.pantry[q.el] = (S.pantry[q.el] || 0) + 1; hud(); }
  if (q.fetch) q.restT += dt;
}
/* The height of whatever is under a falling berry: a surface of the room, or the height it was thrown at. */
function groundUnder(wp, q) {
  if (!room.surfs.length) return q.floorY;
  const l = world.worldToLocal(wp.clone()), u = room.under(l.x, l.z, l.y, 5); q.surf = u ? u.s : null;
  return u ? world.position.y + u.y : q.floorY - 2;
}
/* A berry that lands somewhere in the room: it runs over, eats it there and comes back pleased. */
function fetchBerry(q) {
  q.landed = false; q.caught = true; q.fetch = true; q.restT = 0; catchRun = 0; berryMesh.position.y = q.floorY + 0.011;
  const at = world.worldToLocal(berryMesh.position.clone()); at.y = q.surf.y + q.surf.shift.y;
  const off = new THREE.Vector3(A.off.x - at.x, 0, A.off.z - at.z); off.setLength(Math.min(0.05, off.length()));
  toast(S.pet.name + ' runs to fetch it.', 1800);
  goTo(q.surf, at.clone().add(off), { run: true, then: () => {
    if (toss !== q) return; scene.remove(berryMesh); toss = null; eat(q.el); setMood('eat', 1.2); sfx('munch'); floatText(head(), 'Fetched it!');
  } });
}
/* After a catch on the nest's table, back to the middle; out in the room it stays where it is. */
function backToMiddle() { if (!roam.on && !away() && !busy()) roam.plan.push({ k: 'walk', to: new THREE.Vector3(0, 0, 0) }); }
const busy = () => !!(roam.step || roam.plan.length);

/* ---------- each frame, in the nest ---------- */
const tl = new THREE.Vector3();
function yawTo(fromLocal, targetWorld) { tl.copy(targetWorld); world.worldToLocal(tl); return Math.atan2(tl.x - fromLocal.x, tl.z - fromLocal.z); }
function turn(cur, want, k) { let da = want - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; return cur + da * k; }
const blank = () => ({ lift: 0, squash: 0, tilt: 0, pitch: 0, roll: 0, spin: 0, dx: 0, dz: 0, wiggle: 0, stretch: 0, lean: 0, mood: null });
function tickNest(dt) {
  const p = S.pet, o = blank();
  if (A.moodT > 0) { A.moodT -= dt; o.mood = A.mood; }
  A.squash = Math.max(0, A.squash - dt * 0.15); A.tilt *= Math.pow(0.02, dt); A.wiggle = Math.max(0, A.wiggle - dt);
  o.squash = A.squash; o.tilt = A.tilt; o.wiggle = A.wiggle;
  if (p.asleep) { o.mood = 'sleep'; o.squash = 0.08 + Math.sin(T * 1.5) * 0.02; if (Math.random() < dt * 0.6) burst(head().add(new THREE.Vector3(0.02, 0.03, 0)), 1, 'z', { v: 0.005, up: 0.03, g: -0.01, life: 2, size: 0.02 }); }
  // a hug: a finger held still on it
  if (ptr && ptr.what === 'pet' && ptr.moved < 10 && T - ptr.t0 > 0.6 && !p.asleep) {
    o.lean = 0.15; o.mood = 'happy'; A.hugT += dt;
    if (A.hugT > 0.7) { A.hugT = 0; strokeTick(ptr.spot, ptr.hit); }
    if (!ptr.big && T - ptr.t0 > 3.6) { ptr.big = true; const hp = head(); for (let i = 0; i < 10; i++) burst(hp, 1, 'heart', { v: 0.1, up: 0.05, g: 0, life: 1.3 }); sfx('grow'); toast('A big hug!', 1600); }
  }
  if (A.trick) { A.trick.t += dt; trickPose(o, A.trick, SIZE, petFx); if (A.trick.t >= A.trick.dur) A.trick = null; }
  if (!A.trick && !ptr && !toss && !p.asleep && p.joy >= 60) { A.selfT -= dt; if (A.selfT <= 0) { A.selfT = 40 + Math.random() * 40; const ks = Object.keys(PET_TRICKS).filter(knows); if (ks.length) doTrick(ks[(Math.random() * ks.length) | 0], true); } }
  roamMove(dt, o, !!(A.trick || ptr || toss || game.k || sheetOpen()));
  if (toss && toss.reach && !toss.caught) { const left = toss.T - toss.t; if (left < 0.3) { o.lift += Math.sin(Math.PI * clamp(1 - left / 0.3, 0, 1) * 0.5) * 0.03; o.squash -= 0.05; } o.mood = 'idle'; }
  C.root.position.copy(A.off);
  camPose(); const target = roam.face ? world.localToWorld(roam.face.clone()) : toss && !toss.caught && !toss.landed ? berryMesh.position : camPos;
  A.yaw = turn(A.yaw, yawTo(A.off, target), Math.min(1, dt * 6)); C.root.rotation.y = A.yaw;
  if (popT < 1) { popT = Math.min(1, popT + dt * 2.5); const k = popT < 0.7 ? popT / 0.7 * 1.15 : 1.15 - (popT - 0.7) / 0.3 * 0.15; nest.scale.setScalar(Math.max(0.001, k)); }
  C.update(dt, T, o);
  // the littles: near the Glimmerkin, hopping about now and then, doing their kind's trick, curled up at bedtime
  LC.forEach((f, i) => {
    const lo = blank(), n = Math.max(1, LC.length - 1), a = -1.2 + 2.4 * i / n;
    const want = p.asleep ? new THREE.Vector3(Math.sin(a) * 0.08, 0, Math.cos(a) * 0.05 + 0.02).add(away() ? new THREE.Vector3() : A.off) : f.home;
    if (!p.asleep && (f.hopT -= dt) < 0) { f.hopT = 6 + Math.random() * 10; f.home = homeSpot(i, LC.length).add(new THREE.Vector3((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.04)); }
    const d = want.clone().sub(f.off), dist = d.length(); if (dist > 0.002) { f.off.addScaledVector(d.normalize(), Math.min(dist, 0.12 * dt)); lo.lift += Math.abs(Math.sin(T * 14 + i)) * 0.008; }
    if (f.moodT > 0) { f.moodT -= dt; lo.mood = f.mood; }
    if (p.asleep) { lo.mood = 'sleep'; lo.squash = 0.1; }
    if (f.trick) { f.trick.t += dt; trickPose(lo, f.trick, LSIZE); if (f.trick.t >= f.trick.dur) f.trick = null; }
    f.c.root.position.copy(f.off); f.yaw = turn(f.yaw, yawTo(f.off, dist > 0.01 && !p.asleep ? world.localToWorld(want.clone()) : camPos), Math.min(1, dt * 5)); f.c.root.rotation.y = f.yaw;
    f.c.update(dt, T + i * 1.7, lo);
  });
  for (const g of EG) { const w = (g.e.warm || 0) / 100; g.mesh.material.emissiveIntensity = w * 0.5; g.mesh.position.y = g.home.y + (w > 0.5 ? Math.abs(Math.sin(T * 8)) * 0.004 * w : 0); g.mesh.rotation.z = w > 0.3 ? Math.sin(T * 12) * 0.12 * w : 0; }
}
function tick(dt) {
  T += dt;
  const p = S.pet;
  // needs, as in the game: Belly 1 per 6 min, Joy 1 per 4 min 40 s, Rest 1 a minute awake and 1 every 4 seconds asleep
  p.belly = Math.max(0, p.belly - dt / 360); p.joy = Math.max(0, p.joy - dt / 280); p.rest = Math.min(100, p.rest + dt / (p.asleep ? 4 : 60));
  if ((saveT += dt) > 5) { saveT = 0; save(); hud(); }
  tickAnims(dt);
  if (questActive()) questTick(dt, T); else { tickNest(dt); tickPlay(dt); }
  tickArrow();
  tickParts(dt); tickFloats(dt); tickToss(dt);
}

/* ---------- touch ---------- */
let ptr = null;
const draw = $('#draw'), dg = draw.getContext('2d');
function sizeDraw() { const d = Math.min(2, window.devicePixelRatio || 1); draw.width = window.innerWidth * d; draw.height = window.innerHeight * d; dg.setTransform(d, 0, 0, d, 0, 0); }
sizeDraw();
function drawPath() {
  dg.clearRect(0, 0, window.innerWidth, window.innerHeight); if (!ptr || ptr.what || ptr.path.length < 2 || ptr.moved < 12) return;
  dg.lineCap = 'round'; dg.lineJoin = 'round'; dg.strokeStyle = 'rgba(255,207,107,.85)'; dg.lineWidth = 5; dg.beginPath(); ptr.path.forEach((q, i) => i ? dg.lineTo(q.x, q.y) : dg.moveTo(q.x, q.y)); dg.stroke();
}
/* What a finger is on, in the nest: the Glimmerkin, a little, an egg, or open space. */
function whatAt(x, y) {
  if (!placed || questActive()) return null;
  const h = hitAt(x, y, C.hits.concat(littlesOn(), EG.map(g => g.mesh))); if (!h) return null;
  if (C.hits.includes(h.object)) return { what: 'pet', hit: h.point, spot: C.spotAt(h.point) };
  const g = EG.find(z => z.mesh === h.object); if (g) return { what: 'egg', egg: g, hit: h.point };
  const f = LC.find(z => z.c.hits.includes(h.object)); return f ? { what: 'little', little: f, hit: h.point } : null;
}
const touch = $('#touch');
touch.addEventListener('pointerdown', e => {
  if (mode === 'menu') return; audio(); e.preventDefault();
  if (ptr) return;
  if (!questActive() && playTap(e.clientX, e.clientY)) return;      // a tap that finds the Glimmerkin or an egg touch.setPointerCapture && touch.setPointerCapture(e.pointerId);
  const w = whatAt(e.clientX, e.clientY) || {};
  ptr = Object.assign({ id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: T, path: [{ x: e.clientX, y: e.clientY }], moved: 0, acc: 0, big: false }, w);
  A.hugT = 0;
});
touch.addEventListener('pointermove', e => {
  if (!ptr || e.pointerId !== ptr.id) return;
  const d = Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y); ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved += d;
  if (ptr.what) {
    const w = whatAt(e.clientX, e.clientY);
    if (w && w.what === ptr.what && w.little === ptr.little && w.egg === ptr.egg) {
      ptr.hit = w.hit; if (w.spot) ptr.spot = w.spot; ptr.acc += d;
      while (ptr.acc >= 34) {
        ptr.acc -= 34;
        if (ptr.what === 'pet') strokeTick(ptr.spot, w.hit);
        else if (ptr.what === 'egg') { warmEgg(ptr.egg, w.hit); if (!S.eggs.includes(ptr.egg.e)) { ptr.what = 'gone'; break; } }
        else { burst(w.hit, 1, 'heart', { v: 0.02, up: 0.06, g: -0.02, life: 0.9, size: 0.01 }); ptr.little.mood = 'happy'; ptr.little.moodT = 0.8; }
      }
    }
  } else if (!questActive()) { ptr.path.push({ x: e.clientX, y: e.clientY }); drawPath(); }
});
function littleLine(l) { return l.name + ', ' + (l.kind2 ? 'a twin ' + KINDS[l.kind].label + ' and ' + KINDS[l.kind2].label : 'a ' + KINDS[l.kind].species) + ', level ' + littleLevel(l.xp || 0) + ', carries ' + maxSparks(l) + ' sparks. ' + KINDS[l.kind].does + (l.kind2 ? ', and ' + KINDS[l.kind2].does.toLowerCase() : '') + '.'; }
function endPtr(e) {
  if (!ptr || e.pointerId !== ptr.id) return;
  const q = ptr; ptr = null; dg.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (!placed) { if (q.moved < 24) placeHere(); return; }
  if (questActive()) { if (q.moved < 14) questTap(q.x0, q.y0); return; }
  if (q.what === 'pet') { if (q.moved < 10 && T - q.t0 < 0.4) { if (S.pet.asleep) setSleep(false); else { setMood('happy', 0.8); A.squash = 0.1; sfx('pop'); } } return; }
  if (q.what === 'little') { if (q.moved < 10) { const f = q.little; f.trick = { k: 'leap', t: 0, good: true, dur: 0.8 }; sfx('chirp'); toast(littleLine(f.l), 3600); } return; }
  if (q.what === 'egg') { if (q.moved < 10) toast('An egg, ' + (q.egg.e.warm || 0) + ' warm of 100. Rub it with a finger to warm it.', 2600); return; }
  if (q.what) return;
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
$('#berry-change').addEventListener('click', e => { e.stopPropagation(); const have = ELS.filter(k => S.pantry[k] > 0); if (have.length < 2) return; berryEl = have[(have.indexOf(berryEl) + 1) % have.length]; hud(); });

/* ---------- AR ---------- */
let xrSession = null, hitSource = null, lastHit = null, anchor = null, arOK = false, scanSources = [], scanT = 0, scanN = 0, hasDepth = false;
const mHit = new THREE.Matrix4(), pHit = new THREE.Vector3(), nHit = new THREE.Vector3(), qHit = new THREE.Quaternion(), sHit = new THREE.Vector3();
/* A hit test result into the room map, in the nest's frame. */
function learn(r, ref) {
  const pose = r.getPose(ref); if (!pose) return;
  mHit.fromArray(pose.transform.matrix); mHit.decompose(pHit, qHit, sHit); nHit.set(0, 1, 0).applyQuaternion(qHit);
  const p = world.worldToLocal(pHit.clone()), n = nHit.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -world.rotation.y);
  const got = room.add(p, n, s => { if (r.createAnchor) r.createAnchor().then(a => { s.anchor = a; }).catch(() => { }); });   // s.a0 is where it was seen, in the nest's frame
  if (got && scanT < 40 && Math.random() < 0.5) burst(pHit, 1, got === 'wall' ? 'star' : 'dot', { v: 0.004, up: 0.01, g: 0, life: 0.9, size: 0.012, color: got === 'wall' ? 0xb9f3ff : 0xffe27a });
}
function placeHere() {
  if (!lastHit) { toast('Move your phone slowly over a table until the gold ring shows.'); return; }
  const m = new THREE.Matrix4().fromArray(lastHit.pose.transform.matrix); world.position.setFromMatrixPosition(m); faceCamera();
  world.visible = true; placed = true; popT = 0; reticle.visible = false;
  room.seedNest(0.3); roamHome(); roam.on = true; roam.brainT = 8; scanT = 0; stopGame(true);
  anchor = null; if (lastHit.result.createAnchor) lastHit.result.createAnchor().then(a => { anchor = a; }).catch(() => { });
  sfx('chirp'); if (!questActive()) toast('Say hello to ' + S.pet.name + '. Now look slowly around the room: the floor, tables, the sofa, the walls. Wherever you look, it can go.', 5200);
  $('#place-hint').classList.remove('on');
}
async function startAR() {
  audio();
  try {
    const s = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'anchors', 'depth-sensing'], domOverlay: { root: $('#overlay') },
      depthSensing: { usagePreference: ['cpu-optimized'], dataFormatPreference: ['luminance-alpha', 'float32'] }
    });
    renderer.xr.setReferenceSpaceType('local'); await renderer.xr.setSession(s);
    xrSession = s; const viewer = await s.requestReferenceSpace('viewer'); hitSource = await s.requestHitTestSource({ space: viewer });
    // more rays, spread over the view, so looking around the room finds surfaces quickly
    scanSources = [];
    if (window.XRRay) for (const [x, y] of [[-0.35, 0.25], [0.35, 0.25], [-0.35, -0.3], [0.35, -0.3], [0, -0.45], [0, 0.4]]) {
      try { scanSources.push(await s.requestHitTestSource({ space: viewer, offsetRay: new XRRay({ x: 0, y: 0, z: 0, w: 1 }, { x, y, z: -1, w: 0 }) })); } catch (e) { }
    }
    s.addEventListener('end', () => { xrSession = null; hitSource = null; scanSources = []; anchor = null; lastHit = null; depth.stop(); leave(); });
    mode = 'ar'; placed = false; world.visible = false; table.visible = rim.visible = false; scene.background = null;
    $('#menu').classList.add('off'); setHud(); $('#move').hidden = false; $('#place-hint').classList.add('on');
    if (!s.domOverlayState) toast('This phone has no overlay for AR, so the buttons will not show.', 4000);
    try { hasDepth = s.enabledFeatures ? s.enabledFeatures.includes('depth-sensing') : !!s.depthUsage; } catch (e) { hasDepth = false; }
  } catch (e) { toast('AR could not start: ' + (e && e.message || e), 4000); }
}
function xrFrame(frame) {
  const ref = renderer.xr.getReferenceSpace(); if (!ref) return;
  if (hitSource) {
    const rs = frame.getHitTestResults(hitSource); lastHit = null;
    for (const r of rs) { const pose = r.getPose(ref); if (!pose) continue; const m = pose.transform.matrix; if (m[5] > 0.75) { lastHit = { result: r, pose }; break; } } // a flat, upward-facing surface
    reticle.visible = !placed && !!lastHit; if (lastHit) reticle.matrix.fromArray(lastHit.pose.transform.matrix);
    $('#place-hint').textContent = lastHit ? 'Tap to put ' + (questActive() ? 'the world' : S.pet.name) + ' here' : 'Move your phone slowly over a table or the floor';
  }
  if (anchor && frame.trackedAnchors && frame.trackedAnchors.has(anchor)) { const p = frame.getPose(anchor.anchorSpace, ref); if (p) world.position.setFromMatrixPosition(new THREE.Matrix4().fromArray(p.transform.matrix)); }
  world.updateMatrixWorld();
  // learning the room, once the nest is down
  if (placed && !questActive() && (scanN++ % 2 === 0)) {
    if (lastHit && hitSource) learn(lastHit.result, ref);
    else if (hitSource) for (const r of frame.getHitTestResults(hitSource)) { learn(r, ref); break; }
    for (const src of scanSources) { const rs = frame.getHitTestResults(src); if (rs.length) learn(rs[0], ref); }
  }
  if (placed && frame.trackedAnchors) room.follow(a => { if (!frame.trackedAnchors.has(a)) return null; const p = frame.getPose(a.anchorSpace, ref); return p ? world.worldToLocal(new THREE.Vector3().setFromMatrixPosition(mHit.fromArray(p.transform.matrix))) : null; });
  // the real world's depth, so real things cover the Glimmerkin
  if (hasDepth) { const vp = frame.getViewerPose(ref), bl = xrSession && xrSession.renderState.baseLayer; if (vp && vp.views.length && bl) depth.update(frame, vp.views[0], bl.framebufferWidth, bl.framebufferHeight); }
  if (placed && !questActive()) roomHint(); else $('#room-hint').classList.remove('on');
}
function roomHint() {
  const el = $('#room-hint'), flats = room.surfs.filter(s => s.cells.size >= 3 && s.kind !== 'nest').length, walls = room.walls.length;
  scanT += 1 / 60;
  if (scanT > 45 || game.k || sheetOpen()) { el.classList.remove('on'); return; }
  el.textContent = (flats || walls ? 'Found ' + (flats ? flats + ' surface' + (flats > 1 ? 's' : '') : '') + (flats && walls ? ' and ' : '') + (walls ? 'a wall' + (walls > 8 ? 's' : '') : '') + '. ' : '') + (flats < 2 ? 'Look slowly around the room, at the floor and the furniture.' : 'It can roam there now. Keep looking to show it more.');
  el.classList.add('on');
}
$('#overlay').addEventListener('beforexrselect', e => e.preventDefault());

/* ---------- is a point hidden from the camera by something real (or, in the preview, by the pretend room)? ---------- */
function hiddenFromCam(p) {
  if (mode === 'ar') return depth.ok ? depth.hidden(p, viewCam()) : null;
  const g = world.getObjectByName('preview-room'); if (!g || !g.visible) return null;
  camPose(); const d = p.clone().sub(camPos), len = d.length(); ray.set(camPos, d.normalize()); ray.far = len - 0.03;
  const h = ray.intersectObjects(g.userData.occluders.concat([table]), false); ray.far = Infinity; return h.length > 0;
}
/* A giggle from where it is: to the left or right, quieter when far away. */
function giggleAt(p) {
  const ac = audio(); if (!ac) return; camPose(); const rel = p.clone().sub(camPos), dist = rel.length(); rel.applyQuaternion(camQ.clone().invert());
  const pan = clamp(rel.x / Math.max(0.3, dist) * 1.4, -1, 1), vol = clamp(0.2 / Math.max(0.5, dist), 0.03, 0.2);
  const t = ac.currentTime, sp = ac.createStereoPanner ? ac.createStereoPanner() : null; if (sp) { sp.pan.value = pan; sp.connect(ac.destination); }
  [0, 0.11, 0.22, 0.36].forEach((a, i) => { const o = ac.createOscillator(), g = ac.createGain(), f = 900 + i * 120 + Math.random() * 60; o.type = 'sine'; o.frequency.setValueAtTime(f, t + a); o.frequency.exponentialRampToValueAtTime(f * 1.4, t + a + 0.08); g.gain.setValueAtTime(0.0001, t + a); g.gain.exponentialRampToValueAtTime(vol, t + a + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + a + 0.09); o.connect(g).connect(sp || ac.destination); o.start(t + a); o.stop(t + a + 0.1); });
}

/* ---------- an arrow at the edge of the screen when it is out of sight ---------- */
function tickArrow() {
  const el = $('#arrow');
  if (mode === 'menu' || questActive() || !placed || (game.k === 'seek') || !C.root.visible) { el.classList.remove('on'); return; }
  const at = head(), s = toScreen(at), W = window.innerWidth, H = window.innerHeight, m = 40;
  const inside = s.front && s.x > 0 && s.x < W && s.y > 70 && s.y < H - 60;
  if (inside) { el.classList.remove('on'); return; }
  let dx = s.x - W / 2, dy = s.y - H / 2; if (!s.front) { dx = -dx; dy = -dy; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; }
  const k = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(dx)), (H / 2 - m - 50) / Math.max(1e-3, Math.abs(dy)));
  const x = W / 2 + dx * k, y = H / 2 + dy * k, ang = Math.atan2(dy, dx);
  el.style.transform = 'translate(' + (x - 28) + 'px,' + (y - 28) + 'px)'; el.querySelector('i').style.transform = 'rotate(' + ang + 'rad)';
  el.querySelector('span').textContent = mode === 'ar' ? camPose().distanceTo(at).toFixed(1) + ' m' : '';
  el.classList.add('on');
}

/* ---------- the HUD for the nest and for a quest ---------- */
function setHud() { const q = questActive(); $('#come').hidden = q || !roam.on; document.body.classList.toggle('questing', q); $('#hud').classList.toggle('on', mode !== 'menu'); $('#nest-ui').hidden = q; $('#quest-ui').hidden = !q; nest.visible = !q; table.visible = rim.visible = mode !== 'ar' && !q; }

/* ---------- where to? ---------- */
function rollPortals(force) {
  const now = Date.now(); if (!force && S.portals && S.portals.list && S.portals.list.length === 3 && now - S.portals.at < 3 * 3600e3) return;
  const r = RNG((now % 2147483647) | 0), bs = r.shuffle(BIOMES.slice()).slice(0, 3), sizes = r.shuffle(S.quests < 1 ? ['nook', 'nook', 'vale'] : S.quests < 4 ? ['nook', 'vale', 'realm'] : ['vale', 'realm', 'realm']);
  S.portals = { at: now, list: bs.map((b, i) => ({ seed: r.int(1, 2147483646), biome: b.id, size: sizes[i], name: worldName(r, b) })) };
}
const SIZE_LABEL = { nook: 'a nook, small', vale: 'a vale', realm: 'a realm, large' };
function openWhere() {
  if (!S.littles.length) { toast('You need a little to travel with. Hatch an egg first.', 3000); return; }
  rollPortals(false); const p = S.pet;
  S.party = S.party.filter(id => S.littles.some(l => l.id === id)); if (!S.party.length) S.party = S.littles.slice(0, 3).map(l => l.id);
  const ready = p.rest >= TRAVEL_REST;
  const rows = S.portals.list.map((pt, i) => { const B = BIOMES.find(b => b.id === pt.biome); return '<button class="row portal" data-do="go" data-arg="' + i + '" style="--h:' + EL_HUE[B.el] + '"' + (ready ? '' : ' disabled') + '><b>' + esc(pt.name) + '</b><small>' + B.name + ', ' + SIZE_LABEL[pt.size] + ', home of the ' + BERRY[B.el] + '</small></button>'; }).join('');
  const party = S.littles.map(l => '<button class="chip' + (S.party.includes(l.id) ? ' on' : '') + '" data-do="pick" data-arg="' + l.id + '">' + esc(l.name) + ' <small>' + (l.kind2 ? KINDS[l.kind].label + ' + ' + KINDS[l.kind2].label : KINDS[l.kind].label) + ' · ' + maxSparks(l) + ' sparks</small></button>').join('');
  openSheet('<h2>Where to?</h2><p>' + (ready ? 'A quest takes 25 Rest. ' + esc(p.name) + ' has ' + Math.floor(p.rest) + '.' : esc(p.name) + ' is too tired to travel: ' + Math.floor(p.rest) + ' Rest of the 25 a quest needs.') + '</p>' + rows +
    '<h3>Who comes along</h3><p>Up to three littles. Each clears one kind of blocker.</p><div class="chips">' + party + '</div><div class="btns">' + (ready ? '' : '<button data-do="bed">' + (p.asleep ? 'Still asleep' : 'Put to bed') + '</button>') + '<button class="ghost" data-do="x">Not now</button></div>', {
    x: closeSheet,
    bed: () => { closeSheet(); setSleep(true); },
    pick: id => { const i = S.party.indexOf(id); if (i >= 0) { if (S.party.length > 1) S.party.splice(i, 1); } else { if (S.party.length >= 3) S.party.shift(); S.party.push(id); } openWhere(); },
    go: i => { closeSheet(); const pt = S.portals.list[+i]; if (p.asleep) setSleep(false); goQuest(pt); }
  });
}
function goQuest(pt) {
  const party = S.party.map(id => S.littles.find(l => l.id === id)).filter(Boolean);
  if (mode === 'ar') { roomYaw = world.rotation.y; faceCamera(); }   // the board faces you; the room's frame turns back afterwards
  toss = null; scene.remove(berryMesh); A.trick = null; stopGame(true); roamHome();
  startQuest(pt, party);
  setHud(); aimFor();
}
let roomYaw = null;
function aimFor() { if (mode === 'preview') aim(questActive() ? 'quest' : roam.on ? 'room' : 'nest'); }

/* ---------- menu, preview and leaving ---------- */
function preview() {
  audio(); mode = 'preview'; placed = true; world.visible = true; scene.background = BG; popT = 0; world.rotation.y = 0; roam.on = false; room.seedNest(0.3); roamHome();
  $('#menu').classList.add('off'); setHud(); $('#move').hidden = true; aimFor();
  if (!questActive()) toast('Stroke ' + S.pet.name + ', draw a shape on the sky for a trick, or flick a berry up from the button.', 3600);
}
function leave() {
  if (xrSession) { xrSession.end(); return; }
  stopGame(true); roam.on = false; previewRoom(room, world, false); room.reset(); roamHome(); setHud();
  mode = 'menu'; aim('menu'); placed = true; world.visible = true; world.position.set(0, 0, 0); world.rotation.y = 0; scene.background = BG; reticle.visible = false;
  $('#menu').classList.remove('off'); setHud(); $('#place-hint').classList.remove('on'); closeSheet(); save();
}
$('#start-ar').addEventListener('click', startAR);
$('#start-preview').addEventListener('click', preview);
$('#leave').addEventListener('click', e => { e.stopPropagation(); leave(); });
$('#move').addEventListener('click', e => { e.stopPropagation(); stopGame(true); placed = false; world.visible = false; anchor = null; $('#place-hint').classList.add('on'); });
$('#come').addEventListener('click', e => { e.stopPropagation(); audio(); callIt(); });
$('#play').addEventListener('click', e => { e.stopPropagation(); audio(); openPlay(); });
function callIt() {
  const p = S.pet; if (p.asleep) { toast(p.name + ' is asleep. Tap it to wake it.'); return; } if (game.k) return;
  if (mode === 'preview' && !roam.on) { toast(p.name + ' is right here. Turn on Roam the room to let it wander.'); return; }
  if (comeHere('Here I am!')) { sfx('chirp'); toast(p.name + ' is coming.', 1600); } else toast('Point the phone at the floor near you, so ' + p.name + ' can find its way.', 3000);
}
/* The Play sheet: hide and seek, the egg hunt, and roaming on or off. */
function openPlay() {
  const p = S.pet, j = S.j, nm = esc(p.name);
  const rows = game.k ? '<button class="row" data-do="stop"><b>Stop the game</b><small>' + (game.k === 'seek' ? 'Call ' + nm + ' out of hiding.' : 'Leave the eggs that are left.') + '</small></button>'
    : '<button class="row" data-do="seek"><b>Hide and seek</b><small>Cover your eyes and count to ten while ' + nm + ' hides somewhere in the room: under a table, behind the sofa. Listen for its giggle, then find it with the phone.' + (j.seekBest ? ' Best: ' + j.seekBest + ' s.' : '') + '</small></button>' +
      '<button class="row" data-do="eggs"><b>Egg hunt</b><small>' + nm + ' hides five glimmer eggs around the room. Each one you find is stardust and a berry.</small></button>';
  const roamRow = '<button class="row" data-do="roam"><b>' + (roam.on ? 'Keep it near the nest' : 'Roam the room') + '</b><small>' + (roam.on ? 'Now it wanders the room by itself: hopping between the floor, tables and seats, and up the walls.' : 'Let it wander the room by itself.') + (mode === 'preview' ? ' On this screen the room is a pretend one.' : '') + '</small></button>';
  openSheet('<h2>Play</h2><p>' + (mode === 'ar' ? (hasDepth ? 'This phone can see depth, so real furniture hides ' + nm + '.' : 'This phone has no depth sensing, so ' + nm + ' shows through furniture, but it still hides under tables and behind you.') : 'In the preview the room is pretend: a table, a stool and a wall.') + '</p>' + rows + roamRow + '<div class="btns"><button class="ghost" data-do="x">Not now</button></div>', {
    x: closeSheet,
    stop: () => { closeSheet(); stopGame(); },
    seek: () => { closeSheet(); ensureRoom(); startSeek(); },
    eggs: () => { closeSheet(); ensureRoom(); startEggs(5); },
    roam: () => { closeSheet(); setRoam(!roam.on); }
  });
}
function setRoam(on) {
  roam.on = on; stopRoam();
  if (mode === 'preview') { previewRoom(room, world, on); if (!on) room.seedNest(0.3); roamHome(); aimFor(); }
  else if (!on) { const n = room.surfs.find(s => s.kind === 'nest'); if (n) goTo(n, new THREE.Vector3(0, 0, 0)); }
  setHud(); toast(on ? S.pet.name + ' is off to explore.' : S.pet.name + ' stays by the nest.', 2000);
}
/* The games need a room: in the preview, the pretend one. */
function ensureRoom() { if (mode === 'preview' && !roam.on) { roam.on = true; previewRoom(room, world, true); roamHome(); aimFor(); setHud(); } }
$('#sleep').addEventListener('click', e => { e.stopPropagation(); setSleep(!S.pet.asleep); });
$('#where').addEventListener('click', e => { e.stopPropagation(); openWhere(); });
$('#tricks-btn').addEventListener('click', e => { e.stopPropagation(); openTricks(); });
function openTricks() {
  const rows = Object.entries(PET_TRICKS).map(([k, t]) => { const n = S.pet.tricks[k] || 0; return '<li><span><b>' + t.shape[0].toUpperCase() + t.shape.slice(1) + '</b> to ' + t.name + '</span><em>' + (n >= LEARN_AT ? 'Learned' : n + ' of ' + LEARN_AT) + '</em></li>'; }).join('');
  openSheet('<h2>Tricks</h2><p>Draw a shape on empty space and it tries. Stroke it straight after to praise it. Five praised tries and it knows the trick, and its littles join in.</p><ul id="tricks-list">' + rows + '</ul><div class="btns"><button data-do="x">Done</button></div>', { x: closeSheet });
}
$('#bring').addEventListener('click', () => {
  openSheet('<h2>Bring in your Glimmerkin</h2><p>In the game, open the ? sheet, tap Keep a copy, copy the code and paste it here. Your creature, its littles, eggs and pantry come across. The game is not changed, and what happens here stays here for now.</p><textarea id="code" placeholder="GLIM1.…" aria-label="Save code"></textarea><div class="err" id="code-err"></div><div class="btns"><button id="import-ok" data-do="ok">Bring in</button><button class="ghost" data-do="x">Cancel</button></div>', {
    x: closeSheet,
    ok: () => { try { S = fromGame(readSaveCode($('#code').value)); fix(); save(); rebuild(); closeSheet(); toast(S.pet.name + ' is here.', 2400); } catch (err) { $('#code-err').textContent = err.message; } }
  });
});
$('#fresh').addEventListener('click', () => { const b = $('#fresh'); if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to replace ' + S.pet.name; setTimeout(() => { delete b.dataset.sure; b.textContent = 'New creature'; }, 3000); return; } delete b.dataset.sure; b.textContent = 'New creature'; S = newGame(); fix(); save(); rebuild(); toast('Meet ' + S.pet.name + '.'); });

async function checkAR() {
  const st = $('#ar-status');
  if (!window.isSecureContext) { st.textContent = 'AR needs the page opened over https.'; return; }
  if (!navigator.xr) { st.textContent = 'This browser has no WebXR. On Android, open this page in Chrome.'; return; }
  try { arOK = await navigator.xr.isSessionSupported('immersive-ar'); } catch (e) { arOK = false; }
  $('#start-ar').disabled = !arOK;
  st.textContent = arOK ? 'Point your phone at a table, then tap the gold ring.' : 'AR is not available here. It needs Chrome on an ARCore Android phone. The preview works anywhere.';
}

window.addEventListener('resize', () => { if (renderer.xr.isPresenting) return; camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); sizeDraw(); aim(aimed); });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

/* ---------- the quest module gets what it needs from here ---------- */
initRoam({ THREE, world, A, room, C: () => C, S: () => S, T: () => T, camPose, get camPos() { return camPos; }, get camQ() { return camQ; }, setMood, floatText, head, burst, sfx, toast });
initPlay({ world, A, room, C: () => C, S: () => S, camPose, get camPos() { return camPos; }, get camQ() { return camQ; }, viewCam, rayAt, setMood, floatText, head, burst, sfx, toast, anim, save, hud, gainXp,
  hiddenFromCam, giggleAt, questActive, mode: () => mode, ELS, BERRY });
initQuest({
  THREE, scene, world, get S() { return S; }, save, hud, toast, floatText, burst, sfx, anim, wait, openSheet, closeSheet, sheetOpen, rayAt, camPose, gainXp,
  rebuild, done: () => { if (mode === 'ar' && roomYaw !== null) world.rotation.y = roomYaw; roomYaw = null; setHud(); aimFor(); }, rollPortals, esc, NEST_ROOM, TRAVEL_REST, trickPose, littleLine, petLook
});

rebuild(); checkAR();
const clock = new THREE.Clock();
renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(0.05, clock.getDelta());
  if (frame && mode === 'ar') xrFrame(frame);
  if (mode === 'menu') { T += dt; tickAnims(dt); C.root.rotation.y = Math.sin(T * 0.4) * 0.5; C.update(dt, T, {}); LC.forEach((f, i) => f.c.update(dt, T + i, {})); }
  else tick(dt);
  renderer.render(scene, camera);
});

/* For the browser test: read the state, find things on screen, and play a quest. */
window.__glim = {
  get S() { return S; }, get P() { return S.pet; }, get mode() { return mode; }, get trick() { return A.trick && A.trick.k; }, get toss() { return !!toss; }, get praise() { return A.praise; },
  screenOfHead() { return toScreen(head()); }, screenOfBody() { const p = C.root.localToWorld(new THREE.Vector3(0, C.size.h * 0.9, 0)); return toScreen(p); },
  screenOfEgg(i) { return toScreen(EG[i].mesh.getWorldPosition(new THREE.Vector3())); },
  screenOfLittle(i) { return toScreen(LC[i].c.root.localToWorld(new THREE.Vector3(0, LC[i].c.size.h, 0))); },
  favSpot: () => favSpot(S.pet.seed), look: () => look, quest: () => questDebug(toScreen),
  setRest(n) { S.pet.rest = n; hud(); }, addEgg(twin) { S.eggs.push({ hue: 200, seed: 99, warm: 0, twin: !!twin }); rebuild(); },
  room: () => ({ surfs: room.surfs.map(s => ({ id: s.id, y: +(s.y + s.shift.y).toFixed(3), n: s.cells.size, kind: s.kind, label: room.label(s) })), walls: room.walls.length }),
  pet: () => ({ x: A.off.x, y: A.off.y, z: A.off.z, surf: (surfNow() || {}).id || null, cling: !!roam.cling, moving: !!(roam.step || roam.plan.length), visible: C.root.visible, on: roam.on }),
  game: () => ({ k: game.k, phase: game.phase, found: game.found, eggs: game.eggs.map(e => ({ done: e.done, ...toScreen(e.m.getWorldPosition(new THREE.Vector3())) })), spot: game.spot ? { covered: room.covered(game.spot.s, game.spot.c), label: room.label(game.spot.s) } : null }),
  setRoam, openPlay, startSeek: () => { ensureRoom(); return startSeek(); }, startEggs: () => { ensureRoom(); return startEggs(5); },
  goSurf(id) { const s = room.byId(id); const c = room.cellsOf(s)[0]; goTo(s, room.cellPos(s, c)); }, cling() { const w = room.walls[0]; import('./roam.js').then(m => m.clingTo(w, surfNow())); },
  berry: () => toss ? { ...world.worldToLocal(berryMesh.position.clone()), reach: toss.reach, landed: toss.landed, fetch: !!toss.fetch, surf: toss.surf ? toss.surf.id : null } : null,
  think(n) { roam.brainT = n || 0; }, arrow: () => $('#arrow').classList.contains('on'), skip(t) { game.t += t; }
};
