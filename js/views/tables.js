/*
 * AstroTPV · Vista de mesas y pedidos aparcados
 */
(function () {
  'use strict';
  const { h, icon, clear } = UI;
  const C = TPVCore;
  const DB = TPVDB;
  let timer = null;

  function elapsed(iso) {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return mins + ' min';
    return Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min';
  }

  App.views.tables = {
    async render(main) {
      if (App.state.cart.orderId) await App.closeOrder();
      const tables = C.parseTables(App.state.settings.tables);
      const orders = await DB.all('orders');
      const byTable = new Map(orders.filter((o) => o.table).map((o) => [o.table, o]));
      const parked = orders.filter((o) => !o.table || !tables.includes(o.table));

      // Agrupar por zona (prefijo sin número)
      const zones = new Map();
      for (const t of tables) {
        const z = t.replace(/\s*\d+$/, '') || 'Mesas';
        if (!zones.has(z)) zones.set(z, []);
        zones.get(z).push(t);
      }
      const busyCount = tables.filter((t) => byTable.has(t)).length;
      const openTotal = orders.reduce((a, o) => a + C.cartTotals(o.lines, o.discount).total, 0);

      const wrap = h('div', { class: 'page' },
        h('div', { class: 'page-head' },
          h('div', null, h('h1', null, 'Mesas'), h('p', { class: 'muted' }, busyCount + ' de ' + tables.length + ' ocupadas · ' + App.money(openTotal) + ' pendiente de cobro')),
          h('div', { class: 'row gap' },
            h('span', { class: 'legend free' }, 'Libre'), h('span', { class: 'legend busy' }, 'Ocupada'), h('span', { class: 'legend late' }, '+45 min'))));

      for (const [zone, list] of zones) {
        wrap.appendChild(h('h2', { class: 'zone-title' }, zone));
        wrap.appendChild(h('div', { class: 'tables-grid' }, list.map((t) => {
          const o = byTable.get(t);
          const total = o ? C.cartTotals(o.lines, o.discount).total : 0;
          const late = o && Date.now() - new Date(o.createdAt).getTime() > 45 * 60000;
          return h('button', {
            class: 'table-tile' + (o ? ' busy' : '') + (late ? ' late' : ''),
            onclick: () => App.openOrder(o || t)
          },
          h('span', { class: 'tt-name' }, t),
          o ? h('span', { class: 'tt-total' }, App.money(total)) : h('span', { class: 'tt-free' }, 'Libre'),
          o ? h('span', { class: 'tt-meta', dataset: { since: o.createdAt, units: o.lines.reduce((a, l) => a + l.qty, 0) + ' uds' } }, icon('history', 14), ' ', elapsed(o.createdAt), ' · ', o.lines.reduce((a, l) => a + l.qty, 0) + ' uds') : null,
          o && o.userName ? h('span', { class: 'tt-user' }, o.userName) : null);
        })));
      }

      wrap.appendChild(h('h2', { class: 'zone-title' }, 'Tickets aparcados'));
      if (!parked.length) wrap.appendChild(h('p', { class: 'muted' }, 'No hay tickets aparcados. Usa «Aparcar» en la pantalla de venta.'));
      else wrap.appendChild(h('div', { class: 'tables-grid' }, parked.map((o) => h('button', { class: 'table-tile busy parked', onclick: () => App.openOrder(o) },
        h('span', { class: 'tt-name' }, o.name || o.table || 'Pedido'),
        h('span', { class: 'tt-total' }, App.money(C.cartTotals(o.lines, o.discount).total)),
        h('span', { class: 'tt-meta' }, elapsed(o.createdAt))))));

      main.appendChild(wrap);
      timer = setInterval(() => {
        main.querySelectorAll('[data-since]').forEach((el) => {
          UI.add(clear(el), icon('history', 14), ' ' + elapsed(el.dataset.since) + ' · ' + el.dataset.units);
        });
      }, 60000);
    },
    destroy() { clearInterval(timer); }
  };
})();
