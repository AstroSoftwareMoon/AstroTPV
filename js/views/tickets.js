/*
 * AstroTPV · Historial de tickets, reimpresión y devoluciones
 */
(function () {
  'use strict';
  const { h, icon, toast, modal, clear } = UI;
  const C = TPVCore;
  const DB = TPVDB;
  let state = { from: null, to: null, q: '', method: '' };

  const METHOD = { cash: 'Efectivo', card: 'Tarjeta', other: 'Otro' };
  const methodLabel = (s) => s.payments.length > 1 ? 'Mixto' : (METHOD[s.payments[0] && s.payments[0].method] || '');

  async function loadSales(from, to) {
    const lo = new Date(from + 'T00:00:00').toISOString();
    const hi = new Date(to + 'T23:59:59.999').toISOString();
    return (await DB.byIndex('sales', 'date', DB.range(lo, hi))).sort((a, b) => b.date.localeCompare(a.date));
  }
  App.loadSales = loadSales;

  App.views.tickets = {
    async render(main) {
      const today = C.dateKey(new Date());
      state.from = state.from || today;
      state.to = state.to || today;
      const from = h('input', { class: 'input', type: 'date', value: state.from, onchange: () => { state.from = from.value; load(); } });
      const to = h('input', { class: 'input', type: 'date', value: state.to, onchange: () => { state.to = to.value; load(); } });
      const q = h('input', { class: 'input', type: 'search', placeholder: 'Nº ticket, mesa, producto…', value: state.q, oninput: () => { state.q = q.value; draw(); } });
      const method = h('select', { class: 'input', onchange: () => { state.method = method.value; draw(); } },
        h('option', { value: '' }, 'Todos los pagos'), h('option', { value: 'cash' }, 'Efectivo'), h('option', { value: 'card' }, 'Tarjeta'), h('option', { value: 'other' }, 'Otro'));
      method.value = state.method;
      const summary = h('p', { class: 'muted' });
      const list = h('div', { class: 'ticket-list' });
      main.appendChild(h('div', { class: 'page' },
        h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Tickets'), summary),
          h('button', { class: 'btn', onclick: () => exportCSV() }, icon('download'), 'Exportar CSV')),
        h('div', { class: 'toolbar' },
          h('div', { class: 'quick' },
            h('button', { class: 'btn sm', onclick: () => setRange(0) }, 'Hoy'),
            h('button', { class: 'btn sm', onclick: () => setRange(1, true) }, 'Ayer'),
            h('button', { class: 'btn sm', onclick: () => setRange(6) }, '7 días'),
            h('button', { class: 'btn sm', onclick: () => setRange(29) }, '30 días')),
          from, to, h('div', { class: 'search-wrap grow' }, icon('search', 18), q), method),
        list));

      let sales = [];
      function setRange(days, single) {
        const d = new Date(); d.setDate(d.getDate() - days);
        state.from = C.dateKey(d);
        state.to = single ? state.from : C.dateKey(new Date());
        from.value = state.from; to.value = state.to;
        load();
      }
      async function load() { sales = await loadSales(state.from, state.to); draw(); }
      function filtered() {
        const qq = state.q.trim().toLowerCase();
        return sales.filter((s) => (!state.method || s.payments.some((p) => p.method === state.method)) &&
          (!qq || s.number.toLowerCase().includes(qq) || (s.table || '').toLowerCase().includes(qq) || s.lines.some((l) => l.name.toLowerCase().includes(qq))));
      }
      function draw() {
        const items = filtered();
        const total = items.reduce((a, s) => a + s.total, 0);
        summary.textContent = items.length + ' tickets · ' + App.money(total);
        clear(list);
        if (!items.length) { list.appendChild(h('div', { class: 'empty' }, icon('receipt', 40), h('p', null, 'No hay tickets en este periodo'))); return; }
        for (const s of items) {
          list.appendChild(h('button', { class: 'ticket-row' + (s.type === 'refund' ? ' refund' : ''), onclick: () => showSale(s) },
            h('span', { class: 'tr-num' }, s.number),
            h('span', { class: 'tr-date' }, C.formatDateTime(s.date)),
            h('span', { class: 'tr-desc' }, (s.table ? s.table + ' · ' : '') + s.lines.map((l) => C.formatQty(l.qty) + '× ' + l.name).join(', ')),
            h('span', { class: 'tr-method' }, methodLabel(s)),
            s.status === 'refunded' ? h('span', { class: 'pill off' }, 'Devuelto') : s.status === 'partial' ? h('span', { class: 'pill warn' }, 'Dev. parcial') : h('span'),
            h('strong', { class: 'tr-total' }, App.money(s.total))));
        }
      }
      App.views.tickets._exportRows = filtered;
      await load();
    }
  };

  async function showSale(sale) {
    const canRefund = sale.type !== 'refund' && C.refundableLines(sale).length > 0;
    const res = await modal({
      title: 'Ticket ' + sale.number,
      body: h('div', { class: 'ticket-preview' }, App.ticketNode(sale)),
      actions: [
        canRefund ? { label: 'Devolución', icon: 'undo', class: 'danger', value: 'refund' } : null,
        { label: 'Reimprimir', icon: 'print', onClick: () => { App.printSale(sale, true); return false; } },
        { label: 'Cerrar', class: 'primary', value: null }
      ].filter(Boolean)
    });
    if (res === 'refund') refund(sale);
  }

  async function refund(sale) {
    if (!(await App.requireAdmin('hacer devoluciones'))) return;
    if (!(await App.ensureShift())) return;
    const fresh = await DB.get('sales', sale.id);
    const avail = C.refundableLines(fresh);
    const sel = await App.pickQuantities('Devolución de ' + sale.number, avail.map((a) => ({ name: a.line.name, max: a.max, unitPrice: a.line.unitPrice, discountPct: a.line.discountPct })), 'Continuar');
    if (!sel) return;
    const lines = [];
    const updates = {};
    avail.forEach((a, i) => {
      if (!sel[i]) return;
      updates[a.index] = sel[i];
      lines.push(Object.assign({}, a.line, { qty: -sel[i] }));
    });
    // Descuento global proporcional
    let discount = null;
    if (fresh.discountSpec && fresh.discountSpec.type === 'pct') discount = fresh.discountSpec;
    else if (fresh.discount && fresh.subtotal) {
      const part = lines.reduce((a, l) => a + C.lineTotal(l), 0);
      discount = { type: 'amount', value: -Math.round(fresh.discount * Math.abs(part) / fresh.subtotal) };
    }
    const total = C.cartTotals(lines, discount).total;
    const reason = h('input', { class: 'input', type: 'text', placeholder: 'Motivo de la devolución' });
    const origMethod = fresh.payments.length === 1 ? fresh.payments[0].method : 'cash';
    const method = h('select', { class: 'input' }, Object.entries(METHOD).map(([k, v]) => h('option', { value: k, selected: k === origMethod }, v)));
    const ok = await modal({
      title: 'Confirmar devolución',
      body: h('div', null,
        h('p', { class: 'big-number neg' }, App.money(total)),
        h('div', { class: 'form-grid' }, h('div', { class: 'field' }, h('label', null, 'Reembolsar en'), method), h('div', { class: 'field' }, h('label', null, 'Motivo'), reason)),
        h('p', { class: 'muted' }, 'Se generará una factura rectificativa y se repondrá el stock.')),
      actions: [{ label: 'Cancelar', value: null }, { label: 'Devolver', class: 'danger', value: true }]
    });
    if (!ok) return;
    try {
      const r = await App.registerSale({
        lines, discount, note: reason.value.trim(), table: fresh.table, type: 'refund', refundOf: fresh.id, refundOfNumber: fresh.number, refundUpdates: updates,
        payments: [{ method: method.value, amount: total }], given: 0, change: 0
      });
      App.audit('refund', r.number + ' de ' + fresh.number + ' ' + App.money(total));
      toast('Devolución ' + r.number + ' registrada', 'ok');
      App.printSale(r);
      App.refresh();
    } catch (e) { toast(e.message, 'error'); }
  }

  function exportCSV() {
    const rows = [];
    for (const s of App.views.tickets._exportRows()) {
      for (const l of s.lines) rows.push({ s, l });
    }
    const csv = C.toCSV(rows, [
      { label: 'ticket', get: (r) => r.s.number },
      { label: 'tipo', get: (r) => r.s.type === 'refund' ? 'devolucion' : 'venta' },
      { label: 'fecha', get: (r) => C.formatDateTime(r.s.date) },
      { label: 'mesa', get: (r) => r.s.table || '' },
      { label: 'empleado', get: (r) => r.s.userName || '' },
      { label: 'producto', get: (r) => r.l.name },
      { label: 'cantidad', get: (r) => C.formatQty(r.l.qty) },
      { label: 'precio', get: (r) => C.centsToInput(r.l.unitPrice) },
      { label: 'dto_pct', get: (r) => r.l.discountPct || 0 },
      { label: 'iva', get: (r) => r.l.tax },
      { label: 'importe_linea', get: (r) => C.centsToInput(r.l.total) },
      { label: 'total_ticket', get: (r) => C.centsToInput(r.s.total) },
      { label: 'pago', get: (r) => methodLabel(r.s) }
    ]);
    UI.download('ventas-' + state.from + '_' + state.to + '.csv', csv, 'text/csv;charset=utf-8');
  }
})();
