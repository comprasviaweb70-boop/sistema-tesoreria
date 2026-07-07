/**
 * Calcula las denominaciones disponibles de tesorería para una caja,
 * basado en el neto histórico de reserva_movimientos (ingresos suman, egresos restan).
 * 
 * Uso: node src/lib/saldo-anterior.cjs --test --caja <uuid>
 */
require('dotenv').config();
const KEY = process.env.SUPABASE_SERVICE_KEY;
const URL = process.env.VITE_SUPABASE_URL;
const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const DENOM_KEYS = ['b20k', 'b10k', 'b5k', 'b2k', 'b1k', 'm500', 'm100', 'm50', 'm10'];

function emptyDenom() {
  const r = {};
  DENOM_KEYS.forEach(k => r[k] = 0);
  return r;
}

/**
 * Obtiene las denominaciones disponibles de tesorería para una caja,
 * calculadas como el pool neto de reserva_movimientos antes de una fecha.
 * 
 * @param {string} cajaId - UUID de la caja
 * @param {string} hastaFecha - Fecha límite (YYYY-MM-DD), exclusiva
 * @returns {object} { b20k, b10k, ..., m10 } denominaciones disponibles
 */
async function getSaldoAnteriorDenominaciones(cajaId, hastaFecha) {
  console.log(`\n📊 Calculando pool de denominaciones para caja ${cajaId.substring(0,8)} hasta ${hastaFecha}`);
  
  const r = await fetch(`${URL}/rest/v1/reserva_movimientos?caja_id=eq.${cajaId}&fecha=lt.${hastaFecha}&select=tipo,${DENOM_KEYS.join(',')}`, {
    headers: hdrs
  });
  const movimientos = await r.json();
  
  if (!Array.isArray(movimientos) || movimientos.length === 0) {
    console.log(`  ⏭️ No hay movimientos previos, usando autoDenominacion`);
    return null;
  }
  
  // Pool neto: ingresos suman, egresos restan
  const pool = emptyDenom();
  let totalPool = 0;
  
  for (const m of movimientos) {
    for (const key of DENOM_KEYS) {
      const val = parseFloat(m[key]) || 0;
      if (m.tipo === 'ingreso') {
        pool[key] += val;
        totalPool += val;
      } else {
        pool[key] -= val;
        totalPool -= val;
      }
    }
  }
  
  // Pool con valores negativos significa que la tesorería ha dado más de lo recibido
  // En ese caso, truncar a 0 los negativos
  for (const key of DENOM_KEYS) {
    if (pool[key] < 0) {
      pool[key] = 0;
    }
  }
  
  console.log(`  Pool neto: ${DENOM_KEYS.filter(k => pool[k] > 0).map(k => `${k}=${(pool[k]/1000).toFixed(0)}k`).join(', ')}`);
  console.log(`  Total pool: $${totalPool.toLocaleString('es-CL')}`);
  
  return pool;
}

/**
 * Distribuye un monto respetando las denominaciones disponibles del pool.
 * Ordena de mayor a menor denominación, y por cada una usa:
 *   min(disponible, floor(necesitado / valor_denom) * valor_denom)
 * 
 * @param {number} monto - Monto a distribuir
 * @param {object} pool - Denominaciones disponibles { b20k, b10k, ... }
 * @returns {object} Denominaciones distribuidas
 */
function distribuirDesdePool(monto, pool) {
  const r = emptyDenom();
  let restante = monto;
  
  // Orden de denominaciones (mayor a menor)
  const orden = [
    { key: 'b20k', val: 20000 },
    { key: 'b10k', val: 10000 },
    { key: 'b5k',  val: 5000 },
    { key: 'b2k',  val: 2000 },
    { key: 'b1k',  val: 1000 },
    { key: 'm500', val: 500 },
    { key: 'm100', val: 100 },
    { key: 'm50',  val: 50 },
    { key: 'm10',  val: 10 },
  ];
  
  for (const { key, val } of orden) {
    if (restante <= 0) break;
    const disponible = pool[key] || 0;
    if (disponible <= 0) continue;
    
    // Cuánto podemos usar de esta denominación
    const maxUsar = Math.floor(restante / val) * val;
    const usar = Math.min(disponible, maxUsar);
    
    if (usar > 0) {
      r[key] = usar;
      restante -= usar;
    }
  }
  
  // Si sobra algo y no se pudo cubrir con el pool, usar autoDenominacion para el resto
  if (restante > 0 && restante < monto) {
    console.log(`  ⚠️ Restante $${restante.toLocaleString('es-CL')} no cubierto por pool`);
    const { autoDenominacion } = require('./parse-denominaciones.cjs') || {};
    // import autoDenominacion inline
  }
  
  return r;
}

// ===== TEST =====
const CAJA_UUID = '6df7849d-1d89-4db7-b044-afab16ffadb6'; // CAJA 3
const FECHA = '2026-05-19'; // Test: what's available BEFORE 19/05 for the $305k egreso

(async () => {
  const pool = await getSaldoAnteriorDenominaciones(CAJA_UUID, FECHA);
  if (pool) {
    console.log(`\n--- Test: distribuir $305,000 desde pool ---`);
    const resultado = distribuirDesdePool(305000, pool);
    const suma = Object.values(resultado).reduce((a, b) => a + b, 0);
    console.log(`Resultado: ${DENOM_KEYS.filter(k => resultado[k] > 0).map(k => `${k}=${(resultado[k]/1000).toFixed(0)}k`).join(', ')}`);
    console.log(`Suma: $${suma.toLocaleString('es-CL')}`);
    console.log(`\nEsperado: b20k=20k, b10k=240k, b5k=45k`);
    console.log(`Coincide: ${resultado.b20k === 20000 && resultado.b10k === 240000 && resultado.b5k === 45000 ? '✅ SI' : '❌ NO'}`);
  }
})().catch(e => console.error(e));
