/*
 * NexoRural — Panel de carga (interfaz)
 * AGO Soluciones
 *
 * Toda la regla de negocio vive en logic.js (NexoLogic).
 * Este archivo solo lee el formulario, llama a la lógica y pinta la pantalla.
 */
(function () {
  'use strict';

  var L = window.NexoLogic;
  var CLAVE_CARGA = 'nexorural.carga';
  var CLAVE_SESION = 'nexorural.operador';
  var ANCHO_CAJA = 572;   // ancho útil de la jaula en el SVG
  var X_CAJA = 34;

  var $ = function (id) { return document.getElementById(id); };
  var kg = L.formatearKg;

  /* ---------- Estado ---------- */
  var estado = cargarEstado();
  var pendienteConfirmar = null;  // clave tipo|peso que espera confirmación por rango
  var ultimoEliminado = null;     // para "Deshacer"
  var timerMensaje = null;

  function cargarEstado() {
    try {
      var e = JSON.parse(localStorage.getItem(CLAVE_CARGA));
      if (e && Array.isArray(e.animales)) return e;
    } catch (err) { /* dato corrupto: empezar de cero */ }
    return { capacidad: 0, patente: '', animales: [] };
  }

  function guardarEstado() {
    localStorage.setItem(CLAVE_CARGA, JSON.stringify(estado));
  }

  /* ---------- Operador / encabezado ---------- */
  var operador = localStorage.getItem(CLAVE_SESION) || sessionStorage.getItem(CLAVE_SESION) || 'Operador';
  $('nombreOperador').textContent = operador;
  $('avatar').textContent = operador.trim().charAt(0).toUpperCase() || '?';

  var ahora = new Date();
  var h = ahora.getHours();
  var saludo = h < 13 ? 'Buen día' : (h < 20 ? 'Buenas tardes' : 'Buenas noches');
  $('saludo').textContent = saludo + ', ' + operador.split(' ')[0];
  $('fechaHoy').textContent = ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  $('btnSalir').addEventListener('click', function () {
    localStorage.removeItem(CLAVE_SESION);
    sessionStorage.removeItem(CLAVE_SESION);
    location.href = 'index.html';
  });

  /* ---------- Mensajes ---------- */
  function mostrarMensaje(tipo, html, persistente) {
    var box = $('mensaje');
    clearTimeout(timerMensaje);
    box.className = 'alert alert--' + tipo;
    box.innerHTML = html;
    box.hidden = false;
    if (!persistente) {
      timerMensaje = setTimeout(function () { box.hidden = true; }, 5000);
    }
  }

  function ocultarMensaje() {
    clearTimeout(timerMensaje);
    $('mensaje').hidden = true;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- RF-01: configuración de capacidad ---------- */
  $('formConfig').addEventListener('submit', function (e) {
    e.preventDefault();
    var r = L.validarCapacidad($('capacidad').value, L.sumarPesos(estado.animales));
    var ayuda = $('capacidadAyuda');
    if (!r.ok) {
      ayuda.textContent = r.mensaje;
      ayuda.classList.add('is-error');
      $('capacidad').classList.add('is-invalid');
      $('capacidad').focus();
      return;
    }
    ayuda.classList.remove('is-error');
    $('capacidad').classList.remove('is-invalid');
    var eraNueva = !estado.capacidad;
    estado.capacidad = r.capacidad;
    estado.patente = $('patente').value.trim().toUpperCase();
    guardarEstado();
    render();
    ayuda.textContent = eraNueva
      ? 'Carga iniciada. Ya podés registrar animales.'
      : 'Capacidad actualizada a ' + kg(r.capacidad) + '.';
    if (eraNueva) document.querySelector('input[name="tipo"]').focus();
  });

  // Reiniciar en dos pasos (sin ventanas emergentes del navegador).
  var timerReinicio = null;
  $('btnReiniciar').addEventListener('click', function () {
    var btn = this;
    if (!btn.classList.contains('is-confirm')) {
      btn.classList.add('is-confirm');
      btn.textContent = '¿Vaciar todo? Confirmar';
      timerReinicio = setTimeout(function () {
        btn.classList.remove('is-confirm');
        btn.textContent = 'Reiniciar carga';
      }, 4000);
      return;
    }
    clearTimeout(timerReinicio);
    btn.classList.remove('is-confirm');
    btn.textContent = 'Reiniciar carga';
    estado = { capacidad: 0, patente: '', animales: [] };
    ultimoEliminado = null;
    guardarEstado();
    $('capacidad').value = '';
    $('patente').value = '';
    $('capacidadAyuda').textContent = 'Carga reiniciada. Ingresá la capacidad del próximo camión.';
    ocultarMensaje();
    render();
    $('capacidad').focus();
  });

  /* ---------- RF-02 a RF-06: registro de animal ---------- */
  function tipoSeleccionado() {
    var r = document.querySelector('input[name="tipo"]:checked');
    return r ? r.value : '';
  }

  function resetConfirmacion() {
    if (pendienteConfirmar) {
      pendienteConfirmar = null;
      $('btnRegistrar').textContent = 'Registrar animal';
      $('btnRegistrar').classList.remove('btn--warn');
      ocultarMensaje();
    }
  }

  $('formAnimal').addEventListener('submit', function (e) {
    e.preventDefault();
    var datos = {
      tipo: tipoSeleccionado(),
      peso: $('peso').value,
      caravana: $('caravana').value
    };

    var r = L.evaluarRegistro(estado, datos);

    if (!r.ok) {
      pendienteConfirmar = null;
      $('btnRegistrar').textContent = 'Registrar animal';
      $('btnRegistrar').classList.remove('btn--warn');

      if (r.motivo === 'excede') {
        mostrarMensaje('error',
          '<strong>' + esc(r.mensaje) + '</strong>' +
          '<span>Con este animal el total sería ' + kg(r.propuesto) + ' (excede por ' + kg(r.exceso) + '). ' +
          'No se agregó. Disponible: ' + kg(L.resumen(estado).disponible) + '.</span>', true);
        pintarCamion(r.peso);
        sacudir($('seccion-camion'));
      } else if (r.motivo === 'sin_capacidad') {
        mostrarMensaje('error', '<strong>' + esc(r.mensaje) + '</strong>', true);
        $('capacidad').focus();
      } else {
        mostrarMensaje('error', '<strong>' + esc(r.mensaje) + '</strong>' +
          '<span>Elegí el tipo de animal e ingresá un peso numérico mayor a 0.</span>', true);
        marcarInvalidos(datos);
      }
      return;
    }

    // Peso fuera del rango orientativo: pedir confirmación (sección 12, último caso).
    var clave = datos.tipo + '|' + r.peso;
    if (r.advertenciaRango && pendienteConfirmar !== clave) {
      var t = L.TIPOS_ANIMAL[datos.tipo];
      pendienteConfirmar = clave;
      mostrarMensaje('warn',
        '<strong>Revisá el dato: ' + kg(r.peso) + ' está fuera del rango orientativo</strong>' +
        '<span>Rango habitual de ' + t.nombre.toLowerCase() + ': ' + kg(t.min) + ' – ' + kg(t.max) +
        '. Si el peso es correcto, presioná “Confirmar igualmente”.</span>', true);
      $('btnRegistrar').textContent = 'Confirmar igualmente';
      $('btnRegistrar').classList.add('btn--warn');
      return;
    }

    var res = L.registrarAnimal(estado, datos);
    estado = Object.assign({}, estado, { animales: res.estado.animales });
    guardarEstado();

    pendienteConfirmar = null;
    $('btnRegistrar').textContent = 'Registrar animal';
    $('btnRegistrar').classList.remove('btn--warn');
    mostrarMensaje('ok', '<strong>' + esc(r.mensaje) + '</strong>' +
      '<span>' + L.TIPOS_ANIMAL[datos.tipo].nombre + ' · ' + kg(r.peso) +
      '. Quedan ' + kg(r.disponible) + ' disponibles.</span>');

    $('peso').value = '';
    $('caravana').value = '';
    actualizarPreview();
    render(res.estado.animales[res.estado.animales.length - 1].id);
    $('peso').focus();
  });

  function marcarInvalidos(datos) {
    var pesoMal = isNaN(L.parsearPeso(datos.peso)) || L.parsearPeso(datos.peso) <= 0;
    $('peso').classList.toggle('is-invalid', pesoMal);
    $('especies').classList.toggle('is-invalid', !datos.tipo);
    if (!datos.tipo) document.querySelector('input[name="tipo"]').focus();
    else if (pesoMal) $('peso').focus();
  }

  function actualizarPreview() {
    var p = $('pesoPreview');
    var v = $('peso').value;
    var n = L.parsearPeso(v);
    if (!v.trim()) {
      p.textContent = 'Usá coma para decimales: 650,5 kg';
      p.className = 'field-help mono';
    } else if (isNaN(n) || n <= 0) {
      p.textContent = 'Valor no válido';
      p.className = 'field-help mono is-error';
    } else {
      p.textContent = 'Se registrará: ' + kg(n);
      p.className = 'field-help mono is-ok';
    }
  }

  $('peso').addEventListener('input', function () {
    this.classList.remove('is-invalid');
    actualizarPreview();
    resetConfirmacion();
  });
  document.querySelectorAll('input[name="tipo"]').forEach(function (r) {
    r.addEventListener('change', function () {
      $('especies').classList.remove('is-invalid');
      resetConfirmacion();
    });
  });
  $('capacidad').addEventListener('input', function () {
    this.classList.remove('is-invalid');
    $('capacidadAyuda').classList.remove('is-error');
  });

  /* ---------- RF-09: eliminar y deshacer ---------- */
  $('tablaAnimales').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-eliminar]');
    if (!btn) return;
    var id = btn.getAttribute('data-eliminar');
    var idx = estado.animales.findIndex(function (a) { return a.id === id; });
    if (idx === -1) return;
    ultimoEliminado = { animal: estado.animales[idx], indice: idx };
    estado = Object.assign({}, estado, L.eliminarAnimal(estado, id));
    guardarEstado();
    render();
    mostrarMensaje('info', '<strong>Registro eliminado</strong><span>Se recalcularon los totales. ' +
      '<button type="button" class="link-btn" id="btnDeshacer">Deshacer</button></span>');
  });

  $('mensaje').addEventListener('click', function (e) {
    if (e.target.id !== 'btnDeshacer' || !ultimoEliminado) return;
    var a = ultimoEliminado.animal;
    if (L.sumarPesos(estado.animales) + a.peso > estado.capacidad) {
      mostrarMensaje('error', '<strong>' + L.MENSAJES.EXCEDE + '</strong><span>No se puede restaurar el registro.</span>', true);
      return;
    }
    var lista = estado.animales.slice();
    lista.splice(ultimoEliminado.indice, 0, a);
    estado = Object.assign({}, estado, { animales: lista });
    ultimoEliminado = null;
    guardarEstado();
    render(a.id);
    mostrarMensaje('ok', '<strong>Registro restaurado</strong>');
  });

  /* ---------- Render ---------- */
  function render(idNuevo) {
    var s = L.resumen(estado);
    var configurado = s.capacidad > 0;

    // Indicadores
    $('kpiCargado').textContent = kg(s.cargado);
    $('kpiCargadoHint').textContent = s.porcentaje.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' % de la capacidad';
    $('kpiCapacidad').textContent = configurado ? kg(s.capacidad) : '—';
    $('kpiDisponible').textContent = configurado ? kg(s.disponible) : '—';
    $('kpiDisponibleCard').dataset.nivel = s.nivel;
    $('kpiCantidad').textContent = s.cantidad;
    $('disponibleMini').textContent = configurado ? 'Disponible: ' + kg(s.disponible) : '';

    var conteo = { vaca: 0, toro: 0, oveja: 0 };
    estado.animales.forEach(function (a) { conteo[a.tipo] = (conteo[a.tipo] || 0) + 1; });
    var partes = [];
    if (conteo.vaca) partes.push(conteo.vaca + (conteo.vaca === 1 ? ' vaca' : ' vacas'));
    if (conteo.toro) partes.push(conteo.toro + (conteo.toro === 1 ? ' toro' : ' toros'));
    if (conteo.oveja) partes.push(conteo.oveja + (conteo.oveja === 1 ? ' oveja' : ' ovejas'));
    $('kpiDesglose').textContent = partes.length ? partes.join(' · ') : 'Sin registros';

    // Estado general
    var pill = $('estadoPill');
    var textos = { vacio: configurado ? 'Listo para cargar' : 'Sin configurar', ok: 'Cargando', alto: 'Casi lleno', lleno: 'Capacidad completa' };
    pill.textContent = textos[s.nivel];
    pill.dataset.nivel = configurado ? s.nivel : 'off';

    var chip = $('chipPatente');
    chip.hidden = !estado.patente;
    chip.textContent = estado.patente;

    // Configuración
    $('configBadge').textContent = configurado ? 'Configurado' : 'Pendiente';
    $('configBadge').classList.toggle('is-done', configurado);
    $('btnConfig').textContent = configurado ? 'Actualizar capacidad' : 'Iniciar carga';
    $('btnReiniciar').hidden = !configurado;
    if (configurado && document.activeElement !== $('capacidad')) {
      $('capacidad').value = s.capacidad.toLocaleString('es-AR', { maximumFractionDigits: 2 });
      $('patente').value = estado.patente || '';
    }
    $('seccion-config').classList.toggle('card--highlight', !configurado);
    $('formAnimal').classList.toggle('is-disabled', !configurado);
    $('formAnimal').querySelectorAll('input, button').forEach(function (el) { el.disabled = !configurado; });

    // Barra de progreso
    $('progresoBarra').style.width = s.porcentaje + '%';
    $('progreso').dataset.nivel = s.nivel;
    $('progreso').setAttribute('aria-valuenow', Math.round(s.porcentaje));
    $('progresoTexto').textContent = s.porcentaje.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' %';
    $('escalaMedio').textContent = configurado ? kg(s.capacidad / 2) : '—';
    $('escalaMax').textContent = configurado ? kg(s.capacidad) : '—';

    pintarCamion();
    pintarTabla(idNuevo);
  }

  // Dibuja los animales dentro de la jaula. `pesoRechazado` muestra el exceso en rojo.
  function pintarCamion(pesoRechazado) {
    var g = $('truckSegments');
    var cap = estado.capacidad;
    var html = '';
    var x = X_CAJA;
    if (cap > 0) {
      estado.animales.forEach(function (a, i) {
        var w = (a.peso / cap) * ANCHO_CAJA;
        html += '<g class="seg seg--' + a.tipo + '"><title>' + (i + 1) + '. ' + L.TIPOS_ANIMAL[a.tipo].nombre + ' · ' + kg(a.peso) + '</title>' +
          '<rect x="' + x.toFixed(2) + '" y="34" width="' + Math.max(w, 1).toFixed(2) + '" height="164"/>';
        if (w > 46) {
          html += '<text x="' + (x + w / 2).toFixed(2) + '" y="186" text-anchor="middle">' + Math.round(a.peso) + '</text>';
        }
        html += '</g>';
        x += w;
      });
      if (pesoRechazado) {
        var wr = (pesoRechazado / cap) * ANCHO_CAJA;
        html += '<rect class="seg-rechazo" x="' + x.toFixed(2) + '" y="38" width="' + wr.toFixed(2) + '" height="156" rx="4"/>';
      }
    }
    g.innerHTML = html;
    if (pesoRechazado) {
      setTimeout(function () {
        var r = g.querySelector('.seg-rechazo');
        if (r) r.remove();
      }, 2200);
    }
    var s = L.resumen(estado);
    var pct = $('truckPct');
    pct.textContent = cap > 0 ? Math.round(s.porcentaje) + '%' : 'Sin capacidad';
    pct.classList.toggle('is-small', !cap);
    document.querySelector('.truck').dataset.nivel = s.nivel;
  }

  function pintarTabla(idNuevo) {
    var tbody = $('tablaAnimales');
    var acumulado = 0;
    tbody.innerHTML = estado.animales.map(function (a, i) {
      acumulado += a.peso;
      var t = L.TIPOS_ANIMAL[a.tipo];
      var hora = new Date(a.hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      var aviso = L.fueraDeRango(a.tipo, a.peso)
        ? ' <span class="tag tag--warn" title="Fuera del rango orientativo">revisado</span>' : '';
      return '<tr' + (a.id === idNuevo ? ' class="is-new"' : '') + '>' +
        '<td class="mono">' + String(i + 1).padStart(2, '0') + '</td>' +
        '<td><span class="tag tag--' + a.tipo + '">' + t.nombre + '</span>' + aviso + '</td>' +
        '<td class="mono">' + (a.caravana ? esc(a.caravana) : '<span class="muted">—</span>') + '</td>' +
        '<td class="num mono">' + kg(a.peso) + '</td>' +
        '<td class="num mono muted">' + kg(Math.round(acumulado * 100) / 100) + '</td>' +
        '<td class="mono muted">' + hora + '</td>' +
        '<td class="actions"><button type="button" class="icon-btn icon-btn--danger" data-eliminar="' + esc(a.id) + '" ' +
        'title="Eliminar registro" aria-label="Eliminar ' + t.nombre + ' de ' + kg(a.peso) + '">' +
        '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></td>' +
        '</tr>';
    }).join('');

    var vacia = estado.animales.length === 0;
    $('listaVacia').hidden = !vacia;
    document.querySelector('.table').classList.toggle('is-empty', vacia);
    $('totalTabla').textContent = kg(L.sumarPesos(estado.animales));
    $('listaResumen').textContent = vacia
      ? 'Todavía no hay animales registrados.'
      : estado.animales.length + (estado.animales.length === 1 ? ' animal aceptado' : ' animales aceptados') + ' en esta carga.';
  }

  function sacudir(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  /* ---------- Planilla imprimible ---------- */
  $('btnImprimir').addEventListener('click', function () {
    var s = L.resumen(estado);
    var filas = estado.animales.map(function (a, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + L.TIPOS_ANIMAL[a.tipo].nombre + '</td><td>' + (esc(a.caravana) || '—') +
        '</td><td class="num">' + kg(a.peso) + '</td></tr>';
    }).join('');
    $('planilla').innerHTML =
      '<h1>NexoRural · Planilla de carga</h1>' +
      '<p>Fecha: ' + new Date().toLocaleString('es-AR') + ' · Operador: ' + esc(operador) +
      (estado.patente ? ' · Patente: ' + esc(estado.patente) : '') + '</p>' +
      '<p>Capacidad: <b>' + kg(s.capacidad) + '</b> · Cargado: <b>' + kg(s.cargado) + '</b> · Disponible: <b>' + kg(s.disponible) +
      '</b> · Animales: <b>' + s.cantidad + '</b></p>' +
      '<table><thead><tr><th>N.º</th><th>Tipo</th><th>Caravana</th><th class="num">Peso</th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="4">Sin animales registrados</td></tr>') + '</tbody></table>' +
      '<p class="firma">Firma del encargado: ______________________________</p>' +
      '<p class="pie">Generado con NexoRural — AGO Soluciones</p>';
    window.print();
  });

  /* ---------- Navegación lateral: resaltar sección visible ---------- */
  var links = document.querySelectorAll('.side-nav a');
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (l) {
          l.classList.toggle('is-active', l.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    ['seccion-camion', 'seccion-registro', 'seccion-lista', 'seccion-rangos'].forEach(function (id) {
      obs.observe($(id));
    });
  }

  render();
  if (!estado.capacidad) $('capacidad').focus();
})();
