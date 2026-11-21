/*
 * AstroTPV · app.js — estado global, arranque, login, navegación y operaciones de negocio
 */
(function () {
  'use strict';
  const { h, icon, toast, modal, clear } = UI;
  const C = TPVCore;
  const DB = TPVDB;

  const DEFAULT_SETTINGS = {
    key: 'main',
    businessName: 'Mi Bar',
    legalName: '',
    nif: '',
    address: '',
    phone: '',
    footer: '¡Gracias por su visita!',
    currency: 'EUR',
    locale: 'es-ES',
    taxRates: [21, 10, 4, 0],
    defaultTax: 10,
    tables: 'Barra 1-4, Mesa 1-12, Terraza 1-6',
    paperWidth: 80,
    autoPrint: false,
    askPrint: true,
    allowNegativeStock: true,
    series: 'T',
    refundSeries: 'R',
    theme: 'auto',
    lockMinutes: 0,
    mode: 'bar'
  };

  const App = {
    VERSION: '1.0.0',
    state: {
      settings: { ...DEFAULT_SETTINGS },
      user: null,
      shift: null,
      view: 'sell',
      cart: newCart(),
      categories: [],
      products: []
    },
    views: {},
    money: (c) => C.formatMoney(c, App.state.settings.currency, App.state.settings.locale)
  };

  function newCart(extra) {
    return Object.assign({ lines: [], discount: null, note: '', orderId: null, table: null, createdAt: null }, extra || {});
  }
  App.newCart = newCart;

  // ------------------------------------------------------------------
  // Datos de ejemplo (primer arranque)
  // ------------------------------------------------------------------
  const EMOJI = {
    'Café solo': '☕', 'Cortado': '☕', 'Café con leche': '🥛', 'Capuchino': '☕', 'Infusión': '🍵',
    'Agua 50cl': '💧', 'Refresco cola': '🥤', 'Zumo naranja': '🍊', 'Caña': '🍺', 'Tercio': '🍾', 'Doble': '🍻',
    'Tostada tomate': '🍅', 'Bocadillo jamón': '🥖', 'Croquetas (6)': '🧆', 'Tortilla (pincho)': '🍳',
    'Patatas fritas bolsa': '🥔', 'Chicles': '🍬', 'Pan barra': '🥖'
  };

  /** Imagen del producto: foto subida o emoji sobre degradado del color de su categoría */
  App.productImage = function (p, cat, size) {
    const color = (cat && cat.color) || '#64748b';
    if (p.image) return h('span', { class: 'pimg photo' + (size ? ' ' + size : '') }, h('img', { src: p.image, alt: '', loading: 'lazy', draggable: 'false' }));
    const initials = p.name.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
    return h('span', { class: 'pimg' + (size ? ' ' + size : ''), style: { '--c': color } }, p.emoji ? h('span', { class: 'emoji' }, p.emoji) : h('span', { class: 'initials' }, initials));
  };

  /** Redimensiona una imagen subida a un JPEG/WebP cuadrado pequeño (data URL) */
  App.resizeImage = function (file, size) {
    size = size || 320;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        let data = c.toDataURL('image/webp', 0.82);
        if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', 0.82);
        resolve(data);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen no válida')); };
      img.src = url;
    });
  };

  async function seed() {
    const existing = await DB.get('settings', 'main');
    if (existing) return false;
    const now = new Date().toISOString();
    const cats = [
      { id: DB.uid(), name: 'Cafés', color: '#a16207', order: 1 },
      { id: DB.uid(), name: 'Bebidas', color: '#2563eb', order: 2 },
      { id: DB.uid(), name: 'Cervezas', color: '#d97706', order: 3 },
      { id: DB.uid(), name: 'Comida', color: '#dc2626', order: 4 },
      { id: DB.uid(), name: 'Tienda', color: '#059669', order: 5 }
    ];
    const P = (name, price, cat, tax, stock, extra) => Object.assign({ emoji: EMOJI[name] || '',
      id: DB.uid(), name, price, categoryId: cats[cat].id, tax, barcode: '', sku: '', cost: Math.round(price * 0.35),
      trackStock: stock !== null, stock: stock === null ? 0 : stock, minStock: stock === null ? 0 : 5,
      favorite: false, active: true, createdAt: now
    }, extra || {});
    const products = [
      P('Café solo', 130, 0, 10, null, { favorite: true }),
      P('Cortado', 140, 0, 10, null, { favorite: true }),
      P('Café con leche', 160, 0, 10, null, { favorite: true }),
      P('Capuchino', 220, 0, 10, null),
      P('Infusión', 150, 0, 10, null),
      P('Agua 50cl', 150, 1, 10, 48, { barcode: '8410000000017' }),
      P('Refresco cola', 250, 1, 10, 36, { barcode: '8410000000024', favorite: true }),
      P('Zumo naranja', 300, 1, 10, null),
      P('Caña', 200, 2, 10, null, { favorite: true }),
      P('Tercio', 300, 2, 10, 4, { barcode: '8410000000031' }),
      P('Doble', 280, 2, 10, null),
      P('Tostada tomate', 250, 3, 10, null, { favorite: true }),
      P('Bocadillo jamón', 450, 3, 10, null),
      P('Croquetas (6)', 750, 3, 10, null),
      P('Tortilla (pincho)', 300, 3, 10, 12),
      P('Patatas fritas bolsa', 150, 4, 10, 24, { barcode: '8410000000048' }),
      P('Chicles', 100, 4, 21, 30, { barcode: '8410000000055' }),
      P('Pan barra', 90, 4, 4, 2)
    ];
    const salt = DB.uid();
    const admin = { id: DB.uid(), name: 'Administrador', role: 'admin', salt, pin: await DB.hashPin('1234', salt), color: '#7c3aed', createdAt: now };
    const salt2 = DB.uid();
    const staff = { id: DB.uid(), name: 'Camarero', role: 'staff', salt: salt2, pin: await DB.hashPin('0000', salt2), color: '#0891b2', createdAt: now };
    await DB.tx(['settings', 'categories', 'products', 'users', 'stockMoves'], 'readwrite', async (a) => {
      await a.put('settings', { ...DEFAULT_SETTINGS });
      for (const c of cats) await a.put('categories', c);
      for (const p of products) {
        await a.put('products', p);
        if (p.trackStock) await a.put('stockMoves', { id: DB.uid(), productId: p.id, date: now, qty: p.stock, reason: 'initial', note: 'Stock inicial', userId: admin.id });
      }
      await a.put('users', admin);
      await a.put('users', staff);
    });
    return true;
  }

  // ------------------------------------------------------------------
  // Carga de catálogo y ajustes
  // ------------------------------------------------------------------
  App.loadSettings = async function () {
    const s = await DB.get('settings', 'main');
    App.state.settings = Object.assign({}, DEFAULT_SETTINGS, s || {});
    applyTheme();
  };
  App.saveSettings = async function (patch) {
    App.state.settings = Object.assign({}, App.state.settings, patch);
    await DB.put('settings', App.state.settings);
    applyTheme();
  };
  App.loadCatalog = async function () {
    const [cats, prods] = await Promise.all([DB.all('categories'), DB.all('products')]);
    App.state.categories = cats.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
    App.state.products = prods.sort((a, b) => a.name.localeCompare(b.name));
  };
  App.category = (id) => App.state.categories.find((c) => c.id === id);
  App.product = (id) => App.state.products.find((p) => p.id === id);
  App.loadShift = async function () {
    const open = await DB.byIndex('shifts', 'status', 'open');
    App.state.shift = open.sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0] || null;
    updateHeader();
  };

  function applyTheme() {
    const t = App.state.settings.theme;
    document.documentElement.dataset.theme = t === 'auto' ? '' : t;
  }

  App.isAdmin = () => App.state.user && App.state.user.role === 'admin';
  App.requireAdmin = async function (action) {
    if (App.isAdmin()) return true;
    // Autorización puntual de un administrador
    const ok = await App.askAdminPin(action);
    if (!ok) toast('Se requiere un administrador', 'error');
    return ok;
  };
  App.askAdminPin = async function (action) {
    const users = (await DB.all('users')).filter((u) => u.role === 'admin');
    const input = h('input', { class: 'input pin-input', type: 'password', inputmode: 'numeric', autocomplete: 'off', autofocus: true, placeholder: 'PIN de administrador' });
    const res = await modal({
      title: 'Autorización',
      body: h('div', null, h('p', null, action ? 'Para ' + action + ' se requiere el PIN de un administrador.' : 'Se requiere el PIN de un administrador.'), input),
      actions: [{ label: 'Cancelar', value: null }, { label: 'Autorizar', class: 'primary', onClick: () => input.value }]
    });
    if (!res) return false;
    for (const u of users) if ((await DB.hashPin(res, u.salt)) === u.pin) return true;
    return false;
  };

  App.audit = async function (action, detail) {
    try {
      await DB.put('audit', { id: DB.uid(), date: new Date().toISOString(), userId: App.state.user && App.state.user.id, userName: App.state.user && App.state.user.name, action, detail: detail || '' });
    } catch (_) { /* no crítico */ }
  };

  // ------------------------------------------------------------------
  // Carrito persistente (sobrevive a recargas y cortes de luz)
  // ------------------------------------------------------------------
  let cartSaveTimer = null;
  App.cartChanged = function () {
    clearTimeout(cartSaveTimer);
    cartSaveTimer = setTimeout(App.persistCart, 150);
  };
  App.persistCart = async function () {
    const cart = App.state.cart;
    if (cart.orderId) {
      if (!cart.lines.length && !cart.table) await DB.del('orders', cart.orderId);
      else await DB.put('orders', {
        id: cart.orderId, table: cart.table, name: cart.name || cart.table || 'Pedido', lines: cart.lines,
        discount: cart.discount, note: cart.note, createdAt: cart.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(), userId: App.state.user && App.state.user.id, userName: App.state.user && App.state.user.name
      });
    } else {
      await DB.put('meta', { key: 'currentCart', cart });
    }
  };
  async function restoreCart() {
    const m = await DB.get('meta', 'currentCart');
    if (m && m.cart && m.cart.lines && !m.cart.orderId) App.state.cart = newCart(m.cart);
  }

  App.addToCart = function (product, qty) {
    qty = qty || 1;
    const s = App.state.settings;
    if (product.trackStock) {
      const inCart = App.state.cart.lines.filter((l) => l.productId === product.id).reduce((a, l) => a + l.qty, 0);
      if (product.stock - inCart - qty < 0) {
        if (!s.allowNegativeStock) { toast('Sin stock de ' + product.name, 'error'); return false; }
        toast('Atención: stock insuficiente de ' + product.name, 'warn');
      }
    }
    const lines = App.state.cart.lines;
    const existing = lines.find((l) => l.productId === product.id && !l.discountPct && l.unitPrice === product.price && !l.note);
    if (existing) existing.qty = Math.round((existing.qty + qty) * 1000) / 1000;
    else lines.push({ id: DB.uid(), productId: product.id, name: product.name, unitPrice: product.price, tax: product.tax, qty, discountPct: 0, cost: product.cost || 0, note: '' });
    if (!App.state.cart.createdAt) App.state.cart.createdAt = new Date().toISOString();
    App.cartChanged();
    return true;
  };

  /** Abre una mesa o pedido existente en la pantalla de venta */
  App.openOrder = async function (orderOrTable) {
    await App.persistCart();
    if (typeof orderOrTable === 'string') {
      const orders = await DB.all('orders');
      const o = orders.find((x) => x.table === orderOrTable);
      if (o) App.state.cart = Object.assign(newCart(), o, { orderId: o.id });
      else App.state.cart = newCart({ orderId: DB.uid(), table: orderOrTable, name: orderOrTable, createdAt: new Date().toISOString() });
    } else {
      App.state.cart = Object.assign(newCart(), orderOrTable, { orderId: orderOrTable.id });
    }
    App.go('sell');
  };
  App.closeOrder = async function () {
    await App.persistCart();
    const m = await DB.get('meta', 'currentCart');
    App.state.cart = m && m.cart && !m.cart.orderId ? newCart(m.cart) : newCart();
  };

  // ------------------------------------------------------------------
  // Caja
  // ------------------------------------------------------------------
  App.ensureShift = async function () {
    if (App.state.shift) return true;
    const ok = await App.views.cash.openShiftDialog();
    return !!ok;
  };

  // ------------------------------------------------------------------
  // Registrar venta (transacción atómica: venta + stock + numeración)
  // ------------------------------------------------------------------
  App.registerSale = async function ({ lines, discount, note, table, payments, given, change, type, refundOf, refundOfNumber, refundUpdates }) {
    const s = App.state.settings;
    const shift = App.state.shift;
    if (!shift) throw new Error('No hay caja abierta');
    const finalLines = lines.map((l) => ({
      productId: l.productId || null, name: l.name, qty: l.qty, unitPrice: l.unitPrice, tax: l.tax,
      discountPct: l.discountPct || 0, total: C.lineTotal(l), cost: l.cost || 0, note: l.note || '', refundedQty: 0
    }));
    const totals = C.cartTotals(finalLines, discount);
    const isRefund = type === 'refund';
    const now = new Date().toISOString();
    const user = App.state.user;
    const sale = await DB.tx(['sales', 'meta', 'products', 'stockMoves'], 'readwrite', async (a) => {
      const seqKey = isRefund ? 'seq:' + s.refundSeries : 'seq:' + s.series;
      const n = await DB.nextSeq(a, seqKey);
      const sale = {
        id: DB.uid(),
        number: C.ticketNumber(isRefund ? s.refundSeries : s.series, n),
        type: isRefund ? 'refund' : 'sale',
        date: now,
        shiftId: shift.id,
        userId: user.id,
        userName: user.name,
        table: table || null,
        note: note || '',
        lines: finalLines,
        subtotal: totals.subtotal,
        discount: totals.discount,
        discountSpec: discount || null,
        total: totals.total,
        taxes: totals.taxes,
        payments,
        given: given || 0,
        change: change || 0,
        refundOf: refundOf || null,
        refundOfNumber: refundOfNumber || null,
        status: 'paid'
      };
      await a.put('sales', sale);
      // Stock
      for (const l of finalLines) {
        if (!l.productId) continue;
        const p = await a.get('products', l.productId);
        if (!p || !p.trackStock) continue;
        p.stock = Math.round((p.stock - l.qty) * 1000) / 1000;
        await a.put('products', p);
        await a.put('stockMoves', { id: DB.uid(), productId: p.id, date: now, qty: -l.qty, reason: isRefund ? 'refund' : 'sale', ref: sale.number, userId: user.id });
      }
      // Marcar cantidades devueltas en la venta original
      if (isRefund && refundOf) {
        const orig = await a.get('sales', refundOf);
        if (orig) {
          for (const [idx, q] of Object.entries(refundUpdates || {})) {
            const ol = orig.lines[idx];
            if (ol) ol.refundedQty = (ol.refundedQty || 0) + q;
          }
          const fully = orig.lines.every((l) => (l.refundedQty || 0) >= l.qty);
          orig.status = fully ? 'refunded' : 'partial';
          orig.refunds = (orig.refunds || []).concat(sale.number);
          await a.put('sales', orig);
        }
      }
      return sale;
    });
    await App.loadCatalog();
    return sale;
  };

  // ------------------------------------------------------------------
  // Tickets (vista e impresión)
  // ------------------------------------------------------------------
  App.ticketNode = function (sale, opts) {
    opts = opts || {};
    const s = App.state.settings;
    const m = App.money;
    const isRefund = sale.type === 'refund';
    const methodName = { cash: 'Efectivo', card: 'Tarjeta', other: 'Otro' };
    return h('div', { class: 'ticket' },
      h('div', { class: 't-center t-big' }, s.businessName || ''),
      s.legalName ? h('div', { class: 't-center' }, s.legalName) : null,
      s.nif ? h('div', { class: 't-center' }, 'NIF: ' + s.nif) : null,
      s.address ? h('div', { class: 't-center' }, s.address) : null,
      s.phone ? h('div', { class: 't-center' }, 'Tel: ' + s.phone) : null,
      h('div', { class: 't-sep' }),
      h('div', { class: 't-center t-bold' }, isRefund ? 'FACTURA RECTIFICATIVA' : 'FACTURA SIMPLIFICADA'),
      h('div', { class: 't-row' }, h('span', null, 'Nº ' + sale.number), h('span', null, C.formatDateTime(sale.date))),
      sale.refundOfNumber ? h('div', null, 'Rectifica a: ' + sale.refundOfNumber) : null,
      sale.table ? h('div', null, 'Mesa: ' + sale.table) : null,
      h('div', null, 'Atendido por: ' + (sale.userName || '')),
      opts.copy ? h('div', { class: 't-center t-bold' }, '*** COPIA ***') : null,
      h('div', { class: 't-sep' }),
      h('table', { class: 't-lines' },
        h('thead', null, h('tr', null, h('th', null, 'Ud'), h('th', null, 'Artículo'), h('th', { class: 'r' }, 'Importe'))),
        h('tbody', null, sale.lines.map((l) => [
          h('tr', null,
            h('td', null, C.formatQty(l.qty)),
            h('td', null, l.name, l.qty !== 1 ? h('div', { class: 't-small' }, C.formatQty(l.qty) + ' x ' + m(l.unitPrice)) : null,
              l.discountPct ? h('div', { class: 't-small' }, 'Dto. ' + l.discountPct + '%') : null,
              l.note ? h('div', { class: 't-small' }, l.note) : null),
            h('td', { class: 'r' }, m(l.total)))
        ]))),
      h('div', { class: 't-sep' }),
      sale.discount ? h('div', { class: 't-row' }, h('span', null, 'Subtotal'), h('span', null, m(sale.subtotal))) : null,
      sale.discount ? h('div', { class: 't-row' }, h('span', null, 'Descuento' + (sale.discountSpec && sale.discountSpec.type === 'pct' ? ' ' + sale.discountSpec.value + '%' : '')), h('span', null, '-' + m(sale.discount))) : null,
      h('div', { class: 't-row t-total' }, h('span', null, 'TOTAL'), h('span', null, m(sale.total))),
      h('table', { class: 't-taxes' },
        h('thead', null, h('tr', null, h('th', null, 'IVA'), h('th', { class: 'r' }, 'Base'), h('th', { class: 'r' }, 'Cuota'), h('th', { class: 'r' }, 'Total'))),
        h('tbody', null, sale.taxes.map((t) => h('tr', null,
          h('td', null, t.rate + '%'), h('td', { class: 'r' }, m(t.base)), h('td', { class: 'r' }, m(t.tax)), h('td', { class: 'r' }, m(t.gross)))))),
      h('div', { class: 't-sep' }),
      sale.payments.map((p) => h('div', { class: 't-row' }, h('span', null, methodName[p.method] || p.method), h('span', null, m(p.amount)))),
      sale.given ? h('div', { class: 't-row' }, h('span', null, 'Entregado'), h('span', null, m(sale.given))) : null,
      sale.given ? h('div', { class: 't-row t-bold' }, h('span', null, 'Cambio'), h('span', null, m(sale.change))) : null,
      sale.note ? h('div', { class: 't-small' }, 'Nota: ' + sale.note) : null,
      h('div', { class: 't-sep' }),
      h('div', { class: 't-center' }, s.footer || ''),
      h('div', { class: 't-center t-small' }, 'IVA incluido')
    );
  };
  App.printSale = function (sale, copy) {
    UI.printNode(App.ticketNode(sale, { copy }), App.state.settings.paperWidth);
  };

  /** Ticket de cocina/barra (comanda) sin precios */
  App.printKitchen = function (cart) {
    const node = h('div', { class: 'ticket' },
      h('div', { class: 't-center t-big' }, 'COMANDA'),
      h('div', { class: 't-row' }, h('span', null, cart.table || 'Venta directa'), h('span', null, C.formatTime(new Date()))),
      h('div', null, 'Atiende: ' + (App.state.user ? App.state.user.name : '')),
      h('div', { class: 't-sep' }),
      cart.lines.map((l) => h('div', { class: 't-kitchen' }, h('b', null, C.formatQty(l.qty) + ' × '), l.name, l.note ? h('div', { class: 't-small' }, '→ ' + l.note) : null)),
      cart.note ? [h('div', { class: 't-sep' }), h('div', null, cart.note)] : null
    );
    UI.printNode(node, App.state.settings.paperWidth);
  };

  // ------------------------------------------------------------------
  // Navegación y cabecera
  // ------------------------------------------------------------------
  const NAV = [
    { id: 'sell', label: 'Venta', icon: 'cart', key: 'F1' },
    { id: 'tables', label: 'Mesas', icon: 'table', key: 'F2' },
    { id: 'products', label: 'Stock', icon: 'box', key: 'F3' },
    { id: 'cash', label: 'Caja', icon: 'cash', key: 'F5' },
    { id: 'tickets', label: 'Tickets', icon: 'receipt', key: 'F6' },
    { id: 'reports', label: 'Informes', icon: 'chart', key: 'F7' },
    { id: 'settings', label: 'Ajustes', icon: 'gear', key: 'F8' }
  ];

  let currentView = null;
  App.go = async function (id, params) {
    if (currentView && currentView.destroy) currentView.destroy();
    App.state.view = id;
    const view = App.views[id];
    const main = document.getElementById('main');
    clear(main);
    main.dataset.view = id;
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
    currentView = view;
    try {
      await view.render(main, params);
    } catch (e) {
      console.error(e);
      main.appendChild(h('div', { class: 'empty' }, 'Error: ' + e.message));
    }
    updateHeader();
  };
  App.refresh = () => App.go(App.state.view);

  function updateHeader() {
    const el = document.getElementById('hdr-shift');
    if (el) {
      el.textContent = App.state.shift ? 'Caja abierta' : 'Caja cerrada';
      el.className = 'pill ' + (App.state.shift ? 'ok' : 'off');
    }
    const u = document.getElementById('hdr-user');
    if (u && App.state.user) u.textContent = App.state.user.name;
    const b = document.getElementById('hdr-brand');
    if (b) b.textContent = App.state.settings.businessName || 'AstroTPV';
  }
  App.updateHeader = updateHeader;

  function updateOnline() {
    const el = document.getElementById('hdr-net');
    if (!el) return;
    const on = navigator.onLine;
    clear(el).appendChild(icon(on ? 'wifi' : 'wifioff', 16));
    el.appendChild(document.createTextNode(on ? ' En línea' : ' Sin conexión'));
    el.className = 'pill ' + (on ? 'ok' : 'warn');
    el.title = on ? 'Conectado. El TPV no necesita internet.' : 'Sin conexión: el TPV sigue funcionando y guardando todo en este dispositivo.';
  }

  function buildShell() {
    const app = document.getElementById('app');
    clear(app);
    const nav = h('nav', { class: 'nav', 'aria-label': 'Secciones' },
      NAV.map((n) => h('button', { class: 'nav-btn', dataset: { view: n.id }, title: n.label + ' (' + n.key + ')', onclick: () => App.go(n.id) },
        icon(n.icon, 22), h('span', null, n.label))));
    const header = h('header', { class: 'hdr' },
      h('div', { class: 'brand' }, h('img', { src: 'icons/icon.svg', alt: '', width: 28, height: 28 }), h('span', { id: 'hdr-brand' }, 'AstroTPV')),
      h('div', { class: 'hdr-right' },
        h('span', { id: 'hdr-net', class: 'pill' }),
        h('button', { id: 'hdr-shift', class: 'pill', onclick: () => App.go('cash') }),
        h('span', { class: 'hdr-clock', id: 'hdr-clock' }),
        h('button', { class: 'user-btn', onclick: lock, title: 'Bloquear / cambiar usuario' }, icon('user', 18), h('span', { id: 'hdr-user' }), icon('lock', 16))));
    UI.add(app, header, h('div', { class: 'body' }, nav, h('main', { id: 'main', tabindex: '-1' })));
    updateOnline();
    updateHeader();
    const tick = () => { const c = document.getElementById('hdr-clock'); if (c) c.textContent = C.formatTime(new Date()); };
    tick();
    setInterval(tick, 15000);
  }

  // ------------------------------------------------------------------
  // Login por PIN
  // ------------------------------------------------------------------
  async function showLogin() {
    if (App.state.cart && App.state.cart.lines) await App.persistCart().catch(() => {});
    App.state.user = null;
    const app = document.getElementById('app');
    clear(app);
    const users = (await DB.all('users')).filter((u) => u.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    let selected = users.length === 1 ? users[0] : null;
    let pin = '';
    const dots = h('div', { class: 'pin-dots' });
    const userList = h('div', { class: 'login-users' });
    const msg = h('div', { class: 'login-msg' }, '');
    const renderDots = () => {
      clear(dots);
      for (let i = 0; i < Math.max(4, pin.length); i++) dots.appendChild(h('span', { class: i < pin.length ? 'on' : '' }));
    };
    const renderUsers = () => {
      clear(userList);
      for (const u of users) {
        userList.appendChild(h('button', {
          class: 'login-user' + (selected === u ? ' sel' : ''), style: { '--c': u.color || '#7c3aed' },
          onclick: () => { selected = u; pin = ''; renderDots(); renderUsers(); msg.textContent = ''; }
        }, h('span', { class: 'avatar' }, (u.name[0] || '?').toUpperCase()), h('span', null, u.name), h('small', null, u.role === 'admin' ? 'Administrador' : 'Empleado')));
      }
    };
    const tryLogin = async () => {
      if (!selected) { msg.textContent = 'Selecciona un usuario'; return; }
      const hashed = await DB.hashPin(pin, selected.salt);
      if (hashed === selected.pin) {
        App.state.user = selected;
        buildShell();
        await App.loadShift();
        App.audit('login');
        App.go(App.state.view || 'sell');
      } else {
        msg.textContent = 'PIN incorrecto';
        pin = '';
        renderDots();
        dots.classList.add('shake');
        setTimeout(() => dots.classList.remove('shake'), 400);
      }
    };
    const press = (k) => {
      if (k === '⌫') pin = pin.slice(0, -1);
      else if (k === 'OK') return tryLogin();
      else if (pin.length < 8) pin += k;
      renderDots();
      msg.textContent = '';
      if (pin.length === 4 && selected) {
        // auto-intento con 4 dígitos
        DB.hashPin(pin, selected.salt).then((hh) => { if (hh === selected.pin) tryLogin(); });
      }
    };
    const pad = h('div', { class: 'pad login-pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) =>
      h('button', { class: 'pad-key' + (k === 'OK' ? ' primary' : k === '⌫' ? ' alt' : ''), onclick: () => press(k) }, k)));
    app.appendChild(h('div', { class: 'login' },
      h('div', { class: 'login-card' },
        h('div', { class: 'login-brand' }, h('img', { src: 'icons/icon.svg', alt: '', width: 56, height: 56 }),
          h('div', null, h('h1', null, App.state.settings.businessName || 'AstroTPV'), h('p', { class: 'muted' }, 'AstroTPV · Punto de venta'))),
        userList, dots, msg, pad,
        h('p', { class: 'muted small center' }, navigator.onLine ? 'Funciona también sin conexión' : 'Modo sin conexión: todo se guarda en este equipo'))));
    renderUsers();
    renderDots();
    loginKeyHandler = (e) => {
      if (App.state.user) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Enter') press('OK');
    };
  }
  let loginKeyHandler = null;
  function lock() { App.audit('logout'); showLogin(); }
  App.lock = lock;

  // Atajos de teclado globales
  document.addEventListener('keydown', (e) => {
    if (!App.state.user) { if (loginKeyHandler) loginKeyHandler(e); return; }
    if (UI.hasModal()) return;
    const n = NAV.find((x) => x.key === e.key);
    if (n) { e.preventDefault(); App.go(n.id); return; }
    if (currentView && currentView.onKey) currentView.onKey(e);
  });

  // Bloqueo automático por inactividad
  let lastActivity = Date.now();
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
  setInterval(() => {
    const mins = Number(App.state.settings.lockMinutes) || 0;
    if (mins && App.state.user && Date.now() - lastActivity > mins * 60000 && !UI.hasModal()) lock();
  }, 20000);

  // ------------------------------------------------------------------
  // Arranque
  // ------------------------------------------------------------------
  async function boot() {
    try {
      await DB.open();
      const firstRun = await seed();
      await App.loadSettings();
      await App.loadCatalog();
      await restoreCart();
      const hash = location.hash.replace('#', '');
      if (hash && App.views[hash]) App.state.view = hash;
      window.addEventListener('online', updateOnline);
      window.addEventListener('offline', updateOnline);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      await showLogin();
      if (firstRun) setTimeout(() => toast('Bienvenido. PIN admin: 1234 · Camarero: 0000', 'ok'), 400);
    } catch (e) {
      console.error(e);
      document.getElementById('app').textContent = 'No se pudo iniciar AstroTPV: ' + e.message;
    }
  }

  // Service worker (modo offline + instalable)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Nueva versión disponible. Recarga para actualizar.', 'ok');
          });
        });
      }).catch((e) => console.warn('SW', e));
    });
  }
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
  App.canInstall = () => !!deferredInstall;
  App.install = async () => { if (!deferredInstall) return false; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; return true; };

  self.App = App;
  document.addEventListener('DOMContentLoaded', boot);
})();
