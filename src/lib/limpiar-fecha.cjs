#!/usr/bin/env node
/**
 * Limpia todos los datos de una fecha específica para permitir re-sincronización.
 * Borra de: venta_diaria, reserva_movimientos, otros_movimientos, pagos_proveedor
 *
 * Uso: node src/lib/limpiar-fecha.cjs --fecha 2026-06-29
 */
require('dotenv').config();
const KEY = process.env.SUPABASE_SERVICE_KEY;
const URL = process.env.VITE_SUPABASE_URL;

const args = process.argv.slice(2);
let FECHA = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--fecha') FECHA = args[++i];
  else if (args[i].startsWith('--fecha=')) FECHA = args[i].split('=')[1];
}

if (!FECHA) { console.error('Uso: --fecha YYYY-MM-DD'); process.exit(1); }
if (!URL || !KEY) { console.error('ERROR: VITE_SUPABASE_URL y SUPABASE_SERVICE_KEY requeridas'); process.exit(1); }

const hdrs = {
  apikey: KEY,
  Authorization: 'Bearer ' + KEY,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal'
};

async function del(table, params) {
  const url = `${URL}/rest/v1/${table}?${params}`;
  const r = await fetch(url, { method: 'DELETE', headers: hdrs });
  return r.status;
}

(async () => {
  console.log(`\n🧹 Limpiando datos para ${FECHA}...\n`);

  const s1 = await del('venta_diaria', `fecha=eq.${FECHA}`);
  console.log(`  venta_diaria          DELETE ${s1 >= 200 && s1 < 300 ? '✅' : '⚠️ ' + s1}`);

  const s2 = await del('reserva_movimientos', `fecha=eq.${FECHA}`);
  console.log(`  reserva_movimientos   DELETE ${s2 >= 200 && s2 < 300 ? '✅' : '⚠️ ' + s2}`);

  const s3 = await del('otros_movimientos', `fecha=eq.${FECHA}`);
  console.log(`  otros_movimientos     DELETE ${s3 >= 200 && s3 < 300 ? '✅' : '⚠️ ' + s3}`);

  const s4 = await del('pagos_proveedor', `fecha_pago=eq.${FECHA}`);
  console.log(`  pagos_proveedor       DELETE ${s4 >= 200 && s4 < 300 ? '✅' : '⚠️ ' + s4}`);

  console.log('\n✅ Limpieza completada. Puedes re-ejecutar el pipeline.');
})().catch(e => { console.error(e); process.exit(1); });
