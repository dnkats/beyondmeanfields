// Decimates the Poly Haven source meshes to game budgets and shrinks textures; writes <name>/<name>.glb next to the source.
//   node scripts/optimize-models.mjs            # all models in the budget table
//   node scripts/optimize-models.mjs pine_tree_01 shrub_01
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, textureCompress, flatten, join } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { existsSync, statSync, readFileSync } from 'node:fs';

const ROOT = new URL('../public/assets/models/', import.meta.url).pathname;
// target triangle counts (approximate) and texture size
export const BUDGET = {
  pine_tree_01: [45000, 1024], fir_tree_01: [45000, 1024], jacaranda_tree: [45000, 1024], tree_small_02: [40000, 1024], island_tree_01: [40000, 1024], island_tree_02: [36000, 1024],
  fir_sapling_medium: [50000, 1024], pine_sapling_small: [22000, 1024], shrub_01: [3500, 512], shrub_03: [3000, 512], fern_02: [3000, 512], grass_medium_01: [700, 512], grass_medium_02: [500, 512], flower_gazania: [2500, 512],
  dead_tree_trunk: [5000, 512], tree_stump_01: [4000, 512], boulder_01: [9000, 1024], rock_moss_set_01: [12000, 1024], namaqualand_boulder_02: [8000, 1024], coast_rocks_02: [16000, 1024], stone_01: [1500, 512],
  rock_face_01: [12000, 1024], coastal_cliff_02: [60000, 1024], modular_wooden_pier: [10000, 1024], ship_pinnace: [40000, 1024], wooden_barrels_01: [4000, 512], wine_barrel_01: [3000, 512],
  wooden_crate_01: [1500, 512], wooden_bucket_01: [1200, 512], wooden_lantern_01: [2500, 512], Lantern_01: [3000, 512], street_lamp_01: [4000, 512], treasure_chest: [4000, 512], stone_fire_pit: [2500, 512],
  modular_fort_01: [20000, 1024], large_castle_door: [4000, 1024], WoodenTable_01: [1000, 512], wooden_stool_01: [1200, 512], painted_wooden_bench: [800, 512], planter_box_01: [1500, 512], wooden_ladder: [2000, 512],
  chemistry_set: [6000, 512], bunsen_burner: [2000, 512], vintage_microscope: [4000, 512], book_encyclopedia_set_01: [2500, 512], cannon_01: [5000, 512], garden_gnome: [3000, 512],
};
const LOD = new Set(['tree_small_02', 'island_tree_01', 'island_tree_02', 'fir_sapling_medium', 'pine_sapling_small', 'shrub_01', 'shrub_03', 'fern_02', 'boulder_01', 'rock_moss_set_01', 'coast_rocks_02', 'namaqualand_boulder_02', 'rock_face_01']);
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BUDGET);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const triCount = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute('POSITION').getCount() / 3), 0), 0);

for (const name of names) {
  const src = `${ROOT}${name}/${name}.gltf`, out = `${ROOT}${name}/${name}.glb`;
  if (!existsSync(src)) { console.log('missing', name); continue; }
  { const j = JSON.parse(readFileSync(src, 'utf8')); const bad = (j.buffers || []).some((b) => b.uri && (!existsSync(`${ROOT}${name}/${b.uri}`) || statSync(`${ROOT}${name}/${b.uri}`).size !== b.byteLength));
    if (bad) { console.log('incomplete', name); continue; } }
  if (existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs && !process.env.FORCE) { console.log('cached', name); continue; }
  const [target, texSize] = BUDGET[name] || [5000, 512];
  const t0 = Date.now();
  try {
    const doc = await io.read(src);
    const before = triCount(doc);
    const ratio = Math.min(1, target / Math.max(before, 1));
    await doc.transform(dedup(), flatten(), join({ keepNamed: false }), weld({ tolerance: 0.0001 }));
    if (ratio < 0.95) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.5, lockBorder: false }));
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 82, resize: [texSize, texSize] }), prune());
    // alpha-cutout materials: force alphaMode MASK so the runtime uses alphaTest, and mark double sided
    for (const m of doc.getRoot().listMaterials()) { if (m.getAlphaMode() === 'BLEND') { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.45); m.setDoubleSided(true); } }
    await io.write(out, doc);
    console.log(`${name}: ${before.toLocaleString()} -> ${Math.round(triCount(doc)).toLocaleString()} tris, ${(statSync(out).size / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (LOD.has(name)) {   // far-distance variant: a fifth of the triangles, quarter-size textures
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0.2, error: 0.8, lockBorder: false }), textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 75, resize: [256, 256] }), prune());
      const lod = `${ROOT}${name}/${name}.lod.glb`; await io.write(lod, doc);
      console.log(`  lod: ${Math.round(triCount(doc)).toLocaleString()} tris, ${(statSync(lod).size / 1e6).toFixed(1)} MB`);
    }
  } catch (e) { console.log('FAILED', name, e.message); }
}
