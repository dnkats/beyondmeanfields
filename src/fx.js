// Spell visuals: procedural sigils (magic circles) shared by the UI and the world, cast runes, projectiles, impacts.
import * as THREE from 'three';

export const GLYPH = { hf: 'Φ', dfhf: 'Φ', dfmp2: 'E⁽²⁾', ccsd: 'eᵀ', dcsd: 'eᵀ', ccsdt: '(T)', svd: 'Σσ', udcsd: '↑↓', uccsdt: '↑↓(T)', eom: 'ω', mcscf: 'Ψ', fci: '|Φ⟩', ciphi: 'ε', region: '⊂' };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const FONT = '"Cinzel", "Times New Roman", serif';

/** Draws a magic circle for a spell: rings, a tier polygon, the incantation around the rim, the glyph in the middle. */
export function drawSigil(id, spell, size = 512) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d'), c = size / 2, col = hex(spell.color);
  const ring = (r, w, alpha = 1, dash = null) => { g.save(); g.globalAlpha = alpha; if (dash) g.setLineDash(dash); g.lineWidth = w * 2.4; g.strokeStyle = 'rgba(20,16,40,0.55)'; g.beginPath(); g.arc(c, c, r, 0, 6.2832); g.stroke(); g.lineWidth = w; g.strokeStyle = col; g.beginPath(); g.arc(c, c, r, 0, 6.2832); g.stroke(); g.restore(); };
  ring(c * 0.94, size * 0.014); ring(c * 0.84, size * 0.006, 0.9, [size * 0.02, size * 0.012]); ring(c * 0.58, size * 0.009); ring(c * 0.5, size * 0.004, 0.7);
  // incantation around the rim
  const text = `${spell.macro}  ·  ${spell.scaling}  ·  `; g.save(); g.translate(c, c); g.font = `700 ${size * 0.052}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const rr = c * 0.89, total = text.length * 2; let a = -Math.PI / 2;
  for (let k = 0; k < total; k++) { const ch = text[k % text.length]; g.save(); g.rotate(a); g.translate(0, -rr); g.fillStyle = 'rgba(20,16,40,0.7)'; g.fillText(ch, 1.5, 1.5); g.fillStyle = col; g.fillText(ch, 0, 0); g.restore(); a += (Math.PI * 2) / total; }
  g.restore();
  // tier polygon and vertex orbs
  const n = 3 + Math.min(4, spell.tier || 0), R = c * 0.58; g.save(); g.translate(c, c); g.lineWidth = size * 0.006; g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = size * 0.02;
  g.beginPath(); for (let k = 0; k <= n; k++) { const t = -Math.PI / 2 + k * 2 * Math.PI / n; g[k ? 'lineTo' : 'moveTo'](Math.cos(t) * R, Math.sin(t) * R); } g.stroke();
  if (n >= 4) { g.beginPath(); for (let k = 0; k <= n; k++) { const t = -Math.PI / 2 + Math.PI / n + k * 2 * Math.PI / n; g[k ? 'lineTo' : 'moveTo'](Math.cos(t) * R * 0.62, Math.sin(t) * R * 0.62); } g.stroke(); }
  for (let k = 0; k < n; k++) { const t = -Math.PI / 2 + k * 2 * Math.PI / n; g.beginPath(); g.arc(Math.cos(t) * R, Math.sin(t) * R, size * 0.018, 0, 6.2832); g.fillStyle = col; g.fill(); }
  g.restore();
  // central glyph
  g.save(); g.translate(c, c); g.font = `700 ${size * (GLYPH[id].length > 3 ? 0.13 : 0.2)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(20,16,40,0.75)'; g.fillText(GLYPH[id], 3, 4); g.shadowColor = col; g.shadowBlur = size * 0.05; g.fillStyle = '#ffffff'; g.fillText(GLYPH[id], 0, 0); g.fillStyle = col; g.globalAlpha = 0.55; g.fillText(GLYPH[id], 0, 0); g.restore();
  return cv;
}
export async function buildSigils(SPELLS) {
  try { await document.fonts.load(`700 40px ${FONT}`); } catch (e) { /* fallback font */ }
  const out = {};
  for (const [id, s] of Object.entries(SPELLS)) { const cv = drawSigil(id, s); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; out[id] = { tex, url: cv.toDataURL('image/png'), color: s.color }; }
  return out;
}
function glowText(text, color, px = 72, weight = 700) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; const g = cv.getContext('2d');
  g.font = `${weight} ${px}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = color; g.shadowBlur = 28; g.lineWidth = 8; g.strokeStyle = 'rgba(20,16,40,0.85)'; g.strokeText(text, 512, 128);
  g.fillStyle = '#ffffff'; g.fillText(text, 512, 128); g.shadowBlur = 0; g.fillStyle = color; g.globalAlpha = 0.5; g.fillText(text, 512, 128);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

export function createFX(scene, sigils, burst, lights) {
  const lamp = (color, intensity, distance) => lights ? lights.acquire(color, intensity, distance) : null;
  const lampOff = (l) => { if (l && lights) lights.release(l); };
  const live = [];   // { g, t, life, update(dt, k) }
  const spriteMat = (tex, color, opacity = 1) => new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, opacity });
  const ringGeo = new THREE.TorusGeometry(1, 0.045, 10, 48), sphereGeo = new THREE.SphereGeometry(1, 16, 12);
  function add(g, life, update) { scene.add(g); live.push({ g, t: 0, life, update }); return g; }
  const FX = {
    /** rune circle under the caster */
    castRune(pos, id) {
      const s = sigils[id]; if (!s) return;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9), new THREE.MeshBasicMaterial({ map: s.tex, transparent: true, depthWrite: false, opacity: 0.95 }));
      plane.rotation.x = -Math.PI / 2; plane.position.set(pos.x, pos.y + 0.06, pos.z);
      const light = lamp(s.color, 30, 7); if (light) light.position.set(pos.x, pos.y + 1.2, pos.z);
      const g = new THREE.Group(); g.add(plane); g.userData.light = light;
      add(g, 1.5, (dt, k) => { plane.rotation.z += dt * 1.4; const sc = k < 0.15 ? 0.3 + 0.7 * (k / 0.15) : 1 + 0.15 * (k - 0.15); plane.scale.setScalar(sc); plane.material.opacity = k > 0.6 ? (1 - k) / 0.4 : 0.95; if (light) light.intensity = 30 * (k < 0.2 ? k / 0.2 : (1 - k) / 0.8); });
    },
    /** projectile that carries the sigil; resolves onArrive when it reaches the target */
    projectile(from, target, id, onArrive) {
      const s = sigils[id]; const g = new THREE.Group(); g.position.copy(from);
      const core = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffffff })); core.scale.setScalar(0.12); g.add(core);
      const sig = new THREE.Sprite(spriteMat(s.tex, 0xffffff, 0.95)); sig.scale.setScalar(1.1); g.add(sig);
      const orbs = []; for (let i = 0; i < 3; i++) { const o = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: s.color })); o.scale.setScalar(0.07); g.add(o); orbs.push(o); }
      const light = lamp(s.color, 18, 7); if (light) g.add(light); g.userData.light = light;
      let done = false;
      add(g, 4, (dt, k, t) => {
        sig.material.rotation += dt * 3;
        orbs.forEach((o, i) => { const a = t * 7 + i * 2.094; o.position.set(Math.cos(a) * 0.38, Math.sin(a * 1.3) * 0.2, Math.sin(a) * 0.38); });
        burst(g.position.clone(), s.color, 2, 0.8);
        const tp = target.pos.clone(); tp.y = target.pos.y; const d = tp.sub(g.position), dist = d.length();
        if (!done && (dist < 0.7 || target.dead)) { done = true; onArrive(); return true; }
        g.position.addScaledVector(d.normalize(), Math.min(dist, 13 * dt));
      });
    },
    /** impact flash: sigil bloom, shockwave ring, rising incantation */
    impact(pos, id, result, macro) {
      const s = sigils[id]; const good = ['best', 'ok', 'modifier'].includes(result), weak = result === 'weak';
      const color = good ? s.color : weak ? 0xb9b9c9 : 0x555566;
      const g = new THREE.Group(); g.position.copy(pos);
      const flash = new THREE.Sprite(spriteMat(s.tex, good ? 0xffffff : 0x9a9aa8, 0.95)); flash.scale.setScalar(0.6); g.add(flash);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.4; g.add(ring);
      const light = lamp(color, good ? 60 : 10, 10); if (light) g.add(light); g.userData.light = light;
      const labelTex = glowText(macro, hex(color)); g.userData.disposeTex = labelTex;
      const label = new THREE.Sprite(spriteMat(labelTex, 0xffffff, 1)); label.scale.set(3.4, 0.85, 1); label.position.y = 1.2; g.add(label);
      burst(pos.clone(), color, good ? 44 : 14, good ? 6 : 2.5);
      add(g, 1.6, (dt, k) => { flash.scale.setScalar(0.6 + 3.6 * Math.min(1, k * 2.2)); flash.material.opacity = Math.max(0, 1 - k * 1.6); flash.material.rotation += dt * 2;
        const rs = 0.4 + 6 * Math.min(1, k * 1.6); ring.scale.setScalar(rs); ring.material.opacity = Math.max(0, 0.9 - k * 1.5); if (light) light.intensity = (good ? 60 : 10) * Math.max(0, 1 - k * 2.5);
        label.position.y = 1.2 + k * 1.4; label.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3; });
    },
    /** small ring where the player clicked to walk */
    clickMarker(pos) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, pos.y + 0.06, pos.z);
      add(ring, 0.7, (dt, k) => { ring.scale.setScalar(1 + k * 1.6); ring.material.opacity = 0.9 * (1 - k); });
    },
    /** backfire: red burst at the caster */
    backfire(pos) { const g = new THREE.Group(); g.position.copy(pos); const light = lamp(0xff3020, 80, 9); if (light) { light.position.y = 1.2; g.add(light); } g.userData.light = light;
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff4a30, transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
      burst(pos.clone().setY(pos.y + 1), 0xff4a30, 40, 7);
      add(g, 0.9, (dt, k) => { ring.scale.setScalar(0.3 + 5 * k); ring.material.opacity = 0.9 * (1 - k); if (light) light.intensity = 80 * (1 - k); }); },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) { const f = live[i]; f.t += dt; const k = f.t / f.life; const stop = f.update(dt, k, f.t);
        if (stop || f.t >= f.life) { lampOff(f.g.userData.light); scene.remove(f.g); if (f.g.userData.disposeTex) f.g.userData.disposeTex.dispose(); f.g.traverse((o) => { if (o.material && !o.isPointLight && o.material.map === undefined) o.material.dispose(); }); live.splice(i, 1); } }
    },
  };
  return FX;
}
