<?php
/*
 * NexoRural — Ingreso de usuarios
 *
 *  GET  auth.php?accion=estado     ¿hay servidor? ¿está instalado? ¿quién soy?
 *  POST auth.php?accion=instalar   crea el PRIMER administrador (solo si no hay usuarios)
 *  POST auth.php?accion=login      { usuario, clave, recordar }
 *  POST auth.php?accion=logout
 *  POST auth.php?accion=mi_clave   { actual, nueva }   cambiar la propia contraseña
 */
require __DIR__ . '/_base.php';

switch (accion()) {

    case 'estado':
        $hay = (int)db()->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
        responder([
            'ok'        => true,
            'modo'      => 'servidor',
            'instalado' => $hay > 0,
            'usuario'   => $hay ? usuarioActual() : null,
            'limites'   => [
                'capacidadMaxKg'  => $CONFIG['capacidad_max_kg'],
                'pesoAnimalMaxKg' => $CONFIG['peso_animal_max_kg'],
            ],
        ]);

    case 'instalar':
        $d = entrada();
        $pdo = db();
        $pdo->beginTransaction();
        // Bloquea la tabla para que nadie más instale al mismo tiempo.
        $hay = (int)$pdo->query('SELECT COUNT(*) FROM usuarios FOR UPDATE')->fetchColumn();
        if ($hay > 0) {
            $pdo->rollBack();
            fallar('El sistema ya tiene usuarios. Ingresá con tu cuenta.', 409, 'ya_instalado');
        }
        [$nombre, $usuario, $clave] = validarDatosUsuario($d);
        $st = $pdo->prepare('INSERT INTO usuarios (nombre, usuario, clave_hash, rol) VALUES (?, ?, ?, "administrador")');
        $st->execute([$nombre, $usuario, password_hash($clave, PASSWORD_DEFAULT)]);
        $id = (int)$pdo->lastInsertId();

        // Catálogo de especies, si todavía no se cargó datos_iniciales.sql.
        if ((int)$pdo->query('SELECT COUNT(*) FROM tipos_animal')->fetchColumn() === 0) {
            $ins = $pdo->prepare('INSERT INTO tipos_animal (codigo, nombre, peso_min_ref_kg, peso_max_ref_kg) VALUES (?, ?, ?, ?)');
            foreach (NEXO_TIPOS_INICIALES as $t) $ins->execute($t);
        }
        $pdo->commit();
        iniciarSesion($id, false);
        responder(['ok' => true, 'usuario' => usuarioActual()]);

    case 'login':
        $d = entrada();
        $usuario = trim((string)($d['usuario'] ?? ''));
        $clave = (string)($d['clave'] ?? '');
        if ($usuario === '' || $clave === '') fallar('Completá usuario y contraseña.');

        $pdo = db();
        $st = $pdo->prepare('SELECT id, clave_hash, activo, intentos_fallidos, bloqueado_hasta,
                                    bloqueado_hasta > NOW() AS bloqueado
                               FROM usuarios WHERE usuario = ?');
        $st->execute([$usuario]);
        $u = $st->fetch();

        if ($u && (int)$u['bloqueado']) {
            fallar('Demasiados intentos fallidos. Esperá unos minutos y probá de nuevo.', 429, 'bloqueado');
        }
        // Si el usuario no existe, igual se verifica contra un hash falso para no revelar cuáles existen.
        $hash = $u['clave_hash'] ?? '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';
        $valida = password_verify($clave, $hash);

        if (!$u || !$valida) {
            if ($u) {
                $intentos = (int)$u['intentos_fallidos'] + 1;
                if ($intentos >= $CONFIG['intentos_max']) {
                    $pdo->prepare('UPDATE usuarios SET intentos_fallidos = 0,
                                   bloqueado_hasta = NOW() + INTERVAL ? MINUTE WHERE id = ?')
                        ->execute([$CONFIG['bloqueo_minutos'], $u['id']]);
                } else {
                    $pdo->prepare('UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?')->execute([$intentos, $u['id']]);
                }
            }
            fallar('Usuario o contraseña incorrectos.', 401, 'credenciales');
        }
        if (!(int)$u['activo']) fallar('Tu usuario está desactivado. Hablá con el administrador.', 403, 'inactivo');

        if (password_needs_rehash($u['clave_hash'], PASSWORD_DEFAULT)) {
            $pdo->prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?')
                ->execute([password_hash($clave, PASSWORD_DEFAULT), $u['id']]);
        }
        $pdo->prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_ingreso = NOW() WHERE id = ?')
            ->execute([$u['id']]);

        iniciarSesion((int)$u['id'], !empty($d['recordar']));
        responder(['ok' => true, 'usuario' => usuarioActual()]);

    case 'logout':
        entrada();
        $_SESSION = [];
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 3600, 'path' => $p['path'],
            'httponly' => true, 'samesite' => 'Strict', 'secure' => $p['secure'],
        ]);
        session_destroy();
        responder(['ok' => true]);

    case 'mi_clave':
        $d = entrada();
        $yo = exigirSesion();
        $actual = (string)($d['actual'] ?? '');
        $nueva = (string)($d['nueva'] ?? '');
        $st = db()->prepare('SELECT clave_hash FROM usuarios WHERE id = ?');
        $st->execute([$yo['id']]);
        if (!password_verify($actual, (string)$st->fetchColumn())) fallar('La contraseña actual no es correcta.', 403, 'credenciales');
        if (strlen($nueva) < 6) fallar('La contraseña nueva debe tener al menos 6 caracteres.');
        if ($nueva === $actual) fallar('La contraseña nueva tiene que ser distinta de la actual.');
        db()->prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?')->execute([password_hash($nueva, PASSWORD_DEFAULT), $yo['id']]);
        session_regenerate_id(true);
        responder(['ok' => true]);

    default:
        fallar('Acción desconocida', 404, 'accion');
}

function iniciarSesion(int $id, bool $recordar): void
{
    global $CONFIG;
    session_regenerate_id(true);   // evita fijación de sesión
    $_SESSION['uid'] = $id;
    if ($recordar) {
        $dur = $CONFIG['recordar_dias'] * 86400;
        $p = session_get_cookie_params();
        setcookie(session_name(), session_id(), [
            'expires' => time() + $dur, 'path' => $p['path'],
            'httponly' => true, 'samesite' => 'Strict', 'secure' => $p['secure'],
        ]);
    }
}
