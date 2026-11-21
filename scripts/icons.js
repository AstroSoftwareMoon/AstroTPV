// Genera los PNG del icono (PWA / escritorio) a partir de los SVG usando Chromium (Playwright)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const jobs = [['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512], ['maskable.svg', 'maskable-512.png', 512], ['icon.svg', 'icon-1024.png', 1024]];
  for (const [src, out, size] of jobs) {
    const svg = fs.readFileSync(path.join(root, 'icons', src), 'utf8');
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(root, 'icons', out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('✓', out);
  }
  await browser.close();
})();
