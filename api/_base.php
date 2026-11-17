<?php
/*
 * NexoRural — Base común de la API (conexión, sesión, respuestas JSON)
 * AGO Soluciones
 *
 * Todas las respuestas son JSON:
 *   éxito  → { "ok": true,  ... }
 *   error  → { "ok": false, "mensaje": "...", "motivo": "..." }
 */
declare(strict_types=1);

const NEXO_TIPOS_INICIALES = [
    ['vaca',  'Vaca',  500, 800],
    ['toro',  'Toro',  600, 1100],
    ['oveja', 'Oveja', 35,  180],
];

$CONFIG = require __DIR__ . '/config.php';
// En un hosting, los datos propios van en config.local.php (no se sube a GitHub).
if (is_file(__DIR__ . '/config.local.php')) {
    $CONFIG = array_merge($CONFIG, require __DIR__ . '/config.local.php');
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// Ningún error de PHP debe mostrarse como HTML: siempre JSON.
ini_set('display_errors', '0');
set_exception_handler(function (Throwable $e) {
    error_log('[NexoRural] ' . $e);
    responder(['ok' => false, 'mensaje' => 'Error interno del servidor', 'motivo' => 'interno'], 500);
});

/* ---------------- Sesión ---------------- */
// Los datos de sesión duran lo mismo que "Recordarme" (la cookie decide si se usa).
ini_set('session.gc_maxlifetime', (string)($CONFIG['recordar_dias'] * 86400));
session_name('NEXORURAL');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Strict',
    'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
]);
session_start();

/* ---------------- Respuestas ---------------- */
function responder(array $datos, int $codigo = 200): void
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function fallar(string $mensaje, int $codigo = 400, string $motivo = 'invalido', array $extra = []): void
{
    responder(['ok' => false, 'mensaje' => $mensaje, 'motivo' => $motivo] + $extra, $codigo);
}

/** Lee el cuerpo JSON de un POST. Exige el encabezado propio (protección CSRF). */
function entrada(): array
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fallar('Método no permitido', 405, 'metodo');
    }
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'NexoRural') {
        fallar('Solicitud no válida', 403, 'csrf');
    }
    $datos = json_decode(file_get_contents('php://input') ?: '{}', true);
    return is_array($datos) ? $datos : [];
}

function accion(): string
{
    return (string)($_GET['accion'] ?? '');
}

/* ---------------- Base de datos ---------------- */
function db(): PDO
{
    static $pdo = null;
    global $CONFIG;
    if ($pdo) return $pdo;
    try {
        $pdo = new PDO(
            "mysql:host={$CONFIG['db_host']};dbname={$CONFIG['db_name']};charset=utf8mb4",
            $CONFIG['db_user'],
            $CONFIG['db_pass'],
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
    } catch (PDOException $e) {
        if ((int)$e->getCode() === 1049) {
            fallar('La base de datos "' . $CONFIG['db_name'] . '" no existe. Importá database/nexorural_estructura.sql en phpMyAdmin.', 503, 'sin_base');
        }
        fallar('No se pudo conectar a MySQL. ¿Está encendido en XAMPP?', 503, 'sin_conexion');
    }
    // Modo estricto: si un valor no entra en la columna, error (no recorte silencioso).
    $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'");
    return $pdo;
}

/** Mensaje de un SIGNAL '45000' lanzado por los triggers (ej: "Capacidad máxima superada"). */
function mensajeTrigger(PDOException $e): ?string
{
    if ($e->getCode() === '45000' && isset($e->errorInfo[2])) return (string)$e->errorInfo[2];
    return null;
}

/* ---------------- Usuarios / permisos ---------------- */
function usuarioActual(): ?array
{
    if (empty($_SESSION['uid'])) return null;
    $st = db()->prepare('SELECT id, nombre, usuario, rol FROM usuarios WHERE id = ? AND activo = 1');
    $st->execute([$_SESSION['uid']]);
    $u = $st->fetch();
    if (!$u) {
        $_SESSION = [];
        return null;
    }
    $u['id'] = (int)$u['id'];
    return $u;
}

function exigirSesion(): array
{
    $u = usuarioActual();
    if (!$u) fallar('Tu sesión expiró. Volvé a ingresar.', 401, 'sin_sesion');
    return $u;
}

function exigirAdmin(): array
{
    $u = exigirSesion();
    if ($u['rol'] !== 'administrador') fallar('Solo un administrador puede hacer esto.', 403, 'sin_permiso');
    return $u;
}

/* ---------------- Validaciones ---------------- */
function redondear(float $n): float
{
    return round($n, 2);
}

/** Convierte a número; acepta número JSON o texto. Devuelve null si no es válido. */
function numero($v): ?float
{
    if (is_int($v) || is_float($v)) return is_finite((float)$v) ? (float)$v : null;
    if (is_string($v) && is_numeric(trim($v))) return (float)trim($v);
    return null;
}

function validarCapacidad($valor): float
{
    global $CONFIG;
    $cap = numero($valor);
    if ($cap === null || redondear($cap) <= 0) fallar('Ingrese una capacidad válida mayor a 0 kg');
    $cap = redondear($cap);
    if ($cap > $CONFIG['capacidad_max_kg']) {
        fallar('La capacidad no puede superar ' . number_format($CONFIG['capacidad_max_kg'], 0, ',', '.') . ' kg.');
    }
    return $cap;
}

function limpiarPatente($v): ?string
{
    $p = strtoupper(preg_replace('/\s+/', '', (string)($v ?? '')));
    if ($p === '') return null;
    if (!preg_match('/^[A-Z0-9-]{5,10}$/', $p)) fallar('La patente solo puede tener letras y números (5 a 10).');
    return $p;
}

function textoCorto($v, int $max): ?string
{
    $t = trim((string)($v ?? ''));
    if ($t === '') return null;
    return mb_substr($t, 0, $max);
}

/** Valida nombre, usuario y clave. Usado al instalar y al crear usuarios. */
function validarDatosUsuario(array $d): array
{
    $nombre = trim((string)($d['nombre'] ?? ''));
    $usuario = trim((string)($d['usuario'] ?? ''));
    $clave = (string)($d['clave'] ?? '');
    if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 80) fallar('Ingresá el nombre y apellido.');
    if (!preg_match('/^[A-Za-z0-9._-]{3,40}$/', $usuario)) {
        fallar('El usuario debe tener de 3 a 40 caracteres: letras, números, punto, guion o guion bajo.');
    }
    if (strlen($clave) < 6) fallar('La contraseña debe tener al menos 6 caracteres.');
    return [$nombre, $usuario, $clave];
}
