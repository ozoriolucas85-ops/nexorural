<?php
/*
 * NexoRural — Configuración propia de un hosting (EJEMPLO)
 *
 * 1. Copiá este archivo como  config.local.php  (en esta misma carpeta api/).
 * 2. Completá los datos que te da el hosting en su panel (sección "MySQL Databases").
 * 3. config.local.php NO se sube a GitHub y no se puede abrir desde el navegador.
 *
 * Solo hace falta poner lo que cambia; el resto se toma de config.php.
 */
return [
    'db_host' => 'sqlXXX.hosting-ejemplo.com',   // "MySQL Host Name"
    'db_name' => 'usuario_nexorural',            // "MySQL DB Name" (suele llevar un prefijo)
    'db_user' => 'usuario',                      // "MySQL User Name"
    'db_pass' => 'la-contraseña-de-mysql',       // "MySQL Password"
];
