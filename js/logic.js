/*
 * NexoRural — Lógica de negocio (sin DOM)
 * AGO Soluciones
 *
 * Este archivo contiene SOLO las reglas del sistema, para poder probarlas
 * por separado (ver tests/). Funciona en el navegador (window.NexoLogic)
 * y en Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NexoLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Mensajes exactos pedidos por el análisis (sección 8 y 13). */
  var MENSAJES = {
    INVALIDO: 'Ingrese datos válidos',
    EXCEDE: 'Capacidad máxima superada',
    OK: 'Animal registrado correctamente'
  };

  /*
   * Rangos ORIENTATIVOS (sección 6). No son límites rígidos:
   * solo disparan una advertencia para revisar el dato.
   */
  var TIPOS_ANIMAL = {
    vaca: { nombre: 'Vaca', min: 500, max: 800 },
    toro: { nombre: 'Toro', min: 600, max: 1100 },
    oveja: { nombre: 'Oveja', min: 35, max: 180 }
  };

  /**
   * Convierte texto a número aceptando formato argentino.
   *  - "1.100"    -> 1100   (punto como separador de miles)
   *  - "650,5"    -> 650.5  (coma decimal)
   *  - "1.250,75" -> 1250.75
   *  - "650.5"    -> 650.5  (punto decimal si no parece separador de miles)
   * Devuelve NaN si el texto no es un número válido.
   */
  function parsearPeso(valor) {
    if (typeof valor === 'number') return isFinite(valor) ? valor : NaN;
    if (typeof valor !== 'string') return NaN;
    var s = valor.trim().replace(/\s+/g, '').replace(/kg$/i, '');
    if (s === '') return NaN;

    if (s.indexOf(',') !== -1) {
      // Con coma: la coma es decimal, los puntos son miles.
      if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) return NaN;
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      // Solo puntos agrupando de a 3: separador de miles.
      s = s.replace(/\./g, '');
    } else if (!/^-?\d+(\.\d+)?$/.test(s)) {
      return NaN;
    }
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  /** Redondea a 2 decimales para evitar errores de coma flotante (0.1 + 0.2). */
  function redondear(n) {
    return Math.round(n * 100) / 100;
  }

  function sumarPesos(animales) {
    return redondear(animales.reduce(function (acc, a) { return acc + a.peso; }, 0));
  }

  /** RF-01: valida la capacidad máxima configurada. */
  function validarCapacidad(valor, pesoAcumulado) {
    var cap = parsearPeso(valor);
    if (isNaN(cap) || cap <= 0) {
      return { ok: false, mensaje: 'Ingrese una capacidad válida mayor a 0 kg' };
    }
    if (pesoAcumulado && cap < pesoAcumulado) {
      return {
        ok: false,
        mensaje: 'La capacidad no puede ser menor al peso ya cargado (' + formatearKg(pesoAcumulado) + ')'
      };
    }
    return { ok: true, capacidad: redondear(cap) };
  }

  /** Indica si el peso está fuera del rango orientativo de la especie. */
  function fueraDeRango(tipo, peso) {
    var t = TIPOS_ANIMAL[tipo];
    if (!t) return false;
    return peso < t.min || peso > t.max;
  }

  /**
   * RF-04 / RF-05 / RF-06: evalúa si un animal puede registrarse.
   * NO modifica el estado: devuelve el resultado para que la UI decida.
   *
   *   estado = { capacidad: number, animales: [{tipo, peso, ...}] }
   *   datos  = { tipo: string, peso: string|number }
   */
  function evaluarRegistro(estado, datos) {
    var peso = parsearPeso(datos.peso);
    var tipoValido = !!(datos.tipo && TIPOS_ANIMAL[datos.tipo]);

    if (!estado.capacidad || estado.capacidad <= 0) {
      return { ok: false, motivo: 'sin_capacidad', mensaje: 'Configure primero la capacidad máxima del camión' };
    }
    if (!tipoValido || isNaN(peso) || peso <= 0) {
      return { ok: false, motivo: 'invalido', mensaje: MENSAJES.INVALIDO };
    }

    peso = redondear(peso);
    var acumulado = sumarPesos(estado.animales);
    var propuesto = redondear(acumulado + peso);

    if (propuesto > estado.capacidad) {
      return {
        ok: false,
        motivo: 'excede',
        mensaje: MENSAJES.EXCEDE,
        peso: peso,
        acumulado: acumulado,
        propuesto: propuesto,
        exceso: redondear(propuesto - estado.capacidad)
      };
    }

    return {
      ok: true,
      mensaje: MENSAJES.OK,
      peso: peso,
      acumulado: acumulado,
      propuesto: propuesto,
      disponible: redondear(estado.capacidad - propuesto),
      advertenciaRango: fueraDeRango(datos.tipo, peso)
    };
  }

  /** Devuelve un NUEVO estado con el animal agregado (si corresponde). */
  function registrarAnimal(estado, datos, idGenerado) {
    var r = evaluarRegistro(estado, datos);
    if (!r.ok) return { resultado: r, estado: estado };
    var animal = {
      id: idGenerado || String(Date.now()) + Math.random().toString(16).slice(2, 6),
      tipo: datos.tipo,
      peso: r.peso,
      caravana: (datos.caravana || '').trim().toUpperCase(),
      hora: datos.hora || new Date().toISOString()
    };
    return {
      resultado: r,
      estado: { capacidad: estado.capacidad, animales: estado.animales.concat([animal]) }
    };
  }

  /** RF-09: quita un animal y devuelve el nuevo estado. */
  function eliminarAnimal(estado, id) {
    return {
      capacidad: estado.capacidad,
      animales: estado.animales.filter(function (a) { return a.id !== id; })
    };
  }

  /** RF-07: indicadores calculados a partir del estado. */
  function resumen(estado) {
    var cargado = sumarPesos(estado.animales);
    var cap = estado.capacidad || 0;
    var porcentaje = cap > 0 ? Math.min(100, (cargado / cap) * 100) : 0;
    var nivel = 'vacio';
    if (cap > 0 && cargado > 0) nivel = 'ok';
    if (porcentaje >= 85) nivel = 'alto';
    if (cap > 0 && cargado >= cap) nivel = 'lleno';
    return {
      cargado: cargado,
      capacidad: cap,
      disponible: redondear(Math.max(0, cap - cargado)),
      porcentaje: redondear(porcentaje),
      cantidad: estado.animales.length,
      nivel: nivel
    };
  }

  function formatearKg(n) {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n) + ' kg';
  }

  return {
    MENSAJES: MENSAJES,
    TIPOS_ANIMAL: TIPOS_ANIMAL,
    parsearPeso: parsearPeso,
    validarCapacidad: validarCapacidad,
    evaluarRegistro: evaluarRegistro,
    registrarAnimal: registrarAnimal,
    eliminarAnimal: eliminarAnimal,
    fueraDeRango: fueraDeRango,
    resumen: resumen,
    sumarPesos: sumarPesos,
    formatearKg: formatearKg
  };
});
