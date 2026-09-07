// Diagnostic probe: loads the game headless and evaluates a script, printing its JSON result.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const script = process.argv[2] || 'return 1';
const server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { port: +(process.env.PORT || 5199), strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/texture/.test(m.text())) console.log('[console]', m.text().slice(0, 200)); });
await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?q=' + (process.env.Q || 'low'), { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
try { const r = await page.evaluate(new Function('return (async () => {' + script + '})()')); console.log('RESULT', JSON.stringify(r, null, 1)); } catch (e) { console.log('EVAL ERROR', e.message); }
await browser.close(); await server.close();
