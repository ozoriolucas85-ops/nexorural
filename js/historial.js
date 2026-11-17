/* NexoRural — Historial de cargas. AGO Soluciones */
(function () {
  'use strict';

  var L = window.NexoLogic;
  var UI = window.NexoUI;
  var $ = function (id) { return document.getElementById(id); };
  var kg = L.formatearKg;
  var esc = UI.esc;

  var store = null;
  var lista = [];
  var seleccion = null;  // carga completa elegida
  var filtros = { estado: '', desde: '', hasta: '' };

  UI.iniciarPagina().then(function (ctx) {
    store = ctx.store;
    document.body.classList.remove('is-cargando');
    cargar();
  });

  function cargar() {
    $('histResumen').textContent = 'Cargando…';
    store.historial(filtros).then(function (cargas) {
      lista = cargas;
      $('histError').hidden = true;
      pintarLista();
    }, function (e) {
      $('histError').textContent = e.mensaje;
      $('histError').hidden = false;
      $('histResumen').textContent = '';
    });
  }

  function pintarLista() {
    var cerradas = lista.filter(function (c) { return c.estado === 'cerrada'; });
    var kilos = cerradas.reduce(function (a, c) { return a + c.cargado; }, 0);
    var animales = cerradas.reduce(function (a, c) { return a + c.cantidad; }, 0);
    var uso = cerradas.length ? cerradas.reduce(function (a, c) { return a + c.porcentaje; }, 0) / cerradas.length : null;
    $('kCerradas').textContent = cerradas.length;
    $('kKilos').textContent = kg(L.redondear(kilos));
    $('kAnimales').textContent = animales;
    $('kUso').textContent = uso == null ? '—' : uso.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' %';

    $('cuerpoHist').innerHTML = lista.map(function (c) {
      return '<tr class="is-clickable' + (seleccion && seleccion.id === c.id ? ' is-selected' : '') + '" data-id="' + esc(c.id) + '" tabindex="0">' +
        '<td class="mono">' + esc(c.id) + '</td>' +
        '<td class="mono">' + UI.fechaCorta(c.iniciadaEn) + '</td>' +
        '<td class="mono">' + (esc(c.patente) || '<span class="muted">—</span>') + '</td>' +
        '<td>' + esc(c.operador || '') + '</td>' +
        '<td class="num mono">' + kg(c.cargado) + '</td>' +
        '<td class="num mono">' + Math.round(c.porcentaje) + ' %</td>' +
        '<td class="num mono">' + c.cantidad + '</td>' +
        '<td><span class="tag tag--' + esc(c.estado) + '">' + (UI.ESTADOS[c.estado] || esc(c.estado)) + '</span></td>' +
        '</tr>';
    }).join('');
    $('histVacio').hidden = lista.length > 0;
    $('tablaHist').classList.toggle('is-empty', !lista.length);
    $('histResumen').textContent = lista.length
      ? lista.length + (lista.length === 1 ? ' carga' : ' cargas') + (lista.length >= 500 ? ' (se muestran las últimas 500)' : '')
      : 'Sin resultados';
    $('btnCsvLista').disabled = !lista.length;
  }

  function abrir(id) {
    store.detalle(id).then(function (c) {
      seleccion = c;
      pintarLista();
      pintarDetalle();
      if (window.innerWidth <= 1600) $('detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, function (e) {
      $('detCuerpo').innerHTML = '<div class="alert alert--error"><strong>' + esc(e.mensaje) + '</strong></div>';
    });
  }

  function pintarDetalle() {
    var c = seleccion;
    var s = L.resumen(c);
    $('detTitulo').textContent = 'Carga N.º ' + c.id;
    $('detSub').textContent = (UI.ESTADOS[c.estado] || '') + ' · ' + UI.fecha(c.iniciadaEn, true) +
      (c.cerradaEn ? ' → ' + UI.fecha(c.cerradaEn, true) : '') + ' · ' + (c.operador || '');
    $('detAcciones').hidden = false;

    var filas = c.animales.map(function (a, i) {
      return '<tr><td class="mono">' + String(i + 1).padStart(2, '0') + '</td>' +
        '<td>' + UI.tagTipo(a.tipo) + '</td>' +
        '<td class="mono">' + (esc(a.caravana) || '<span class="muted">—</span>') + '</td>' +
        '<td class="mono muted">' + UI.hora(a.hora) + '</td>' +
        '<td class="num mono">' + kg(a.peso) + '</td></tr>';
    }).join('');

    $('detCuerpo').innerHTML =
      '<div class="detail-grid">' +
      '<div><span>Capacidad</span><strong>' + kg(s.capacidad) + '</strong></div>' +
      '<div><span>Cargado</span><strong>' + kg(s.cargado) + '</strong></div>' +
      '<div><span>Uso</span><strong>' + s.porcentaje.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' %</strong></div>' +
      '<div><span>Rechazos</span><strong>' + (c.rechazos || 0) + '</strong></div>' +
      '</div>' +
      (c.patente ? '<p class="muted">Patente: <span class="mono">' + esc(c.patente) + '</span></p>' : '') +
      (c.observaciones ? '<p class="muted">Observaciones: ' + esc(c.observaciones) + '</p>' : '') +
      '<div class="table-wrap"><table class="table' + (filas ? '' : ' is-empty') + '"><thead><tr><th>N.º</th><th>Tipo</th><th>Caravana</th><th>Hora</th><th class="num">Peso</th></tr></thead>' +
      '<tbody>' + filas + '</tbody></table>' +
      (filas ? '' : '<div class="empty"><p>Esta carga no tiene animales.</p></div>') + '</div>';
  }

  /* ---------- Eventos ---------- */
  $('cuerpoHist').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (tr) abrir(tr.getAttribute('data-id'));
  });
  $('cuerpoHist').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var tr = e.target.closest('tr[data-id]');
    if (tr) { e.preventDefault(); abrir(tr.getAttribute('data-id')); }
  });

  $('segEstado').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-estado]');
    if (!b) return;
    this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); });
    filtros.estado = b.getAttribute('data-estado');
    cargar();
  });
  $('fDesde').addEventListener('change', function () { filtros.desde = this.value; cargar(); });
  $('fHasta').addEventListener('change', function () { filtros.hasta = this.value; cargar(); });
  $('btnLimpiar').addEventListener('click', function () {
    filtros = { estado: '', desde: '', hasta: '' };
    $('fDesde').value = '';
    $('fHasta').value = '';
    $('segEstado').querySelectorAll('button').forEach(function (x, i) { x.classList.toggle('is-on', i === 0); });
    cargar();
  });

  $('btnCsvLista').addEventListener('click', function () {
    UI.descargarCSV('historial-cargas.csv',
      ['N.º', 'Inicio', 'Cierre', 'Estado', 'Patente', 'Operador', 'Capacidad (kg)', 'Cargado (kg)', 'Uso (%)', 'Animales'],
      lista.map(function (c) {
        return [c.id, UI.fecha(c.iniciadaEn, true), c.cerradaEn ? UI.fecha(c.cerradaEn, true) : '', UI.ESTADOS[c.estado] || c.estado,
          c.patente || '', c.operador || '', c.capacidad, c.cargado, c.porcentaje, c.cantidad];
      }));
  });
  $('btnDetCsv').addEventListener('click', function () {
    if (seleccion) UI.descargarCSV('carga-' + seleccion.id + '.csv', UI.ENCABEZADOS_ANIMALES, UI.csvDeCarga(seleccion));
  });
  $('btnDetImprimir').addEventListener('click', function () {
    if (seleccion) UI.imprimirPlanilla(seleccion);
  });
})();
