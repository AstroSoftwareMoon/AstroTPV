// Genera capturas de pantalla para el README (docs/screenshots) con datos de demostración.
const { chromium } = require('playwright');
const path = require('path');
const server = require('./serve.js');
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const URL = 'http://localhost:8080/index.html';

async function login(page) {
  await page.click('.login-user:has-text("Administrador")');
  for (const d of '1234') await page.click(`.login-pad .pad-key:text-is("${d}")`);
  await page.waitForSelector('.nav');
}
async function closeModals(page) {
  await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.remove(); });
  while (await page.locator('.overlay').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
}

(async () => {
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.print = () => {}; });
    await page.goto(URL);
    await page.waitForSelector('.login-card');
    await page.waitForTimeout(600);
    if (scheme === 'light') await page.screenshot({ path: path.join(OUT, 'login.png') });
    await login(page);

    // Generar ventas de ejemplo de varios días directamente en la base de datos
    await page.evaluate(async () => {
      const shift = { id: TPVDB.uid(), status: 'open', openedAt: new Date(Date.now() - 6 * 3600e3).toISOString(), openingFloat: 15000, openedBy: App.state.user.id, openedByName: App.state.user.name };
      await TPVDB.put('shifts', shift);
      await App.loadShift();
      const prods = App.state.products;
      let seed = 7;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let d = 6; d >= 0; d--) {
        const n = 6 + Math.floor(rnd() * 10);
        for (let i = 0; i < n; i++) {
          const lines = [];
          const k = 1 + Math.floor(rnd() * 4);
          for (let j = 0; j < k; j++) {
            const p = prods[Math.floor(rnd() * prods.length)];
            lines.push({ productId: p.id, name: p.name, unitPrice: p.price, tax: p.tax, qty: 1 + Math.floor(rnd() * 3), discountPct: 0, cost: p.cost });
          }
          const sale = await App.registerSale({ lines, discount: null, payments: [], given: 0, change: 0 });
          const date = new Date(); date.setDate(date.getDate() - d); date.setHours(8 + Math.floor(rnd() * 14), Math.floor(rnd() * 60));
          sale.date = date.toISOString();
          sale.payments = [{ method: rnd() > 0.45 ? 'card' : 'cash', amount: sale.total }];
          if (d > 0) sale.shiftId = 'old';
          await TPVDB.put('sales', sale);
        }
      }
      // Mesas abiertas
      const mk = (table, names, mins) => ({ id: TPVDB.uid(), table, name: table, createdAt: new Date(Date.now() - mins * 60000).toISOString(), userName: 'Camarero',
        lines: names.map(([n, q]) => { const p = prods.find((x) => x.name === n); return { id: TPVDB.uid(), productId: p.id, name: p.name, unitPrice: p.price, tax: p.tax, qty: q, discountPct: 0, cost: p.cost }; }) });
      await TPVDB.put('orders', mk('Mesa 2', [['Caña', 4], ['Croquetas (6)', 1], ['Tortilla (pincho)', 2]], 25));
      await TPVDB.put('orders', mk('Mesa 5', [['Café con leche', 2], ['Tostada tomate', 2]], 12));
      await TPVDB.put('orders', mk('Terraza 1', [['Tercio', 3], ['Patatas fritas bolsa', 2]], 52));
      await TPVDB.put('orders', mk('Barra 2', [['Doble', 2]], 4));
      // Reponer stock para que la demo tenga cantidades realistas
      const stocks = { 'Agua 50cl': 42, 'Refresco cola': 31, 'Tercio': 3, 'Tortilla (pincho)': 9, 'Patatas fritas bolsa': 18, 'Chicles': 26, 'Pan barra': 0 };
      for (const p of prods) if (p.trackStock) { p.stock = stocks[p.name] ?? 20; await TPVDB.put('products', p); }
      await App.loadCatalog();
    });

    await page.click('.nav-btn[data-view="sell"]');
    await page.click('.chip:has-text("Todos")');
    for (const n of ['Caña', 'Caña', 'Croquetas (6)', 'Refresco cola', 'Bocadillo jamón', 'Café con leche']) await page.click(`.product-tile:has-text("${n}")`);
    await closeModals(page);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, scheme === 'light' ? 'venta.png' : 'venta-oscuro.png') });
    if (scheme === 'dark') { await ctx.close(); continue; }

    await page.click('#pay-btn');
    await page.click('.quick-cash .btn:has-text("50")');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'cobro.png') });
    await closeModals(page);

    await page.click('.nav-btn[data-view="tables"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'mesas.png') });
    await page.click('.nav-btn[data-view="products"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'stock.png') });
    await page.click('.prod-row:has-text("Bocadillo") .pr-main');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'producto.png') });
    await closeModals(page);
    await page.click('.nav-btn[data-view="cash"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'caja.png') });
    await page.click('.nav-btn[data-view="reports"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'informes.png'), fullPage: false });
    await page.click('.nav-btn[data-view="tickets"]');
    await page.click('.ticket-row >> nth=0');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'ticket.png') });
    await ctx.close();
  }
  // Móvil
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  await mp.goto(URL);
  await login(mp);
  await mp.click('.chip:has-text("Todos")');
  for (const n of ['Caña', 'Tostada tomate', 'Café solo']) await mp.click(`.product-tile:has-text("${n}")`);
  await closeModals(mp);
  await mp.waitForTimeout(600);
  await mp.screenshot({ path: path.join(OUT, 'movil.png') });
  await browser.close();
  server.close();
  console.log('Capturas en', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
