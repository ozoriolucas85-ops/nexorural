/*
 * NexoRural — Utilidades de interfaz compartidas (panel, historial, usuarios)
 * AGO Soluciones
 */
(function (root) {
  'use strict';

  var L = root.NexoLogic;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fecha(iso, conHora) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    var op = { day: '2-digit', month: '2-digit', year: 'numeric' };
    if (conHora) { op.hour = '2-digit'; op.minute = '2-digit'; }
    return d.toLocaleString('es-AR', op);
  }

  /** Fecha compacta para tablas: 17/11/26 11:21 */
  function fechaCorta(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '—';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function hora(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  var ESTADOS = { abierta: 'En curso', cerrada: 'Cerrada', cancelada: 'Cancelada' };

  /**
   * Prepara la barra lateral común: nombre, avatar, modo, enlace de usuarios y salir.
   * Devuelve una Promesa con { store, usuario }. Si no hay sesión, vuelve al ingreso.
   */
  function iniciarPagina() {
    return root.NexoStore.conectar().then(function (store) {
      return store.sesion().then(function (u) {
        if (!u) {
          location.replace('index.html');
          return new Promise(function () {}); // detener la cadena
        }
        var $ = function (id) { return document.getElementById(id); };
        $('nombreOperador').textContent = u.nombre;
        $('rolOperador').textContent = u.rol === 'administrador' ? 'Administrador' : 'Capataz / encargado';
        $('avatar').textContent = (u.nombre || '?').trim().charAt(0).toUpperCase();

        var chip = $('chipModo');
        if (chip) {
          var local = store.modo === 'local';
          chip.textContent = local ? 'Modo local' : 'Conectado';
          chip.dataset.modo = store.modo;
          chip.title = local
            ? 'Los datos se guardan solo en este navegador. Para compartirlos, abrí NexoRural desde XAMPP (http://localhost/nexorural).'
            : 'Los datos se guardan en la base de datos MySQL.';
        }
        var linkUsuarios = $('navUsuarios');
        if (linkUsuarios) linkUsuarios.hidden = !(store.modo === 'servidor' && u.rol === 'administrador');

        $('btnSalir').addEventListener('click', function () {
          store.logout().then(function () { location.href = 'index.html'; }, function () { location.href = 'index.html'; });
        });
        return { store: store, usuario: u };
      });
    });
  }

  /** Abre la ventana de impresión con la planilla de una carga. */
  function imprimirPlanilla(carga) {
    var s = L.resumen(carga);
    var filas = carga.animales.map(function (a, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(L.nombreTipo(a.tipo)) + '</td><td>' + (esc(a.caravana) || '—') +
        '</td><td>' + hora(a.hora) + '</td><td class="num">' + L.formatearKg(a.peso) + '</td></tr>';
    }).join('');
    var hoja = document.getElementById('planilla');
    hoja.innerHTML =
      '<h1>NexoRural · Planilla de carga' + (carga.id ? ' N.º ' + esc(carga.id) : '') + '</h1>' +
      '<p>Inicio: ' + fecha(carga.iniciadaEn, true) +
      (carga.cerradaEn ? ' · Cierre: ' + fecha(carga.cerradaEn, true) : '') +
      ' · Estado: ' + esc(ESTADOS[carga.estado] || 'En curso') + '</p>' +
      '<p>Operador: ' + esc(carga.operador || '') + (carga.patente ? ' · Patente: ' + esc(carga.patente) : '') + '</p>' +
      '<p>Capacidad: <b>' + L.formatearKg(s.capacidad) + '</b> · Cargado: <b>' + L.formatearKg(s.cargado) +
      '</b> · Disponible: <b>' + L.formatearKg(s.disponible) + '</b> · Animales: <b>' + s.cantidad + '</b></p>' +
      (carga.observaciones ? '<p>Observaciones: ' + esc(carga.observaciones) + '</p>' : '') +
      '<table><thead><tr><th>N.º</th><th>Tipo</th><th>Caravana</th><th>Hora</th><th class="num">Peso</th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="5">Sin animales registrados</td></tr>') + '</tbody></table>' +
      '<p class="firma">Firma del encargado: ______________________________</p>' +
      '<p class="pie">Generado con NexoRural — AGO Soluciones · ' + new Date().toLocaleString('es-AR') + '</p>';
    window.print();
  }

  /** Descarga un CSV que Excel en español abre bien (separador ; y BOM UTF-8). */
  function descargarCSV(nombreArchivo, encabezados, filas) {
    var celda = function (v) {
      var t = typeof v === 'number' ? String(v).replace('.', ',') : String(v == null ? '' : v);
      if (/^[=+\-@]/.test(t) && typeof v !== 'number') t = "'" + t; // evita fórmulas inyectadas en Excel
      return '"' + t.replace(/"/g, '""') + '"';
    };
    var csv = [encabezados].concat(filas).map(function (f) { return f.map(celda).join(';'); }).join('\r\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function csvDeCarga(carga) {
    return carga.animales.map(function (a, i) {
      return [i + 1, L.nombreTipo(a.tipo), a.caravana || '', fecha(a.hora, true), a.peso];
    });
  }

  root.NexoUI = {
    esc: esc,
    fecha: fecha,
    fechaCorta: fechaCorta,
    hora: hora,
    ESTADOS: ESTADOS,
    iniciarPagina: iniciarPagina,
    imprimirPlanilla: imprimirPlanilla,
    descargarCSV: descargarCSV,
    csvDeCarga: csvDeCarga,
    ENCABEZADOS_ANIMALES: ['N.º', 'Tipo', 'Caravana', 'Fecha y hora', 'Peso (kg)']
  };
})(typeof self !== 'undefined' ? self : this);
