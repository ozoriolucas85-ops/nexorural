<?php
/*
 * NexoRural — Carga en curso del usuario
 *
 *  GET  carga.php?accion=actual
 *  POST carga.php?accion=iniciar     { capacidad, patente }
 *  POST carga.php?accion=capacidad   { capacidad, patente }
 *  POST carga.php?accion=registrar   { tipo, peso, caravana, fueraDeRango }
 *  POST carga.php?accion=eliminar    { id }
 *  POST carga.php?accion=restaurar   { id }
 *  POST carga.php?accion=rechazo     { tipo, peso, motivo }   (auditoría)
 *  POST carga.php?accion=cerrar      { observaciones }
 *  POST carga.php?accion=cancelar
 *
 * Todas devuelven { ok, carga } con el estado actualizado (carga = null si no hay una abierta).
 */
require __DIR__ . '/_base.php';
require __DIR__ . '/_cargas.php';

$yo = exigirSesion();
$pdo = db();

switch (accion()) {

    case 'actual':
        responder(['ok' => true, 'carga' => cargaComoJson(cargaAbiertaId($yo['id']))]);

    case 'iniciar':
        $d = entrada();
        $cap = validarCapacidad($d['capacidad'] ?? null);
        $patente = limpiarPatente($d['patente'] ?? null);
        if (cargaAbiertaId($yo['id'])) fallar('Ya tenés una carga abierta. Cerrala o cancelala primero.', 409, 'ya_abierta');
        $pdo->prepare('INSERT INTO cargas (usuario_id, patente, capacidad_maxima_kg) VALUES (?, ?, ?)')
            ->execute([$yo['id'], $patente, $cap]);
        responder(['ok' => true, 'carga' => cargaComoJson((int)$pdo->lastInsertId())]);

    case 'capacidad':
        $d = entrada();
        $id = exigirCargaAbierta($yo['id']);
        $cap = validarCapacidad($d['capacidad'] ?? null);
        $patente = limpiarPatente($d['patente'] ?? null);
        try {
            $pdo->prepare('UPDATE cargas SET capacidad_maxima_kg = ?, patente = ? WHERE id = ?')->execute([$cap, $patente, $id]);
        } catch (PDOException $e) {
            if ($m = mensajeTrigger($e)) fallar($m, 409, 'capacidad_menor');
            throw $e;
        }
        responder(['ok' => true, 'carga' => cargaComoJson($id)]);

    case 'registrar':
        $d = entrada();
        $id = exigirCargaAbierta($yo['id']);

        $tipo = (string)($d['tipo'] ?? '');
        $peso = numero($d['peso'] ?? null);
        $peso = $peso === null ? null : redondear($peso);
        $st = $pdo->prepare('SELECT id, peso_min_ref_kg, peso_max_ref_kg FROM tipos_animal WHERE codigo = ? AND activo = 1');
        $st->execute([$tipo]);
        $t = $st->fetch();

        if (!$t || $peso === null || $peso <= 0) {
            registrarRechazo($id, $t ? (int)$t['id'] : null, (string)($d['peso'] ?? ''), 'dato_invalido');
            fallar('Ingrese datos válidos', 422, 'invalido');
        }
        if ($peso > $CONFIG['peso_animal_max_kg']) {
            registrarRechazo($id, (int)$t['id'], (string)$peso, 'dato_invalido');
            fallar('Ingrese datos válidos', 422, 'invalido', [
                'detalle' => 'Ningún animal puede pesar más de ' . number_format($CONFIG['peso_animal_max_kg'], 0, ',', '.') . ' kg.',
            ]);
        }
        $fuera = $peso < (float)$t['peso_min_ref_kg'] || $peso > (float)$t['peso_max_ref_kg'];
        if ($fuera && empty($d['fueraDeRango'])) {
            fallar('El peso está fuera del rango orientativo: confirmá el dato.', 422, 'confirmar_rango');
        }
        $caravana = textoCorto(isset($d['caravana']) ? strtoupper((string)$d['caravana']) : null, 20);

        // Transacción + bloqueo de la fila de la carga: si dos celulares registran a la vez,
        // el segundo espera y ve el total actualizado. Nunca se pasa la capacidad.
        $pdo->beginTransaction();
        $c = $pdo->prepare('SELECT capacidad_maxima_kg FROM cargas WHERE id = ? FOR UPDATE');
        $c->execute([$id]);
        $cap = (float)$c->fetchColumn();
        $acum = acumulado($id);
        $propuesto = redondear($acum + $peso);

        if ($propuesto > $cap) {
            $pdo->rollBack();
            registrarRechazo($id, (int)$t['id'], (string)$peso, 'capacidad_superada');
            fallar('Capacidad máxima superada', 409, 'excede', [
                'propuesto' => $propuesto,
                'exceso'    => redondear($propuesto - $cap),
                'carga'     => cargaComoJson($id),
            ]);
        }
        try {
            $pdo->prepare('INSERT INTO animales_carga (carga_id, tipo_animal_id, caravana, peso_kg, fuera_de_rango)
                           VALUES (?, ?, ?, ?, ?)')
                ->execute([$id, $t['id'], $caravana, $peso, $fuera ? 1 : 0]);
            $nuevo = (int)$pdo->lastInsertId();
            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();
            if ($m = mensajeTrigger($e)) fallar($m, 409, 'excede', ['carga' => cargaComoJson($id)]);
            throw $e;
        }
        responder(['ok' => true, 'id' => (string)$nuevo, 'carga' => cargaComoJson($id)]);

    case 'eliminar':
    case 'restaurar':
        $d = entrada();
        $id = exigirCargaAbierta($yo['id']);
        $animal = (int)($d['id'] ?? 0);
        $eliminar = accion() === 'eliminar';
        try {
            $st = $pdo->prepare('UPDATE animales_carga SET eliminado = ? WHERE id = ? AND carga_id = ? AND eliminado = ?');
            $st->execute([$eliminar ? 1 : 0, $animal, $id, $eliminar ? 0 : 1]);
        } catch (PDOException $e) {
            if ($m = mensajeTrigger($e)) fallar($m, 409, 'excede', ['carga' => cargaComoJson($id)]);
            throw $e;
        }
        if ($st->rowCount() === 0) fallar('No se encontró ese registro en la carga actual.', 404, 'no_encontrado');
        responder(['ok' => true, 'carga' => cargaComoJson($id)]);

    case 'rechazo':
        // El navegador ya rechazó el animal; acá solo queda constancia para auditoría.
        $d = entrada();
        $id = cargaAbiertaId($yo['id']);
        if ($id) {
            $motivo = ($d['motivo'] ?? '') === 'excede' ? 'capacidad_superada' : 'dato_invalido';
            $st = $pdo->prepare('SELECT id FROM tipos_animal WHERE codigo = ?');
            $st->execute([(string)($d['tipo'] ?? '')]);
            registrarRechazo($id, ($t = $st->fetchColumn()) ? (int)$t : null, mb_substr((string)($d['peso'] ?? ''), 0, 30), $motivo);
        }
        responder(['ok' => true]);

    case 'cerrar':
    case 'cancelar':
        $d = entrada();
        $id = exigirCargaAbierta($yo['id']);
        $cerrar = accion() === 'cerrar';
        if ($cerrar && acumulado($id) <= 0) fallar('No se puede cerrar una carga vacía. Usá "Cancelar carga".', 409, 'vacia');
        $resumen = cargaComoJson($id);
        $pdo->prepare('UPDATE cargas SET estado = ?, observaciones = COALESCE(?, observaciones) WHERE id = ?')
            ->execute([$cerrar ? 'cerrada' : 'cancelada', textoCorto($d['observaciones'] ?? null, 255), $id]);
        responder(['ok' => true, 'carga' => null, 'finalizada' => cargaComoJson($id) ?: $resumen]);

    default:
        fallar('Acción desconocida', 404, 'accion');
}
