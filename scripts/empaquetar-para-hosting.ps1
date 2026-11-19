# =====================================================================
#  NexoRural - Preparar los archivos para subir a un hosting
#  AGO Soluciones
#
#  Crea la carpeta  paquete-hosting\  con:
#    nexorural-web.zip                          los archivos de la pagina (sin
#                                               pruebas, documentacion ni scripts)
#    nexorural_estructura_hosting.sql           base para phpMyAdmin del hosting
#    nexorural_estructura_hosting_sin_triggers.sql   por si el hosting no
#                                               permite triggers
#  Usa la ULTIMA VERSION GUARDADA en Git (commit).
#  Guia completa: docs\PUBLICAR_ONLINE.md
# =====================================================================
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$destino = Join-Path $raiz 'paquete-hosting'
Set-Location $raiz

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host 'Hace falta Git instalado.' -ForegroundColor Red; exit 1 }
$pendientes = git status --porcelain
if ($pendientes) {
    Write-Host 'Atencion: hay cambios sin guardar en Git. El paquete usa la ultima version guardada (commit).' -ForegroundColor Yellow
}

if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
New-Item -ItemType Directory -Path $destino | Out-Null

# 1. Archivos de la pagina (lo marcado con export-ignore en .gitattributes queda afuera)
git archive --format=zip -o (Join-Path $destino 'nexorural-web.zip') HEAD
if ($LASTEXITCODE -ne 0) { Write-Host 'No se pudo crear el zip.' -ForegroundColor Red; exit 1 }

# 2. SQL para el hosting: sin CREATE DATABASE / USE (la base la crea el panel del hosting)
$sql = Get-Content (Join-Path $raiz 'database\nexorural_estructura.sql') -Raw -Encoding UTF8
$sql = $sql -replace '(?m)^CREATE DATABASE[\s\S]*?;\s*\r?\n', ''
$sql = $sql -replace '(?m)^USE nexorural;\s*\r?\n', ''
$utf8 = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $destino 'nexorural_estructura_hosting.sql'), $sql, $utf8)

# 3. Variante sin triggers (PHP igual controla todas las reglas)
#    Tambien sin la vista: hostings como InfinityFree no permiten crear vistas
#    (el historial hace el mismo calculo en su propia consulta).
$sinTriggers = $sql -replace '(?s)DELIMITER \$\$.*?DELIMITER ;\s*', "-- (Triggers omitidos: este hosting no los permite. PHP controla las mismas reglas.)`n"
$sinTriggers = $sinTriggers -replace '(?s)CREATE VIEW v_resumen_cargas AS.*?;\s*\r?\n', "-- (Vista omitida: el historial hace el mismo calculo en PHP.)`n"
[IO.File]::WriteAllText((Join-Path $destino 'nexorural_estructura_hosting_sin_triggers.sql'), $sinTriggers, $utf8)

Write-Host ''
Write-Host "Listo. Archivos en: $destino" -ForegroundColor Green
Get-ChildItem $destino | ForEach-Object { '  {0,-48} {1,8:N0} KB' -f $_.Name, ($_.Length / 1KB) }
Write-Host ''
Write-Host 'Siguiente paso: seguir docs\PUBLICAR_ONLINE.md'
