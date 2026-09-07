// Downloads the CC0 / freely licensed assets used by Beyond Mean Fields into public/assets.
//   node scripts/fetch-assets.mjs            # everything
//   node scripts/fetch-assets.mjs --only models
// Sources: Poly Haven (CC0), three.js examples (MIT / Mixamo), Ready Player Me animation library, Simon Dev tutorial repo (Mixamo),
// Quaternius Stylized Nature MegaKit (CC0, itch.io) into sources/quaternius (converted by scripts/convert-kit.mjs).
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = new URL('../public/assets/', import.meta.url).pathname;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

export const MANIFEST = {
  hdri: ['kloofendal_48d_partly_cloudy_puresky'],
  textures: ['aerial_grass_rock', 'forest_floor', 'brown_mud_leaves_01', 'coast_sand_01', 'cliff_side', 'gravel_floor', 'cobblestone_floor_01',
    'plastered_wall_02', 'white_stucco', 'brown_planks_09', 'clay_roof_tiles_02', 'reed_roof_03', 'dark_wood', 'roof_slates_02', 'castle_brick_02_red', 'rocky_gravel', 'pine_bark'],
  models: ['grass_medium_01', 'grass_medium_02', 'tree_stump_01',   // trees, shrubs, ferns and flowers come from the Quaternius kit (KITS below)
    'boulder_01', 'rock_moss_set_01', 'namaqualand_boulder_02', 'coast_rocks_02', 'stone_01', 'rock_face_01', 'coastal_cliff_02',
    'modular_wooden_pier', 'ship_pinnace', 'wooden_barrels_01', 'wine_barrel_01', 'wooden_crate_01', 'wooden_bucket_01', 'wooden_lantern_01', 'Lantern_01', 'street_lamp_01',
    'treasure_chest', 'stone_fire_pit', 'modular_fort_01', 'large_castle_door', 'WoodenTable_01', 'wooden_stool_01', 'painted_wooden_bench', 'planter_box_01', 'wooden_ladder',
    'chemistry_set', 'bunsen_burner', 'vintage_microscope', 'book_encyclopedia_set_01', 'cannon_01', 'garden_gnome'],
  files: [
    ['https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/waternormals.jpg', 'textures/waternormals.jpg'],
    // Mixamo FBX sources for scripts/fbx2glb.mjs (the game loads the converted .glb)
    ['https://raw.githubusercontent.com/simondevyoutube/ThreeJS_Tutorial_ThirdPersonCamera/main/resources/zombie/mremireh_o_desbiens.fbx', '../../sources/characters/mremireh.fbx'],
    ['https://raw.githubusercontent.com/simondevyoutube/ThreeJS_Tutorial_ThirdPersonCamera/main/resources/zombie/idle.fbx', '../../sources/characters/mremireh_idle.fbx'],
    ['https://raw.githubusercontent.com/simondevyoutube/ThreeJS_Tutorial_ThirdPersonCamera/main/resources/zombie/walk.fbx', '../../sources/characters/mremireh_walk.fbx'],
    ['https://cdn.jsdelivr.net/gh/simondevyoutube/ThreeJS_Tutorial_CharacterController@main/resources/dancer/girl.fbx', '../../sources/characters/girl.fbx'],
    ['https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb', 'characters/RobotExpressive.glb'],
  ],
};

/** itch.io pay-what-you-want download without an account: the page's csrf token, then download_url, then the file's signed link. */
async function fetchItch(game, fileId, outZip) {
  try { if ((await stat(outZip)).size > 0) return 'cached'; } catch (e) {}
  const page = await fetch(game); const cookie = (page.headers.get('set-cookie') || '').split(';')[0]; const html = await page.text();
  const csrf = (html.match(/csrf_token" value="([^"]+)/) || [])[1]; if (!csrf) throw new Error('itch: no csrf token');
  const post = (url) => fetch(url, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: `csrf_token=${encodeURIComponent(csrf)}` }).then((r) => r.json());
  const { url } = await post(`${game}/download_url`); const key = (url.match(/download\/([^/?]+)/) || [])[1];
  const file = await post(`${game}/file/${fileId}?key=${key}`); if (!file.url) throw new Error('itch: no file url');
  await mkdir(dirname(outZip), { recursive: true }); await writeFile(outZip, Buffer.from(await (await fetch(file.url)).arrayBuffer())); return 'ok';
}
export const KITS = [{ game: 'https://quaternius.itch.io/stylized-nature-megakit', fileId: 11055123, zip: 'sources/quaternius_megakit.zip', dir: 'sources/quaternius' }];
const api = (id) => fetch(`https://api.polyhaven.com/files/${id}`).then((r) => { if (!r.ok) throw new Error(`api ${id} ${r.status}`); return r.json(); });
async function download(url, rel) {
  const out = join(ROOT, rel);
  try { const s = await stat(out); if (s.size > 0) return 'cached'; } catch (e) {}
  await mkdir(dirname(out), { recursive: true });
  let lastErr = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(180000) }); if (!r.ok) throw new Error(`${r.status} ${url}`);
      await writeFile(out, Buffer.from(await r.arrayBuffer())); return 'ok'; }
    catch (e) { lastErr = e; await new Promise((res) => setTimeout(res, 1500 * attempt)); }
  }
  throw lastErr;
}
async function pool(items, n, fn) { const q = [...items]; const workers = Array.from({ length: n }, async () => { while (q.length) { const it = q.shift(); try { await fn(it); } catch (e) { console.error('FAIL', it, e.message); } } }); await Promise.all(workers); }

async function fetchModel(id) {
  const f = await api(id), g = f.gltf && (f.gltf['1k'] || f.gltf[Object.keys(f.gltf)[0]]);
  if (!g) { console.error('no gltf for', id); return; }
  const dir = `models/${id}/`;
  await download(g.gltf.url, dir + `${id}.gltf`);
  for (const [rel, info] of Object.entries(g.gltf.include || {})) await download(info.url, dir + rel);
  console.log('model', id);
}
async function fetchTexture(id) {
  const f = await api(id);
  for (const key of ['Diffuse', 'nor_gl', 'arm', 'Displacement']) {
    const m = f[key] && f[key]['1k'] && f[key]['1k'].jpg; if (!m) continue;
    await download(m.url, `textures/${id}/${key.toLowerCase()}.jpg`);
  }
  console.log('texture', id);
}
async function fetchHdri(id) {
  const f = await api(id), h = f.hdri['2k'].hdr; await download(h.url, `hdri/${id}_2k.hdr`); console.log('hdri', id);
}
const run = async (key, fn) => { if (only && only !== key) return; await pool(MANIFEST[key], 4, fn); };
await run('hdri', fetchHdri);
await run('textures', fetchTexture);
await run('models', fetchModel);
if (!only || only === 'files') await pool(MANIFEST.files, 3, async ([url, rel]) => { await download(url, rel); console.log('file', rel); });
if (!only || only === 'kits') for (const k of KITS) { const zip = new URL('../' + k.zip, import.meta.url).pathname, dir = new URL('../' + k.dir, import.meta.url).pathname;
  try { console.log('kit', k.game, await fetchItch(k.game, k.fileId, zip)); execSync(`unzip -q -o "${zip}" -d "${dir}"`); } catch (e) { console.error('FAIL kit', k.game, e.message); } }
await writeFile(join(ROOT, 'LICENSES.md'), `# Asset licenses\n\n- Poly Haven models, textures and HDRI (public/assets/models, textures, hdri): CC0, https://polyhaven.com/license\n- q_*.glb models (trees, bushes, ferns, flowers, grass, rocks): Quaternius Stylized Nature MegaKit, CC0, https://quaternius.itch.io/stylized-nature-megakit\n- Soldier.glb, Michelle.glb, Xbot.glb, readyplayer.me.glb, kira.glb, waternormals.jpg: from the three.js examples (MIT; Soldier/Michelle/Xbot are Mixamo characters, usable under the Adobe Mixamo terms)\n- Ready Player Me animation clips (M_*/F_*.glb): https://github.com/readyplayerme/animation-library (see its LICENSE)\n- mremireh.glb (converted from mremireh_o_desbiens.fbx and its clips): Mixamo character and animations, mirrored from github.com/simondevyoutube (Adobe Mixamo terms)\n- girl.glb (converted from girl.fbx): Mixamo character redistributed in SimonDev's ThreeJS_Tutorial_CharacterController repository; Adobe Mixamo terms apply\n- RobotExpressive.glb: by Tomás Laulhé, CC0, via the three.js examples\n`);
console.log('done');
