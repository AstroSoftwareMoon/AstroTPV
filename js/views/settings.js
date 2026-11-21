/*
 * AstroTPV · Ajustes: negocio, ticket, mesas, usuarios, copias de seguridad
 */
(function () {
  'use strict';
  const { h, icon, toast, modal, confirmDialog } = UI;
  const C = TPVCore;
  const DB = TPVDB;

  App.views.settings = {
    async render(main) {
      const s = App.state.settings;
      const admin = App.isAdmin();
      const page = h('div', { class: 'page narrow' });
      main.appendChild(page);
      page.appendChild(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Ajustes'), h('p', { class: 'muted' }, 'AstroTPV v' + App.VERSION + ' · datos guardados en este dispositivo'))));

      if (!admin) {
        page.appendChild(h('div', { class: 'card' }, h('p', null, 'Sólo un administrador puede cambiar los ajustes.'),
          h('button', { class: 'btn primary', onclick: async () => { if (await App.askAdminPin('abrir ajustes')) { App.state.user = Object.assign({}, App.state.user, { role: 'admin', _elevated: true }); App.refresh(); } else toast('PIN incorrecto', 'error'); } }, icon('lock'), 'Desbloquear')));
        page.appendChild(appearanceCard());
        return;
      }

      const f = {};
      const field = (key, label, opts) => {
        opts = opts || {};
        const el = opts.type === 'textarea' ? h('textarea', { class: 'input', rows: 2, value: s[key] || '' })
          : opts.options ? h('select', { class: 'input' }, opts.options.map(([v, l]) => h('option', { value: v, selected: String(s[key]) === String(v) }, l)))
            : opts.type === 'checkbox' ? h('input', { type: 'checkbox', checked: !!s[key] })
              : h('input', { class: 'input', type: opts.type || 'text', value: Array.isArray(s[key]) ? s[key].join(', ') : (s[key] ?? ''), placeholder: opts.placeholder || '' });
        f[key] = el;
        if (opts.type === 'checkbox') return h('label', { class: 'check ' + (opts.full ? 'full' : '') }, el, ' ' + label);
        return h('div', { class: 'field ' + (opts.full ? 'full' : '') }, h('label', null, label), el, opts.hint ? h('small', { class: 'muted' }, opts.hint) : null);
      };

      page.appendChild(h('div', { class: 'card' }, h('h3', null, 'Datos del negocio (aparecen en el ticket)'),
        h('div', { class: 'form-grid' },
          field('businessName', 'Nombre comercial'),
          field('legalName', 'Razón social'),
          field('nif', 'NIF / CIF'),
          field('phone', 'Teléfono'),
          field('address', 'Dirección', { full: true }),
          field('footer', 'Pie de ticket', { full: true, type: 'textarea' }))));

      page.appendChild(h('div', { class: 'card' }, h('h3', null, 'Venta y ticket'),
        h('div', { class: 'form-grid' },
          field('taxRates', 'Tipos de IVA (%)', { hint: 'Separados por comas. Ej.: 21, 10, 4, 0' }),
          field('defaultTax', 'IVA por defecto (%)', { type: 'number' }),
          field('series', 'Serie de tickets', { placeholder: 'T' }),
          field('refundSeries', 'Serie rectificativas', { placeholder: 'R' }),
          field('paperWidth', 'Ancho de papel', { options: [[80, '80 mm'], [58, '58 mm'], [210, 'A4']] }),
          field('currency', 'Moneda', { options: [['EUR', 'Euro (€)'], ['USD', 'Dólar ($)'], ['MXN', 'Peso mexicano'], ['COP', 'Peso colombiano'], ['ARS', 'Peso argentino'], ['CLP', 'Peso chileno'], ['PEN', 'Sol peruano'], ['GBP', 'Libra (£)']] }),
          field('autoPrint', 'Imprimir ticket automáticamente al cobrar', { type: 'checkbox', full: true }),
          field('askPrint', 'Ofrecer botón «Imprimir ticket» tras cobrar', { type: 'checkbox', full: true }),
          field('allowNegativeStock', 'Permitir vender sin stock (con aviso)', { type: 'checkbox', full: true }),
          field('lockMinutes', 'Bloqueo automático por inactividad (min, 0 = nunca)', { type: 'number' }))));

      page.appendChild(h('div', { class: 'card' }, h('h3', null, 'Mesas y zonas'),
        field('tables', 'Lista de mesas', { type: 'textarea', full: true, hint: 'Separadas por comas. Usa rangos: «Mesa 1-12, Terraza 1-6, Barra»' })));

      page.appendChild(h('div', { class: 'toolbar end' }, h('button', { class: 'btn primary xl', onclick: async () => {
        const rates = String(f.taxRates.value).split(/[,;\s]+/).map(Number).filter((n) => !isNaN(n) && n >= 0);
        const patch = {
          businessName: f.businessName.value.trim(), legalName: f.legalName.value.trim(), nif: f.nif.value.trim(), phone: f.phone.value.trim(),
          address: f.address.value.trim(), footer: f.footer.value.trim(), taxRates: rates.length ? [...new Set(rates)] : [21, 10, 4, 0],
          defaultTax: Number(f.defaultTax.value) || 0, series: f.series.value.trim() || 'T', refundSeries: f.refundSeries.value.trim() || 'R',
          paperWidth: Number(f.paperWidth.value), currency: f.currency.value, autoPrint: f.autoPrint.checked, askPrint: f.askPrint.checked,
          allowNegativeStock: f.allowNegativeStock.checked, lockMinutes: Math.max(0, parseInt(f.lockMinutes.value, 10) || 0), tables: f.tables.value
        };
        if (patch.series === patch.refundSeries) return toast('Las series de venta y rectificativas deben ser distintas', 'error');
        await App.saveSettings(patch);
        App.audit('settings');
        App.updateHeader();
        toast('Ajustes guardados', 'ok');
      } }, icon('check'), 'Guardar ajustes')));

      page.appendChild(appearanceCard());
      page.appendChild(await usersCard());
      page.appendChild(backupCard());
      page.appendChild(await auditCard());
    }
  };

  function appearanceCard() {
    const s = App.state.settings;
    return h('div', { class: 'card' }, h('h3', null, 'Apariencia e instalación'),
      h('div', { class: 'seg' }, [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) =>
        h('button', { class: 'seg-btn' + (s.theme === v ? ' active' : ''), onclick: async () => { await App.saveSettings({ theme: v }); App.refresh(); } }, l))),
      h('div', { class: 'row gap wrap mt' },
        App.canInstall() ? h('button', { class: 'btn primary', onclick: async () => { await App.install(); App.refresh(); } }, icon('download'), 'Instalar AstroTPV en este equipo') :
          h('p', { class: 'muted small' }, 'Para instalarlo como app: menú del navegador → «Instalar AstroTPV» / «Añadir a pantalla de inicio». Una vez abierto, funciona sin internet.'),
        h('button', { class: 'btn', onclick: () => document.documentElement.requestFullscreen && document.documentElement.requestFullscreen() }, 'Pantalla completa')));
  }

  async function usersCard() {
    const users = (await DB.all('users')).sort((a, b) => a.name.localeCompare(b.name));
    return h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h3', null, 'Usuarios'), h('button', { class: 'btn sm primary', onclick: () => editUser() }, icon('plus', 16), 'Nuevo')),
      h('div', { class: 'user-list' }, users.map((u) => h('button', { class: 'user-row', onclick: () => editUser(u) },
        h('span', { class: 'avatar', style: { '--c': u.color || '#7c3aed' } }, u.name[0].toUpperCase()),
        h('span', { class: 'grow' }, u.name, u.active === false ? h('span', { class: 'pill off' }, 'inactivo') : null),
        h('span', { class: 'pill ' + (u.role === 'admin' ? 'ok' : '') }, u.role === 'admin' ? 'Administrador' : 'Empleado')))));
  }

  async function editUser(u) {
    const isNew = !u;
    u = u ? Object.assign({}, u) : { id: DB.uid(), name: '', role: 'staff', color: '#0891b2', active: true, createdAt: new Date().toISOString() };
    const name = h('input', { class: 'input', type: 'text', value: u.name, autofocus: true });
    const role = h('select', { class: 'input' }, h('option', { value: 'staff', selected: u.role === 'staff' }, 'Empleado'), h('option', { value: 'admin', selected: u.role === 'admin' }, 'Administrador'));
    const pin = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: isNew ? '4-8 dígitos' : 'Dejar vacío para no cambiar', autocomplete: 'new-password' });
    const color = h('input', { class: 'input color', type: 'color', value: u.color || '#0891b2' });
    const active = h('input', { type: 'checkbox', checked: u.active !== false });
    const res = await modal({
      title: isNew ? 'Nuevo usuario' : 'Editar usuario',
      body: h('div', { class: 'form-grid' },
        h('div', { class: 'field full' }, h('label', null, 'Nombre'), name),
        h('div', { class: 'field' }, h('label', null, 'Rol'), role),
        h('div', { class: 'field' }, h('label', null, 'PIN'), pin),
        h('div', { class: 'field' }, h('label', null, 'Color'), color),
        h('label', { class: 'check' }, active, ' Activo'),
        h('p', { class: 'muted small full' }, 'Empleado: vende, mesas, caja y reimprime. Administrador: además productos, descuentos, devoluciones, salidas de caja y ajustes.')),
      actions: [!isNew ? { label: 'Eliminar', class: 'danger', value: 'delete' } : null, { label: 'Cancelar', value: null }, { label: 'Guardar', class: 'primary', value: 'save' }].filter(Boolean)
    });
    const users = await DB.all('users');
    const otherAdmins = users.filter((x) => x.id !== u.id && x.role === 'admin' && x.active !== false);
    if (res === 'delete') {
      if (!otherAdmins.length && u.role === 'admin') return toast('Debe quedar al menos un administrador', 'error');
      if (!(await confirmDialog('¿Eliminar a ' + u.name + '?', { danger: true, ok: 'Eliminar' }))) return;
      await DB.del('users', u.id);
    } else if (res === 'save') {
      if (!name.value.trim()) return toast('Nombre obligatorio', 'error');
      if (pin.value && !/^\d{4,8}$/.test(pin.value)) return toast('El PIN debe tener entre 4 y 8 dígitos', 'error');
      if (isNew && !pin.value) return toast('Indica un PIN', 'error');
      if ((role.value !== 'admin' || !active.checked) && !otherAdmins.length) return toast('Debe quedar al menos un administrador activo', 'error');
      Object.assign(u, { name: name.value.trim(), role: role.value, color: color.value, active: active.checked });
      if (pin.value) {
        // Evitar PIN duplicado (el login sería ambiguo)
        for (const x of users) if (x.id !== u.id && (await DB.hashPin(pin.value, x.salt)) === x.pin) return toast('Ese PIN ya lo usa otro usuario', 'error');
        u.salt = DB.uid();
        u.pin = await DB.hashPin(pin.value, u.salt);
      }
      await DB.put('users', u);
      if (App.state.user && App.state.user.id === u.id) App.state.user = u;
    } else return;
    App.audit('user', u.name);
    App.refresh();
  }

  function backupCard() {
    return h('div', { class: 'card' }, h('h3', null, 'Copias de seguridad'),
      h('p', { class: 'muted' }, 'Todos los datos se guardan en este dispositivo. Haz copias periódicas y guárdalas en un USB o en la nube.'),
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn primary', onclick: async () => {
          const data = await DB.exportAll();
          UI.download('astrotpv-copia-' + C.dateKey(new Date()) + '.json', JSON.stringify(data), 'application/json');
          await DB.put('meta', { key: 'lastBackup', value: new Date().toISOString() });
          toast('Copia descargada', 'ok');
        } }, icon('download'), 'Descargar copia'),
        h('button', { class: 'btn', onclick: async () => {
          const f = await UI.pickFile('.json,application/json');
          if (!f) return;
          let data;
          try { data = JSON.parse(f.text); } catch (e) { return toast('Archivo no válido', 'error'); }
          if (!(await confirmDialog('Se reemplazarán TODOS los datos actuales por los de la copia (' + (data.exportedAt ? C.formatDateTime(data.exportedAt) : '?') + '). ¿Continuar?', { danger: true, ok: 'Restaurar' }))) return;
          try { await DB.importAll(data); } catch (e) { return toast(e.message, 'error'); }
          toast('Copia restaurada. Reiniciando…', 'ok');
          setTimeout(() => location.reload(), 800);
        } }, icon('upload'), 'Restaurar copia'),
        h('button', { class: 'btn danger', onclick: async () => {
          if (!(await confirmDialog('Se borrarán TODOS los datos (ventas, productos, cierres…). Esta acción no se puede deshacer. Haz antes una copia.', { danger: true, ok: 'Borrar todo' }))) return;
          const txt = await UI.promptDialog('Escribe BORRAR para confirmar');
          if (txt !== 'BORRAR') return;
          await DB.wipe();
          location.reload();
        } }, icon('trash'), 'Borrar todos los datos')),
      storageInfo());
  }

  function storageInfo() {
    const el = h('p', { class: 'muted small mt' });
    (async () => {
      const last = await DB.get('meta', 'lastBackup');
      let txt = last ? 'Última copia: ' + C.formatDateTime(last.value) + '. ' : 'Aún no se ha hecho ninguna copia. ';
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
        txt += 'Espacio usado: ' + (est.usage / 1048576).toFixed(1) + ' MB. ' + (persisted ? 'Almacenamiento persistente activado ✓' : 'Almacenamiento no persistente (instala la app para protegerlo).');
      }
      el.textContent = txt;
    })();
    return el;
  }

  async function auditCard() {
    const rows = (await DB.all('audit')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
    const LABELS = { login: 'Inicio de sesión', logout: 'Bloqueo', sale: 'Venta', refund: 'Devolución', shift_open: 'Apertura caja', shift_close: 'Cierre caja', cash_in: 'Entrada efectivo', cash_out: 'Salida efectivo', cart_clear: 'Ticket vaciado', product_new: 'Producto creado', product_edit: 'Producto editado', product_delete: 'Producto eliminado', settings: 'Ajustes', user: 'Usuario', inventory: 'Inventario', move_table: 'Cambio de mesa' };
    return h('details', { class: 'card' }, h('summary', null, h('strong', null, 'Registro de actividad (últimos 50)')),
      h('table', { class: 'data' }, h('tbody', null, rows.map((r) => h('tr', null, h('td', null, C.formatDateTime(r.date)), h('td', null, r.userName || ''), h('td', null, LABELS[r.action] || r.action), h('td', { class: 'muted' }, r.detail))))));
  }
})();
