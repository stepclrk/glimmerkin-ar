/* A stand-in 3D Glimmerkin, built from the same look the game draws in 2D (petLook in glim.js).
   The body is the game's own bodyPath silhouette turned on a lathe; ears, tail, features and marks are simple
   shapes placed where the 2D drawing puts them. Everything is in metres: s is the creature's size. */
import * as THREE from 'three';
import { TAU, clamp } from './glim.js';

const col = (h, s, l) => new THREE.Color().setHSL((((h % 360) + 360) % 360) / 360, clamp(s, 0, 100) / 100, clamp(l, 0, 100) / 100);

/* ---------- the body silhouette from src/draw.js bodyPath, as (radius, height) from bottom to top ---------- */
function bez(a, b, c, d, t) { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; }
function profile(top) {
  const pts = [];
  // bottom segment, from the bottom point (0,-1) up to the widest point (1,-0.25)
  for (let i = 0; i <= 16; i++) { const t = 1 - i / 16; pts.push(new THREE.Vector2(bez(1, 1, 0.6, 0, t), bez(-0.25, -0.85, -1, -1, t))); }
  // top segment, from (1,-0.25) up to the crown (0,1)
  for (let i = 1; i <= 24; i++) { const t = 1 - i / 24; pts.push(new THREE.Vector2(bez(0, top, 1, 1, t), bez(1, 1, 0.6, -0.25, t))); }
  pts[0].x = 0; pts[pts.length - 1].x = 0;
  return pts;
}
function radiusAt(pts, y) {
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if ((y >= a.y && y <= b.y) || (y <= a.y && y >= b.y)) { const k = (y - a.y) / ((b.y - a.y) || 1); return a.x + (b.x - a.x) * k; } }
  return 0;
}
function heightWhere(pts, r) { // on the upper half, the height at which the body is r wide
  for (let i = pts.length - 1; i > 0; i--) { const a = pts[i], b = pts[i - 1]; if (a.y < 0) break; if (a.x <= r && b.x >= r) { const k = (r - a.x) / ((b.x - a.x) || 1); return a.y + (b.y - a.y) * k; } }
  return 0.8;
}

/* ---------- materials ---------- */
let gradTex = null;
function toonGrad() {
  if (gradTex) return gradTex;
  const d = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  gradTex = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat); gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true;
  return gradTex;
}
const toon = (color, extra) => new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: toonGrad() }, extra || {}));
const flat = (color, extra) => new THREE.MeshBasicMaterial(Object.assign({ color }, extra || {}));
/* A dark outline like the game's ink line: the back faces pushed out along their normals. */
function outlineMat(color, thick) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = sh => { sh.uniforms.OUTLINE = { value: thick }; sh.vertexShader = 'uniform float OUTLINE;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * OUTLINE;'); };
  m.customProgramCacheKey = () => 'outline' + thick.toFixed(5);
  return m;
}
function outlined(mesh, line, worldThick) {
  const sc = (Math.abs(mesh.scale.x) + Math.abs(mesh.scale.y) + Math.abs(mesh.scale.z)) / 3 || 1;
  const o = new THREE.Mesh(mesh.geometry, outlineMat(line, worldThick / sc));
  o.raycast = () => { }; mesh.add(o); return mesh;
}
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(c); return glowTex;
}
function glowSprite(color, size, opacity) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  sp.scale.setScalar(size); sp.raycast = () => { }; return sp;
}
let shadowTex = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(8,4,20,.55)'); r.addColorStop(0.6, 'rgba(8,4,20,.3)'); r.addColorStop(1, 'rgba(8,4,20,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); shadowTex = new THREE.CanvasTexture(c); return shadowTex;
}

const sphere = new THREE.SphereGeometry(1, 24, 16);

/* ---------- build ---------- */
export function buildCreature(L, s) {
  const h0 = L.hue, sat = L.sat || 70;
  const C = { base: col(h0, sat, 62), light: col(h0 - 14, sat + 14, 81), shade: col(h0 + 22, sat - 6, 41), line: col(h0 + 30, 42, 18), belly: col(h0 - 30, sat, 91), inner: col(h0 - 40, 85, 84) };
  const w = s * 0.5 * L.bw, h = s * 0.5 * L.bh, dz = 0.88, lw = s * 0.022, fl = (L.float || 0) * s;
  const pts = profile(L.top);
  const surfZ = (x, y) => { const r = radiusAt(pts, y); return Math.sqrt(Math.max(0, r * r - x * x)) * dz; }; // normalised
  const hits = [];

  const root = new THREE.Group();          // where it stands on the table, and which way it faces
  const hop = new THREE.Group(); root.add(hop);              // lifted for hops and leaps
  const tiltN = new THREE.Group(); hop.add(tiltN);           // bows and leans, about its feet
  const centre = new THREE.Group(); centre.position.y = h + fl; tiltN.add(centre); // rolls and spins, about its middle
  const sq = new THREE.Group(); centre.add(sq);              // squash and stretch
  const body = new THREE.Group(); sq.add(body);

  // shadow on the table
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.001; shadow.scale.set(w * 2.3, w * 1.6, 1); shadow.raycast = () => { }; root.add(shadow);
  const halo = glowSprite(col(h0, 95, 66), s * 2.1, 0.25); halo.position.set(0, 0, -w * 0.3); centre.add(halo);

  // body: the lathe, coloured like the 2D gradient with its pale belly
  const geo = new THREE.LatheGeometry(pts, 48);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), tmp = new THREE.Color();
  const spots = L.pattern === 'spots' ? [[-0.62, 0.5, 0.1], [0.55, 0.62, 0.075], [0.75, 0.2, 0.055], [-0.8, 0.05, 0.05]] : [];
  const spotC = L.hue2 !== undefined ? col(L.hue2, 85, 66) : col(h0 - 40, 90, 86);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = clamp((y + 1) / 2, 0, 1);
    tmp.copy(C.shade).lerp(C.base, Math.min(1, t * 1.8));
    const hl = Math.max(0, 1 - Math.hypot(x + 0.35, y - 0.45, z - 0.6) / 0.9); tmp.lerp(C.light, hl * 0.9);
    const be = (x / 0.62) ** 2 + ((y + 0.62) / 0.5) ** 2; if (z > 0) tmp.lerp(C.belly, clamp((1.15 - be) * 3, 0, 1) * 0.85 * clamp(z * 3, 0, 1));
    for (const [a, b, q] of spots) for (const zs of [1, -1]) { const zz = zs * Math.sqrt(Math.max(0, radiusAt(pts, b) ** 2 - a * a)); const d = Math.hypot(x - a * zs, y - b, z - zz); if (d < q * 2) tmp.lerp(spotC, clamp((q * 2 - d) / (q * 0.5), 0, 1) * 0.75); }
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const bodyMesh = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true })); bodyMesh.scale.set(w, h, w * dz);
  outlined(bodyMesh, C.line, lw); body.add(bodyMesh); hits.push(bodyMesh);
  const at = (nx, ny, out) => new THREE.Vector3(nx * w, ny * h, (surfZ(nx, ny) + (out || 0)) * w);
  const faceTo = (obj, nx, ny) => { obj.rotation.y = Math.atan2(nx, surfZ(nx, ny) / dz) * 0.9; };

  // feet
  if (!L.float) for (const sd of [-1, 1]) { const f = new THREE.Mesh(sphere, toon(C.shade)); f.scale.set(s * 0.1, s * 0.055, s * 0.12); f.position.set(sd * w * 0.42, -h * 0.93, w * 0.25); outlined(f, C.line, lw * 0.8); body.add(f); hits.push(f); }

  // face
  const er = s * 0.088 * (L.eyeS || 1), ey = 0.06, eyes = [];
  for (const sd of [-1, 1]) {
    const g = new THREE.Group(); g.position.copy(at(sd * 0.42, ey, -0.02)); faceTo(g, sd * 0.42, ey); body.add(g);
    const ball = new THREE.Mesh(sphere, flat(0x1d1236)); ball.scale.set(er * 0.88, er * 1.08, er * 0.4); g.add(ball);
    const iris = new THREE.Mesh(sphere, flat(col(h0 + 150, 70, 52))); iris.scale.set(er * 0.6, er * 0.45, er * 0.2); iris.position.set(0, -er * 0.55, er * 0.24); g.add(iris);
    const hi1 = new THREE.Mesh(sphere, flat(0xffffff)); hi1.scale.setScalar(er * 0.34); hi1.position.set(-er * 0.28, er * 0.36, er * 0.3); g.add(hi1);
    const hi2 = new THREE.Mesh(sphere, flat(0xffffff)); hi2.scale.setScalar(er * 0.15); hi2.position.set(er * 0.3, -er * 0.4, er * 0.32); g.add(hi2);
    const open = new THREE.Group(); open.add(ball, iris, hi1, hi2); g.add(open);
    const shut = new THREE.Mesh(new THREE.TorusGeometry(er * 0.75, er * 0.13, 6, 16, Math.PI), flat(0x1a1030)); shut.position.set(0, -er * 0.35, er * 0.25); g.add(shut);
    const sleep = new THREE.Mesh(shut.geometry, shut.material); sleep.rotation.z = Math.PI; sleep.position.set(0, er * 0.1, er * 0.25); g.add(sleep);
    eyes.push({ g, open, shut, sleep });
  }
  if (L.cheek) for (const sd of [-1, 1]) { const c = new THREE.Mesh(sphere, flat(0xff7896, { transparent: true, opacity: 0.45, depthWrite: false })); const ny = ey - (er * 1.25) / h; c.position.copy(at(sd * 0.66, ny, 0.005)); faceTo(c, sd * 0.66, ny); c.scale.set(er * 0.62, er * 0.4, er * 0.1); body.add(c); }
  const my = ey - (er * 1.35) / h, mouth = new THREE.Group(); mouth.position.copy(at(0, my, 0.01)); body.add(mouth);
  const smile = new THREE.Group(); for (const sd of [-1, 1]) { const a = new THREE.Mesh(new THREE.TorusGeometry(er * 0.3, er * 0.08, 6, 12, Math.PI), flat(0x1a1030)); a.rotation.z = Math.PI; a.position.x = sd * er * 0.3; smile.add(a); } mouth.add(smile);
  const open = new THREE.Group(); const lip = new THREE.Mesh(new THREE.CircleGeometry(er * 0.62, 20, Math.PI, Math.PI), flat(0x7a1f3d, { side: THREE.DoubleSide })); open.add(lip);
  const tongue = new THREE.Mesh(new THREE.CircleGeometry(er * 0.3, 16, Math.PI, Math.PI), flat(0xff8fb3, { side: THREE.DoubleSide })); tongue.position.set(0, -er * 0.3, 0.0005); open.add(tongue); mouth.add(open);
  const munch = new THREE.Mesh(sphere, flat(0x7a1f3d)); munch.scale.set(er * 0.6, er * 0.5, er * 0.1); mouth.add(munch);

  // ears, where the body is about 0.55 of its width across
  const yE = heightWhere(pts, 0.55), ears = [];
  for (const sd of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sd * w * 0.55, yE * h, 0); g.rotation.z = -sd * 0.28; body.add(g); ears.push(g);
    let m, inner;
    switch (L.ears) {
      case 'round': m = new THREE.Mesh(sphere, toon(C.base)); m.scale.set(s * 0.13, s * 0.13, s * 0.05); m.position.y = s * 0.06; inner = new THREE.Mesh(sphere, flat(C.inner)); inner.scale.set(s * 0.07, s * 0.07, s * 0.02); inner.position.set(0, s * 0.07, s * 0.04); break;
      case 'point': m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20), toon(C.base)); m.scale.set(s * 0.11, s * 0.32, s * 0.05); m.position.y = s * 0.14; inner = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 16), flat(C.inner)); inner.scale.set(s * 0.055, s * 0.18, s * 0.01); inner.position.set(0, s * 0.11, s * 0.04); break;
      case 'long': m = new THREE.Mesh(sphere, toon(C.base)); m.scale.set(s * 0.08, s * 0.26, s * 0.05); m.position.y = s * 0.22; inner = new THREE.Mesh(sphere, flat(C.inner)); inner.scale.set(s * 0.04, s * 0.18, s * 0.02); inner.position.set(0, s * 0.22, s * 0.04); break;
      case 'horn': m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 16), toon(0xfff1d6)); m.scale.set(s * 0.06, s * 0.25, s * 0.06); m.position.y = s * 0.11; m.rotation.z = -sd * 0.25; break;
      case 'fin': m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), toon(C.light)); m.scale.set(s * 0.15, s * 0.26, s * 0.03); m.position.y = s * 0.1; m.rotation.z = -sd * 0.35; break;
      case 'antenna': default: {
        const cv = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(sd * s * 0.02, s * 0.22, 0), new THREE.Vector3(sd * s * 0.1, s * 0.34, 0));
        m = new THREE.Mesh(new THREE.TubeGeometry(cv, 12, s * 0.012, 6), flat(C.line));
        const tip = new THREE.Mesh(sphere, flat(C.inner)); tip.scale.setScalar(s * 0.055); tip.position.set(sd * s * 0.1, s * 0.34, 0); g.add(tip); hits.push(tip);
        const gl = glowSprite(col(h0 - 40, 100, 75), s * 0.35, 0.7); gl.position.copy(tip.position); g.add(gl);
      }
    }
    if (L.ears !== 'antenna') outlined(m, C.line, lw * 0.8);
    g.add(m); hits.push(m); if (inner) g.add(inner);
  }

  // tail, behind
  let tail = null;
  if (L.tail === 'puff') { tail = new THREE.Group(); const p = new THREE.Mesh(sphere, toon(C.light)); p.scale.setScalar(s * 0.12); outlined(p, C.line, lw * 0.8); tail.add(p); tail.position.copy(at(0, -0.5, 0)).setZ(-surfZ(0, -0.5) * w - s * 0.04); body.add(tail); hits.push(p); }
  else if (L.tail === 'curl') {
    tail = new THREE.Group(); tail.position.set(0, -h * 0.55, -surfZ(0, -0.55) * w * 0.85); body.add(tail);
    const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -h * 0.25, -w * 0.55), new THREE.Vector3(0, h * 0.25, -w * 0.95), new THREE.Vector3(0, h * 0.75, -w * 0.7)]);
    const t = new THREE.Mesh(new THREE.TubeGeometry(cv, 24, s * 0.05, 10), toon(C.base)); outlined(t, C.line, lw * 0.8); tail.add(t); hits.push(t);
    const tip = new THREE.Mesh(sphere, flat(C.inner)); tip.scale.setScalar(s * 0.07); tip.position.set(0, h * 0.75, -w * 0.7); tail.add(tip);
    const gl = glowSprite(col(h0 - 40, 100, 75), s * 0.45, 0.7); gl.position.copy(tip.position); tail.add(gl);
  }

  const top = new THREE.Vector3(0, h, 0), anim = [];   // anim: per-frame wobbles of features
  // a Hatchling's tuft
  if (L.kind === 'kin' && !L.stage) {
    const cv = new THREE.CubicBezierCurve3(new THREE.Vector3(0, h * 0.97, 0), new THREE.Vector3(-s * 0.02, h + s * 0.16, 0), new THREE.Vector3(s * 0.14, h + s * 0.14, 0), new THREE.Vector3(s * 0.08, h + s * 0.05, 0));
    const t = new THREE.Mesh(new THREE.TubeGeometry(cv, 16, s * 0.022, 8), toon(C.light)); outlined(t, C.line, lw * 0.7); body.add(t);
  }
  if (L.gem) { const g = new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.05), flat(col(h0 + 170, 90, 76))); g.scale.set(1, 1.3, 0.5); g.position.copy(at(0, 0.52, 0.02)); body.add(g); const gl = glowSprite(col(h0 + 170, 100, 72), s * 0.3, 0.7); gl.position.copy(g.position); body.add(gl); }
  if (L.antlers) for (const sd of [-1, 1]) {
    const b = new THREE.Vector3(sd * w * 0.22, h * 0.92, 0);
    const cv = new THREE.QuadraticBezierCurve3(b, b.clone().add(new THREE.Vector3(sd * s * 0.02, s * 0.16, 0)), b.clone().add(new THREE.Vector3(sd * s * 0.14, s * 0.28, 0)));
    const a = new THREE.Mesh(new THREE.TubeGeometry(cv, 10, s * 0.018, 6), flat(0xfff3c4)); body.add(a);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.014, s * 0.014, s * 0.1, 6), flat(0xfff3c4)); br.position.copy(b).add(new THREE.Vector3(sd * s * 0.07, s * 0.17, 0)); br.rotation.z = -sd * 0.9; body.add(br);
  }
  function wingPair(hue, scale) {
    const ws = [];
    for (const sd of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(sd * w * 0.45, h * 0.2, -w * 0.45); body.add(g);
      const m = new THREE.Mesh(sphere, toon(col(hue - 20, 75, 86), { transparent: true, opacity: 0.85 })); m.scale.set(s * 0.3 * scale, s * 0.2 * scale, s * 0.015); m.position.set(sd * s * 0.26 * scale, s * 0.12 * scale, 0); m.rotation.z = sd * 0.5; g.add(m);
      const dot = new THREE.Mesh(sphere, flat(col(hue + 150, 85, 72))); dot.scale.set(s * 0.06 * scale, s * 0.06 * scale, s * 0.02); dot.position.set(sd * s * 0.33 * scale, s * 0.16 * scale, 0.002); g.add(dot);
      g.rotation.y = -sd * 0.5; ws.push({ g, sd });
    }
    anim.push((t) => { for (const { g, sd } of ws) g.rotation.z = sd * Math.sin(t * 9) * 0.3; });
  }
  if (L.wings && !(L.feats || []).includes('gale') && L.form !== 'gale') wingPair(h0, 1);
  if ((L.marks || []).includes('wingbuds') && !L.wings) wingPair(h0 + 40, 0.5);

  // element features (one or two, from what it eats)
  const feats = L.feats || [];
  feats.forEach((f, i) => {
    const ox = feats.length > 1 ? (i ? 1 : -1) * w * 0.34 : 0, x = ox, y = h * 0.97;
    if (f === 'ember') {
      const g = new THREE.Group(); g.position.set(x, y, 0); body.add(g);
      [[1, 0xff6b2a], [0.68, 0xffb23a], [0.38, 0xfff3b0]].forEach(([k, c], j) => { const m = new THREE.Mesh(new THREE.ConeGeometry(s * 0.1 * k, s * 0.24 * k, 12), flat(c)); m.position.set(0, s * 0.1 * k, j * 0.002); g.add(m); });
      const gl = glowSprite(new THREE.Color(0xff7a2a), s * 0.5, 0.6); gl.position.y = s * 0.1; g.add(gl);
      anim.push((t) => { g.scale.set(1 + Math.sin(t * 11) * 0.08, 1 + Math.sin(t * 9 + 1) * 0.15, 1); });
    } else if (f === 'tide') {
      const g = new THREE.Group(); g.position.set(x, y, 0); body.add(g);
      const m = new THREE.Mesh(sphere, toon(col(195, 90, 80), { transparent: true, opacity: 0.92 })); m.scale.setScalar(s * 0.07); m.position.y = s * 0.07; g.add(m);
      const c = new THREE.Mesh(new THREE.ConeGeometry(s * 0.06, s * 0.13, 16), toon(col(195, 90, 80), { transparent: true, opacity: 0.92 })); c.position.y = s * 0.17; g.add(c);
    } else if (f === 'stone') {
      for (let k = -1; k <= 1; k++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s * 0.06), toon(col(250, 12, 50 + k * 5))); r.position.set(x + k * w * 0.42, y - Math.abs(k) * h * 0.2, -w * 0.1); r.scale.y = 0.7; outlined(r, col(255, 20, 20), lw * 0.6); body.add(r); }
    } else if (f === 'bloom') {
      const g = new THREE.Group(); g.position.set(x, y, 0); body.add(g);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.012, s * 0.012, s * 0.18, 6), flat(col(120, 50, 30))); st.position.y = s * 0.09; g.add(st);
      for (const sd of [-1, 1]) { const lf = new THREE.Mesh(sphere, toon(col(105 + sd * 12, 70, 58))); lf.scale.set(s * 0.06, s * 0.11, s * 0.015); lf.position.set(sd * s * 0.06, s * 0.2, 0); lf.rotation.z = -sd * 0.8; g.add(lf); }
      anim.push((t) => { g.rotation.z = Math.sin(t * 2) * 0.12; });
    } else if (f === 'glow') {
      const g = new THREE.Group(); g.position.set(x, y + s * 0.14, 0); body.add(g);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(s * 0.2, s * 0.012, 8, 32), flat(0xffe9a0)); ring.rotation.x = Math.PI / 2; ring.scale.set(1, 0.6, 1); g.add(ring);
      const gl = glowSprite(new THREE.Color(0xffe27a), s * 0.6, 0.5); g.add(gl);
      anim.push((t) => { g.position.y = y + s * 0.14 + Math.sin(t * 2) * s * 0.015; });
    } else if (f === 'gale') wingPair(h0, 1);
  });

  // Mythic forms (stand-ins for the six forms)
  if (L.form === 'ember') for (let i = -2; i <= 2; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(s * 0.08, s * 0.3, 12), flat(i % 2 ? 0xffb23a : 0xff6b2a)); m.position.set(i * w * 0.32, h * (0.85 - Math.abs(i) * 0.15), -w * 0.35); m.rotation.x = -0.4; body.add(m); }
  if (L.form === 'tide') { const m = new THREE.Mesh(new THREE.ConeGeometry(s * 0.25, s * 0.6, 24, 1, true), toon(col(195, 80, 70), { side: THREE.DoubleSide, transparent: true, opacity: 0.9 })); m.scale.z = 0.2; m.position.set(0, h * 0.9, -w * 0.6); m.rotation.x = -0.6; body.add(m); }
  if (L.form === 'stone') for (let i = -1; i <= 1; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(s * 0.06, s * (0.32 - Math.abs(i) * 0.08), 5), toon(col(270 + i * 20, 70, 74))); m.position.set(i * w * 0.5, h * (0.85 - Math.abs(i) * 0.15) + s * 0.1, -w * 0.3); m.rotation.z = -i * 0.3; outlined(m, C.line, lw * 0.6); body.add(m); }
  if (L.form === 'bloom') { for (let i = -2; i <= 2; i++) { const fl2 = new THREE.Mesh(sphere, flat(col([330, 48, 290, 48, 330][i + 2], 85, 75))); fl2.scale.setScalar(s * 0.04); fl2.position.set(i * w * 0.24, h * (0.98 - Math.abs(i) * 0.06), w * 0.1); body.add(fl2); } for (const sd of [-1, 1]) { const lf = new THREE.Mesh(sphere, toon(col(115, 60, 55))); lf.scale.set(s * 0.15, s * 0.32, s * 0.02); lf.position.set(sd * w * 0.8, h * 0.4, -w * 0.4); lf.rotation.z = -sd * 0.9; body.add(lf); } }
  if (L.form === 'gale') wingPair(175, 1.45);
  if (L.form === 'glow' || (L.marks || []).includes('comet')) {
    const orbs = []; const n = L.form === 'glow' ? 3 : 1;
    for (let i = 0; i < n; i++) { const o = new THREE.Mesh(sphere, flat(0xfff6c4)); o.scale.setScalar(s * 0.04); body.add(o); const gl = glowSprite(new THREE.Color(0xffe27a), s * 0.3, 0.8); o.add(gl); gl.scale.setScalar(s * 0.3 / (s * 0.04)); orbs.push(o); }
    anim.push((t) => orbs.forEach((o, i) => { const a = t * 1.2 + i * 2.1; o.position.set(Math.cos(a) * w * 1.4, Math.sin(a * 1.3) * h * 0.3, Math.sin(a) * w * 1.2); }));
  }
  // marks from starfruit
  const marks = L.marks || [];
  if (marks.includes('halo')) { const r = new THREE.Mesh(new THREE.TorusGeometry(s * 0.24, s * 0.012, 8, 32), flat(0xffe9a0)); r.rotation.x = Math.PI / 2; r.position.y = h + s * 0.3; body.add(r); const hg = glowSprite(new THREE.Color(0xffe27a), s * 0.7, 0.35); hg.position.set(0, h + s * 0.3, 0); body.add(hg); }
  if (marks.includes('bellystar')) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.06), flat(0xffe896)); st.scale.z = 0.3; st.position.copy(at(0, -0.6, 0.02)); body.add(st); }
  if (marks.includes('freckles')) for (const sd of [-1, 1]) for (const [fa, fb] of [[0.5, 2.0], [0.68, 1.75], [0.84, 2.05]]) { const d = new THREE.Mesh(sphere, flat(0xffe58a)); d.scale.setScalar(s * 0.014); const ny = ey - (er * fb) / h; d.position.copy(at(sd * fa, ny, 0.01)); body.add(d); }
  if (marks.includes('antennae')) for (const sd of [-1, 1]) { const b = new THREE.Vector3(sd * w * 0.22, h * 0.9, 0); const cv = new THREE.QuadraticBezierCurve3(b, b.clone().add(new THREE.Vector3(0, s * 0.3, 0)), b.clone().add(new THREE.Vector3(sd * s * 0.13, s * 0.3, 0))); body.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 10, s * 0.01, 6), flat(C.line))); const tp = new THREE.Mesh(sphere, flat(0xfff6c4)); tp.scale.setScalar(s * 0.035); tp.position.copy(cv.getPoint(1)); body.add(tp); }
  if (marks.includes('crest')) for (let i = -1; i <= 1; i++) { const f = new THREE.Mesh(sphere, toon(col(h0 + 120 + i * 55, 88, 68))); f.scale.set(s * 0.035, s * 0.1, s * 0.02); f.position.set(i * w * 0.15, h + s * 0.07, 0); f.rotation.z = -i * 0.4; body.add(f); }

  /* ---------- per-frame pose ---------- */
  const state = { blinkT: 2 + Math.random() * 2 };
  function setMood(m) {
    for (const e of eyes) { e.open.visible = !m || m === 'idle' || m === 'sad' || m === 'eat-open'; e.shut.visible = m === 'happy' || m === 'eat'; e.sleep.visible = m === 'sleep'; }
    smile.visible = !m || m === 'idle' || m === 'sad'; open.visible = m === 'happy'; munch.visible = m === 'eat';
    smile.rotation.z = m === 'sad' ? Math.PI : 0;
  }
  function update(dt, t, o) {
    o = o || {};
    const bob = Math.sin(t * 2.2 + (L.phase || 0)) * s * 0.012, br = 1 + Math.sin(t * 2.2 + 1.2) * 0.022, sqz = o.squash || 0;
    hop.position.y = (o.lift || 0) + Math.max(0, bob);
    hop.position.x = o.dx || 0; hop.position.z = o.dz || 0;
    tiltN.rotation.set(o.pitch || 0, 0, -(o.tilt || 0));
    centre.position.y = h + fl * (1 + 0.15 * Math.sin(t * 3)) ;
    centre.rotation.set(0, o.spin || 0, o.roll || 0);
    const st = o.stretch || 0;
    sq.scale.set((1 + sqz) * br * (1 - st * 0.25), (1 - sqz) / br * (1 + st), (1 + sqz) * br * (1 - st * 0.25));
    sq.position.y = -h * (1 - sq.scale.y) + (o.wiggleY || 0);
    body.rotation.z = o.wiggle ? Math.sin(t * 25) * 0.2 * o.wiggle : 0;
    body.rotation.x = o.lean ? o.lean : 0;
    for (const e of ears) e.rotation.x = Math.sin(t * 2.2) * 0.06;
    if (tail) tail.rotation.y = Math.sin(t * 3) * 0.35;
    for (const a of anim) a(t);
    // blinking
    state.blinkT -= dt; let blink = false; if (state.blinkT < 0) { blink = true; if (state.blinkT < -0.13) state.blinkT = 2.5 + Math.random() * 2.5; }
    setMood(o.mood || 'idle');
    for (const e of eyes) e.open.scale.y = blink && e.open.visible ? 0.12 : 1;
    if (o.mood === 'eat') munch.scale.y = er * (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 16)));
    halo.material.opacity = 0.18 + 0.1 * Math.sin(t * 1.7);
    const k = clamp(1 - (hop.position.y + fl) / (s * 0.9), 0.25, 1); shadow.scale.set(w * 2.3 * k, w * 1.6 * k, 1); shadow.material.opacity = k;
    shadow.position.x = hop.position.x; shadow.position.z = hop.position.z;
  }
  setMood('idle');

  /* Which spot a point on the creature is, as the game measures it (src/play.js spotAt). */
  const tmpV = new THREE.Vector3();
  function spotAt(worldPoint) {
    tmpV.copy(worldPoint); body.worldToLocal(tmpV);
    const u = tmpV.x / s, v = (tmpV.y + h) / s;
    if (v > 0.66 || (v > 0.4 && Math.abs(u) < 0.16)) return 'head';
    if (v > 0.3) return u < 0 ? 'left' : 'right';
    return 'tummy';
  }
  const headWorld = (out) => body.localToWorld(out.set(0, h * 0.2, w * 0.6));

  return { root, body, hits, update, spotAt, headWorld, size: { w, h, s } };
}
