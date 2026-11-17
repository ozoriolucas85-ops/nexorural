@echo off
rem ==================================================================
rem  NexoRural - Programar el respaldo automatico diario
rem  AGO Soluciones
rem
rem  Crea una tarea de Windows que ejecuta respaldo.bat todos los dias
rem  a las 20:00. Si a esa hora la PC esta apagada, el respaldo se hace
rem  apenas se vuelva a encender. No necesita permisos de administrador.
rem
rem  Para quitarla: Programador de tareas > "NexoRural - Respaldo diario"
rem  o ejecutar:  schtasks /delete /tn "NexoRural - Respaldo diario" /f
rem ==================================================================
setlocal
set "TAREA=NexoRural - Respaldo diario"
set "SCRIPT=%~dp0respaldo.bat"

powershell -NoProfile -Command "$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c \"\"' + $env:SCRIPT + '\" /auto\"'); $t = New-ScheduledTaskTrigger -Daily -At '20:00'; $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10); Register-ScheduledTask -TaskName $env:TAREA -Action $a -Trigger $t -Settings $s -Description 'Respaldo diario de la base de NexoRural (AGO Soluciones)' -Force | Out-Null"
if errorlevel 1 (
    echo ERROR: no se pudo crear la tarea programada.
    if /i not "%~1"=="/auto" pause
    exit /b 1
)

echo.
echo Listo: se creo la tarea "%TAREA%" (todos los dias a las 20:00).
echo Los respaldos se guardan en: %USERPROFILE%\Documents\NexoRural-respaldos
echo.
if /i not "%~1"=="/auto" pause
exit /b 0
