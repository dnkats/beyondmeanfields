// Converts models from a downloaded asset kit (sources/<kit>/glTF/*.gltf) into game .glb files under public/assets/models/<name>/<name>.glb:
// merged primitives, welded, WebP textures at the given size. The kits are CC0 (Quaternius Stylized Nature MegaKit).
//   node scripts/convert-kit.mjs               # everything in KIT below
//   node scripts/convert-kit.mjs CommonTree_1  # one model
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune, textureCompress, flatten, join } from '@gltf-transform/functions';
import sharp from 'sharp';
import { existsSync, mkdirSync, statSync } from 'node:fs';

const SRC = new URL('../sources/quaternius/glTF/', import.meta.url).pathname, OUT = new URL('../public/assets/models/', import.meta.url).pathname;
// source file -> [game name, texture size]
export const KIT = {
  CommonTree_1: ['q_tree_1', 512], CommonTree_2: ['q_tree_2', 512], CommonTree_3: ['q_tree_3', 512], CommonTree_4: ['q_tree_4', 512], CommonTree_5: ['q_tree_5', 512],
  Pine_1: ['q_pine_1', 512], Pine_2: ['q_pine_2', 512], Pine_3: ['q_pine_3', 512], Pine_4: ['q_pine_4', 512], Pine_5: ['q_pine_5', 512],
  TwistedTree_1: ['q_twisted_1', 512], TwistedTree_2: ['q_twisted_2', 512], TwistedTree_3: ['q_twisted_3', 512],
  DeadTree_1: ['q_dead_1', 512], DeadTree_2: ['q_dead_2', 512], DeadTree_3: ['q_dead_3', 512],
  Bush_Common_Flowers: ['q_bush_flowers', 512], Fern_1: ['q_fern', 512],
  Flower_3_Group: ['q_flowers_3', 512], Flower_4_Group: ['q_flowers_4', 512], Grass_Wispy_Tall: ['q_grass_tall', 512], Grass_Common_Short: ['q_grass_short', 512],
  Rock_Medium_1: ['q_rock_1', 512], Rock_Medium_2: ['q_rock_2', 512], Rock_Medium_3: ['q_rock_3', 512],
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(KIT);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const triCount = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute('POSITION').getCount() / 3), 0), 0);
for (const src of names) {
  const [name, texSize] = KIT[src] || [src.toLowerCase(), 512];
  const file = `${SRC}${src}.gltf`; if (!existsSync(file)) { console.log('missing', file); continue; }
  const doc = await io.read(file);
  const before = triCount(doc);
  await doc.transform(dedup(), flatten(), join({ keepNamed: false }), weld({ tolerance: 0.0001 }), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [texSize, texSize] }), prune());
  mkdirSync(`${OUT}${name}`, { recursive: true }); const out = `${OUT}${name}/${name}.glb`; await io.write(out, doc);
  console.log(`${src} -> ${name}: ${before.toLocaleString()} -> ${Math.round(triCount(doc)).toLocaleString()} tris, ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}
