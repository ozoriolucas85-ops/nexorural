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
    return isNaN(d) ? '—' : d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
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
        if (store.modo === 'servidor') prepararCambioClave(store);

        // Catálogo de categorías (vaca, toro, oveja + las que agregue el administrador).
        return store.tipos().then(function (tipos) { L.configurarTipos(tipos); }, function () { /* quedan las de fábrica */ })
          .then(function () { return { store: store, usuario: u }; });
      });
    });
  }

  /* ---------- Colores por categoría ---------- */
  var COLORES_FIJOS = { vaca: '#10B981', toro: '#0F766E', oveja: '#A7F3D0' };
  // Colores bien distintos entre sí y de vaca/toro/oveja. Sin ámbar ni rojo: se reservan para alertas.
  var PALETA = ['#84CC16', '#0EA5E9', '#8B5CF6', '#06B6D4', '#4D7C0F', '#6366F1', '#A3E635', '#38BDF8', '#C084FC', '#0369A1'];

  function colorTipo(codigo) {
    if (COLORES_FIJOS[codigo]) return COLORES_FIJOS[codigo];
    var extras = Object.keys(L.TIPOS_ANIMAL).filter(function (k) { return !COLORES_FIJOS[k]; });
    var i = extras.indexOf(codigo);
    return i === -1 ? '#94A3B8' : PALETA[i % PALETA.length];
  }

  /** ¿Conviene texto oscuro sobre este color? (para números dentro del camión) */
  function esClaro(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170;
  }

  /** Etiqueta de categoría con su color. */
  function tagTipo(codigo) {
    var c = colorTipo(codigo);
    return '<span class="tag tag--tipo" style="--c:' + c + '">' + esc(L.nombreTipo(codigo)) + '</span>';
  }

  /* ---------- Cambiar la propia contraseña ---------- */
  function prepararCambioClave(store) {
    var tarjeta = document.querySelector('.side-user');
    if (!tarjeta || document.getElementById('btnMiClave')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn';
    btn.id = 'btnMiClave';
    btn.title = 'Cambiar mi contraseña';
    btn.setAttribute('aria-label', 'Cambiar mi contraseña');
    btn.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg>';
    tarjeta.insertBefore(btn, document.getElementById('btnSalir'));

    var dlg = document.createElement('dialog');
    dlg.className = 'dialogo';
    dlg.innerHTML =
      '<form method="dialog" class="form" id="formMiClave" novalidate>' +
      '<h2>Cambiar mi contraseña</h2>' +
      '<label class="field"><span>Contraseña actual</span><input type="password" id="mcActual" autocomplete="current-password"></label>' +
      '<label class="field"><span>Contraseña nueva <small>(mínimo 6)</small></span><input type="password" id="mcNueva" autocomplete="new-password"></label>' +
      '<label class="field"><span>Repetir la nueva</span><input type="password" id="mcNueva2" autocomplete="new-password"></label>' +
      '<div class="alert" id="mcMensaje" hidden></div>' +
      '<div class="btn-row"><button type="submit" class="btn btn--primary" id="mcGuardar">Guardar</button>' +
      '<button type="button" class="btn btn--ghost" id="mcCerrar">Cancelar</button></div>' +
      '</form>';
    document.body.appendChild(dlg);

    var $ = function (id) { return document.getElementById(id); };
    function aviso(tipo, texto) {
      $('mcMensaje').className = 'alert alert--' + tipo;
      $('mcMensaje').innerHTML = '<strong>' + esc(texto) + '</strong>';
      $('mcMensaje').hidden = false;
    }
    btn.addEventListener('click', function () {
      $('formMiClave').reset();
      $('mcMensaje').hidden = true;
      dlg.showModal();
      $('mcActual').focus();
    });
    $('mcCerrar').addEventListener('click', function () { dlg.close(); });
    $('formMiClave').addEventListener('submit', function (e) {
      e.preventDefault();
      var actual = $('mcActual').value, nueva = $('mcNueva').value;
      if (!actual) return aviso('error', 'Ingresá tu contraseña actual.');
      if (nueva.length < 6) return aviso('error', 'La contraseña nueva debe tener al menos 6 caracteres.');
      if (nueva !== $('mcNueva2').value) return aviso('error', 'Las contraseñas nuevas no coinciden.');
      $('mcGuardar').disabled = true;
      store.miClave(actual, nueva).then(function () {
        $('mcGuardar').disabled = false;
        aviso('ok', 'Contraseña actualizada.');
        setTimeout(function () { dlg.close(); }, 1200);
      }, function (err) {
        $('mcGuardar').disabled = false;
        aviso('error', err.mensaje);
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
    colorTipo: colorTipo,
    esClaro: esClaro,
    tagTipo: tagTipo,
    imprimirPlanilla: imprimirPlanilla,
    descargarCSV: descargarCSV,
    csvDeCarga: csvDeCarga,
    ENCABEZADOS_ANIMALES: ['N.º', 'Tipo', 'Caravana', 'Fecha y hora', 'Peso (kg)']
  };
})(typeof self !== 'undefined' ? self : this);
