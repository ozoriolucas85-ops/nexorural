# NexoRural · Control de carga ganadera

**Equipo: AGO Soluciones**

Aplicación web para registrar el peso de cada animal antes de subirlo al camión y **bloquear cualquier ingreso que supere la capacidad máxima** configurada. Incluye login real, historial de viajes y gestión de usuarios con PHP + MySQL.

![Panel de carga](docs/capturas/panel.png)

## Dos formas de usarla

| | **Con servidor (recomendado)** | **Modo local** |
|---|---|---|
| Cómo se abre | `http://localhost/nexorural` (XAMPP) | Doble clic en `index.html` |
| Dónde se guardan los datos | Base MySQL, compartida entre equipos | Solo en ese navegador |
| Login | Real (usuario y contraseña, con bloqueo por intentos) | Solo el nombre |
| Historial de cargas | ✅ | ✅ (de ese navegador) |
| Gestión de usuarios | ✅ (administradores) | — |

La app detecta sola el modo y lo muestra arriba a la derecha: **Conectado** o **Modo local**.

### Instalar con XAMPP (una sola vez)

1. Copiá la carpeta `nexorural` dentro de `C:/xampp/htdocs/`.
2. En el panel de XAMPP encendé **Apache** y **MySQL**.
3. Entrá a `http://localhost/phpmyadmin` → **Importar** → `database/nexorural_estructura.sql` → **Continuar**.
4. Abrí `http://localhost/nexorural`. La primera vez te pide crear el **administrador**.
5. Desde **Usuarios** creá las cuentas de los capataces.

Si MySQL tiene contraseña o usás otro servidor, cambiá los datos en `api/config.php`.

## Cómo usarla

1. **Ingresar** con tu usuario y contraseña.
2. **Configurar camión**: capacidad máxima en kg y, si querés, la patente → *Iniciar carga*.
3. **Registrar animal**: elegí vaca, toro u oveja, escribí el peso real y tocá *Registrar animal*.
4. El sistema calcula `pesoAcumulado + pesoNuevo`:
   - si es **≤ capacidad**, acepta el animal y actualiza los indicadores;
   - si es **> capacidad**, muestra **«Capacidad máxima superada»** y no cambia nada.
5. Si cargaste algo por error, eliminalo desde la tabla (podés *Deshacer*).
6. Al terminar, **Cerrar carga** (con observaciones opcionales): queda en el **Historial**.
   Si el viaje no sale, **Cancelar carga** (también queda registrado, como cancelado).
7. *Imprimir planilla* genera una hoja con el detalle y lugar para la firma; *Excel (CSV)* la descarga para Excel.

### Historial

Todas las cargas con filtros por estado y fechas, totales del período (kilos transportados, animales, uso promedio del camión), detalle de cada viaje, reimpresión de la planilla y exportación a CSV.

### Usuarios (solo administradores)

Alta de capataces y administradores, activar/desactivar cuentas y asignar una contraseña nueva si alguien se la olvida.

## Funciones (requisitos del análisis)

| Código | Requisito | Dónde |
|---|---|---|
| RF-01 | Configurar capacidad máxima | Tarjeta «1. Configurar camión» |
| RF-02 | Seleccionar tipo de animal | Botones Vaca / Toro / Oveja |
| RF-03 | Ingresar peso | Campo «Peso real medido» (acepta `650,5` o `1.100`) |
| RF-04 | Validar datos | Rechaza vacío, texto, 0 y negativos: «Ingrese datos válidos» |
| RF-05 | Controlar capacidad | `js/logic.js`, `api/carga.php` y triggers de la base |
| RF-06 | Bloquear exceso | Mensaje en rojo «Capacidad máxima superada» + el camión marca el exceso |
| RF-07 | Actualizar indicadores | Peso cargado, capacidad, disponible, cantidad y barra de progreso |
| RF-08 | Listar registros | Tabla «Animales cargados» con acumulado |
| RF-09 | Eliminar registro | Botón de papelera, recalcula todo, con opción *Deshacer* |

Topes contra errores de tipeo: capacidad hasta **60.000 kg** y animal hasta **2.000 kg** (en la app, en PHP y en la base).

Extras: advertencia si el peso está fuera del rango orientativo (hay que confirmar), caravana, patente, barra que pasa a ámbar al 85 % y a rojo al llenarse, diseño para celular/tablet/PC, planilla imprimible y exportación CSV.

## Seguridad

- Contraseñas con `password_hash()` (nunca en texto plano).
- 5 intentos fallidos bloquean el usuario 5 minutos.
- Sesión con cookie `HttpOnly` y `SameSite=Strict`, más un encabezado obligatorio en cada envío (protección CSRF).
- Consultas preparadas con PDO (sin inyección SQL) y MySQL en modo estricto.
- La regla de capacidad se valida **tres veces**: en el navegador, en PHP (bloqueando la carga para que dos celulares no la superen al mismo tiempo) y en la base (triggers).
- Los archivos internos de `api/` no se pueden abrir desde el navegador (`api/.htaccess`).
- El CSV neutraliza fórmulas para que no se ejecuten al abrirlo en Excel.

## Estructura del proyecto

```
nexorural/
├── index.html              Ingreso (y alta del primer administrador)
├── panel.html              Panel de carga
├── historial.html          Historial de cargas
├── usuarios.html           Gestión de usuarios (administradores)
├── css/styles.css          Estilos (paleta y tipografías del análisis)
├── js/
│   ├── logic.js            Reglas de negocio (sin interfaz, testeable)
│   ├── store.js            Guardado: servidor PHP o navegador (misma interfaz)
│   ├── ui.js               Utilidades comunes (barra lateral, planilla, CSV)
│   ├── app.js              Panel de carga
│   ├── historial.js        Historial
│   ├── usuarios.js         Usuarios
│   └── login.js            Ingreso
├── api/                    Backend PHP 8 + MySQL (PDO)
│   ├── config.php          Datos de conexión y límites
│   ├── auth.php            Ingreso, salida y alta del primer administrador
│   ├── carga.php           Carga en curso (iniciar, registrar, eliminar, cerrar…)
│   ├── historial.php       Listado y detalle de cargas
│   └── usuarios.php        Alta, activar/desactivar, cambiar contraseña
├── assets/                 Logo y fondo del ingreso
├── database/
│   ├── nexorural_estructura.sql   Estructura para phpMyAdmin
│   └── datos_iniciales.sql        Catálogo de especies (opcional)
├── tests/
│   ├── index.html          Casos de prueba en el navegador
│   ├── casos.js            Casos de la sección 12 y más
│   └── run-node.js         Mismos casos desde la terminal
└── docs/
    ├── GUIA_BASE_DE_DATOS.md
    ├── Analisis_informatico_control_carga_ganadera.docx
    └── capturas/
```

## API

Todas las respuestas son JSON (`{ "ok": true, ... }` o `{ "ok": false, "mensaje": "...", "motivo": "..." }`). Los envíos (`POST`) llevan JSON y el encabezado `X-Requested-With: NexoRural`.

| Archivo | Acciones |
|---|---|
| `auth.php` | `estado` (GET), `instalar`, `login`, `logout` |
| `carga.php` | `actual` (GET), `iniciar`, `capacidad`, `registrar`, `eliminar`, `restaurar`, `rechazo`, `cerrar`, `cancelar` |
| `historial.php` | `listar` (GET, filtros `estado`, `desde`, `hasta`), `detalle` (GET, `id`) |
| `usuarios.php` | `listar` (GET), `crear`, `activo`, `clave` — solo administradores |

## Pruebas

- Reglas de negocio: `tests/index.html` en el navegador o `node tests/run-node.js` (16 casos, incluye todos los de la sección 12).

## Base de datos

Estructura en `database/nexorural_estructura.sql` y guía paso a paso en [docs/GUIA_BASE_DE_DATOS.md](docs/GUIA_BASE_DE_DATOS.md).

## Diseño

- Azul pizarra `#0F172A` / `#1E293B`: barra lateral y textos
- Verde esmeralda `#059669` / `#10B981`: botones principales y estados OK
- Ámbar `#D97706` y rojo `#DC2626`: advertencias y exceso de carga
- Gris hielo `#F8FAFC` y blanco: fondos de tablas y formularios
- Tipografías: **Plus Jakarta Sans** (interfaz) y **Roboto Mono** (pesos, patentes y caravanas)

![Historial de cargas](docs/capturas/historial.png)

<p align="center"><img src="docs/capturas/login.png" width="560" alt="Pantalla de ingreso"> <img src="docs/capturas/movil.png" width="200" alt="Vista en celular"></p>

---

Desarrollado por **AGO Soluciones**.
