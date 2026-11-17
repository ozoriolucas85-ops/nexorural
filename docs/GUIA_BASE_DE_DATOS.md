# Guía de base de datos · NexoRural

Para quien se encarga de la base de datos. **AGO Soluciones**

Archivos:

- `database/nexorural_estructura.sql`: **solo la estructura** (tablas, relaciones, vista y triggers).
- `database/datos_iniciales.sql`: *opcional*, carga vaca/toro/oveja con sus rangos.

Probado en **MariaDB 10.4 (XAMPP)**. También sirve en MySQL 8.0.16 o posterior.

---

## 1. Importar en phpMyAdmin

1. Abrí XAMPP y encendé **Apache** y **MySQL**.
2. Entrá a `http://localhost/phpmyadmin`.
3. Andá a la pestaña **Importar** (sin seleccionar ninguna base).
4. Elegí `nexorural_estructura.sql` → **Continuar**.
   El script crea la base `nexorural` sola.
5. (Opcional) Repetí con `datos_iniciales.sql`.

> **Si usás un hosting** que no deja crear bases: borrá las líneas `CREATE DATABASE …` y `USE nexorural;` del principio, creá la base desde el panel del hosting, seleccionala y recién ahí importá.

> ⚠️ El script **borra y vuelve a crear** las tablas si ya existían. No lo importes sobre una base con datos reales.

## 2. Diagrama de relaciones

```
usuarios 1───N cargas N───1 camiones (opcional)
                 │
                 ├──1───N animales_carga N───1 tipos_animal
                 │
                 └──1───N intentos_rechazados N───1 tipos_animal
```

## 3. Tablas

### `usuarios`
Capataz o encargado que hace la carga.

| Campo | Tipo | Notas |
|---|---|---|
| id | INT PK AI | |
| nombre | VARCHAR(80) | Nombre y apellido |
| usuario | VARCHAR(40) **único** | Para ingresar |
| clave_hash | VARCHAR(255) | Siempre `password_hash()` de PHP. **Nunca la clave en texto plano.** |
| rol | ENUM capataz / administrador | |
| activo | TINYINT(1) | 1 = puede ingresar |
| creado_en | DATETIME | Automático |

### `camiones`
Flota. Es opcional en la versión 1 (la app permite escribir solo la patente).

| Campo | Tipo | Notas |
|---|---|---|
| id | INT PK AI | |
| patente | VARCHAR(10) **única** | Mayúsculas, sin espacios |
| descripcion | VARCHAR(100) | Marca, modelo, jaula |
| capacidad_maxima_kg | DECIMAL(9,2) | > 0 y ≤ 60.000 |
| activo | TINYINT(1) | |

### `tipos_animal`
Catálogo de especies (RF-02). Los rangos son **orientativos**: solo generan advertencia, nunca bloquean.

| Campo | Tipo | Notas |
|---|---|---|
| id | SMALLINT PK AI | |
| codigo | VARCHAR(20) **único** | `vaca`, `toro`, `oveja` (igual que en la app) |
| nombre | VARCHAR(40) | |
| peso_min_ref_kg / peso_max_ref_kg | DECIMAL(7,2) | min > 0 y max > min |

Para agregar otra categoría (ternero, novillo, etc.) alcanza con insertar una fila nueva acá.

### `cargas`
Cada viaje o sesión de carga de **un** camión (RF-01).

| Campo | Tipo | Notas |
|---|---|---|
| id | INT PK AI | |
| usuario_id | FK → usuarios | Quién cargó |
| camion_id | FK → camiones, NULL | Si se eligió un camión registrado |
| patente | VARCHAR(10) NULL | Copia de lo que se escribió |
| capacidad_maxima_kg | DECIMAL(9,2) | > 0 y ≤ 60.000. **Copia** de la capacidad de esta carga. Si después se edita el camión, el historial no cambia. |
| estado | ENUM abierta / cerrada / cancelada | Solo se cargan animales si está `abierta` |
| iniciada_en / cerrada_en | DATETIME | `cerrada_en` se completa solo al cerrar |

### `animales_carga`
Animales **aceptados** (RF-03, RF-08).

| Campo | Tipo | Notas |
|---|---|---|
| id | INT PK AI | |
| carga_id | FK → cargas | Si se borra la carga, se borran sus animales |
| tipo_animal_id | FK → tipos_animal | |
| caravana | VARCHAR(20) NULL | |
| peso_kg | DECIMAL(7,2) | > 0 y ≤ 2.000 (tope contra errores de tipeo) |
| fuera_de_rango | TINYINT(1) | 1 si el usuario confirmó un peso fuera del rango orientativo |
| registrado_en | DATETIME | Automático |
| eliminado | TINYINT(1) | **Baja lógica** (RF-09): no se borra la fila, se marca 1 |
| eliminado_en | DATETIME NULL | Se completa solo |

> Para eliminar desde PHP: `UPDATE animales_carga SET eliminado = 1 WHERE id = ?` (no `DELETE`). Así queda historial.

### `intentos_rechazados` (auditoría, opcional)
Guarda los intentos bloqueados por dato inválido o capacidad superada. Un rechazo **nunca** escribe en `animales_carga`.

## 4. Vista `v_resumen_cargas`

Devuelve los indicadores (RF-07) de cada carga ya calculados:
`peso_cargado_kg`, `disponible_kg`, `porcentaje_uso`, `cantidad_animales`.

```sql
SELECT * FROM v_resumen_cargas WHERE carga_id = 1;
```

## 5. Triggers (la regla también está en la base)

Aunque la página ya controla todo, la base se protege sola:

| Trigger | Qué hace |
|---|---|
| `trg_animales_antes_insertar` | Si `acumulado + nuevo > capacidad` → error **«Capacidad máxima superada»**. También impide cargar en una carga cerrada. |
| `trg_animales_antes_actualizar` | Vuelve a controlar la capacidad si se restaura un animal o se corrige su peso. Completa `eliminado_en`. |
| `trg_cargas_antes_actualizar` | No deja bajar la capacidad por debajo de lo ya cargado. Completa `cerrada_en` al cerrar. |

En PHP (PDO) ese error llega como excepción con código `45000`:

```php
try {
    $st = $pdo->prepare('INSERT INTO animales_carga (carga_id, tipo_animal_id, caravana, peso_kg, fuera_de_rango)
                         VALUES (?, ?, ?, ?, ?)');
    $st->execute([$cargaId, $tipoId, $caravana, $peso, $fueraDeRango]);
} catch (PDOException $e) {
    if ($e->getCode() === '45000') {
        // Mostrar $e->errorInfo[2]  →  "Capacidad máxima superada"
    }
}
```

## 6. Conexión desde PHP: activar modo estricto

XAMPP trae MySQL **sin modo estricto**: si un valor no entra en la columna, lo **recorta sin avisar**
(por ejemplo, 150.000 kg en `peso_kg` se guardaría como 99.999,99). Los CHECK de la estructura ya frenan
los casos de peso y capacidad, pero conviene activar el modo estricto en cada conexión:

```php
$pdo = new PDO('mysql:host=localhost;dbname=nexorural;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
$pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'");
```

## 7. Consultas útiles

```sql
-- Animales de una carga (lo que muestra la tabla de la página)
SELECT a.id, t.nombre AS tipo, a.caravana, a.peso_kg, a.registrado_en
FROM animales_carga a
JOIN tipos_animal t ON t.id = a.tipo_animal_id
WHERE a.carga_id = ? AND a.eliminado = 0
ORDER BY a.registrado_en;

-- Abrir una carga nueva
INSERT INTO cargas (usuario_id, patente, capacidad_maxima_kg) VALUES (?, ?, ?);

-- Cerrar la carga
UPDATE cargas SET estado = 'cerrada' WHERE id = ?;
```

## 8. Pruebas rápidas en la pestaña SQL

Después de importar estructura + datos iniciales, y con un usuario creado:

```sql
INSERT INTO cargas (usuario_id, capacidad_maxima_kg) VALUES (1, 5000);
INSERT INTO animales_carga (carga_id, tipo_animal_id, peso_kg)
VALUES (1,1,750),(1,1,750),(1,1,750),(1,1,750),(1,1,750),(1,1,750); -- 4.500 kg

INSERT INTO animales_carga (carga_id, tipo_animal_id, peso_kg) VALUES (1,2,600);
-- Esperado: #1644 - Capacidad máxima superada

INSERT INTO animales_carga (carga_id, tipo_animal_id, peso_kg) VALUES (1,1,500);
-- Esperado: OK, total exactamente 5.000 kg
SELECT * FROM v_resumen_cargas;
```
