/**
 * Detecta fechas pendientes de sincronización.
 * Busca el saldo más reciente en saldos_diarios y devuelve los días
 * entre ese saldo y "ayer" (excluyendo el día del saldo, incluyendo ayer).
 * Salida: JSON array de fechas YYYY-MM-DD en orden cronológico.
 */
require('dotenv').config();

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const hdrs = { apikey: KEY, 'Authorization': 'Bearer ' + KEY };

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

async function getUltimoSaldo() {
  const r = await fetch(
    `${URL}/rest/v1/saldos_diarios?select=fecha&order=fecha.desc&limit=1`,
    { headers: hdrs }
  );
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0].fecha;
}

async function main() {
  const ayer = process.argv[2] || getFechaAyer();
  const ultimoSaldo = await getUltimoSaldo();

  if (!ultimoSaldo) {
    console.log(JSON.stringify([ayer]));
    return;
  }

  // Si ayer ya tiene saldo, no hay nada pendiente
  if (ultimoSaldo >= ayer) {
    console.log(JSON.stringify([]));
    return;
  }

  const pendientes = [];
  let fecha = addDays(ultimoSaldo, 1);
  while (fecha <= ayer) {
    pendientes.push(fecha);
    fecha = addDays(fecha, 1);
  }

  console.log(JSON.stringify(pendientes));
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
