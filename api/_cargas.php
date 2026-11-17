<?php
/*
 * NexoRural — Funciones compartidas sobre cargas (usadas por carga.php e historial.php)
 */

function cargaAbiertaId(int $usuarioId): ?int
{
    $st = db()->prepare('SELECT id FROM cargas WHERE usuario_id = ? AND estado = "abierta" ORDER BY id DESC LIMIT 1');
    $st->execute([$usuarioId]);
    $id = $st->fetchColumn();
    return $id ? (int)$id : null;
}

function exigirCargaAbierta(int $usuarioId): int
{
    $id = cargaAbiertaId($usuarioId);
    if (!$id) fallar('No hay una carga abierta. Configurá el camión primero.', 409, 'sin_carga', ['carga' => null]);
    return $id;
}

function acumulado(int $cargaId): float
{
    $st = db()->prepare('SELECT COALESCE(SUM(peso_kg), 0) FROM animales_carga WHERE carga_id = ? AND eliminado = 0');
    $st->execute([$cargaId]);
    return (float)$st->fetchColumn();
}

function registrarRechazo(int $cargaId, ?int $tipoId, string $peso, string $motivo): void
{
    db()->prepare('INSERT INTO intentos_rechazados (carga_id, tipo_animal_id, peso_ingresado, motivo, peso_acumulado_kg)
                   VALUES (?, ?, ?, ?, ?)')
        ->execute([$cargaId, $tipoId, mb_substr($peso, 0, 30), $motivo, acumulado($cargaId)]);
}

/** Carga completa con el mismo formato que usa el navegador. */
function cargaComoJson(?int $id): ?array
{
    if (!$id) return null;
    $st = db()->prepare(
        'SELECT c.id, c.estado, c.patente, c.capacidad_maxima_kg, c.observaciones,
                DATE_FORMAT(c.iniciada_en, "%Y-%m-%dT%H:%i:%s") AS iniciada_en,
                DATE_FORMAT(c.cerrada_en,  "%Y-%m-%dT%H:%i:%s") AS cerrada_en,
                u.nombre AS operador,
                (SELECT COUNT(*) FROM intentos_rechazados r WHERE r.carga_id = c.id) AS rechazos
           FROM cargas c JOIN usuarios u ON u.id = c.usuario_id
          WHERE c.id = ?');
    $st->execute([$id]);
    $c = $st->fetch();
    if (!$c) return null;

    $a = db()->prepare(
        'SELECT a.id, t.codigo AS tipo, a.peso_kg, a.caravana, a.fuera_de_rango,
                DATE_FORMAT(a.registrado_en, "%Y-%m-%dT%H:%i:%s") AS hora
           FROM animales_carga a JOIN tipos_animal t ON t.id = a.tipo_animal_id
          WHERE a.carga_id = ? AND a.eliminado = 0
          ORDER BY a.registrado_en, a.id');
    $a->execute([$id]);

    return [
        'id'            => (string)$c['id'],
        'estado'        => $c['estado'],
        'patente'       => $c['patente'] ?? '',
        'capacidad'     => (float)$c['capacidad_maxima_kg'],
        'observaciones' => $c['observaciones'] ?? '',
        'iniciadaEn'    => $c['iniciada_en'],
        'cerradaEn'     => $c['cerrada_en'],
        'operador'      => $c['operador'],
        'rechazos'      => (int)$c['rechazos'],
        'animales'      => array_map(fn($r) => [
            'id'           => (string)$r['id'],
            'tipo'         => $r['tipo'],
            'peso'         => (float)$r['peso_kg'],
            'caravana'     => $r['caravana'] ?? '',
            'fueraDeRango' => (bool)$r['fuera_de_rango'],
            'hora'         => $r['hora'],
        ], $a->fetchAll()),
    ];
}
