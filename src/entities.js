// Enemies, pickups, bolts, quest beam, particles and sound effects.
import * as THREE from 'three';
import { terrainH, walkable, zoneById } from './world.js';

export const COL = { blue: 0x4063d8, red: 0xcb3c33, green: 0x389826, purple: 0x9558b2, amber: 0xe9a23b, ink: 0x1d2540, slate: 0x8f97ad, dark: 0x2a2d3a };
const Lc = (c) => new THREE.Color(c);
const GEO = { sphere: new THREE.SphereGeometry(1, 24, 16), torus: new THREE.TorusGeometry(1, 0.28, 14, 36), cyl: new THREE.CylinderGeometry(1, 1, 1, 16), box: new THREE.BoxGeometry(1, 1, 1) };
function textSprite(text, color, size = 1) {
  const cv = document.createElement('canvas'); const g = cv.getContext('2d'), font = '800 60px "Bricolage Grotesque", "Segoe UI", sans-serif';
  g.font = font; const w = Math.ceil(g.measureText(text).width) + 48;   // the canvas grows with the name so long ones are not clipped
  cv.width = Math.max(128, w); cv.height = 128; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(20,24,40,0.75)'; g.strokeText(text, cv.width / 2, 66); g.fillStyle = color; g.fillText(text, cv.width / 2, 66);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.scale.set(size * cv.width / cv.height, size, 1); return sp;
}
export const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export function createEntities(scene, ctx) {
  // ctx: { player (pos, hp...), level(), staffDmg(), onEnemyKilled, onBossHit, onPlayerDeath, onPickup, cam }
  const E = { enemies: [], pickups: [], bolts: [] };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();   // scratch: the update loops run every frame and must not allocate
  const ENEMY = {
    osc:  { name: 'SCF Oscillator',      hp: 30,  dmg: 8,  speed: 2.6, color: COL.green,  xp: 12, r: 0.9 },
    div:  { name: 'Divergent Amplitude', hp: 45,  dmg: 12, speed: 2.9, color: COL.purple, xp: 18, r: 0.9 },
    lin:  { name: 'Linear Dependency',   hp: 60,  dmg: 10, speed: 2.0, color: COL.slate,  xp: 20, r: 1.0 },
    boss: { name: 'The Non-Convergent',  hp: 320, dmg: 16, speed: 2.4, color: COL.dark,   xp: 150, r: 2.2 },
  };
  E.ENEMY = ENEMY;
  const glossy = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: Lc(c), roughness: 0.25, metalness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.2, ...o });
  const crumple = (geo, k) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const s = 1 + Math.random() * k; p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s); } geo.computeVertexNormals(); return geo; };
  function enemyModel(type) {
    const g = new THREE.Group(), spec = ENEMY[type];
    if (type === 'osc') { const t = new THREE.Mesh(GEO.torus, glossy(spec.color, { emissive: Lc(spec.color), emissiveIntensity: 0.35 })); t.scale.setScalar(0.55); t.position.y = 1.1; g.add(t); g.userData.spin = t;
      const core = new THREE.Mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: 0xbfffc0 })); core.scale.setScalar(0.18); core.position.y = 1.1; g.add(core); }
    else if (type === 'div') { const m = new THREE.Mesh(crumple(new THREE.IcosahedronGeometry(0.75, 1), 0.5), glossy(spec.color, { flatShading: true, emissive: Lc(spec.color), emissiveIntensity: 0.2 })); m.position.y = 1.1; g.add(m); g.userData.spin = m;
      const core = new THREE.Mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: 0xff6a5a })); core.scale.setScalar(0.3); core.position.y = 1.1; g.add(core); }
    else if (type === 'lin') { for (const off of [-0.32, 0.32]) { const s = new THREE.Mesh(GEO.sphere, glossy(spec.color, { roughness: 0.4, metalness: 0.5 })); s.scale.setScalar(0.62); s.position.set(off, 0.95, 0); g.add(s); } g.userData.spin = g.children[0]; }
    else { const m = new THREE.Mesh(crumple(new THREE.IcosahedronGeometry(2.0, 1), 0.35), glossy(spec.color, { flatShading: true, roughness: 0.35, metalness: 0.6 })); m.position.y = 2.6; g.add(m); g.userData.spin = m;
      const ring = new THREE.Mesh(GEO.torus, new THREE.MeshBasicMaterial({ color: 0xc58cff, transparent: true, opacity: 0.8 })); ring.scale.set(3.2, 3.2, 0.5); ring.position.y = 2.6; ring.rotation.x = 1.2; g.add(ring); g.userData.ring = ring;
      const core = new THREE.Mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: 0xff5040 })); core.scale.setScalar(0.8); core.position.y = 2.6; g.add(core); g.userData.core = core;
    }
    const lbl = textSprite(spec.name, hex(spec.color === COL.dark ? 0xc58cff : spec.color), type === 'boss' ? 1.3 : 0.7); lbl.position.y = type === 'boss' ? 5.6 : 2.1; g.add(lbl);
    g.traverse((o) => { if (o.isMesh && !(o.material instanceof THREE.MeshBasicMaterial)) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }
  E.spawnEnemy = (type, x, z, tag) => {
    const spec = ENEMY[type], g = enemyModel(type); g.position.set(x, terrainH(x, z), z); scene.add(g);
    const e = { type, spec, g, pos: g.position, home: new THREE.Vector3(x, 0, z), hp: spec.hp, hitT: 0, atkCd: 0, t: Math.random() * 6, dead: false, deadT: 0, tag, frozen: false };
    E.enemies.push(e); return e;
  };
  E.spawnPack = (type, zoneId, count, tag, avoid = []) => {
    const zn = zoneById(zoneId);
    for (let i = 0; i < count; i++) {
      let x, z, tries = 0;
      do { const a = Math.random() * 6.283, r = zn.r * (0.35 + Math.random() * 0.5); x = zn.x + Math.cos(a) * r; z = zn.z + Math.sin(a) * r; tries++; }
      while (tries < 30 && (!walkable(x, z) || Math.hypot(x - ctx.player.pos.x, z - ctx.player.pos.z) < 7 || avoid.some((p) => Math.hypot(x - p.x, z - p.z) < 4)));
      E.spawnEnemy(type, x, z, tag);
    }
  };
  E.aliveCount = (tag) => E.enemies.filter((e) => e.tag === tag && !e.dead).length;
  E.damageEnemy = (e, dmg, fromPos, kb) => {
    if (e.dead || e.frozen) return;
    e.hp -= dmg; e.hitT = 0.25; E.burst(e.pos.clone().setY(e.pos.y + 1), e.spec.color, 12, 4);
    if (fromPos && kb) { const d = e.pos.clone().sub(fromPos).setY(0).normalize().multiplyScalar(kb); const nx = e.pos.x + d.x, nz = e.pos.z + d.z; if (walkable(nx, nz)) { e.pos.x = nx; e.pos.z = nz; } }
    if (e.hp <= 0) { e.dead = true; e.deadT = 0.45; ctx.player.xp += e.spec.xp; E.burst(e.pos.clone().setY(e.pos.y + 1), e.spec.color, 30, 6); ctx.onEnemyKilled(e); }
    else if (e.type === 'boss') ctx.onBossHit(e);
  };
  E.playerAttack = (heading) => {
    const fx = Math.sin(heading), fz = Math.cos(heading), P = ctx.player;
    for (const e of E.enemies) { if (e.dead) continue; const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.4 + e.spec.r * 0.6 && (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.2) { E.damageEnemy(e, ctx.staffDmg(), P.pos, 1.4); Sfx.hit(); } }
  };
  E.fireBolt = (heading) => {
    const P = ctx.player; let dir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)), best = null, bd = 16;
    for (const e of E.enemies) { if (e.dead) continue; const d = e.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = e; } }
    if (best) dir = best.pos.clone().sub(P.pos).setY(0).normalize();
    const g = new THREE.Mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: 0x9dffb0 })); g.scale.setScalar(0.2);
    g.position.copy(P.pos).add(new THREE.Vector3(0, 1.3, 0)); scene.add(g); E.bolts.push({ g, v: dir.multiplyScalar(18), life: 1.2 });
    return Math.atan2(dir.x, dir.z);
  };
  E.updateBolts = (dt) => {
    for (let i = E.bolts.length - 1; i >= 0; i--) { const b = E.bolts[i]; b.life -= dt; b.g.position.addScaledVector(b.v, dt); let hit = false;
      for (const e of E.enemies) { if (!e.dead && b.g.position.distanceTo(_a.copy(e.pos).setY(e.pos.y + 1)) < e.spec.r + 0.4) { E.damageEnemy(e, 18 + 3 * ctx.level(), ctx.player.pos, 0.8); Sfx.hit(); hit = true; break; } }
      if (hit || b.life <= 0 || b.g.position.y < terrainH(b.g.position.x, b.g.position.z)) { scene.remove(b.g); E.bolts.splice(i, 1); } }
  };
  E.updateEnemies = (dt, frozen) => {
    const P = ctx.player;
    for (let i = E.enemies.length - 1; i >= 0; i--) {
      const e = E.enemies[i]; e.t += dt;
      if (e.dead) { e.deadT -= dt; e.g.scale.setScalar(Math.max(0.01, e.deadT / 0.45)); if (e.deadT <= 0) { scene.remove(e.g); E.enemies.splice(i, 1); } continue; }
      const spin = e.g.userData.spin; if (spin) { spin.rotation.y += dt * 1.5; spin.rotation.x += dt * 0.7; }
      if (e.type === 'osc') spin.position.y = 1.1 + Math.sin(e.t * 7) * 0.45;
      if (e.type === 'lin') { e.g.children[0].position.x = -0.32 - Math.sin(e.t * 3) * 0.15; e.g.children[1].position.x = 0.32 + Math.sin(e.t * 3) * 0.15; }
      if (e.type === 'boss') { e.g.userData.ring.rotation.z += dt; e.g.userData.core.scale.setScalar(0.8 + 0.2 * Math.sin(e.t * 5)); }
      if (e.hitT > 0) { e.hitT -= dt; const m = e.g.children[0].material; if (m.emissive) m.emissiveIntensity = e.hitT > 0 ? 2.5 : 0.3; }
      e.atkCd -= dt;
      const toP = _a.copy(P.pos).sub(e.pos).setY(0), d = toP.length(); let vx = 0, vz = 0;
      if (!frozen && !e.frozen && d < (e.type === 'boss' ? 30 : 13) && Math.hypot(e.home.x - P.pos.x, e.home.z - P.pos.z) < 30) {
        if (d > 1.2 + e.spec.r * 0.5) { toP.normalize(); vx = toP.x * e.spec.speed; vz = toP.z * e.spec.speed; }
        else if (e.atkCd <= 0) { e.atkCd = 1.1; E.hurtPlayer(e.spec.dmg, e.pos); }
      } else { const toH = _b.set(e.home.x - e.pos.x, 0, e.home.z - e.pos.z); if (toH.length() > 1.5) { toH.normalize(); vx = toH.x * e.spec.speed * 0.6; vz = toH.z * e.spec.speed * 0.6; } else if (e.hp < e.spec.hp) e.hp = Math.min(e.spec.hp, e.hp + dt * 8); }
      if (vx || vz) { const nx = e.pos.x + vx * dt, nz = e.pos.z + vz * dt; if (walkable(nx, nz) && terrainH(nx, nz) - terrainH(e.pos.x, e.pos.z) < 0.7) { e.pos.x = nx; e.pos.z = nz; } }
      e.pos.y = terrainH(e.pos.x, e.pos.z);
      for (const o of E.enemies) if (o !== e && !o.dead) { const dd = e.pos.distanceTo(o.pos), min = e.spec.r + o.spec.r; if (dd < min && dd > 0.01) { const push = _b.copy(e.pos).sub(o.pos).setY(0).normalize().multiplyScalar((min - dd) * 0.5); e.pos.x += push.x; e.pos.z += push.z; } }
    }
  };
  E.hurtPlayer = (dmg, from) => {
    const P = ctx.player; if (P.hurtT > 0 || P.hp <= 0) return;
    P.hp -= dmg; P.hurtT = 0.9; ctx.cam.shake = 0.9; Sfx.hurt();
    const d = P.pos.clone().sub(from).setY(0).normalize().multiplyScalar(1.4); const nx = P.pos.x + d.x, nz = P.pos.z + d.z; if (walkable(nx, nz)) { P.pos.x = nx; P.pos.z = nz; }
    if (P.hp <= 0) ctx.onPlayerDeath();
  };
  // pickups
  E.spawnPickup = (kind, x, z, tag) => {
    const g = new THREE.Group();
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: Lc(c), roughness: 0.5, ...o });
    if (kind === 'coffee') { const m = new THREE.Mesh(GEO.cyl, std(0xf4f1ea)); m.scale.set(0.2, 0.28, 0.2); m.position.y = 0.45; g.add(m); const h = new THREE.Mesh(GEO.torus, std(0xf4f1ea)); h.scale.setScalar(0.1); h.position.set(0.22, 0.45, 0); g.add(h); const lbl = textSprite('coffee  +35', hex(COL.amber), 0.55); lbl.position.y = 1.15; g.add(lbl); }
    else if (kind === 'scroll') { const m = new THREE.Mesh(GEO.cyl, std(0xfff4dc)); m.scale.set(0.16, 0.9, 0.16); m.rotation.z = Math.PI / 2; m.position.y = 0.45; g.add(m); const lbl = textSprite('H2O.FCIDUMP', '#ffffff', 0.65); lbl.position.y = 1.25; g.add(lbl); }
    else if (kind === 'basisfn') { const m = new THREE.Mesh(GEO.sphere, std(COL.blue, { emissive: Lc(0x3a5fe0), emissiveIntensity: 1.5, roughness: 0.2 })); m.scale.setScalar(0.3); m.position.y = 0.7; g.add(m); const lbl = textSprite('basis function', '#9fb6ff', 0.55); lbl.position.y = 1.4; g.add(lbl); }
    else if (kind === 'key') { const m = new THREE.Mesh(GEO.box, std(COL.amber, { metalness: 0.9, roughness: 0.3 })); m.scale.set(0.5, 0.12, 0.12); m.position.y = 0.7; g.add(m); const lbl = textSprite('tower key', hex(COL.amber), 0.55); lbl.position.y = 1.3; g.add(lbl); }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(x, terrainH(x, z), z); scene.add(g); E.pickups.push({ kind, g, pos: g.position, tag, t: Math.random() * 6 });
  };
  E.updatePickups = (dt) => {
    for (let i = E.pickups.length - 1; i >= 0; i--) { const p = E.pickups[i]; p.t += dt; p.g.children[0].position.y = (p.kind === 'basisfn' ? 0.7 : 0.45) + Math.sin(p.t * 3) * 0.1; p.g.rotation.y += dt;
      if (p.pos.distanceTo(ctx.player.pos) < 1.5) { scene.remove(p.g); E.pickups.splice(i, 1); Sfx.pick(); E.burst(p.pos.clone().setY(p.pos.y + 0.8), p.kind === 'coffee' ? COL.amber : COL.blue, 14, 3); ctx.onPickup(p); } }
  };
  // quest beam
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 80, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.visible = false; scene.add(beam);
  E.setBeam = (x, z) => { if (x === null) { beam.visible = false; return; } beam.visible = true; beam.position.set(x, terrainH(x, z) + 40, z); };
  // particles
  const PN = 400, ppos = new Float32Array(PN * 3), pcol = new Float32Array(PN * 3), pvel = [], plife = []; let pi = 0;
  for (let i = 0; i < PN; i++) { ppos[i * 3 + 1] = -999; pvel.push(new THREE.Vector3()); plife.push(0); }
  const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3)); pgeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
  const points = new THREE.Points(pgeo, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })); points.frustumCulled = false; scene.add(points);
  const _pc = new THREE.Color();
  E.burst = (p, color, count, speed) => { _pc.set(color).multiplyScalar(1.6);
    for (let k = 0; k < count; k++) { const i = pi; pi = (pi + 1) % PN; ppos[i * 3] = p.x; ppos[i * 3 + 1] = p.y; ppos[i * 3 + 2] = p.z; pcol[i * 3] = _pc.r; pcol[i * 3 + 1] = _pc.g; pcol[i * 3 + 2] = _pc.b;
      pvel[i].set(Math.random() * 2 - 1, Math.random() * 1.2 + 0.2, Math.random() * 2 - 1).normalize().multiplyScalar((0.4 + Math.random() * 0.6) * speed); plife[i] = 0.7; } };
  E.updateParticles = (dt) => { for (let i = 0; i < PN; i++) { if (plife[i] <= 0) continue; plife[i] -= dt; pvel[i].y -= 9 * dt; ppos[i * 3] += pvel[i].x * dt; ppos[i * 3 + 1] += pvel[i].y * dt; ppos[i * 3 + 2] += pvel[i].z * dt; if (plife[i] <= 0) ppos[i * 3 + 1] = -999; }
    pgeo.attributes.position.needsUpdate = true; pgeo.attributes.color.needsUpdate = true; };
  E.clear = (arr) => { for (const o of arr) scene.remove(o.g); arr.length = 0; };
  E.textSprite = textSprite;
  return E;
}

// ------------------------------------------------------------ sound
function storage(key, val) { try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; } }
export const Sfx = {
  ctx: null, muted: storage('ci.muted') === '1',
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(f0, f1, dur, type = 'sine', vol = 0.1, delay = 0) { if (!this.ctx || this.muted) return; const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.05); },
  swing() { this.tone(300, 120, 0.12, 'triangle', 0.06); }, hit() { this.tone(520, 180, 0.1, 'square', 0.05); }, bolt() { this.tone(700, 1400, 0.15, 'sine', 0.07); },
  hurt() { this.tone(200, 70, 0.3, 'sawtooth', 0.08); }, pick() { this.tone(880, 1320, 0.12, 'sine', 0.08); }, talk() { this.tone(440, 520, 0.08, 'sine', 0.05); },
  good() { [523, 659, 784].forEach((f, i) => this.tone(f, f, 0.25, 'sine', 0.08, i * 0.1)); }, bad() { this.tone(260, 180, 0.35, 'triangle', 0.08); },
  quest() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.3, 'sine', 0.08, i * 0.11)); },
};
