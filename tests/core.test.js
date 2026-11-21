// Tests de la lógica de negocio (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

test('toCents interpreta formatos españoles e internacionales', () => {
  assert.equal(C.toCents('1,50'), 150);
  assert.equal(C.toCents('1.50'), 150);
  assert.equal(C.toCents('1.234,56'), 123456);
  assert.equal(C.toCents('1,234.56'), 123456);
  assert.equal(C.toCents('1,005'), 101);
  assert.equal(C.toCents(2.5), 250);
  assert.equal(C.toCents(0.1 + 0.2), 30);
  assert.equal(C.toCents('-3,2'), -320);
  assert.equal(C.toCents(''), 0);
  assert.equal(C.toCents('abc'), 0);
  assert.equal(C.toCents('12 €'), 1200);
});

test('centsToInput', () => {
  assert.equal(C.centsToInput(1250), '12,50');
  assert.equal(C.centsToInput(5), '0,05');
  assert.equal(C.centsToInput(-320), '-3,20');
});

test('lineTotal aplica cantidad y descuento', () => {
  assert.equal(C.lineTotal({ unitPrice: 250, qty: 3 }), 750);
  assert.equal(C.lineTotal({ unitPrice: 250, qty: 3, discountPct: 10 }), 675);
  assert.equal(C.lineTotal({ unitPrice: 199, qty: 1.5 }), 299);
  assert.equal(C.lineTotal({ unitPrice: 250, qty: -2 }), -500);
});

test('cartTotals desglosa IVA y cuadra céntimos con descuento global', () => {
  const lines = [
    { unitPrice: 121, qty: 1, tax: 21 },
    { unitPrice: 110, qty: 2, tax: 10 },
    { unitPrice: 104, qty: 1, tax: 4 }
  ];
  const t = C.cartTotals(lines);
  assert.equal(t.subtotal, 445);
  assert.equal(t.total, 445);
  assert.deepEqual(t.taxes.map((x) => [x.rate, x.base, x.tax]), [[21, 100, 21], [10, 200, 20], [4, 100, 4]]);

  const d = C.cartTotals(lines, { type: 'pct', value: 10 });
  assert.equal(d.discount, 45); // 44,5 -> 45
  assert.equal(d.total, 400);
  assert.equal(d.taxes.reduce((a, x) => a + x.gross, 0), d.total);
  assert.equal(d.taxes.reduce((a, x) => a + x.base + x.tax, 0), d.total);

  const a = C.cartTotals(lines, { type: 'amount', value: 1000 });
  assert.equal(a.total, 0, 'el descuento no supera el subtotal');
});

test('cartTotals con devoluciones (negativos)', () => {
  const t = C.cartTotals([{ unitPrice: 300, qty: -2, tax: 10 }], { type: 'amount', value: -60 });
  assert.equal(t.subtotal, -600);
  assert.equal(t.discount, -60);
  assert.equal(t.total, -540);
  assert.equal(t.taxes[0].base + t.taxes[0].tax, -540);
});

test('suggestCash propone billetes útiles', () => {
  assert.deepEqual(C.suggestCash(730), [730, 800, 1000, 2000, 5000, 10000]);
  assert.deepEqual(C.suggestCash(2000).slice(0, 2), [2000, 5000]);
  assert.deepEqual(C.suggestCash(0), []);
});

test('shiftSummary calcula efectivo esperado', () => {
  const sales = [
    { total: 1000, payments: [{ method: 'cash', amount: 1000 }], taxes: [{ rate: 10, base: 909, tax: 91, gross: 1000 }], lines: [{ productId: 'a', name: 'A', qty: 2, total: 1000 }] },
    { total: 500, payments: [{ method: 'card', amount: 500 }], taxes: [], lines: [] },
    { total: 800, payments: [{ method: 'card', amount: 300 }, { method: 'cash', amount: 500 }], taxes: [], lines: [] },
    { total: -200, type: 'refund', payments: [{ method: 'cash', amount: -200 }], taxes: [], lines: [] }
  ];
  const moves = [{ type: 'in', amount: 1000 }, { type: 'out', amount: 300 }];
  const s = C.shiftSummary({ openingFloat: 10000 }, sales, moves);
  assert.equal(s.gross, 2300);
  assert.equal(s.refunds, -200);
  assert.equal(s.net, 2100);
  assert.equal(s.count, 3);
  assert.equal(s.byMethod.cash, 1300);
  assert.equal(s.byMethod.card, 800);
  assert.equal(s.expectedCash, 10000 + 1300 + 1000 - 300);
  assert.equal(s.topProducts[0].name, 'A');
});

test('countDenominations', () => {
  assert.equal(C.countDenominations({ 5000: 2, 200: 3, 5: 1 }), 10605);
});

test('ticketNumber y fechas', () => {
  assert.equal(C.ticketNumber('T', 42), 'T000042');
  assert.equal(C.dateKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('parseTables expande rangos', () => {
  assert.deepEqual(C.parseTables('Barra, Mesa 1-3, Terraza 1-2'), ['Barra', 'Mesa 1', 'Mesa 2', 'Mesa 3', 'Terraza 1', 'Terraza 2']);
  assert.deepEqual(C.parseTables('A\nB\nA'), ['A', 'B']);
});

test('CSV ida y vuelta con comillas y separador ;', () => {
  const csv = C.toCSV([{ n: 'Café; "solo"', p: '1,30' }], [{ label: 'nombre', key: 'n' }, { label: 'precio', key: 'p' }]);
  const rows = C.parseCSV(csv);
  assert.deepEqual(rows, [{ nombre: 'Café; "solo"', precio: '1,30' }]);
  assert.deepEqual(C.parseCSV('name,price\nAgua,1.5\n'), [{ name: 'Agua', price: '1.5' }]);
});

test('findProducts por código exacto o nombre sin acentos', () => {
  const ps = [{ name: 'Café solo', barcode: '123' }, { name: 'Agua', barcode: '456', sku: 'AG1' }];
  assert.equal(C.findProducts(ps, '123').length, 1);
  assert.equal(C.findProducts(ps, 'cafe')[0].name, 'Café solo');
  assert.equal(C.findProducts(ps, 'ag1')[0].name, 'Agua');
});

test('isValidEAN', () => {
  assert.equal(C.isValidEAN('4006381333931'), true);
  assert.equal(C.isValidEAN('4006381333932'), false);
  assert.equal(C.isValidEAN('96385074'), true);
});

test('refundableLines descuenta lo ya devuelto', () => {
  const r = C.refundableLines({ lines: [{ qty: 3, refundedQty: 1 }, { qty: 1, refundedQty: 1 }] });
  assert.equal(r.length, 1);
  assert.equal(r[0].max, 2);
});
