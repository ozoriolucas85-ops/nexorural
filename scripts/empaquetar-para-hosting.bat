@echo off
rem NexoRural - Preparar archivos para un hosting (ver empaquetar-para-hosting.ps1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0empaquetar-para-hosting.ps1"
echo.
pause
