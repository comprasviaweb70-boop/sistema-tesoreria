/**
 * Detecta fechas pendientes de sincronización.
 * Revisa una ventana de 3 días (ayer-2 a ayer) verificando si el pipeline
 * ya insertó datos reales en venta_diaria (total_ventas > 0).
 * Los días sin datos reales se consideran pendientes.
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
    `${URL}/rest/v1/venta_diaria?fecha=eq.${fecha}&total_ventas=gt.0&select=id&limit=1`,
    { headers: hdrs }
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
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
