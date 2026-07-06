#Requires -Version 5.1
<#
.SYNOPSIS
    Pipeline de sincronización Venta Diaria (BSale → Supabase).
    Ejecuta con 1 día de desfase (por defecto procesa "ayer").
    Uso manual: .\run-sync.ps1 [-Fecha YYYY-MM-DD]
    Uso automático: Programar en Windows Task Scheduler.
#>
param(
    [string]$Fecha = ""
)

$ErrorActionPreference = "Continue"
$WORK = "C:\Contenedor Hermes\Antigravity\Sistema de Tesoreria"
Set-Location $WORK

# Calcular fecha de ayer si no se especifica
if ([string]::IsNullOrWhiteSpace($Fecha)) {
    $Fecha = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
}

$LOG = Join-Path $WORK "logs"
if (!(Test-Path $LOG)) { New-Item -ItemType Directory -Path $LOG | Out-Null }
$LOGFILE = Join-Path $LOG "sync-$Fecha.log"

function Log {
    param([string]$msg)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | $msg"
    Write-Host $line
    Add-Content -Path $LOGFILE -Value $line
}

function Run-Step {
    param([string]$Step, [string]$Label, [string]$Script)
    Log "[$Step] $Label..."
    $out = Invoke-Expression $Script 2>&1
    $out | ForEach-Object { Log "  [$Step] $_" }
    if ($LASTEXITCODE -ne 0) {
        Log "[$Step] ❌ ERROR (exit code $LASTEXITCODE)"
        exit 1
    }
    Log "[$Step] ✅ Completado"
}

Log "=== Sincronización $Fecha ==="

Run-Step "1/4" "Scrape BSale" "node src/lib/scrape-cierre-caja.cjs --fecha $Fecha"
Run-Step "2/4" "Procesar CSV" "node src/lib/procesar-csv.cjs --fecha=$Fecha --modo=venta"
Run-Step "3/4" "Procesar día" "node src/lib/procesar-dia.cjs --fecha $Fecha"
Run-Step "4/4" "Recalcular venta" "node src/lib/recalcular-venta.cjs --fecha $Fecha --todas"

Log "=== Fin sincronización $Fecha ==="
Write-Host ""
Write-Host "Log guardado en: $LOGFILE"
