/**
 * Detecta fechas pendientes de sincronización.
 * Revisa una ventana de 3 días (ayer-2 a ayer) verificando si el pipeline
 * ya insertó datos granulares en venta_diaria (retiros_efectivo > 0).
 * Un día puede tener total_ventas > 0 (paso 2: CSV) pero aún faltan los
 * datos granulares (pasos 3-4: procesar-dia + recalcular).
 * Los días sin datos granulares se consideran pendientes.
 * Salida: JSON array de fechas YYYY-MM-DD en orden cronológico.
 */
require('dotenv').config();

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const hdrs = { apikey: KEY, 'Authorization': 'Bearer ' + KEY };

const VENTANA = 3;

function getFechaAyer() {
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  return ayer.toISOString().split('T')[0];
}

function addDays(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + dias);
  return date.toISOString().split('T')[0];
}

async function diaProcesado(fecha) {
  const r = await fetch(
    `${URL}/rest/v1/venta_diaria?fecha=eq.${fecha}&select=retiros_efectivo,pago_facturas_caja,gastos_rrhh,traspaso_tesoreria_egreso&limit=10`,
    { headers: hdrs }
  );
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return false;
  // Verificar que al menos una fila tenga datos granulares
  return rows.some(row =>
    (row.retiros_efectivo || 0) > 0 ||
    (row.pago_facturas_caja || 0) > 0 ||
    (row.gastos_rrhh || 0) > 0 ||
    (row.traspaso_tesoreria_egreso || 0) > 0
  );
}

async function main() {
  const ayer = process.argv[2] || getFechaAyer();
  const pendientes = [];

  for (let i = VENTANA - 1; i >= 0; i--) {
    const fecha = addDays(ayer, -i);
    const procesado = await diaProcesado(fecha);
    if (!procesado) {
      pendientes.push(fecha);
    }
  }

  console.log(JSON.stringify(pendientes));
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
