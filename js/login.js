/* NexoRural — Pantalla de ingreso. AGO Soluciones
 *
 * - Servidor sin usuarios  → formulario para crear el primer administrador.
 * - Servidor con usuarios  → ingreso real (usuario y contraseña de la base).
 * - Sin servidor           → modo local: se guarda solo el nombre en el navegador.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var form = $('loginForm');
  var error = $('loginError');
  var store = null;
  var instalando = false;
  var enviando = false;

  $('verClave').addEventListener('click', function () {
    var oculto = $('clave').type === 'password';
    $('clave').type = oculto ? 'text' : 'password';
    $('clave2').type = $('clave').type;
    this.setAttribute('aria-label', oculto ? 'Ocultar contraseña' : 'Mostrar contraseña');
    this.classList.toggle('is-on', oculto);
  });

  function mostrarError(msg, foco) {
    error.textContent = msg;
    error.hidden = false;
    if (foco) foco.focus();
  }

  window.NexoStore.conectar().then(function (s) {
    store = s;
    if (s.errorBase) {
      $('loginModo').textContent = 'Servidor sin base de datos';
      $('loginInfo').textContent = s.errorBase;
      $('loginInfo').hidden = false;
      $('btnIngresar').disabled = true;
      return;
    }
    return s.sesion().then(function (u) {
      if (u) { location.replace('panel.html'); return; }
      if (s.modo === 'local') {
        $('loginModo').textContent = 'Modo local: los datos quedan en este navegador.';
      } else if (!s.instalado) {
        instalando = true;
        $('loginTitulo').textContent = 'Primer ingreso';
        $('loginSub').textContent = 'Creá la cuenta del administrador. Después vas a poder sumar a los capataces.';
        $('campoNombre').hidden = false;
        $('campoClave2').hidden = false;
        $('campoRecordar').hidden = true;
        $('usuario').placeholder = 'Usuario para ingresar (ej: admin)';
        $('clave').placeholder = 'Contraseña (mínimo 6 caracteres)';
        $('clave').autocomplete = 'new-password';
        $('btnIngresar').textContent = 'Crear administrador';
        $('loginModo').textContent = 'Conectado a la base de datos';
        $('nombre').focus();
      } else {
        $('loginModo').textContent = 'Conectado a la base de datos';
      }
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!store || enviando) return;
    var usuario = $('usuario').value.trim();
    var clave = $('clave').value;

    if (instalando) {
      var nombre = $('nombre').value.trim();
      if (nombre.length < 2) return mostrarError('Ingresá tu nombre y apellido.', $('nombre'));
      if (!/^[A-Za-z0-9._-]{3,40}$/.test(usuario)) {
        return mostrarError('Usuario: de 3 a 40 letras o números, sin espacios.', $('usuario'));
      }
      if (clave.length < 6) return mostrarError('La contraseña debe tener al menos 6 caracteres.', $('clave'));
      if (clave !== $('clave2').value) return mostrarError('Las contraseñas no coinciden.', $('clave2'));
      return enviar(store.instalar({ nombre: nombre, usuario: usuario, clave: clave }));
    }

    if (!usuario || !clave) return mostrarError('Completá usuario y contraseña.', usuario ? $('clave') : $('usuario'));
    enviar(store.login(usuario, clave, $('recordar').checked));
  });

  function enviar(promesa) {
    enviando = true;
    $('btnIngresar').disabled = true;
    promesa.then(function () {
      location.href = 'panel.html';
    }, function (err) {
      enviando = false;
      $('btnIngresar').disabled = false;
      mostrarError(err.mensaje || 'No se pudo ingresar.', $('clave'));
      $('clave').select();
    });
  }

  ['nombre', 'usuario', 'clave', 'clave2'].forEach(function (id) {
    $(id).addEventListener('input', function () { error.hidden = true; });
  });
})();
