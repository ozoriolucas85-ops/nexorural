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
  /*
   * Topes de seguridad para detectar errores de tipeo (un cero de más).
   * Coinciden con los CHECK de la base de datos.
   */
  var LIMITES = {
    capacidadMaxKg: 60000,  // ningún camión jaula supera las 60 t
    pesoAnimalMaxKg: 2000   // ningún animal de las especies cargadas supera 2 t
  };

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

  /**
   * Redondea a 2 decimales sin errores de coma flotante.
   * Se usa notación exponencial porque 650.555 * 100 da 65055.49999…
   */
  function redondear(n) {
    var r = Number(Math.round(Number(n + 'e2')) + 'e-2');
    return r === 0 ? 0 : r; // evita -0
  }

  function sumarPesos(animales) {
    return redondear(animales.reduce(function (acc, a) { return acc + a.peso; }, 0));
  }

  /** RF-01: valida la capacidad máxima configurada. */
  function validarCapacidad(valor, pesoAcumulado) {
    var cap = parsearPeso(valor);
    if (!isNaN(cap)) cap = redondear(cap);
    if (isNaN(cap) || cap <= 0) {
      return { ok: false, mensaje: 'Ingrese una capacidad válida mayor a 0 kg' };
    }
    if (cap > LIMITES.capacidadMaxKg) {
      return {
        ok: false,
        mensaje: 'La capacidad no puede superar ' + formatearKg(LIMITES.capacidadMaxKg) + '. Revisá si sobra un cero.'
      };
    }
    if (pesoAcumulado && cap < pesoAcumulado) {
      return {
        ok: false,
        mensaje: 'La capacidad no puede ser menor al peso ya cargado (' + formatearKg(pesoAcumulado) + ')'
      };
    }
    return { ok: true, capacidad: cap };
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
    // Redondear ANTES de validar: "0,001" queda en 0 y debe rechazarse.
    if (!isNaN(peso)) peso = redondear(peso);
    var tipoValido = !!(datos.tipo && TIPOS_ANIMAL[datos.tipo] && TIPOS_ANIMAL[datos.tipo].activo !== false);

    if (!estado.capacidad || estado.capacidad <= 0) {
      return { ok: false, motivo: 'sin_capacidad', mensaje: 'Configure primero la capacidad máxima del camión' };
    }
    if (!tipoValido || isNaN(peso) || peso <= 0) {
      return {
        ok: false,
        motivo: 'invalido',
        mensaje: MENSAJES.INVALIDO,
        detalle: !isNaN(peso) && peso <= 0 && parsearPeso(datos.peso) > 0
          ? 'El peso mínimo es 0,01 kg.'
          : 'Elegí el tipo de animal e ingresá un peso numérico mayor a 0.'
      };
    }
    if (peso > LIMITES.pesoAnimalMaxKg) {
      return {
        ok: false,
        motivo: 'invalido',
        mensaje: MENSAJES.INVALIDO,
        detalle: 'Ningún animal puede pesar más de ' + formatearKg(LIMITES.pesoAnimalMaxKg) + '. Revisá si sobra un cero.'
      };
    }
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

  /**
   * Reemplaza el catálogo de categorías (viene de la base de datos).
   * lista = [{ codigo, nombre, min, max, activo }]
   * Se modifica el MISMO objeto TIPOS_ANIMAL para que todas las referencias lo vean.
   */
  function configurarTipos(lista) {
    if (!Array.isArray(lista) || !lista.length) return;
    Object.keys(TIPOS_ANIMAL).forEach(function (k) { delete TIPOS_ANIMAL[k]; });
    lista.forEach(function (t) {
      if (!t || !t.codigo) return;
      TIPOS_ANIMAL[t.codigo] = { nombre: t.nombre, min: Number(t.min), max: Number(t.max), activo: t.activo !== false };
    });
  }

  /** Categorías que se pueden elegir al registrar: [{ codigo, nombre, min, max }] */
  function tiposActivos() {
    return Object.keys(TIPOS_ANIMAL).filter(function (k) { return TIPOS_ANIMAL[k].activo !== false; })
      .map(function (k) { var t = TIPOS_ANIMAL[k]; return { codigo: k, nombre: t.nombre, min: t.min, max: t.max }; });
  }

  /** Plural en minúscula: Vaca → vacas, Toro → toros, Ternero → terneros, Buey → bueyes */
  function plural(nombre) {
    var n = String(nombre || '').toLowerCase();
    if (!n) return n;
    if (/[aeiouáéó]$/.test(n)) return n + 's';
    if (/z$/.test(n)) return n.slice(0, -1) + 'ces';
    return n + 'es';
  }

  /** Nombre visible de un tipo; si no está en el catálogo, muestra el código. */
  function nombreTipo(tipo) {
    if (TIPOS_ANIMAL[tipo]) return TIPOS_ANIMAL[tipo].nombre;
    var t = String(tipo || 'Desconocido');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /**
   * Limpia un estado leído del almacenamiento (puede venir de una versión vieja
   * o estar dañado). Descarta registros sin peso válido y nunca lanza errores.
   */
  function normalizarEstado(e) {
    var vacio = { capacidad: 0, patente: '', animales: [] };
    if (!e || typeof e !== 'object' || !Array.isArray(e.animales)) return vacio;
    var cap = Number(e.capacidad);
    var animales = e.animales.filter(function (a) {
      return a && typeof a === 'object' && typeof a.peso === 'number' && isFinite(a.peso) && a.peso > 0;
    }).map(function (a, i) {
      return {
        id: a.id ? String(a.id) : 'r' + i + '-' + Date.now(),
        tipo: String(a.tipo || ''),
        peso: redondear(a.peso),
        caravana: typeof a.caravana === 'string' ? a.caravana : '',
        hora: a.hora || new Date().toISOString(),
        eliminado: !!a.eliminado
      };
    });
    return {
      capacidad: isFinite(cap) && cap > 0 ? redondear(cap) : 0,
      patente: typeof e.patente === 'string' ? e.patente : '',
      animales: animales
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
    LIMITES: LIMITES,
    nombreTipo: nombreTipo,
    configurarTipos: configurarTipos,
    tiposActivos: tiposActivos,
    plural: plural,
    normalizarEstado: normalizarEstado,
    redondear: redondear,
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
