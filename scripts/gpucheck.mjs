import { chromium } from 'playwright';
const configs = [
  { name: 'headed-default', headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] },
  { name: 'headed-angle-gl', headless: false, args: ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] },
  { name: 'headless-new-angle-gl', headless: true, args: ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] },
  { name: 'headless-egl', headless: true, args: ['--use-gl=egl', '--ignore-gpu-blocklist'] },
];
for (const c of configs) {
  try {
    const browser = await chromium.launch({ headless: c.headless, args: c.args, timeout: 30000 });
    const page = await browser.newPage();
    const info = await page.evaluate(() => { const cv = document.createElement('canvas'); const gl = cv.getContext('webgl2'); if (!gl) return 'no webgl2'; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) + ' | ' + gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.RENDERER); });
    console.log(c.name, '=>', info);
    await browser.close();
  } catch (e) { console.log(c.name, 'FAILED', e.message.split('\n')[0]); }
}
