# Publicar NexoRural en internet

**AGO Soluciones**

Para tener un link que funcione desde cualquier lugar (por ejemplo, para mostrar el proyecto) hace falta un **hosting con PHP 8 y MySQL/MariaDB**. Hay opciones gratuitas, como InfinityFree o 000webhost, y pagas. Los pasos son casi iguales en todos; los nombres de los menús pueden variar.

> **Antes de publicar:** NexoRural maneja usuarios y contraseñas. Usá un hosting con **HTTPS** (el candadito en la dirección); la mayoría lo da gratis. Sin HTTPS, las contraseñas viajan sin cifrar.

## 1. Preparar los archivos

En la computadora del proyecto, doble clic en:

```
scripts\empaquetar-para-hosting.bat
```

Se crea la carpeta `paquete-hosting\` con:

| Archivo | Para qué |
|---|---|
| `nexorural-web.zip` | La página (sin pruebas, documentación ni scripts de Windows) |
| `nexorural_estructura_hosting.sql` | La base de datos, lista para el phpMyAdmin del hosting |
| `nexorural_estructura_hosting_sin_triggers.sql` | Alternativa si el hosting no permite triggers (ver paso 3) |

> El paquete usa la **última versión guardada en Git** (commit). Si cambiaste algo, guardalo antes.

## 2. Crear la cuenta y la base de datos

1. Creá una cuenta en el hosting y un sitio, con un subdominio gratuito o tu propio dominio.
2. En el panel buscá **MySQL Databases** y creá una base nueva.
3. Anotá los cuatro datos que te muestra:
   - **Host** (por ejemplo `sql123.hosting.com`; casi nunca es `localhost`)
   - **Nombre de la base** (suele venir con un prefijo, por ejemplo `if0_123_nexorural`)
   - **Usuario**
   - **Contraseña**

## 3. Importar la base

1. Desde el panel del hosting abrí **phpMyAdmin** y seleccioná la base que creaste, a la izquierda.
2. Pestaña **Importar** → elegí `nexorural_estructura_hosting.sql` → **Continuar**.
3. Si da un error en la parte de los **triggers** (por ejemplo *"You do not have the SUPER privilege"* o *"TRIGGER command denied"*), el hosting no los permite:
   - Borrá las tablas que se hayan creado (seleccionalas todas → *Eliminar*).
   - Importá `nexorural_estructura_hosting_sin_triggers.sql`.

   **No se pierde seguridad:** PHP controla las mismas reglas (capacidad, cargas cerradas, no bajar la capacidad por debajo de lo cargado). Los triggers son una capa extra.

## 4. Subir la página

1. En el panel, abrí el **Administrador de archivos** (File Manager) y entrá a la carpeta pública, que suele llamarse `htdocs` o `public_html`.
2. Subí `nexorural-web.zip` y **descomprimilo** ahí. Si el administrador de archivos no descomprime, descomprimilo en tu PC y subí los archivos (también se puede por FTP, con FileZilla).
3. Tiene que quedar así (`index.html` directamente en la carpeta pública, o dentro de una subcarpeta si querés):

   ```
   htdocs/
   ├── index.html
   ├── panel.html
   ├── api/
   ├── css/
   ├── js/
   └── assets/
   ```

## 5. Conectar con la base

1. En la carpeta `api/` del hosting, copiá `config.local.ejemplo.php` con el nombre **`config.local.php`**.
2. Editalo con los datos del paso 2:

   ```php
   <?php
   return [
       'db_host' => 'sql123.hosting.com',
       'db_name' => 'if0_123_nexorural',
       'db_user' => 'if0_123',
       'db_pass' => 'la-contraseña-de-mysql',
   ];
   ```

`config.local.php` no se puede abrir desde el navegador y no está en GitHub, así que la contraseña no queda expuesta.

## 6. Probar

1. Abrí tu dirección, por ejemplo `https://nexorural.mi-hosting.com/`. Tiene que aparecer **Primer ingreso** para crear el administrador.
2. Revisá que arriba a la derecha diga **Conectado**.
3. En **Administración → Acceso desde celulares** aparece la dirección pública, con botón para mandarla por WhatsApp.
4. Hacé una carga de prueba completa: iniciar, registrar, exceder la capacidad, cerrar, ver el historial.

## Problemas frecuentes

| Qué pasa | Causa y solución |
|---|---|
| «No se pudo conectar a MySQL» | Datos mal copiados en `config.local.php`. El host casi nunca es `localhost` en un hosting gratuito. |
| «La base de datos … no existe» | El `db_name` no coincide con el nombre exacto de la base (incluido el prefijo). |
| Indicador **Modo local** en lugar de Conectado | El hosting no ejecuta PHP en `api/`. Verificá que tenga PHP 8 o más. |
| Error al importar en los triggers | Usá `nexorural_estructura_hosting_sin_triggers.sql` (paso 3). |
| Se ve la página pero sin estilos | Faltan carpetas: subí también `css/`, `js/` y `assets/`. |
| Las cookies o el inicio de sesión fallan | Revisá que la dirección sea siempre la misma (con o sin `www`) y que use `https`. |

## Mantener actualizado

Cada vez que cambies el proyecto: guardá en Git → `scripts\empaquetar-para-hosting.bat` → subí y reemplazá los archivos del zip. **No reemplaces** `api/config.local.php` (el zip no lo trae, justamente para no pisarlo).
