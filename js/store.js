/*
 * NexoRural — Capa de datos
 * AGO Soluciones
 *
 * Dos modos con la MISMA interfaz:
 *   - Servidor: PHP + MySQL (cuando la página se abre desde http://localhost/nexorural)
 *   - Local:    se guarda en el navegador (cuando se abre con doble clic o no hay PHP)
 *
 * Todas las funciones devuelven Promesas. Los errores llegan como objetos
 * { mensaje, motivo, detalle?, carga? } para mostrarlos tal cual.
 */
(function (root) {
  'use strict';

  var L = root.NexoLogic;
  var K = {
    operador: 'nexorural.operador',
    carga: 'nexorural.carga',
    historial: 'nexorural.historial'
  };

  function error(mensaje, motivo, extra) {
    var e = { mensaje: mensaje, motivo: motivo || 'error' };
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  }

  /* =====================================================
     MODO SERVIDOR
     ===================================================== */
  function crearServidor(base, estadoInicial) {
    function pedir(archivo, accion, datos, metodo) {
      var url = base + archivo + '?accion=' + encodeURIComponent(accion);
      var op = { credentials: 'same-origin', headers: { 'X-Requested-With': 'NexoRural' } };
      if (metodo === 'GET') {
        if (datos) {
          Object.keys(datos).forEach(function (k) {
            if (datos[k] !== '' && datos[k] != null) url += '&' + k + '=' + encodeURIComponent(datos[k]);
          });
        }
      } else {
        op.method = 'POST';
        op.headers['Content-Type'] = 'application/json';
        op.body = JSON.stringify(datos || {});
      }
      return fetch(url, op).then(function (r) {
        return r.json().catch(function () { return { ok: false, mensaje: 'Respuesta inválida del servidor', motivo: 'interno' }; });
      }, function () {
        throw error('No se pudo conectar con el servidor. Revisá que XAMPP esté encendido.', 'red');
      }).then(function (j) {
        if (!j.ok) {
          if (j.motivo === 'sin_sesion' && !/index\.html$|\/$/.test(location.pathname)) location.replace('index.html');
          throw error(j.mensaje, j.motivo, j);
        }
        return j;
      });
    }
    var get = function (a, ac, d) { return pedir(a, ac, d, 'GET'); };
    var post = function (a, ac, d) { return pedir(a, ac, d, 'POST'); };
    var carga = function (j) { return j.carga; };

    return {
      modo: 'servidor',
      instalado: estadoInicial.instalado,
      limites: estadoInicial.limites,
      sesion: function () { return Promise.resolve(estadoInicial.usuario); },
      instalar: function (d) { return post('auth.php', 'instalar', d).then(function (j) { return j.usuario; }); },
      login: function (usuario, clave, recordar) {
        return post('auth.php', 'login', { usuario: usuario, clave: clave, recordar: recordar }).then(function (j) { return j.usuario; });
      },
      logout: function () { return post('auth.php', 'logout'); },

      cargaActual: function () { return get('carga.php', 'actual').then(carga); },
      iniciar: function (cap, patente) { return post('carga.php', 'iniciar', { capacidad: cap, patente: patente }).then(carga); },
      actualizar: function (cap, patente) { return post('carga.php', 'capacidad', { capacidad: cap, patente: patente }).then(carga); },
      registrar: function (d) { return post('carga.php', 'registrar', d).then(function (j) { return { carga: j.carga, id: j.id }; }); },
      eliminar: function (id) { return post('carga.php', 'eliminar', { id: id }).then(carga); },
      restaurar: function (id) { return post('carga.php', 'restaurar', { id: id }).then(carga); },
      rechazo: function (d) { return post('carga.php', 'rechazo', d).catch(function () {}); },
      cerrar: function (obs) { return post('carga.php', 'cerrar', { observaciones: obs }).then(function (j) { return j.finalizada; }); },
      cancelar: function () { return post('carga.php', 'cancelar').then(function (j) { return j.finalizada; }); },

      historial: function (filtros) { return get('historial.php', 'listar', filtros).then(function (j) { return j.cargas; }); },
      detalle: function (id) { return get('historial.php', 'detalle', { id: id }).then(carga); },

      usuarios: function () { return get('usuarios.php', 'listar'); },
      crearUsuario: function (d) { return post('usuarios.php', 'crear', d); },
      activarUsuario: function (id, activo) { return post('usuarios.php', 'activo', { id: id, activo: activo }); },
      cambiarClave: function (id, clave) { return post('usuarios.php', 'clave', { id: id, clave: clave }); },
      direccionesRed: function () { return get('usuarios.php', 'red').then(function (j) { return j.urls; }); }
    };
  }

  /* =====================================================
     MODO LOCAL (navegador)
     ===================================================== */
  function crearLocal() {
    function leer(clave, def) {
      try { var v = JSON.parse(localStorage.getItem(clave)); return v == null ? def : v; } catch (e) { return def; }
    }
    function guardar(clave, v) { localStorage.setItem(clave, JSON.stringify(v)); }
    function operador() { return localStorage.getItem(K.operador) || sessionStorage.getItem(K.operador); }

    // Carga guardada: animales con bandera "eliminado" para poder deshacer.
    function leerCarga() {
      var c = leer(K.carga, null);
      if (!c || !c.capacidad) return null;
      var n = L.normalizarEstado(c);
      if (!n.capacidad) return null;
      n.id = c.id || 'L' + Date.now();
      n.iniciadaEn = c.iniciadaEn || new Date().toISOString();
      n.rechazos = c.rechazos || 0;
      n.animales.forEach(function (a) { a.fueraDeRango = L.fueraDeRango(a.tipo, a.peso); });
      return n;
    }
    function publica(c) {
      if (!c) return null;
      return {
        id: c.id, estado: c.estado || 'abierta', patente: c.patente || '', capacidad: c.capacidad,
        iniciadaEn: c.iniciadaEn, cerradaEn: c.cerradaEn || null, operador: c.operador || operador(),
        observaciones: c.observaciones || '', rechazos: c.rechazos || 0,
        animales: c.animales.filter(function (a) { return !a.eliminado; })
      };
    }
    function exigir() {
      var c = leerCarga();
      if (!c) throw error('No hay una carga abierta. Configurá el camión primero.', 'sin_carga');
      return c;
    }
    function ok(v) { return Promise.resolve(v); }
    function intentar(fn) {
      try { return ok(fn()); } catch (e) { return Promise.reject(e.mensaje ? e : error(String(e), 'interno')); }
    }
    function finalizar(estado, obs) {
      var c = exigir();
      var p = publica(c);
      p.estado = estado;
      p.cerradaEn = new Date().toISOString();
      p.observaciones = obs || '';
      var h = leer(K.historial, []);
      h.unshift(p);
      guardar(K.historial, h.slice(0, 500));
      localStorage.removeItem(K.carga);
      return p;
    }
    function resumenHist(c) {
      var s = L.resumen(c);
      return {
        id: c.id, estado: c.estado, patente: c.patente, operador: c.operador, capacidad: s.capacidad,
        cargado: s.cargado, disponible: s.disponible, porcentaje: s.porcentaje, cantidad: s.cantidad,
        iniciadaEn: c.iniciadaEn, cerradaEn: c.cerradaEn
      };
    }
    var soloServidor = function () { return Promise.reject(error('Disponible solo con servidor (XAMPP).', 'solo_servidor')); };

    return {
      modo: 'local',
      instalado: true,
      limites: { capacidadMaxKg: L.LIMITES.capacidadMaxKg, pesoAnimalMaxKg: L.LIMITES.pesoAnimalMaxKg },
      sesion: function () {
        var n = operador();
        return ok(n ? { nombre: n, usuario: n, rol: 'capataz' } : null);
      },
      login: function (usuario, clave, recordar) {
        if (!usuario || !clave) return Promise.reject(error('Completá usuario y contraseña.', 'invalido'));
        (recordar ? localStorage : sessionStorage).setItem(K.operador, usuario);
        return ok({ nombre: usuario, usuario: usuario, rol: 'capataz' });
      },
      logout: function () {
        localStorage.removeItem(K.operador);
        sessionStorage.removeItem(K.operador);
        return ok(true);
      },

      cargaActual: function () { return ok(publica(leerCarga())); },
      iniciar: function (cap, patente) {
        return intentar(function () {
          if (leerCarga()) throw error('Ya tenés una carga abierta. Cerrala o cancelala primero.', 'ya_abierta');
          var c = { id: 'L' + Date.now(), capacidad: cap, patente: patente || '', iniciadaEn: new Date().toISOString(), animales: [] };
          guardar(K.carga, c);
          return publica(c);
        });
      },
      actualizar: function (cap, patente) {
        return intentar(function () {
          var c = exigir();
          var v = L.validarCapacidad(cap, L.sumarPesos(publica(c).animales));
          if (!v.ok) throw error(v.mensaje, 'capacidad_menor');
          c.capacidad = v.capacidad;
          c.patente = patente || '';
          guardar(K.carga, c);
          return publica(c);
        });
      },
      registrar: function (d) {
        return intentar(function () {
          var c = exigir();
          var r = L.registrarAnimal(publica(c), d);
          if (!r.resultado.ok) throw error(r.resultado.mensaje, r.resultado.motivo, r.resultado);
          var nuevo = r.estado.animales[r.estado.animales.length - 1];
          nuevo.fueraDeRango = !!r.resultado.advertenciaRango;
          c.animales.push(nuevo);
          guardar(K.carga, c);
          return { carga: publica(c), id: nuevo.id };
        });
      },
      eliminar: function (id) { return this._marcar(id, true); },
      restaurar: function (id) { return this._marcar(id, false); },
      _marcar: function (id, eliminar) {
        return intentar(function () {
          var c = exigir();
          var a = c.animales.filter(function (x) { return x.id === id && x.eliminado !== eliminar; })[0];
          if (!a) throw error('No se encontró ese registro en la carga actual.', 'no_encontrado');
          if (!eliminar && L.redondear(L.sumarPesos(publica(c).animales) + a.peso) > c.capacidad) {
            throw error(L.MENSAJES.EXCEDE, 'excede');
          }
          a.eliminado = eliminar;
          guardar(K.carga, c);
          return publica(c);
        });
      },
      rechazo: function () {
        var c = leer(K.carga, null);
        if (c) { c.rechazos = (c.rechazos || 0) + 1; guardar(K.carga, c); }
        return ok(true);
      },
      cerrar: function (obs) {
        return intentar(function () {
          var c = exigir();
          if (!publica(c).animales.length) throw error('No se puede cerrar una carga vacía. Usá "Cancelar carga".', 'vacia');
          return finalizar('cerrada', obs);
        });
      },
      cancelar: function () { return intentar(function () { return finalizar('cancelada'); }); },

      historial: function (f) {
        f = f || {};
        var lista = leer(K.historial, []).filter(function (c) { return c && Array.isArray(c.animales); });
        var abierta = publica(leerCarga());
        if (abierta) lista.unshift(abierta);
        return ok(lista.filter(function (c) {
          if (f.estado && c.estado !== f.estado) return false;
          var dia = (c.iniciadaEn || '').slice(0, 10);
          if (f.desde && dia < f.desde) return false;
          if (f.hasta && dia > f.hasta) return false;
          return true;
        }).map(resumenHist));
      },
      detalle: function (id) {
        var abierta = publica(leerCarga());
        if (abierta && abierta.id === id) return ok(abierta);
        var c = leer(K.historial, []).filter(function (x) { return x && x.id === id; })[0];
        return c ? ok(c) : Promise.reject(error('Carga no encontrada', 'no_encontrado'));
      },

      usuarios: soloServidor,
      crearUsuario: soloServidor,
      activarUsuario: soloServidor,
      cambiarClave: soloServidor
    };
  }

  /* =====================================================
     Detección del modo
     ===================================================== */
  var conexion = null;
  function conectar() {
    if (conexion) return conexion;
    var base = 'api/';
    if (location.protocol === 'file:') {
      conexion = Promise.resolve(crearLocal());
      return conexion;
    }
    conexion = fetch(base + 'auth.php?accion=estado', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.modo === 'servidor' && j.ok) return crearServidor(base, j);
        // PHP responde pero la base no está lista: avisar en vez de pasar a local en silencio.
        if (j && (j.motivo === 'sin_base' || j.motivo === 'sin_conexion')) {
          var s = crearServidor(base, { instalado: false, usuario: null, limites: null });
          s.errorBase = j.mensaje;
          return s;
        }
        return crearLocal();
      })
      .catch(function () { return crearLocal(); }); // sin PHP (ej: GitHub Pages) → modo local
    return conexion;
  }

  root.NexoStore = { conectar: conectar };
})(typeof self !== 'undefined' ? self : this);
