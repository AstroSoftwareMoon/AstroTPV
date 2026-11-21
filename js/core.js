/*
 * AstroTPV · core.js
 * Lógica pura (sin DOM ni base de datos). Funciona en navegador y en Node (tests).
 * Todos los importes se manejan en CÉNTIMOS (enteros) para evitar errores de coma flotante.
 * Los precios de venta incluyen IVA.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TPVCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Convierte texto/número en euros a céntimos. Acepta "1,50", "1.50", "1.234,56", 2.5 */
  function toCents(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') {
      if (!isFinite(value)) return 0;
      return Math.round(Number(value.toFixed(6)) * 100);
    }
    let s = String(value).trim().replace(/\s|€/g, '');
    if (!s) return 0;
    let negative = false;
    if (s[0] === '-') { negative = true; s = s.slice(1); }
    if (s.includes(',') && s.includes('.')) {
      // El último separador es el decimal
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
    if (!/^\d*\.?\d*$/.test(s) || s === '.') return 0;
    const [intPart, fracPart = ''] = s.split('.');
    const frac = (fracPart + '000').slice(0, 3);
    let cents = parseInt(intPart || '0', 10) * 100 + parseInt(frac.slice(0, 2), 10);
    if (parseInt(frac[2], 10) >= 5) cents += 1;
    return negative ? -cents : cents;
  }

  /** Céntimos a texto editable "12,50" */
  function centsToInput(cents) {
    const n = Math.round(cents || 0);
    const sign = n < 0 ? '-' : '';
    const a = Math.abs(n);
    return sign + Math.floor(a / 100) + ',' + String(a % 100).padStart(2, '0');
  }

  const fmtCache = {};
  function formatMoney(cents, currency, locale) {
    currency = currency || 'EUR';
    locale = locale || 'es-ES';
    const key = locale + '|' + currency;
    if (!fmtCache[key]) {
      try {
        fmtCache[key] = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } catch (e) {
        fmtCache[key] = { format: (v) => v.toFixed(2) + ' ' + currency };
      }
    }
    return fmtCache[key].format((Math.round(cents || 0)) / 100);
  }

  function formatQty(q) {
    if (Number.isInteger(q)) return String(q);
    return String(Math.round(q * 1000) / 1000).replace('.', ',');
  }

  /** Total de una línea: precio unitario × cantidad − descuento % */
  function lineTotal(line) {
    const gross = Math.round((line.unitPrice || 0) * (line.qty || 0));
    const disc = Math.round(gross * (line.discountPct || 0) / 100);
    return gross - disc;
  }

  /** Desglose de IVA a partir de un importe con IVA incluido */
  function splitTax(gross, rate) {
    const base = Math.round(gross / (1 + (rate || 0) / 100));
    return { base, tax: gross - base };
  }

  /**
   * Totales del ticket.
   * @param lines [{unitPrice, qty, discountPct, tax}]
   * @param discount {type:'pct'|'amount', value} descuento global (value en % o céntimos)
   */
  function cartTotals(lines, discount) {
    lines = lines || [];
    let subtotal = 0;
    const groups = new Map();
    let items = 0;
    for (const l of lines) {
      const t = lineTotal(l);
      subtotal += t;
      items += l.qty || 0;
      const rate = Number(l.tax || 0);
      groups.set(rate, (groups.get(rate) || 0) + t);
    }
    let discountAmount = 0;
    if (discount && discount.value) {
      if (discount.type === 'pct') discountAmount = Math.round(subtotal * Math.min(100, Math.max(0, discount.value)) / 100);
      else discountAmount = Math.sign(subtotal) * Math.min(Math.abs(discount.value), Math.abs(subtotal));
    }
    const total = subtotal - discountAmount;

    // Reparte el descuento global proporcionalmente entre tipos de IVA (cuadrando céntimos)
    const rates = [...groups.keys()].sort((a, b) => b - a);
    const taxes = [];
    let allocated = 0;
    rates.forEach((rate, i) => {
      const g = groups.get(rate);
      let d;
      if (i === rates.length - 1) d = discountAmount - allocated;
      else d = subtotal ? Math.round(discountAmount * g / subtotal) : 0;
      allocated += d;
      const gross = g - d;
      const { base, tax } = splitTax(gross, rate);
      taxes.push({ rate, gross, base, tax });
    });
    const taxTotal = taxes.reduce((s, t) => s + t.tax, 0);
    return { subtotal, discount: discountAmount, total, taxes, taxTotal, base: total - taxTotal, items };
  }

  /** Importes sugeridos para pago en efectivo */
  function suggestCash(total) {
    if (total <= 0) return [];
    const out = new Set([total]);
    const steps = [100, 500, 1000, 2000, 5000, 10000];
    for (const s of steps) {
      const v = Math.ceil(total / s) * s;
      if (v > total) out.add(v);
    }
    return [...out].sort((a, b) => a - b).slice(0, 6);
  }

  const DENOMINATIONS_EUR = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

  function countDenominations(counts) {
    let total = 0;
    for (const [d, n] of Object.entries(counts || {})) total += Number(d) * (Number(n) || 0);
    return total;
  }

  function ticketNumber(series, n) {
    return (series || '') + String(n).padStart(6, '0');
  }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function dateKey(d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function formatDateTime(d) {
    d = d instanceof Date ? d : new Date(d);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function formatDate(d) {
    d = d instanceof Date ? d : new Date(d);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function formatTime(d) {
    d = d instanceof Date ? d : new Date(d);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /**
   * Resumen de un turno de caja (informe X / Z).
   */
  function shiftSummary(shift, sales, cashMoves) {
    const byMethod = { cash: 0, card: 0, other: 0 };
    const byTax = new Map();
    const products = new Map();
    let gross = 0, refunds = 0, count = 0, refundCount = 0, discounts = 0;
    for (const s of sales || []) {
      if (s.total < 0 || s.type === 'refund') { refunds += s.total; refundCount++; }
      else { gross += s.total; count++; }
      discounts += s.discount || 0;
      for (const p of s.payments || []) byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
      for (const t of s.taxes || []) {
        const cur = byTax.get(t.rate) || { rate: t.rate, base: 0, tax: 0, gross: 0 };
        cur.base += t.base; cur.tax += t.tax; cur.gross += t.gross;
        byTax.set(t.rate, cur);
      }
      for (const l of s.lines || []) {
        const key = l.productId || l.name;
        const cur = products.get(key) || { name: l.name, qty: 0, total: 0 };
        cur.qty += l.qty; cur.total += l.total;
        products.set(key, cur);
      }
    }
    let cashIn = 0, cashOut = 0;
    for (const m of cashMoves || []) {
      if (m.type === 'in') cashIn += m.amount; else cashOut += m.amount;
    }
    const opening = (shift && shift.openingFloat) || 0;
    const expectedCash = opening + byMethod.cash + cashIn - cashOut;
    const net = gross + refunds;
    return {
      opening, gross, refunds, net, count, refundCount, discounts,
      average: count ? Math.round(gross / count) : 0,
      byMethod, cashIn, cashOut, expectedCash,
      byTax: [...byTax.values()].sort((a, b) => b.rate - a.rate),
      topProducts: [...products.values()].sort((a, b) => b.total - a.total)
    };
  }

  /** Agregados para informes por rango de fechas */
  function salesReport(sales, productsById) {
    const base = shiftSummary(null, sales, []);
    const byCategory = new Map();
    const byHour = new Array(24).fill(0);
    const byDay = new Map();
    for (const s of sales) {
      const d = new Date(s.date);
      byHour[d.getHours()] += s.total;
      const k = dateKey(d);
      byDay.set(k, (byDay.get(k) || 0) + s.total);
      for (const l of s.lines || []) {
        const p = productsById && productsById[l.productId];
        const cat = (p && p.categoryId) || '—';
        byCategory.set(cat, (byCategory.get(cat) || 0) + l.total);
      }
    }
    let margin = null;
    if (productsById) {
      let cost = 0;
      for (const s of sales) for (const l of s.lines || []) {
        const c = l.cost != null ? l.cost : (productsById[l.productId] && productsById[l.productId].cost) || 0;
        cost += c * l.qty;
      }
      margin = base.net - base.byTax.reduce((a, t) => a + t.tax, 0) - Math.round(cost);
    }
    return Object.assign(base, { byCategory, byHour, byDay, margin });
  }

  /** Cantidades aún devolvibles de una venta */
  function refundableLines(sale) {
    return (sale.lines || []).map((l, i) => ({
      index: i, line: l, max: (l.qty || 0) - (l.refundedQty || 0)
    })).filter((x) => x.max > 0);
  }

  // ---------- CSV ----------
  function csvEscape(v, sep) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function toCSV(rows, headers, sep) {
    sep = sep || ';';
    const lines = [headers.map((h) => csvEscape(h.label, sep)).join(sep)];
    for (const r of rows) lines.push(headers.map((h) => csvEscape(typeof h.get === 'function' ? h.get(r) : r[h.key], sep)).join(sep));
    return '﻿' + lines.join('\r\n');
  }
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const sep = (firstLine.split(';').length >= firstLine.split(',').length) ? ';' : ',';
    const rows = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
        } else field += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((x) => x !== '')) rows.push(row);
    if (!rows.length) return [];
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1).map((r) => {
      const o = {};
      headers.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
      return o;
    });
  }

  /** Parsea la lista de mesas "Barra, Mesa 1-10, Terraza 1-4" */
  function parseTables(spec) {
    const out = [];
    for (const raw of String(spec || '').split(/[,\n]/)) {
      const part = raw.trim();
      if (!part) continue;
      const m = part.match(/^(.*?)(\d+)\s*-\s*(\d+)$/);
      if (m) {
        const from = parseInt(m[2], 10), to = parseInt(m[3], 10);
        if (to >= from && to - from < 200) {
          for (let i = from; i <= to; i++) out.push((m[1].trim() + ' ' + i).trim());
          continue;
        }
      }
      out.push(part);
    }
    return [...new Set(out)];
  }

  /** Busca producto por código de barras (exacto) o nombre/SKU */
  function findProducts(products, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return products;
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nq = norm(q);
    return products.filter((p) =>
      (p.barcode && String(p.barcode).toLowerCase() === q) ||
      (p.sku && String(p.sku).toLowerCase() === q) ||
      norm(p.name).includes(nq)
    );
  }

  /** Valida un código EAN-13 / EAN-8 */
  function isValidEAN(code) {
    const s = String(code || '');
    if (!/^\d{8}$|^\d{13}$/.test(s)) return false;
    const digits = s.split('').map(Number);
    const check = digits.pop();
    const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === check;
  }

  return {
    toCents, centsToInput, formatMoney, formatQty, lineTotal, splitTax, cartTotals, suggestCash,
    DENOMINATIONS_EUR, countDenominations, ticketNumber, dateKey, formatDateTime, formatDate, formatTime,
    shiftSummary, salesReport, refundableLines, toCSV, parseCSV, parseTables, findProducts, isValidEAN
  };
});
