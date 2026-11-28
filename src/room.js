/* The room around the nest: the flat surfaces (floor, tables, sofa seats, shelves) and the walls the phone has seen,
   kept in the nest's own frame (the `world` group: the nest at the origin, +y up), so the Glimmerkin can walk, hop
   and cling anywhere in it. Also the real world's depth, from the phone's depth sensing where it has it, so real
   furniture covers the Glimmerkin and the game can ask whether a spot is hidden from the camera.

   Surfaces are grids of 12 cm cells at one height. Each surface made from a hit test has its own anchor, and the
   surface follows its anchor as tracking corrects itself. */
import * as THREE from 'three';

export const CELL = 0.12;
const SAME_Y = 0.05, MAX_SURF = 16, MAX_CELLS = 900, MAX_WALL = 240, WALL_GRID = 0.15;
const ck = (x, z) => Math.round(x / CELL) + ',' + Math.round(z / CELL);

export function createRoom(world) {
  const R = { surfs: [], walls: [], cells: 0, version: 0, nid: 1, depth: null };
  const wallKeys = new Set();

  R.reset = () => { R.surfs.forEach(s => { if (s.anchor && s.anchor.delete) try { s.anchor.delete(); } catch (e) { } }); R.surfs = []; R.walls = []; wallKeys.clear(); R.cells = 0; R.version++; };

  function newSurf(y, anchor, a0, kind) { const s = { id: R.nid++, y, n: 0, cells: new Map(), anchor: anchor || null, a0: a0 || null, shift: new THREE.Vector3(), kind: kind || 'flat' }; R.surfs.push(s); return s; }
  function addCell(s, x, z) { const k = ck(x, z); if (s.cells.has(k)) return false; if (R.cells >= MAX_CELLS) return false; s.cells.set(k, { x: Math.round(x / CELL) * CELL, z: Math.round(z / CELL) * CELL }); R.cells++; R.version++; return true; }

  /* The nest's own surface: the table it was put on, a disc of cells around the origin. */
  R.seedNest = (r) => {
    R.reset(); const s = newSurf(0, null, null, 'nest');
    const rr = r || 0.3; for (let x = -rr; x <= rr + 1e-6; x += CELL) for (let z = -rr; z <= rr + 1e-6; z += CELL) if (Math.hypot(x, z) <= rr + 0.01) addCell(s, x, z);
    return s;
  };

  /* A point on a surface, in the nest's frame, with its normal. `makeAnchor` is called (at most) when it starts a new
     surface. Returns 'cell' when it grew a flat surface, 'wall' when it added a wall point, or null. */
  R.add = (p, n, makeAnchor) => {
    if (n.y > 0.85) {
      let best = null, bd = 1e9;
      for (const s of R.surfs) {
        const y = s.y + s.shift.y; if (Math.abs(p.y - y) > SAME_Y) continue;
        const k = ck(p.x - s.shift.x, p.z - s.shift.z); if (s.cells.has(k)) { s.y += (p.y - y) * 0.02; return null; }
        const d = nearestCellDist(s, p); if (d < bd) { bd = d; best = s; }
      }
      if (best && bd < CELL * 3.2) { if (addCell(best, p.x - best.shift.x, p.z - best.shift.z)) { best.y += (p.y - best.y - best.shift.y) * 0.05; return 'cell'; } return null; }
      if (R.surfs.length >= MAX_SURF) return null;
      const s = newSurf(p.y, null, p.clone()); if (makeAnchor) makeAnchor(s); addCell(s, p.x, p.z); return 'cell';
    }
    if (Math.abs(n.y) < 0.3) {
      if (R.walls.length >= MAX_WALL) return null;
      const k = Math.round(p.x / WALL_GRID) + ',' + Math.round(p.y / WALL_GRID) + ',' + Math.round(p.z / WALL_GRID); if (wallKeys.has(k)) return null;
      wallKeys.add(k); R.walls.push({ p: p.clone(), n: new THREE.Vector3(n.x, 0, n.z).normalize() }); R.version++; return 'wall';
    }
    return null;
  };
  function nearestCellDist(s, p) { let d = 1e9; for (const c of s.cells.values()) { const e = Math.hypot(c.x + s.shift.x - p.x, c.z + s.shift.z - p.z); if (e < d) d = e; } return d; }

  /* Follow each surface's anchor. `poseOf(anchor)` gives its position in the nest's frame now, or null. */
  R.follow = (poseOf) => { for (const s of R.surfs) { if (!s.anchor || !s.a0) continue; const p = poseOf(s.anchor); if (!p) continue; s.shift.lerp(p.sub(s.a0), 0.2); } };

  R.cellPos = (s, c, out) => (out || new THREE.Vector3()).set(c.x + s.shift.x, s.y + s.shift.y, c.z + s.shift.z);
  R.cellsOf = (s) => Array.from(s.cells.values());
  R.byId = (id) => R.surfs.find(s => s.id === id) || null;
  R.size = (s) => s.cells.size;
  /* The lowest big surface is the floor. */
  R.floor = () => { let f = null; for (const s of R.surfs) if (s.cells.size >= 4 && (!f || s.y + s.shift.y < f.y + f.shift.y)) f = s; return f; };
  R.label = (s) => { if (!s) return 'somewhere'; if (s.kind === 'nest') return 'the nest'; const f = R.floor(); if (s === f && s.y + s.shift.y < -0.25) return 'the floor'; const f2 = f ? s.y - f.y : 1; return f2 < 0.3 ? 'a low ledge' : f2 < 0.6 ? 'a seat' : f2 < 1.1 ? 'a table' : 'a high shelf'; };

  /* The surface under a point (within `reach` below it), and the height there. */
  R.under = (x, z, belowY, reach) => {
    let best = null, by = -1e9;
    for (const s of R.surfs) {
      const y = s.y + s.shift.y; if (y > belowY + 0.02 || belowY - y > (reach || 5)) continue;
      if (!s.cells.has(ck(x - s.shift.x, z - s.shift.z))) continue; if (y > by) { by = y; best = s; }
    }
    return best ? { s: best, y: by } : null;
  };
  /* The surface a point stands on (within 6 cm of its height). */
  R.on = (p) => { const u = R.under(p.x, p.z, p.y + 0.06, 0.12); return u ? u.s : null; };
  /* Is a cell of one surface under a higher surface (under a table)? */
  R.covered = (s, c) => { const x = c.x + s.shift.x, z = c.z + s.shift.z, y = s.y + s.shift.y; for (const t of R.surfs) { if (t === s) continue; const ty = t.y + t.shift.y; if (ty > y + 0.25 && ty < y + 1.3 && t.cells.has(ck(x - t.shift.x, z - t.shift.z))) return true; } return false; };
  /* Is a cell on the edge of its surface (a neighbour missing)? Used to pick where to hop from. */
  R.edge = (s, c) => { const i = Math.round(c.x / CELL), j = Math.round(c.z / CELL); return !(s.cells.has((i + 1) + ',' + j) && s.cells.has((i - 1) + ',' + j) && s.cells.has(i + ',' + (j + 1)) && s.cells.has(i + ',' + (j - 1))); };
  /* Where to hop between two surfaces: the closest pair of cells. */
  R.bridge = (a, b) => {
    let best = null, bd = 1e9; const ca = R.cellsOf(a), cb = R.cellsOf(b);
    for (const x of ca) for (const y of cb) {
      const d = Math.hypot(x.x + a.shift.x - y.x - b.shift.x, x.z + a.shift.z - y.z - b.shift.z);
      // not straight up from under a table: from below, the hop starts beside the higher surface
      const under = d < 0.2 && (a.y + a.shift.y) < (b.y + b.shift.y) - 0.25 ? 1 : 0;
      const score = d + under;
      if (score < bd) { bd = score; best = { from: R.cellPos(a, x), to: R.cellPos(b, y), d }; }
    }
    return best;
  };
  /* Every cell everywhere, as { s, c, p }. */
  R.allCells = () => { const out = []; for (const s of R.surfs) for (const c of s.cells.values()) out.push({ s, c, p: R.cellPos(s, c) }); return out; };

  return R;
}

/* ---------- depth sensing: real-world depth from the phone, for occlusion and for "can the camera see it" ----------
   Asked for as cpu-optimized (every ARCore Depth phone gives that). Each frame the depth image is copied, uploaded to a
   small texture, and a full-screen pass writes it into the depth buffer before anything is drawn, so real things in
   front of the Glimmerkin hide it. */
export function createDepth(THREE_, renderer, scene) {
  const D = { ok: false, w: 0, h: 0, data: null, f32: false, toM: 0.001, uvT: new THREE.Matrix4(), tex: null, mesh: null, frames: 0, on: true };
  let buf8 = null;
  const uniforms = { uDepth: { value: null }, uUV: { value: new THREE.Matrix4() }, uRaw: { value: 0.001 }, uF32: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uOn: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, depthTest: true, depthWrite: true, colorWrite: false, depthFunc: THREE.AlwaysDepth,
    vertexShader: 'varying float vA; varying float vB; void main(){ vA = projectionMatrix[2][2]; vB = projectionMatrix[3][2]; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D uDepth; uniform mat4 uUV; uniform float uRaw; uniform float uF32; uniform vec2 uRes; uniform float uOn; varying float vA; varying float vB;
      void main(){
        vec2 v = gl_FragCoord.xy / uRes; v.y = 1.0 - v.y;                 // normalised view coordinates start top left
        vec2 uv = (uUV * vec4(v, 0.0, 1.0)).xy;
        vec4 t = texture2D(uDepth, uv);
        float m = uF32 > 0.5 ? t.r : dot(t.rg, vec2(255.0, 65280.0)) * uRaw;   // luminance-alpha: low byte, high byte
        if (uOn < 0.5 || m <= 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragDepth = 1.0; return; }
        m += 0.05;                                          // a little behind the real surface, so feet on a table are not clipped
        gl_FragDepth = clamp((vB - vA * m) / m * 0.5 + 0.5, 0.0, 1.0);   // the projection of a point m metres ahead
      }`
  });
  D.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); D.mesh.frustumCulled = false; D.mesh.renderOrder = -1000; D.mesh.visible = false; scene.add(D.mesh);

  /* Called each XR frame with the viewer's first view. */
  D.update = (frame, view, glW, glH) => {
    let info = null; try { info = frame.getDepthInformation ? frame.getDepthInformation(view) : null; } catch (e) { info = null; }
    if (!info || !info.data) { D.mesh.visible = false; D.ok = false; return; }
    const f32 = info.data.byteLength === info.width * info.height * 4;
    if (!D.tex || D.w !== info.width || D.h !== info.height || D.f32 !== f32) {
      D.w = info.width; D.h = info.height; D.f32 = f32;
      if (D.tex) D.tex.dispose();
      buf8 = f32 ? new Float32Array(D.w * D.h) : new Uint8Array(D.w * D.h * 2);
      D.tex = new THREE.DataTexture(buf8, D.w, D.h, f32 ? THREE.RedFormat : THREE.RGFormat, f32 ? THREE.FloatType : THREE.UnsignedByteType);
      D.tex.magFilter = D.tex.minFilter = THREE.NearestFilter; D.tex.flipY = false; D.tex.unpackAlignment = 1;
      uniforms.uDepth.value = D.tex;
    }
    buf8.set(f32 ? new Float32Array(info.data) : new Uint8Array(info.data)); D.tex.needsUpdate = true;
    D.data = buf8; D.toM = info.rawValueToMeters; D.uvT.fromArray(info.normDepthBufferFromNormView.matrix);
    uniforms.uUV.value.copy(D.uvT); uniforms.uRaw.value = D.toM; uniforms.uF32.value = f32 ? 1 : 0; uniforms.uRes.value.set(glW, glH); uniforms.uOn.value = D.on ? 1 : 0;
    D.mesh.visible = true; D.ok = true; D.frames++;
  };
  /* Metres from the camera to the real world at a point in normalised view coordinates (0..1, top left), or 0. */
  const tv = new THREE.Vector4();
  D.at = (u, v) => {
    if (!D.ok || !D.data) return 0;
    tv.set(u, v, 0, 1).applyMatrix4(D.uvT); const x = Math.floor(tv.x * D.w), y = Math.floor(tv.y * D.h);
    if (x < 0 || y < 0 || x >= D.w || y >= D.h) return 0;
    const i = y * D.w + x; return D.f32 ? D.data[i] : (D.data[i * 2] + D.data[i * 2 + 1] * 256) * D.toM;
  };
  /* Is a point (world space) hidden from the camera by something real? null when it can't tell. */
  const pv = new THREE.Vector3();
  D.hidden = (p, cam) => {
    if (!D.ok) return null; pv.copy(p).project(cam); if (pv.z > 1 || Math.abs(pv.x) > 1 || Math.abs(pv.y) > 1) return null;
    const real = D.at((pv.x + 1) / 2, (1 - pv.y) / 2); if (!real) return null;
    const dist = pv.copy(p).applyMatrix4(cam.matrixWorldInverse).z * -1;
    return real < dist - 0.12;
  };
  D.stop = () => { D.ok = false; D.mesh.visible = false; };
  return D;
}
