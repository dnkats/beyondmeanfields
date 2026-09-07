// Bootstrap: renderer, sky, terrain, water, vegetation, buildings, props, characters, post-processing, then the game.
import * as THREE from 'three';
import { manager, loadClipLibrary, initTextureSupport } from './assets.js';
import { ZONES, zoneById, terrainH, walkable, WATER_Y, createRenderer, createLights, setupSky, buildTerrain, buildWater, scatterModel, scatterParts, conifierParts, placements, windSway, placeModel, modelSize, cottage, tower, createPost, srand, SUN_DIR, updateLOD, addCircle, resolveCollisions, createLightPool, surfaceH, rockH, COLLIDERS, addModelField, setRenderer, IMPOSTORS } from './world.js';
import { createCharacter } from './characters.js';
import { createGame } from './game.js';
import { SPELLS } from './spells.js';
import { buildSigils, createFX } from './fx.js';
import { moleculeModel } from './molecules.js';
import { ENCOUNTERS } from './spells.js';

const $ = (id) => document.getElementById(id);
const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const PRESETS = {
  // ao renders the scene a second time for normals, so it is only worth it once the geometry is cheap; shadows use a 40 m box around the player
  // lodNear / lodFar / impFar: full mesh, decimated mesh, billboard impostor (distance to the nearest tree of a cell)
  high:   { high: true,  post: true,  ao: true,  bloom: true,  shadow: 2048, pr: 1.25, grass: 2000, trees: 1.0, lodNear: 40, lodFar: 110, impFar: 320, terrainN: 220 },
  medium: { high: false, post: true,  ao: false, bloom: true,  shadow: 2048, pr: 1.0,  grass: 1200, trees: 0.7, lodNear: 28, lodFar: 80,  impFar: 320, terrainN: 160 },
  low:    { high: false, post: false, ao: false, bloom: false, shadow: 1024, pr: 1.0,  grass: 600,  trees: 0.5, lodNear: 20, lodFar: 60,  impFar: 300, terrainN: 120 },
};
function detectPreset() {
  const forced = new URLSearchParams(location.search).get('q') || localStorage.getItem('ci.quality'); if (forced && PRESETS[forced]) return forced;
  if (coarse || window.innerWidth < 900) return 'low';
  try { const gl = document.createElement('canvas').getContext('webgl2'); const ext = gl && gl.getExtension('WEBGL_debug_renderer_info'); const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/Intel|Iris|UHD|HD Graphics|Mali|Adreno|PowerVR|Apple M1|Apple GPU|llvmpipe|SwiftShader|Radeon\(TM\) Graphics|Vega [0-9]/i.test(r)) return 'medium'; } catch (e) { /* ignore */ }
  if ((navigator.hardwareConcurrency || 8) <= 4) return 'medium';
  return 'high';
}
const qname = detectPreset();
const quality = { name: qname, ...PRESETS[qname] };
// a pixel budget per preset: large HiDPI laptop screens would otherwise start far above what their GPU can shade
{ const budget = { high: 2.6e6, medium: 1.7e6, low: 1.1e6 }[qname]; quality.pr = Math.max(0.6, Math.min(quality.pr, Math.sqrt(budget / Math.max(1, window.innerWidth * window.innerHeight)))); }
manager.onProgress = (url, loaded, total) => { $('loadbar').style.width = (100 * loaded / total).toFixed(0) + '%'; $('loadtxt').textContent = `${loaded} / ${total} · ${url.split('/').slice(-1)[0]}`; };

// HDRI sun: azimuth 34.2°, elevation 47.8° in the map. We rotate the sky so the sun sits at azimuth PHI, then aim the light there.
const HDRI_AZ = 34.2 * Math.PI / 180, HDRI_EL = 47.8 * Math.PI / 180, PHI = 137 * Math.PI / 180;
const SKY_ROT = HDRI_AZ - PHI;
SUN_DIR.set(Math.cos(HDRI_EL) * Math.cos(PHI), Math.sin(HDRI_EL), Math.cos(HDRI_EL) * Math.sin(PHI)).normalize();

const canvas = $('c');
const renderer = createRenderer(canvas, quality); setRenderer(renderer); initTextureSupport(renderer);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 600);
const { sun } = createLights(scene, quality);
const lights = createLightPool(scene, 10);
let post = null;
function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (post) post.resize(w, h); }
window.addEventListener('resize', resize); resize();

async function build() {
  const hdr = await setupSky(scene, SKY_ROT);
  await buildTerrain(scene, quality);
  await buildWater(scene, hdr, SKY_ROT, quality);
  const forest = zoneById('forest');
  const T = quality.trees;
  // vegetation
  const jobs = [];
  // trees: Quaternius Stylized Nature MegaKit (CC0), 1.6-10k triangles each with solid leaf geometry; every type gets a billboard impostor for the distance
  const tree = (name, n, opts, collide = 0.3) => jobs.push(scatterModel(scene, name, placements(Math.round(n * T), opts), { foliage: true, impostor: true, collide }));
  const ring = { near: { x: forest.x, z: forest.z, r0: 5, r1: 17 }, avoidZones: false, minDist: 3.6, exclude: [{ x: forest.x - 1, z: forest.z, r: 4 }] };
  tree('q_pine_1', 18, { ...ring, scale: [0.9, 1.4] }); tree('q_pine_3', 16, { ...ring, scale: [0.9, 1.3], seedOffset: 1 }); tree('q_tree_3', 12, { ...ring, scale: [0.9, 1.2], seedOffset: 2 });
  tree('q_pine_2', 24, { minDist: 4.5, scale: [0.9, 1.4], maxH: 8.5 }); tree('q_pine_4', 20, { minDist: 4.5, scale: [0.9, 1.3], maxH: 8.5, seedOffset: 3 }); tree('q_pine_5', 16, { minDist: 4.5, scale: [0.9, 1.3], maxH: 8.5, seedOffset: 4 });
  tree('q_tree_1', 20, { minDist: 5.5, scale: [0.9, 1.3], maxH: 7 }); tree('q_tree_2', 18, { minDist: 5.5, scale: [0.9, 1.3], maxH: 7, seedOffset: 5 });
  tree('q_tree_4', 16, { minDist: 5.5, scale: [0.9, 1.3], maxH: 7, seedOffset: 6 }); tree('q_tree_5', 16, { minDist: 5.5, scale: [0.9, 1.3], maxH: 7, seedOffset: 7 });
  tree('q_twisted_1', 5, { minDist: 12, scale: [0.6, 0.8], maxH: 7, zoneMargin: 1.2 }, 0.6); tree('q_twisted_2', 4, { minDist: 12, scale: [0.6, 0.8], maxH: 7, zoneMargin: 1.2, seedOffset: 8 }, 0.6); tree('q_twisted_3', 4, { minDist: 12, scale: [0.6, 0.8], maxH: 7, zoneMargin: 1.2, seedOffset: 9 }, 0.6);
  tree('q_dead_1', 4, { near: { x: forest.x, z: forest.z, r0: 3, r1: 14 }, avoidZones: false, scale: [0.55, 0.75] }, 0.4); tree('q_dead_2', 4, { near: { x: forest.x, z: forest.z, r0: 3, r1: 14 }, avoidZones: false, scale: [0.55, 0.75], seedOffset: 10 }, 0.4);
  // undergrowth casts no shadows: it is small, plentiful, and the shadow pass was doubling the frame
  jobs.push(scatterModel(scene, 'q_bush_flowers', placements(Math.round(150 * T), { scale: [0.6, 1.1], zoneMargin: 0.6, seedOffset: 11 }), { foliage: true, shadows: false }));   // the kit's plain bush is red-leaved; the flowering one is green
  jobs.push(scatterModel(scene, 'q_fern', placements(Math.round(110 * T), { near: { x: forest.x, z: forest.z, r0: 2, r1: 20 }, avoidZones: false, scale: [0.6, 1.0] }), { foliage: true, shadows: false }));
  jobs.push(scatterModel(scene, 'q_flowers_3', placements(Math.round(40 * T), { near: { x: -20, z: 20, r0: 0, r1: 45 }, avoidZones: false, scale: [0.3, 0.5] }), { foliage: true, shadows: false }));
  jobs.push(scatterModel(scene, 'q_flowers_4', placements(Math.round(30 * T), { near: { x: -20, z: 20, r0: 0, r1: 45 }, avoidZones: false, scale: [0.3, 0.5], seedOffset: 12 }), { foliage: true, shadows: false }));
  jobs.push(scatterModel(scene, 'namaqualand_boulder_02', placements(30, { scale: [0.7, 1.5], maxSlope: 1.2, minH: 0.8, zoneMargin: 1.1, seedOffset: 7, sink: 0.5 }), { shadows: true, field: true }));   // boulder_01's scan cannot be simplified below 54k (seams), this one is 3.5k
  jobs.push(scatterModel(scene, 'rock_moss_set_01', placements(30, { scale: [0.8, 1.6], maxSlope: 1.2, sink: 0.5 }), { shadows: true, field: true }));
  jobs.push(scatterModel(scene, 'stone_01', placements(70, { scale: [0.6, 1.8], maxSlope: 1.5, minH: 0.6 }), { shadows: true }));
  jobs.push(scatterModel(scene, 'coast_rocks_02', placements(22, { minH: 0.2, maxH: 1.2, maxSlope: 2, scale: [0.5, 1.0], zoneMargin: 1.4 }), { shadows: true, field: true }));
  jobs.push(scatterModel(scene, 'namaqualand_boulder_02', placements(18, { near: { x: 36, z: -36, r0: 4, r1: 22 }, avoidZones: false, maxSlope: 1.5, scale: [0.6, 1.3], sink: 0.5 }), { shadows: true, field: true }));
  jobs.push(scatterModel(scene, 'rock_face_01', placements(10, { near: { x: 0, z: -60, r0: 12, r1: 24 }, avoidZones: false, maxSlope: 3, minH: 3, scale: [0.6, 1.2], sink: 0.6 }), { shadows: true, field: true }));
  jobs.push(scatterModel(scene, 'tree_stump_01', placements(14, { near: { x: forest.x, z: forest.z, r0: 3, r1: 16 }, avoidZones: false, scale: [0.8, 1.3] })));
  const grassPl = placements(quality.grass, { scale: [0.28, 0.5], zoneMargin: 0.35, maxSlope: 0.7, minH: 1.0 });   // the kit's blades are 1.3 m at scale 1: knee-high tufts, not reeds
  jobs.push(scatterModel(scene, 'q_grass_short', grassPl, { foliage: true, shadows: false, cullOnly: true }).then((ms) => ms.forEach((m) => windSway(m.material, 0.1))));
  (await Promise.allSettled(jobs)).forEach((r) => { if (r.status === 'rejected') console.warn('vegetation failed', r.reason && r.reason.message); });

  // zones: buildings & props
  const hb = zoneById('harbor'), bz = zoneById('bazaar'), fl = zoneById('fields'), cv = zoneById('caves'), rg = zoneById('ridge'), tw = zoneById('tower');
  const props = [];
  const pier = await placeModel(scene, 'modular_wooden_pier', hb.x + 6, hb.z + 14, { y: WATER_Y - 0.1, rot: 0, onGround: false, collide: false });   // the deck is a floor (height field below), not a wall
  const ps = modelSize(pier); if (ps.z > 0) { pier.scale.setScalar(Math.min(3, 12 / Math.max(ps.z, ps.x))); }
  await addModelField('modular_wooden_pier', pier.position.x, pier.position.z, 0, pier.scale.x, pier.position.y, { maxY: 3.5 });   // deck and ramp, not the arch
  props.push(placeModel(scene, 'ship_pinnace', hb.x + 22, hb.z + 26, { y: WATER_Y - 0.3, rot: -0.8, scale: 0.35, onGround: false }));
  props.push(cottage(scene, hb.x - 6, hb.z + 1, { w: 5.5, d: 4.5, rot: 0.3, roof: 'clay_roof_tiles_02' }));
  props.push(placeModel(scene, 'wooden_barrels_01', hb.x + 2.5, hb.z + 6, { rot: 0.4 }), placeModel(scene, 'wooden_bucket_01', hb.x + 4, hb.z + 8.5, { rot: 0.2 }), placeModel(scene, 'street_lamp_01', hb.x + 3, hb.z + 3, {}), placeModel(scene, 'wooden_lantern_01', hb.x - 2, hb.z + 6, {}));
  props.push(cottage(scene, bz.x - 7, bz.z - 5, { w: 5, d: 4.2, rot: 0.2, roof: 'reed_roof_03' }), cottage(scene, bz.x + 7, bz.z - 6, { w: 4.6, d: 4, rot: -0.4, roof: 'roof_slates_02', wall: 'white_stucco' }), cottage(scene, bz.x + 8, bz.z + 5, { w: 4.5, d: 4, rot: -1.7, roof: 'clay_roof_tiles_02' }));
  const workbench = await placeModel(scene, 'WoodenTable_01', bz.x - 2, bz.z + 4, { rot: 0.1 });
  props.push(placeModel(scene, 'chemistry_set', bz.x - 2.3, bz.z + 4, { y: null, rot: 0.3 }).then((o) => { o.position.y += 0.78; }), placeModel(scene, 'bunsen_burner', bz.x - 1.4, bz.z + 4.2, {}).then((o) => { o.position.y += 0.78; }),
    placeModel(scene, 'vintage_microscope', bz.x - 2.9, bz.z + 3.7, { rot: 1 }).then((o) => { o.position.y += 0.78; }), placeModel(scene, 'book_encyclopedia_set_01', bz.x - 1.2, bz.z + 3.6, { rot: 1.6 }).then((o) => { o.position.y += 0.78; }),
    placeModel(scene, 'wine_barrel_01', bz.x + 1, bz.z + 6, {}), placeModel(scene, 'planter_box_01', bz.x - 5, bz.z + 1, { rot: 0.3 }), placeModel(scene, 'street_lamp_01', bz.x + 2, bz.z, {}), placeModel(scene, 'wooden_stool_01', bz.x - 3.5, bz.z + 5.5, {}), placeModel(scene, 'painted_wooden_bench', bz.x + 4, bz.z + 1, { rot: 1.2 }));
  props.push(cottage(scene, fl.x + 9, fl.z + 4, { w: 5.2, d: 4.4, rot: -0.6, roof: 'reed_roof_03', wall: 'plastered_wall_02' }), placeModel(scene, 'stone_fire_pit', fl.x + 3, fl.z + 8, {}), placeModel(scene, 'wooden_bucket_01', fl.x + 5, fl.z + 6, {}), placeModel(scene, 'wooden_ladder', fl.x + 11.5, fl.z + 1, { rot: 0.9 }).then((o) => { o.position.y += 1.1; }));
  for (let i = 0; i < 10; i++) props.push(placeModel(scene, 'planter_box_01', fl.x - 10 + (i % 5) * 3.2, fl.z - 6 + Math.floor(i / 5) * 4, { rot: 0 }));
  props.push(cottage(scene, forest.x + 4, forest.z - 6, { w: 4.2, d: 3.8, rot: 0.4, roof: 'roof_slates_02', wall: 'white_stucco' }), placeModel(scene, 'wooden_lantern_01', forest.x + 1.5, forest.z - 3, {}));
  props.push(placeModel(scene, 'coastal_cliff_02', cv.x + 8, cv.z - 6, { rot: 0.6, scale: 0.9, field: true }), placeModel(scene, 'rock_face_01', cv.x + 3, cv.z - 10, { rot: 2.2, scale: 1.1, field: true }), placeModel(scene, 'large_castle_door', cv.x + 2.5, cv.z + 2.5, { rot: -0.6 }).then((o) => { o.position.y += 1.15; }), placeModel(scene, 'treasure_chest', cv.x + 12.5, cv.z - 9, { rot: 2.4 }), placeModel(scene, 'wooden_lantern_01', cv.x - 2, cv.z + 4, {}));
  props.push(placeModel(scene, 'stone_fire_pit', rg.x, rg.z + 3, {}), placeModel(scene, 'wooden_lantern_01', rg.x + 2, rg.z, {}));
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; props.push(placeModel(scene, 'rock_face_01', rg.x + Math.cos(a) * 8, rg.z + Math.sin(a) * 8, { rot: -a, scale: 0.55 + (i % 2) * 0.25, field: true })); }
  props.push(tower(scene, tw.x, tw.z - 4, tw.h), placeModel(scene, 'large_castle_door', tw.x, tw.z + 0.4, { rot: 0 }).then((o) => { o.position.y += 1.15; }), placeModel(scene, 'cannon_01', tw.x + 6, tw.z + 2, { rot: 2.4 }), placeModel(scene, 'wooden_lantern_01', tw.x - 4, tw.z + 3, {}));
  const settled = await Promise.allSettled(props); settled.forEach((r) => { if (r.status === 'rejected') console.warn('prop failed', r.reason && r.reason.message); });

  // characters
  const lib = await loadClipLibrary();
  const playerChar = await createCharacter('soldier', lib);
  scene.add(playerChar.root);
  { const staff = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 1.5, 10), new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.7 })); shaft.castShadow = true; staff.add(shaft);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff9a1f, emissiveIntensity: 2.5, roughness: 0.2 })); tip.position.y = 0.78; staff.add(tip);
    const light = new THREE.PointLight(0xffa040, 6, 4); light.position.y = 0.8; staff.add(light);
    staff.rotation.set(Math.PI, 0, 0); staff.position.set(0, 0.12, 0.13);   // hand Y points along the fingers (down), so flip the staff tip up
    playerChar.attachToBone('RightHand', staff); }
  const NPCS = [
    { id: 'fock', model: 'remy', fallback: 'xbot', zone: 'harbor', dx: -1, dz: -3 },
    { id: 'diis', model: 'rpm', zone: 'fields', dx: 4, dz: -1 },
    { id: 'basia', model: 'michelle', female: true, zone: 'bazaar', dx: -2, dz: 2 },
    { id: 'cluster', model: 'girl', female: true, fallback: 'xbot', zone: 'forest', dx: -1, dz: 0 },
    { id: 'keeper', model: 'soldier', tint: 0x6f7690, zone: 'caves', dx: -4, dz: 3 },
    { id: 'rhea', model: 'michelle', female: true, tint: 0xe08080, zone: 'ridge', dx: 0, dz: 1 },
    { id: 'pim', model: 'rpm', tint: 0x8fd6dc, zone: 'harbor', dx: 6, dz: 15, deck: true },   // at the end of the pier deck
    { id: 'scan', model: 'robot', fallback: 'xbot', zone: 'harbor', dx: 9, dz: 5 },   // a scanner robot on the beach by the pier ramp
    { id: 'levi', model: 'soldier', tint: 0xb59ae0, zone: 'forest', dx: 8, dz: 3 },
    { id: 'ada', model: 'michelle', female: true, tint: 0xe6c08a, zone: 'caves', dx: 5, dz: 7 },
  ];
  const npcs = {};
  for (const n of NPCS) {
    let c = null;
    try { c = await createCharacter(n.model, lib, { female: n.female, tint: n.tint }); } catch (e) { console.warn('npc model failed', n.model, e.message); c = await createCharacter(n.fallback || 'xbot', lib, { female: n.female }); }
    // only deck-dwellers stand on rock fields (the Keeper once ended up on top of the cliff)
    const zn = zoneById(n.zone); c.pos.set(zn.x + n.dx, (n.deck ? surfaceH : terrainH)(zn.x + n.dx, zn.z + n.dz), zn.z + n.dz);
    c.heading = Math.random() * 6; scene.add(c.root); npcs[n.id] = c; addCircle(c.pos.x, c.pos.z, 0.5);
  }
  // the Alpaca (cameo, procedural)
  const alpaca = new THREE.Group();
  { const cream = new THREE.MeshStandardMaterial({ color: 0xf3ead7, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.6), cream); body.position.y = 1.1; alpaca.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 12), cream); neck.position.set(0, 1.9, 0.6); neck.rotation.x = -0.25; alpaca.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.7), cream); head.position.set(0, 2.45, 0.85); alpaca.add(head);
    for (const [ex, ez] of [[-0.3, 0.55], [0.3, 0.55], [-0.3, -0.55], [0.3, -0.55]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10), cream); l.position.set(ex, 0.35, ez); alpaca.add(l); }
    alpaca.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    alpaca.position.set(tw.x + 6, terrainH(tw.x + 6, tw.z + 9), tw.z + 9); alpaca.visible = true; scene.add(alpaca); addCircle(alpaca.position.x, alpaca.position.z, 0.8); }
  // the Alpaca is a mentor: adapt the procedural model to the character interface the game expects
  npcs.alpaca = { root: alpaca, pos: alpaca.position, heading: 2.6, talking: false, attackT: 0, update(dt) { alpaca.rotation.y = this.heading; alpaca.position.y = terrainH(alpaca.position.x, alpaca.position.z) + (this.talking ? Math.abs(Math.sin(performance.now() * 0.01)) * 0.08 : 0); } };

  post = createPost(renderer, scene, camera, quality); resize();
  // adaptive resolution: keep the frame rate playable on weaker GPUs by scaling the render resolution
  // Every resolution change reallocates all render targets (a visible stall), so changes are rare: step down after 2 s below
  // 40 fps, step up only after 12 s above 55 fps, and when a step up is followed by a step down within 30 s the level is
  // locked for a minute instead of oscillating between the two.
  const fpsState = { acc: 0, n: 0, t: 0, pr: quality.pr, good: 0, lastUp: -1e9, lockUntil: 0, now: 0 };
  const renderFrame = (dt = 0) => {
    updateLOD(camera.position, quality.lodNear, quality.lodFar, quality.impFar);
    if (post) post.composer.render(); else renderer.render(scene, camera);
    if (dt > 0 && !navigator.webdriver) { fpsState.acc += dt; fpsState.n++; fpsState.t += dt; fpsState.now += dt;
      if (fpsState.t > 2) { const fps = fpsState.n / fpsState.acc, now = fpsState.now; let pr = fpsState.pr; fpsState.good = fps > 55 ? fpsState.good + fpsState.t : 0;
        if (fps < 40 && pr > 0.5) { pr = Math.max(0.5, pr - 0.15); if (now - fpsState.lastUp < 30) fpsState.lockUntil = now + 60; }
        else if (fpsState.good >= 12 && pr < quality.pr && now > fpsState.lockUntil) { pr = Math.min(quality.pr, pr + 0.1); fpsState.good = 0; fpsState.lastUp = now; }
        if (pr !== fpsState.pr) { fpsState.pr = pr; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pr)); resize(); }
        fpsState.acc = fpsState.n = fpsState.t = 0; } }
  };
  const sigils = await buildSigils(SPELLS);
  const game = createGame({ scene, camera, canvas, playerChar, npcs, alpaca, renderFrame, quality, sun, workbench, sigils, lights });
  // warm-up: put one of every late-appearing material in front of the camera so its shader compiles now, not mid-fight
  { const warm = new THREE.Group(); const mol = moleculeModel(ENCOUNTERS.water, null); warm.add(mol);
    const fx = createFX(warm, sigils, () => {}, null); fx.castRune(new THREE.Vector3(0, 0, 0), 'dcsd'); fx.projectile(new THREE.Vector3(0, 1, 0), { pos: new THREE.Vector3(0, 1, 5), dead: false }, 'ccsdt', () => {}); fx.impact(new THREE.Vector3(0, 1, 0), 'eom', 'best', '@cc eom-dcsd'); fx.backfire(new THREE.Vector3(0, 0, 0));
    const ghost = moleculeModel(ENCOUNTERS.h2co, null); warm.add(ghost); warm.position.copy(camera.position).add(new THREE.Vector3(0, 0, -6)); scene.add(warm);
    // enemies and pickups have their own materials (flat shading, emissive, basic): compile them now too
    const E = game.E, wp = camera.position; const warmE = ['osc', 'div', 'lin', 'boss'].map((t) => E.spawnEnemy(t, wp.x, wp.z - 6, 'warm'));
    ['coffee', 'scroll', 'basisfn', 'key'].forEach((k) => E.spawnPickup(k, wp.x, wp.z - 6, 'warm'));
    try { await renderer.compileAsync(scene, camera); renderer.render(scene, camera); } catch (e) { /* ignore */ } scene.remove(warm);   // the render also compiles the shadow-pass variants
    for (const e of warmE) scene.remove(e.g); E.enemies.length = 0; for (const p of E.pickups) scene.remove(p.g); E.pickups.length = 0; }
  // upload every texture to the GPU now: three.js otherwise uploads a texture the first time it is drawn, and walking into a
  // new zone would push dozens of 1024² maps in a single frame
  { const seen = new Set(); let n = 0;
    const up = (t) => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); try { renderer.initTexture(t); n++; } catch (e) { /* ignore */ } } };
    scene.traverse((o) => { const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of mats) { for (const k in m) { const v = m[k]; if (v && v.isTexture) up(v); } if (m.uniforms) for (const k in m.uniforms) up(m.uniforms[k].value); } });
    for (const s of Object.values(sigils)) up(s.tex);
    console.log('textures uploaded:', n); }
  game.setSunOffset(SUN_DIR.clone().multiplyScalar(120));
  $('loadtxt').textContent = 'compiling shaders…';
  const tc = performance.now(); try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn('compile', e); } console.log('shaders compiled in', ((performance.now() - tc) / 1000).toFixed(1), 's');
  $('loading').hidden = true;
  game.start();
  window.__dbg = { game, scene, camera, renderer, npcs, playerChar, THREE, SUN_DIR, quality, IMPOSTORS,
    /** development: hang an impostor atlas in front of the camera */
    showAtlas(name) { const imp = IMPOSTORS[name]; if (!imp) return 'no atlas ' + name; const q = new THREE.Mesh(new THREE.PlaneGeometry(imp.views * 4, 4), new THREE.MeshBasicMaterial({ map: imp.tex, transparent: true, side: THREE.DoubleSide })); camera.getWorldDirection(q.position); q.position.multiplyScalar(12).add(camera.position); q.lookAt(camera.position); scene.add(q); return `${imp.views} views, ${imp.w.toFixed(1)} x ${imp.h.toFixed(1)} m`; }, resolveCollisions, walkable, terrainH, surfaceH, rockH, COLLIDERS,
    goto(zone, dx, dz) { game.startGame(false); game.goto(zone, dx, dz); },
    freeCam(px, py, pz, tx, ty, tz) { game.cam.free = px === null ? null : { pos: new THREE.Vector3(px, py, pz), target: new THREE.Vector3(tx, ty, tz) }; game.cam.update(0.05, game.P); },
    cam(yaw, pitch, dist) { game.cam.yaw = yaw; game.cam.pitch = pitch; game.cam.dist = dist; game.cam.dragT = 99; game.settle(); },
    frameTime() { const t = performance.now(); renderFrame(0); return performance.now() - t; },
    snapshot() { const t0 = performance.now(); renderFrame(0); const t1 = performance.now(); renderFrame(0); const t2 = performance.now(); const d = canvas.toDataURL('image/png'); console.warn(`snapshot: first render ${(t1 - t0).toFixed(0)} ms, second ${(t2 - t1).toFixed(0)} ms, encode ${(performance.now() - t2).toFixed(0)} ms, programs ${renderer.info.programs.length}`); return d; },
    sunMarker() { const m = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff00ff })); m.position.copy(SUN_DIR).multiplyScalar(300).add(camera.position); scene.add(m); } };
  window.__ready = true;
}
build().catch((e) => { const msg = (e && e.message) || (e && e.target && (e.target.src || e.target.responseURL)) || (e && e.type) || String(e); console.error('build failed:', msg, e); $('loadtxt').textContent = 'Failed to load: ' + msg; });
