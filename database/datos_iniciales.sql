-- =====================================================================
--  NexoRural — Datos iniciales (OPCIONAL)
--  Importar DESPUÉS de nexorural_estructura.sql
--  Carga el catálogo de especies con los rangos del análisis (sección 6).
-- =====================================================================
USE nexorural;

INSERT INTO tipos_animal (codigo, nombre, peso_min_ref_kg, peso_max_ref_kg) VALUES
  ('vaca',  'Vaca',  500.00,  800.00),
  ('toro',  'Toro',  600.00, 1100.00),
  ('oveja', 'Oveja',  35.00,  180.00);

-- Usuarios: NO cargar claves en texto plano.
-- Generar el hash desde PHP y pegarlo en clave_hash:
--   <?php echo password_hash('la_clave', PASSWORD_DEFAULT); ?>
--
-- INSERT INTO usuarios (nombre, usuario, clave_hash, rol)
-- VALUES ('Nombre Apellido', 'capataz1', '$2y$10$...hash...', 'capataz');
