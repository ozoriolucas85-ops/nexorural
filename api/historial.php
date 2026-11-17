<?php
/*
 * NexoRural — Historial de cargas
 *
 *  GET historial.php?accion=listar[&estado=cerrada|cancelada|abierta][&desde=AAAA-MM-DD][&hasta=AAAA-MM-DD]
 *  GET historial.php?accion=detalle&id=N
 */
require __DIR__ . '/_base.php';
require __DIR__ . '/_cargas.php';

exigirSesion();

switch (accion()) {

    case 'listar':
        $where = [];
        $params = [];
        $estado = $_GET['estado'] ?? '';
        if (in_array($estado, ['abierta', 'cerrada', 'cancelada'], true)) {
            $where[] = 'estado = ?';
            $params[] = $estado;
        }
        foreach (['desde' => '>=', 'hasta' => '<'] as $campo => $op) {
            $f = $_GET[$campo] ?? '';
            if ($f !== '') {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $f)) fallar('Fecha inválida');
                $where[] = 'iniciada_en ' . $op . ' ' . ($campo === 'hasta' ? '(? + INTERVAL 1 DAY)' : '?');
                $params[] = $f;
            }
        }
        $sql = 'SELECT carga_id, estado, patente, operador, capacidad_maxima_kg, peso_cargado_kg,
                       disponible_kg, porcentaje_uso, cantidad_animales,
                       DATE_FORMAT(iniciada_en, "%Y-%m-%dT%H:%i:%s") AS iniciada_en,
                       DATE_FORMAT(cerrada_en,  "%Y-%m-%dT%H:%i:%s") AS cerrada_en
                  FROM v_resumen_cargas'
            . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
            . ' ORDER BY iniciada_en DESC, carga_id DESC LIMIT 500';
        $st = db()->prepare($sql);
        $st->execute($params);
        responder(['ok' => true, 'cargas' => array_map(fn($r) => [
            'id'         => (string)$r['carga_id'],
            'estado'     => $r['estado'],
            'patente'    => $r['patente'] ?? '',
            'operador'   => $r['operador'],
            'capacidad'  => (float)$r['capacidad_maxima_kg'],
            'cargado'    => (float)$r['peso_cargado_kg'],
            'disponible' => (float)$r['disponible_kg'],
            'porcentaje' => (float)$r['porcentaje_uso'],
            'cantidad'   => (int)$r['cantidad_animales'],
            'iniciadaEn' => $r['iniciada_en'],
            'cerradaEn'  => $r['cerrada_en'],
        ], $st->fetchAll())]);

    case 'detalle':
        $c = cargaComoJson((int)($_GET['id'] ?? 0));
        if (!$c) fallar('Carga no encontrada', 404, 'no_encontrado');
        responder(['ok' => true, 'carga' => $c]);

    default:
        fallar('Acción desconocida', 404, 'accion');
}
