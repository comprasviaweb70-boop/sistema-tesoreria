#!/bin/bash
# Sincronización completa: scrape → CSV → procesar-día → recalcular
set -e

WORKDIR="/mnt/c/Contenedor Hermes/Antigravity/Sistema de Tesoreria"
cd "$WORKDIR"

FECHA=$1
if [ -z "$FECHA" ]; then
  FECHA=$(date -d yesterday +%Y-%m-%d)
fi

LOG="/tmp/sync-$FECHA.log"
echo "=== Sincronización $FECHA $(date) ===" | tee "$LOG"

# 1. Scrape cierres BSale
echo "[1/4] Scrape BSale..." | tee -a "$LOG"
PLAYWRIGHT_BROWSERS_PATH=/home/jsanz/.cache/ms-playwright \
  node src/lib/scrape-cierre-caja.cjs --fecha "$FECHA" 2>&1 | tee -a "$LOG"

# 2. Insertar/actualizar venta_diaria
echo "[2/4] Procesar CSV..." | tee -a "$LOG"
node src/lib/procesar-csv.cjs --fecha="$FECHA" --modo=venta 2>&1 | tee -a "$LOG"

# 3. Procesar retiros, pagos, otros movimientos, reserva
echo "[3/4] Procesar día..." | tee -a "$LOG"
PLAYWRIGHT_BROWSERS_PATH=/home/jsanz/.cache/ms-playwright \
  node src/lib/procesar-dia.cjs --fecha "$FECHA" 2>&1 | tee -a "$LOG"

# 4. Recalcular totales
echo "[4/4] Recalcular venta..." | tee -a "$LOG"
node src/lib/recalcular-venta.cjs --fecha "$FECHA" --todas 2>&1 | tee -a "$LOG"

echo "=== Fin $(date) ===" | tee -a "$LOG"

cat "$LOG"
