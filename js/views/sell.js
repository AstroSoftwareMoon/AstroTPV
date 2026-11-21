/*
 * AstroTPV · Vista de venta (TPV táctil + lector de códigos de barras)
 */
(function () {
  'use strict';
  const { h, icon, toast, modal, clear, confirmDialog, promptDialog } = UI;
  const C = TPVCore;
  const DB = TPVDB;

  let els = {};
  let filter = { cat: 'fav', q: '' };
  let scanBuf = '', scanTime = 0;

  const view = {
    async render(main) {
      const cart = App.state.cart;
      if (filter.cat === 'fav' && !App.state.products.some((p) => p.favorite && p.active !== false)) filter.cat = 'all';

      els.search = h('input', {
        class: 'input search', type: 'search', placeholder: 'Buscar o escanear código…  (F9)', value: filter.q, autocomplete: 'off',
        oninput: () => { filter.q = els.search.value; renderGrid(); },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); scanOrSearch(els.search.value); } }
      });
      els.cats = h('div', { class: 'chips' });
      els.grid = h('div', { class: 'grid-products' });
      els.lines = h('div', { class: 'cart-lines' });
      els.totals = h('div', { class: 'cart-totals' });
      els.title = h('div', { class: 'cart-title' });

      const left = h('section', { class: 'sell-left' },
        h('div', { class: 'sell-toolbar' },
          h('div', { class: 'search-wrap' }, icon('search', 18), els.search),
          h('button', { class: 'btn', onclick: freeItem, title: 'Artículo libre (importe manual)' }, icon('tag'), h('span', { class: 'hide-sm' }, 'Libre'))),
        els.cats, els.grid);

      const right = h('section', { class: 'sell-right' },
        els.title,
        els.lines,
        els.totals,
        h('div', { class: 'cart-actions' },
          h('button', { class: 'btn', onclick: clearCart, title: 'Vaciar ticket' }, icon('trash'), h('span', null, 'Vaciar')),
          h('button', { class: 'btn', onclick: globalDiscount }, icon('percent'), h('span', null, 'Dto.')),
          h('button', { class: 'btn', onclick: editNote }, icon('note'), h('span', null, 'Nota')),
          h('button', { class: 'btn', onclick: kitchen, title: 'Imprimir comanda' }, icon('print'), h('span', null, 'Comanda')),
          h('button', { class: 'btn', onclick: park, title: cart.orderId ? 'Guardar y volver a mesas' : 'Aparcar ticket / asignar a mesa' }, icon('pause'), h('span', null, cart.orderId ? 'Guardar' : 'Aparcar')),
          h('button', { class: 'btn', onclick: split, title: 'Dividir cuenta' }, icon('split'), h('span', null, 'Dividir'))),
        h('button', { class: 'btn primary xl pay-btn', id: 'pay-btn', onclick: () => charge() }, icon('cash', 24), h('span', null, 'Cobrar'), h('span', { class: 'pay-amount', id: 'pay-amount' })));

      UI.add(main, h('div', { class: 'sell' }, left, right));
      renderCats();
      renderGrid();
      renderCart();
    },
    onKey(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.key === 'F9') { e.preventDefault(); els.search.focus(); return; }
      if (e.key === 'F4' || (e.key === 'Enter' && e.ctrlKey)) { e.preventDefault(); charge(); return; }
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      // Lector de códigos (teclado HID): caracteres rápidos terminados en Enter
      const now = Date.now();
      if (now - scanTime > 80) scanBuf = '';
      scanTime = now;
      if (e.key === 'Enter') {
        if (scanBuf.length >= 3) { e.preventDefault(); scanOrSearch(scanBuf); }
        scanBuf = '';
      } else if (e.key.length === 1) {
        scanBuf += e.key;
      }
    },
    destroy() { els = {}; }
  };

  function scanOrSearch(q) {
    q = String(q || '').trim();
    if (!q) return;
    const exact = App.state.products.find((p) => p.active !== false && ((p.barcode && p.barcode === q) || (p.sku && p.sku.toLowerCase() === q.toLowerCase())));
    // Soporta "3*codigo" para cantidad
    const m = q.match(/^(\d+(?:[.,]\d+)?)\*(.+)$/);
    if (!exact && m) {
      const p2 = App.state.products.find((p) => p.barcode === m[2] || (p.sku && p.sku === m[2]));
      if (p2) { add(p2, parseFloat(m[1].replace(',', '.'))); return clearSearch(); }
    }
    if (exact) { add(exact); return clearSearch(); }
    const found = C.findProducts(App.state.products.filter((p) => p.active !== false), q);
    if (found.length === 1) { add(found[0]); return clearSearch(); }
    if (!found.length) toast('No se encontró "' + q + '"', 'error');
    filter.q = q; if (els.search) els.search.value = q; renderGrid();
  }
  function clearSearch() { filter.q = ''; if (els.search) els.search.value = ''; renderGrid(); }

  function add(p, qty) {
    if (App.addToCart(p, qty)) {
      renderCart(p.id);
      if (els.grid) renderGrid();
    }
  }

  function renderCats() {
    clear(els.cats);
    const chip = (id, label, color) => h('button', {
      class: 'chip' + (filter.cat === id ? ' active' : ''), style: color ? { '--c': color } : null,
      onclick: () => { filter.cat = id; renderCats(); renderGrid(); }
    }, label);
    UI.add(els.cats, chip('fav', '★ Favoritos'), chip('all', 'Todos'), App.state.categories.map((c) => chip(c.id, c.name, c.color)));
  }

  function renderGrid() {
    if (!els.grid) return;
    clear(els.grid);
    let list = App.state.products.filter((p) => p.active !== false);
    if (filter.q) list = C.findProducts(list, filter.q);
    else if (filter.cat === 'fav') list = list.filter((p) => p.favorite);
    else if (filter.cat !== 'all') list = list.filter((p) => p.categoryId === filter.cat);
    if (!list.length) { els.grid.appendChild(h('div', { class: 'empty' }, 'No hay productos. Añádelos en Stock.')); return; }
    for (const p of list) {
      const cat = App.category(p.categoryId);
      let badge = null;
      if (p.trackStock) {
        const cls = p.stock <= 0 ? 'out' : p.stock <= (p.minStock || 0) ? 'low' : '';
        badge = h('span', { class: 'stock-badge ' + cls }, C.formatQty(p.stock));
      }
      els.grid.appendChild(h('button', {
        class: 'product-tile', style: { '--c': (cat && cat.color) || '#64748b' },
        onclick: () => add(p),
        oncontextmenu: (e) => { e.preventDefault(); addWithQty(p); }
      }, App.productImage(p, cat), h('span', { class: 'pt-info' }, h('span', { class: 'pt-name' }, p.name), h('span', { class: 'pt-price' }, App.money(p.price))), badge));
    }
  }

  async function addWithQty(p) {
    const v = await promptDialog('Cantidad · ' + p.name, { value: '1', inputmode: 'decimal' });
    if (v === null) return;
    const q = parseFloat(String(v).replace(',', '.'));
    if (q > 0) add(p, q);
  }

  function renderCart(flashId) {
    if (!els.lines) return;
    const cart = App.state.cart;
    clear(els.title);
    UI.add(els.title, 
      h('div', null,
        h('strong', null, cart.table || (cart.orderId ? (cart.name || 'Pedido') : 'Venta directa')),
        cart.createdAt && cart.orderId ? h('small', { class: 'muted' }, ' · desde ' + C.formatTime(cart.createdAt)) : null),
      cart.orderId ? h('div', { class: 'row gap' },
        h('button', { class: 'btn sm', onclick: moveTable, title: 'Cambiar de mesa' }, icon('move', 16), 'Mover'),
        h('button', { class: 'btn sm', onclick: async () => { await App.closeOrder(); App.go('tables'); }, title: 'Volver' }, icon('x', 16))) : null);

    clear(els.lines);
    if (!cart.lines.length) {
      els.lines.appendChild(h('div', { class: 'empty small' }, icon('cart', 36), h('p', null, 'Toca un producto o escanea un código')));
    }
    cart.lines.forEach((l, idx) => {
      const prod = l.productId ? App.product(l.productId) : null;
      const row = h('div', { class: 'cart-line' + (flashId && l.productId === flashId ? ' flash' : '') },
        App.productImage(prod || { name: l.name, emoji: '🏷️' }, prod ? App.category(prod.categoryId) : null, 'xs'),
        h('div', { class: 'cl-main', onclick: () => editLine(idx) },
          h('div', { class: 'cl-name' }, l.name),
          h('div', { class: 'cl-sub muted' }, C.formatQty(l.qty) + ' × ' + App.money(l.unitPrice),
            l.discountPct ? ' · −' + l.discountPct + '%' : '', l.note ? ' · ' + l.note : '')),
        h('div', { class: 'cl-qty' },
          h('button', { class: 'icon-btn', 'aria-label': 'Menos', onclick: () => changeQty(idx, -1) }, icon('minus', 16)),
          h('span', null, C.formatQty(l.qty)),
          h('button', { class: 'icon-btn', 'aria-label': 'Más', onclick: () => changeQty(idx, 1) }, icon('plus', 16))),
        h('div', { class: 'cl-total' }, App.money(C.lineTotal(l))));
      els.lines.appendChild(row);
    });
    if (flashId) { const f = els.lines.querySelector('.flash'); if (f) f.scrollIntoView({ block: 'nearest' }); }

    const t = C.cartTotals(cart.lines, cart.discount);
    clear(els.totals);
    UI.add(els.totals, 
      t.discount ? h('div', { class: 'tot-row' }, h('span', null, 'Subtotal'), h('span', null, App.money(t.subtotal))) : null,
      t.discount ? h('div', { class: 'tot-row disc' }, h('span', null, 'Descuento' + (cart.discount.type === 'pct' ? ' ' + cart.discount.value + '%' : '')), h('span', null, '−' + App.money(t.discount))) : null,
      h('div', { class: 'tot-row muted small' }, h('span', null, C.formatQty(t.items) + ' artículos · IVA incl.'), h('span', null, 'IVA ' + App.money(t.taxTotal))),
      cart.note ? h('div', { class: 'tot-note' }, icon('note', 14), ' ', cart.note) : null,
      h('div', { class: 'tot-row total' }, h('span', null, 'TOTAL'), h('span', null, App.money(t.total))));
    const pa = document.getElementById('pay-amount');
    if (pa) pa.textContent = App.money(t.total);
    const pb = document.getElementById('pay-btn');
    if (pb) pb.disabled = !cart.lines.length;
  }

  function changeQty(idx, delta) {
    const l = App.state.cart.lines[idx];
    if (!l) return;
    if (delta > 0 && l.productId) {
      const p = App.product(l.productId);
      if (p && p.trackStock && !App.state.settings.allowNegativeStock) {
        const inCart = App.state.cart.lines.filter((x) => x.productId === p.id).reduce((a, x) => a + x.qty, 0);
        if (p.stock - inCart < delta) { toast('Sin stock suficiente', 'error'); return; }
      }
    }
    l.qty = Math.round((l.qty + delta) * 1000) / 1000;
    if (l.qty <= 0) App.state.cart.lines.splice(idx, 1);
    App.cartChanged();
    renderCart();
  }

  async function editLine(idx) {
    const l = App.state.cart.lines[idx];
    const qty = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: C.formatQty(l.qty) });
    const price = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: C.centsToInput(l.unitPrice) });
    const disc = h('input', { class: 'input', type: 'number', min: 0, max: 100, step: 1, value: l.discountPct || 0 });
    const note = h('input', { class: 'input', type: 'text', value: l.note || '', placeholder: 'Ej.: sin hielo, poco hecho…' });
    const res = await modal({
      title: l.name,
      body: h('div', { class: 'form-grid' },
        h('div', { class: 'field' }, h('label', null, 'Cantidad'), qty),
        h('div', { class: 'field' }, h('label', null, 'Precio unitario (€)'), price),
        h('div', { class: 'field' }, h('label', null, 'Descuento (%)'), disc),
        h('div', { class: 'field full' }, h('label', null, 'Nota para cocina / ticket'), note),
        h('div', { class: 'quick full' }, [10, 20, 50, 100].map((d) => h('button', { class: 'btn sm', type: 'button', onclick: () => { disc.value = d; } }, d === 100 ? 'Invitación' : '−' + d + '%')))),
      actions: [
        { label: 'Eliminar', class: 'danger', icon: 'trash', value: 'delete' },
        { label: 'Cancelar', value: null },
        { label: 'Aplicar', class: 'primary', value: 'ok' }
      ]
    });
    if (res === 'delete') {
      App.state.cart.lines.splice(idx, 1);
    } else if (res === 'ok') {
      const newPrice = C.toCents(price.value);
      const newDisc = Math.min(100, Math.max(0, parseFloat(disc.value) || 0));
      if ((newPrice < l.unitPrice || newDisc > (l.discountPct || 0)) && !(await App.requireAdmin('cambiar precio o descuento'))) return;
      const q = parseFloat(String(qty.value).replace(',', '.'));
      l.qty = q > 0 ? Math.round(q * 1000) / 1000 : l.qty;
      l.unitPrice = newPrice;
      l.discountPct = newDisc;
      l.note = note.value.trim();
    } else return;
    App.cartChanged();
    renderCart();
  }

  async function freeItem() {
    let cents = 0;
    const name = h('input', { class: 'input', type: 'text', value: 'Varios', placeholder: 'Concepto' });
    const taxSel = h('select', { class: 'input' }, App.state.settings.taxRates.map((r) => h('option', { value: r, selected: r === App.state.settings.defaultTax }, 'IVA ' + r + '%')));
    const pad = UI.moneyPad(0, (c) => { cents = c; });
    const res = await modal({
      title: 'Artículo libre',
      body: h('div', null, h('div', { class: 'form-grid' }, h('div', { class: 'field' }, h('label', null, 'Concepto'), name), h('div', { class: 'field' }, h('label', null, 'IVA'), taxSel)), pad),
      actions: [{ label: 'Cancelar', value: null }, { label: 'Añadir', class: 'primary', onClick: () => cents > 0 || (toast('Introduce un importe', 'error'), false) }]
    });
    if (!res) return;
    App.state.cart.lines.push({ id: DB.uid(), productId: null, name: name.value.trim() || 'Varios', unitPrice: cents, tax: Number(taxSel.value), qty: 1, discountPct: 0, cost: 0, note: '' });
    if (!App.state.cart.createdAt) App.state.cart.createdAt = new Date().toISOString();
    App.cartChanged();
    renderCart();
  }

  async function clearCart() {
    const cart = App.state.cart;
    if (!cart.lines.length) return;
    if (!(await confirmDialog('¿Vaciar el ticket actual?', { ok: 'Vaciar', danger: true }))) return;
    App.audit('cart_clear', cart.lines.map((l) => l.qty + 'x ' + l.name).join(', '));
    cart.lines = [];
    cart.discount = null;
    cart.note = '';
    if (cart.orderId) { await DB.del('orders', cart.orderId); App.state.cart = App.newCart(); await App.persistCart(); }
    App.cartChanged();
    App.refresh();
  }

  async function globalDiscount() {
    const cart = App.state.cart;
    const type = h('select', { class: 'input' }, h('option', { value: 'pct' }, 'Porcentaje (%)'), h('option', { value: 'amount' }, 'Importe (€)'));
    const val = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: '' });
    if (cart.discount) {
      type.value = cart.discount.type;
      val.value = cart.discount.type === 'pct' ? cart.discount.value : C.centsToInput(cart.discount.value);
    }
    const res = await modal({
      title: 'Descuento en el ticket',
      body: h('div', { class: 'form-grid' }, h('div', { class: 'field' }, h('label', null, 'Tipo'), type), h('div', { class: 'field' }, h('label', null, 'Valor'), val),
        h('div', { class: 'quick full' }, [5, 10, 15, 20].map((d) => h('button', { class: 'btn sm', type: 'button', onclick: () => { type.value = 'pct'; val.value = d; } }, d + '%')))),
      actions: [{ label: 'Quitar', value: 'remove' }, { label: 'Cancelar', value: null }, { label: 'Aplicar', class: 'primary', value: 'ok' }]
    });
    if (res === 'remove') cart.discount = null;
    else if (res === 'ok') {
      if (!(await App.requireAdmin('aplicar un descuento'))) return;
      const v = type.value === 'pct' ? Math.min(100, Math.max(0, parseFloat(String(val.value).replace(',', '.')) || 0)) : C.toCents(val.value);
      cart.discount = v ? { type: type.value, value: v } : null;
    } else return;
    App.cartChanged();
    renderCart();
  }

  async function editNote() {
    const v = await promptDialog('Nota del ticket', { value: App.state.cart.note, multiline: true });
    if (v === null) return;
    App.state.cart.note = v.trim();
    App.cartChanged();
    renderCart();
  }

  function kitchen() {
    if (!App.state.cart.lines.length) return toast('El ticket está vacío', 'error');
    App.printKitchen(App.state.cart);
  }

  async function park() {
    const cart = App.state.cart;
    if (cart.orderId) {
      await App.persistCart();
      toast('Guardado en ' + (cart.table || cart.name));
      await App.closeOrder();
      return App.go('tables');
    }
    if (!cart.lines.length) return toast('El ticket está vacío', 'error');
    const tables = C.parseTables(App.state.settings.tables);
    const orders = await DB.all('orders');
    const busy = new Set(orders.map((o) => o.table).filter(Boolean));
    const nameInput = h('input', { class: 'input', type: 'text', placeholder: 'Nombre del cliente o referencia (opcional)' });
    const res = await modal({
      title: 'Aparcar ticket',
      size: 'wide',
      body: (close) => h('div', null,
        h('div', { class: 'field' }, h('label', null, 'Aparcar con nombre'), h('div', { class: 'row gap' }, nameInput, h('button', { class: 'btn primary', onclick: () => close({ name: nameInput.value.trim() || 'Pedido ' + C.formatTime(new Date()) }) }, 'Aparcar'))),
        h('p', { class: 'muted' }, 'O asignar a una mesa libre:'),
        h('div', { class: 'tables-mini' }, tables.map((t) => h('button', { class: 'table-mini' + (busy.has(t) ? ' busy' : ''), disabled: busy.has(t), onclick: () => close({ table: t }) }, t))))
    });
    if (!res) return;
    const id = DB.uid();
    App.state.cart = Object.assign(App.newCart(), cart, { orderId: id, table: res.table || null, name: res.table || res.name, createdAt: cart.createdAt || new Date().toISOString() });
    await App.persistCart();
    await DB.put('meta', { key: 'currentCart', cart: App.newCart() });
    toast('Ticket aparcado: ' + (res.table || res.name), 'ok');
    App.state.cart = App.newCart();
    App.refresh();
  }

  async function moveTable() {
    const cart = App.state.cart;
    const tables = C.parseTables(App.state.settings.tables);
    const orders = await DB.all('orders');
    const byTable = new Map(orders.filter((o) => o.table).map((o) => [o.table, o]));
    const target = await modal({
      title: 'Mover ' + (cart.table || cart.name) + ' a…',
      size: 'wide',
      body: (close) => h('div', null,
        h('p', { class: 'muted' }, 'Si la mesa destino está ocupada, los pedidos se juntarán.'),
        h('div', { class: 'tables-mini' }, tables.filter((t) => t !== cart.table).map((t) =>
          h('button', { class: 'table-mini' + (byTable.has(t) ? ' busy' : ''), onclick: () => close(t) }, t))))
    });
    if (!target) return;
    const dest = byTable.get(target);
    if (dest) {
      dest.lines = dest.lines.concat(cart.lines);
      dest.updatedAt = new Date().toISOString();
      await DB.put('orders', dest);
      await DB.del('orders', cart.orderId);
      App.state.cart = Object.assign(App.newCart(), dest, { orderId: dest.id });
      toast('Pedidos unidos en ' + target, 'ok');
    } else {
      cart.table = target;
      cart.name = target;
      await App.persistCart();
      toast('Movido a ' + target, 'ok');
    }
    App.audit('move_table', target);
    App.refresh();
  }

  /** Selector de cantidades por línea (dividir cuenta / devoluciones) */
  async function pickQuantities(title, items, okLabel) {
    const sel = items.map(() => 0);
    const rows = h('div', { class: 'pick-list' });
    const totalEl = h('strong');
    const render = () => {
      clear(rows);
      items.forEach((it, i) => {
        rows.appendChild(h('div', { class: 'pick-row' },
          h('div', null, h('div', null, it.name), h('small', { class: 'muted' }, C.formatQty(it.max) + ' × ' + App.money(it.unitPrice))),
          h('div', { class: 'cl-qty' },
            h('button', { class: 'icon-btn', onclick: () => { sel[i] = Math.max(0, sel[i] - 1); render(); } }, icon('minus', 16)),
            h('span', null, C.formatQty(sel[i]) + '/' + C.formatQty(it.max)),
            h('button', { class: 'icon-btn', onclick: () => { sel[i] = Math.min(it.max, sel[i] + 1); render(); } }, icon('plus', 16)),
            h('button', { class: 'btn sm', onclick: () => { sel[i] = it.max; render(); } }, 'Todo'))));
      });
      const tot = items.reduce((a, it, i) => a + C.lineTotal({ unitPrice: it.unitPrice, qty: sel[i], discountPct: it.discountPct }), 0);
      totalEl.textContent = App.money(tot);
    };
    render();
    const res = await modal({
      title, size: 'wide',
      body: h('div', null, rows, h('div', { class: 'tot-row total' }, h('span', null, 'Seleccionado'), totalEl)),
      actions: [{ label: 'Cancelar', value: null }, { label: okLabel || 'Continuar', class: 'primary', onClick: () => sel.some((x) => x > 0) ? sel.slice() : (toast('Selecciona al menos una unidad', 'error'), false) }]
    });
    return res;
  }
  App.pickQuantities = pickQuantities;

  async function split() {
    const cart = App.state.cart;
    if (!cart.lines.length) return toast('El ticket está vacío', 'error');
    // Opción rápida: dividir a partes iguales
    const mode = await modal({
      title: 'Dividir cuenta',
      body: h('p', null, '¿Cómo quieres dividir la cuenta?'),
      actions: [
        { label: 'Por productos', class: 'primary', value: 'items' },
        { label: 'A partes iguales', value: 'equal' }
      ]
    });
    if (mode === 'equal') return splitEqual();
    if (mode !== 'items') return;
    const items = cart.lines.map((l) => ({ name: l.name, max: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct }));
    const sel = await pickQuantities('Selecciona lo que se cobra ahora', items, 'Cobrar selección');
    if (!sel) return;
    const lines = [];
    cart.lines.forEach((l, i) => { if (sel[i] > 0) lines.push(Object.assign({}, l, { qty: sel[i] })); });
    const sale = await charge({ lines, discount: null, partial: true });
    if (!sale) return;
    cart.lines.forEach((l, i) => { l.qty = Math.round((l.qty - sel[i]) * 1000) / 1000; });
    cart.lines = cart.lines.filter((l) => l.qty > 0);
    await finishCartAfterPartial();
  }

  async function splitEqual() {
    const cart = App.state.cart;
    const total = C.cartTotals(cart.lines, cart.discount).total;
    const v = await promptDialog('¿Entre cuántas personas?', { value: '2', inputmode: 'numeric', type: 'number' });
    const n = parseInt(v, 10);
    if (!n || n < 2) return;
    const part = Math.floor(total / n);
    const remainder = total - part * n;
    await modal({
      title: 'Cuenta dividida entre ' + n,
      body: h('div', null,
        h('p', { class: 'big-number' }, App.money(part), h('small', null, ' por persona')),
        remainder ? h('p', { class: 'muted' }, 'El primer pago será de ' + App.money(part + remainder) + ' para cuadrar céntimos.') : null,
        h('p', { class: 'muted' }, 'Cobra el total con «Cobrar» y usa pago mixto o varios pagos en efectivo/tarjeta.')),
      actions: [{ label: 'Entendido', class: 'primary', value: true }]
    });
  }

  async function finishCartAfterPartial() {
    const cart = App.state.cart;
    if (!cart.lines.length) {
      if (cart.orderId) await DB.del('orders', cart.orderId);
      App.state.cart = App.newCart();
      await App.persistCart();
    } else App.cartChanged();
    App.refresh();
  }

  // ------------------------------------------------------------------
  // Cobro
  // ------------------------------------------------------------------
  async function charge(opts) {
    opts = opts || {};
    const cart = App.state.cart;
    const lines = opts.lines || cart.lines;
    const discount = opts.partial ? opts.discount : cart.discount;
    if (!lines.length) return null;
    if (!(await App.ensureShift())) return null;
    const totals = C.cartTotals(lines, discount);
    const result = await paymentDialog(totals.total);
    if (!result) return null;
    let sale;
    try {
      sale = await App.registerSale({
        lines, discount, note: cart.note, table: cart.table || cart.name || null,
        payments: result.payments, given: result.given, change: result.change
      });
    } catch (e) {
      toast('Error al registrar la venta: ' + e.message, 'error');
      return null;
    }
    App.audit('sale', sale.number + ' ' + App.money(sale.total));
    if (!opts.partial) {
      if (cart.orderId) await DB.del('orders', cart.orderId);
      App.state.cart = App.newCart();
      await App.persistCart();
    }
    const s = App.state.settings;
    if (s.autoPrint) App.printSale(sale);
    await doneDialog(sale, result);
    if (!opts.partial) App.refresh();
    return sale;
  }

  async function doneDialog(sale, result) {
    const s = App.state.settings;
    await modal({
      title: 'Venta ' + sale.number,
      body: h('div', { class: 'done' },
        h('div', { class: 'done-check' }, icon('check', 48)),
        h('div', { class: 'big-number' }, App.money(sale.total)),
        result.change > 0 ? h('div', { class: 'change-box' }, h('span', null, 'Cambio'), h('strong', null, App.money(result.change))) : null),
      actions: [
        !s.autoPrint && s.askPrint !== false ? { label: 'Imprimir ticket', icon: 'print', onClick: () => { App.printSale(sale); return false; } } : null,
        { label: 'Nueva venta (Enter)', class: 'primary', value: true }
      ].filter(Boolean)
    });
  }

  /** Diálogo de pago: efectivo, tarjeta, otro o mixto */
  function paymentDialog(total) {
    return new Promise((resolve) => {
      let method = 'cash';
      let given = 0;
      let cardPart = 0;
      const info = h('div', { class: 'pay-info' });
      const methods = h('div', { class: 'seg' });
      const area = h('div', { class: 'pay-area' });
      let pad;

      const renderInfo = () => {
        clear(info);
        UI.add(info, h('div', { class: 'pay-total' }, h('span', null, 'Total'), h('strong', null, App.money(total))));
        if (method === 'cash') {
          const change = given - total;
          UI.add(info, h('div', { class: 'pay-row' }, h('span', null, 'Entregado'), h('strong', null, App.money(given))));
          UI.add(info, h('div', { class: 'pay-row ' + (change >= 0 ? 'ok' : 'bad') }, h('span', null, change >= 0 ? 'Cambio' : 'Falta'), h('strong', { class: 'pay-change' }, App.money(Math.abs(change)))));
        } else if (method === 'mixed') {
          const cashPart = total - cardPart;
          UI.add(info, h('div', { class: 'pay-row' }, h('span', null, 'Tarjeta'), h('strong', null, App.money(cardPart))));
          UI.add(info, h('div', { class: 'pay-row' }, h('span', null, 'Efectivo'), h('strong', null, App.money(Math.max(0, cashPart)))));
        }
      };
      const renderArea = () => {
        clear(area);
        if (method === 'cash') {
          pad = UI.moneyPad(given, (c) => { given = c; renderInfo(); });
          UI.add(area, h('div', { class: 'quick-cash' }, C.suggestCash(total).map((v) => h('button', { class: 'btn', type: 'button', onclick: () => pad.set(v) }, v === total ? 'Exacto' : App.money(v)))), pad);
        } else if (method === 'mixed') {
          UI.add(area, h('p', { class: 'muted' }, 'Importe que se paga con tarjeta (el resto en efectivo):'));
          pad = UI.moneyPad(cardPart, (c) => { cardPart = Math.min(c, total); renderInfo(); });
          UI.add(area, pad);
        } else {
          pad = null;
          UI.add(area, h('div', { class: 'pay-card-msg' }, icon(method === 'card' ? 'cash' : 'tag', 40), h('p', null, method === 'card' ? 'Cobra ' + App.money(total) + ' en el datáfono y confirma.' : 'Otro medio de pago (bizum, vale, transferencia…).')));
        }
      };
      const setMethod = (m) => {
        method = m;
        clear(methods);
        [['cash', 'Efectivo'], ['card', 'Tarjeta'], ['mixed', 'Mixto'], ['other', 'Otro']].forEach(([id, label]) =>
          methods.appendChild(h('button', { type: 'button', class: 'seg-btn' + (method === id ? ' active' : ''), onclick: () => setMethod(id) }, label)));
        renderArea();
        renderInfo();
      };
      setMethod('cash');

      const confirm = () => {
        if (method === 'cash') {
          const g = given || total;
          if (g < total) { toast('El importe entregado es insuficiente', 'error'); return false; }
          return { payments: [{ method: 'cash', amount: total }], given: g, change: g - total };
        }
        if (method === 'card') return { payments: [{ method: 'card', amount: total }], given: 0, change: 0 };
        if (method === 'other') return { payments: [{ method: 'other', amount: total }], given: 0, change: 0 };
        if (method === 'mixed') {
          if (cardPart <= 0 || cardPart >= total) { toast('Indica un importe de tarjeta menor que el total', 'error'); return false; }
          return { payments: [{ method: 'card', amount: cardPart }, { method: 'cash', amount: total - cardPart }], given: 0, change: 0 };
        }
        return false;
      };

      const keyHandler = (e) => {
        if (!pad) return;
        if (/^\d$/.test(e.key)) { e.preventDefault(); pad.press(e.key); }
        else if (e.key === 'Backspace') { e.preventDefault(); pad.press('⌫'); }
      };
      document.addEventListener('keydown', keyHandler);

      modal({
        title: 'Cobrar',
        size: 'wide',
        body: h('div', { class: 'pay' }, h('div', { class: 'pay-left' }, methods, info), area),
        actions: [
          { label: 'Cancelar', value: null },
          { label: 'Confirmar cobro (Enter)', class: 'primary xl', icon: 'check', id: 'confirm-pay', onClick: confirm }
        ],
        onClose: () => document.removeEventListener('keydown', keyHandler)
      }).then(resolve);
    });
  }
  App.paymentDialog = paymentDialog;

  App.views.sell = view;
})();
