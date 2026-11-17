/*
 * Casos de prueba de la sección 12 del análisis + criterios de aceptación (sección 13).
 * Se ejecutan en Node (`node tests/run-node.js`) o en el navegador (tests/index.html).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../js/logic.js'));
  } else {
    root.NexoCasos = factory(root.NexoLogic);
  }
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';

  // Arma un estado con animales que suman el peso acumulado indicado.
  function estadoCon(capacidad, pesos) {
    return {
      capacidad: capacidad,
      animales: pesos.map(function (p, i) { return { id: 'a' + i, tipo: 'vaca', peso: p }; })
    };
  }

  var casos = [
    {
      nombre: 'Capacidad 5.000; acumulado 4.000; nuevo 800 → acepta, total 4.800, quedan 200',
      fn: function () {
        var r = L.registrarAnimal(estadoCon(5000, [800, 800, 800, 800, 800]), { tipo: 'vaca', peso: '800' });
        var s = L.resumen(r.estado);
        return r.resultado.ok && s.cargado === 4800 && s.disponible === 200;
      }
    },
    {
      nombre: 'Capacidad 5.000; acumulado 4.500; nuevo 600 → rechaza con "Capacidad máxima superada", total sigue 4.500',
      fn: function () {
        var inicial = estadoCon(5000, [750, 750, 750, 750, 750, 750]);
        var r = L.registrarAnimal(inicial, { tipo: 'toro', peso: '600' });
        return !r.resultado.ok &&
          r.resultado.mensaje === 'Capacidad máxima superada' &&
          L.resumen(r.estado).cargado === 4500 &&
          r.estado === inicial;
      }
    },
    {
      nombre: 'Capacidad 5.000; acumulado 4.500; nuevo 500 → acepta, total exactamente 5.000',
      fn: function () {
        var r = L.registrarAnimal(estadoCon(5000, [750, 750, 750, 750, 750, 750]), { tipo: 'vaca', peso: '500' });
        var s = L.resumen(r.estado);
        return r.resultado.ok && s.cargado === 5000 && s.disponible === 0 && s.nivel === 'lleno';
      }
    },
    {
      nombre: 'Peso vacío, texto, cero o negativo → rechaza por dato inválido sin alterar lista ni total',
      fn: function () {
        var inicial = estadoCon(5000, [700]);
        return ['', '   ', 'abc', '0', '-50', '12abc', null].every(function (p) {
          var r = L.registrarAnimal(inicial, { tipo: 'vaca', peso: p });
          return !r.resultado.ok && r.resultado.mensaje === 'Ingrese datos válidos' && r.estado === inicial;
        });
      }
    },
    {
      nombre: 'Tipo de animal vacío o inexistente → rechaza',
      fn: function () {
        var inicial = estadoCon(5000, []);
        return !L.registrarAnimal(inicial, { tipo: '', peso: '600' }).resultado.ok &&
          !L.registrarAnimal(inicial, { tipo: 'caballo', peso: '600' }).resultado.ok;
      }
    },
    {
      nombre: 'Eliminar un animal registrado → se recalculan acumulado y disponible',
      fn: function () {
        var e = L.eliminarAnimal(estadoCon(5000, [700, 900, 600]), 'a1');
        var s = L.resumen(e);
        return e.animales.length === 2 && s.cargado === 1300 && s.disponible === 3700;
      }
    },
    {
      nombre: 'Peso fuera del rango orientativo → acepta pero marca advertencia',
      fn: function () {
        var r1 = L.evaluarRegistro(estadoCon(5000, []), { tipo: 'oveja', peso: '400' });
        var r2 = L.evaluarRegistro(estadoCon(5000, []), { tipo: 'oveja', peso: '60' });
        return r1.ok && r1.advertenciaRango === true && r2.ok && r2.advertenciaRango === false;
      }
    },
    {
      nombre: 'Sin capacidad configurada → no permite registrar',
      fn: function () {
        return !L.evaluarRegistro({ capacidad: 0, animales: [] }, { tipo: 'vaca', peso: '600' }).ok;
      }
    },
    {
      nombre: 'Capacidad inválida (vacía, 0, negativa, texto) → rechazada',
      fn: function () {
        return ['', '0', '-100', 'mucho'].every(function (c) { return !L.validarCapacidad(c, 0).ok; });
      }
    },
    {
      nombre: 'No se puede bajar la capacidad por debajo de lo ya cargado',
      fn: function () {
        return !L.validarCapacidad('1000', 1500).ok && L.validarCapacidad('1500', 1500).ok;
      }
    },
    {
      nombre: 'Coma y punto: "1.100" = 1100, "650,5" = 650.5, "1.250,75" = 1250.75, "650.5" = 650.5',
      fn: function () {
        return L.parsearPeso('1.100') === 1100 &&
          L.parsearPeso('650,5') === 650.5 &&
          L.parsearPeso('1.250,75') === 1250.75 &&
          L.parsearPeso('650.5') === 650.5 &&
          L.parsearPeso('15.000') === 15000 &&
          isNaN(L.parsearPeso('1,2,3'));
      }
    },
    {
      nombre: 'Sin errores de coma flotante: 0,1 + 0,2 sobre capacidad 0,3 → acepta',
      fn: function () {
        var r = L.registrarAnimal(estadoCon(0.3, [0.1]), { tipo: 'oveja', peso: '0,2' });
        return r.resultado.ok && L.resumen(r.estado).disponible === 0;
      }
    },
    {
      nombre: 'Peso "0,001" (se redondea a 0) → rechazado como inválido',
      fn: function () {
        var inicial = estadoCon(5000, []);
        var r = L.registrarAnimal(inicial, { tipo: 'oveja', peso: '0,001' });
        return !r.resultado.ok && r.resultado.mensaje === 'Ingrese datos válidos' && r.estado === inicial;
      }
    },
    {
      nombre: 'Redondeo correcto: "650,555" → 650,56 y "1,005" → 1,01',
      fn: function () {
        var a = L.registrarAnimal(estadoCon(5000, []), { tipo: 'vaca', peso: '650,555' });
        var b = L.registrarAnimal(estadoCon(5000, []), { tipo: 'oveja', peso: '1,005' });
        return a.estado.animales[0].peso === 650.56 && b.estado.animales[0].peso === 1.01;
      }
    },
    {
      nombre: 'Topes: capacidad > 60.000 kg y animal > 2.000 kg → rechazados',
      fn: function () {
        return !L.validarCapacidad('60.000,01', 0).ok &&
          L.validarCapacidad('60.000', 0).ok &&
          !L.validarCapacidad('999999999', 0).ok &&
          !L.evaluarRegistro(estadoCon(60000, []), { tipo: 'toro', peso: '2.000,01' }).ok &&
          L.evaluarRegistro(estadoCon(60000, []), { tipo: 'toro', peso: '2.000' }).ok;
      }
    },
    {
      nombre: 'Estado guardado dañado o con tipo desconocido → se normaliza sin errores',
      fn: function () {
        var e = L.normalizarEstado({
          capacidad: '5000',
          animales: [{ id: 'a', tipo: 'caballo', peso: 500 }, { tipo: 'vaca', peso: 'x' }, null, { tipo: 'vaca', peso: -3 }]
        });
        return e.capacidad === 5000 && e.animales.length === 1 &&
          L.nombreTipo('caballo') === 'Caballo' &&
          L.normalizarEstado('basura').animales.length === 0 &&
          L.normalizarEstado(null).capacidad === 0;
      }
    }
  ];

  function ejecutar() {
    return casos.map(function (c) {
      var ok = false, error = null;
      try { ok = c.fn() === true; } catch (e) { error = e.message; }
      return { nombre: c.nombre, ok: ok, error: error };
    });
  }

  return { ejecutar: ejecutar };
});
