// Multi-view screenshot tool: one browser session, several camera setups.
//   node scripts/shots.mjs title harbor bazaar forest tower
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const VIEWS = {
  title:  { setup: '', wait: 3000, dom: true },
  harbor: { setup: "__dbg.goto('harbor', 0, 6); __dbg.cam(0.4, 0.28, 7)", wait: 3500 },
  bazaar: { setup: "__dbg.goto('bazaar', 0, 8); __dbg.cam(0.2, 0.3, 8)", wait: 3500 },
  fields: { setup: "__dbg.goto('fields', 0, 6); __dbg.cam(-0.5, 0.3, 8)", wait: 3500 },
  forest: { setup: "__dbg.goto('forest', 2, 6); __dbg.cam(0.3, 0.25, 7)", wait: 3500 },
  caves:  { setup: "__dbg.goto('caves', -3, 8); __dbg.cam(-0.4, 0.3, 8)", wait: 3500 },
  ridge:  { setup: "__dbg.goto('ridge', 0, 8); __dbg.cam(0, 0.35, 9)", wait: 3500 },
  tower:  { setup: "__dbg.goto('tower', 0, 9); __dbg.cam(0, 0.3, 10)", wait: 3500 },
  closeup:{ setup: "__dbg.goto('harbor', 0, 6); __dbg.cam(2.6, 0.15, 3.2)", wait: 3500 },
  encounter: { setup: "__dbg.goto('forest', 0, 4); __dbg.game.unlock(['dfmp2','ccsd','dcsd','ccsdt']); __dbg.game.P.items.push('jkfit','mpfit'); __dbg.game.spawnEncounter('n2eq', 'forest', 0, -3, 't'); __dbg.game.spawnEncounter('benzene', 'forest', 5, -4, 't'); __dbg.cam(0.25, 0.22, 6)", wait: 3500, dom: true },
  cast: { setup: "__dbg.goto('forest', 0, 4); __dbg.game.unlock(['dfmp2','ccsd','dcsd','ccsdt']); __dbg.game.P.items.push('jkfit','mpfit'); __dbg.game.spawnEncounter('n2eq', 'forest', 0, -3, 't'); __dbg.cam(0.25, 0.22, 6); __dbg.game.castNow(0); window.__r1 = document.getElementById('encres').textContent; __dbg.game.castNow(3); window.__r2 = document.getElementById('encres').textContent", wait: 2500, dom: true, probe: "'MP2 -> ' + window.__r1 + ' || (T) -> ' + window.__r2 + ' | hp ' + document.getElementById('enchp').style.width + ' | mana ' + document.getElementById('manaval').textContent" },
  forge: { setup: "__dbg.goto('bazaar', -2, 8); __dbg.game.unlock(['dfmp2','ccsd','dcsd','udcsd','eom','ciphi','region']); __dbg.game.showForge()", wait: 2500, dom: true, probe: "document.getElementById('fpre') ? document.getElementById('fpre').textContent.slice(0, 300) : 'no forge'" },
  spellcast: { setup: "__dbg.goto('harbor', 4, 2); __dbg.game.unlock(['dfmp2','ccsd','dcsd','ccsdt','eom','ciphi']); __dbg.game.P.items.push('jkfit','mpfit'); __dbg.game.spawnEncounter('water', 'harbor', 4, -5, 't'); __dbg.cam(0.5, 0.3, 6.5); __dbg.game.cast(2); __dbg.game.fxTick(0.35); __dbg.game.fxTick(0.3)", wait: 800, dom: true },
  spellhit: { setup: "__dbg.goto('harbor', 4, 2); __dbg.game.unlock(['dfmp2','ccsd','dcsd','ccsdt']); __dbg.game.P.items.push('jkfit','mpfit'); __dbg.game.spawnEncounter('n2eq', 'harbor', 4, -4, 't'); __dbg.cam(0.4, 0.28, 6); __dbg.game.castNow(3); __dbg.game.fxTick(0.3)", wait: 800, dom: true },
  trial: { setup: "__dbg.goto('harbor', 6, 7); __dbg.game.Q.prologue = 4; __dbg.game.Q.fitting = 4; __dbg.cam(0.4, 0.25, 5); const sq = __dbg.game.sq.sqForNpc('pim'); __dbg.game.showDialog(__dbg.game.sq.sqNode(sq)); __dbg.game.dlgFinish()", wait: 1500, dom: true },
  npc_cluster: { setup: "__dbg.goto('forest', 0.4, 1.7); __dbg.game.P.c.heading = Math.PI; __dbg.cam(-0.75, 0.08, 2.6)", wait: 2500, dom: true },
  npc_scan: { setup: "__dbg.goto('harbor', 10.6, 7.4); __dbg.game.P.c.heading = Math.PI; __dbg.cam(-0.55, 0.1, 3.4)", wait: 2500, dom: true },
  rock: { setup: "__dbg.goto('caves', 0, 4); const P = __dbg.game.P; const F = __dbg.COLLIDERS.fields.filter((e) => e.f.top * e.k > 0.8 && e.f.top * e.k < 1.4 && e.f.nx < 12 && __dbg.walkable(e.x, e.z)); const e = F.sort((a, b) => Math.hypot(a.x - 46, a.z - 12) - Math.hypot(b.x - 46, b.z - 12))[0]; P.pos.set(e.x, __dbg.surfaceH(e.x, e.z), e.z); P.c.pos.copy(P.pos); P.onGround = true; window.__rock = { x: e.x, z: e.z, above: __dbg.surfaceH(e.x, e.z) - __dbg.terrainH(e.x, e.z) }; __dbg.cam(0.6, 0.18, 4.5)", wait: 2500, probe: "JSON.stringify(window.__rock) + ' feet above terrain ' + (__dbg.game.P.pos.y - __dbg.terrainH(__dbg.game.P.pos.x, __dbg.game.P.pos.z)).toFixed(2)" },
  steer: { setup: "__dbg.goto('harbor', 4, 2); __dbg.game.steer._setLocked(true); __dbg.cam(0.3, 0.25, 6)", wait: 1500, dom: true, probe: "'crosshair hidden: ' + document.getElementById('crosshair').hidden + ' manual: ' + __dbg.game.cam.manual" },
  forge2: { setup: "__dbg.goto('bazaar', -2, 8); __dbg.game.unlock(['dfmp2','ccsd','dcsd']); __dbg.game.P.hotbar[2] = { spell: 'dcsd', opts: { extra: 'cc maxit=100 shiftp=0.5\\ndiis maxdiis=10', basis: 'vdz; O=avdz' } }; __dbg.game.showForge(); setTimeout(() => { const d = document.querySelector('.opthelp details'); if (d) d.open = true; }, 100)", wait: 1500, dom: true },
  bazaarbench: { setup: "__dbg.goto('bazaar', -2, 8); __dbg.cam(0, 0.3, 6)", wait: 3000 },
  vista:  { setup: "__dbg.goto('bazaar', 0, 2); __dbg.cam(3.14, 0.5, 12)", wait: 3500 },
  panorama: { setup: "__dbg.goto('harbor', 0, 6); __dbg.freeCam(10, 30, 120, -10, 2, -30)", wait: 3500 },   // the whole island from the sea off the harbour: far trees are impostors
  impostors: { setup: "__dbg.quality.lodNear = 3; __dbg.quality.lodFar = 4; __dbg.goto('forest', 2, 6); __dbg.freeCam(-36 + 14, 4, -30 + 22, -36, 5, -30)", wait: 2500 },   // every tree beyond 4 m is an impostor
  impostors_mesh: { setup: "__dbg.quality.lodNear = 300; __dbg.quality.lodFar = 400; __dbg.goto('forest', 2, 6); __dbg.freeCam(-36 + 14, 4, -30 + 22, -36, 5, -30)", wait: 2500 },   // the same view with full meshes, for comparison
  atlas: { setup: "__dbg.goto('tower', 0, 9); __dbg.freeCam(0, 40, -60, 0, 40, -120); window.__atlas = __dbg.showAtlas(process_env_ATLAS)".replace('process_env_ATLAS', JSON.stringify(process.env.ATLAS || 'fir_sapling_medium')), wait: 1500, probe: 'window.__atlas' },
  lagoon: { setup: "__dbg.goto('lagoon', 0, 8); __dbg.cam(0.3, 0.3, 9)", wait: 3000 },
  marsh:  { setup: "__dbg.goto('marsh', 0, 8); __dbg.cam(-0.3, 0.3, 9)", wait: 3000 },
  cape:   { setup: "__dbg.goto('cape', 0, 8); __dbg.cam(0.2, 0.28, 10)", wait: 3000 },
  island: { setup: "__dbg.goto('harbor', 0, 6); __dbg.freeCam(20, 70, 190, -10, 0, -20)", wait: 3000 },   // the whole island from high above the harbour
  // eye-level views (1.7 m above the ground) to check that props and vegetation sit on the terrain
  eye_harbor: { setup: "const z = __dbg.game.QUESTS && [0, 58]; __dbg.goto('harbor', 0, 6); __dbg.freeCam(-10, __dbg.terrainH(-10, 52) + 1.7, 52, 6, __dbg.terrainH(6, 60) + 1.2, 60)", wait: 2500 },
  eye_bazaar: { setup: "__dbg.goto('bazaar', 0, 2); __dbg.freeCam(12, __dbg.terrainH(12, 14) + 1.7, 14, -4, __dbg.terrainH(-4, 6) + 1.0, 6)", wait: 2500 },
  eye_fields: { setup: "__dbg.goto('fields', 0, 6); __dbg.freeCam(-32, __dbg.terrainH(-32, 30) + 1.7, 30, -50, __dbg.terrainH(-50, 20) + 1.0, 20)", wait: 2500 },
  eye_forest: { setup: "__dbg.goto('forest', 2, 6); __dbg.freeCam(-24, __dbg.terrainH(-24, -22) + 1.7, -22, -40, __dbg.terrainH(-40, -32) + 1.0, -32)", wait: 2500 },
  eye_wild: { setup: "__dbg.goto('bazaar', 0, 2); __dbg.freeCam(-20, __dbg.terrainH(-20, -5) + 1.7, -5, -60, __dbg.terrainH(-60, 10) + 1.0, 10)", wait: 2500 },
  eye_cape: { setup: "__dbg.goto('cape', 0, 8); __dbg.freeCam(-44, __dbg.terrainH(-44, 46) + 1.7, 46, -60, __dbg.terrainH(-60, 56) + 1.0, 56)", wait: 2500 },
  eye_sea: { setup: "__dbg.goto('harbor', 0, 6); __dbg.freeCam(10, __dbg.terrainH(10, 96) + 2.0, 96, 4, 1.0, 66)", wait: 2500 },   // the harbour seen from the sea side
  eye_far: { setup: "__dbg.goto('bazaar', 0, 2); __dbg.freeCam(2, __dbg.terrainH(2, 20) + 1.7, 20, 0, 3.0, -60)", wait: 2500 },   // from the bazaar toward the tower: mid trees are LOD meshes, far ones impostors
  treeline: { setup: "__dbg.goto('bazaar', 0, 2); __dbg.freeCam(2, 6, 30, -36, 6, -30)", wait: 3500 },   // the forest from the bazaar, 60-90 m away: LOD meshes and impostors side by side
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['title', 'harbor'];
mkdirSync('shots', { recursive: true });
const server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const GL = process.env.GL || 'llvmpipe';   // llvmpipe (Mesa, multi-threaded) is much faster than SwiftShader for readback
const browser = await chromium.launch({ args: GL === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : GL === 'egl' ? ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });   // GL=egl: the real GPU through EGL (works headless on NVIDIA/Mesa without an X display)
const Q = process.env.Q || 'low', W = parseInt(process.env.W || '1280', 10), H = parseInt(process.env.H || '720', 10);
const page = await browser.newPage({ viewport: { width: W, height: H } });
const seen = new Set();
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) { const t = m.text().slice(0, 240); if (!seen.has(t)) { seen.add(t); console.log('[browser]', m.type(), t); } } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5199/?q=${Q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
const t0 = Date.now();
try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 }); console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's'); } catch (e) { console.log('ready flag timeout'); }
try { const ft = await page.evaluate(() => window.__dbg.frameTime()); console.log('frame time', ft.toFixed(0), 'ms'); } catch (e) { console.log('frameTime failed', e.message); }
for (const n of names) {
  const v = VIEWS[n]; if (!v) { console.log('unknown view', n); continue; }
  if (v.setup) { try { await page.evaluate(v.setup); } catch (e) { console.log('setup error', n, e.message); } }
  await page.waitForTimeout(v.wait);
  const ts = Date.now();
  if (v.dom || process.env.DOM) { try { await page.evaluate(() => window.__dbg.snapshot()); await page.screenshot({ path: `shots/${n}.png`, timeout: 240000 }); } catch (e) { console.log('dom screenshot failed, falling back:', e.message.split('\n')[0]); const dataUrl = await page.evaluate(() => window.__dbg.snapshot()); writeFileSync(`shots/${n}.png`, Buffer.from(dataUrl.split(',')[1], 'base64')); } }
  else { const dataUrl = await page.evaluate(() => window.__dbg.snapshot()); writeFileSync(`shots/${n}.png`, Buffer.from(dataUrl.split(',')[1], 'base64')); }
  console.log('saved shots/' + n + '.png', ((Date.now() - ts) / 1000).toFixed(1) + 's');
  if (process.env.INFO) { try { console.log('info', n, ':', await page.evaluate(() => { const r = window.__dbg.renderer; r.info.autoReset = false; window.__dbg.frameTime(); r.info.reset(); const ms = window.__dbg.frameTime(); const i = r.info.render; r.info.autoReset = true; return `calls ${i.calls} tris ${i.triangles} frame ${ms.toFixed(1)} ms programs ${r.info.programs.length}`; })); } catch (e) { console.log('info failed', e.message); } }
  if (v.probe) { try { console.log('probe', n, ':', await page.evaluate(v.probe)); } catch (e) { console.log('probe failed', e.message); } }
}
const info = await page.evaluate(() => (window.__dbg && window.__dbg.renderer) ? JSON.stringify(window.__dbg.renderer.info.render) + ' ' + JSON.stringify({ geometries: window.__dbg.renderer.info.memory.geometries, textures: window.__dbg.renderer.info.memory.textures }) : 'no dbg').catch(() => '');
console.log('render info', info);
await browser.close(); await server.close();
