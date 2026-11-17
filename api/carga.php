<?php
/*
 * NexoRural — Carga en curso del usuario
 *
 *  GET  carga.php?accion=actual
 *  POST carga.php?accion=iniciar     { capacidad, patente, camionId? }
 *  POST carga.php?accion=capacidad   { capacidad, patente }
 *  POST carga.php?accion=registrar   { tipo, peso, caravana, fueraDeRango }
 *  POST carga.php?accion=editar      { id, tipo, peso, caravana, fueraDeRango }
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
        $camionId = null;
        if (!empty($d['camionId'])) {
            $st = $pdo->prepare('SELECT id, patente FROM camiones WHERE id = ? AND activo = 1');
            $st->execute([(int)$d['camionId']]);
            $cm = $st->fetch();
            if (!$cm) fallar('Ese camión ya no está disponible.', 409, 'camion');
            $camionId = (int)$cm['id'];
            $patente = $cm['patente'];
        }
        $pdo->prepare('INSERT INTO cargas (usuario_id, camion_id, patente, capacidad_maxima_kg) VALUES (?, ?, ?, ?)')
            ->execute([$yo['id'], $camionId, $patente, $cap]);
        responder(['ok' => true, 'carga' => cargaComoJson((int)$pdo->lastInsertId())]);

    case 'capacidad':
        $d = entrada();
        $id = exigirCargaAbierta($yo['id']);
        $cap = validarCapacidad($d['capacidad'] ?? null);
        $patente = limpiarPatente($d['patente'] ?? null);
        // Se controla acá y también en la base (trigger), por si el hosting no permite triggers.
        $pdo->beginTransaction();
        $pdo->prepare('SELECT id FROM cargas WHERE id = ? FOR UPDATE')->execute([$id]);
        if ($cap < acumulado($id)) {
            $pdo->rollBack();
            fallar('La capacidad no puede ser menor al peso ya cargado', 409, 'capacidad_menor');
        }
        try {
            $pdo->prepare('UPDATE cargas SET capacidad_maxima_kg = ?, patente = ? WHERE id = ?')->execute([$cap, $patente, $id]);
            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();
            if ($m = mensajeTrigger($e)) fallar($m, 409, 'capacidad_menor');
            throw $e;
        }
        responder(['ok' => true, 'carga' => cargaComoJson($id)]);

    case 'registrar':
        $d = entrada();
        $id = exigirCargaAbierta($yo['id']);

        [$t, $peso, $fuera, $caravana] = validarAnimal($d, $id);

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

    case 'editar':
        // Corregir tipo, peso o caravana de un animal ya registrado.
        $d = entrada();
        $id = exigirCargaAbierta($yo['id']);
        $animal = (int)($d['id'] ?? 0);
        [$t, $peso, $fuera, $caravana] = validarAnimal($d, null);

        $pdo->beginTransaction();
        $c = $pdo->prepare('SELECT capacidad_maxima_kg FROM cargas WHERE id = ? FOR UPDATE');
        $c->execute([$id]);
        $cap = (float)$c->fetchColumn();
        $a = $pdo->prepare('SELECT peso_kg FROM animales_carga WHERE id = ? AND carga_id = ? AND eliminado = 0');
        $a->execute([$animal, $id]);
        $anterior = $a->fetchColumn();
        if ($anterior === false) {
            $pdo->rollBack();
            fallar('No se encontró ese registro en la carga actual.', 404, 'no_encontrado');
        }
        $propuesto = redondear(acumulado($id) - (float)$anterior + $peso);
        if ($propuesto > $cap) {
            $pdo->rollBack();
            fallar('Capacidad máxima superada', 409, 'excede', [
                'propuesto' => $propuesto,
                'exceso'    => redondear($propuesto - $cap),
                'carga'     => cargaComoJson($id),
            ]);
        }
        try {
            $pdo->prepare('UPDATE animales_carga SET tipo_animal_id = ?, peso_kg = ?, caravana = ?, fuera_de_rango = ?
                           WHERE id = ? AND carga_id = ?')
                ->execute([$t['id'], $peso, $caravana, $fuera ? 1 : 0, $animal, $id]);
            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();
            if ($m = mensajeTrigger($e)) fallar($m, 409, 'excede', ['carga' => cargaComoJson($id)]);
            throw $e;
        }
        responder(['ok' => true, 'carga' => cargaComoJson($id)]);

    case 'eliminar':
    case 'restaurar':
        $d = entrada();
        $id = exigirCargaAbierta($yo['id']);
        $animal = (int)($d['id'] ?? 0);
        $eliminar = accion() === 'eliminar';
        $pdo->beginTransaction();
        $c = $pdo->prepare('SELECT capacidad_maxima_kg FROM cargas WHERE id = ? FOR UPDATE');
        $c->execute([$id]);
        $cap = (float)$c->fetchColumn();
        $a = $pdo->prepare('SELECT peso_kg FROM animales_carga WHERE id = ? AND carga_id = ? AND eliminado = ?');
        $a->execute([$animal, $id, $eliminar ? 0 : 1]);
        $peso = $a->fetchColumn();
        if ($peso === false) {
            $pdo->rollBack();
            fallar('No se encontró ese registro en la carga actual.', 404, 'no_encontrado');
        }
        // Restaurar = volver a subir el animal: también tiene que entrar en el camión.
        if (!$eliminar && redondear(acumulado($id) + (float)$peso) > $cap) {
            $pdo->rollBack();
            fallar('Capacidad máxima superada', 409, 'excede', ['carga' => cargaComoJson($id)]);
        }
        try {
            $pdo->prepare('UPDATE animales_carga SET eliminado = ?, eliminado_en = ' . ($eliminar ? 'NOW()' : 'NULL') .
                          ' WHERE id = ? AND carga_id = ?')
                ->execute([$eliminar ? 1 : 0, $animal, $id]);
            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();
            if ($m = mensajeTrigger($e)) fallar($m, 409, 'excede', ['carga' => cargaComoJson($id)]);
            throw $e;
        }
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
        $pdo->prepare('UPDATE cargas SET estado = ?, cerrada_en = NOW(), observaciones = COALESCE(?, observaciones) WHERE id = ?')
            ->execute([$cerrar ? 'cerrada' : 'cancelada', textoCorto($d['observaciones'] ?? null, 255), $id]);
        responder(['ok' => true, 'carga' => null, 'finalizada' => cargaComoJson($id) ?: $resumen]);

    default:
        fallar('Acción desconocida', 404, 'accion');
}
