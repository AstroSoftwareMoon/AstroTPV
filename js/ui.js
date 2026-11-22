/*
 * AstroTPV · ui.js — utilidades de interfaz (sin dependencias)
 */
(function () {
  'use strict';

  /** Crea elementos DOM de forma segura (texto siempre como textContent) */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'htmlFor') el[k] = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k === null || k === undefined || k === false) continue;
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return el;
  }
  function add(el, ...kids) { return append(el, kids); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /** Iconos SVG en línea (trazo) */
  const ICONS = {
    cart: 'M3 3h2l2.4 12.2a2 2 0 0 0 2 1.8h8.2a2 2 0 0 0 2-1.6L21 8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    table: 'M3 7h18M5 7v13M19 7v13M3 4h18v3H3zM8 12h8',
    box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
    cash: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01',
    receipt: 'M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zM9 7h6M9 11h6M9 15h4',
    chart: 'M3 3v18h18M7 15l4-4 3 3 6-7',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
    edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
    x: 'M18 6L6 18M6 6l12 12',
    star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z',
    percent: 'M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    note: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
    pause: 'M8 5v14M16 5v14',
    split: 'M16 3h5v5M8 3H3v5M21 3l-7 7M3 3l7 7M12 14v7',
    move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
    wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0',
    wifioff: 'M2 2l20 20M8.5 16a5 5 0 0 1 7 0M12 20h.01M5 12.5a10 10 0 0 1 4.5-2.6M19 12.5a10 10 0 0 0-2.3-1.6M2 9a15 15 0 0 1 4.6-2.9M22 9a15 15 0 0 0-11-3.9',
    download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
    upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
    undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2',
    barcode: 'M3 5v14M7 5v14M10 5v14M14 5v14M17 5v14M21 5v14',
    check: 'M20 6L9 17l-5-5',
    alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'
  };
  function icon(name, size) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 20);
    svg.setAttribute('height', size || 20);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('icon');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name] || ICONS.box);
    svg.appendChild(path);
    return svg;
  }

  // ---------- Toasts ----------
  function toast(msg, type) {
    let root = document.getElementById('toasts');
    if (!root) { root = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(root); }
    const t = h('div', { class: 'toast ' + (type || '') }, msg);
    root.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, type === 'error' ? 4500 : 2600);
  }

  // ---------- Modales ----------
  const modalStack = [];
  /**
   * Abre un modal. Devuelve una promesa que se resuelve con el valor devuelto por la acción.
   * actions: [{label, class, value, onClick(close) -> valor | false para no cerrar}]
   */
  function modal(opts) {
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      const overlay = h('div', { class: 'overlay' });
      const dlg = h('div', { class: 'modal ' + (opts.size || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || '' });
      let closed = false;
      const close = (value) => {
        if (closed) return;
        closed = true;
        overlay.classList.remove('show');
        modalStack.splice(modalStack.indexOf(entry), 1);
        setTimeout(() => overlay.remove(), 150);
        if (opts.onClose) opts.onClose(value);
        if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (_) { /* noop */ }
        resolve(value === undefined ? null : value);
      };
      const entry = { close, opts, dlg };
      const header = h('div', { class: 'modal-head' },
        h('h2', null, opts.title || ''),
        h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => close(null) }, icon('x')));
      const body = h('div', { class: 'modal-body' });
      const content = typeof opts.body === 'function' ? opts.body(close, body) : opts.body;
      if (content) append(body, [content]);
      const foot = h('div', { class: 'modal-foot' });
      for (const a of opts.actions || []) {
        const btn = h('button', {
          class: 'btn ' + (a.class || ''), type: 'button',
          onclick: async () => {
            if (btn.disabled) return;
            btn.disabled = true;
            try {
              // Sólo un onClick que devuelve false mantiene el modal abierto; un value fijo siempre cierra
              if (a.onClick) {
                const v = await a.onClick(close, body);
                if (v !== false) close(v);
              } else close(a.value);
            } catch (e) {
              toast(e.message || String(e), 'error');
            } finally { btn.disabled = false; }
          }
        }, a.icon ? icon(a.icon) : null, a.label);
        if (a.id) btn.id = a.id;
        foot.appendChild(btn);
      }
      add(dlg, header, body);
      if ((opts.actions || []).length) add(dlg, foot);
      overlay.appendChild(dlg);
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && opts.dismissable !== false) close(null); });
      document.body.appendChild(overlay);
      modalStack.push(entry);
      requestAnimationFrame(() => {
        overlay.classList.add('show');
        const f = dlg.querySelector('[autofocus]') || dlg.querySelector('input:not([type=checkbox]):not([type=file]),select,textarea');
        if (f) { f.focus(); if (f.select) f.select(); } else { dlg.tabIndex = -1; dlg.focus(); }
      });
      entry.foot = foot;
    });
  }
  function topModal() { return modalStack[modalStack.length - 1]; }
  document.addEventListener('keydown', (e) => {
    if (!modalStack.length) return;
    const m = topModal();
    if (e.key === 'Escape') {
      if (m.opts.dismissable !== false) { e.preventDefault(); m.close(null); }
    } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      // Enter = acción primaria (excepto en áreas de texto o si el foco está en otro botón)
      const tag = e.target.tagName;
      if (tag === 'TEXTAREA' || (tag === 'BUTTON' && m.foot && m.foot.contains(e.target))) return;
      if (e.target.dataset && e.target.dataset.enterHandled) return;
      const primary = m.foot && m.foot.querySelector('.btn.primary');
      if (primary) { e.preventDefault(); primary.click(); }
    }
  });

  function confirmDialog(message, opts) {
    opts = opts || {};
    return modal({
      title: opts.title || 'Confirmar',
      body: h('p', { class: 'confirm-msg' }, message),
      actions: [
        { label: 'Cancelar', value: false },
        { label: opts.ok || 'Aceptar', class: opts.danger ? 'danger' : 'primary', value: true }
      ]
    }).then((v) => v === true);
  }

  function promptDialog(title, opts) {
    opts = opts || {};
    const input = h(opts.multiline ? 'textarea' : 'input', {
      class: 'input', type: opts.type || 'text', value: opts.value || '', placeholder: opts.placeholder || '',
      inputmode: opts.inputmode || null, autofocus: true, rows: opts.multiline ? 3 : null
    });
    return modal({
      title,
      body: h('div', { class: 'field' }, opts.label ? h('label', null, opts.label) : null, input, opts.hint ? h('small', { class: 'muted' }, opts.hint) : null),
      actions: [
        { label: 'Cancelar', value: null },
        { label: opts.ok || 'Aceptar', class: 'primary', onClick: () => input.value }
      ]
    });
  }

  /** Teclado numérico en pantalla para importes. onChange(cents) */
  function moneyPad(initialCents, onChange) {
    let digits = initialCents ? String(Math.abs(initialCents)) : '';
    const display = h('div', { class: 'pad-display' });
    const render = () => {
      const cents = parseInt(digits || '0', 10);
      display.textContent = TPVCore.formatMoney(cents);
      onChange(cents);
    };
    const press = (k) => {
      if (k === 'C') digits = '';
      else if (k === '⌫') digits = digits.slice(0, -1);
      else if (k === '00') digits = digits ? digits + '00' : '';
      else digits = (digits + k).replace(/^0+/, '');
      if (digits.length > 9) digits = digits.slice(0, 9);
      render();
    };
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '00', '⌫'];
    const grid = h('div', { class: 'pad' }, keys.map((k) => h('button', {
      type: 'button', class: 'pad-key' + (k === 'C' || k === '⌫' ? ' alt' : '') + (k === '⌫' ? ' wide' : ''),
      onclick: () => press(k)
    }, k)));
    const wrap = h('div', { class: 'money-pad' }, display, grid);
    wrap.set = (cents) => { digits = cents ? String(Math.abs(Math.round(cents))) : ''; render(); };
    wrap.press = press;
    render();
    return wrap;
  }

  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = h('input', { type: 'file', accept: accept || '*/*', style: { display: 'none' } });
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        input.remove();
        if (!f) return resolve(null);
        const r = new FileReader();
        r.onload = () => resolve({ name: f.name, text: r.result });
        r.onerror = () => resolve(null);
        r.readAsText(f);
      });
      document.body.appendChild(input);
      input.click();
    });
  }

  /** Imprime un nodo (ticket, informe) en el área de impresión */
  function printNode(node, widthMm) {
    const root = document.getElementById('print-root');
    clear(root);
    root.style.setProperty('--paper', (widthMm || 80) + 'mm');
    root.appendChild(node);
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
  }

  self.UI = { h, append, add, clear, icon, toast, modal, confirmDialog, promptDialog, moneyPad, download, pickFile, printNode, topModal, hasModal: () => modalStack.length > 0 };
})();
