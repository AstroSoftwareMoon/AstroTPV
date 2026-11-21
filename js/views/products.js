/*
 * AstroTPV · Productos, categorías y control de stock
 */
(function () {
  'use strict';
  const { h, icon, toast, modal, clear, confirmDialog } = UI;
  const C = TPVCore;
  const DB = TPVDB;

  const EMOJIS = ['☕', '🍵', '🥛', '🧃', '🥤', '💧', '🍊', '🍋', '🍺', '🍻', '🍷', '🥂', '🍸', '🍹', '🥃', '🍾', '🧉',
    '🥐', '🥖', '🥪', '🍔', '🌭', '🍕', '🌮', '🥗', '🍳', '🧆', '🍤', '🍗', '🥩', '🧀', '🍅', '🥔', '🍟', '🍰', '🧁', '🍩', '🍪', '🍫', '🍦',
    '🍬', '🍭', '🍎', '🍌', '🍇', '🍓', '🥑', '🥕', '🧂', '🛒', '🧴', '🧻', '🔋', '🚬', '📰', '🎁', '🧊', '⭐'];

  const REASONS = { initial: 'Stock inicial', sale: 'Venta', refund: 'Devolución', entry: 'Entrada', adjust: 'Ajuste inventario', waste: 'Merma / rotura', import: 'Importación' };

  let tab = 'products';
  let filter = { q: '', cat: '', low: false };

  App.views.products = {
    async render(main) {
      await App.loadCatalog();
      const page = h('div', { class: 'page' });
      const lowCount = App.state.products.filter((p) => p.trackStock && p.active !== false && p.stock <= (p.minStock || 0)).length;
      const value = App.state.products.reduce((a, p) => a + (p.trackStock && p.stock > 0 ? Math.round((p.cost || 0) * p.stock) : 0), 0);
      page.appendChild(h('div', { class: 'page-head' },
        h('div', null, h('h1', null, 'Productos y stock'),
          h('p', { class: 'muted' }, App.state.products.length + ' productos · valor del inventario ' + App.money(value) + (lowCount ? ' · ' : ''),
            lowCount ? h('span', { class: 'pill warn' }, icon('alert', 14), ' ' + lowCount + ' con stock bajo') : null)),
        h('div', { class: 'tabs' },
          [['products', 'Productos'], ['categories', 'Categorías'], ['moves', 'Movimientos'], ['inventory', 'Inventario']].map(([id, label]) =>
            h('button', { class: 'tab' + (tab === id ? ' active' : ''), onclick: () => { tab = id; App.refresh(); } }, label)))));
      const content = h('div', { class: 'tab-content' });
      page.appendChild(content);
      main.appendChild(page);
      if (tab === 'products') renderProducts(content);
      else if (tab === 'categories') renderCategories(content);
      else if (tab === 'moves') await renderMoves(content);
      else renderInventory(content);
    }
  };

  // ---------------- Productos ----------------
  function renderProducts(root) {
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Buscar nombre, código o SKU…', value: filter.q, oninput: () => { filter.q = search.value; draw(); } });
    const catSel = h('select', { class: 'input', onchange: () => { filter.cat = catSel.value; draw(); } },
      h('option', { value: '' }, 'Todas las categorías'), App.state.categories.map((c) => h('option', { value: c.id, selected: filter.cat === c.id }, c.name)));
    const lowChk = h('input', { type: 'checkbox', checked: filter.low, onchange: () => { filter.low = lowChk.checked; draw(); } });
    root.appendChild(h('div', { class: 'toolbar' },
      h('div', { class: 'search-wrap grow' }, icon('search', 18), search), catSel,
      h('label', { class: 'check' }, lowChk, ' Stock bajo'),
      h('button', { class: 'btn primary', onclick: () => editProduct() }, icon('plus'), 'Nuevo'),
      h('button', { class: 'btn', onclick: () => stockEntry() }, icon('download'), 'Entrada'),
      h('button', { class: 'btn', onclick: importCSV, title: 'Importar CSV' }, icon('upload'), h('span', { class: 'hide-sm' }, 'Importar')),
      h('button', { class: 'btn', onclick: exportCSV, title: 'Exportar CSV' }, icon('download'), h('span', { class: 'hide-sm' }, 'Exportar'))));
    const list = h('div', { class: 'product-list' });
    root.appendChild(list);
    function draw() {
      clear(list);
      let items = C.findProducts(App.state.products, filter.q);
      if (filter.cat) items = items.filter((p) => p.categoryId === filter.cat);
      if (filter.low) items = items.filter((p) => p.trackStock && p.stock <= (p.minStock || 0));
      if (!items.length) { list.appendChild(h('div', { class: 'empty' }, 'Sin resultados')); return; }
      for (const p of items) {
        const cat = App.category(p.categoryId);
        const stockCls = !p.trackStock ? 'na' : p.stock <= 0 ? 'out' : p.stock <= (p.minStock || 0) ? 'low' : 'ok';
        const margin = p.cost ? Math.round((1 - p.cost / (p.price / (1 + p.tax / 100))) * 100) : null;
        list.appendChild(h('div', { class: 'prod-row' + (p.active === false ? ' inactive' : '') },
          App.productImage(p, cat, 'sm'),
          h('div', { class: 'pr-main', onclick: () => editProduct(p) },
            h('div', { class: 'pr-name' }, p.favorite ? h('span', { class: 'fav' }, '★ ') : null, p.name, p.active === false ? h('span', { class: 'pill off' }, 'inactivo') : null),
            h('div', { class: 'muted small' }, (cat ? cat.name : 'Sin categoría'), p.barcode ? ' · ' + p.barcode : '', ' · IVA ' + p.tax + '%', margin !== null ? ' · margen ' + margin + '%' : '')),
          h('div', { class: 'pr-price' }, App.money(p.price)),
          h('div', { class: 'pr-stock ' + stockCls }, p.trackStock ? C.formatQty(p.stock) : '—', p.trackStock ? h('small', null, 'mín ' + (p.minStock || 0)) : h('small', null, 'sin control')),
          h('div', { class: 'pr-actions' },
            p.trackStock ? h('button', { class: 'icon-btn', title: 'Entrada de stock', onclick: () => stockEntry(p) }, icon('plus', 18)) : null,
            p.trackStock ? h('button', { class: 'icon-btn', title: 'Historial', onclick: () => productHistory(p) }, icon('history', 18)) : null,
            h('button', { class: 'icon-btn', title: 'Editar', onclick: () => editProduct(p) }, icon('edit', 18)))));
      }
    }
    draw();
  }

  async function editProduct(p) {
    if (!(await App.requireAdmin('editar productos'))) return;
    const s = App.state.settings;
    const isNew = !p;
    p = p ? Object.assign({}, p) : { id: DB.uid(), name: '', price: 0, tax: s.defaultTax, categoryId: (App.state.categories[0] || {}).id || null, barcode: '', sku: '', cost: 0, trackStock: true, stock: 0, minStock: 0, favorite: false, active: true, emoji: '', image: null, createdAt: new Date().toISOString() };
    const f = {
      name: h('input', { class: 'input', type: 'text', value: p.name, required: true, autofocus: true }),
      price: h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: C.centsToInput(p.price) }),
      cost: h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: C.centsToInput(p.cost || 0) }),
      tax: h('select', { class: 'input' }, s.taxRates.map((r) => h('option', { value: r, selected: Number(p.tax) === Number(r) }, r + '%'))),
      cat: h('select', { class: 'input' }, h('option', { value: '' }, '— Sin categoría —'), App.state.categories.map((c) => h('option', { value: c.id, selected: p.categoryId === c.id }, c.name))),
      barcode: h('input', { class: 'input', type: 'text', value: p.barcode || '', placeholder: 'Escanea o escribe' }),
      sku: h('input', { class: 'input', type: 'text', value: p.sku || '' }),
      track: h('input', { type: 'checkbox', checked: !!p.trackStock }),
      stock: h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: C.formatQty(p.stock || 0), disabled: !isNew }),
      min: h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: C.formatQty(p.minStock || 0) }),
      fav: h('input', { type: 'checkbox', checked: !!p.favorite }),
      active: h('input', { type: 'checkbox', checked: p.active !== false })
    };
    let image = p.image || null;
    let emoji = p.emoji || '';
    const preview = h('div', { class: 'img-preview' });
    const drawPreview = () => {
      clear(preview).appendChild(App.productImage({ name: f.name.value || '?', image, emoji }, App.category(f.cat.value), 'lg'));
    };
    f.name.addEventListener('input', drawPreview);
    f.cat.addEventListener('change', drawPreview);
    const emojiGrid = h('div', { class: 'emoji-grid' }, EMOJIS.map((e) => h('button', { type: 'button', class: 'emoji-btn', onclick: () => { emoji = e; image = null; drawPreview(); } }, e)));
    const fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try { image = await App.resizeImage(file, 320); drawPreview(); } catch (e) { toast(e.message, 'error'); }
    });
    drawPreview();
    const marginEl = h('small', { class: 'muted' });
    const calcMargin = () => {
      const pr = C.toCents(f.price.value), co = C.toCents(f.cost.value), base = pr / (1 + Number(f.tax.value) / 100);
      marginEl.textContent = pr && co ? 'Margen: ' + Math.round((1 - co / base) * 100) + '% · beneficio ' + App.money(Math.round(base - co)) + '/ud (sin IVA)' : '';
    };
    [f.price, f.cost, f.tax].forEach((el) => el.addEventListener('input', calcMargin));
    calcMargin();

    const res = await modal({
      title: isNew ? 'Nuevo producto' : 'Editar producto',
      size: 'wide',
      body: h('div', { class: 'product-form' },
        h('div', { class: 'img-col' }, preview,
          h('button', { type: 'button', class: 'btn sm', onclick: () => fileInput.click() }, icon('upload', 16), 'Subir foto'),
          image ? h('button', { type: 'button', class: 'btn sm', onclick: () => { image = null; drawPreview(); } }, 'Quitar foto') : null,
          fileInput,
          h('details', { class: 'emoji-details' }, h('summary', null, 'Elegir icono'), emojiGrid)),
        h('div', { class: 'form-grid' },
          h('div', { class: 'field full' }, h('label', null, 'Nombre'), f.name),
          h('div', { class: 'field' }, h('label', null, 'Precio venta (IVA incl.)'), f.price),
          h('div', { class: 'field' }, h('label', null, 'IVA'), f.tax),
          h('div', { class: 'field' }, h('label', null, 'Coste (sin IVA)'), f.cost),
          h('div', { class: 'field' }, h('label', null, 'Categoría'), f.cat),
          h('div', { class: 'field full' }, marginEl),
          h('div', { class: 'field' }, h('label', null, 'Código de barras'), f.barcode),
          h('div', { class: 'field' }, h('label', null, 'Referencia / SKU'), f.sku),
          h('label', { class: 'check full' }, f.track, ' Controlar stock'),
          h('div', { class: 'field' }, h('label', null, isNew ? 'Stock inicial' : 'Stock actual (usa Ajuste)'), f.stock),
          h('div', { class: 'field' }, h('label', null, 'Stock mínimo (aviso)'), f.min),
          h('label', { class: 'check' }, f.fav, ' Favorito (acceso rápido)'),
          h('label', { class: 'check' }, f.active, ' Activo (visible en venta)'))),
      actions: [
        !isNew ? { label: 'Eliminar', class: 'danger', icon: 'trash', value: 'delete' } : null,
        !isNew && p.trackStock ? { label: 'Ajustar stock', value: 'adjust' } : null,
        { label: 'Cancelar', value: null },
        { label: 'Guardar', class: 'primary', onClick: () => {
          if (!f.name.value.trim()) { toast('El nombre es obligatorio', 'error'); return false; }
          const bc = f.barcode.value.trim();
          if (bc && App.state.products.some((x) => x.id !== p.id && x.barcode === bc)) { toast('Ese código de barras ya existe', 'error'); return false; }
          return 'save';
        } }
      ].filter(Boolean)
    });
    if (res === 'delete') {
      if (!(await confirmDialog('¿Eliminar «' + p.name + '»? Las ventas anteriores se conservan.', { ok: 'Eliminar', danger: true }))) return;
      await DB.del('products', p.id);
      App.audit('product_delete', p.name);
      toast('Producto eliminado');
      return App.refresh();
    }
    if (res === 'adjust') return adjustStock(p);
    if (res !== 'save') return;
    Object.assign(p, {
      name: f.name.value.trim(), price: C.toCents(f.price.value), cost: C.toCents(f.cost.value), tax: Number(f.tax.value),
      categoryId: f.cat.value || null, barcode: f.barcode.value.trim(), sku: f.sku.value.trim(), trackStock: f.track.checked,
      minStock: parseFloat(String(f.min.value).replace(',', '.')) || 0, favorite: f.fav.checked, active: f.active.checked,
      image, emoji, updatedAt: new Date().toISOString()
    });
    if (isNew) p.stock = parseFloat(String(f.stock.value).replace(',', '.')) || 0;
    await DB.tx(['products', 'stockMoves'], 'readwrite', async (a) => {
      await a.put('products', p);
      if (isNew && p.trackStock && p.stock) await a.put('stockMoves', { id: DB.uid(), productId: p.id, date: new Date().toISOString(), qty: p.stock, reason: 'initial', userId: App.state.user.id });
    });
    App.audit(isNew ? 'product_new' : 'product_edit', p.name);
    toast('Producto guardado', 'ok');
    App.refresh();
  }

  /** Movimiento de stock genérico (atómico) */
  async function moveStock(productId, qty, reason, note, extra) {
    await DB.tx(['products', 'stockMoves'], 'readwrite', async (a) => {
      const p = await a.get('products', productId);
      if (!p) throw new Error('Producto no encontrado');
      p.stock = Math.round(((p.stock || 0) + qty) * 1000) / 1000;
      if (extra && extra.cost) p.cost = extra.cost;
      await a.put('products', p);
      await a.put('stockMoves', { id: DB.uid(), productId, date: new Date().toISOString(), qty, reason, note: note || '', userId: App.state.user.id, userName: App.state.user.name });
    });
  }

  async function stockEntry(product) {
    const tracked = App.state.products.filter((p) => p.trackStock);
    const sel = h('select', { class: 'input' }, tracked.map((p) => h('option', { value: p.id, selected: product && product.id === p.id }, p.name + ' (' + C.formatQty(p.stock) + ')')));
    const scan = h('input', { class: 'input', type: 'text', placeholder: 'Escanea código para seleccionar', autofocus: !product, dataset: { enterHandled: '1' } });
    scan.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); e.stopPropagation();
      const p = tracked.find((x) => x.barcode === scan.value.trim() || x.sku === scan.value.trim());
      if (p) { sel.value = p.id; qty.focus(); qty.select(); } else toast('Código no encontrado', 'error');
      scan.value = '';
    });
    const qty = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: '1', autofocus: !!product });
    const cost = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Opcional' });
    const reason = h('select', { class: 'input' }, h('option', { value: 'entry' }, 'Entrada (compra a proveedor)'), h('option', { value: 'waste' }, 'Merma / rotura (resta)'));
    const note = h('input', { class: 'input', type: 'text', placeholder: 'Proveedor, albarán…' });
    let again = true;
    while (again) {
      const res = await modal({
        title: 'Movimiento de stock',
        body: h('div', { class: 'form-grid' },
          h('div', { class: 'field full' }, h('label', null, 'Código'), scan),
          h('div', { class: 'field full' }, h('label', null, 'Producto'), sel),
          h('div', { class: 'field' }, h('label', null, 'Tipo'), reason),
          h('div', { class: 'field' }, h('label', null, 'Cantidad'), qty),
          h('div', { class: 'field' }, h('label', null, 'Nuevo coste unitario'), cost),
          h('div', { class: 'field' }, h('label', null, 'Nota'), note)),
        actions: [{ label: 'Cerrar', value: null }, { label: 'Guardar y otro', value: 'more' }, { label: 'Guardar', class: 'primary', value: 'ok' }]
      });
      if (!res) break;
      const q = parseFloat(String(qty.value).replace(',', '.'));
      if (!sel.value || !q) { toast('Indica producto y cantidad', 'error'); continue; }
      const sign = reason.value === 'waste' ? -1 : 1;
      await moveStock(sel.value, sign * Math.abs(q), reason.value, note.value, { cost: cost.value ? C.toCents(cost.value) : 0 });
      await App.loadCatalog();
      toast('Stock actualizado', 'ok');
      again = res === 'more';
      qty.value = '1'; cost.value = '';
    }
    App.refresh();
  }

  async function adjustStock(p) {
    const input = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: C.formatQty(p.stock), autofocus: true });
    const res = await modal({
      title: 'Ajuste de inventario · ' + p.name,
      body: h('div', { class: 'field' }, h('label', null, 'Stock real contado'), input, h('small', { class: 'muted' }, 'Stock teórico actual: ' + C.formatQty(p.stock))),
      actions: [{ label: 'Cancelar', value: null }, { label: 'Ajustar', class: 'primary', onClick: () => input.value }]
    });
    if (res === null) return;
    const real = parseFloat(String(res).replace(',', '.'));
    if (isNaN(real)) return toast('Cantidad no válida', 'error');
    const diff = Math.round((real - p.stock) * 1000) / 1000;
    if (diff) await moveStock(p.id, diff, 'adjust', 'Recuento: ' + C.formatQty(real));
    toast('Stock ajustado (' + (diff > 0 ? '+' : '') + C.formatQty(diff) + ')', 'ok');
    App.refresh();
  }

  async function productHistory(p) {
    const moves = (await DB.byIndex('stockMoves', 'productId', p.id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
    await modal({
      title: 'Historial · ' + p.name, size: 'wide',
      body: h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, 'Fecha'), h('th', null, 'Motivo'), h('th', null, 'Ref.'), h('th', { class: 'r' }, 'Cantidad'))),
        h('tbody', null, moves.map((m) => h('tr', null, h('td', null, C.formatDateTime(m.date)), h('td', null, REASONS[m.reason] || m.reason), h('td', null, m.ref || m.note || ''),
          h('td', { class: 'r ' + (m.qty < 0 ? 'neg' : 'pos') }, (m.qty > 0 ? '+' : '') + C.formatQty(m.qty)))))),
      actions: [{ label: 'Cerrar', value: null }]
    });
  }

  // ---------------- Categorías ----------------
  function renderCategories(root) {
    root.appendChild(h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', onclick: () => editCategory() }, icon('plus'), 'Nueva categoría')));
    const grid = h('div', { class: 'cat-grid' });
    for (const c of App.state.categories) {
      const count = App.state.products.filter((p) => p.categoryId === c.id).length;
      grid.appendChild(h('button', { class: 'cat-card', style: { '--c': c.color }, onclick: () => editCategory(c) },
        h('span', { class: 'cat-dot' }), h('strong', null, c.name), h('small', { class: 'muted' }, count + ' productos')));
    }
    root.appendChild(grid);
  }

  async function editCategory(c) {
    if (!(await App.requireAdmin('editar categorías'))) return;
    const isNew = !c;
    c = c ? Object.assign({}, c) : { id: DB.uid(), name: '', color: '#7c3aed', order: App.state.categories.length + 1 };
    const name = h('input', { class: 'input', type: 'text', value: c.name, autofocus: true });
    const color = h('input', { class: 'input color', type: 'color', value: c.color });
    const order = h('input', { class: 'input', type: 'number', value: c.order || 0 });
    const palette = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#a16207', '#64748b'];
    const res = await modal({
      title: isNew ? 'Nueva categoría' : 'Editar categoría',
      body: h('div', { class: 'form-grid' },
        h('div', { class: 'field full' }, h('label', null, 'Nombre'), name),
        h('div', { class: 'field' }, h('label', null, 'Color'), color),
        h('div', { class: 'field' }, h('label', null, 'Orden'), order),
        h('div', { class: 'swatches full' }, palette.map((p) => h('button', { type: 'button', class: 'swatch', style: { background: p }, onclick: () => { color.value = p; } })))),
      actions: [!isNew ? { label: 'Eliminar', class: 'danger', value: 'delete' } : null, { label: 'Cancelar', value: null }, { label: 'Guardar', class: 'primary', value: 'save' }].filter(Boolean)
    });
    if (res === 'delete') {
      if (!(await confirmDialog('¿Eliminar la categoría? Sus productos quedarán sin categoría.', { danger: true, ok: 'Eliminar' }))) return;
      await DB.tx(['categories', 'products'], 'readwrite', async (a) => {
        await a.del('categories', c.id);
        for (const p of await a.all('products')) if (p.categoryId === c.id) { p.categoryId = null; await a.put('products', p); }
      });
    } else if (res === 'save') {
      if (!name.value.trim()) return toast('Nombre obligatorio', 'error');
      Object.assign(c, { name: name.value.trim(), color: color.value, order: parseInt(order.value, 10) || 0 });
      await DB.put('categories', c);
    } else return;
    App.refresh();
  }

  // ---------------- Movimientos ----------------
  async function renderMoves(root) {
    const moves = (await DB.all('stockMoves')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
    root.appendChild(h('div', { class: 'card' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, h('th', null, 'Fecha'), h('th', null, 'Producto'), h('th', null, 'Motivo'), h('th', null, 'Ref. / nota'), h('th', { class: 'r' }, 'Cantidad'))),
      h('tbody', null, moves.map((m) => {
        const p = App.product(m.productId);
        return h('tr', null, h('td', null, C.formatDateTime(m.date)), h('td', null, p ? p.name : '(eliminado)'), h('td', null, REASONS[m.reason] || m.reason),
          h('td', { class: 'muted' }, m.ref || m.note || ''), h('td', { class: 'r ' + (m.qty < 0 ? 'neg' : 'pos') }, (m.qty > 0 ? '+' : '') + C.formatQty(m.qty)));
      })))));
    if (!moves.length) root.appendChild(h('div', { class: 'empty' }, 'Sin movimientos'));
  }

  // ---------------- Inventario (recuento masivo) ----------------
  function renderInventory(root) {
    const tracked = App.state.products.filter((p) => p.trackStock && p.active !== false);
    const inputs = new Map();
    root.appendChild(h('p', { class: 'muted' }, 'Introduce el stock real contado. Sólo se ajustarán los productos con cambios.'));
    const table = h('table', { class: 'data' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Producto'), h('th', { class: 'r' }, 'Teórico'), h('th', { class: 'r' }, 'Contado'))),
      h('tbody', null, tracked.map((p) => {
        const inp = h('input', { class: 'input sm r', type: 'text', inputmode: 'decimal', placeholder: C.formatQty(p.stock) });
        inputs.set(p.id, inp);
        return h('tr', null, h('td', null, App.productImage(p, App.category(p.categoryId), 'xs')), h('td', null, p.name), h('td', { class: 'r' }, C.formatQty(p.stock)), h('td', { class: 'r' }, inp));
      })));
    root.appendChild(h('div', { class: 'card' }, table));
    root.appendChild(h('div', { class: 'toolbar end' }, h('button', { class: 'btn primary', onclick: async () => {
      let n = 0;
      for (const p of tracked) {
        const v = inputs.get(p.id).value.trim();
        if (v === '') continue;
        const real = parseFloat(v.replace(',', '.'));
        if (isNaN(real)) continue;
        const diff = Math.round((real - p.stock) * 1000) / 1000;
        if (diff) { await moveStock(p.id, diff, 'adjust', 'Inventario: ' + C.formatQty(real)); n++; }
      }
      App.audit('inventory', n + ' ajustes');
      toast(n ? n + ' productos ajustados' : 'Sin cambios', 'ok');
      App.refresh();
    } }, icon('check'), 'Aplicar recuento')));
  }

  // ---------------- CSV ----------------
  function exportCSV() {
    const csv = C.toCSV(App.state.products, [
      { label: 'nombre', key: 'name' },
      { label: 'precio', get: (p) => C.centsToInput(p.price) },
      { label: 'iva', key: 'tax' },
      { label: 'coste', get: (p) => C.centsToInput(p.cost || 0) },
      { label: 'categoria', get: (p) => (App.category(p.categoryId) || {}).name || '' },
      { label: 'codigo', key: 'barcode' },
      { label: 'sku', key: 'sku' },
      { label: 'stock', get: (p) => p.trackStock ? C.formatQty(p.stock) : '' },
      { label: 'minimo', get: (p) => C.formatQty(p.minStock || 0) },
      { label: 'icono', key: 'emoji' }
    ]);
    UI.download('productos-' + C.dateKey(new Date()) + '.csv', csv, 'text/csv;charset=utf-8');
  }

  async function importCSV() {
    if (!(await App.requireAdmin('importar productos'))) return;
    const f = await UI.pickFile('.csv,text/csv');
    if (!f) return;
    const rows = C.parseCSV(f.text);
    if (!rows.length) return toast('CSV vacío o no válido', 'error');
    if (!(await confirmDialog('Se importarán ' + rows.length + ' filas. Los productos con el mismo código de barras o nombre se actualizarán. ¿Continuar?'))) return;
    let created = 0, updated = 0;
    const cats = App.state.categories.slice();
    await DB.tx(['products', 'categories', 'stockMoves'], 'readwrite', async (a) => {
      const prods = await a.all('products');
      for (const r of rows) {
        const name = r.nombre || r.name;
        if (!name) continue;
        let catId = null;
        const catName = r.categoria || r.category;
        if (catName) {
          let c = cats.find((x) => x.name.toLowerCase() === catName.toLowerCase());
          if (!c) { c = { id: DB.uid(), name: catName, color: '#64748b', order: cats.length + 1 }; cats.push(c); await a.put('categories', c); }
          catId = c.id;
        }
        const code = r.codigo || r.barcode || '';
        let p = prods.find((x) => (code && x.barcode === code) || x.name.toLowerCase() === name.toLowerCase());
        const stock = r.stock !== undefined && r.stock !== '' ? parseFloat(String(r.stock).replace(',', '.')) : null;
        if (!p) {
          p = { id: DB.uid(), name, active: true, favorite: false, stock: 0, createdAt: new Date().toISOString() };
          prods.push(p); created++;
        } else updated++;
        const oldStock = p.stock || 0;
        Object.assign(p, {
          price: C.toCents(r.precio || r.price || 0), tax: Number(r.iva || r.tax || App.state.settings.defaultTax),
          cost: C.toCents(r.coste || r.cost || 0), categoryId: catId || p.categoryId || null, barcode: code, sku: r.sku || p.sku || '',
          trackStock: stock !== null, minStock: parseFloat(String(r.minimo || r.min || 0).replace(',', '.')) || 0, emoji: r.icono || p.emoji || ''
        });
        if (stock !== null) {
          p.stock = stock;
          if (stock !== oldStock) await a.put('stockMoves', { id: DB.uid(), productId: p.id, date: new Date().toISOString(), qty: stock - oldStock, reason: 'import', userId: App.state.user.id });
        }
        await a.put('products', p);
      }
    });
    toast('Importación: ' + created + ' nuevos, ' + updated + ' actualizados', 'ok');
    App.refresh();
  }
})();
