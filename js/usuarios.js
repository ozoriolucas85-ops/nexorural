/* NexoRural — Gestión de usuarios (solo administradores). AGO Soluciones */
(function () {
  'use strict';

  var UI = window.NexoUI;
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
    cargar();
  });

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
      $('usrResumen').textContent = j.usuarios.length + ' cuentas · ' + activos + ' activas';
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
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(d.usuario)) return mensaje('formMensaje', 'error', 'Usuario: de 3 a 40 letras o números, sin espacios.');
    if (d.clave.length < 6) return mensaje('formMensaje', 'error', 'La contraseña debe tener al menos 6 caracteres.');
    store.crearUsuario(d).then(function () {
      mensaje('formMensaje', 'ok', 'Usuario "' + d.usuario + '" creado.');
      $('formUsuario').reset();
      cargar();
    }, function (err) { mensaje('formMensaje', 'error', err.mensaje); });
  });
})();
