// Asset loading: glTF / FBX models, PBR texture sets, HDRI, animation clips with rig retargeting.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const manager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(manager);
const dracoLoader = new DRACOLoader(manager); dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`); gltfLoader.setDRACOLoader(dracoLoader);   // decoder files copied from three/examples/jsm/libs/draco/gltf into public/draco
if (navigator.webdriver) gltfLoader.textureLoader = new THREE.TextureLoader(manager);   // headless Chromium's ImageBitmap decoder rejects some PNGs
const fbxLoader = new FBXLoader(manager);
const texLoader = new THREE.TextureLoader(manager);
const rgbeLoader = new HDRLoader(manager);
const cache = new Map();
const A = (p) => `${import.meta.env.BASE_URL}assets/${p}`;   // BASE_URL is '/' in dev and '/beyondmeanfields/' on GitHub Pages

function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

export const loadGLTF = (path) => cached('gltf:' + path, () => gltfLoader.loadAsync(A(path)));
/** Poly Haven model by name: the decimated .glb when the optimiser has produced one, else the source .gltf. */
export const loadModel = (name) => cached('model:' + name, async () => {
  try { return await gltfLoader.loadAsync(A(`models/${name}/${name}.glb`)); }
  catch (e) { return gltfLoader.loadAsync(A(`models/${name}/${name}.gltf`)); }
});
export const loadFBX = (path) => cached('fbx:' + path, () => fbxLoader.loadAsync(A(path)));
export const loadHDRI = (path) => cached('hdr:' + path, async () => { const t = await rgbeLoader.loadAsync(A(path)); t.mapping = THREE.EquirectangularReflectionMapping; return t; });
export function loadTexture(path, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  return cached('tex:' + path + repeat, async () => {
    const t = await texLoader.loadAsync(A(path));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
/** Poly Haven texture set: diffuse + GL normal + ARM (ao / roughness / metalness packed). */
export async function loadPBR(name, { repeat = 1, disp = false } = {}) {
  const [map, normalMap, arm] = await Promise.all([
    loadTexture(`textures/${name}/diffuse.jpg`, { srgb: true, repeat }), loadTexture(`textures/${name}/nor_gl.jpg`, { repeat }), loadTexture(`textures/${name}/arm.jpg`, { repeat })]);
  const set = { map, normalMap, aoMap: arm, roughnessMap: arm, metalnessMap: arm };
  if (disp) set.displacementMap = await loadTexture(`textures/${name}/displacement.jpg`, { repeat });
  return set;
}
export async function pbrMaterial(name, { repeat = 1, roughness = 1, metalness = 1, color = 0xffffff, envMapIntensity = 1, ...rest } = {}) {
  const maps = await loadPBR(name, { repeat });
  return new THREE.MeshStandardMaterial({ ...maps, roughness, metalness, color, envMapIntensity, ...rest });
}

/** Shadow flags + foliage alpha handling for a loaded model. */
export function prepareModel(root, { shadows = true, foliage = false, envMapIntensity = 1 } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = shadows; o.receiveShadow = shadows;
    if (o.isSkinnedMesh) o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.envMapIntensity = envMapIntensity;
      const leafy = foliage || m.transparent || /twig|leaf|leaves|foliage|grass|fern|flower|needle/i.test(m.name + o.name);
      if (leafy && m.map) { m.transparent = false; m.alphaTest = 0.45; m.side = THREE.DoubleSide; m.depthWrite = true; }
      if (m.map) m.map.anisotropy = 8;
    }
  });
  return root;
}
export const cloneSkinned = (root) => SkeletonUtils.clone(root);

/** Bone name prefix of a rig: 'mixamorig' for Mixamo exports, '' for Ready Player Me. */
export function rigPrefix(root) {
  let prefix = null;
  root.traverse((o) => { if (prefix === null && o.isBone && /Hips$/.test(o.name)) prefix = o.name.slice(0, -4); });
  return prefix ?? '';
}
export function boneNames(root) { const s = new Set(); root.traverse((o) => { if (o.isBone) s.add(o.name); }); return s; }
/**
 * Re-key a clip for another Mixamo-family rig: swap the bone prefix, drop translation tracks (units differ between
 * rigs), and prune bones the target does not have.
 */
/**
 * Copies a clip onto another rig by bone name. With `srcRest`/`dstRest` (bone name → rest quaternion of each rig) the rotation
 * tracks carry each bone's deviation from its own rest pose instead of the raw rotation, which is what makes clips made for
 * one rest pose (the Ready Player Me library) work on a rig with a different one.
 */
export function retargetClip(clip, srcPrefix, dstPrefix, dstBones, { keepHipsY = false, dropHips = false, srcRest = null, dstRest = null } = {}) {
  const tracks = [], qa = new THREE.Quaternion(), qs = new THREE.Quaternion(), qd = new THREE.Quaternion();
  for (const t of clip.tracks) {
    const m = t.name.match(/^([^.]+)\.(\w+)$/); if (!m) continue;
    const [, node, prop] = m;
    if (prop === 'position' && !keepHipsY) continue;
    const base = node.startsWith(srcPrefix) ? node.slice(srcPrefix.length) : node;
    const rest = srcRest && dstRest && srcRest.get(base) && dstRest.get(dstPrefix + base);
    if (base === 'Hips' && (srcPrefix !== dstPrefix || dropHips) && !rest) continue;   // the root bone's rest orientation differs between the rigs; keep the bind pose
    const target = dstPrefix + base;
    if (!dstBones.has(target)) continue;
    const nt = t.clone(); nt.name = `${target}.${prop}`;
    if (rest && prop === 'quaternion') { qs.copy(srcRest.get(base)).invert(); qd.copy(dstRest.get(target)); const v = nt.values;
      for (let i = 0; i + 3 < v.length; i += 4) { qa.set(v[i], v[i + 1], v[i + 2], v[i + 3]); qa.premultiply(qs).premultiply(qd); v[i] = qa.x; v[i + 1] = qa.y; v[i + 2] = qa.z; v[i + 3] = qa.w; } }
    tracks.push(nt);
  }
  const out = new THREE.AnimationClip(clip.name, clip.duration, tracks); out.resetDuration(); return out;
}

/** Shared animation library loaded from the Ready Player Me clips (unprefixed Mixamo rig). */
export const CLIP_FILES = {
  idle: 'characters/M_Standing_Idle_001.glb', idle2: 'characters/M_Standing_Idle_Variations_002.glb', walk: 'characters/M_Walk_001.glb', run: 'characters/M_Run_001.glb',
  jog: 'characters/M_Jog_001.glb', back: 'characters/M_Walk_Backwards_001.glb', jump: 'characters/M_Walk_Jump_001.glb', talk: 'characters/M_Talking_Variations_001.glb',
  gesture: 'characters/M_Standing_Expressions_001.glb', fidle: 'characters/F_Standing_Idle_001.glb', ftalk: 'characters/F_Talking_Variations_001.glb', ftalk2: 'characters/F_Talking_Variations_003.glb',
};
export async function loadClipLibrary() {
  const lib = {};
  await Promise.all(Object.entries(CLIP_FILES).map(async ([k, f]) => { try { const g = await loadGLTF(f); lib[k] = g.animations[0]; } catch (e) { console.warn('clip missing', f); } }));
  return lib;
}
