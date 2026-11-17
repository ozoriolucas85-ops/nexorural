-- =====================================================================
--  NexoRural — Control de carga ganadera
--  Estructura de base de datos (SOLO ESTRUCTURA, sin datos)
--  Equipo: AGO Soluciones
--
--  Motor:      MySQL 8.0.16+  /  MariaDB 10.4+  (XAMPP actual sirve)
--  Charset:    utf8mb4 (acentos, ñ y símbolos)
--  Importar:   phpMyAdmin > Importar > elegir este archivo > Continuar
--  Guía:       docs/GUIA_BASE_DE_DATOS.md
-- =====================================================================

-- Si el hosting no permite crear bases, borrá estas 2 líneas,
-- creá la base desde phpMyAdmin y seleccionala antes de importar.
CREATE DATABASE IF NOT EXISTS nexorural
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE nexorural;

SET NAMES utf8mb4;

-- Topes de seguridad (iguales a LIMITES en js/logic.js):
--   capacidad del camión: hasta 60.000 kg  ·  peso por animal: hasta 2.000 kg
-- Los CHECK los hacen cumplir aunque MySQL no esté en modo estricto
-- (XAMPP viene sin STRICT_TRANS_TABLES y recortaría los valores sin avisar).
SET FOREIGN_KEY_CHECKS = 0;

DROP VIEW    IF EXISTS v_resumen_cargas;
DROP TABLE   IF EXISTS intentos_rechazados;
DROP TABLE   IF EXISTS animales_carga;
DROP TABLE   IF EXISTS cargas;
DROP TABLE   IF EXISTS tipos_animal;
DROP TABLE   IF EXISTS camiones;
DROP TABLE   IF EXISTS usuarios;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1) USUARIOS — capataz / encargado que registra la carga
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  nombre        VARCHAR(80)      NOT NULL                COMMENT 'Nombre y apellido',
  usuario       VARCHAR(40)      NOT NULL                COMMENT 'Nombre de ingreso (único)',
  clave_hash    VARCHAR(255)     NOT NULL                COMMENT 'Resultado de password_hash() de PHP. NUNCA la clave en texto plano',
  rol           ENUM('capataz','administrador') NOT NULL DEFAULT 'capataz',
  activo        TINYINT(1)       NOT NULL DEFAULT 1,
  intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Se reinicia al ingresar bien',
  bloqueado_hasta   DATETIME     NULL                COMMENT '5 intentos fallidos = 5 minutos de bloqueo',
  ultimo_ingreso    DATETIME     NULL,
  creado_en     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Personas que usan el sistema';

-- ---------------------------------------------------------------------
-- 2) CAMIONES — vehículos disponibles (opcional en la versión 1)
-- ---------------------------------------------------------------------
CREATE TABLE camiones (
  id                    INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  patente               VARCHAR(10)    NOT NULL       COMMENT 'Ej: AB123CD (sin espacios, mayúsculas)',
  descripcion           VARCHAR(100)   NULL           COMMENT 'Marca, modelo, jaula, etc.',
  capacidad_maxima_kg   DECIMAL(9,2)   NOT NULL       COMMENT 'Capacidad habitual del camión',
  activo                TINYINT(1)     NOT NULL DEFAULT 1,
  creado_en             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_camiones_patente (patente),
  CONSTRAINT ck_camiones_capacidad CHECK (capacidad_maxima_kg > 0 AND capacidad_maxima_kg <= 60000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Flota de camiones';

-- ---------------------------------------------------------------------
-- 3) TIPOS_ANIMAL — catálogo de especies / categorías (RF-02)
--    Los rangos son ORIENTATIVOS: solo generan advertencia, no bloquean.
-- ---------------------------------------------------------------------
CREATE TABLE tipos_animal (
  id                SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo            VARCHAR(20)    NOT NULL   COMMENT 'Clave usada por la app: vaca, toro, oveja',
  nombre            VARCHAR(40)    NOT NULL   COMMENT 'Texto que ve el usuario',
  peso_min_ref_kg   DECIMAL(7,2)   NOT NULL   COMMENT 'Mínimo orientativo',
  peso_max_ref_kg   DECIMAL(7,2)   NOT NULL   COMMENT 'Máximo orientativo',
  activo            TINYINT(1)     NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tipos_animal_codigo (codigo),
  CONSTRAINT ck_tipos_rango CHECK (peso_min_ref_kg > 0 AND peso_max_ref_kg > peso_min_ref_kg)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Especies/categorías y rangos de referencia';

-- ---------------------------------------------------------------------
-- 4) CARGAS — cada viaje / sesión de carga de un camión (RF-01)
--    La capacidad se COPIA acá al iniciar: si después se edita el
--    camión, las cargas históricas no cambian.
-- ---------------------------------------------------------------------
CREATE TABLE cargas (
  id                    INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  usuario_id            INT UNSIGNED   NOT NULL       COMMENT 'Quién realizó la carga',
  camion_id             INT UNSIGNED   NULL           COMMENT 'NULL si no se eligió un camión registrado',
  patente               VARCHAR(10)    NULL           COMMENT 'Patente escrita al iniciar (copia)',
  capacidad_maxima_kg   DECIMAL(9,2)   NOT NULL       COMMENT 'Capacidad configurada para ESTA carga',
  estado                ENUM('abierta','cerrada','cancelada') NOT NULL DEFAULT 'abierta',
  iniciada_en           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada_en            DATETIME       NULL,
  observaciones         VARCHAR(255)   NULL,
  PRIMARY KEY (id),
  KEY ix_cargas_usuario (usuario_id),
  KEY ix_cargas_camion (camion_id),
  KEY ix_cargas_estado (estado, iniciada_en),
  CONSTRAINT fk_cargas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_cargas_camion  FOREIGN KEY (camion_id)  REFERENCES camiones (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT ck_cargas_capacidad CHECK (capacidad_maxima_kg > 0 AND capacidad_maxima_kg <= 60000),
  CONSTRAINT ck_cargas_cierre CHECK (cerrada_en IS NULL OR cerrada_en >= iniciada_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Sesiones de carga (un camión a la vez)';

-- ---------------------------------------------------------------------
-- 5) ANIMALES_CARGA — animales ACEPTADOS en una carga (RF-03, RF-08)
--    Eliminar (RF-09) = baja lógica: eliminado = 1. Así queda historial.
-- ---------------------------------------------------------------------
CREATE TABLE animales_carga (
  id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  carga_id          INT UNSIGNED      NOT NULL,
  tipo_animal_id    SMALLINT UNSIGNED NOT NULL,
  caravana          VARCHAR(20)       NULL       COMMENT 'Identificación de la caravana (opcional)',
  peso_kg           DECIMAL(7,2)      NOT NULL   COMMENT 'Peso real medido',
  fuera_de_rango    TINYINT(1)        NOT NULL DEFAULT 0 COMMENT '1 = el usuario confirmó un peso fuera del rango orientativo',
  registrado_en     DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  eliminado         TINYINT(1)        NOT NULL DEFAULT 0,
  eliminado_en      DATETIME          NULL,
  PRIMARY KEY (id),
  KEY ix_animales_carga (carga_id, eliminado),
  KEY ix_animales_tipo (tipo_animal_id),
  KEY ix_animales_caravana (caravana),
  CONSTRAINT fk_animales_carga FOREIGN KEY (carga_id) REFERENCES cargas (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_animales_tipo  FOREIGN KEY (tipo_animal_id) REFERENCES tipos_animal (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT ck_animales_peso CHECK (peso_kg > 0 AND peso_kg <= 2000),
  CONSTRAINT ck_animales_baja CHECK (eliminado IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Detalle de animales aceptados por carga';

-- ---------------------------------------------------------------------
-- 6) INTENTOS_RECHAZADOS — auditoría (opcional)
--    Un rechazo NUNCA toca animales_carga (requisito de integridad).
-- ---------------------------------------------------------------------
CREATE TABLE intentos_rechazados (
  id                    INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  carga_id              INT UNSIGNED      NOT NULL,
  tipo_animal_id        SMALLINT UNSIGNED NULL,
  peso_ingresado        VARCHAR(30)       NULL     COMMENT 'Texto tal cual lo escribió el usuario',
  motivo                ENUM('dato_invalido','capacidad_superada') NOT NULL,
  peso_acumulado_kg     DECIMAL(9,2)      NOT NULL COMMENT 'Total que había al momento del intento',
  registrado_en         DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_rechazos_carga (carga_id),
  CONSTRAINT fk_rechazos_carga FOREIGN KEY (carga_id) REFERENCES cargas (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_rechazos_tipo  FOREIGN KEY (tipo_animal_id) REFERENCES tipos_animal (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registros bloqueados (exceso o dato inválido)';

-- ---------------------------------------------------------------------
-- 7) VISTA — indicadores de cada carga (RF-07)
-- ---------------------------------------------------------------------
CREATE VIEW v_resumen_cargas AS
SELECT
  c.id                                                   AS carga_id,
  c.estado,
  COALESCE(c.patente, cm.patente)                        AS patente,
  u.nombre                                               AS operador,
  c.capacidad_maxima_kg,
  COALESCE(SUM(a.peso_kg), 0)                            AS peso_cargado_kg,
  c.capacidad_maxima_kg - COALESCE(SUM(a.peso_kg), 0)    AS disponible_kg,
  ROUND(COALESCE(SUM(a.peso_kg), 0) * 100 / c.capacidad_maxima_kg, 2) AS porcentaje_uso,
  COUNT(a.id)                                            AS cantidad_animales,
  c.iniciada_en,
  c.cerrada_en
FROM cargas c
JOIN usuarios u        ON u.id = c.usuario_id
LEFT JOIN camiones cm  ON cm.id = c.camion_id
LEFT JOIN animales_carga a ON a.carga_id = c.id AND a.eliminado = 0
GROUP BY c.id, c.estado, c.patente, cm.patente, u.nombre,
         c.capacidad_maxima_kg, c.iniciada_en, c.cerrada_en;

-- ---------------------------------------------------------------------
-- 8) TRIGGERS — la regla principal también se protege en la base.
--    pesoPropuesto = pesoAcumulado + pesoNuevo
--    Si pesoPropuesto > capacidad  →  error "Capacidad máxima superada"
--    (En phpMyAdmin el DELIMITER funciona tanto en Importar como en SQL.)
-- ---------------------------------------------------------------------
DELIMITER $$

CREATE TRIGGER trg_animales_antes_insertar
BEFORE INSERT ON animales_carga
FOR EACH ROW
BEGIN
  DECLARE v_capacidad DECIMAL(9,2);
  DECLARE v_estado    VARCHAR(10);
  DECLARE v_acumulado DECIMAL(9,2);

  SELECT capacidad_maxima_kg, estado
    INTO v_capacidad, v_estado
    FROM cargas WHERE id = NEW.carga_id;

  IF v_estado <> 'abierta' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La carga no está abierta';
  END IF;

  SELECT COALESCE(SUM(peso_kg), 0) INTO v_acumulado
    FROM animales_carga
   WHERE carga_id = NEW.carga_id AND eliminado = 0;

  IF NEW.eliminado = 0 AND v_acumulado + NEW.peso_kg > v_capacidad THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Capacidad máxima superada';
  END IF;
END$$

CREATE TRIGGER trg_animales_antes_actualizar
BEFORE UPDATE ON animales_carga
FOR EACH ROW
BEGIN
  DECLARE v_capacidad DECIMAL(9,2);
  DECLARE v_acumulado DECIMAL(9,2);

  -- Registrar fecha de baja lógica automáticamente.
  IF NEW.eliminado = 1 AND OLD.eliminado = 0 THEN
    SET NEW.eliminado_en = CURRENT_TIMESTAMP;
  END IF;
  IF NEW.eliminado = 0 THEN
    SET NEW.eliminado_en = NULL;
  END IF;

  -- Si se restaura o se corrige el peso, volver a validar la capacidad.
  IF NEW.eliminado = 0 AND (OLD.eliminado = 1 OR NEW.peso_kg <> OLD.peso_kg) THEN
    SELECT capacidad_maxima_kg INTO v_capacidad FROM cargas WHERE id = NEW.carga_id;
    SELECT COALESCE(SUM(peso_kg), 0) INTO v_acumulado
      FROM animales_carga
     WHERE carga_id = NEW.carga_id AND eliminado = 0 AND id <> OLD.id;
    IF v_acumulado + NEW.peso_kg > v_capacidad THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Capacidad máxima superada';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_cargas_antes_actualizar
BEFORE UPDATE ON cargas
FOR EACH ROW
BEGIN
  DECLARE v_acumulado DECIMAL(9,2);

  -- No permitir bajar la capacidad por debajo de lo ya cargado.
  IF NEW.capacidad_maxima_kg <> OLD.capacidad_maxima_kg THEN
    SELECT COALESCE(SUM(peso_kg), 0) INTO v_acumulado
      FROM animales_carga WHERE carga_id = OLD.id AND eliminado = 0;
    IF NEW.capacidad_maxima_kg < v_acumulado THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La capacidad no puede ser menor al peso ya cargado';
    END IF;
  END IF;

  -- Fecha de cierre automática.
  IF NEW.estado <> 'abierta' AND OLD.estado = 'abierta' AND NEW.cerrada_en IS NULL THEN
    SET NEW.cerrada_en = CURRENT_TIMESTAMP;
  END IF;
END$$

DELIMITER ;

-- Fin de la estructura.
