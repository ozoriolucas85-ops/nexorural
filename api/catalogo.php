<?php
/*
 * NexoRural — Catálogos: categorías de animales y camiones guardados
 *
 *  Cualquier usuario con sesión:
 *    GET  catalogo.php?accion=tipos       todas las categorías (incluye inactivas, para mostrar el historial)
 *    GET  catalogo.php?accion=camiones    camiones activos
 *
 *  Solo administradores:
 *    GET  catalogo.php?accion=camiones_todos
 *    POST catalogo.php?accion=tipo_guardar     { codigo?, nombre, min, max }   (sin codigo = nueva)
 *    POST catalogo.php?accion=tipo_activo      { codigo, activo }
 *    POST catalogo.php?accion=camion_guardar   { id?, patente, descripcion, capacidad }
 *    POST catalogo.php?accion=camion_activo    { id, activo }
 */
require __DIR__ . '/_base.php';

$yo = exigirSesion();
$pdo = db();

switch (accion()) {

    case 'tipos':
        // Si la base no tiene categorías (no se importó datos_iniciales.sql), cargar las del análisis.
        if ((int)$pdo->query('SELECT COUNT(*) FROM tipos_animal')->fetchColumn() === 0) {
            $ins = $pdo->prepare('INSERT INTO tipos_animal (codigo, nombre, peso_min_ref_kg, peso_max_ref_kg) VALUES (?, ?, ?, ?)');
            foreach (NEXO_TIPOS_INICIALES as $t) $ins->execute($t);
        }
        $filas = $pdo->query('SELECT codigo, nombre, peso_min_ref_kg, peso_max_ref_kg, activo FROM tipos_animal ORDER BY id')->fetchAll();
        responder(['ok' => true, 'tipos' => array_map(fn($t) => [
            'codigo' => $t['codigo'],
            'nombre' => $t['nombre'],
            'min'    => (float)$t['peso_min_ref_kg'],
            'max'    => (float)$t['peso_max_ref_kg'],
            'activo' => (bool)$t['activo'],
        ], $filas)]);

    case 'camiones':
    case 'camiones_todos':
        $todos = accion() === 'camiones_todos';
        if ($todos) exigirAdmin();
        $filas = $pdo->query('SELECT id, patente, descripcion, capacidad_maxima_kg, activo FROM camiones'
            . ($todos ? '' : ' WHERE activo = 1') . ' ORDER BY activo DESC, patente')->fetchAll();
        responder(['ok' => true, 'camiones' => array_map(fn($c) => [
            'id'          => (string)$c['id'],
            'patente'     => $c['patente'],
            'descripcion' => $c['descripcion'] ?? '',
            'capacidad'   => (float)$c['capacidad_maxima_kg'],
            'activo'      => (bool)$c['activo'],
        ], $filas)]);

    case 'tipo_guardar':
        exigirAdmin();
        $d = entrada();
        $nombre = trim((string)($d['nombre'] ?? ''));
        $min = numero($d['min'] ?? null);
        $max = numero($d['max'] ?? null);
        if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 40) fallar('Ingresá el nombre de la categoría (2 a 40 letras).');
        if ($min === null || $max === null || $min <= 0 || $max <= $min) {
            fallar('El rango orientativo no es válido: el mínimo tiene que ser mayor a 0 y menor que el máximo.');
        }
        if ($max > $CONFIG['peso_animal_max_kg']) {
            fallar('El máximo no puede superar ' . number_format($CONFIG['peso_animal_max_kg'], 0, ',', '.') . ' kg.');
        }
        $codigo = trim((string)($d['codigo'] ?? ''));
        try {
            if ($codigo !== '') {
                $st = $pdo->prepare('UPDATE tipos_animal SET nombre = ?, peso_min_ref_kg = ?, peso_max_ref_kg = ? WHERE codigo = ?');
                $st->execute([$nombre, redondear($min), redondear($max), $codigo]);
                if ($st->rowCount() === 0 && !existeTipo($codigo)) fallar('Categoría no encontrada', 404, 'no_encontrado');
            } else {
                $codigo = codigoLibre($nombre);
                $pdo->prepare('INSERT INTO tipos_animal (codigo, nombre, peso_min_ref_kg, peso_max_ref_kg) VALUES (?, ?, ?, ?)')
                    ->execute([$codigo, $nombre, redondear($min), redondear($max)]);
            }
        } catch (PDOException $e) {
            if ((int)($e->errorInfo[1] ?? 0) === 4025) fallar('El rango orientativo no es válido.');
            throw $e;
        }
        responder(['ok' => true, 'codigo' => $codigo]);

    case 'tipo_activo':
        exigirAdmin();
        $d = entrada();
        $activo = !empty($d['activo']);
        if (!$activo) {
            $quedan = (int)$pdo->query('SELECT COUNT(*) FROM tipos_animal WHERE activo = 1')->fetchColumn();
            if ($quedan <= 1) fallar('Tiene que quedar al menos una categoría activa.', 409, 'ultima');
        }
        $st = $pdo->prepare('UPDATE tipos_animal SET activo = ? WHERE codigo = ?');
        $st->execute([$activo ? 1 : 0, (string)($d['codigo'] ?? '')]);
        responder(['ok' => true]);

    case 'camion_guardar':
        exigirAdmin();
        $d = entrada();
        $patente = limpiarPatente($d['patente'] ?? null);
        if (!$patente) fallar('Ingresá la patente del camión.');
        $cap = validarCapacidad($d['capacidad'] ?? null);
        $desc = textoCorto($d['descripcion'] ?? null, 100);
        $id = (int)($d['id'] ?? 0);
        try {
            if ($id) {
                $st = $pdo->prepare('UPDATE camiones SET patente = ?, descripcion = ?, capacidad_maxima_kg = ? WHERE id = ?');
                $st->execute([$patente, $desc, $cap, $id]);
            } else {
                $pdo->prepare('INSERT INTO camiones (patente, descripcion, capacidad_maxima_kg) VALUES (?, ?, ?)')
                    ->execute([$patente, $desc, $cap]);
            }
        } catch (PDOException $e) {
            if ((int)($e->errorInfo[1] ?? 0) === 1062) fallar('Ya hay un camión con esa patente.', 409, 'duplicado');
            throw $e;
        }
        responder(['ok' => true]);

    case 'camion_activo':
        exigirAdmin();
        $d = entrada();
        $pdo->prepare('UPDATE camiones SET activo = ? WHERE id = ?')->execute([!empty($d['activo']) ? 1 : 0, (int)($d['id'] ?? 0)]);
        responder(['ok' => true]);

    default:
        fallar('Acción desconocida', 404, 'accion');
}

function existeTipo(string $codigo): bool
{
    $st = db()->prepare('SELECT 1 FROM tipos_animal WHERE codigo = ?');
    $st->execute([$codigo]);
    return (bool)$st->fetchColumn();
}

/** Código interno a partir del nombre: "Vaquillona de 2 años" → "vaquillona-de-2-anos" (único). */
function codigoLibre(string $nombre): string
{
    $base = strtolower(strtr($nombre, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
        'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u', 'Ü' => 'u', 'Ñ' => 'n']));
    $base = trim(preg_replace('/[^a-z0-9]+/', '-', $base), '-');
    $base = substr($base !== '' ? $base : 'categoria', 0, 17);
    $codigo = $base;
    for ($i = 2; existeTipo($codigo); $i++) $codigo = $base . '-' . $i;
    return $codigo;
}
