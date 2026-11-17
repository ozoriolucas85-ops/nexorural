@echo off
rem ==================================================================
rem  NexoRural - Restablecer la contrasena de un usuario (emergencia)
rem  AGO Soluciones
rem
rem  Usalo si el administrador se olvido la contrasena y no hay otro
rem  administrador. Tambien desbloquea y reactiva al usuario.
rem  MySQL tiene que estar encendido.
rem ==================================================================
setlocal
set "PHP=C:\xampp\php\php.exe"
set "NEXO_USUARIO="
set "NEXO_CLAVE="

"%PHP%" "%~dp0restablecer-clave.php"
if errorlevel 1 goto fin
echo.
set /p "NEXO_USUARIO=Usuario a restablecer: "
if "%NEXO_USUARIO%"=="" goto fin
set /p "NEXO_CLAVE=Contrasena nueva (minimo 6): "
"%PHP%" "%~dp0restablecer-clave.php"

:fin
echo.
pause
