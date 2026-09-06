// Molecule creatures: ball-and-stick models with an aura that tells what kind of correlation they carry.
import * as THREE from 'three';

const CPK = { H: 0xf1f1f1, He: 0xd9ffff, Li: 0x9558b2, Be: 0xc2ff00, C: 0x3a3f4a, N: 0x3563d8, O: 0xd63b2f, F: 0x90e050 };
const RAD = { H: 0.28, He: 0.3, Li: 0.5, Be: 0.46, C: 0.42, N: 0.4, O: 0.4, F: 0.38 };
const COV = { H: 0.31, He: 0.28, Li: 1.28, Be: 0.96, C: 0.76, N: 0.71, O: 0.66, F: 0.57 };
const AURA = { wisp: 0xbfd0ff, dynamic: 0x5fd88a, static: 0xa25be0, open: 0xff5a4a, excited: 0xe6e0ff, large: 0xffb347 };
const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
const UP = new THREE.Vector3(0, 1, 0);
const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();

/** Builds the creature model. Scale: 0.55 world units per ångström, floating at eye height, rotating slowly. */
export function moleculeModel(enc, lights = null) {
  const g = new THREE.Group(), body = new THREE.Group(), S = enc.size >= 4 ? 0.42 : enc.size === 3 ? 0.6 : 0.9;
  const auraColor = new THREE.Color(AURA[enc.kind] || AURA.dynamic), ghost = enc.kind === 'excited';
  const atoms = enc.atoms.map(([el, x, y, z]) => ({ el, p: new THREE.Vector3(x, y, z).multiplyScalar(S) }));
  const centre = atoms.reduce((c, a) => c.add(a.p), new THREE.Vector3()).multiplyScalar(1 / atoms.length); atoms.forEach((a) => a.p.sub(centre));
  const mats = {};
  const mat = (el) => mats[el] || (mats[el] = new THREE.MeshPhysicalMaterial({ color: CPK[el] || 0x888888, roughness: 0.3, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.25,
    emissive: auraColor, emissiveIntensity: enc.kind === 'static' ? 0.25 : 0.12, transparent: ghost, opacity: ghost ? 0.45 : 1 }));
  for (const a of atoms) { const m = new THREE.Mesh(sphereGeo, mat(a.el)); m.position.copy(a.p); m.scale.setScalar((RAD[a.el] || 0.4) * S); m.castShadow = !ghost; body.add(m); }
  const bondMat = new THREE.MeshStandardMaterial({ color: 0xb7bccb, roughness: 0.5, metalness: 0.3, transparent: ghost, opacity: ghost ? 0.4 : 1 });
  for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
    const a = atoms[i], b = atoms[j], d = a.p.distanceTo(b.p);
    if (d < (COV[a.el] + COV[b.el]) * 1.3 * S) { const c = new THREE.Mesh(cylGeo, bondMat); c.position.copy(a.p).add(b.p).multiplyScalar(0.5); c.scale.set(0.07 * S / 0.55, d, 0.07 * S / 0.55); c.quaternion.setFromUnitVectors(UP, b.p.clone().sub(a.p).normalize()); c.castShadow = !ghost; body.add(c); }
  }
  body.rotation.set(0.5, 0.3, 0.2);
  const radius = Math.max(0.6, ...atoms.map((a) => a.p.length())) + 0.4;
  g.add(body);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: auraColor, transparent: true, depthWrite: false, opacity: enc.boss ? 0.85 : 0.5 }));
  aura.scale.setScalar(radius * 3.2); g.add(aura);
  const light = lights ? lights.acquire(auraColor, enc.boss ? 40 : 10, radius * 6) : null; if (light) g.add(light);
  g.userData = { body, aura, light, radius, hover: 1.3 + radius * 0.6, baseLight: enc.boss ? 40 : 10 };
  return g;
}
export function animateMolecule(g, dt, t, agitation = 0) {
  const u = g.userData; u.body.rotation.y += dt * (0.5 + agitation * 2); u.body.rotation.x += dt * 0.17;
  g.position.y = u.baseY + u.hover + Math.sin(t * 1.3) * 0.15;
  u.aura.material.opacity = 0.45 + 0.2 * Math.sin(t * 3) + agitation * 0.3;
  if (u.light) u.light.intensity = (u.baseLight || 10) * (0.8 + 0.4 * Math.sin(t * 2.7));
}
export function flashMolecule(g, color) { g.userData.body.traverse((o) => { if (o.isMesh && o.material.emissive) { o.material.emissiveIntensity = 1.6; o.material.emissive.set(color); } }); }
export function coolMolecule(g, dt) { g.userData.body.traverse((o) => { if (o.isMesh && o.material.emissive && o.material.emissiveIntensity > 0.25) o.material.emissiveIntensity = Math.max(0.15, o.material.emissiveIntensity - dt * 3); }); }
