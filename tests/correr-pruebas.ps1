# =====================================================================
#  NexoRural - Pruebas automaticas completas
#  AGO Soluciones
#
#  1. Reglas de negocio (Node, si esta instalado)
#  2. Punta a punta en MODO SERVIDOR: crea una base TEMPORAL, levanta un
#     servidor PHP de prueba y recorre todo en un navegador sin ventana.
#  3. Punta a punta en MODO LOCAL (sin servidor).
#  Al terminar borra la base temporal y apaga el servidor de prueba.
#  NUNCA toca la base "nexorural" real.
#
#  Requisitos: XAMPP (MySQL encendido) y Microsoft Edge o Google Chrome.
#  Uso: doble clic en tests\correr-pruebas.bat
# =====================================================================
$ErrorActionPreference = 'Stop'
$raiz   = Split-Path -Parent $PSScriptRoot
$xampp  = 'C:\xampp'
$mysql  = Join-Path $xampp 'mysql\bin\mysql.exe'
$php    = Join-Path $xampp 'php\php.exe'
$puerto = Get-Random -Minimum 18000 -Maximum 18999
$base   = 'nexorural_prueba_' + (Get-Date -Format 'yyyyMMddHHmmss')
$perfil = Join-Path $env:TEMP ('nexorural-pruebas-' + [guid]::NewGuid())
$fallas = 0
$total  = 0

function Titulo($t) { Write-Host ''; Write-Host "=== $t ===" -ForegroundColor Cyan }

function Mostrar($lineas) {
    foreach ($l in $lineas) {
        if (-not $l.Trim()) { continue }
        $script:total++
        if ($l.StartsWith('PASS')) { Write-Host "  OK    $($l.Substring(5))" -ForegroundColor Green }
        else { $script:fallas++; Write-Host "  FALLA $l" -ForegroundColor Red }
    }
}

function Correr-Pagina($url, [switch]$Archivo) {
    # Edge escribe avisos en la salida de error: se redirigen a un archivo para que PowerShell no los trate como errores.
    $args_ = @('--headless=new', '--disable-gpu', "`"--user-data-dir=$perfil`"", '--virtual-time-budget=180000', '--dump-dom')
    if ($Archivo) { $args_ += '--allow-file-access-from-files' }
    $args_ += "`"$url`""
    $salida = Join-Path $env:TEMP ('nexorural-dom-' + [guid]::NewGuid() + '.html')
    $errores = "$salida.err"
    Start-Process -FilePath $script:navegador -ArgumentList $args_ -Wait -WindowStyle Hidden `
        -RedirectStandardOutput $salida -RedirectStandardError $errores
    $html = Get-Content $salida -Raw -Encoding UTF8
    Remove-Item $salida, $errores -ErrorAction SilentlyContinue
    $m = [regex]::Match($html, '<pre id="o">(.*?)</pre>', 'Singleline')
    if (-not $m.Success) { return @('FALLA no se pudo leer el resultado de ' + $url) }
    $texto = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
    if ($texto -match '^(ABORTADO|EXCEPCION)' -or $texto -match 'EXCEPCION') { return @('FALLA ' + $texto) }
    return $texto -split "`n"
}

# --- Navegador ---
$candidatos = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$navegador = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $navegador) { Write-Host 'No se encontro Microsoft Edge ni Google Chrome.' -ForegroundColor Red; exit 1 }

# --- 1. Reglas de negocio ---
Titulo '1. Reglas de negocio'
if (Get-Command node -ErrorAction SilentlyContinue) {
    $salida = & node (Join-Path $raiz 'tests\run-node.js') 2>&1
    foreach ($l in $salida) {
        if ($l -match '^\s+OK\s+(.*)') { $total++; Write-Host "  OK    $($Matches[1])" -ForegroundColor Green }
        elseif ($l -match '^\s+FALLA\s+(.*)') { $total++; $fallas++; Write-Host "  FALLA $($Matches[1])" -ForegroundColor Red }
    }
} else {
    Write-Host '  (Node no esta instalado: abri tests\index.html en el navegador para ver estas pruebas)' -ForegroundColor Yellow
}

# --- 2. Modo servidor ---
Titulo '2. Punta a punta - modo servidor (base temporal)'
$servidor = $null
try {
    & $mysql -u root -e 'SELECT 1' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'MySQL no responde. Encendelo en el panel de XAMPP.' }

    $sql = Get-Content (Join-Path $raiz 'database\nexorural_estructura.sql') -Raw -Encoding UTF8
    $sql = $sql -replace '\bnexorural\b', $base
    $tmpSql = Join-Path $env:TEMP "$base.sql"
    [IO.File]::WriteAllText($tmpSql, $sql, (New-Object Text.UTF8Encoding $false))
    cmd /c "`"$mysql`" -u root --default-character-set=utf8mb4 < `"$tmpSql`""
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base temporal.' }
    Remove-Item $tmpSql
    Write-Host "  Base temporal: $base"

    $env:NEXO_DB_NAME = $base
    $servidor = Start-Process -FilePath $php -ArgumentList '-S', "127.0.0.1:$puerto", '-t', "`"$raiz`"" -PassThru -WindowStyle Hidden
    Remove-Item Env:\NEXO_DB_NAME
    Start-Sleep -Seconds 2
    Write-Host "  Servidor de prueba: http://127.0.0.1:$puerto/"

    Mostrar (Correr-Pagina "http://127.0.0.1:$puerto/tests/e2e/servidor.html")
}
catch {
    $fallas++; $total++
    Write-Host "  FALLA $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    if ($servidor -and -not $servidor.HasExited) { Stop-Process -Id $servidor.Id -Force -Confirm:$false }
    & $mysql -u root -e "DROP DATABASE IF EXISTS ``$base``" *> $null
    Write-Host '  Base temporal borrada y servidor de prueba apagado.'
}

# --- 3. Modo local ---
Titulo '3. Punta a punta - modo local'
$urlLocal = 'file:///' + ((Join-Path $raiz 'tests\e2e\local.html') -replace '\\', '/' -replace ' ', '%20')
Mostrar (Correr-Pagina $urlLocal -Archivo)

Remove-Item $perfil -Recurse -Force -ErrorAction SilentlyContinue

# --- Resumen ---
Write-Host ''
if ($fallas -eq 0) {
    Write-Host "RESULTADO: $total de $total pruebas superadas." -ForegroundColor Green
    exit 0
} else {
    Write-Host "RESULTADO: $fallas de $total pruebas FALLARON." -ForegroundColor Red
    exit 1
}
