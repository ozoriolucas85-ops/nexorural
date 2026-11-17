<?php
/*
 * NexoRural — Gestión de usuarios (solo administradores)
 *
 *  GET  usuarios.php?accion=listar
 *  POST usuarios.php?accion=crear    { nombre, usuario, clave, rol }
 *  POST usuarios.php?accion=activo   { id, activo }
 *  POST usuarios.php?accion=clave    { id, clave }
 */
require __DIR__ . '/_base.php';

$yo = exigirAdmin();
$pdo = db();

switch (accion()) {

    case 'listar':
        $filas = $pdo->query(
            'SELECT id, nombre, usuario, rol, activo,
                    DATE_FORMAT(ultimo_ingreso, "%Y-%m-%dT%H:%i:%s") AS ultimo_ingreso,
                    DATE_FORMAT(creado_en, "%Y-%m-%dT%H:%i:%s") AS creado_en
               FROM usuarios ORDER BY activo DESC, nombre')->fetchAll();
        responder(['ok' => true, 'yo' => (string)$yo['id'], 'usuarios' => array_map(fn($u) => [
            'id'            => (string)$u['id'],
            'nombre'        => $u['nombre'],
            'usuario'       => $u['usuario'],
            'rol'           => $u['rol'],
            'activo'        => (bool)$u['activo'],
            'ultimoIngreso' => $u['ultimo_ingreso'],
            'creadoEn'      => $u['creado_en'],
        ], $filas)]);

    case 'crear':
        $d = entrada();
        [$nombre, $usuario, $clave] = validarDatosUsuario($d);
        $rol = ($d['rol'] ?? '') === 'administrador' ? 'administrador' : 'capataz';
        try {
            $pdo->prepare('INSERT INTO usuarios (nombre, usuario, clave_hash, rol) VALUES (?, ?, ?, ?)')
                ->execute([$nombre, $usuario, password_hash($clave, PASSWORD_DEFAULT), $rol]);
        } catch (PDOException $e) {
            if ((int)($e->errorInfo[1] ?? 0) === 1062) fallar('Ya existe un usuario con ese nombre de ingreso.', 409, 'duplicado');
            throw $e;
        }
        responder(['ok' => true]);

    case 'activo':
        $d = entrada();
        $id = (int)($d['id'] ?? 0);
        if ($id === $yo['id']) fallar('No podés desactivar tu propio usuario.', 409, 'propio');
        $pdo->prepare('UPDATE usuarios SET activo = ? WHERE id = ?')->execute([!empty($d['activo']) ? 1 : 0, $id]);
        responder(['ok' => true]);

    case 'clave':
        $d = entrada();
        $clave = (string)($d['clave'] ?? '');
        if (strlen($clave) < 6) fallar('La contraseña debe tener al menos 6 caracteres.');
        $st = $pdo->prepare('UPDATE usuarios SET clave_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?');
        $st->execute([password_hash($clave, PASSWORD_DEFAULT), (int)($d['id'] ?? 0)]);
        if ($st->rowCount() === 0) fallar('Usuario no encontrado', 404, 'no_encontrado');
        responder(['ok' => true]);

    case 'red':
        // Direcciones para entrar desde celulares conectados al mismo wifi.
        $ips = array_values(array_filter(gethostbynamel(gethostname()) ?: [], function ($ip) {
            return (bool)preg_match('/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/', $ip);
        }));
        $puerto = (int)($_SERVER['SERVER_PORT'] ?? 80);
        $esquema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $ruta = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/nexorural/api/x.php'))), '/') . '/';
        $porDefecto = ($esquema === 'http' && $puerto === 80) || ($esquema === 'https' && $puerto === 443);
        responder(['ok' => true, 'urls' => array_map(function ($ip) use ($esquema, $puerto, $ruta, $porDefecto) {
            return $esquema . '://' . $ip . ($porDefecto ? '' : ':' . $puerto) . $ruta;
        }, $ips)]);

    default:
        fallar('Acción desconocida', 404, 'accion');
}
