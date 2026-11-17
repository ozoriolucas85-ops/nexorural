/* NexoRural — Pantalla de ingreso (versión 1, sin servidor). AGO Soluciones */
(function () {
  'use strict';

  var CLAVE_SESION = 'nexorural.operador';

  // Si ya hay sesión, ir directo al panel.
  if (localStorage.getItem(CLAVE_SESION) || sessionStorage.getItem(CLAVE_SESION)) {
    location.replace('panel.html');
    return;
  }

  var form = document.getElementById('loginForm');
  var usuario = document.getElementById('usuario');
  var clave = document.getElementById('clave');
  var error = document.getElementById('loginError');
  var verClave = document.getElementById('verClave');

  verClave.addEventListener('click', function () {
    var oculto = clave.type === 'password';
    clave.type = oculto ? 'text' : 'password';
    verClave.setAttribute('aria-label', oculto ? 'Ocultar contraseña' : 'Mostrar contraseña');
    verClave.classList.toggle('is-on', oculto);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = usuario.value.trim();
    if (!nombre || !clave.value) {
      error.textContent = 'Completá usuario y contraseña.';
      error.hidden = false;
      (nombre ? clave : usuario).focus();
      return;
    }
    // En la versión 1 no hay base de datos: se guarda solo el nombre del operador
    // para mostrarlo en el panel. La contraseña NO se almacena.
    var almacen = document.getElementById('recordar').checked ? localStorage : sessionStorage;
    almacen.setItem(CLAVE_SESION, nombre);
    location.href = 'panel.html';
  });

  [usuario, clave].forEach(function (el) {
    el.addEventListener('input', function () { error.hidden = true; });
  });
})();
