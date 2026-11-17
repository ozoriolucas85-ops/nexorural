@echo off
rem ==================================================================
rem  NexoRural - Permitir que los celulares del wifi entren a la pagina
rem  AGO Soluciones
rem
rem  Agrega UNA regla al Firewall de Windows que deja pasar a Apache
rem  (puerto 80) SOLO desde la red local privada (el wifi del campo).
rem  Desde internet sigue bloqueado.
rem  Se ejecuta una sola vez. Pide permiso de administrador.
rem ==================================================================
setlocal

net session >nul 2>&1
if errorlevel 1 (
    echo Pidiendo permiso de administrador...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "REGLA=NexoRural - Apache (wifi)"
set "APACHE=C:\xampp\apache\bin\httpd.exe"

if not exist "%APACHE%" (
    echo No se encontro Apache en %APACHE%
    echo Si XAMPP esta en otra carpeta, edita la linea APACHE de este archivo.
    pause
    exit /b 1
)

netsh advfirewall firewall delete rule name="%REGLA%" >nul 2>&1
netsh advfirewall firewall add rule name="%REGLA%" dir=in action=allow program="%APACHE%" protocol=TCP localport=80 profile=private remoteip=localsubnet enable=yes
if errorlevel 1 (
    echo.
    echo ERROR: no se pudo crear la regla del firewall.
    pause
    exit /b 1
)

echo.
echo Listo. Los celulares conectados al mismo wifi ya pueden entrar a:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' } | ForEach-Object { '    http://' + $_.IPAddress + '/nexorural/' }"
echo.
echo Importante: la red wifi tiene que estar marcada como "Privada" en Windows.
echo Para quitar el permiso en el futuro:
echo     netsh advfirewall firewall delete rule name="%REGLA%"
echo.
pause
