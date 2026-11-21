/*
 * AstroTPV · Informes de ventas
 */
(function () {
  'use strict';
  const { h, icon, clear } = UI;
  const C = TPVCore;
  let range = null;

  function bars(entries, fmt, opts) {
    opts = opts || {};
    const max = Math.max(1, ...entries.map((e) => Math.abs(e.value)));
    return h('div', { class: 'bars' + (opts.vertical ? ' vertical' : '') }, entries.map((e) =>
      h('div', { class: 'bar-row', title: e.label + ': ' + fmt(e.value) },
        h('span', { class: 'bar-label' }, e.label),
        h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { [opts.vertical ? 'height' : 'width']: Math.max(1, Math.round(Math.abs(e.value) / max * 100)) + '%', background: e.color || '' } })),
        h('span', { class: 'bar-value' }, fmt(e.value)))));
  }

  App.views.reports = {
    async render(main) {
      const today = C.dateKey(new Date());
      if (!range) { const d = new Date(); d.setDate(d.getDate() - 6); range = { from: C.dateKey(d), to: today }; }
      const from = h('input', { class: 'input', type: 'date', value: range.from, onchange: () => { range.from = from.value; App.refresh(); } });
      const to = h('input', { class: 'input', type: 'date', value: range.to, onchange: () => { range.to = to.value; App.refresh(); } });
      const set = (days) => { const d = new Date(); d.setDate(d.getDate() - days); range = { from: C.dateKey(d), to: today }; App.refresh(); };
      const monthStart = () => { const d = new Date(); range = { from: C.dateKey(new Date(d.getFullYear(), d.getMonth(), 1)), to: today }; App.refresh(); };

      const sales = await App.loadSales(range.from, range.to);
      const byId = Object.fromEntries(App.state.products.map((p) => [p.id, p]));
      const r = C.salesReport(sales, byId);
      const page = h('div', { class: 'page' });
      main.appendChild(page);
      UI.add(page, 
        h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Informes'), h('p', { class: 'muted' }, C.formatDate(range.from + 'T00:00') + ' — ' + C.formatDate(range.to + 'T00:00'))),
          h('button', { class: 'btn', onclick: () => window.print() }, icon('print'), 'Imprimir')),
        h('div', { class: 'toolbar' },
          h('div', { class: 'quick' },
            h('button', { class: 'btn sm', onclick: () => set(0) }, 'Hoy'),
            h('button', { class: 'btn sm', onclick: () => set(6) }, '7 días'),
            h('button', { class: 'btn sm', onclick: monthStart }, 'Este mes'),
            h('button', { class: 'btn sm', onclick: () => set(89) }, '90 días')),
          from, to));

      if (!sales.length) { page.appendChild(h('div', { class: 'empty' }, icon('chart', 48), h('p', null, 'No hay ventas en este periodo.'))); return; }

      const taxTotal = r.byTax.reduce((a, t) => a + t.tax, 0);
      const stat = (label, value, cls, sub) => h('div', { class: 'stat ' + (cls || '') }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value' }, value), sub ? h('small', { class: 'muted' }, sub) : null);
      page.appendChild(h('div', { class: 'stats' },
        stat('Ventas netas', App.money(r.net), 'accent', r.count + ' tickets'),
        stat('Ticket medio', App.money(r.average)),
        stat('Base imponible', App.money(r.net - taxTotal), '', 'IVA ' + App.money(taxTotal)),
        r.margin !== null ? stat('Margen bruto', App.money(r.margin), r.margin >= 0 ? 'ok' : 'warn', 'según coste de productos') : null,
        stat('Devoluciones', App.money(r.refunds), r.refunds ? 'warn' : '', r.refundCount + ' tickets')));

      // Ventas por día
      const days = [];
      const d0 = new Date(range.from + 'T00:00'), d1 = new Date(range.to + 'T00:00');
      for (let d = new Date(d0); d <= d1 && days.length < 120; d.setDate(d.getDate() + 1)) {
        const k = C.dateKey(d);
        days.push({ label: d.getDate() + '/' + (d.getMonth() + 1), value: r.byDay.get(k) || 0 });
      }
      const hours = r.byHour.map((v, i) => ({ label: String(i).padStart(2, '0'), value: v })).filter((x, i) => x.value || (i >= 8 && i <= 23));
      const cats = [...r.byCategory.entries()].map(([id, v]) => { const c = App.category(id); return { label: c ? c.name : 'Sin categoría', value: v, color: c ? c.color : '#94a3b8' }; }).sort((a, b) => b.value - a.value);
      const methods = [{ label: 'Efectivo', value: r.byMethod.cash, color: 'var(--ok)' }, { label: 'Tarjeta', value: r.byMethod.card, color: 'var(--accent)' }, { label: 'Otros', value: r.byMethod.other || 0, color: 'var(--warn)' }];

      page.appendChild(h('div', { class: 'cols' },
        days.length > 1 ? h('div', { class: 'card span2' }, h('h3', null, 'Ventas por día'), bars(days, App.money, { vertical: true })) : null,
        h('div', { class: 'card' }, h('h3', null, 'Por hora'), bars(hours, App.money, { vertical: true })),
        h('div', { class: 'card' }, h('h3', null, 'Por forma de pago'), bars(methods, App.money)),
        h('div', { class: 'card' }, h('h3', null, 'Por categoría'), bars(cats, App.money)),
        h('div', { class: 'card' }, h('h3', null, 'IVA repercutido'),
          h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Tipo'), h('th', { class: 'r' }, 'Base'), h('th', { class: 'r' }, 'Cuota'), h('th', { class: 'r' }, 'Total'))),
            h('tbody', null, r.byTax.map((t) => h('tr', null, h('td', null, t.rate + '%'), h('td', { class: 'r' }, App.money(t.base)), h('td', { class: 'r' }, App.money(t.tax)), h('td', { class: 'r' }, App.money(t.gross))))))),
        h('div', { class: 'card span2' }, h('h3', null, 'Productos más vendidos'),
          h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Producto'), h('th', { class: 'r' }, 'Unidades'), h('th', { class: 'r' }, 'Importe'), h('th', { class: 'r' }, '% ventas'))),
            h('tbody', null, r.topProducts.slice(0, 20).map((p, i) => h('tr', null, h('td', null, i + 1), h('td', null, p.name), h('td', { class: 'r' }, C.formatQty(p.qty)), h('td', { class: 'r' }, App.money(p.total)),
              h('td', { class: 'r' }, r.net ? Math.round(p.total / r.net * 1000) / 10 + '%' : '—'))))))));
      void clear;
    }
  };
})();
