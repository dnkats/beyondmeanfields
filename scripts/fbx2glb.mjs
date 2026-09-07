// FBX -> GLB for the Mixamo characters in sources/characters (downloaded by fetch-assets.mjs): node scripts/fbx2glb.mjs
// writes public/assets/characters/<name>.glb; then shrink with
//   npx gltf-transform optimize <name>.glb <name>.glb --compress false --texture-compress webp --texture-size 1024 --simplify false --instance false --flatten false --join false
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const JOBS = [
  { out: 'mremireh.glb', file: '/sources/characters/mremireh.fbx', clips: { idle: '/sources/characters/mremireh_idle.fbx', walk: '/sources/characters/mremireh_walk.fbx' } },
  { out: 'girl.glb', file: '/sources/characters/girl.fbx', clips: {} },
];
const server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { port: 5198, strictPort: true }, logLevel: 'error' }); await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage(); page.on('pageerror', (e) => console.log('[pageerror]', e.message)); page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.goto('http://localhost:5198/scripts/fbx2glb.html', { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__ready === true);
for (const j of JOBS) {
  const r = await page.evaluate(([f, c]) => window.convert(f, c), [j.file, j.clips]);
  const out = new URL(`../public/assets/characters/${j.out}`, import.meta.url).pathname; writeFileSync(out, Buffer.from(r.b64, 'base64'));
  console.log(j.out, (Buffer.from(r.b64, 'base64').length / 1e6).toFixed(1), 'MB;', r.meshes, '; clips:', r.clips.join(', '));
}
await browser.close(); await server.close();
