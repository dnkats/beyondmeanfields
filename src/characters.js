// Animated characters: loading, clip assembly (own clips + retargeted Ready Player Me clips), state machine, procedural attack.
import * as THREE from 'three';
import { loadGLTF, cloneSkinned, prepareModel, rigPrefix, boneNames, retargetClip } from './assets.js';
import { terrainH, resolveCollisions, surfaceH, cameraBlocked, WATER_Y, ISLAND } from './world.js';

export const MODELS = {
  soldier:  { file: 'characters/Soldier.glb', kind: 'gltf', height: 1.8 },
  michelle: { file: 'characters/Michelle.glb', kind: 'gltf', height: 1.72 },
  xbot:     { file: 'characters/Xbot.glb', kind: 'gltf', height: 1.8 },
  rpm:      { file: 'characters/readyplayer.me.glb', kind: 'gltf', height: 1.78 },
  remy:     { file: 'characters/mremireh.glb', kind: 'gltf', height: 1.8 },   // Mixamo FBX converted by scripts/fbx2glb.mjs, own idle and walk clips embedded
  girl:     { file: 'characters/girl.glb', kind: 'gltf', height: 1.7, restRetarget: true },   // Mixamo character (textured); its rest pose differs from the clip library's, so clips are retargeted relative to rest
  robot:    { file: 'characters/RobotExpressive.glb', kind: 'gltf', height: 1.75, faceRot: 0 },   // three.js expressive robot: own Idle/Walking/Running/Wave/Yes clips, faces +z
};
const baseCache = new Map();
async function loadBase(key) {
  if (baseCache.has(key)) return baseCache.get(key);
  const p = (async () => {
    const def = MODELS[key];
    let root, anims = [];
    const g = await loadGLTF(def.file); root = g.scene; anims = g.animations;
    prepareModel(root, { envMapIntensity: 0.9 });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? def.height / size.y : 1;
    const rest = new Map(); root.traverse((o) => { if (o.isBone) rest.set(o.name, o.quaternion.clone()); });
    return { root, anims, scale, prefix: rigPrefix(root), bones: boneNames(root), yOffset: -box.min.y * scale, def, rest };
  })();
  baseCache.set(key, p); return p;
}

const OWN_NAMES = { idle: ['idle'], walk: ['walk', 'walking'], run: ['run', 'running'], talk: ['talk', 'talking', 'yes'], gesture: ['agree', 'wave', 'thumbsup'] };
async function assembleClips(base, lib, female) {
  const clips = {};
  const srcBase = base.def && base.def.restRetarget ? await loadBase('rpm') : null;   // the clip library was made for the Ready Player Me rest pose
  for (const [k, names] of Object.entries(OWN_NAMES)) { const own = base.anims.find((a) => names.includes(a.name.toLowerCase())); if (own) clips[k] = own; }
  const pick = (k) => female ? (lib['f' + k] || lib[k]) : lib[k];
  for (const k of ['idle', 'walk', 'run', 'talk', 'gesture', 'jog', 'jump']) {
    if (clips[k]) continue;
    const src = pick(k) || lib[k]; if (!src) continue;
    clips[k] = retargetClip(src, '', base.prefix, base.bones, { dropHips: !!(base.def && base.def.dropHips), srcRest: srcBase ? srcBase.rest : null, dstRest: srcBase ? base.rest : null });
  }
  if (!clips.run && clips.jog) clips.run = clips.jog;
  return clips;
}

export class Character {
  constructor(model, clips, base, { tint = null, tintMatch = null } = {}) {
    this.root = new THREE.Group(); this.model = model; this.root.add(model);
    model.scale.setScalar(base.scale); model.position.y = base.yOffset;
    this.prefix = base.prefix; this.bones = {}; this.faceRot = base.def ? base.def.faceRot : undefined;
    model.traverse((o) => { if (o.isBone) this.bones[o.name.slice(base.prefix.length)] = o; });
    if (tint) model.traverse((o) => { if (o.isMesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; o.material = Array.isArray(o.material) ? mats.map((m) => m.clone()) : mats[0].clone();
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (!tintMatch || tintMatch.test(m.name + o.name)) m.color.multiply(new THREE.Color(tint)); } });
    this.alignForward();
    this.mixer = new THREE.AnimationMixer(model); this.actions = {};
    for (const [k, c] of Object.entries(clips)) { const a = this.mixer.clipAction(c); a.enabled = true; a.setEffectiveWeight(0); a.play(); this.actions[k] = a; }
    this.current = null; this.play('idle', 0);
    this.attackT = 0; this.talking = false; this.heading = 0; this.pos = new THREE.Vector3(); this.speedScale = 1;
    this.gestureT = 4 + Math.random() * 6;
  }
  /** Rotate the model so its feet point along local +Z (the direction `heading` moves in). Mixamo exports face either way. */
  alignForward() {
    if (this.faceRot !== undefined) { this.model.rotation.y = this.faceRot; return; }   // models without foot bones declare which way they face
    const pairs = [['LeftFoot', 'LeftToeBase'], ['RightFoot', 'RightToeBase']].filter(([a, b]) => this.bones[a] && this.bones[b]);
    if (!pairs.length) { this.model.rotation.y = Math.PI; return; }
    this.root.updateMatrixWorld(true);
    const d = new THREE.Vector3();
    for (const [a, b] of pairs) d.add(this.bones[b].getWorldPosition(new THREE.Vector3()).sub(this.bones[a].getWorldPosition(new THREE.Vector3())));
    d.y = 0; if (d.lengthSq() < 1e-8) { this.model.rotation.y = Math.PI; return; }
    this.model.rotation.y = -Math.atan2(d.x, d.z);
  }
  play(name, fade = 0.25) {
    const a = this.actions[name] || this.actions.idle; if (!a || a === this.current) return;
    if (this.current) { a.reset(); a.setEffectiveWeight(1); a.crossFadeFrom(this.current, fade, true); } else { a.setEffectiveWeight(1); }
    this.current = a; this.currentName = name;
  }
  attachToBone(boneName, obj) {
    const b = this.bones[boneName]; if (!b) return null;
    const ws = b.getWorldScale(new THREE.Vector3()); obj.scale.divide(ws); b.add(obj); return obj;
  }
  update(dt, { moving = false, running = false, jumping = false } = {}) {
    if (this.attackT > 0) this.attackT -= dt;
    if (this.jumpStart && this.actions.jump) { this.jumpStart = false; const a = this.actions.jump; a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset(); this.play('jump', 0.08); }
    const target = jumping && this.actions.jump ? 'jump' : this.talking ? 'talk' : moving ? (running ? 'run' : 'walk') : (this.currentName === 'gesture' && this.actions.gesture && this.actions.gesture.time < this.actions.gesture.getClip().duration - 0.3 ? 'gesture' : 'idle');
    if (target !== this.currentName) this.play(target, target === 'idle' ? 0.35 : 0.2);
    if (!moving && !this.talking && this.actions.gesture) { this.gestureT -= dt; if (this.gestureT <= 0) { this.gestureT = 8 + Math.random() * 10; this.play('gesture', 0.3); } }
    this.mixer.update(dt);
    this.root.position.copy(this.pos); this.root.rotation.y = this.heading;
    if (this.attackT > 0) this.applySwing();
  }
  applySwing() {
    const t = 1 - this.attackT / 0.45, ang = Math.sin(t * Math.PI) * 1.9;
    this.root.updateMatrixWorld(true);
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    const swing = (name, k) => { const b = this.bones[name]; if (!b) return;
      const pw = b.parent.getWorldQuaternion(new THREE.Quaternion()), bw = b.getWorldQuaternion(new THREE.Quaternion());
      bw.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, -ang * k)); b.quaternion.copy(pw.invert().multiply(bw)); b.updateMatrixWorld(true); };
    swing('RightArm', 0.75); swing('RightForeArm', 0.45);
  }
}
export async function createCharacter(key, lib, opts = {}) {
  const base = await loadBase(key);
  const model = cloneSkinned(base.root);
  const clips = await assembleClips(base, lib, !!opts.female);
  return new Character(model, clips, base, opts);
}

// ------------------------------------------------------------ the player: movement, camera
export function createPlayerController(character, cam, keys, input, stick) {
  const P = { c: character, pos: character.pos, vy: 0, jumpY: 0, moving: false, run: false, hurtT: 0, attackCd: 0, boltCd: 0 };
  function readMove() {
    let x = 0, y = 0;
    if (keys.has('w') || keys.has('arrowup')) y += 1; if (keys.has('s') || keys.has('arrowdown')) y -= 1;
    if (keys.has('d') || keys.has('arrowright')) x += 1; if (keys.has('a') || keys.has('arrowleft')) x -= 1;
    x += stick.x; y -= stick.y;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    input.x = x; input.y = y; P.run = keys.has('shift');
  }
  P.moveTarget = null; P.arrived = null; P.stuckT = 0;
  P.onGround = false;
  P.move = (dt, frozen, walkable) => {
    readMove(); if (frozen) { input.x = input.y = 0; }
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let mx = fx * input.y + rx * input.x, mz = fz * input.y + rz * input.x;
    if (Math.hypot(mx, mz) > 0.05) P.moveTarget = null;                       // keyboard overrides a mouse destination
    else if (P.moveTarget && !frozen) {
      const tg = P.moveTarget, dx = tg.x - P.pos.x, dz = tg.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d < (tg.range || 0.55)) { P.arrived = tg; P.moveTarget = null; }
      else { mx = dx / d; mz = dz / d; P.run = !!tg.run; }
    } else if (P.moveTarget && frozen) { /* wait for the dialogue */ }
    const speed = (P.run ? 6.4 : 3.1) * (terrainH(P.pos.x, P.pos.z) < WATER_Y - 0.05 && P.pos.y < WATER_Y ? 0.55 : 1);   // wading is slow
    P.moving = Math.hypot(mx, mz) > 0.05;
    const before = P.pos.x, beforeZ = P.pos.z, footY = P.pos.y;
    if (P.moving) {
      const px0 = P.pos.x, pz0 = P.pos.z, h0 = surfaceH(px0, pz0);
      const nx = P.pos.x + mx * speed * dt, nz = P.pos.z + mz * speed * dt;
      // Terrain steps up to 0.55 are walkable, rock steps up to 0.4. Stepping from the ground onto rock is gated at the rim: it must be low there
      // and not rise past 0.5 within the next 35 cm, otherwise it is a wall you jump onto or walk around. Once on a rock you can move anywhere on it.
      const onRock = h0 > terrainH(px0, pz0) + 0.05, ml = Math.max(1e-4, Math.hypot(mx, mz)), lx = mx / ml * 0.35, lz = mz / ml * 0.35;
      const can = (x, z) => { if (!walkable(x, z) || Math.hypot(x / ISLAND.a, z / ISLAND.b) >= 1.03) return false; const h = surfaceH(x, z), th = terrainH(x, z), rock = h > th + 0.05;
        if (h - footY > (rock ? 0.4 : 0.55)) return false;
        if (P.onGround && h0 - h > 1.2) return false;   // no walking off a ledge higher than a jump: leap off deliberately
        if (rock && P.onGround && !onRock) { if (h - th > 0.4) return false; const ah = surfaceH(x + lx, z + lz); if (ah - terrainH(x + lx, z + lz) > 0.5) return false; } return true; };
      if (can(nx, nz)) { P.pos.x = nx; P.pos.z = nz; }
      else if (can(nx, pz0)) P.pos.x = nx;
      else if (can(px0, nz)) P.pos.z = nz;
      const c = { x: P.pos.x, z: P.pos.z }; if (resolveCollisions(c, 0.38)) { if (walkable(c.x, c.z) && surfaceH(c.x, c.z) - footY < 0.55) { P.pos.x = c.x; P.pos.z = c.z; } else { P.pos.x = px0; P.pos.z = pz0; } }
      const target = Math.atan2(mx, mz); let d = target - P.c.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); P.c.heading += d * Math.min(1, dt * 10);
      if (P.moveTarget) { if (Math.hypot(P.pos.x - before, P.pos.z - beforeZ) < 0.002) { P.stuckT += dt; if (P.stuckT > 0.5) { P.arrived = P.moveTarget.action ? P.moveTarget : null; P.moveTarget = null; P.stuckT = 0; } } else P.stuckT = 0; }
    }
    else if (input.steer && !frozen && !P.moveTarget) { let d = cam.yaw + Math.PI - P.c.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); P.c.heading += d * Math.min(1, dt * 6); }   // mouse steering: face where the camera looks
    const ground = surfaceH(P.pos.x, P.pos.z);
    if (input.jump && P.onGround && !frozen) { P.vy = 6.6; P.c.jumpStart = true; P.onGround = false; }
    input.jump = false;
    P.vy -= 16 * dt; let y = P.pos.y + P.vy * dt;
    if (y <= ground) { y = ground; P.vy = 0; P.onGround = true; }
    else if (P.onGround && P.vy <= 0 && y - ground < 0.6) { y = ground; P.vy = 0; }   // glued to slopes and small drops; bigger drops fall
    else P.onGround = false;
    P.pos.y = y; P.jumpY = y - ground;
    P.c.update(dt, { moving: P.moving, running: P.run, jumping: P.jumpY > 0.02 || P.vy > 0 });
  };
  return P;
}
export function createCamera(camera) {
  const cam = { yaw: 0, pitch: 0.3, dist: 6.5, dragT: 0, pos: new THREE.Vector3(), shake: 0, fov: 52 };
  cam.update = (dt, P) => {
    if (cam.free) { camera.position.copy(cam.free.pos); camera.lookAt(cam.free.target); return; }   // development: a fixed free camera (__dbg.freeCam)
    if (cam.manual) { /* mouse steering: the mouse owns the yaw */ }
    else if (cam.dragT > 0) cam.dragT -= dt;
    else if (P.moving) { let d = P.c.heading + Math.PI - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); cam.yaw += d * Math.min(1, dt * 1.4); }
    const cp = cam.pitch, pos = P.pos;
    // mouse steering: an over-the-shoulder offset so the crosshair at the screen centre clears the character
    const side = cam.manual ? 0.9 : 0, ox = Math.cos(cam.yaw) * side, oz = -Math.sin(cam.yaw) * side, lookY = cam.manual ? 2.1 : 1.45;
    const desired = new THREE.Vector3(pos.x + ox + Math.sin(cam.yaw) * Math.cos(cp) * cam.dist, pos.y + 1.5 + Math.sin(cp) * cam.dist, pos.z + oz + Math.cos(cam.yaw) * Math.cos(cp) * cam.dist);
    // keep the camera out of buildings and rocks: pull it in toward the head until the line of sight is clear
    const head = new THREE.Vector3(pos.x + ox, pos.y + lookY, pos.z + oz); let tBlock = 1;
    for (let i = 2; i <= 12; i++) { const s = i / 12, px = head.x + (desired.x - head.x) * s, py = head.y + (desired.y - head.y) * s, pz = head.z + (desired.z - head.z) * s; if (cameraBlocked(px, py, pz)) { tBlock = Math.max(0.12, (i - 1) / 12 - 0.04); break; } }
    if (tBlock < 1) desired.lerpVectors(head, desired, tBlock);
    const ground = Math.max(surfaceH(desired.x, desired.z), WATER_Y) + 0.6; if (desired.y < ground) desired.y = ground;
    if (cam.snapNext) { cam.pos.copy(desired); cam.snapNext = false; } else cam.pos.lerp(desired, 1 - Math.exp(-dt * 7));
    camera.position.copy(cam.pos);
    if (cam.shake > 0) { cam.shake = Math.max(0, cam.shake - dt * 2.2); camera.position.x += (Math.random() - 0.5) * cam.shake * 0.4; camera.position.y += (Math.random() - 0.5) * cam.shake * 0.4; }
    camera.lookAt(pos.x + ox, pos.y + lookY, pos.z + oz);
    const fov = P.run && P.moving ? 58 : 52; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  };
  return cam;
}
