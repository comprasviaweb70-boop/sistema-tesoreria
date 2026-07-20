#Requires -Version 5.1
<#
.SYNOPSIS
    Pipeline de sincronización Venta Diaria (BSale → Supabase).
    Detecta días pendientes desde el último saldo registrado y los procesa
    en orden cronológico (si no se especifica fecha, procesa hasta "ayer").
    Uso manual: .\run-sync.ps1 [-Fecha YYYY-MM-DD]
    Uso automático: Acceso directo en Startup de Windows.
#>
param(
    [string]$Fecha = ""
)

$ErrorActionPreference = "Continue"
$WORK = "C:\Contenedor Hermes\Antigravity\Sistema de Tesoreria"
Set-Location $WORK

$LOG = Join-Path $WORK "logs"
if (!(Test-Path $LOG)) { New-Item -ItemType Directory -Path $LOG | Out-Null }
$LOGFILE = Join-Path $LOG "sync-run.log"

function Log {
    param([string]$msg)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | $msg"
    Write-Host $line
    Add-Content -Path $LOGFILE -Value $line
}

Log "⏳ Esperando 3 minutos para estabilidad de red..."
Start-Sleep -Seconds 180
Log "✅ Red lista, iniciando pipeline..."

function Invoke-Step {
    param([string]$FechaPaso, [string]$Step, [string]$Label, [string]$Script)
    Log "[$FechaPaso][$Step] $Label..."
    $out = Invoke-Expression $Script 2>&1
    $exit = $LASTEXITCODE
    $out | ForEach-Object { Log "  [$FechaPaso][$Step] $_" }
    if ($exit -ne 0) {
        Log "[$FechaPaso][$Step] ❌ ERROR (exit code $exit)"
        return $false
    }
    Log "[$FechaPaso][$Step] ✅ Completado"
    return $true
}

function Sync-Day {
    param([string]$FechaPaso)
    Log "=== Sincronización $FechaPaso ==="

    $ok = Invoke-Step $FechaPaso "1/4" "Scrape BSale" "node src/lib/scrape-cierre-caja.cjs --fecha $FechaPaso"
    if (-not $ok) { return $false }

    $ok = Invoke-Step $FechaPaso "2/4" "Procesar CSV" "node src/lib/procesar-csv.cjs --fecha=$FechaPaso --modo=venta"
    if (-not $ok) { return $false }

    $ok3 = Invoke-Step $FechaPaso "3/4" "Procesar día" "node src/lib/procesar-dia.cjs --fecha $FechaPaso"
    if (-not $ok3) {
        Log "[$FechaPaso] ⚠️ Paso 3 falló, intentando recalcular de todos modos (paso 4)"
    }

    $ok4 = Invoke-Step $FechaPaso "4/4" "Recalcular venta" "node src/lib/recalcular-venta.cjs --fecha $FechaPaso --todas"
    if (-not $ok3 -and -not $ok4) {
        Log "[$FechaPaso] ❌ Pasos 3 y 4 fallaron - granulares pueden quedar en 0"
        return $false
    }

    Log "=== Fin sincronización $FechaPaso ==="
    return $true
}

Log "=== Inicio ejecución run-sync ==="

# Determinar fecha límite: argumento o ayer
$fechaLimite = if ([string]::IsNullOrWhiteSpace($Fecha)) {
    (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
} else {
    $Fecha
}

# Detectar días pendientes
Log "Detectando días pendientes hasta $fechaLimite..."
try {
    $pendingJson = node src/lib/detectar-dias-pendientes.cjs $fechaLimite 2>&1 | Select-Object -Last 1
    $pending = $pendingJson | ConvertFrom-Json
} catch {
    Log "❌ No se pudieron detectar días pendientes: $_"
    Log "Procesando únicamente $fechaLimite como fallback."
    $pending = @($fechaLimite)
}

if ($pending.Count -eq 0) {
    Log "✅ No hay días pendientes hasta $fechaLimite."
    exit 0
}

Log "Días pendientes: $($pending -join ', ')"

$exitCode = 0
$fallidos = @()
foreach ($fechaDia in $pending) {
    $ok = Sync-Day $fechaDia
    if (-not $ok) {
        $exitCode = 1
        $fallidos += $fechaDia
    }
}

if ($fallidos.Count -gt 0) {
    Log "⚠️ Fechas con error: $($fallidos -join ', ')"
}

Log "=== Fin ejecución run-sync ==="
Write-Host ""
Write-Host "Log guardado en: $LOGFILE"
exit $exitCode
