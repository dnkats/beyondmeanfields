// Headless screenshot tool: starts Vite, opens the game, runs an optional setup expression, saves PNGs.
//   node scripts/shot.mjs out.png                       # title view
//   node scripts/shot.mjs out.png "__dbg.goto('harbor')" # teleport, then shoot
import { createServer } from 'vite';
import { chromium } from 'playwright';

const [out = 'shots/shot.png', setup = '', wait = '2500'] = process.argv.slice(2);
const server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[browser]', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'load' });
await page.waitForTimeout(4000); await page.reload({ waitUntil: 'load' });   // second load: dependencies are pre-bundled
try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }); } catch (e) { console.log('ready flag timeout'); }
if (setup) { try { await page.evaluate(setup); } catch (e) { console.log('setup error', e.message); } }
await page.waitForTimeout(parseInt(wait, 10));
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close(); await server.close();
