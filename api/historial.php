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

/*
 * Mismo cálculo que la vista v_resumen_cargas, escrito acá para no depender de ella:
 * algunos hostings gratuitos (InfinityFree) no permiten crear vistas.
 */
const RESUMEN_CARGAS_SQL = '
    SELECT c.id AS carga_id, c.estado,
           COALESCE(c.patente, cm.patente) AS patente,
           u.nombre AS operador,
           c.capacidad_maxima_kg,
           COALESCE(SUM(a.peso_kg), 0) AS peso_cargado_kg,
           c.capacidad_maxima_kg - COALESCE(SUM(a.peso_kg), 0) AS disponible_kg,
           ROUND(COALESCE(SUM(a.peso_kg), 0) * 100 / c.capacidad_maxima_kg, 2) AS porcentaje_uso,
           COUNT(a.id) AS cantidad_animales,
           c.iniciada_en, c.cerrada_en
      FROM cargas c
      JOIN usuarios u ON u.id = c.usuario_id
      LEFT JOIN camiones cm ON cm.id = c.camion_id
      LEFT JOIN animales_carga a ON a.carga_id = c.id AND a.eliminado = 0
     GROUP BY c.id, c.estado, c.patente, cm.patente, u.nombre,
              c.capacidad_maxima_kg, c.iniciada_en, c.cerrada_en';

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
                  FROM (' . RESUMEN_CARGAS_SQL . ') AS v_resumen_cargas'
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
