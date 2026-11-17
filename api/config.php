<?php
/*
 * NexoRural — Configuración de la conexión
 * AGO Soluciones
 *
 * Valores por defecto de XAMPP (usuario root sin contraseña).
 * En un hosting real cambiá estos datos por los que te dé el proveedor.
 */
return [
    'db_host' => getenv('NEXO_DB_HOST') ?: 'localhost',
    'db_name' => getenv('NEXO_DB_NAME') ?: 'nexorural',
    'db_user' => getenv('NEXO_DB_USER') ?: 'root',
    'db_pass' => getenv('NEXO_DB_PASS') !== false ? getenv('NEXO_DB_PASS') : '',

    // Iguales a LIMITES en js/logic.js y a los CHECK de la base.
    'capacidad_max_kg'   => 60000,
    'peso_animal_max_kg' => 2000,

    // "Recordarme": duración de la sesión en días.
    'recordar_dias' => 30,

    // Bloqueo por intentos fallidos de ingreso.
    'intentos_max'      => 5,
    'bloqueo_minutos'   => 5,
];
