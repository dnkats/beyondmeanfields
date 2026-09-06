// Removes the raw Poly Haven sources (.gltf, .bin, textures/) for every model that already has a decimated .glb,
// shrinking public/assets from ~450 MB to a deployable size. Re-run scripts/fetch-assets.mjs to get sources back.
import { readdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('../public/assets/models/', import.meta.url).pathname;
let freed = 0, kept = 0;
for (const name of readdirSync(ROOT)) {
  const dir = join(ROOT, name);
  if (!statSync(dir).isDirectory()) continue;
  if (!existsSync(join(dir, `${name}.glb`))) { kept++; continue; }
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f.endsWith('.glb')) continue;
    if (f === 'textures' && (name === 'pine_tree_01' || name === 'fir_tree_01')) continue;   // twig textures used by the card conifers
    const size = statSync(p).isDirectory() ? readdirSync(p).reduce((n, g) => n + statSync(join(p, g)).size, 0) : statSync(p).size;
    rmSync(p, { recursive: true, force: true }); freed += size;
  }
}
console.log(`pruned sources: ${(freed / 1e6).toFixed(0)} MB freed; ${kept} models without a .glb left untouched`);
