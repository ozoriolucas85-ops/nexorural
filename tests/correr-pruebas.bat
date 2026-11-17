@echo off
rem NexoRural - Ejecuta todas las pruebas automaticas (ver correr-pruebas.ps1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0correr-pruebas.ps1"
echo.
pause
