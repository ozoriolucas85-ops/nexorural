/* NexoRural — Administración: usuarios, camiones, categorías y acceso desde celulares.
 * Solo administradores. AGO Soluciones */
(function () {
  'use strict';

  var UI = window.NexoUI;
  var L = window.NexoLogic;
  var kg = L.formatearKg;
  var $ = function (id) { return document.getElementById(id); };
  var esc = UI.esc;
  var store = null;
  var yo = null;

  UI.iniciarPagina().then(function (ctx) {
    store = ctx.store;
    document.body.classList.remove('is-cargando');
    if (store.modo === 'local') {
      aviso('Disponible solo con servidor',
        'En modo local no hay usuarios reales. Abrí NexoRural desde XAMPP (http://localhost/nexorural) para gestionarlos.');
      return;
    }
    if (ctx.usuario.rol !== 'administrador') {
      aviso('Sin permiso', 'Solo un administrador puede gestionar usuarios.');
      return;
    }
    $('contenidoUsuarios').hidden = false;
    $('contenidoCamiones').hidden = false;
    $('contenidoTipos').hidden = false;
    cargar();
    cargarCamiones();
    cargarTipos();
    mostrarAccesoCelular();
  });

  function mostrarAccesoCelular() {
    store.direccionesRed().then(function (r) {
      var urls = r.urls;
      if (!urls || !urls.length) return;
      var url = urls[0];
      if (r.publica) {
        // Publicado en internet: se entra desde cualquier lugar con la dirección pública.
        $('accesoCelular').querySelector('.muted').textContent =
          'NexoRural está publicado en internet: se entra con esta dirección desde cualquier celular o computadora.';
        $('urlAyuda').hidden = true;
      }
      $('urlCelular').textContent = url;
      $('btnWhatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(r.publica
        ? 'Entrá a NexoRural: ' + url
        : 'Entrá a NexoRural desde el celular (conectado al wifi del campo): ' + url);
      $('accesoCelular').hidden = false;
      $('btnCopiarUrl').addEventListener('click', function () {
        var b = this;
        var listo = function () { b.textContent = '¡Copiada!'; setTimeout(function () { b.textContent = 'Copiar dirección'; }, 2000); };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(url).then(listo);
        } else {
          var t = document.createElement('textarea');
          t.value = url;
          document.body.appendChild(t);
          t.select();
          document.execCommand('copy');
          t.remove();
          listo();
        }
      });
    }, function () { /* sin red: no se muestra la tarjeta */ });
  }

  function aviso(titulo, texto) {
    $('aviso').innerHTML = '<strong>' + esc(titulo) + '</strong>' + esc(texto);
    $('aviso').hidden = false;
  }

  function mensaje(id, tipo, texto) {
    var el = $(id);
    el.className = 'alert alert--' + tipo;
    el.innerHTML = '<strong>' + esc(texto) + '</strong>';
    el.hidden = false;
  }

  function cargar() {
    store.usuarios().then(function (j) {
      yo = j.yo;
      var activos = j.usuarios.filter(function (u) { return u.activo; }).length;
      $('usrResumen').textContent = j.usuarios.length + (j.usuarios.length === 1 ? ' cuenta · ' : ' cuentas · ') +
        activos + (activos === 1 ? ' activa' : ' activas');
      $('cuerpoUsr').innerHTML = j.usuarios.map(function (u) {
        var propio = u.id === yo;
        return '<tr>' +
          '<td>' + esc(u.nombre) + (propio ? ' <span class="muted">(vos)</span>' : '') + '</td>' +
          '<td class="mono">' + esc(u.usuario) + '</td>' +
          '<td><span class="tag tag--' + esc(u.rol) + '">' + (u.rol === 'administrador' ? 'Administrador' : 'Capataz') + '</span></td>' +
          '<td class="mono muted">' + (u.ultimoIngreso ? UI.fechaCorta(u.ultimoIngreso) : 'Nunca') + '</td>' +
          '<td>' + (u.activo ? '<span class="tag tag--cerrada">Activo</span>' : '<span class="tag tag--inactivo">Inactivo</span>') + '</td>' +
          '<td class="actions"><div class="btn-row" style="flex-wrap:nowrap">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-clave="' + esc(u.id) + '" data-nombre="' + esc(u.nombre) + '">Clave</button>' +
          (propio ? '' : '<button type="button" class="btn btn--ghost btn--sm" data-activo="' + esc(u.id) + '" data-valor="' + (u.activo ? '0' : '1') + '">' +
            (u.activo ? 'Desactivar' : 'Activar') + '</button>') +
          '</div></td></tr>';
      }).join('');
    }, function (e) { mensaje('usrMensaje', 'error', e.mensaje); });
  }

  $('cuerpoUsr').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;

    if (b.hasAttribute('data-activo')) {
      store.activarUsuario(b.getAttribute('data-activo'), b.getAttribute('data-valor') === '1').then(function () {
        mensaje('usrMensaje', 'ok', 'Usuario actualizado.');
        cargar();
      }, function (err) { mensaje('usrMensaje', 'error', err.mensaje); });
    }

    if (b.hasAttribute('data-clave')) {
      // Fila de edición en línea (sin ventanas emergentes).
      var tr = b.closest('tr');
      var sig = tr.nextElementSibling;
      if (sig && sig.classList.contains('fila-clave')) { sig.remove(); return; }
      var fila = document.createElement('tr');
      fila.className = 'fila-clave';
      fila.innerHTML = '<td colspan="6"><form class="btn-row" style="align-items:center">' +
        '<span>Nueva contraseña para <strong>' + esc(b.getAttribute('data-nombre')) + '</strong>:</span>' +
        '<input type="text" class="mono" minlength="6" style="padding:9px 12px;border-radius:10px;border:1.5px solid var(--slate-200)" autocomplete="off">' +
        '<button type="submit" class="btn btn--primary btn--sm">Guardar</button></form></td>';
      tr.after(fila);
      var input = fila.querySelector('input');
      input.focus();
      fila.querySelector('form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        store.cambiarClave(b.getAttribute('data-clave'), input.value).then(function () {
          fila.remove();
          mensaje('usrMensaje', 'ok', 'Contraseña actualizada. El usuario ya puede ingresar con la nueva.');
        }, function (err) { mensaje('usrMensaje', 'error', err.mensaje); });
      });
    }
  });

  $('formUsuario').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = {
      nombre: $('uNombre').value.trim(),
      usuario: $('uUsuario').value.trim(),
      clave: $('uClave').value,
      rol: $('uRol').value
    };
    if (d.nombre.length < 2) return mensaje('formMensaje', 'error', 'Ingresá el nombre y apellido.');
    var errUsuario = L.validarUsuario(d.usuario);
    if (errUsuario) return mensaje('formMensaje', 'error', errUsuario);
    if (d.clave.length < 6) return mensaje('formMensaje', 'error', 'La contraseña debe tener al menos 6 caracteres.');
    store.crearUsuario(d).then(function () {
      mensaje('formMensaje', 'ok', 'Usuario "' + d.usuario + '" creado.');
      $('formUsuario').reset();
      cargar();
    }, function (err) { mensaje('formMensaje', 'error', err.mensaje); });
  });

  /* =====================================================
     CAMIONES GUARDADOS
     ===================================================== */
  var listaCamiones = [];

  function cargarCamiones() {
    store.camionesTodos().then(function (lista) {
      listaCamiones = lista;
      $('camVacio').hidden = lista.length > 0;
      $('tablaCamiones').classList.toggle('is-empty', !lista.length);
      $('cuerpoCam').innerHTML = lista.map(function (c) {
        return '<tr>' +
          '<td class="mono">' + esc(c.patente) + '</td>' +
          '<td>' + (esc(c.descripcion) || '<span class="muted">—</span>') + '</td>' +
          '<td class="num mono">' + kg(c.capacidad) + '</td>' +
          '<td>' + (c.activo ? '<span class="tag tag--cerrada">Activo</span>' : '<span class="tag tag--inactivo">Inactivo</span>') + '</td>' +
          '<td class="actions"><div class="btn-row" style="flex-wrap:nowrap">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-cam-editar="' + esc(c.id) + '">Editar</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-cam-activo="' + esc(c.id) + '" data-valor="' + (c.activo ? '0' : '1') + '">' +
          (c.activo ? 'Desactivar' : 'Activar') + '</button></div></td></tr>';
      }).join('');
    }, function (e) { mensaje('camMensaje', 'error', e.mensaje); });
  }

  function formCamion(c) {
    $('cId').value = c ? c.id : '';
    $('cPatente').value = c ? c.patente : '';
    $('cCapacidad').value = c ? c.capacidad.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '';
    $('cDescripcion').value = c ? c.descripcion : '';
    $('camTitulo').textContent = c ? 'Editar camión ' + c.patente : 'Nuevo camión';
    $('cCancelar').hidden = !c;
    $('cFormMensaje').hidden = true;
  }

  $('cuerpoCam').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-cam-editar')) {
      var c = listaCamiones.filter(function (x) { return x.id === b.getAttribute('data-cam-editar'); })[0];
      formCamion(c);
      $('cPatente').focus();
    } else if (b.hasAttribute('data-cam-activo')) {
      store.activarCamion(b.getAttribute('data-cam-activo'), b.getAttribute('data-valor') === '1').then(function () {
        mensaje('camMensaje', 'ok', 'Camión actualizado.');
        cargarCamiones();
      }, function (err) { mensaje('camMensaje', 'error', err.mensaje); });
    }
  });
  $('cCancelar').addEventListener('click', function () { formCamion(null); });

  $('formCamion').addEventListener('submit', function (e) {
    e.preventDefault();
    var patente = $('cPatente').value.replace(/\s+/g, '').toUpperCase();
    var v = L.validarCapacidad($('cCapacidad').value, 0);
    if (!/^[A-Z0-9-]{5,10}$/.test(patente)) return mensaje('cFormMensaje', 'error', 'La patente solo puede tener letras y números (5 a 10).');
    if (!v.ok) return mensaje('cFormMensaje', 'error', v.mensaje);
    var editandoCam = !!$('cId').value;
    store.guardarCamion({ id: $('cId').value || null, patente: patente, capacidad: v.capacidad, descripcion: $('cDescripcion').value.trim() })
      .then(function () {
        formCamion(null);
        mensaje('cFormMensaje', 'ok', editandoCam ? 'Camión actualizado.' : 'Camión ' + patente + ' guardado.');
        cargarCamiones();
      }, function (err) { mensaje('cFormMensaje', 'error', err.mensaje); });
  });

  /* =====================================================
     CATEGORÍAS DE ANIMALES
     ===================================================== */
  var listaTipos = [];

  function cargarTipos() {
    store.tipos().then(function (lista) {
      listaTipos = lista;
      L.configurarTipos(lista);
      $('cuerpoTip').innerHTML = lista.map(function (t) {
        return '<tr>' +
          '<td>' + UI.tagTipo(t.codigo) + '</td>' +
          '<td class="num mono">' + kg(t.min) + '</td>' +
          '<td class="num mono">' + kg(t.max) + '</td>' +
          '<td>' + (t.activo ? '<span class="tag tag--cerrada">Activa</span>' : '<span class="tag tag--inactivo">Inactiva</span>') + '</td>' +
          '<td class="actions"><div class="btn-row" style="flex-wrap:nowrap">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-tip-editar="' + esc(t.codigo) + '">Editar</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-tip-activo="' + esc(t.codigo) + '" data-valor="' + (t.activo ? '0' : '1') + '">' +
          (t.activo ? 'Desactivar' : 'Activar') + '</button></div></td></tr>';
      }).join('');
    }, function (e) { mensaje('tipMensaje', 'error', e.mensaje); });
  }

  function formTipo(t) {
    $('tCodigo').value = t ? t.codigo : '';
    $('tNombre').value = t ? t.nombre : '';
    $('tMin').value = t ? t.min.toLocaleString('es-AR') : '';
    $('tMax').value = t ? t.max.toLocaleString('es-AR') : '';
    $('tipTitulo').textContent = t ? 'Editar ' + t.nombre : 'Nueva categoría';
    $('tCancelar').hidden = !t;
    $('tFormMensaje').hidden = true;
  }

  $('cuerpoTip').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-tip-editar')) {
      formTipo(listaTipos.filter(function (x) { return x.codigo === b.getAttribute('data-tip-editar'); })[0]);
      $('tNombre').focus();
    } else if (b.hasAttribute('data-tip-activo')) {
      store.activarTipo(b.getAttribute('data-tip-activo'), b.getAttribute('data-valor') === '1').then(function () {
        mensaje('tipMensaje', 'ok', 'Categoría actualizada.');
        cargarTipos();
      }, function (err) { mensaje('tipMensaje', 'error', err.mensaje); });
    }
  });
  $('tCancelar').addEventListener('click', function () { formTipo(null); });

  $('formTipo').addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = $('tNombre').value.trim();
    var min = L.parsearPeso($('tMin').value), max = L.parsearPeso($('tMax').value);
    if (nombre.length < 2) return mensaje('tFormMensaje', 'error', 'Ingresá el nombre de la categoría.');
    if (isNaN(min) || isNaN(max) || min <= 0 || max <= min) {
      return mensaje('tFormMensaje', 'error', 'El mínimo tiene que ser mayor a 0 y menor que el máximo.');
    }
    if (max > L.LIMITES.pesoAnimalMaxKg) return mensaje('tFormMensaje', 'error', 'El máximo no puede superar ' + kg(L.LIMITES.pesoAnimalMaxKg) + '.');
    var editandoTipo = !!$('tCodigo').value;
    store.guardarTipo({ codigo: $('tCodigo').value || null, nombre: nombre, min: min, max: max }).then(function () {
      formTipo(null);
      mensaje('tFormMensaje', 'ok', editandoTipo ? 'Categoría actualizada.' : 'Categoría "' + nombre + '" creada. Ya aparece en el panel de carga.');
      cargarTipos();
    }, function (err) { mensaje('tFormMensaje', 'error', err.mensaje); });
  });
})();
