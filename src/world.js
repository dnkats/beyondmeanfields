// Environment: terrain (PBR splat shader), water, HDRI sky and sun, vegetation instancing, buildings, props, post-processing.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
/** A small film-style grade applied after tone mapping: lifted contrast, a touch more saturation, warm highlights and cool shadows, a soft vignette. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uContrast: { value: 1.05 }, uSaturation: { value: 1.08 }, uVignette: { value: 0.28 }, uAspect: { value: 16 / 9 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uContrast, uSaturation, uVignette, uAspect; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = (c - 0.5) * uContrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSaturation);
      c *= mix(vec3(0.96, 0.98, 1.04), vec3(1.03, 1.0, 0.96), smoothstep(0.15, 0.85, l));   // cool shadows, warm highlights
      vec2 d = (vUv - 0.5) * 2.0; d.x *= uAspect / 1.7778;
      c *= 1.0 - uVignette * smoothstep(0.55, 1.6, dot(d, d));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
import { loadHDRI, loadPBR, loadGLTF, loadModel, loadTexture, prepareModel, pbrMaterial } from './assets.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
let seed = 20260905;
export const srand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// ------------------------------------------------------------ zones & terrain function
export const ZONES = [
  { id: 'harbor', name: 'Input Harbor',        x: 0,   z: 58,  r: 14, h: 1.6 },
  { id: 'fields', name: 'Hartree–Fock Fields', x: -46, z: 22,  r: 17, h: 2.4 },
  { id: 'bazaar', name: 'Basis Bazaar',        x: 2,   z: 8,   r: 13, h: 2.8 },
  { id: 'forest', name: 'Correlation Forest',  x: -36, z: -30, r: 15, h: 3.2 },
  { id: 'caves',  name: 'FCIDUMP Caves',       x: 46,  z: 12,  r: 14, h: 3.0 },
  { id: 'ridge',  name: 'Open-Shell Ridge',    x: 36,  z: -36, r: 14, h: 6.5 },
  { id: 'tower',  name: 'Tower of (T)',        x: 0,   z: -60, r: 13, h: 9.5 },
];
export const zoneById = (id) => ZONES.find((z) => z.id === id);
export const WATER_Y = 0.45;
export function terrainH(x, z) {
  const rr = Math.hypot(x / 86, z / 82);
  const island = clamp(1 - rr * rr * rr * rr, 0, 1);
  let h = island * (2.6 + 1.5 * Math.sin(x * 0.06) * Math.cos(z * 0.05) + 0.9 * Math.sin(x * 0.15 + 1) * Math.sin(z * 0.12) + 0.5 * Math.sin(x * 0.31) * Math.cos(z * 0.27) + 0.18 * Math.sin(x * 0.9) * Math.cos(z * 0.8))
        + island * (9 * Math.exp(-(x * x + (z + 60) * (z + 60)) / 520) + 5 * Math.exp(-((x - 36) ** 2 + (z + 36) ** 2) / 420) + 2.5 * Math.exp(-((x - 46) ** 2 + (z - 12) ** 2) / 300))
        - 3.2 * (1 - island);
  for (const zn of ZONES) { const d = Math.hypot(x - zn.x, z - zn.z); if (d < zn.r) h = lerp(zn.h, h, smooth(zn.r * 0.55, zn.r, d)); }
  return h;
}
/** Where you can stand: dry land, water up to waist depth, or a rock / deck surface above the water. */
export const walkable = (x, z) => terrainH(x, z) > WATER_Y - 0.9 || rockH(x, z) > WATER_Y + 0.15;
export function zoneAt(x, z) { let best = null, bd = 1e9; for (const zn of ZONES) { const d = Math.hypot(x - zn.x, z - zn.z); if (d < zn.r * 1.35 && d < bd) { bd = d; best = zn; } } return best; }
export function slopeAt(x, z) { return Math.hypot(terrainH(x + 1, z) - terrainH(x - 1, z), terrainH(x, z + 1) - terrainH(x, z - 1)) / 2; }

// ------------------------------------------------------------ collision: circles in a spatial hash, oriented boxes
export const COLLIDERS = { boxes: [], grid: new Map(), fields: [] };
/**
 * Rasterizes a model's meshes into a top-down height field (highest surface per cell, -Infinity where there is no mesh),
 * so rocks can be stood on, climbed where they are gentle and block where they are steep. Sets of rocks keep the gaps between them.
 */
export function buildHeightField(parts, cell = 0.35, { maxY = Infinity, minY = 0.12 } = {}) {
  const box = new THREE.Box3(); for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  const nx = Math.max(1, Math.ceil((box.max.x - box.min.x) / cell) + 1), nz = Math.max(1, Math.ceil((box.max.z - box.min.z) / cell) + 1);
  const data = new Float32Array(nx * nz).fill(-Infinity), ax = [0, 0, 0], ay = [0, 0, 0], az = [0, 0, 0];
  const ci = (x) => Math.min(nx - 1, Math.max(0, Math.floor((x - box.min.x) / cell))), cj = (z) => Math.min(nz - 1, Math.max(0, Math.floor((z - box.min.z) / cell)));
  for (const p of parts) {
    const pos = p.geometry.attributes.position, idx = p.geometry.index, n = idx ? idx.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) { const vi = idx ? idx.getX(t + k) : t + k; ax[k] = pos.getX(vi); ay[k] = pos.getY(vi); az[k] = pos.getZ(vi); }
      if (ay[0] > maxY || ay[1] > maxY || ay[2] > maxY) continue;   // roofs and arches you walk under are not floors (their legs keep the parts below the cut)
      const d = (az[1] - az[2]) * (ax[0] - ax[2]) + (ax[2] - ax[1]) * (az[0] - az[2]);
      const i0 = ci(Math.min(ax[0], ax[1], ax[2])), i1 = ci(Math.max(ax[0], ax[1], ax[2])), j0 = cj(Math.min(az[0], az[1], az[2])), j1 = cj(Math.max(az[0], az[1], az[2]));
      if (Math.abs(d) > 1e-9) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx = box.min.x + (i + 0.5) * cell, cz = box.min.z + (j + 0.5) * cell;
        const l0 = ((az[1] - az[2]) * (cx - ax[2]) + (ax[2] - ax[1]) * (cz - az[2])) / d, l1 = ((az[2] - az[0]) * (cx - ax[2]) + (ax[0] - ax[2]) * (cz - az[2])) / d, l2 = 1 - l0 - l1;
        if (l0 < -0.02 || l1 < -0.02 || l2 < -0.02) continue;
        const h = l0 * ay[0] + l1 * ay[1] + l2 * ay[2], c = j * nx + i; if (h > data[c] && h > minY) data[c] = h;   // skirts at or below the model's base are not floors
      }
      for (let k = 0; k < 3; k++) { const c = cj(az[k]) * nx + ci(ax[k]); if (data[c] === -Infinity && ay[k] > minY) data[c] = ay[k]; }   // slivers that cover no cell centre
    }
  }
  // single-cell holes (a plank strip lost to the roof cut, a sliver) are bridged from both neighbours; real gaps of two cells or more stay open
  for (let pass = 0; pass < 2; pass++) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const c = j * nx + i; if (data[c] !== -Infinity) continue;
    const l = i > 0 ? data[c - 1] : -Infinity, r = i < nx - 1 ? data[c + 1] : -Infinity, u = j > 0 ? data[c - nx] : -Infinity, d = j < nz - 1 ? data[c + nx] : -Infinity;
    if (l > -Infinity && r > -Infinity) data[c] = (l + r) / 2; else if (u > -Infinity && d > -Infinity) data[c] = (u + d) / 2; }
  return { minx: box.min.x, minz: box.min.z, nx, nz, cell, data, top: box.max.y, r: Math.hypot(Math.max(-box.min.x, box.max.x), Math.max(-box.min.z, box.max.z)) };
}
function sampleField(f, lx, lz) {
  const u = (lx - f.minx) / f.cell - 0.5, v = (lz - f.minz) / f.cell - 0.5, i = Math.floor(u), j = Math.floor(v);
  if (i < -1 || j < -1 || i >= f.nx || j >= f.nz) return -Infinity;
  const g = (ii, jj) => (ii < 0 || jj < 0 || ii >= f.nx || jj >= f.nz ? -Infinity : f.data[jj * f.nx + ii]);
  const fu = u - i, fv = v - j, h00 = g(i, j), h10 = g(i + 1, j), h01 = g(i, j + 1), h11 = g(i + 1, j + 1);
  if (h00 > -Infinity && h10 > -Infinity && h01 > -Infinity && h11 > -Infinity) return (h00 * (1 - fu) + h10 * fu) * (1 - fv) + (h01 * (1 - fu) + h11 * fu) * fv;
  return g(fu < 0.5 ? i : i + 1, fv < 0.5 ? j : j + 1);   // at the rim: nearest cell, a hard edge
}
/** Registers one placed instance of a height field: position, yaw, uniform scale and base height. */
export function addField(f, x, z, rot, s, y) { COLLIDERS.fields.push({ f, x, z, y, c: Math.cos(rot), s: Math.sin(rot), k: s, r2: (f.r * s + 1) ** 2 }); }
/** Height of the highest rock surface at (x, z), or -Infinity where there is none. */
export function rockH(x, z) {
  let h = -Infinity;
  for (const e of COLLIDERS.fields) { const dx = x - e.x, dz = z - e.z; if (dx * dx + dz * dz > e.r2) continue;
    const v = sampleField(e.f, (dx * e.c - dz * e.s) / e.k, (dx * e.s + dz * e.c) / e.k); if (v > -Infinity) { const wh = e.y + v * e.k; if (wh > h) h = wh; } }
  return h;
}
/** What you stand on at (x, z): the terrain, or a rock on top of it. */
export function surfaceH(x, z) { return Math.max(terrainH(x, z), rockH(x, z)); }
const CELL = 8;
export function addCircle(x, z, r) { const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; if (!COLLIDERS.grid.has(k)) COLLIDERS.grid.set(k, []); COLLIDERS.grid.get(k).push({ x, z, r }); }
export function addBox(x, z, w, d, rot = 0) { COLLIDERS.boxes.push({ x, z, hw: w / 2, hd: d / 2, c: Math.cos(rot), s: Math.sin(rot) }); }
/** Pushes point p ({x, z}, radius pr) out of every collider it overlaps. Returns true when it moved the point. */
export function resolveCollisions(p, pr) {
  let hit = false;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = COLLIDERS.grid.get(`${cx + i},${cz + j}`); if (!list) continue;
      for (const c of list) { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + pr;
        if (d < min) { if (d > 1e-4) { const k = (min - d) / d; p.x += dx * k; p.z += dz * k; } else p.x += min; moved = true; } }
    }
    for (const b of COLLIDERS.boxes) {
      const dx = p.x - b.x, dz = p.z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c, ex = b.hw + pr, ez = b.hd + pr;
      if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
        let nx = lx, nz = lz; if (ex - Math.abs(lx) < ez - Math.abs(lz)) nx = (lx < 0 ? -1 : 1) * ex; else nz = (lz < 0 ? -1 : 1) * ez;
        p.x = b.x + nx * b.c + nz * b.s; p.z = b.z - nx * b.s + nz * b.c; moved = true;
      }
    }
    hit = hit || moved; if (!moved) break;
  }
  return hit;
}

// ------------------------------------------------------------ renderer / scene / lights
export const SUN_DIR = new THREE.Vector3(-0.45, 0.66, 0.42).normalize();   // direction towards the sun; matched to the HDRI in main.js
export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !quality.post, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pr || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = quality.high || quality.post ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.8;
  return renderer;
}
export function createLights(scene, quality) {
  const sun = new THREE.DirectionalLight(0xfff3df, 3.8); sun.castShadow = true;
  const S = quality.shadow || 2048; sun.shadow.mapSize.set(S, S);
  const R = quality.shadowRange || 40;   // a tighter box means fewer casters per frame and more texels per metre
  const sc = sun.shadow.camera; sc.left = sc.bottom = -R; sc.right = sc.top = R; sc.near = 40; sc.far = 220;
  sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.35; sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4f5a3a, 0.35); scene.add(hemi);
  return { sun, hemi };
}
/**
 * A fixed set of point lights that always lives in the scene. Effects borrow from it instead of adding lights, because
 * adding or removing a light changes the light count baked into every lit shader and forces a full recompile (a multi-second stall).
 */
export function createLightPool(scene, n = 10) {
  const pool = [];
  for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffffff, 0, 8); l.position.set(0, -500, 0); scene.add(l); pool.push({ l, busy: false }); }
  return {
    acquire(color, intensity, distance) { const e = pool.find((x) => !x.busy); if (!e) return null; e.busy = true; e.l.color.set(color); e.l.intensity = intensity; e.l.distance = distance; e.l.position.set(0, 0, 0); return e.l; },
    release(l) { const e = pool.find((x) => x.l === l); if (!e) return; e.busy = false; l.intensity = 0; scene.add(l); l.position.set(0, -500, 0); },
    free() { return pool.filter((x) => !x.busy).length; },
  };
}
export async function setupSky(scene, hdriRotationY) {
  const hdr = await loadHDRI('hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr');
  scene.background = hdr; scene.environment = hdr;
  scene.backgroundRotation.set(0, hdriRotationY, 0); scene.environmentRotation.set(0, hdriRotationY, 0);
  scene.environmentIntensity = 0.7; scene.backgroundIntensity = 1.0;
  scene.fog = new THREE.Fog(0xd3dfee, 70, 260);
  return hdr;
}

// ------------------------------------------------------------ terrain mesh with PBR splat shader
const uTime = { value: 0 };
export function heightTexture() {
  const N = 256, data = new Uint16Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) data[j * N + i] = THREE.DataUtils.toHalfFloat(terrainH((i / (N - 1) - 0.5) * 200, (j / (N - 1) - 0.5) * 200));
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
export async function buildTerrain(scene, quality) {
  const N = quality.terrainN || 160, SIZE = 200;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainH(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const [grass, forest, sand, rock] = await Promise.all([loadPBR('leafy_grass'), loadPBR('forest_floor'), loadPBR('coast_sand_01'), loadPBR('cliff_side')]);
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.6 });
  const forestZ = zoneById('forest');
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tG: { value: grass.map }, tGN: { value: grass.normalMap }, tGA: { value: grass.aoMap }, tF: { value: forest.map }, tFN: { value: forest.normalMap }, tFA: { value: forest.aoMap },
      tS: { value: sand.map }, tSN: { value: sand.normalMap }, tSA: { value: sand.aoMap }, tR: { value: rock.map }, tRN: { value: rock.normalMap }, tRA: { value: rock.aoMap },
      uForest: { value: new THREE.Vector2(forestZ.x, forestZ.z) }, uForestR: { value: forestZ.r } });
    sh.vertexShader = 'varying vec3 vWPos; varying vec3 vWNormal;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vWNormal = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = `varying vec3 vWPos; varying vec3 vWNormal; uniform sampler2D tG, tGN, tGA, tF, tFN, tFA, tS, tSN, tSA, tR, tRN, tRA; uniform vec2 uForest; uniform float uForestR;
      vec3 gTN; vec4 gTA;\n` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec3 wN = normalize(vWNormal); float slope = 1.0 - wN.y; float h = vWPos.y;
        vec2 uvG = vWPos.xz * 0.17, uvF = vWPos.xz * 0.15, uvS = vWPos.xz * 0.2;
        vec3 bw = abs(wN); bw /= (bw.x + bw.y + bw.z);
        vec2 rx = vWPos.zy * 0.11, ry = vWPos.xz * 0.11, rz = vWPos.xy * 0.11;
        vec4 rD = texture2D(tR, rx) * bw.x + texture2D(tR, ry) * bw.y + texture2D(tR, rz) * bw.z;
        vec4 rN = texture2D(tRN, rx) * bw.x + texture2D(tRN, ry) * bw.y + texture2D(tRN, rz) * bw.z;
        vec4 rA = texture2D(tRA, rx) * bw.x + texture2D(tRA, ry) * bw.y + texture2D(tRA, rz) * bw.z;
        vec4 gD = texture2D(tG, uvG), gN = texture2D(tGN, uvG), gA = texture2D(tGA, uvG);
        vec4 fD = texture2D(tF, uvF), fN = texture2D(tFN, uvF), fA = texture2D(tFA, uvF);
        vec4 sD = texture2D(tS, uvS), sN = texture2D(tSN, uvS), sA = texture2D(tSA, uvS);
        float wRock = clamp(smoothstep(0.22, 0.5, slope) + smoothstep(8.6, 10.6, h), 0.0, 1.0);
        float wSand = 1.0 - smoothstep(0.85, 1.6, h);
        float dF = distance(vWPos.xz, uForest); float wForest = (1.0 - smoothstep(uForestR * 0.6, uForestR * 1.1, dF)) * smoothstep(0.15, 0.6, 0.5 + 0.5 * sin(vWPos.x * 0.7) * cos(vWPos.z * 0.6) + gA.r * 0.4);
        float wSnow = smoothstep(12.0, 13.4, h);
        vec4 D = mix(gD, fD, wForest), Nm = mix(gN, fN, wForest), Am = mix(gA, fA, wForest);
        D = mix(D, sD, wSand); Nm = mix(Nm, sN, wSand); Am = mix(Am, sA, wSand);
        D = mix(D, rD, wRock); Nm = mix(Nm, rN, wRock); Am = mix(Am, rA, wRock);
        D = mix(D, vec4(0.9, 0.93, 0.97, 1.0), wSnow);
        D.rgb *= 0.92 + 0.16 * sin(vWPos.x * 0.05 + sin(vWPos.z * 0.04) * 3.0);
        diffuseColor *= D; gTN = Nm.xyz * 2.0 - 1.0; gTA = Am;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 wPN = normalize(normalize(vWNormal) + vec3(gTN.x, 0.0, gTN.y) * 0.9);
        normal = normalize((viewMatrix * vec4(wPN, 0.0)).xyz);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * mix(0.75, 1.0, gTA.g);')
      .replace('#include <aomap_fragment>', 'float ambientOcclusion = mix(1.0, gTA.r, 0.85); reflectedLight.indirectDiffuse *= ambientOcclusion; reflectedLight.indirectSpecular *= ambientOcclusion;');
  };
  mat.customProgramCacheKey = () => 'terrain-splat';
  const terrain = new THREE.Mesh(geo, mat); terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);
  return terrain;
}

// ------------------------------------------------------------ water
export async function buildWater(scene, hdr, hdriRotationY, quality) {
  const normals = await loadTexture('textures/waternormals.jpg', { repeat: 1 });
  const geo = new THREE.PlaneGeometry(800, 800, quality.high ? 200 : 80, quality.high ? 200 : 80);
  const fog = scene.fog;
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { uTime, tN: { value: normals }, tSky: { value: hdr }, tH: { value: heightTexture() }, uSkyRot: { value: hdriRotationY }, uSunDir: { value: SUN_DIR },
      uShallow: { value: new THREE.Color(0x2f8fb8).convertSRGBToLinear() }, uDeep: { value: new THREE.Color(0x0e3f6f).convertSRGBToLinear() },
      uFog: { value: fog.color }, uFogNear: { value: fog.near }, uFogFar: { value: fog.far }, uWaterY: { value: WATER_Y } },
    vertexShader: `uniform float uTime; varying vec3 vW; varying vec2 vUvW;
      void main(){ vec3 p = position; float a = p.x * 0.18 + uTime * 0.9, b = p.y * 0.15 - uTime * 0.7;
        p.z += sin(a) * 0.07 + cos(b) * 0.07 + sin((p.x + p.y) * 0.5 + uTime * 1.6) * 0.025;
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uSkyRot, uFogNear, uFogFar, uWaterY; uniform sampler2D tN, tSky, tH; uniform vec3 uSunDir, uShallow, uDeep, uFog; varying vec3 vW;
      vec2 equirect(vec3 d){ return vec2(atan(d.z, d.x) / 6.28318 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159 + 0.5); }
      vec3 rotY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
      void main(){
        vec2 uv1 = vW.xz * 0.06 + vec2(uTime * 0.02, uTime * 0.013), uv2 = vW.xz * 0.11 - vec2(uTime * 0.017, -uTime * 0.021);
        vec3 n1 = texture2D(tN, uv1).xyz * 2.0 - 1.0, n2 = texture2D(tN, uv2).xyz * 2.0 - 1.0;
        vec3 N = normalize(vec3((n1.x + n2.x) * 0.35, 1.0, (n1.y + n2.y) * 0.35));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(V, N), 0.0), 3.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        vec3 sky = texture2D(tSky, equirect(rotY(R, -uSkyRot))).rgb;
        float ground = texture2D(tH, vW.xz / 200.0 + 0.5).r; float depth = clamp((uWaterY - ground) / 3.0, 0.0, 1.0);
        vec3 col = mix(uShallow, uDeep, depth);
        col = mix(col, sky, 0.25 + 0.7 * fres);
        vec3 H = normalize(V + uSunDir); float spec = pow(max(dot(N, H), 0.0), 320.0);
        col += vec3(1.0, 0.95, 0.85) * spec * 3.0;
        float foam = (1.0 - smoothstep(0.0, 0.16, depth)) * smoothstep(0.35, 0.75, n1.z * 0.5 + n2.z * 0.5 + 0.2 * sin(uTime * 2.0 + vW.x * 0.8 + vW.z * 0.6));
        col = mix(col, vec3(0.95), foam * 0.7);
        float f = smoothstep(uFogNear, uFogFar, distance(cameraPosition, vW)); col = mix(col, uFog, f);
        float alpha = mix(0.55, 0.97, smoothstep(0.0, 0.25, depth));
        gl_FragColor = vec4(col, alpha); }` });
  const water = new THREE.Mesh(geo, mat); water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; scene.add(water);
  return water;
}

// ------------------------------------------------------------ vegetation & rock instancing from glTF models
function bakedParts(gltf) {
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone().applyMatrix4(o.matrixWorld); parts.push({ geometry: g, material: o.material }); } });
  return parts;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const LOD_GROUPS = [];
/**
 * Instances `parts` at `placements`, split into spatial cells so frustum culling works per cell, with an optional
 * low-detail `lodParts` set for distant cells (switched in updateLOD). `cullOnly` groups (grass) simply vanish beyond the near range.
 */
export function scatterParts(scene, parts, placements, { shadows = true, lodParts = null, cell = 34, cullOnly = false, collide = 0, field = null, name = '' } = {}) {
  if (collide) for (const pl of placements) addCircle(pl.x, pl.z, collide * pl.s);
  if (field) for (const pl of placements) addField(field, pl.x, pl.z, pl.rot, pl.s, pl.y);
  const cells = new Map();
  for (const pl of placements) { const key = `${Math.floor(pl.x / cell)}_${Math.floor(pl.z / cell)}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(pl); }
  const meshes = [];
  for (const list of cells.values()) {
    const center = new THREE.Vector3(); list.forEach((p) => center.add(new THREE.Vector3(p.x, p.y, p.z))); center.multiplyScalar(1 / list.length);
    const mk = (partList, castShadow) => partList.map((part) => { const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((pl, i) => { _p.set(pl.x, pl.y, pl.z); _q.setFromAxisAngle(UP, pl.rot); _s.setScalar(pl.s); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); });
      im.castShadow = castShadow; im.receiveShadow = true; im.computeBoundingSphere(); im.name = name; im.userData.lod = partList === lodParts; scene.add(im); meshes.push(im); return im; });
    // Shadows come from the far-LOD geometry: a shadow proxy that draws nothing (colorWrite off) but casts, so the shadow pass
    // handles a few thousand triangles per tree instead of the full scan. The detailed mesh itself casts nothing.
    const proxy = shadows && lodParts;
    const near = mk(parts, shadows && !proxy), far = lodParts ? mk(lodParts, false) : null;
    if (far) far.forEach((m) => (m.visible = false));
    let shadowProxy = null;
    if (proxy) { shadowProxy = mk(lodParts.map((part) => ({ geometry: part.geometry, material: shadowProxyMaterial(part.material) })), true); shadowProxy.forEach((m) => { m.receiveShadow = false; m.userData.proxy = true; }); }
    LOD_GROUPS.push({ center, near, far, cullOnly, shadowProxy });
  }
  return meshes;
}
export function updateLOD(camPos, nearDist, farDist) {
  for (const g of LOD_GROUPS) {
    const d = g.center.distanceTo(camPos), isNear = d < nearDist;
    const nearVisible = isNear || (!g.far && d < (g.cullOnly ? nearDist * 1.25 : farDist));
    for (const m of g.near) m.visible = nearVisible;
    if (g.far) { const v = !isNear && d < farDist; for (const m of g.far) m.visible = v; }
    if (g.shadowProxy) for (const m of g.shadowProxy) m.visible = isNear;   // far cells show the LOD itself, which does not cast
  }
}
const PROXY_CACHE = new Map();
/** A material that writes no colour or depth but keeps the alpha cutout, so the object exists only for the shadow pass. */
function shadowProxyMaterial(src) {
  if (PROXY_CACHE.has(src)) return PROXY_CACHE.get(src);
  const m = new THREE.MeshBasicMaterial({ map: src.map || null, alphaTest: src.alphaTest || 0, side: src.side, colorWrite: false, depthWrite: false });
  PROXY_CACHE.set(src, m); return m;
}
const FIELD_CACHE = new Map();
const fieldFor = (name, parts, opts = {}) => { const key = name + (opts.maxY !== undefined ? '@' + opts.maxY : ''); if (!FIELD_CACHE.has(key)) FIELD_CACHE.set(key, buildHeightField(parts, 0.35, opts)); return FIELD_CACHE.get(key); };
/** Registers a walkable height field for an already placed model (used when its scale is only known after placement). `maxY` (model units) drops roofs and arches. */
export async function addModelField(name, x, z, rot, scale, y, opts = {}) { const gltf = await loadModel(name); addField(fieldFor(name, bakedParts(gltf), opts), x, z, rot, scale, y); }
/** True when a camera at (x, y, z) would sit inside a building or under a rock or deck surface. */
export function cameraBlocked(x, y, z) {
  for (const b of COLLIDERS.boxes) { const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; if (Math.abs(lx) < b.hw + 0.3 && Math.abs(lz) < b.hd + 0.3 && y < terrainH(x, z) + 4.5) return true; }
  return rockH(x, z) > y - 0.3;
}
export async function scatterModel(scene, name, placements, { foliage = false, shadows = true, envMapIntensity = 0.8, cullOnly = false, collide = 0, field = false } = {}) {
  if (!placements.length) return [];
  const gltf = await loadModel(name);
  prepareModel(gltf.scene, { foliage, envMapIntensity });
  let lodParts = null;
  try { const lod = await loadGLTF(`models/${name}/${name}.lod.glb`); prepareModel(lod.scene, { foliage, envMapIntensity, alphaTest: 0.12 }); lodParts = bakedParts(lod); } catch (e) { /* no LOD variant */ }   // far cards stay solid instead of dissolving
  const parts = bakedParts(gltf);
  return scatterParts(scene, parts, placements, { shadows, lodParts, cullOnly, collide, field: field ? fieldFor(name, parts) : null, name });
}
/**
 * Card-based conifer: a tapered trunk with bark PBR plus tiers of textured twig cards. A few hundred triangles per tree,
 * so it can be instanced by the hundred. `kind` picks the Poly Haven twig texture set (pine_tree_01 / fir_tree_01).
 */
export async function conifierParts(kind = 'pine_tree_01', { height = 14, tiers = 7, cardsPerTier = 7, radius = 3.2 } = {}) {
  const tdir = `models/${kind}/textures/${kind}_twig_`;
  const [diff, alpha, nor, arm] = await Promise.all([loadTexture(tdir + 'diff_1k.jpg', { srgb: true }), loadTexture(tdir + 'alpha_1k.jpg').catch(() => null), loadTexture(tdir + 'nor_gl_1k.jpg'), loadTexture(tdir + 'arm_1k.jpg')]);
  const bark = await loadPBR('pine_bark', { repeat: 1 });
  const twigMat = new THREE.MeshStandardMaterial({ map: diff, alphaMap: alpha || undefined, normalMap: nor, aoMap: arm, roughnessMap: arm, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.7 });
  const trunkMat = new THREE.MeshStandardMaterial({ ...bark, roughness: 1, envMapIntensity: 0.6 });
  const trunk = new THREE.CylinderGeometry(0.12, 0.42, height * 0.96, 10, 6); trunk.translate(0, height * 0.48, 0);
  const uv = trunk.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * height * 0.5);
  const cards = [];
  const cw = 2.1, ch = 1.3;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1), y = height * (0.22 + 0.74 * f), r = radius * (1.0 - 0.8 * f) + 0.3, n = Math.max(3, Math.round(cardsPerTier * (1 - 0.5 * f)));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + t * 0.7 + srand() * 0.4, len = r + srand() * 0.5;
      const g = new THREE.PlaneGeometry(cw * (0.7 + 0.5 * (1 - f)), ch * (0.7 + 0.5 * (1 - f)), 1, 2);
      g.translate(0, ch * 0.3, 0);
      const mtx = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeTranslation(0, y, len * 0.55)).multiply(new THREE.Matrix4().makeRotationX(-0.9 - 0.2 * srand())).multiply(new THREE.Matrix4().makeRotationZ((srand() - 0.5) * 0.5));
      g.applyMatrix4(mtx); cards.push(g);
      const g2 = g.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(0.0001)); // duplicate rotated 90° around the card's own axis for volume
      const c = new THREE.Vector3(Math.sin(a) * len * 0.55, y, Math.cos(a) * len * 0.55);
      g2.translate(-c.x, -c.y, -c.z).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)).translate(c.x, c.y, c.z); cards.push(g2);
    }
  }
  const top = new THREE.PlaneGeometry(1.4, 2.2, 1, 2); top.translate(0, height * 0.97 + 0.6, 0); cards.push(top, top.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const foliage = mergeGeometries(cards, false); foliage.computeVertexNormals();
  return [{ geometry: trunk, material: trunkMat }, { geometry: foliage, material: twigMat }];
}
export function placements(count, { minH = 1.2, maxH = 8.5, maxSlope = 0.6, avoidZones = true, zoneMargin = 0.95, near = null, minDist = 0, scale = [0.9, 1.3], seedOffset = 0, exclude = [], sink = 0 } = {}) {
  const out = []; let tries = 0;
  while (out.length < count && tries < count * 40) {
    tries++;
    let x, z;
    if (near) { const a = srand() * 6.283, r = near.r0 + srand() * (near.r1 - near.r0); x = near.x + Math.cos(a) * r; z = near.z + Math.sin(a) * r; }
    else { x = srand() * 176 - 88; z = srand() * 168 - 84; }
    const h = terrainH(x, z); if (h < minH || h > maxH || slopeAt(x, z) > maxSlope) continue;
    if (avoidZones && ZONES.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r * zoneMargin)) continue;
    if (exclude.some((e) => Math.hypot(x - e.x, z - e.z) < e.r)) continue;
    if (minDist && out.some((o) => Math.hypot(o.x - x, o.z - z) < minDist)) continue;
    const s = scale[0] + srand() * (scale[1] - scale[0]);
    out.push({ x, y: h - 0.05 - sink * slopeAt(x, z) * s, z, rot: srand() * 6.283, s });   // `sink` buries rocks into slopes so their downhill side does not hover
  }
  return out;
}
export function windSway(material, strength = 0.12) {
  if (material.userData.wind) return material;
  material.userData.wind = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh) => {
    if (prev) prev(sh);
    sh.uniforms.uTime = uTime;
    if (!sh.vertexShader.includes('uniform float uTime')) sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float hgt = max(transformed.y, 0.0);
      float sw = sin(uTime * 1.4 + instanceMatrix[3].x * 0.3 + instanceMatrix[3].z * 0.25) * ${strength.toFixed(3)} * hgt * hgt;
      transformed.x += sw; transformed.z += sw * 0.5;
      #endif`);
  };
  material.customProgramCacheKey = () => 'wind' + strength;
  return material;
}

// ------------------------------------------------------------ props (single placed models)
export async function placeModel(scene, name, x, z, { rot = 0, scale = 1, y = null, foliage = false, envMapIntensity = 0.8, onGround = true, collide = true, field = false } = {}) {
  const gltf = await loadModel(name);
  const obj = gltf.scene.clone(true); prepareModel(obj, { foliage, envMapIntensity });
  obj.position.set(x, y ?? (onGround ? terrainH(x, z) : 0), z); obj.rotation.y = rot; obj.scale.setScalar(scale); scene.add(obj);
  if (field) addField(fieldFor(name, bakedParts(gltf)), x, z, rot, scale, obj.position.y);
  else if (collide) { obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj), size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()); const r = Math.max(size.x, size.z) / 2;
    if (r > 4) addBox(c.x, c.z, size.x * 0.8, size.z * 0.8, 0); else if (r >= 0.22) addCircle(c.x, c.z, Math.min(r * 0.85, 4)); }
  return obj;
}
export function modelSize(obj) { const b = new THREE.Box3().setFromObject(obj); return b.getSize(new THREE.Vector3()); }

// ------------------------------------------------------------ buildings
const texCache = {};
async function tex(name, repeat) { const k = name + repeat; if (!texCache[k]) texCache[k] = pbrMaterial(name, { repeat, envMapIntensity: 0.7 }); const m = await texCache[k]; return m.clone(); }
function scaleUV(geo, sx, sy) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); return geo; }
function box(w, h, d, mat, uvScale = 0.5) { const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv;
  // per-face UV scaling so textures keep their real-world size: faces order +x -x +y -y +z -z
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] * uvScale, uv.getY(k) * dims[f][1] * uvScale); }
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m; }
export async function cottage(scene, x, z, { w = 5, d = 4.2, h = 2.9, rot = 0, roof = 'clay_roof_tiles_02', wall = 'plastered_wall_02', timber = true } = {}) {
  const g = new THREE.Group();
  const [wallM, roofM, woodM, brickM] = await Promise.all([tex(wall, 1), tex(roof, 1), tex('brown_planks_09', 1), tex('castle_brick_02_red', 1)]);
  const walls = box(w, h, d, wallM, 0.45); walls.position.y = h / 2; g.add(walls);
  const base = box(w + 0.3, 0.5, d + 0.3, brickM, 0.6); base.position.y = 0.25; g.add(base);
  if (timber) { for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) { const b = box(0.22, h, 0.22, woodM, 0.8); b.position.set(px, h / 2, pz); g.add(b); }
    const beamF = box(w + 0.2, 0.2, 0.24, woodM, 0.8); beamF.position.set(0, h - 0.1, d / 2); g.add(beamF);
    const beamB = beamF.clone(); beamB.position.z = -d / 2; g.add(beamB);
    for (const s of [-1, 1]) { const diag = box(0.16, h * 0.9, 0.16, woodM, 0.8); diag.position.set(s * w * 0.25, h / 2, d / 2 + 0.02); diag.rotation.z = s * 0.55; g.add(diag); } }
  // roof: two slabs + gables
  const pitch = 0.75, rh = Math.tan(pitch) * (d / 2 + 0.4), slabLen = Math.hypot(d / 2 + 0.5, rh);
  for (const s of [-1, 1]) { const slab = box(w + 1.0, 0.14, slabLen, roofM, 0.5); slab.position.set(0, h + rh / 2, s * (d / 4 + 0.15)); slab.rotation.x = s * pitch; g.add(slab); }
  const gable = new THREE.Shape(); gable.moveTo(-d / 2, 0); gable.lineTo(d / 2, 0); gable.lineTo(0, rh); gable.closePath();
  for (const s of [-1, 1]) { const gm = new THREE.Mesh(scaleUV(new THREE.ShapeGeometry(gable), 0.45, 0.45), wallM); gm.rotation.y = s * Math.PI / 2; gm.position.set(s * (w / 2 - 0.01), h, 0); gm.castShadow = true; gm.receiveShadow = true; g.add(gm); if (s === -1) gm.material = wallM; }
  const chimney = box(0.7, 1.6, 0.7, brickM, 0.8); chimney.position.set(w * 0.3, h + rh * 0.55 + 0.4, -d * 0.15); g.add(chimney);
  const doorM = await tex('dark_wood', 1); const door = box(1.0, 2.0, 0.12, doorM, 0.5); door.position.set(-w * 0.2, 1.0, d / 2 + 0.05); g.add(door);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xfff1c8, emissive: 0xffd28a, emissiveIntensity: 0.45, roughness: 0.1, metalness: 0 });
  for (const [px, pz, ry] of [[w * 0.2, d / 2 + 0.05, 0], [w / 2 + 0.05, 0, Math.PI / 2], [-w / 2 - 0.05, 0.6, Math.PI / 2]]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.08), glass); win.position.set(px, 1.6, pz); win.rotation.y = ry; g.add(win);
    const frame = box(1.05, 1.05, 0.1, woodM, 0.8); frame.position.copy(win.position).add(new THREE.Vector3(0, 0, ry ? 0 : -0.02)); frame.rotation.y = ry; g.add(frame); win.position.z += ry ? 0 : 0.02; }
  g.position.set(x, terrainH(x, z) - 0.15, z); g.rotation.y = rot; scene.add(g); addBox(x, z, w + 0.5, d + 0.5, rot); return g;
}
export async function tower(scene, x, z, h0) {
  const g = new THREE.Group();
  const [brick, slate, wood] = await Promise.all([tex('castle_brick_02_red', 1), tex('roof_slates_02', 1), tex('dark_wood', 1)]);
  const body = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(3.6, 4.2, 15, 24, 1, true), 9, 4), brick); body.position.y = 7.5; body.castShadow = true; body.receiveShadow = true; g.add(body);
  const cap = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(4.3, 4.3, 0.8, 24), 9, 0.5), brick); cap.position.y = 15.2; cap.castShadow = true; g.add(cap);
  const roof = new THREE.Mesh(scaleUV(new THREE.ConeGeometry(4.6, 5.5, 24, 1, true), 8, 3), slate); roof.position.y = 18.2; roof.castShadow = true; g.add(roof);
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; const merlon = box(1.0, 1.0, 0.7, brick, 0.8); merlon.position.set(Math.cos(a) * 4.1, 16.1, Math.sin(a) * 4.1); merlon.rotation.y = -a; g.add(merlon); }
  const door = box(1.6, 2.6, 0.2, wood, 0.6); door.position.set(0, 1.3, 4.1); g.add(door);
  const glow = new THREE.MeshPhysicalMaterial({ color: 0xffe0a0, emissive: 0xffb347, emissiveIntensity: 1.2 });
  for (let i = 0; i < 4; i++) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.2), glow); const a = i * 1.57 + 0.3; win.position.set(Math.cos(a) * 3.9, 5 + i * 2.6, Math.sin(a) * 3.9); win.rotation.y = -a + Math.PI / 2; g.add(win); }
  g.position.set(x, h0 - 0.2, z); scene.add(g); addCircle(x, z, 4.5); return g;
}

// ------------------------------------------------------------ post-processing
export function createPost(renderer, scene, camera, quality) {
  if (!quality.post) return null;
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null; const AO_SCALE = 0.5;   // ambient occlusion at half resolution: a quarter of the pixel work, the blur hides it
  if (quality.ao) { gtao = new GTAOPass(scene, camera, size.x * AO_SCALE, size.y * AO_SCALE); gtao.blendIntensity = 0.65; gtao.updateGtaoMaterial({ radius: 0.8, distanceExponent: 1, thickness: 1, scale: 1.1, samples: 8, distanceFallOff: 1 }); composer.addPass(gtao); }
  const bloom = quality.bloom !== false ? new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.18, 0.55, 0.88) : null; if (bloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader); composer.addPass(grade);   // display-referred colour grade: contrast, saturation, warm highlights, vignette
  const smaa = new SMAAPass(size.x * pr, size.y * pr); composer.addPass(smaa);
  return { composer, gtao, bloom, grade, resize(w, h) { composer.setSize(w, h); if (gtao) gtao.setSize(w * AO_SCALE, h * AO_SCALE); if (bloom) bloom.setSize(w, h); grade.uniforms.uAspect.value = w / h; } };
}
export const worldTime = uTime;
