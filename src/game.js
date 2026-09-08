// Game logic: input, player, spells and mana, molecule encounters, NPC dialogue, quests, HUD, forge, save/load, main loop.
import * as THREE from 'three';
import { ZONES, zoneById, zoneAt, terrainH, surfaceH, walkable, worldTime } from './world.js';
import { createEntities, Sfx, COL, hex } from './entities.js';
import { createQuests, hl, FULL_INPUT } from './quests.js';
import { createPlayerController, createCamera } from './characters.js';
import { SPELLS, ENCOUNTERS, OPT_DEFAULTS, OPTION_CATALOG, craftInput, judge, RESULT_DMG, parseExtras, extraSatisfied, findExtra, WILD } from './spells.js';
import { SIDE_QUESTS, SIDE_NPCS } from './sidequests.js';
import { moleculeModel, animateMolecule, flashMolecule, coolMolecule } from './molecules.js';
import { createFX } from './fx.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function storage(key, val) { try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; } }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function createGame({ scene, camera, canvas, playerChar, npcs, alpaca, renderFrame, quality, sun, workbench, sigils, lights, waystones = [], archiveDoor = null }) {
  const el = {}; ['hud', 'zone', 'hpbar', 'hpval', 'xpbar', 'xpval', 'manabar', 'manaval', 'qtitle', 'qobj', 'items', 'compass', 'prompt', 'toast', 'dlg', 'dsw', 'dname', 'dtext', 'dcode', 'dchoices', 'dnext', 'overlay', 'panel', 'bossbar', 'bosshp', 'bossname', 'keys', 'hotbar', 'enc', 'encname', 'encformula', 'enctells', 'enchp', 'encres', 'crosshair'].forEach((k) => (el[k] = $(k)));

  // ---------------- input
  const keys = new Set(), input = { x: 0, y: 0, attack: false, bolt: false, act: false, jump: false, cast: 0 };
  const drag = { on: false, x: 0, y: 0, moved: 0 };
  const cam = createCamera(camera);
  // Mouse steering: an option that locks the pointer so moving the mouse turns the camera (and you), and W simply goes where you look.
  const steer = { on: storage('ci.steer') === '1', locked: false, swallowClick: false };
  const setLocked = (v) => { steer.locked = v; cam.manual = v; input.steer = v; el.crosshair.hidden = !v; if (v) { mouse.x = window.innerWidth / 2; mouse.y = window.innerHeight / 2; mouse.nx = 0; mouse.ny = 0; canvas.style.cursor = 'default'; } };
  document.addEventListener('pointerlockchange', () => setLocked(document.pointerLockElement === canvas));
  document.addEventListener('pointerlockerror', () => setLocked(false));
  const lockPointer = () => { if (!steer.on || state !== 'play' || document.pointerLockElement === canvas) return; try { const r = canvas.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => { try { canvas.requestPointerLock(); } catch (e) { /* not available */ } }); } catch (e) { try { canvas.requestPointerLock(); } catch (e2) { /* not available */ } } };
  const unlockPointer = () => { if (document.pointerLockElement === canvas) document.exitPointerLock(); };
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.4) return;
    if (steer.on && state === 'play' && !steer.locked && e.pointerType !== 'touch') { steer.swallowClick = true; lockPointer(); canvas.focus(); return; }
    drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; canvas.setPointerCapture(e.pointerId); canvas.focus(); });
  canvas.addEventListener('pointermove', (e) => {
    if (steer.locked) { cam.yaw -= e.movementX * 0.0032; cam.pitch = clamp(cam.pitch + e.movementY * 0.0026, 0.02, 1.2); return; }
    if (!drag.on) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy); cam.yaw -= dx * 0.0055; cam.pitch = clamp(cam.pitch + dy * 0.004, 0.02, 1.2); cam.dragT = 1.5; });
  const mouse = { x: 0, y: 0, nx: 0, ny: 0, over: null, lastClick: 0 };
  const endDrag = (e) => { if (steer.swallowClick) { steer.swallowClick = false; return; } const wasClick = drag.on && drag.moved < 6; drag.on = false; if (wasClick && state === 'play') onClick(e); };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', () => { drag.on = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (e) => { if (steer.locked) return; mouse.x = e.clientX; mouse.y = e.clientY; mouse.nx = (e.clientX / window.innerWidth) * 2 - 1; mouse.ny = -(e.clientY / window.innerHeight) * 2 + 1; });
  function toggleSteer(v = !steer.on) { steer.on = v; storage('ci.steer', v ? '1' : '0'); if (v) { lockPointer(); toast('Mouse steering on: move the mouse to turn, W to go. Esc frees the pointer, C turns it off.', 'blue'); } else { unlockPointer(); toast('Mouse steering off: drag to look, click to walk.', ''); } }
  canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + e.deltaY * 0.008, 3, 12); e.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault(); if (e.repeat) return; keys.add(k);
    if (k === 'f') input.attack = true; if (k === 'q') input.bolt = true; if (k === 'e' || k === 'enter') input.act = true; if (k === ' ') input.jump = true; onKey(k, e); });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  const stick = { on: false, cx: 0, cy: 0, x: 0, y: 0 }, stickEl = $('stick'), knob = stickEl.querySelector('i');
  stickEl.addEventListener('pointerdown', (e) => { stick.on = true; const r = stickEl.getBoundingClientRect(); stick.cx = r.left + r.width / 2; stick.cy = r.top + r.height / 2; stickEl.setPointerCapture(e.pointerId); });
  stickEl.addEventListener('pointermove', (e) => { if (!stick.on) return; const dx = clamp((e.clientX - stick.cx) / 45, -1, 1), dy = clamp((e.clientY - stick.cy) / 45, -1, 1); stick.x = dx; stick.y = dy; knob.style.transform = `translate(${dx * 35}px, ${dy * 35}px)`; });
  const stickEnd = () => { stick.on = false; stick.x = stick.y = 0; knob.style.transform = ''; };
  stickEl.addEventListener('pointerup', stickEnd); stickEl.addEventListener('pointercancel', stickEnd);
  el.hotbar.addEventListener('click', (e) => { const s = e.target.closest('.slot'); if (!s || s.dataset.i === undefined || state !== 'play') return; P.activeSlot = +s.dataset.i; renderHotbar(); input.cast = P.activeSlot + 1; });
  $('tAttack').addEventListener('pointerdown', (e) => { e.preventDefault(); input.attack = true; });
  $('tAct').addEventListener('pointerdown', (e) => { e.preventDefault(); input.act = true; });
  $('tBolt').addEventListener('pointerdown', (e) => { e.preventDefault(); input.cast = 1; });

  // ---------------- mouse picking (screen-space for entities, a ray march against the terrain for the ground)
  const _v = new THREE.Vector3();
  function screenOf(pos, up = 1) { _v.set(pos.x, pos.y + up, pos.z).project(camera); return { x: _v.x, y: _v.y, z: _v.z, sx: (_v.x + 1) / 2 * window.innerWidth, sy: (1 - _v.y) / 2 * window.innerHeight }; }
  function groundPoint(nx, ny) {
    const dir = new THREE.Vector3(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize(), o = camera.position;
    let t = 0, step = 0.6, last = null;
    for (let i = 0; i < 400; i++) { const p = o.clone().addScaledVector(dir, t); if (p.y < surfaceH(p.x, p.z)) { let lo = Math.max(0, t - step), hi = t; for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2, q = o.clone().addScaledVector(dir, m); if (q.y < surfaceH(q.x, q.z)) hi = m; else lo = m; } return o.clone().addScaledVector(dir, (lo + hi) / 2); } last = p; t += step; if (t > 240) break; }
    return null;
  }
  /** what is under the cursor: an NPC, creature, pickup, the workbench or the tower door (closest on screen within a radius) */
  function pickEntity(sx, sy) {
    let best = null, bd = 1e9;
    const consider = (kind, ref, pos, up, radiusPx) => { const s = screenOf(pos, up); if (s.z > 1 || s.z < -1) return; const d = Math.hypot(s.sx - sx, s.sy - sy); const dist = camera.position.distanceTo(pos); const r = Math.max(18, radiusPx * 8 / Math.max(2, dist)); if (d < r && d < bd) { bd = d; best = { kind, ref, pos }; } };
    for (const n of npcList) consider('npc', n, n.pos, 1.0, 120);
    for (const e of encs) if (!e.dead) consider('creature', e, e.pos, 0, 140 * Math.max(1, e.g.userData.radius));
    for (const p of E.pickups) consider('pickup', p, p.pos, 0.5, 90);
    for (const e of E.enemies) if (!e.dead) consider('enemy', e, e.pos, 1.0, 110);
    if (workbench) consider('bench', workbench, workbench.position, 0.6, 130);
    const tw = zoneById('tower'); consider('door', tw, new THREE.Vector3(tw.x, terrainH(tw.x, tw.z - 0.6), tw.z - 0.6), 1.2, 110);
    return best;
  }
  function onClick(e) {
    const sx = steer.locked ? mouse.x : e.clientX, sy = steer.locked ? mouse.y : e.clientY;
    const hit = pickEntity(sx, sy), now = performance.now(), dbl = now - mouse.lastClick < 320; mouse.lastClick = now;
    if (e.button === 2) { if (hit && hit.kind === 'creature') { P.target = hit.ref; input.cast = (P.activeSlot || 0) + 1; } else if (P.target && !P.target.dead) input.cast = (P.activeSlot || 0) + 1; return; }
    if (hit) {
      if (hit.kind === 'creature') { P.target = hit.ref; P.moveTarget = { x: hit.pos.x, z: hit.pos.z, range: 2.2 + hit.ref.g.userData.radius * 0.6, action: hit, run: dbl }; }
      else if (hit.kind === 'enemy') { P.moveTarget = { x: hit.pos.x, z: hit.pos.z, range: 2.2, action: hit, run: dbl }; }
      else if (hit.kind === 'npc') P.moveTarget = { x: hit.pos.x, z: hit.pos.z, range: 2.4, action: hit, run: dbl };
      else if (hit.kind === 'pickup') P.moveTarget = { x: hit.pos.x, z: hit.pos.z, range: 0.6, action: null, run: dbl };
      else if (hit.kind === 'bench') P.moveTarget = { x: hit.pos.x, z: hit.pos.z, range: 2.6, action: hit, run: dbl };
      else if (hit.kind === 'door') P.moveTarget = { x: hit.pos.x, z: hit.pos.z, range: 6, action: hit, run: dbl };
      return;
    }
    const g = groundPoint(mouse.nx, mouse.ny); if (!g || !walkable(g.x, g.z)) return;
    P.moveTarget = { x: g.x, z: g.z, range: 0.55, action: null, run: dbl }; FX.clickMarker(g);
  }
  let hoverT = 0;
  function updateHover(dt) { hoverT -= dt; if (hoverT > 0 || !mouse.x) return; hoverT = 0.08; const h = pickEntity(mouse.x, mouse.y); mouse.over = h; canvas.style.cursor = !h ? 'default' : h.kind === 'creature' || h.kind === 'enemy' ? 'crosshair' : 'pointer'; }
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })); targetRing.rotation.x = -Math.PI / 2; targetRing.visible = false; scene.add(targetRing);

  // ---------------- player state
  const P = createPlayerController(playerChar, cam, keys, input, stick);
  Object.assign(P, { hp: 100, xp: 0, items: [], mana: 100, unlocked: ['hf'], hotbar: Array(9).fill(null), solved: {}, hpBonus: 0, manaBonus: 0, lessons: {}, visited: [] });
  const level = () => Math.floor(P.xp / 100) + 1;
  const maxHP = () => 100 + 15 * (level() - 1) + P.hpBonus;
  const maxMana = () => 100 + 10 * (level() - 1) + P.manaBonus;
  const staffDmg = () => 12 + 4 * (level() - 1);
  const manaRegen = () => (P.items.includes('diis') ? 11 : 6) + level();

  // ---------------- entities, quests
  let toastT = 0;
  const toast = (text, cls = '') => { el.toast.textContent = text; el.toast.className = 'show ' + cls; toastT = 2.8; };
  const E = createEntities(scene, { player: P, level, staffDmg, cam, onEnemyKilled: (e) => onEnemyKilled(e), onBossHit: () => {}, onPlayerDeath: () => onPlayerDeath(), onPickup: (p) => onPickup(p) });
  const encs = [];
  const FX = createFX(scene, sigils, (p, c, n, s) => E.burst(p, c, n, s), lights);
  function giveItem(id) { if (!P.items.includes(id)) P.items.push(id); toast(`Received: ${QS.ITEMS[id] ? QS.ITEMS[id][0] : id}`, 'blue'); }
  function unlock(ids) { for (const id of ids) { if (P.unlocked.includes(id)) continue; P.unlocked.push(id); const free = P.hotbar.findIndex((s) => !s); if (free >= 0) P.hotbar[free] = { spell: id, opts: defaultOpts(id) }; }
    toast(`New spell${ids.length > 1 ? 's' : ''}: ${ids.map((i) => SPELLS[i].name).join(', ')}  (Tab to craft)`, 'purple'); Sfx.quest(); renderHotbar(); }
  const defaultOpts = (id) => { const o = {}; for (const k of SPELLS[id].opts || []) o[k] = OPT_DEFAULTS[k]; return o; };
  const QS = createQuests({ spawnPack: E.spawnPack, spawnPickup: E.spawnPickup, spawnEncounter: (id, zone, dx, dz, tag) => spawnEncounter(id, zone, dx, dz, tag), unlock, giveItem, player: P, toast, saveGame: () => saveGame(), Sfx, zoneById, maxHP,
    startBoss: () => startBoss(), resumeBoss: () => resumeBoss(), winGame: () => winGame(), showDialog: (id) => showDialog(id), bossQuizNode: () => bossQuizNode, openForge: () => showForge() });
  const { D, WHO, QUESTS, Q, npcNode, ITEMS, questAvailable, questDone } = QS;
  for (const [id, n] of Object.entries(SIDE_NPCS)) WHO[id] = [n.name, n.color];
  const MAIN_NPC = new Set(['fock', 'basia', 'diis', 'cluster', 'keeper', 'rhea', 'alpaca']);
  const npcList = Object.entries(npcs).map(([id, c]) => { const mark = E.textSprite('!', hex(COL.amber), 0.75); mark.position.y = 2.6; mark.visible = false; c.root.add(mark);
    const mark2 = E.textSprite('?', '#6fa8ff', 0.75); mark2.position.y = 2.6; mark2.visible = false; c.root.add(mark2);
    const lbl = E.textSprite(WHO[id][0], '#ffffff', 0.8); lbl.position.y = 2.15; c.root.add(lbl); return { id, name: WHO[id][0], c, pos: c.pos, mark, mark2 }; });

  // ---------------- molecule encounters
  function spawnEncounter(id, zoneId, dx, dz, tag) {
    const enc = ENCOUNTERS[id], zn = zoneById(zoneId); let x = zn.x + dx, z = zn.z + dz;
    if (!walkable(x, z)) { x = zn.x; z = zn.z; }
    const g = moleculeModel(enc, lights); g.userData.baseY = terrainH(x, z); g.position.set(x, g.userData.baseY + g.userData.hover, z); scene.add(g);
    const e = { id, enc, tag, g, pos: g.position, home: new THREE.Vector3(x, 0, z), hp: enc.hp, xp: enc.xp, t: Math.random() * 6, dead: false, deadT: 0, atkCd: 2, regioned: false, agit: 0, phaseNeeds: null, wild: !!(tag && tag.startsWith('wild:')) };
    if (e.wild) e.xp = Math.round(enc.xp * 0.6);
    encs.push(e); return e;
  }
  const nearestEnc = (range = 14) => { let best = null, bd = range; for (const e of encs) { if (e.dead) continue; const d = e.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = e; } } return best; };
  function damageEnc(e, dmg, color) {
    e.hp -= dmg; e.agit = 1; flashMolecule(e.g, color); E.burst(e.pos.clone(), color, 18, 4); Sfx.hit();
    if (e.hp <= 0) { e.dead = true; e.deadT = 0.6; P.xp += e.xp; E.burst(e.pos.clone(), color, 40, 6); Sfx.good(); onEncounterDefeated(e); }
    else if (e.enc.boss) onBossPhase(e);
  }
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();   // scratch for the per-frame loops
  function updateEncounters(dt, frozen) {
    for (let i = encs.length - 1; i >= 0; i--) {
      const e = encs[i]; e.t += dt; e.agit = Math.max(0, e.agit - dt);
      if (e.dead) { e.deadT -= dt; e.g.scale.setScalar(Math.max(0.01, e.deadT / 0.6)); if (e.deadT <= 0) { if (e.g.userData.light && lights) lights.release(e.g.userData.light); scene.remove(e.g); encs.splice(i, 1); } continue; }
      animateMolecule(e.g, dt, e.t, e.agit); coolMolecule(e.g, dt);
      const toP = _v1.copy(P.pos).sub(e.pos).setY(0), d = toP.length();
      if (!frozen && !e.frozen && d < (e.wild ? 8 : 10) && d > e.g.userData.radius + 1.2) { toP.normalize(); const sp = e.enc.boss ? 1.6 : 1.1; const nx = e.pos.x + toP.x * sp * dt, nz = e.pos.z + toP.z * sp * dt; if (walkable(nx, nz) && Math.hypot(nx - e.home.x, nz - e.home.z) < 14) { e.pos.x = nx; e.pos.z = nz; e.g.userData.baseY = terrainH(nx, nz); } }
      else if (d > 14) { const toH = _v2.set(e.home.x - e.pos.x, 0, e.home.z - e.pos.z); if (toH.length() > 1) { toH.normalize(); e.pos.x += toH.x * dt; e.pos.z += toH.z * dt; e.g.userData.baseY = terrainH(e.pos.x, e.pos.z); } }
      e.atkCd -= dt;
      if (!frozen && !e.frozen && d < e.g.userData.radius + 1.6 && e.atkCd <= 0) { e.atkCd = 1.6; E.hurtPlayer(e.enc.boss ? 18 : 9 + e.enc.size * 2, e.pos); E.burst(P.pos.clone().setY(P.pos.y + 1), 0xa25be0, 10, 3); }
      if (e.tag === 'flee' && e.hp < e.enc.hp * 0.35) { e.dead = true; e.deadT = 0.6; toast('The stretched dinitrogen tears free and flees toward the tower. Single-reference spells cannot finish it.', 'purple'); E.burst(e.pos.clone(), 0xa25be0, 40, 6); }
    }
  }
  function onEncounterDefeated(e) {
    const remaining = encs.filter((x) => x.tag === e.tag && !x.dead).length;
    if (!P.solved[e.id] && e.lastGood) { P.solved[e.id] = e.lastGood; }
    toast(`${e.enc.name} converged.  +${e.xp} XP`, 'green'); sqOnKill(e);
    if (e.enc.boss) { el.bossbar.hidden = true; setTimeout(() => showDialog('boss3'), 600); return; }
    QS.onEncounterDefeated(e.tag, remaining); saveGame();
  }
  // ---------------- the wild population: roaming molecules per zone that respawn after a while
  const wild = WILD.map((w) => ({ ...w, slots: w.pool.map(() => ({ e: null, t: 0 })) }));
  function resetWild() { for (const w of wild) for (const sl of w.slots) { sl.e = null; sl.t = 2 + Math.random() * 4; } }
  resetWild();
  /** The point-light pool is small (10): keep the glow lights on the creatures nearest the player and let far roamers do without. */
  function rebalanceLights() {
    if (!lights) return;
    const live = encs.filter((e) => !e.dead).map((e) => ({ e, d: e.pos.distanceTo(P.pos) - (e.enc.boss ? 1000 : 0) })).sort((a, b) => a.d - b.d);
    const keep = new Set(live.slice(0, 7).filter((x) => x.d < 45).map((x) => x.e));
    for (const { e } of live) { const u = e.g.userData; if (u.light && !keep.has(e)) { lights.release(u.light); u.light = null; } }
    for (const e of keep) { const u = e.g.userData; if (!u.light) { const l = lights.acquire(u.aura.material.color, u.baseLight || 10, u.radius * 6); if (l) { e.g.add(l); u.light = l; } } }
  }
  let wildT = 0;
  function updateWild(dt) {
    wildT -= dt; if (wildT > 0) return; wildT = 1; rebalanceLights();
    for (const w of wild) {
      const gate = QUESTS.find((q) => q.id === w.gate); if (gate && !questDone(gate)) continue;
      w.slots.forEach((sl, i) => {
        if (sl.e && !sl.e.dead) return;
        if (sl.e) { sl.e = null; sl.t = w.respawn * (0.8 + Math.random() * 0.4); }
        sl.t -= 1; if (sl.t > 0) return;
        const zn = zoneById(w.zone), p = w.pool[i]; if (Math.hypot(P.pos.x - (zn.x + p.dx), P.pos.z - (zn.z + p.dz)) < 10 || encs.length > 26) return;
        sl.e = spawnEncounter(p.enc, w.zone, p.dx, p.dz, 'wild:' + w.zone);
      });
    }
  }
  // ---------------- casting
  const pending = [];
  function cast(slot) {
    const s = P.hotbar[slot]; if (!s) { toast('Empty slot. Craft a spell with Tab.', ''); return; }
    const spec = SPELLS[s.spell], target = (P.target && !P.target.dead && P.target.pos.distanceTo(P.pos) < 16) ? P.target : nearestEnc(16);
    if (!target) { toast('No correlation creature in range.', ''); return; }
    P.target = target;
    if (P.mana < spec.cost) { toast(`Not enough mana for ${spec.name} (${spec.cost}).`, 'red'); Sfx.bad(); return; }
    P.mana -= spec.cost; Sfx.bolt(); P.c.attackT = 0.45;
    const dir = target.pos.clone().sub(P.pos); P.c.heading = Math.atan2(dir.x, dir.z);
    const c = { target, spell: s.spell, opts: { ...s.opts }, done: false }; pending.push(c);
    FX.castRune(P.pos, s.spell);
    FX.projectile(P.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), target, s.spell, () => resolveCast(c));
    const slotEl = el.hotbar.children[slot]; if (slotEl) { slotEl.classList.remove('flash'); void slotEl.offsetWidth; slotEl.classList.add('flash'); }
  }
  function resolveCast(b) {
    if (b.done) return; b.done = true; const pi = pending.indexOf(b); if (pi >= 0) pending.splice(pi, 1);
    const e = b.target, enc = e.enc; if (e.dead) return;
    let verdict = judge(b.spell, b.opts, enc, { items: P.items, regioned: e.regioned });
    if (e.phaseNeeds && b.spell !== e.phaseNeeds && verdict.result !== 'fail') verdict = { result: 'fail', factor: 0, reason: `The dragon is beyond single-reference spells now. Only ${SPELLS[e.phaseNeeds].name} bites in this phase.` };
    if (e.phaseNeeds && b.spell === e.phaseNeeds) verdict = { result: 'best', factor: 1.2, reason: verdict.reason };
    const spec = SPELLS[b.spell], snippet = craftInput(b.spell, b.opts, enc);
    showEncounterResult(e, verdict, spec); sqOnHit(e, b.spell, b.opts, verdict);
    FX.impact(e.pos.clone(), b.spell, verdict.result, spec.macro);
    if (verdict.result === 'modifier') { e.regioned = true; e.g.userData.body.scale.setScalar(0.65); toast('Region cut out: the golem is fragment-sized now.', 'blue'); return; }
    if (verdict.result === 'backfire') { E.hurtPlayer(16, e.pos); cam.shake = 1.2; FX.backfire(P.pos.clone()); Sfx.bad(); return; }
    if (verdict.result === 'fail') { Sfx.bad(); return; }
    const dmg = RESULT_DMG[verdict.result] * verdict.factor * (1 + 0.08 * (level() - 1));
    if (verdict.result === 'best' || verdict.result === 'ok') e.lastGood = snippet;
    damageEnc(e, dmg, spec.color);
  }
  function updateBolts(dt) { FX.update(dt); }
  let encShownFor = null;
  function showEncounterResult(e, verdict, spec) {
    el.encres.textContent = `${spec.macro}: ${verdict.reason}`; el.encres.className = 'res ' + (['best', 'ok', 'modifier'].includes(verdict.result) ? 'good' : verdict.result === 'weak' ? '' : 'bad');
    e.resT = 6;
  }
  function updateEncounterCard(dt) {
    const e = nearestEnc(16);
    if (!e) { if (!el.enc.hidden) el.enc.hidden = true; encShownFor = null; return; }
    if (encShownFor !== e) { encShownFor = e; el.encname.textContent = e.enc.name; el.encformula.textContent = `${e.enc.formula} · ${e.enc.nelec} e⁻${e.wild ? ' · roaming' : ''}`; el.enctells.textContent = e.enc.tells.join(' · '); el.encres.textContent = ''; el.encres.className = 'res'; el.enc.hidden = false; }
    el.enchp.style.width = (100 * clamp(e.hp / e.enc.hp, 0, 1)).toFixed(0) + '%';
    if (e.resT > 0) { e.resT -= dt; if (e.resT <= 0) { el.encres.textContent = ''; } }
  }
  function renderHotbar() {
    el.hotbar.innerHTML = P.hotbar.map((s, i) => { if (!s) return `<div class="slot empty"><div class="sig"></div><span class="k">${i + 1}</span><span class="n">—</span></div>`; const sp = SPELLS[s.spell], sg = sigils[s.spell];
      const o = Object.entries(s.opts || {}).filter(([k, v]) => v !== '' && v !== undefined && k !== 'extra' && k !== 'basis').map(([k, v]) => `${k}=${v}`).concat(s.opts && s.opts.extra && s.opts.extra.trim() ? ['+' + parseExtras(s.opts.extra).sets.length + ' set'] : []).join(' ');
      return `<div class="slot ${P.mana < sp.cost ? 'dim' : ''} ${(P.activeSlot || 0) === i ? 'active' : ''}" data-i="${i}" style="--sc:${hex(sp.color)}"><img class="sig" src="${sg ? sg.url : ''}" alt=""><span class="k">${i + 1}</span><span class="n">${sp.name}</span><span class="c">${sp.cost} · ${sp.scaling}</span>${o ? `<span class="o">${esc(o)}</span>` : ''}</div>`; }).join('');
  }

  // ---------------- side quests
  const SQ = {}, SQP = {};   // stage per side quest (0 offered, 1 active, 2 done); progress {kills, hits}
  const sqById = (id) => SIDE_QUESTS.find((s) => s.id === id);
  const sqAvailable = (sq) => (SQ[sq.id] || 0) < 2 && (!sq.needs.quest || questDone(QUESTS.find((q) => q.id === sq.needs.quest))) && (!sq.needs.spells || sq.needs.spells.every((s) => P.unlocked.includes(s)));
  const sqForNpc = (npc) => SIDE_QUESTS.find((s) => s.npc === npc && SQ[s.id] === 1) || SIDE_QUESTS.find((s) => s.npc === npc && sqAvailable(s));
  const sqTag = (sq) => 'sq:' + sq.id;
  const castQualifies = (sq, spellId, opts) => { if (sq.requireSpell && !sq.requireSpell.includes(spellId)) return false; const { sets } = parseExtras(opts.extra);
    if (sq.requireExtras && !sq.requireExtras.every((n) => extraSatisfied(sets, n))) return false;
    if (sq.requireOpts && !Object.entries(sq.requireOpts).every(([k, v]) => String(opts[k] ?? '').replace(/["\s]/g, '') === String(v).replace(/["\s]/g, ''))) return false;
    if (sq.requireBasis && !sq.requireBasis.test(opts.basis || '')) return false; return true; };
  const anyKillCounts = (sq) => !sq.requireSpell && !sq.requireExtras && !sq.requireOpts && !sq.requireBasis;
  const craftSatisfied = (sq) => P.hotbar.some((s) => s && (!sq.need.spell || sq.need.spell.includes(s.spell)) && (sq.need.extras || []).every((n) => extraSatisfied(parseExtras(s.opts.extra).sets, n))
    && (!sq.need.opts || Object.entries(sq.need.opts).every(([k, v]) => String(s.opts[k] ?? '').replace(/["\s]/g, '') === String(v).replace(/["\s]/g, ''))) && (!sq.need.basis || sq.need.basis.test(s.opts.basis || '')));
  const sqSpawn = (sq, resume = false) => { const pr = resume && SQP[sq.id] ? SQP[sq.id] : (SQP[sq.id] = { kills: 0, hits: 0 }); const list = (sq.spawn || []).slice(pr.kills);
    for (const s of list) if (!encs.some((e) => e.tag === sqTag(sq) && !e.dead && e.id === s.enc && Math.abs(e.home.x - (zoneById(s.zone).x + s.dx)) < 0.5)) { const e = spawnEncounter(s.enc, s.zone, s.dx, s.dz, sqTag(sq)); const m = E.textSprite('?', '#6fa8ff', 0.6); m.position.y = e.g.userData.radius + 0.9; e.g.add(m); } };
  /** The active trial a creature counts for: its own tag, or any active trial hunting that species (a wild water counts for a water trial). */
  const trialFor = (e) => { if (e.tag && e.tag.startsWith('sq:')) { const sq = sqById(e.tag.slice(3)); return sq && SQ[sq.id] === 1 ? sq : null; }
    return SIDE_QUESTS.find((sq) => SQ[sq.id] === 1 && SQP[sq.id] && (sq.spawn || []).some((s) => s.enc === e.id) && !sqSatisfied(sq)) || null; };
  /** Why a cast did not count for a trial, in the mentor's terms. */
  function whyNot(sq, spellId, opts, verdict) {
    if (['fail', 'backfire'].includes(verdict.result)) return 'the cast failed, so it does not count.';
    if (sq.requireSpell && !sq.requireSpell.includes(spellId)) return `it must be ${sq.requireSpell.map((s) => SPELLS[s].name).join(' or ')}, not ${SPELLS[spellId].name}.`;
    const { sets } = parseExtras(opts.extra);
    for (const n of sq.requireExtras || []) if (!extraSatisfied(sets, n)) { const had = findExtra(sets, n.group, n.key); return `the cast needs ${n.group} ${n.key}${n.eq !== undefined ? '=' + n.eq : n.min !== undefined ? ' of at least ' + n.min : ''} in its additional settings; this one had ${had === undefined ? 'none' : n.key + '=' + had}. Bind it, then cast that slot.`; }
    for (const [k, v] of Object.entries(sq.requireOpts || {})) if (String(opts[k] ?? '').replace(/["\s]/g, '') !== String(v).replace(/["\s]/g, '')) return `the cast needs ${k}=${v}; this one had ${opts[k] ?? 'nothing'}.`;
    if (sq.requireBasis && !sq.requireBasis.test(opts.basis || '')) return `the basis is wrong: ${sq.hint}`;
    return 'it did not qualify.';
  }
  const sqSatisfied = (sq) => { const pr = SQP[sq.id] || { kills: 0, hits: 0 }; if (sq.type === 'craft') return craftSatisfied(sq); if (sq.type === 'quiz') return true; return sq.hitOnly ? pr.hits >= 1 : pr.kills >= (sq.spawn || []).length; };
  function sqComplete(sq) {
    SQ[sq.id] = 2; const r = sq.reward || {}; P.xp += r.xp || 0; if (r.hp) { P.hpBonus += r.hp; P.hp = Math.min(maxHP(), P.hp + r.hp); } if (r.mana) { P.manaBonus += r.mana; P.mana = Math.min(maxMana(), P.mana + r.mana); }
    if (sq.lesson) P.lessons[sq.id] = sq.lesson; if (r.spells) unlock(r.spells); Sfx.quest(); toast(`Trial complete: ${sq.title}  +${r.xp || 0} XP${r.hp ? ` · +${r.hp} max HP` : ''}${r.mana ? ` · +${r.mana} max mana` : ''}`, 'green'); saveGame();
  }
  /** Builds the dialogue nodes for a side quest on demand and returns the id of the node to show now. */
  function sqNode(sq) {
    const who = sq.npc, base = 'sq:' + sq.id, st = SQ[sq.id] || 0;
    if (st === 2) return null;
    if (!D[base + ':offer']) {
      const completeId = base + ':complete';
      D[completeId] = { who, text: sq.done.text, code: sq.done.code, run: () => sqComplete(sq) };
      const afterQuiz = sq.type === 'quiz' ? completeId : base + ':go';
      D[base + ':go'] = { who, text: (sq.hint || 'Go.') + (sq.spawn ? ' It waits nearby.' : ''), run: () => { SQ[sq.id] = 1; if (sq.spawn) sqSpawn(sq); saveGame(); } };
      const steps = sq.steps || [];
      for (let k = steps.length - 1; k >= 0; k--) { const stId = base + ':q' + k, next = k === steps.length - 1 ? afterQuiz : base + ':q' + (k + 1); const step = steps[k];
        D[stId] = { who, text: step.q, code: step.code, choices: step.choices.map((c, i) => { const wid = `${stId}:w${i}`; if (!c.ok) D[wid] = { who, text: c.why, next: stId }; return { t: c.t, next: c.ok ? next : wid, ok: !!c.ok }; }) }; }
      const acceptNext = steps.length ? base + ':q0' : base + ':go';
      const crafty = sq.requireExtras || sq.requireOpts || sq.requireBasis;
      D[base + ':accept'] = { who, text: sq.type === 'quiz' ? 'Then think it through.' : sq.type === 'craft' ? 'Craft it at a workbench or with Tab, bind it to a slot, and come back.' : crafty ? 'Craft the spell with Tab, bind it to a hotbar slot, and cast that slot on the creature. Your bound spells keep their settings.' : 'Take this with you.', next: acceptNext,
        run: () => { SQ[sq.id] = 1; if (sq.grant) { unlock(sq.grant); toast(`New spell: ${sq.grant.map((s) => SPELLS[s].name).join(', ')}. Craft it with Tab.`, 'blue'); } saveGame(); } };
      D[base + ':offer'] = { who, text: `A trial, if you want it: ${sq.title}. ${sq.intro.text}`, code: sq.intro.code, choices: [{ t: 'Accept the trial', next: base + ':accept', ok: true }, { t: 'Not now', next: base + ':later' }] };
      D[base + ':later'] = { who, text: 'It keeps. Come back when you have the mana.' };
      D[base + ':hint'] = { who, text: sq.hint || 'Not yet.' };
      D[base + ':again'] = { who, text: 'It got away from you. Another one, then.', run: () => sqSpawn(sq, true) };
    }
    if (st === 0) return base + ':offer';
    if (sqSatisfied(sq)) return base + ':complete';
    if (sq.spawn && !SQP[sq.id]) return (sq.steps || []).length ? base + ':q0' : base + ':go';   // accepted, questions not finished yet: resume them
    if (sq.spawn && !encs.some((e) => e.tag === sqTag(sq) && !e.dead)) return base + ':again';
    return base + ':hint';
  }
  function sqOnHit(e, spellId, opts, verdict) { const sq = trialFor(e); if (!sq) return;
    const ok = castQualifies(sq, spellId, opts) && !['fail', 'backfire'].includes(verdict.result); e.lastQualified = ok;
    if (!ok) { if (!anyKillCounts(sq)) toast(`${sq.title}: ${whyNot(sq, spellId, opts, verdict)}`, 'purple'); return; }
    const pr = SQP[sq.id] || (SQP[sq.id] = { kills: 0, hits: 0 });
    if (sq.hitOnly) { if (pr.hits === 0) toast(`That is the cast ${WHO[sq.npc][0]} wanted. Report back.`, 'green'); pr.hits++; saveGame(); }
    else if (!anyKillCounts(sq) && !e.qualifiedToast) { e.qualifiedToast = true; toast(`${sq.title}: that is the right cast. Finish it with it.`, 'green'); } }
  function sqOnKill(e) { const sq = trialFor(e); if (!sq) return;
    const pr = SQP[sq.id] || (SQP[sq.id] = { kills: 0, hits: 0 });
    if (sq.hitOnly) { if (pr.hits < 1) toast(`It fell, but the cast ${WHO[sq.npc][0]} wanted never landed on it. Any ${e.enc.name} will do; another appears when you talk to ${WHO[sq.npc][0]}.`, 'purple'); return; }
    if (e.lastQualified || anyKillCounts(sq)) { pr.kills++; saveGame(); toast(pr.kills >= (sq.spawn || []).length ? `Trial done: report to ${WHO[sq.npc][0]}.` : 'One down.', 'green'); } else toast(`It fell, but not to the cast ${WHO[sq.npc][0]} asked for. Any ${e.enc.name} counts; another appears when you talk to ${WHO[sq.npc][0]}.`, 'purple'); }

  // ---------------- dialogue
  const dlg = { node: null, full: '', shown: 0, typing: false, choices: [], t: 0 };
  let bossQuizNode = 'boss1';
  function showDialog(id) {
    const node = typeof id === 'string' ? D[id] : id; if (!node) return;
    dlg.node = node; dlg.full = node.text; dlg.shown = 0; dlg.typing = true; dlg.t = 0; dlg.choices = node.choices || [];
    if (dlg.choices.some((c) => c.ok !== undefined)) { const a = dlg.choices.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } dlg.choices = a; }   // quiz answers in random order; offers keep theirs
    const who = WHO[node.who]; el.dname.textContent = who[0]; el.dsw.style.background = who[1];
    el.dtext.textContent = ''; el.dcode.innerHTML = node.code ? hl(node.code) : ''; el.dchoices.innerHTML = ''; el.dnext.textContent = '';
    el.dlg.hidden = false; Sfx.talk(); for (const n of npcList) n.c.talking = n.id === node.who; unlockPointer();
  }
  function finishTyping() {
    dlg.typing = false; el.dtext.textContent = dlg.full;
    if (dlg.choices.length) { el.dchoices.innerHTML = dlg.choices.map((c, i) => `<button class="choice" type="button" data-i="${i}"><span class="n">${i + 1}</span><span>${c.t}</span></button>`).join(''); el.dchoices.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => choose(+b.dataset.i))); el.dnext.textContent = 'pick 1–' + dlg.choices.length; }
    else el.dnext.textContent = dlg.node.next ? 'E / click to continue' : 'E / click to close';
  }
  function choose(i) { const c = dlg.choices[i]; if (!c) return; if (c.ok) { Sfx.good(); P.xp += 10; } else Sfx.bad(); showDialog(c.next); }
  function dlgAdvance() { if (!dlg.node) return; if (dlg.typing) { finishTyping(); return; } if (dlg.choices.length) return; const node = dlg.node; closeDialog(); if (node.run) node.run(); if (node.next && !dlg.node) showDialog(node.next); }
  function closeDialog() { dlg.node = null; el.dlg.hidden = true; for (const n of npcList) n.c.talking = false; }
  const dialogOpen = () => !!dlg.node;
  el.dlg.addEventListener('click', (e) => { if (!e.target.closest('button')) dlgAdvance(); });

  // ---------------- hooks
  function onEnemyKilled(e) {
    if (Math.random() < 0.3) E.spawnPickup('coffee', e.pos.x, e.pos.z, 'drop');
    if (e.tag === 'osc1' && Q.scf === 2 && E.aliveCount('osc1') === 0) { Q.scf = 3; toast('Fields cleared. Bring the log back to Farmer DIIS.', 'green'); saveGame(); }
  }
  function onPickup(p) {
    if (p.kind === 'coffee') { P.hp = Math.min(maxHP(), P.hp + 35); toast('Coffee. +35 HP', 'blue'); }
    if (p.kind === 'basisfn' && !E.pickups.some((x) => x.tag === 'bfn')) { Q.fitting = 3; toast('All fitting-basis pages found. Back to Basia.', 'green'); saveGame(); }
  }
  function onPlayerDeath() { const hb = zoneById('harbor'); P.pos.set(hb.x, 0, hb.z + 6); P.hp = maxHP(); P.mana = maxMana(); P.hurtT = 1.5; cam.yaw = 0; toast('Diverged. Restarted from the last dump file at Input Harbor.', 'red'); Sfx.bad(); for (const e of encs) if (e.enc.boss) { e.hp = e.enc.hp; e.phaseNeeds = null; bossPhase = 0; } }
  let boss = null, bossPhase = 0, ending = false, creditsPending = false;
  function startBoss() { const tw = zoneById('tower'); Q.dragon = 1; boss = spawnEncounter('dragon', 'tower', 0, 7, 'boss'); bossPhase = 0; el.bossname.textContent = 'Dragon of Static Correlation'; el.bossbar.hidden = false; Sfx.bad(); }
  function onBossPhase(e) { const f = e.hp / e.enc.hp;
    if (bossPhase === 0 && f < 0.66) { bossPhase = 1; e.frozen = true; bossQuizNode = 'boss1'; showDialog('boss1'); }
    else if (bossPhase === 1 && f < 0.33) { bossPhase = 2; e.frozen = true; bossQuizNode = 'boss2'; showDialog('boss2'); } }
  function resumeBoss() { if (!boss) return; boss.frozen = false; boss.phaseNeeds = bossPhase === 1 ? 'mcscf' : bossPhase === 2 ? 'ciphi' : null; toast(`Only ${SPELLS[boss.phaseNeeds].name} bites now.`, 'purple'); }
  function winGame() { QS.completeQuest('dragon', 300); alpaca.visible = true; boss = null; ending = true; creditsPending = true; }

  // ---------------- objectives & HUD
  const currentQuest = () => QUESTS.find((q) => questAvailable(q) && !questDone(q) && Q[q.id] > 0) || QUESTS.find((q) => questAvailable(q) && !questDone(q)) || null;
  const tagCount = (t) => t === 'bfn' ? E.pickups.filter((p) => p.tag === 'bfn').length : t === 'osc1' ? E.aliveCount('osc1') : encs.filter((e) => e.tag === t && !e.dead).length;
  function objectiveTarget(q) {
    if (!q) return null; const st = Q[q.id], npc = npcList.find((n) => n.id === q.npc);
    if (q.id === 'dragon') { const tw = zoneById('tower'); return st === 0 ? [tw.x, tw.z - 0.6] : (boss && !boss.dead ? [boss.pos.x, boss.pos.z] : [tw.x, tw.z]); }
    if (st === 2) { const tag = { prologue: 'pro', fitting: 'bfn', scf: 'osc1', ladder: 'ladder', dumps: 'dumps', spins: 'spins', golems: 'golems' }[q.id];
      const pool = tag === 'bfn' ? E.pickups.filter((p) => p.tag === 'bfn') : tag === 'osc1' ? E.enemies.filter((e) => e.tag === tag && !e.dead) : encs.filter((e) => e.tag === tag && !e.dead);
      let best = null, bd = 1e9; for (const o of pool) { const d = o.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = o; } }
      return best ? [best.pos.x, best.pos.z] : (npc ? [npc.pos.x, npc.pos.z] : null); }
    if (q.id === 'fitting' && st === 3 && workbench) return [workbench.position.x, workbench.position.z];
    return npc ? [npc.pos.x, npc.pos.z] : null;
  }
  let hudT = 0; const hudLast = {};
  /** Writes a DOM property only when the value changed: innerHTML and textContent writes cost layout even when identical. */
  const setIf = (key, node, prop, val) => { if (hudLast[key] !== val) { hudLast[key] = val; node[prop] = val; } };
  function updateHUD(dt, target) {
    hudT -= dt; if (hudT > 0) return; hudT = 0.1;
    const zn = zoneAt(P.pos.x, P.pos.z); setIf('zone', el.zone, 'textContent', zn ? zn.name : 'The wilds');
    if (zn && !P.visited.includes(zn.id)) { P.visited.push(zn.id); if (P.visited.length > 1) toast(`${zn.name}: its waystone now answers the others.`, 'blue'); }
    setIf('hpw', el.hpbar.style, 'width', (100 * clamp(P.hp / maxHP(), 0, 1)).toFixed(0) + '%'); setIf('hp', el.hpval, 'textContent', `${Math.max(0, Math.round(P.hp))} / ${maxHP()}`);
    setIf('xpw', el.xpbar.style, 'width', (P.xp % 100) + '%'); setIf('xp', el.xpval, 'textContent', `lvl ${level()}`);
    setIf('mw', el.manabar.style, 'width', (100 * clamp(P.mana / maxMana(), 0, 1)).toFixed(0) + '%'); setIf('mana', el.manaval, 'textContent', `${Math.round(P.mana)} / ${maxMana()}`);
    const q = currentQuest();
    if (q) { setIf('qt', el.qtitle, 'textContent', q.title); setIf('qo', el.qobj, 'innerHTML', q.obj[Q[q.id]].replace(/\{(\w+)\}/g, (_, t) => tagCount(t))); }
    else { setIf('qt', el.qtitle, 'textContent', ending ? 'The island converged' : 'No active quest'); setIf('qo', el.qobj, 'innerHTML', ending ? 'Wander, or cast on whatever is left.' : ''); }
    setIf('items', el.items, 'innerHTML', P.items.map((i) => ITEMS[i] ? `<span class="item ${ITEMS[i][1]}">${ITEMS[i][0]}</span>` : '').join(''));
    if (boss && !boss.dead) el.bosshp.style.width = (100 * boss.hp / boss.enc.hp).toFixed(0) + '%';
    const g = el.compass.getContext('2d'); g.clearRect(0, 0, 88, 88); g.strokeStyle = '#cbd3e8'; g.lineWidth = 2; g.beginPath(); g.arc(44, 44, 38, 0, 6.283); g.stroke();
    if (target) { const a = Math.atan2(target[0] - P.pos.x, target[1] - P.pos.z), th = a - (cam.yaw + Math.PI);
      g.save(); g.translate(44, 44); g.rotate(-th); g.fillStyle = '#e9a23b'; g.beginPath(); g.moveTo(0, -30); g.lineTo(11, 6); g.lineTo(0, -2); g.lineTo(-11, 6); g.closePath(); g.fill(); g.restore();
      g.fillStyle = '#5b6480'; g.font = '600 11px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText(Math.round(Math.hypot(target[0] - P.pos.x, target[1] - P.pos.z)) + ' m', 44, 78); }
  }

  // ---------------- overlays: title, menu, forge, lore, credits; save/load
  let state = 'title';
  const showOverlay = (html) => { el.panel.innerHTML = html; el.overlay.hidden = false; unlockPointer(); };
  const plainPanel = () => el.panel.classList.remove('grimoire');
  const hideOverlay = () => { el.overlay.hidden = true; canvas.focus(); };
  function saveGame() { storage('ci.save', JSON.stringify({ v: 2, Q, SQ, SQP, xp: P.xp, hp: P.hp, mana: P.mana, items: P.items, unlocked: P.unlocked, hotbar: P.hotbar, solved: P.solved, lessons: P.lessons, hpBonus: P.hpBonus, manaBonus: P.manaBonus, drafts: P.drafts || {}, visited: P.visited, pos: [P.pos.x, P.pos.z] })); }
  function loadGame() {
    try { const s = JSON.parse(storage('ci.save') || 'null'); if (!s || s.v !== 2) return false;
      Object.assign(Q, s.Q); Object.assign(SQ, s.SQ || {}); Object.assign(SQP, s.SQP || {}); P.xp = s.xp; P.hp = s.hp; P.mana = s.mana ?? 100; P.items = s.items || []; P.unlocked = s.unlocked || ['hf']; P.hotbar = s.hotbar || Array(9).fill(null); P.solved = s.solved || {}; P.lessons = s.lessons || {}; P.hpBonus = s.hpBonus || 0; P.manaBonus = s.manaBonus || 0; P.drafts = s.drafts || {}; P.visited = s.visited || []; P.pos.set(s.pos[0], 0, s.pos[1]);
      for (const sq of SIDE_QUESTS) if (SQ[sq.id] === 1 && sq.spawn && SQP[sq.id] && !sqSatisfied(sq)) sqSpawn(sq, true);
      const respawn = { pro: ['prologue', () => spawnEncounter('hatom', 'harbor', 9, 9, 'pro')], ladder: ['ladder', () => { spawnEncounter('water', 'forest', -8, 5, 'ladder'); spawnEncounter('n2eq', 'forest', 7, 8, 'ladder'); }],
        dumps: ['dumps', () => { spawnEncounter('lih', 'caves', -6, 7, 'dumps'); spawnEncounter('h2str', 'caves', 6, 8, 'dumps'); spawnEncounter('n2dump', 'caves', 9, -8, 'dumps'); }],
        spins: ['spins', () => { spawnEncounter('o2', 'ridge', -6, 5, 'spins'); spawnEncounter('h2co', 'ridge', 7, 4, 'spins'); }],
        golems: ['golems', () => { spawnEncounter('benzene', 'tower', -9, 9, 'golems'); spawnEncounter('naphth', 'tower', 9, 10, 'golems'); spawnEncounter('caffeine', 'tower', 0, 14, 'golems'); }] };
      for (const [, [q, fn]] of Object.entries(respawn)) if (Q[q] === 2) fn();
      if (Q.scf === 2) E.spawnPack('osc', 'fields', 4, 'osc1');
      if (Q.fitting === 2) { const bz = zoneById('bazaar'); [[-8, 6], [7, -1], [1, 10], [-4, -7]].forEach(([dx, dz]) => E.spawnPickup('basisfn', bz.x + dx, bz.z + dz, 'bfn')); }
      if (Q.dragon === 1) Q.dragon = 0; if (Q.dragon >= 2) { ending = true; }
      renderHotbar(); return true; } catch (e) { return false; }
  }
  function startGame(cont) {
    Sfx.init(); if (!cont) { Object.keys(Q).forEach((k) => (Q[k] = 0)); Object.keys(SQ).forEach((k) => delete SQ[k]); Object.keys(SQP).forEach((k) => delete SQP[k]); P.xp = 0; P.items = []; P.unlocked = ['hf']; P.hotbar = Array(9).fill(null); P.solved = {}; P.lessons = {}; P.hpBonus = 0; P.manaBonus = 0; P.drafts = {}; P.visited = []; P.mana = 100; resetWild(); const hb = zoneById('harbor'); P.pos.set(hb.x, 0, hb.z + 8); P.hp = 100; P.c.heading = Math.PI; }
    state = 'play'; el.hud.hidden = false; hideOverlay(); cam.yaw = 0; cam.pos.set(P.pos.x, P.pos.y + 4, P.pos.z + 6); renderHotbar(); saveGame();
  }
  function clearEncounters() { for (const e of encs) { if (e.g.userData.light && lights) lights.release(e.g.userData.light); scene.remove(e.g); } encs.length = 0; P.target = null; resetWild(); }
  function showTitle() {
    state = 'title'; plainPanel(); el.hud.hidden = true; const has = !!storage('ci.save'); clearEncounters();
    showOverlay(`<div class="eyebrow">An ElemCo.jl adventure on Convergence Island</div><h1>Beyond <em>Mean Fields</em></h1>
      <p>Correlation is the enemy. You start with the mean field, learn to fit it, then climb the ladder: MP2, coupled cluster, distinguishable cluster, triples, low-rank triples, excited states, active spaces, selected CI, regions. Every spell is a real ElemCo input crafted at a jlmol workbench, and every creature is a real molecule that tells you which spell it fears.</p>
      <div class="ctrls"><div><b>Mouse:</b> click the ground to walk, double-click to run</div><div>click people, creatures and objects to use them · right-click a creature to cast · drag to look, wheel to zoom</div><div><b>Mouse steering</b> (<kbd>C</kbd> or the menu): the mouse turns you, <kbd>W</kbd> goes where you look, the crosshair picks what you click</div><div><b>Keys:</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>shift</kbd> run · <kbd>space</kbd> jump · <kbd>E</kbd> talk · <kbd>F</kbd> staff · <kbd>1</kbd>–<kbd>9</kbd> cast</div><div><kbd>Tab</kbd> spellbook and workbench · <kbd>J</kbd> quest log · <kbd>Esc</kbd> menu</div></div>
      <div class="actions">${has ? '<button class="cta" id="cont">Continue</button>' : ''}<button class="cta ${has ? 'ghost' : ''}" id="new">New game</button><span class="note">saved in this browser · graphics preset: ${quality.name}</span></div>
      <div class="credit">Made for <a href="https://github.com/fkfest/ElemCo.jl">ElemCo.jl</a> and <a href="https://github.com/fkfest/jlmol">jlmol</a>. Assets: Poly Haven and Quaternius (CC0), Mixamo characters via the three.js examples, Ready Player Me animations.</div>`);
    if (has) $('cont').addEventListener('click', () => { if (loadGame()) startGame(true); else startGame(false); });
    $('new').addEventListener('click', () => startGame(false));
  }
  function showMenu() {
    state = 'menu'; plainPanel();
    showOverlay(`<div class="eyebrow">Paused</div><h2>Field notes</h2>
      <div class="qlist">${QUESTS.map((q) => { const st = questDone(q) ? 'done' : (questAvailable(q) && Q[q.id] > 0 ? 'on' : 'todo'); return `<div class="qrow ${questAvailable(q) ? '' : 'locked'}"><span class="st ${st}">${st === 'done' ? '✓' : st === 'on' ? '›' : '·'}</span><div><div class="t">${q.title}</div><div class="d">${questAvailable(q) ? q.obj[Q[q.id]].replace(/<b>\{\w+\}<\/b>/g, 'some') : 'Locked: finish ' + q.needs.join(' and ') + ' first.'}</div></div></div>`; }).join('')}</div>
      <div class="eyebrow" style="margin-top:18px">Trials</div><div class="qlist">${SIDE_QUESTS.filter((s) => sqAvailable(s) || SQ[s.id] === 2).map((s) => { const st = SQ[s.id] === 2 ? 'done' : SQ[s.id] === 1 ? 'on' : 'todo'; return `<div class="qrow"><span class="st ${st}">${st === 'done' ? '✓' : st === 'on' ? '›' : '?'}</span><div><div class="t">${s.title} <span class="soft" style="font-weight:400;font-size:12px">· ${WHO[s.npc][0]}</span></div><div class="d">${st === 'done' ? s.lesson : st === 'on' ? (s.hint || 'In progress.') : 'Available: ask ' + WHO[s.npc][0] + '.'}</div></div></div>`; }).join('') || '<p class="soft">No trials open yet. Mentors offer them once you have learned their spells.</p>'}</div>
      <div class="actions"><button class="cta" id="resume">Resume</button><button class="cta ghost" id="forge">Spellbook</button><button class="cta ghost" id="lore">Grimoire</button><button class="cta ghost" id="mute">${Sfx.muted ? 'Sound off' : 'Sound on'}</button><button class="cta ghost" id="steer">Mouse steering: ${steer.on ? 'on' : 'off'}</button><button class="cta ghost" id="gfx">Graphics: ${quality.name}</button><button class="cta ghost" id="quit">Title</button></div>`);
    $('resume').addEventListener('click', resume); $('quit').addEventListener('click', showTitle); $('forge').addEventListener('click', showForge); $('lore').addEventListener('click', showLore);
    $('mute').addEventListener('click', () => { Sfx.muted = !Sfx.muted; storage('ci.muted', Sfx.muted ? '1' : '0'); $('mute').textContent = Sfx.muted ? 'Sound off' : 'Sound on'; });
    $('steer').addEventListener('click', () => { toggleSteer(); $('steer').textContent = `Mouse steering: ${steer.on ? 'on' : 'off'}`; });
    $('gfx').addEventListener('click', () => { saveGame(); const order = ['high', 'medium', 'low']; storage('ci.quality', order[(order.indexOf(quality.name) + 1) % 3]); location.reload(); });
  }
  let forgeSel = null, forgeSlot = null;   // the spell shown in the workbench, and which hotbar slot (its bound variant) is being edited; -1 = the unbound draft, null = pick automatically
  const variantSummary = (o) => { const parts = Object.entries(o || {}).filter(([k, v]) => v !== '' && v !== undefined && k !== 'extra' && k !== 'basis' && String(v) !== String(OPT_DEFAULTS[k])).map(([k, v]) => `${k}=${v}`);
    if (o && o.basis && o.basis.trim()) parts.push('basis ' + o.basis.trim()); if (o && o.extra && o.extra.trim()) parts.push(...o.extra.split('\n').map((l) => l.trim()).filter(Boolean)); return parts.join(' · ') || 'defaults'; };
  /** Tells the player when a freshly bound spell is what an active trial asks for. */
  function noteTrialFit(spellId, opts) {
    for (const sq of SIDE_QUESTS) { if (SQ[sq.id] !== 1) continue;
      if (sq.type === 'craft' ? craftSatisfied(sq) : (!anyKillCounts(sq) && castQualifies(sq, spellId, opts))) { toast(sq.type === 'craft' ? `That is what ${WHO[sq.npc][0]} asked for. Report back.` : `That spell qualifies for "${sq.title}". Cast this slot on the creature.`, 'green'); return; } }
  }
  function showForge() {
    state = 'menu'; const target = nearestEnc(20); const enc = target ? target.enc : ENCOUNTERS.water;
    if (!forgeSel || !P.unlocked.includes(forgeSel)) forgeSel = P.unlocked[P.unlocked.length - 1];
    const s = SPELLS[forgeSel], slotsOf = P.hotbar.map((h, i) => (h && h.spell === forgeSel ? i : -1)).filter((i) => i >= 0);
    if (forgeSlot !== null && forgeSlot >= 0 && !(P.hotbar[forgeSlot] && P.hotbar[forgeSlot].spell === forgeSel)) forgeSlot = null;
    if (forgeSlot === null) forgeSlot = (P.drafts && P.drafts[forgeSel]) || !slotsOf.length ? -1 : slotsOf.includes(P.activeSlot || 0) ? (P.activeSlot || 0) : slotsOf[slotsOf.length - 1];   // an unbound draft you were typing comes first
    const slot = forgeSlot, cur = slot >= 0 ? P.hotbar[slot] : null;
    const opts = cur ? { ...cur.opts } : (P.drafts && P.drafts[forgeSel]) ? { ...P.drafts[forgeSel] } : defaultOpts(forgeSel);
    const optField = (k) => { const v = opts[k] ?? OPT_DEFAULTS[k]; const help = { ms2: 'wf ms2: twice the spin projection (doublet 1, triplet 2)', nstates: 'eom nstates: how many excited states', active: 'wf active: "(electrons, orbitals)"', epsilon: 'ciphi epsilon: selection threshold, smaller is tighter', centers: '@region centres: atom indices or labels, e.g. [1, 2] or [:O1]',
      occa: 'wf occa: occupied α orbitals, e.g. 1-3+4 (orbital 4 is α-only)', occb: 'wf occb: occupied β orbitals, e.g. 1-3+5 (orbital 5 is β-only)' }[k];
      return `<label>${help}<input data-opt="${k}" value="${esc(String(v))}"></label>`; };
    el.panel.classList.add('grimoire');
    showOverlay(`<div class="eyebrow">jlmol · input builder</div><h2>Spell workbench</h2>
      <p class="soft">Pick a spell, set its options, watch the ElemCo input write itself, bind it to a hotbar slot. ${target ? `Target in range: <b>${esc(target.enc.name)}</b>.` : 'Preview molecule: water.'}</p>
      <div class="forge"><div class="list">${P.unlocked.map((id) => { const sp = SPELLS[id]; return `<div class="sp ${id === forgeSel ? 'sel' : ''}" data-id="${id}" style="--sc:${hex(sp.color)}"><img src="${sigils[id] ? sigils[id].url : ''}" alt=""><div><div class="t"><span>${sp.name}</span><span class="m">${sp.cost} mana · ${sp.scaling}</span></div><div class="d">${sp.desc}</div></div></div>`; }).join('')}</div>
      <div class="craft" style="--sc:${hex(s.color)}"><h3><img src="${sigils[forgeSel] ? sigils[forgeSel].url : ''}" alt="">${s.name}</h3><div class="soft" style="font-size:12.5px">${s.desc}</div>
      <div class="variants"><span class="soft" style="font-size:12px">${slotsOf.length ? 'Bound variants' : 'Not bound yet'}</span>${slotsOf.map((i) => `<button type="button" class="var ${i === slot ? 'sel' : ''}" data-var="${i}" title="${esc(variantSummary(P.hotbar[i].opts))}">slot ${i + 1} <span>${esc(variantSummary(P.hotbar[i].opts))}</span></button>`).join('')}<button type="button" class="var ${slot < 0 ? 'sel' : ''}" data-var="-1">${slot < 0 ? 'new draft' : '+ new variant'}</button></div>
      <div class="editing">${slot >= 0 ? `Editing <b>slot ${slot + 1}</b>: changes apply to that slot as you type.` : 'Editing an unbound draft: it is kept here until you bind it to a slot.'}</div>${(s.opts || []).map(optField).join('')}
      <label>basis (string or Dict): <input data-opt="basis" value="${esc(String(opts.basis ?? ''))}" placeholder="vdz  ·  vdz; O=avdz  ·  Dict(&quot;ao&quot;=>…)"></label>
      <label>additional settings, one group per line: <code>group key=value key=value</code><textarea data-opt="extra" rows="2" placeholder="cc maxit=100 shiftp=0.5&#10;diis maxdiis=10">${esc(String(opts.extra ?? ''))}</textarea></label>
      <div class="opthelp" id="fhelp"></div><div class="opterr" id="ferr"></div>
      <pre id="fpre" class="incant">${hl(craftInput(forgeSel, opts, enc))}</pre>
      <div class="bind"><span class="soft" style="font-size:12px">${slot >= 0 ? 'Copy to slot' : 'Bind to slot'}</span>${Array.from({ length: 9 }, (_, i) => `<button data-slot="${i}" class="${i === slot ? 'cur' : ''}">${i + 1}${P.hotbar[i] ? ' · ' + SPELLS[P.hotbar[i].spell].name : ''}</button>`).join('')}</div></div></div>
      <div class="actions"><button class="cta" id="resume">Back to the island</button><span class="note">Tab closes</span></div>`);
    el.panel.querySelectorAll('.sp').forEach((d) => d.addEventListener('click', () => { forgeSel = d.dataset.id; forgeSlot = null; showForge(); }));
    el.panel.querySelectorAll('button.var').forEach((b) => b.addEventListener('click', () => { forgeSlot = +b.dataset.var; showForge(); }));
    const inputs = el.panel.querySelectorAll('input[data-opt], textarea[data-opt]');
    const readOpts = () => { const o = {}; inputs.forEach((i) => { o[i.dataset.opt] = /^(ms2|nstates)$/.test(i.dataset.opt) ? parseInt(i.value, 10) || 0 : i.value; }); return o; };
    const refresh = () => { const o = readOpts(); $('fpre').innerHTML = hl(craftInput(forgeSel, o, enc)); const { errors } = parseExtras(o.extra); $('ferr').innerHTML = errors.map((e) => `<div>${esc(e)}</div>`).join('');
      if (slot >= 0 && P.hotbar[slot] && P.hotbar[slot].spell === forgeSel) { P.hotbar[slot].opts = o; renderHotbar(); } else { P.drafts = P.drafts || {}; P.drafts[forgeSel] = o; } saveGame(); };
    inputs.forEach((i) => i.addEventListener('input', refresh));
    $('fhelp').innerHTML = Object.entries(OPTION_CATALOG).map(([g, keys]) => `<details><summary>${g}</summary>${Object.entries(keys).map(([k, [d, ex]]) => `<button type="button" class="opt" data-ins="${g} ${k}=${esc(ex)}" title="${esc(d)}"><b>${k}</b> <span>${esc(d)}</span></button>`).join('')}</details>`).join('');
    $('fhelp').querySelectorAll('button.opt').forEach((b) => b.addEventListener('click', () => { const ta = el.panel.querySelector('textarea[data-opt]'); const [g, kv] = b.dataset.ins.split(/ (.+)/); const lines = ta.value.split('\n').filter(Boolean); const li = lines.findIndex((l) => l.trim().startsWith(g + ' ')); if (li >= 0) lines[li] = lines[li].trim() + ' ' + kv; else lines.push(g + ' ' + kv); ta.value = lines.join('\n'); refresh(); }));
    el.panel.querySelectorAll('button[data-slot]').forEach((b) => b.addEventListener('click', () => { const o = readOpts(), i = +b.dataset.slot; P.hotbar[i] = { spell: forgeSel, opts: o }; if (slot < 0 && P.drafts) delete P.drafts[forgeSel]; forgeSlot = i; renderHotbar(); Sfx.good(); toast(`${s.name} bound to slot ${i + 1}${variantSummary(o) !== 'defaults' ? ' with ' + variantSummary(o) : ''}`, 'blue'); saveGame(); showForge(); noteTrialFit(forgeSel, o); }));
    $('resume').addEventListener('click', resume);
  }
  function showLore() {
    const rows = Object.entries(P.solved), lessons = Object.entries(P.lessons);
    showOverlay(`<div class="eyebrow">Grimoire</div><h2>Inputs that converged</h2>${rows.length ? '<div class="lore">' + rows.map(([id, snip]) => `<div class="lr"><div class="t">${ENCOUNTERS[id].name} · ${ENCOUNTERS[id].formula}</div><div class="soft" style="font-size:12px;margin-top:2px">${ENCOUNTERS[id].lesson}</div><pre class="incant">${hl(snip)}</pre></div>`).join('') + '</div>' : '<p class="soft">Nothing yet. Defeat a creature with the right spell and its input is written here.</p>'}${lessons.length ? '<div class="eyebrow" style="margin-top:18px">Lessons from trials</div><div class="lore">' + lessons.map(([id, l]) => `<div class="lr"><div class="t">${sqById(id) ? sqById(id).title : id}</div><div class="soft" style="font-size:12.5px;margin-top:2px">${l}</div></div>`).join('') + '</div>' : ''}
      <div class="actions"><button class="cta" id="back">Back</button></div>`);
    $('back').addEventListener('click', showMenu);
  }
  /** Fast travel between the waystones of visited zones (the one you stand at is listed but disabled). */
  function showTravel(stone) {
    state = 'menu'; plainPanel();
    const here = stone.userData.zone;
    showOverlay(`<div class="eyebrow">Waystone</div><h2>${zoneById(here).name}</h2><p class="soft">The stones answer each other once you have stood beside them. Where to?</p>
      <div class="qlist">${ZONES.map((z) => { const ok = P.visited.includes(z.id) && z.id !== here; return `<div class="qrow ${ok ? '' : 'locked'}"><span class="st ${z.id === here ? 'on' : ok ? 'done' : 'todo'}">${z.id === here ? '›' : ok ? '✓' : '·'}</span><div><div class="t">${ok ? `<button class="link" data-zone="${z.id}">${z.name}</button>` : z.name}</div><div class="d">${z.id === here ? 'you are here' : ok ? 'travel' : 'not visited yet'}</div></div></div>`; }).join('')}</div>
      <div class="actions"><button class="cta" id="resume">Stay</button></div>`);
    el.panel.querySelectorAll('button[data-zone]').forEach((b) => b.addEventListener('click', () => { const w = waystones.find((x) => x.userData.zone === b.dataset.zone); if (!w) return;
      const zn = zoneById(b.dataset.zone); P.pos.set(w.position.x + 1.4, terrainH(w.position.x + 1.4, w.position.z + 1.0), w.position.z + 1.0); P.c.pos.copy(P.pos); P.moveTarget = null; cam.snapNext = true; cam.dragT = 0; E.burst(P.pos.clone().setY(P.pos.y + 1), 0x9fd8ff, 30, 4); Sfx.pick(); toast(`${zn.name}.`, 'blue'); saveGame(); resume(); }));
    $('resume').addEventListener('click', resume);
  }
  function showCredits() {
    state = 'menu';
    showOverlay(`<div class="eyebrow">Converged</div><h2>The island is quiet</h2><p>From the mean field to selected CI: you fitted the reference, climbed the ladder, broke open shells, saw ghosts, cut regions and starved the dragon of single-reference spells. Level ${level()}, ${P.xp} XP, ${Object.keys(P.solved).length} inputs in the grimoire.</p>
      <p class="soft">The real thing: <a href="https://elem.co.il/stable/elemco/">the ElemCo.jl documentation</a>, and <a href="https://app.jlmol.com">jlmol</a> to build inputs with a molecule viewer.</p>
      <div class="actions"><button class="cta" id="resume">Keep wandering</button><button class="cta ghost" id="quit">Title</button></div>`);
    $('resume').addEventListener('click', resume); $('quit').addEventListener('click', showTitle);
  }
  function resume() { state = 'play'; hideOverlay(); el.panel.classList.remove('grimoire'); }
  function onKey(k, e) {
    if (state === 'title') return;
    if (dialogOpen()) { input.act = input.attack = input.bolt = false; if (['e', 'enter', ' '].includes(k)) { dlgAdvance(); e.preventDefault(); } if (/^[1-4]$/.test(k)) choose(+k - 1); if (k === 'escape' && !dlg.choices.length) dlgAdvance(); return; }
    if (k === 'tab') { if (state === 'play') showForge(); else if (state === 'menu') resume(); return; }
    if (k === 'escape') { if (state === 'play') showMenu(); else if (state === 'menu') resume(); }
    if (k === 'j' && state === 'play') showMenu();
    if (k === 'c' && (state === 'play' || state === 'menu')) toggleSteer();
    if (k === 'm') { Sfx.muted = !Sfx.muted; storage('ci.muted', Sfx.muted ? '1' : '0'); toast(Sfx.muted ? 'Sound off' : 'Sound on'); }
    if (state === 'play' && /^[1-9]$/.test(k)) { input.cast = +k; P.activeSlot = +k - 1; renderHotbar(); }
    if (state === 'play' && !el.keys.classList.contains('faded') && ['w', 'a', 's', 'd'].includes(k)) setTimeout(() => el.keys.classList.add('faded'), 6000);
  }

  // ---------------- main loop
  let last = performance.now(), saveT = 0, titleT = 0;
  const _sunOffset = new THREE.Vector3();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; worldTime.value += dt;
    if (state === 'title') {
      titleT += dt; const hb = zoneById('harbor');
      camera.position.set(hb.x + Math.sin(titleT * 0.08) * 22, 9 + Math.sin(titleT * 0.05) * 2, hb.z + 2 + Math.cos(titleT * 0.08) * 22); camera.lookAt(hb.x, 3, hb.z);
      P.pos.set(hb.x, terrainH(hb.x, hb.z + 8), hb.z + 8); P.c.update(dt, {});
    } else if (state === 'play') {
      const frozen = dialogOpen();
      P.move(dt, frozen, walkable);
      P.attackCd -= dt; if (P.hurtT > 0) P.hurtT -= dt; P.mana = Math.min(maxMana(), P.mana + manaRegen() * dt);
      if (frozen) { if (input.attack || input.act) dlgAdvance(); input.attack = input.act = input.bolt = false; input.cast = 0; }
      else {
        if (P.arrived) { const a = P.arrived; P.arrived = null;
          if (a.action) { const k = a.action.kind; if (k === 'npc') input.act = true; else if (k === 'bench') showForge(); else if (k === 'door') input.act = true;
            else if (k === 'creature') { P.target = a.action.ref; const d = a.action.ref.pos.clone().sub(P.pos); P.c.heading = Math.atan2(d.x, d.z); input.attack = true; }
            else if (k === 'enemy') { const d = a.action.ref.pos.clone().sub(P.pos); P.c.heading = Math.atan2(d.x, d.z); input.attack = true; } } }
        updateHover(dt);
        if (input.attack && P.attackCd <= 0) { P.attackCd = 0.55; P.c.attackT = 0.45; Sfx.swing(); E.playerAttack(P.c.heading);
          const t = nearestEnc(2.8); if (t) { if (t.enc.nelec === 1) damageEnc(t, staffDmg() * 2.5, 0x9fb6ff); else { toast('The mean field passes through correlation. Cast a correlated spell (1–9).', ''); } } }
        if (input.cast) { cast(input.cast - 1); }
        let near = null, nd = 2.8;
        for (const n of npcList) { const d = n.pos.distanceTo(P.pos); if (d < nd) { nd = d; near = n; } }
        if (alpaca.visible && !npcs.alpaca && alpaca.position.distanceTo(P.pos) < 3) near = { alpaca: true };
        const tw = zoneById('tower'), doorD = Math.hypot(P.pos.x - tw.x, P.pos.z - (tw.z - 0.6));
        const canTower = questAvailable(QUESTS[7]) && Q.dragon === 0 && P.items.includes('key');
        const nearBench = workbench && workbench.position.distanceTo(P.pos) < 3 && Q.fitting >= 3;
        const nearStone = waystones.find((w) => w.position.distanceTo(P.pos) < 2.6);
        const nearArchive = archiveDoor && archiveDoor.position.distanceTo(P.pos) < 2.8;
        if (near && !near.alpaca) { el.prompt.textContent = `E · Talk to ${near.name}`; el.prompt.classList.add('show');
          if (input.act) { const main = MAIN_NPC.has(near.id) ? npcNode(near.id) : null; const mainOpen = main && !main.endsWith('done'); const sq = sqForNpc(near.id);
            if (mainOpen) showDialog(main); else if (sq) showDialog(sqNode(sq)); else showDialog(main ? main : { who: near.id, text: MAIN_NPC.has(near.id) ? 'Not yet. Someone else on the island needs you first. Check the quest log with J.' : 'Nothing for you today. Come back when you have learned more spells.' }); } }
        else if (canTower && doorD < 7) { el.prompt.textContent = 'E · Unlock the Tower of (T)'; el.prompt.classList.add('show'); if (input.act) showDialog('boss0'); }
        else if (nearBench) { el.prompt.textContent = 'E · Craft spells at the jlmol workbench'; el.prompt.classList.add('show'); if (input.act) showForge(); }
        else if (nearStone) { el.prompt.textContent = 'E · Waystone: travel'; el.prompt.classList.add('show'); if (input.act) showTravel(nearStone); }
        else if (nearArchive) { el.prompt.textContent = 'E · The Keeper\'s archive'; el.prompt.classList.add('show');
          if (input.act) showDialog({ who: 'keeper', text: Object.keys(P.solved).length ? `The archive. Every input that converged on this island is filed behind this door: ${Object.keys(P.solved).length} so far. Read them if you like.` : 'The archive. Every input that converges on this island is filed behind this door. Yours is still empty.', run: () => { if (Object.keys(P.solved).length) showLore(); } }); }
        else el.prompt.classList.remove('show');
        input.attack = input.act = input.bolt = false; input.cast = 0;
      }
      for (const n of npcList) { const d = n.pos.distanceTo(P.pos); n.c.root.visible = d < 90;   // skinned meshes are never frustum-culled, so hide far mentors outright
        if (d < 6) { const a = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z); n.c.heading += Math.atan2(Math.sin(a - n.c.heading), Math.cos(a - n.c.heading)) * Math.min(1, dt * 4); }
        // animation: every frame when near, every 3rd frame at 30-90 m, every 10th when hidden (the mixer and bone matrices are the cost)
        n.animAcc = (n.animAcc || 0) + dt; n.animN = (n.animN || 0) + 1; const every = d < 30 ? 1 : d < 90 ? 3 : 10;
        if (n.animN >= every) { n.c.update(n.animAcc, {}); n.animAcc = 0; n.animN = 0; }
        const q = QUESTS.find((x) => x.npc === n.id); n.mark.visible = !!q && questAvailable(q) && !questDone(q) && (Q[q.id] <= 1 || Q[q.id] === 3); n.mark.position.y = 2.6 + Math.sin(now * 0.004) * 0.12;
        const sq = n.mark.visible ? null : sqForNpc(n.id); n.mark2.visible = !!sq && (SQ[sq.id] === 1 ? sqSatisfied(sq) : true); n.mark2.position.y = n.mark.position.y; }
      E.updateEnemies(dt, frozen); E.updateBolts(dt); E.updatePickups(dt); E.updateParticles(dt); updateEncounters(dt, frozen); updateWild(dt); updateBolts(dt); cam.update(dt, P);
      if (P.target && P.target.dead) P.target = null; targetRing.visible = !!P.target; if (P.target) { targetRing.position.set(P.target.pos.x, terrainH(P.target.pos.x, P.target.pos.z) + 0.05, P.target.pos.z); targetRing.scale.setScalar(0.7 + P.target.g.userData.radius * 0.5); targetRing.rotation.z += dt; }
      const q = currentQuest(), target = objectiveTarget(q); E.setBeam(target ? target[0] : null, target ? target[1] : 0);
      updateHUD(dt, target); updateEncounterCard(dt);
      if (dlg.node && dlg.typing) { dlg.t += dt; const n = Math.min(dlg.full.length, Math.floor(dlg.t * 55)); if (n !== dlg.shown) { dlg.shown = n; el.dtext.textContent = dlg.full.slice(0, n); } if (n >= dlg.full.length) finishTyping(); }
      if (creditsPending && !dlg.node && el.overlay.hidden) { creditsPending = false; showCredits(); }
      saveT += dt; if (saveT > 15) { saveT = 0; saveGame(); }
    } else { for (const n of npcList) n.c.update(dt, {}); P.c.update(dt, {}); E.updateParticles(dt); updateEncounters(dt, true); cam.update(dt, P); }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove('show'); }
    sun.position.copy(P.pos).add(_sunOffset); sun.target.position.copy(P.pos); sun.target.updateMatrixWorld();
    renderFrame(dt);
    requestAnimationFrame(frame);
  }
  const game = { start() { showTitle(); requestAnimationFrame(frame); }, P, E, cam, Q, startGame, showTitle, spawnEncounter, encs, unlock, cast, showForge, showDialog, resume, input,
    castNow(slot) { cast(slot); for (const c of pending.slice()) resolveCast(c); }, fxTick(dt) { FX.update(dt); },
    sq: { SQ, SQP, sqForNpc, sqNode, sqSatisfied, craftSatisfied, sqSpawn, SIDE_QUESTS, D, choose, dlgAdvance, dlg }, wild: { slots: wild, tick: updateWild, rebalance: rebalanceLights }, QUESTS, keys, steer: { state: steer, toggle: toggleSteer, _setLocked: setLocked }, dlgFinish() { if (dlg.node && dlg.typing) finishTyping(); },
    mouse: { pickEntity, groundPoint, onClick, screenOf, target: () => P.target },
    goto(zoneId, dx = 0, dz = 4) { const z = zoneById(zoneId); P.pos.set(z.x + dx, terrainH(z.x + dx, z.z + dz), z.z + dz); P.c.pos.copy(P.pos); cam.dragT = 99; cam.snapNext = true; cam.update(0.05, P); },
    settle() { cam.snapNext = true; cam.update(0.05, P); P.c.update(0.05, {}); for (const n of npcList) n.c.update(0.05, {}); },
    setSunOffset(v) { _sunOffset.copy(v); }, state: () => state, setState(s) { state = s; el.hud.hidden = s !== 'play'; if (s === 'play') hideOverlay(); } };
  return game;
}
