// GPU-compressed textures: converts every .glb under public/assets/models and public/assets/characters to KTX2 (UASTC for normal maps,
// ETC1S for everything else) with the gltf-transform CLI, and the loose Poly Haven sets under
// public/assets/textures/*/ {diffuse,nor_gl,arm}.jpg to .ktx2 with toktx. Needs toktx (KTX-Software) on PATH or in TOKTX.
//   node scripts/ktx.mjs            # everything not yet converted
//   node scripts/ktx.mjs --force    # redo
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
const ROOT = new URL('../public/assets/', import.meta.url).pathname, force = process.argv.includes('--force');
const toktx = process.env.TOKTX || 'toktx';
const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `${dirname(toktx)}:${process.env.PATH}` } }).toString();
const inspect = (glb) => sh(`npx gltf-transform inspect "${glb}" --format csv`);
// glb files (the CLI's --slots takes one slot per run, so data maps are done in three passes)
for (const sub of ['models', 'characters']) for (const dir of readdirSync(join(ROOT, sub), { withFileTypes: true })) {
  const files = dir.isDirectory() ? readdirSync(join(ROOT, sub, dir.name)).filter((f) => f.endsWith('.glb') && !f.endsWith('.tmp.glb')).map((f) => join(ROOT, sub, dir.name, f)) : dir.name.endsWith('.glb') ? [join(ROOT, sub, dir.name)] : [];
  for (const glb of files) {
    let info; try { info = inspect(glb); } catch (e) { console.log('FAILED inspect', glb.slice(ROOT.length)); continue; } if (!/image\//.test(info)) continue;   // no textures (animation clips)
    if (!force && info.includes('image/ktx2')) { console.log('ktx2 already', glb.slice(ROOT.length)); continue; }
    const tmp = glb + '.tmp.glb', t0 = Date.now(), before = statSync(glb).size;
    try {
      if (info.includes('image/webp')) sh(`npx gltf-transform png "${glb}" "${tmp}" --formats webp`); else sh(`cp "${glb}" "${tmp}"`);   // toktx reads PNG/JPEG only
      const uastc = (slot, lambda) => sh(`npx gltf-transform uastc "${tmp}" "${tmp}" --slots "${slot}" --level 2 --rdo --rdo-lambda ${lambda} --zstd 18`);
      // normals: UASTC (ETC1S smears them) with strong RDO so the file stays near the WebP size; everything else ETC1S, characters at a higher quality level
      uastc('normalTexture', 3.0);
      sh(`npx gltf-transform etc1s "${tmp}" "${tmp}" --quality ${sub === 'characters' ? 220 : 160} --compression 2`);
      renameSync(tmp, glb); console.log(`${glb.slice(ROOT.length)}: ${(before / 1e6).toFixed(2)} -> ${(statSync(glb).size / 1e6).toFixed(2)} MB (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    } catch (e) { console.log('FAILED', glb.slice(ROOT.length), String(e.stderr || e.message).slice(0, 300)); if (existsSync(tmp)) unlinkSync(tmp); }
  }
}
// loose texture sets
for (const set of readdirSync(join(ROOT, 'textures'), { withFileTypes: true })) { if (!set.isDirectory()) continue;
  for (const [name, kind] of [['diffuse', 'srgb'], ['nor_gl', 'linear'], ['arm', 'linear']]) {
    const src = join(ROOT, 'textures', set.name, name + '.jpg'), out = join(ROOT, 'textures', set.name, name + '.ktx2');
    if (!existsSync(src)) continue; if (existsSync(out) && !force) continue;
    const enc = name === 'nor_gl' ? '--encode uastc --uastc_quality 2 --uastc_rdo_l 3.0 --zcmp 18' : '--encode etc1s --clevel 2 --qlevel 160';   // UASTC only for the normals
    try { sh(`"${toktx}" --t2 ${enc} --genmipmap --assign_oetf ${kind} --assign_primaries bt709 "${out}" "${src}"`); console.log(`textures/${set.name}/${name}: ${(statSync(src).size / 1e6).toFixed(2)} -> ${(statSync(out).size / 1e6).toFixed(2)} MB`); }
    catch (e) { console.log('FAILED', src, String(e.stderr || e.message).slice(0, 300)); }
  }
}
