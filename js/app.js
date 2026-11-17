/*
 * NexoRural — Panel de carga (interfaz)
 * AGO Soluciones
 *
 * Reglas de negocio: logic.js (NexoLogic)
 * Guardado:          store.js (servidor PHP/MySQL o navegador)
 * Este archivo solo lee el formulario, valida, pide al store y pinta la pantalla.
 */
(function () {
  'use strict';

  var L = window.NexoLogic;
  var UI = window.NexoUI;
  var ANCHO_CAJA = 572;   // ancho útil de la jaula en el SVG
  var X_CAJA = 34;
  var ESPERA_DOBLE_CLIC = 1500;

  var $ = function (id) { return document.getElementById(id); };
  var kg = L.formatearKg;
  var esc = UI.esc;

  /* ---------- Estado de la pantalla ---------- */
  var store = null;
  var usuario = null;
  var carga = null;               // null = no hay carga abierta
  var pendienteConfirmar = null;  // clave tipo|peso que espera confirmación por rango
  var ultimoEliminado = null;     // id para "Deshacer"
  var ultimaFinalizada = null;    // para imprimir después de cerrar
  var ultimoRegistro = 0;
  var ocupado = false;
  var timerMensaje = null;

  function estado() {
    return carga ? { capacidad: carga.capacidad, animales: carga.animales } : { capacidad: 0, animales: [] };
  }

  /* ---------- Arranque ---------- */
  var ahora = new Date();
  var h = ahora.getHours();
  var saludo = h < 13 ? 'Buen día' : (h < 20 ? 'Buenas tardes' : 'Buenas noches');
  $('fechaHoy').textContent = ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  UI.iniciarPagina().then(function (ctx) {
    store = ctx.store;
    usuario = ctx.usuario;
    $('saludo').textContent = saludo + ', ' + usuario.nombre.split(' ')[0];
    return store.cargaActual();
  }).then(function (c) {
    carga = c;
    render();
    document.body.classList.remove('is-cargando');
    if (!carga) $('capacidad').focus({ preventScroll: true });
  }).catch(function (e) {
    document.body.classList.remove('is-cargando');
    mostrarMensaje('error', '<strong>' + esc(e.mensaje || 'Error al cargar los datos') + '</strong>', true);
  });

  /* ---------- Mensajes ---------- */
  function mostrarMensaje(tipo, html, persistente) {
    var box = $('mensaje');
    clearTimeout(timerMensaje);
    box.className = 'alert alert--' + tipo;
    box.innerHTML = html;
    box.hidden = false;
    if (!persistente) timerMensaje = setTimeout(function () { box.hidden = true; }, 6000);
  }
  function ocultarMensaje() {
    clearTimeout(timerMensaje);
    $('mensaje').hidden = true;
  }
  function errorGeneral(e) {
    mostrarMensaje('error', '<strong>' + esc(e.mensaje || 'Ocurrió un error') + '</strong>' +
      (e.detalle ? '<span>' + esc(e.detalle) + '</span>' : ''), true);
    if (e.carga !== undefined) { carga = e.carga; render(); }
  }

  /** Ejecuta una operación del store bloqueando los botones mientras tanto. */
  function operar(promesa) {
    ocupado = true;
    document.body.classList.add('is-ocupado');
    return promesa.then(function (v) {
      ocupado = false;
      document.body.classList.remove('is-ocupado');
      return v;
    }, function (e) {
      ocupado = false;
      document.body.classList.remove('is-ocupado');
      throw e;
    });
  }

  /* ---------- RF-01: configuración de capacidad ---------- */
  $('formConfig').addEventListener('submit', function (e) {
    e.preventDefault();
    if (ocupado) return;
    var ayuda = $('capacidadAyuda');
    var r = L.validarCapacidad($('capacidad').value, L.sumarPesos(estado().animales));
    if (!r.ok) return errorCapacidad(r.mensaje);

    var patente = $('patente').value.trim().toUpperCase();
    var eraNueva = !carga;
    operar(eraNueva ? store.iniciar(r.capacidad, patente) : store.actualizar(r.capacidad, patente)).then(function (c) {
      carga = c;
      ayuda.classList.remove('is-error');
      $('capacidad').classList.remove('is-invalid');
      render();
      ayuda.textContent = eraNueva
        ? 'Carga iniciada. Ya podés registrar animales.'
        : 'Datos del camión actualizados (' + kg(c.capacidad) + ').';
      if (eraNueva) document.querySelector('input[name="tipo"]').focus();
    }, function (err) { errorCapacidad(err.mensaje); });
  });

  function errorCapacidad(msg) {
    var ayuda = $('capacidadAyuda');
    ayuda.textContent = msg;
    ayuda.classList.add('is-error');
    $('capacidad').classList.add('is-invalid');
    $('capacidad').focus();
  }

  /* Botones en dos pasos (sin ventanas emergentes del navegador). */
  function dosPasos(btn, textoConfirmar, accion) {
    var original = btn.textContent;
    var timer = null;
    btn.addEventListener('click', function () {
      if (ocupado) return;
      if (!btn.classList.contains('is-confirm')) {
        btn.classList.add('is-confirm');
        btn.textContent = textoConfirmar;
        timer = setTimeout(function () { btn.classList.remove('is-confirm'); btn.textContent = original; }, 4000);
        return;
      }
      clearTimeout(timer);
      btn.classList.remove('is-confirm');
      btn.textContent = original;
      accion();
    });
  }

  // Cerrar carga: queda en el historial como "cerrada".
  dosPasos($('btnCerrar'), '¿Cerrar el viaje? Confirmar', function () {
    operar(store.cerrar($('observaciones').value.trim())).then(function (fin) {
      finalizada(fin, 'Carga cerrada',
        fin.animales.length + (fin.animales.length === 1 ? ' animal · ' : ' animales · ') + kg(L.sumarPesos(fin.animales)) +
        '. Quedó guardada en el historial.');
    }, errorGeneral);
  });

  // Cancelar carga: queda en el historial como "cancelada".
  dosPasos($('btnReiniciar'), '¿Descartar la carga? Confirmar', function () {
    operar(store.cancelar()).then(function (fin) {
      finalizada(fin, 'Carga cancelada', 'Ingresá la capacidad del próximo camión.');
    }, errorGeneral);
  });

  function finalizada(fin, titulo, texto) {
    ultimaFinalizada = fin;
    carga = null;
    ultimoEliminado = null;
    $('capacidad').value = '';
    $('patente').value = '';
    $('observaciones').value = '';
    $('capacidadAyuda').textContent = 'Dato obligatorio: la consigna no fija la capacidad, la define el usuario.';
    render();
    mostrarMensaje(fin.estado === 'cerrada' ? 'ok' : 'info', '<strong>' + titulo + '</strong><span>' + esc(texto) +
      (fin.estado === 'cerrada' ? ' <button type="button" class="link-btn" id="btnImprimirFinal">Imprimir planilla</button>' +
        ' · <a class="link-btn" href="historial.html">Ver historial</a>' : '') + '</span>', true);
    $('capacidad').focus();
  }

  /* ---------- RF-02 a RF-06: registro de animal ---------- */
  function tipoSeleccionado() {
    var r = document.querySelector('input[name="tipo"]:checked');
    return r ? r.value : '';
  }

  function botonRegistrar(confirmar) {
    $('btnRegistrar').textContent = confirmar ? 'Confirmar igualmente' : 'Registrar animal';
    $('btnRegistrar').classList.toggle('btn--warn', !!confirmar);
  }

  function resetConfirmacion() {
    if (pendienteConfirmar) {
      pendienteConfirmar = null;
      botonRegistrar(false);
      ocultarMensaje();
    }
  }

  $('formAnimal').addEventListener('submit', function (e) {
    e.preventDefault();
    if (ocupado) return;
    // Doble clic: si se acaba de registrar y el campo quedó vacío, ignorar el 2.º envío.
    if (!$('peso').value.trim() && Date.now() - ultimoRegistro < ESPERA_DOBLE_CLIC) return;

    var datos = { tipo: tipoSeleccionado(), peso: $('peso').value, caravana: $('caravana').value };
    var r = L.evaluarRegistro(estado(), datos);

    if (!r.ok) {
      pendienteConfirmar = null;
      botonRegistrar(false);
      if (r.motivo === 'excede') {
        mostrarExceso(r.peso, r.propuesto, r.exceso);
        store.rechazo({ tipo: datos.tipo, peso: String(r.peso), motivo: 'excede' });
      } else if (r.motivo === 'sin_capacidad') {
        mostrarMensaje('error', '<strong>' + esc(r.mensaje) + '</strong>', true);
        $('capacidad').focus();
      } else {
        mostrarMensaje('error', '<strong>' + esc(r.mensaje) + '</strong><span>' + esc(r.detalle || '') + '</span>', true);
        marcarInvalidos(datos);
        if (datos.tipo || datos.peso.trim()) store.rechazo({ tipo: datos.tipo, peso: datos.peso, motivo: 'invalido' });
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
      botonRegistrar(true);
      return;
    }

    operar(store.registrar({
      tipo: datos.tipo,
      peso: r.peso,
      caravana: datos.caravana.trim(),
      fueraDeRango: !!r.advertenciaRango
    })).then(function (res) {
      carga = res.carga;
      pendienteConfirmar = null;
      ultimoRegistro = Date.now();
      botonRegistrar(false);
      var s = L.resumen(estado());
      mostrarMensaje('ok', '<strong>' + esc(L.MENSAJES.OK) + '</strong>' +
        '<span>' + L.nombreTipo(datos.tipo) + ' · ' + kg(r.peso) + '. Quedan ' + kg(s.disponible) + ' disponibles.</span>');
      $('peso').value = '';
      $('caravana').value = '';
      actualizarPreview();
      render(res.id);
      $('peso').focus();
    }, function (err) {
      pendienteConfirmar = null;
      botonRegistrar(false);
      if (err.motivo === 'excede') {
        // Otro dispositivo cargó en la misma carga: se muestra el total real.
        if (err.carga) carga = err.carga;
        render();
        mostrarExceso(r.peso, err.propuesto, err.exceso);
      } else {
        errorGeneral(err);
      }
    });
  });

  function mostrarExceso(peso, propuesto, exceso) {
    var s = L.resumen(estado());
    mostrarMensaje('error',
      '<strong>' + esc(L.MENSAJES.EXCEDE) + '</strong>' +
      '<span>' + (propuesto ? 'Con este animal el total sería ' + kg(propuesto) + ' (excede por ' + kg(exceso) + '). ' : '') +
      'No se agregó. Disponible: ' + kg(s.disponible) + '.</span>', true);
    pintarCamion(peso);
    sacudir($('seccion-camion'));
  }

  function marcarInvalidos(datos) {
    var pn = L.parsearPeso(datos.peso);
    var pesoMal = isNaN(pn) || L.redondear(pn) <= 0 || pn > L.LIMITES.pesoAnimalMaxKg;
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
    } else if (isNaN(n) || L.redondear(n) <= 0) {
      p.textContent = 'Valor no válido';
      p.className = 'field-help mono is-error';
    } else if (n > L.LIMITES.pesoAnimalMaxKg) {
      p.textContent = 'Demasiado alto: máximo ' + kg(L.LIMITES.pesoAnimalMaxKg);
      p.className = 'field-help mono is-error';
    } else {
      p.textContent = 'Se registrará: ' + kg(L.redondear(n));
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
    if (!btn || ocupado) return;
    var id = btn.getAttribute('data-eliminar');
    operar(store.eliminar(id)).then(function (c) {
      carga = c;
      ultimoEliminado = id;
      render();
      mostrarMensaje('info', '<strong>Registro eliminado</strong><span>Se recalcularon los totales. ' +
        '<button type="button" class="link-btn" id="btnDeshacer">Deshacer</button></span>');
    }, errorGeneral);
  });

  $('mensaje').addEventListener('click', function (e) {
    if (e.target.id === 'btnImprimirFinal' && ultimaFinalizada) {
      UI.imprimirPlanilla(ultimaFinalizada);
      return;
    }
    if (e.target.id !== 'btnDeshacer' || !ultimoEliminado || ocupado) return;
    var id = ultimoEliminado;
    operar(store.restaurar(id)).then(function (c) {
      carga = c;
      ultimoEliminado = null;
      render(id);
      mostrarMensaje('ok', '<strong>Registro restaurado</strong>');
    }, function (err) {
      if (err.motivo === 'excede') {
        mostrarMensaje('error', '<strong>' + esc(L.MENSAJES.EXCEDE) + '</strong><span>No se puede restaurar el registro.</span>', true);
      } else errorGeneral(err);
    });
  });

  /* ---------- Render ---------- */
  function render(idNuevo) {
    var e = estado();
    var s = L.resumen(e);
    var configurado = !!carga;

    // Indicadores
    $('kpiCargado').textContent = kg(s.cargado);
    $('kpiCargadoHint').textContent = s.porcentaje.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' % de la capacidad';
    $('kpiCapacidad').textContent = configurado ? kg(s.capacidad) : '—';
    $('kpiDisponible').textContent = configurado ? kg(s.disponible) : '—';
    $('kpiDisponibleCard').dataset.nivel = s.nivel;
    $('kpiCantidad').textContent = s.cantidad;
    $('disponibleMini').textContent = configurado ? 'Disponible: ' + kg(s.disponible) : '';

    var conteo = {};
    e.animales.forEach(function (a) { conteo[a.tipo] = (conteo[a.tipo] || 0) + 1; });
    var plural = { vaca: 'vacas', toro: 'toros', oveja: 'ovejas' };
    var partes = Object.keys(conteo).map(function (t) {
      return conteo[t] + ' ' + (conteo[t] === 1 ? L.nombreTipo(t).toLowerCase() : (plural[t] || L.nombreTipo(t).toLowerCase()));
    });
    $('kpiDesglose').textContent = partes.length ? partes.join(' · ') : 'Sin registros';

    // Estado general
    var pill = $('estadoPill');
    var textos = { vacio: configurado ? 'Listo para cargar' : 'Sin configurar', ok: 'Cargando', alto: 'Casi lleno', lleno: 'Capacidad completa' };
    pill.textContent = textos[s.nivel];
    pill.dataset.nivel = configurado ? s.nivel : 'off';

    var chip = $('chipPatente');
    chip.hidden = !(carga && carga.patente);
    chip.textContent = carga ? carga.patente : '';

    // Configuración
    $('configBadge').textContent = configurado ? 'Carga en curso' : 'Pendiente';
    $('configBadge').classList.toggle('is-done', configurado);
    $('btnConfig').textContent = configurado ? 'Actualizar datos' : 'Iniciar carga';
    $('bloqueFinalizar').hidden = !configurado;
    $('btnCerrar').disabled = !configurado || s.cantidad === 0;
    $('btnCerrar').title = s.cantidad === 0 ? 'Registrá al menos un animal para cerrar la carga' : '';
    if (configurado && document.activeElement !== $('capacidad') && document.activeElement !== $('patente')) {
      $('capacidad').value = s.capacidad.toLocaleString('es-AR', { maximumFractionDigits: 2 });
      $('patente').value = carga.patente || '';
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
    var e = estado();
    var g = $('truckSegments');
    var cap = e.capacidad;
    var html = '';
    var x = X_CAJA;
    if (cap > 0) {
      e.animales.forEach(function (a, i) {
        var w = (a.peso / cap) * ANCHO_CAJA;
        html += '<g class="seg seg--' + esc(a.tipo) + '"><title>' + (i + 1) + '. ' + esc(L.nombreTipo(a.tipo)) + ' · ' + kg(a.peso) + '</title>' +
          '<rect x="' + x.toFixed(2) + '" y="34" width="' + Math.max(w, 1).toFixed(2) + '" height="164"/>';
        if (w > 46) html += '<text x="' + (x + w / 2).toFixed(2) + '" y="186" text-anchor="middle">' + Math.round(a.peso) + '</text>';
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
    var s = L.resumen(e);
    var pct = $('truckPct');
    pct.textContent = cap > 0 ? Math.round(s.porcentaje) + '%' : 'Sin capacidad';
    pct.classList.toggle('is-small', !cap);
    document.querySelector('.truck').dataset.nivel = s.nivel;
  }

  function pintarTabla(idNuevo) {
    var e = estado();
    var acumulado = 0;
    $('tablaAnimales').innerHTML = e.animales.map(function (a, i) {
      acumulado = L.redondear(acumulado + a.peso);
      var nombre = esc(L.nombreTipo(a.tipo));
      var aviso = L.fueraDeRango(a.tipo, a.peso)
        ? ' <span class="tag tag--warn" title="Fuera del rango orientativo">revisado</span>' : '';
      return '<tr' + (a.id === idNuevo ? ' class="is-new"' : '') + '>' +
        '<td class="mono">' + String(i + 1).padStart(2, '0') + '</td>' +
        '<td><span class="tag tag--' + esc(a.tipo) + '">' + nombre + '</span>' + aviso + '</td>' +
        '<td class="mono">' + (a.caravana ? esc(a.caravana) : '<span class="muted">—</span>') + '</td>' +
        '<td class="num mono">' + kg(a.peso) + '</td>' +
        '<td class="num mono muted">' + kg(acumulado) + '</td>' +
        '<td class="mono muted">' + UI.hora(a.hora) + '</td>' +
        '<td class="actions"><button type="button" class="icon-btn icon-btn--danger" data-eliminar="' + esc(a.id) + '" ' +
        'title="Eliminar registro" aria-label="Eliminar ' + nombre + ' de ' + kg(a.peso) + '">' +
        '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></td>' +
        '</tr>';
    }).join('');

    var vacia = e.animales.length === 0;
    $('listaVacia').hidden = !vacia;
    document.querySelector('.table').classList.toggle('is-empty', vacia);
    $('totalTabla').textContent = kg(L.sumarPesos(e.animales));
    $('btnImprimir').disabled = !carga;
    $('btnCsv').disabled = vacia;
    $('listaResumen').textContent = vacia
      ? 'Todavía no hay animales registrados.'
      : e.animales.length + (e.animales.length === 1 ? ' animal aceptado' : ' animales aceptados') + ' en esta carga.';
  }

  function sacudir(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  /* ---------- Planilla imprimible y CSV ---------- */
  $('btnImprimir').addEventListener('click', function () {
    if (carga) UI.imprimirPlanilla(carga);
  });
  $('btnCsv').addEventListener('click', function () {
    if (!carga) return;
    UI.descargarCSV('carga-' + (carga.patente || carga.id) + '.csv', UI.ENCABEZADOS_ANIMALES, UI.csvDeCarga(carga));
  });

})();
