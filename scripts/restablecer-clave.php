<?php
/*
 * NexoRural - Restablecer la contraseña de un usuario (uso de emergencia)
 * AGO Soluciones
 *
 * Para cuando el administrador se olvidó su contraseña y no hay otro
 * administrador que pueda asignarle una nueva. Se ejecuta en la PC del
 * servidor con scripts\restablecer-clave.bat (no desde el navegador).
 *
 * Además de cambiar la contraseña, desbloquea y reactiva al usuario.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$CONFIG = require __DIR__ . '/../api/config.php';
if (is_file(__DIR__ . '/../api/config.local.php')) {
    $CONFIG = array_merge($CONFIG, require __DIR__ . '/../api/config.local.php');
}
$usuario = trim((string)getenv('NEXO_USUARIO'));
$clave = (string)getenv('NEXO_CLAVE');

try {
    $pdo = new PDO(
        "mysql:host={$CONFIG['db_host']};dbname={$CONFIG['db_name']};charset=utf8mb4",
        $CONFIG['db_user'], $CONFIG['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    fwrite(STDERR, "No se pudo conectar a MySQL. Esta encendido en XAMPP?\n");
    exit(1);
}

if ($usuario === '') {
    echo "Usuarios registrados:\n";
    foreach ($pdo->query('SELECT usuario, nombre, rol, activo FROM usuarios ORDER BY rol DESC, usuario') as $u) {
        printf("  %-20s %-30s %s%s\n", $u['usuario'], $u['nombre'], $u['rol'], $u['activo'] ? '' : ' (desactivado)');
    }
    exit(0);
}

if (strlen($clave) < 6) {
    fwrite(STDERR, "La contrasena debe tener al menos 6 caracteres.\n");
    exit(1);
}

$st = $pdo->prepare('UPDATE usuarios SET clave_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL, activo = 1 WHERE usuario = ?');
$st->execute([password_hash($clave, PASSWORD_DEFAULT), $usuario]);
$existe = $pdo->prepare('SELECT COUNT(*) FROM usuarios WHERE usuario = ?');
$existe->execute([$usuario]);
if (!(int)$existe->fetchColumn()) {
    fwrite(STDERR, "No existe el usuario \"$usuario\".\n");
    exit(1);
}
echo "Listo: el usuario \"$usuario\" ya puede ingresar con la contrasena nueva.\n";
exit(0);
