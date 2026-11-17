@echo off
rem ==================================================================
rem  NexoRural - Restaurar un respaldo
rem  AGO Soluciones
rem
rem  Reemplaza TODOS los datos actuales de NexoRural por los de un
rem  respaldo. Antes de hacerlo guarda automaticamente una copia del
rem  estado actual (por si te equivocaste de archivo).
rem  MySQL tiene que estar encendido.
rem
rem  Uso: doble clic, o  restaurar-respaldo.bat nombre_del_archivo.sql
rem ==================================================================
setlocal
set "MYSQL_BIN=C:\xampp\mysql\bin"
set "USUARIO=root"
set "CLAVE="
set "DESTINO=%USERPROFILE%\Documents\NexoRural-respaldos"

set "NOMBRE=%~1"
if not "%NOMBRE%"=="" goto buscar

echo Respaldos disponibles en %DESTINO%:
echo.
dir /b /o-d "%DESTINO%\nexorural_*.sql" 2>nul || echo   - no hay respaldos -
echo.
set /p "NOMBRE=Escribi o pega el nombre del archivo a restaurar: "

:buscar
set "ARCHIVO=%DESTINO%\%NOMBRE%"
if exist "%ARCHIVO%" goto confirmar
set "ARCHIVO=%NOMBRE%"
if exist "%ARCHIVO%" goto confirmar
echo No existe el archivo: %NOMBRE%
goto fin_error

:confirmar
echo.
echo ATENCION: se van a reemplazar todos los datos actuales por los de:
echo     %ARCHIVO%
set "OK="
set /p "OK=Para confirmar escribi SI en mayusculas: "
if not "%OK%"=="SI" goto cancelado

echo.
echo Guardando una copia del estado actual antes de restaurar...
call "%~dp0respaldo.bat" /auto antes-de-restaurar
if errorlevel 1 goto sin_copia

set "PASS_ARG="
if defined CLAVE set "PASS_ARG=-p%CLAVE%"
"%MYSQL_BIN%\mysql.exe" -u %USUARIO% %PASS_ARG% --default-character-set=utf8mb4 < "%ARCHIVO%"
if errorlevel 1 goto error_restaurar

echo.
echo Listo: datos restaurados desde %ARCHIVO%
pause
exit /b 0

:cancelado
echo Cancelado. No se cambio nada.
goto fin_error

:sin_copia
echo No se pudo guardar la copia previa. Por seguridad no se restauro nada.
goto fin_error

:error_restaurar
echo.
echo ERROR al restaurar. Los datos anteriores estan en el respaldo "antes-de-restaurar".
goto fin_error

:fin_error
pause
exit /b 1
