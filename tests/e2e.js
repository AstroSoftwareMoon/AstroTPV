// Prueba de extremo a extremo con Chromium (Playwright): flujo completo de un día de trabajo.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const server = require('../scripts/serve.js');

const PORT = 8080;
const URL = `http://localhost:${PORT}/index.html`;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  const step = (s) => console.log('→', s);

  await page.goto(URL);
  step('Camarero entra con el PIN inicial 1234 (sin aviso de cambio)');
  await page.click('.login-user:has-text("Camarero")');
  for (const d of '1234') await page.click(`.login-pad .pad-key:text-is("${d}")`);
  await page.waitForSelector('.sell');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.modal:has-text("Cambia el PIN")').count(), 0);
  await page.click('.side-user');

  step('Administrador entra por primera vez (1234) → recomienda cambiar PIN');
  await page.click('.login-user:has-text("Administrador")');
  for (const d of '1234') await page.click(`.login-pad .pad-key:text-is("${d}")`);
  await page.waitForSelector('.modal:has-text("Cambia el PIN de administrador")');
  await page.fill('.modal input >> nth=0', '4321');
  await page.fill('.modal input >> nth=1', '4321');
  await page.click('.modal .btn.primary:has-text("Cambiar PIN")');
  await page.waitForSelector('.overlay', { state: 'detached' });
  await page.waitForSelector('.sell');

  step('Venta directa: añadir productos');
  await page.click('.chip:has-text("Todos")');
  await page.click('.product-tile:has-text("Caña")');
  await page.click('.product-tile:has-text("Caña")');
  await page.click('.product-tile:has-text("Tostada tomate")');
  assert.match(await page.textContent('#pay-amount'), /6,50/);

  step('Escanear código de barras con el lector (teclado)');
  await page.click('.cart-title');
  await page.keyboard.type('8410000000024', { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#pay-amount').textContent.includes('9,00'));

  step('Cobrar → abrir caja primero (fondo 100 €)');
  await page.click('#pay-btn');
  await page.waitForSelector('.modal:has-text("Abrir caja")');
  for (const d of '10000') await page.click(`.modal .pad-key:text-is("${d}")`);
  await page.click('.modal .btn.primary:has-text("Abrir caja")');
  await page.waitForSelector('.modal:has-text("Cobrar")');
  await page.click('.quick-cash .btn:has-text("20")');
  assert.match(await page.textContent('.pay-change'), /11,00/);
  await page.click('#confirm-pay');
  await page.waitForSelector('.modal:has-text("T000001")');
  assert.match(await page.textContent('.change-box'), /11,00/);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.overlay', { state: 'detached' });

  step('Mesas: abrir Mesa 3, añadir y aparcar');
  await page.click('.nav-btn[data-view="tables"]');
  await page.click('.table-tile:has-text("Mesa 3")');
  await page.waitForSelector('.cart-title:has-text("Mesa 3")');
  await page.click('.chip:has-text("Todos")');
  await page.click('.product-tile:has-text("Café con leche")');
  await page.click('.product-tile:has-text("Café con leche")');
  await page.click('.product-tile:has-text("Croquetas")');
  step('«Cancelar» en un diálogo de confirmación lo cierra sin vaciar el ticket');
  await page.click('.cart-actions .btn:has-text("Vaciar")');
  await page.click('.modal .btn:has-text("Cancelar")');
  await page.waitForSelector('.overlay', { state: 'detached' });
  assert.equal(await page.locator('.cart-line').count(), 2);
  await page.click('.cart-actions .btn:has-text("Guardar")');
  await page.waitForSelector('.table-tile.busy:has-text("Mesa 3")');
  assert.match(await page.textContent('.table-tile.busy:has-text("Mesa 3")'), /10,70/);

  step('Recargar página: la mesa persiste y el admin entra con su nuevo PIN sin volver a ver el aviso');
  await page.reload();
  await page.click('.login-user:has-text("Administrador")');
  for (const d of '1234') await page.click(`.login-pad .pad-key:text-is("${d}")`);
  await page.click('.login-pad .pad-key:text-is("OK")');
  await page.waitForSelector('.login-msg:has-text("PIN incorrecto")');
  for (const d of '4321') await page.click(`.login-pad .pad-key:text-is("${d}")`);
  await page.waitForSelector('.nav');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.modal:has-text("Cambia el PIN")').count(), 0);
  await page.click('.nav-btn[data-view="tables"]');
  await page.waitForSelector('.table-tile.busy:has-text("Mesa 3")');

  step('Dividir cuenta por productos y cobrar con tarjeta');
  await page.click('.table-tile:has-text("Mesa 3")');
  await page.click('.cart-actions .btn:has-text("Dividir")');
  await page.click('.modal .btn:has-text("Por productos")');
  await page.click('.pick-row:has-text("Croquetas") .btn:has-text("Todo")');
  await page.click('.modal .btn.primary:has-text("Cobrar selección")');
  await page.click('.seg-btn:has-text("Tarjeta")');
  await page.click('#confirm-pay');
  await page.waitForSelector('.modal:has-text("T000002")');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.overlay', { state: 'detached' });
  assert.match(await page.textContent('#pay-amount'), /3,20/);

  step('Cobro mixto del resto');
  await page.click('#pay-btn');
  await page.click('.seg-btn:has-text("Mixto")');
  for (const d of '200') await page.click(`.modal .pad-key:text-is("${d}")`);
  await page.click('#confirm-pay');
  await page.waitForSelector('.modal:has-text("T000003")');
  await page.keyboard.press('Enter');

  step('Stock descontado (Refresco cola 36 → 35)');
  await page.click('.nav-btn[data-view="products"]');
  const row = page.locator('.prod-row:has-text("Refresco cola") .pr-stock');
  assert.match(await row.textContent(), /^35/);

  step('Devolución parcial del ticket T000001');
  await page.click('.nav-btn[data-view="tickets"]');
  await page.click('.ticket-row:has-text("T000001")');
  await page.click('.modal .btn:has-text("Devolución")');
  await page.click('.pick-row:has-text("Refresco cola") .btn:has-text("Todo")');
  await page.click('.modal .btn.primary:has-text("Continuar")');
  await page.click('.modal .btn.danger:has-text("Devolver")');
  await page.waitForSelector('.ticket-row.refund:has-text("R000001")');

  step('Caja: comprobar efectivo esperado y cerrar con Z');
  await page.click('.nav-btn[data-view="cash"]');
  // 100 + 9 (T1 efectivo) + 1,20 (resto mixto) − 2,50 (devolución) = 107,70
  assert.match(await page.textContent('.stat:has-text("Efectivo esperado")'), /107,70/);
  await page.click('.btn:has-text("Cerrar caja (Z)")');
  await page.fill('input[data-den="10000"]', '1');
  await page.fill('input[data-den="500"]', '1');
  await page.fill('input[data-den="200"]', '1');
  await page.fill('input[data-den="50"]', '1');
  await page.fill('input[data-den="20"]', '1');
  assert.match(await page.textContent('.diff'), /Cuadra/);
  await page.click('.modal .btn.primary:has-text("Cerrar caja")');
  await page.waitForSelector('.hero-card:has-text("Abrir caja")');
  assert.ok(await page.evaluate(() => window.__printed >= 1), 'se imprimió el Z');

  step('Informes');
  await page.click('.nav-btn[data-view="reports"]');
  await page.waitForSelector('.stat:has-text("Ventas netas")');

  step('Funciona sin conexión (service worker)');
  await page.goto(URL);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.login-card');
  await context.setOffline(false);

  assert.deepEqual(errors.filter((e) => !/favicon/.test(e)), [], 'sin errores en consola');
  console.log('\n✅ E2E OK');
  await browser.close();
  server.close();
})().catch((e) => { console.error('\n❌', e); process.exit(1); });
