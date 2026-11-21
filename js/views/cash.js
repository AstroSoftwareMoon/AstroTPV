/*
 * AstroTPV · Caja: apertura, movimientos de efectivo, informe X y cierre Z
 */
(function () {
  'use strict';
  const { h, icon, toast, modal, clear, confirmDialog } = UI;
  const C = TPVCore;
  const DB = TPVDB;

  async function shiftData(shift) {
    const [sales, moves] = await Promise.all([DB.byIndex('sales', 'shiftId', shift.id), DB.byIndex('cashMoves', 'shiftId', shift.id)]);
    return { sales, moves, summary: C.shiftSummary(shift, sales, moves) };
  }

  /** Contador de billetes y monedas. Devuelve {total, counts} */
  function denominationCounter(onChange) {
    const counts = {};
    const totalEl = h('strong', { class: 'den-total' });
    const update = () => { const t = C.countDenominations(counts); totalEl.textContent = App.money(t); onChange(t, counts); };
    const grid = h('div', { class: 'den-grid' }, C.DENOMINATIONS_EUR.map((d) => {
      const inp = h('input', { class: 'input sm', type: 'number', min: 0, inputmode: 'numeric', placeholder: '0', oninput: () => { counts[d] = parseInt(inp.value, 10) || 0; update(); } });
      return h('label', { class: 'den ' + (d >= 500 ? 'bill' : 'coin') }, h('span', null, d >= 100 ? (d / 100) + ' €' : d + ' c'), inp);
    }));
    update();
    return h('div', { class: 'den-wrap' }, grid, h('div', { class: 'tot-row total' }, h('span', null, 'Total contado'), totalEl));
  }

  function reportNode(title, shift, summary, extra) {
    const m = App.money;
    const s = App.state.settings;
    const row = (a, b, cls) => h('div', { class: 't-row ' + (cls || '') }, h('span', null, a), h('span', null, b));
    return h('div', { class: 'ticket' },
      h('div', { class: 't-center t-big' }, s.businessName),
      h('div', { class: 't-center t-bold' }, title),
      h('div', { class: 't-sep' }),
      row('Apertura', C.formatDateTime(shift.openedAt)),
      shift.closedAt ? row('Cierre', C.formatDateTime(shift.closedAt)) : row('Emitido', C.formatDateTime(new Date())),
      row('Abierta por', shift.openedByName || ''),
      shift.closedByName ? row('Cerrada por', shift.closedByName) : null,
      h('div', { class: 't-sep' }),
      row('Nº ventas', String(summary.count)),
      row('Ventas brutas', m(summary.gross)),
      row('Devoluciones (' + summary.refundCount + ')', m(summary.refunds)),
      row('Descuentos', m(summary.discounts)),
      row('VENTAS NETAS', m(summary.net), 't-bold'),
      row('Ticket medio', m(summary.average)),
      h('div', { class: 't-sep' }),
      h('div', { class: 't-bold' }, 'Por forma de pago'),
      row('Efectivo', m(summary.byMethod.cash)),
      row('Tarjeta', m(summary.byMethod.card)),
      row('Otros', m(summary.byMethod.other || 0)),
      h('div', { class: 't-sep' }),
      h('div', { class: 't-bold' }, 'Desglose IVA'),
      summary.byTax.map((t) => row('IVA ' + t.rate + '%  base ' + m(t.base), m(t.tax))),
      h('div', { class: 't-sep' }),
      h('div', { class: 't-bold' }, 'Efectivo en caja'),
      row('Fondo inicial', m(summary.opening)),
      row('+ Cobros efectivo', m(summary.byMethod.cash)),
      row('+ Entradas', m(summary.cashIn)),
      row('− Salidas', m(summary.cashOut)),
      row('= Esperado', m(summary.expectedCash), 't-bold'),
      extra && extra.counted !== undefined ? [
        row('Contado', m(extra.counted), 't-bold'),
        row('Descuadre', (extra.counted - summary.expectedCash > 0 ? '+' : '') + m(extra.counted - summary.expectedCash), 't-bold'),
        extra.withdrawn ? row('Retirado', m(extra.withdrawn)) : null,
        extra.withdrawn !== undefined ? row('Fondo siguiente', m(extra.counted - (extra.withdrawn || 0))) : null
      ] : null,
      summary.topProducts.length ? [h('div', { class: 't-sep' }), h('div', { class: 't-bold' }, 'Productos más vendidos'),
        summary.topProducts.slice(0, 10).map((p) => row(C.formatQty(p.qty) + ' × ' + p.name, m(p.total)))] : null,
      h('div', { class: 't-sep' }),
      h('div', { class: 't-center t-small' }, 'AstroTPV')
    );
  }

  const view = {
    async render(main) {
      const shift = App.state.shift;
      const page = h('div', { class: 'page' });
      main.appendChild(page);
      if (!shift) {
        const last = (await DB.all('shifts')).filter((x) => x.status === 'closed').sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0];
        UI.add(page, 
          h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Caja'), h('p', { class: 'muted' }, 'La caja está cerrada'))),
          h('div', { class: 'hero-card' },
            h('div', { class: 'hero-icon' }, icon('cash', 48)),
            h('h2', null, 'Abrir caja'),
            h('p', { class: 'muted' }, last ? 'Último cierre: ' + C.formatDateTime(last.closedAt) + ' · fondo dejado ' + App.money(last.nextFloat || 0) : 'Introduce el fondo de caja inicial para empezar a vender.'),
            h('button', { class: 'btn primary xl', onclick: async () => { if (await view.openShiftDialog()) App.refresh(); } }, icon('check'), 'Abrir caja')));
        await renderHistory(page);
        return;
      }
      const { sales, moves, summary } = await shiftData(shift);
      const stat = (label, value, cls, sub) => h('div', { class: 'stat ' + (cls || '') }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value' }, value), sub ? h('small', { class: 'muted' }, sub) : null);
      UI.add(page, 
        h('div', { class: 'page-head' },
          h('div', null, h('h1', null, 'Caja abierta'), h('p', { class: 'muted' }, 'Desde ' + C.formatDateTime(shift.openedAt) + ' · ' + (shift.openedByName || ''))),
          h('div', { class: 'row gap wrap' },
            h('button', { class: 'btn', onclick: () => cashMove('in') }, icon('plus'), 'Entrada'),
            h('button', { class: 'btn', onclick: () => cashMove('out') }, icon('minus'), 'Salida'),
            h('button', { class: 'btn', onclick: () => UI.printNode(reportNode('INFORME X (parcial)', shift, summary), App.state.settings.paperWidth) }, icon('print'), 'Informe X'),
            h('button', { class: 'btn danger', onclick: closeShift }, icon('lock'), 'Cerrar caja (Z)'))),
        h('div', { class: 'stats' },
          stat('Ventas netas', App.money(summary.net), 'accent', summary.count + ' tickets'),
          stat('Efectivo esperado', App.money(summary.expectedCash), '', 'en cajón'),
          stat('Tarjeta', App.money(summary.byMethod.card), ''),
          stat('Ticket medio', App.money(summary.average), ''),
          stat('Devoluciones', App.money(summary.refunds), summary.refunds ? 'warn' : '', summary.refundCount + ' tickets')),
        h('div', { class: 'cols' },
          h('div', { class: 'card' },
            h('h3', null, 'Cuadre de efectivo'),
            h('div', { class: 'kv' },
              kv('Fondo inicial', App.money(summary.opening)),
              kv('Cobros en efectivo', App.money(summary.byMethod.cash)),
              kv('Entradas de caja', '+' + App.money(summary.cashIn)),
              kv('Salidas de caja', '−' + App.money(summary.cashOut)),
              kv('Efectivo esperado', App.money(summary.expectedCash), 'big')),
            h('h3', null, 'IVA'),
            h('div', { class: 'kv' }, summary.byTax.map((t) => kv('IVA ' + t.rate + '% (base ' + App.money(t.base) + ')', App.money(t.tax))))),
          h('div', { class: 'card' },
            h('h3', null, 'Movimientos de efectivo'),
            moves.length ? h('div', { class: 'kv' }, moves.sort((a, b) => b.date.localeCompare(a.date)).map((m) =>
              kv(C.formatTime(m.date) + ' · ' + (m.reason || (m.type === 'in' ? 'Entrada' : 'Salida')), (m.type === 'in' ? '+' : '−') + App.money(m.amount), m.type === 'in' ? 'pos' : 'neg')))
              : h('p', { class: 'muted' }, 'Sin entradas ni salidas.'),
            h('h3', null, 'Más vendidos del turno'),
            summary.topProducts.length ? h('div', { class: 'kv' }, summary.topProducts.slice(0, 8).map((p) => kv(C.formatQty(p.qty) + ' × ' + p.name, App.money(p.total))))
              : h('p', { class: 'muted' }, 'Aún no hay ventas.'))));
      void sales;
      await renderHistory(page);
    },

    async openShiftDialog() {
      const last = (await DB.all('shifts')).filter((x) => x.status === 'closed').sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0];
      let amount = last ? last.nextFloat || 0 : 0;
      const pad = UI.moneyPad(amount, (c) => { amount = c; });
      const res = await modal({
        title: 'Abrir caja',
        body: h('div', null, h('p', { class: 'muted' }, 'Fondo de caja inicial (efectivo en el cajón):'), pad),
        actions: [{ label: 'Cancelar', value: null }, { label: 'Abrir caja', class: 'primary', value: true }]
      });
      if (!res) return false;
      const open = await DB.byIndex('shifts', 'status', 'open');
      if (open.length) { await App.loadShift(); return true; }
      const shift = { id: DB.uid(), status: 'open', openedAt: new Date().toISOString(), openingFloat: amount, openedBy: App.state.user.id, openedByName: App.state.user.name };
      await DB.put('shifts', shift);
      App.audit('shift_open', App.money(amount));
      await App.loadShift();
      toast('Caja abierta con ' + App.money(amount), 'ok');
      return true;
    }
  };

  function kv(k, v, cls) { return h('div', { class: 'kv-row ' + (cls || '') }, h('span', null, k), h('strong', null, v)); }

  async function cashMove(type) {
    let amount = 0;
    const reason = h('input', { class: 'input', type: 'text', placeholder: type === 'in' ? 'Ej.: cambio, ingreso' : 'Ej.: pago proveedor, retirada' });
    const pad = UI.moneyPad(0, (c) => { amount = c; });
    const res = await modal({
      title: type === 'in' ? 'Entrada de efectivo' : 'Salida de efectivo',
      body: h('div', null, h('div', { class: 'field' }, h('label', null, 'Motivo'), reason), pad),
      actions: [{ label: 'Cancelar', value: null }, { label: 'Registrar', class: 'primary', onClick: () => amount > 0 || (toast('Importe no válido', 'error'), false) }]
    });
    if (!res) return;
    if (type === 'out' && !(await App.requireAdmin('sacar dinero de la caja'))) return;
    await DB.put('cashMoves', { id: DB.uid(), shiftId: App.state.shift.id, date: new Date().toISOString(), type, amount, reason: reason.value.trim(), userId: App.state.user.id, userName: App.state.user.name });
    App.audit('cash_' + type, App.money(amount) + ' ' + reason.value);
    toast('Movimiento registrado', 'ok');
    App.refresh();
  }

  async function closeShift() {
    const shift = App.state.shift;
    const orders = await DB.all('orders');
    if (orders.length && !(await confirmDialog('Hay ' + orders.length + ' mesas/tickets abiertos sin cobrar. Seguirán abiertos para el siguiente turno. ¿Cerrar caja igualmente?', { ok: 'Continuar' }))) return;
    const { summary } = await shiftData(shift);
    let counted = 0;
    const diffEl = h('div', { class: 'diff' });
    const withdraw = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '0,00' });
    const updateDiff = () => {
      const d = counted - summary.expectedCash;
      UI.add(clear(diffEl), 
        h('div', { class: 'kv-row' }, h('span', null, 'Esperado'), h('strong', null, App.money(summary.expectedCash))),
        h('div', { class: 'kv-row big ' + (d === 0 ? 'pos' : d > 0 ? 'warn' : 'neg') }, h('span', null, d === 0 ? 'Cuadra' : d > 0 ? 'Sobra' : 'Falta'), h('strong', null, App.money(Math.abs(d)))));
    };
    const counter = denominationCounter((t) => { counted = t; updateDiff(); });
    updateDiff();
    const res = await modal({
      title: 'Cierre de caja (Z)', size: 'wide',
      body: h('div', { class: 'close-shift' },
        h('div', null, h('h3', null, 'Cuenta el efectivo del cajón'), counter),
        h('div', null,
          h('div', { class: 'stats mini' },
            h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Ventas netas'), h('strong', { class: 'stat-value' }, App.money(summary.net))),
            h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Tarjeta'), h('strong', { class: 'stat-value' }, App.money(summary.byMethod.card)))),
          diffEl,
          h('div', { class: 'field' }, h('label', null, 'Efectivo que se retira (el resto queda de fondo)'), withdraw))),
      actions: [{ label: 'Cancelar', value: null }, { label: 'Cerrar caja e imprimir Z', class: 'primary', icon: 'lock', value: true }]
    });
    if (!res) return;
    const withdrawn = Math.min(C.toCents(withdraw.value), counted);
    if (counted !== summary.expectedCash && !(await confirmDialog('Hay un descuadre de ' + App.money(counted - summary.expectedCash) + '. ¿Cerrar igualmente?', { ok: 'Cerrar caja' }))) return;
    const closed = Object.assign({}, shift, {
      status: 'closed', closedAt: new Date().toISOString(), closedBy: App.state.user.id, closedByName: App.state.user.name,
      counted, expected: summary.expectedCash, difference: counted - summary.expectedCash, withdrawn, nextFloat: counted - withdrawn,
      summary: { net: summary.net, gross: summary.gross, refunds: summary.refunds, count: summary.count, byMethod: summary.byMethod }
    });
    await DB.tx(['shifts', 'meta'], 'readwrite', async (a) => {
      const zn = await DB.nextSeq(a, 'seq:Z');
      closed.zNumber = zn;
      await a.put('shifts', closed);
    });
    App.audit('shift_close', 'Z' + closed.zNumber + ' ' + App.money(summary.net) + ' descuadre ' + App.money(closed.difference));
    App.state.shift = null;
    App.updateHeader();
    UI.printNode(reportNode('CIERRE Z Nº ' + closed.zNumber, closed, summary, { counted, withdrawn }), App.state.settings.paperWidth);
    toast('Caja cerrada', 'ok');
    App.refresh();
  }

  async function renderHistory(page) {
    const shifts = (await DB.all('shifts')).filter((s) => s.status === 'closed').sort((a, b) => b.closedAt.localeCompare(a.closedAt)).slice(0, 30);
    if (!shifts.length) return;
    page.appendChild(h('h2', { class: 'zone-title' }, 'Cierres anteriores'));
    page.appendChild(h('div', { class: 'card' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, h('th', null, 'Z'), h('th', null, 'Apertura'), h('th', null, 'Cierre'), h('th', { class: 'r' }, 'Ventas'), h('th', { class: 'r' }, 'Netas'), h('th', { class: 'r' }, 'Descuadre'), h('th', null, ''))),
      h('tbody', null, shifts.map((s) => h('tr', null,
        h('td', null, 'Z' + (s.zNumber || '')),
        h('td', null, C.formatDateTime(s.openedAt)),
        h('td', null, C.formatDateTime(s.closedAt)),
        h('td', { class: 'r' }, s.summary ? s.summary.count : ''),
        h('td', { class: 'r' }, s.summary ? App.money(s.summary.net) : ''),
        h('td', { class: 'r ' + (s.difference ? (s.difference > 0 ? 'warn' : 'neg') : 'pos') }, App.money(s.difference || 0)),
        h('td', { class: 'r' }, h('button', { class: 'icon-btn', title: 'Reimprimir Z', onclick: async () => {
          const { summary } = await shiftData(s);
          UI.printNode(reportNode('CIERRE Z Nº ' + s.zNumber + ' (copia)', s, summary, { counted: s.counted, withdrawn: s.withdrawn }), App.state.settings.paperWidth);
        } }, icon('print', 18)))))))));
  }

  App.views.cash = view;
})();
