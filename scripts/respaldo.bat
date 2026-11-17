@echo off
rem ==================================================================
rem  NexoRural - Respaldo de la base de datos
rem  AGO Soluciones
rem
rem  Crea una copia completa (tablas, datos, vista y triggers) en:
rem      Documentos\NexoRural-respaldos\nexorural_AAAA-MM-DD_HH-MM.sql
rem  y borra los respaldos de mas de 30 dias.
rem  MySQL tiene que estar encendido.
rem
rem  Consejo: copia esa carpeta a un pendrive o a Google Drive/OneDrive
rem  de vez en cuando. Si se rompe la PC, el respaldo tiene que estar en
rem  otro lado.
rem ==================================================================
setlocal

set "MYSQL_BIN=C:\xampp\mysql\bin"
set "BASE=nexorural"
set "USUARIO=root"
set "CLAVE="
set "DESTINO=%USERPROFILE%\Documents\NexoRural-respaldos"
set "DIAS=30"

if not exist "%DESTINO%" mkdir "%DESTINO%"
set "LOG=%DESTINO%\respaldo.log"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "TS=%%i"
if not "%~2"=="" (set "ARCHIVO=%DESTINO%\nexorural_%TS%_%~2.sql") else (set "ARCHIVO=%DESTINO%\nexorural_%TS%.sql")

set "PASS_ARG="
if defined CLAVE set "PASS_ARG=-p%CLAVE%"

"%MYSQL_BIN%\mysqldump.exe" -u %USUARIO% %PASS_ARG% --default-character-set=utf8mb4 --single-transaction --routines --triggers --add-drop-table --databases %BASE% --result-file="%ARCHIVO%" 2>>"%LOG%"
if errorlevel 1 (
    echo [%date% %time%] ERROR: no se pudo crear el respaldo. Esta encendido MySQL? >> "%LOG%"
    if exist "%ARCHIVO%" del "%ARCHIVO%"
    echo.
    echo ERROR: no se pudo crear el respaldo. Revisa que MySQL este encendido en XAMPP.
    echo Detalle en: %LOG%
    if /i not "%~1"=="/auto" pause
    exit /b 1
)

echo [%date% %time%] OK %ARCHIVO% >> "%LOG%"
forfiles /p "%DESTINO%" /m nexorural_*.sql /d -%DIAS% /c "cmd /c del @path" >nul 2>&1

echo.
echo Respaldo creado:
echo     %ARCHIVO%
echo.
if /i not "%~1"=="/auto" pause
exit /b 0
