/**
 * Mantiene un running balance de denominaciones disponibles por caja.
 * 
 * Flujo:
 * 1. Inicializa pool desde reserva_movimientos históricos
 * 2. Ingresos (caja→tesorería): SUMAN al pool
 * 3. Egresos (tesorería→caja): RESTAN del pool (distribuir desde pool, no autoDenominacion)
 * 
 * Uso: const pool = new PoolDenominaciones();
 *      await pool.init(cajaId, fecha);
 *      const denom = pool.distribuir(monto); // distribuye desde pool
 *      pool.aplicarIngreso(denom); // suma después de ingreso
 *      pool.aplicarEgreso(denom);  // resta después de egreso
 */
require('dotenv').config();
const KEY = process.env.SUPABASE_SERVICE_KEY;
const URL = process.env.VITE_SUPABASE_URL;
const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const DENOM_KEYS = ['b20k', 'b10k', 'b5k', 'b2k', 'b1k', 'm500', 'm100', 'm50', 'm10'];

const DENOM_ORDER = [
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

function emptyDenom() {
  const r = {};
  DENOM_KEYS.forEach(k => r[k] = 0);
  return r;
}

class PoolDenominaciones {
  constructor() {
    this.pool = emptyDenom();
    this.totalPool = 0;
    this.inicializado = false;
  }

  /**
   * Inicializa el pool. Si se proporciona saldoAnterior, usa esos valores exactos.
   * Si no, intenta calcular desde reserva_movimientos históricos.
   * 
   * @param {string} cajaId - UUID de la caja
   * @param {string} fechaActual - Fecha actual (YYYY-MM-DD), excluye movs de este día
   * @param {object|null} saldoAnterior - Valores manuales { b20k, b10k, b5k, ... } o null
   */
  async init(cajaId, fechaActual, saldoAnterior = null) {
    if (saldoAnterior) {
      console.log(`  📦 Pool manual para ${cajaId.substring(0,8)}: $${Object.values(saldoAnterior).reduce((a,b)=>a+b,0).toLocaleString('es-CL')}`);
      this.setPool(saldoAnterior);
      return;
    }
    
    console.log(`  📦 Calculando pool para ${cajaId.substring(0,8)} desde históricos hasta ${fechaActual}`);
    
    // Obtener todos los movimientos de días anteriores para esta caja
    const r = await fetch(
      `${URL}/rest/v1/reserva_movimientos?caja_id=eq.${cajaId}&fecha=lt.${fechaActual}&order=fecha.asc,created_at.asc&select=tipo,${DENOM_KEYS.join(',')}`,
      { headers: hdrs }
    );
    const movs = await r.json();
    
    if (!Array.isArray(movs)) {
      console.log(`  ⚠️ No se pudieron cargar movimientos históricos`);
      this.inicializado = false;
      return;
    }
    
    console.log(`  📋 ${movs.length} movimientos históricos`);
    
    // Procesar secuencialmente: ingresos SUMAN, egresos RESTAN
    for (const m of movs) {
      for (const key of DENOM_KEYS) {
        const val = parseFloat(m[key]) || 0;
        if (val > 0) {
          if (m.tipo === 'ingreso') {
            this.pool[key] += val;
            this.totalPool += val;
          } else {
            // No dejar negativo
            this.pool[key] = Math.max(0, this.pool[key] - val);
            this.totalPool -= val;
          }
        }
      }
    }
    
    // Mostrar pool resultante
    const activas = DENOM_KEYS.filter(k => this.pool[k] > 0);
    console.log(`  💰 Pool actual: ${activas.length > 0 ? activas.map(k => `${k}=${(this.pool[k]/1000).toFixed(0)}k`).join(', ') : 'vacio'}`);
    console.log(`  💵 Total pool: $${this.totalPool.toLocaleString('es-CL')}`);
    
    this.inicializado = true;
  }

  /**
   * Distribuye un monto desde el pool disponible.
   * Usa denominaciones disponibles en orden: intenta usar las del pool,
   * y completa con nueva distribución balanceada si no alcanza.
   * 
   * @param {number} monto - Monto a distribuir
   * @returns {object} Denominaciones { b20k, b10k, ... }
   */
  distribuir(monto) {
    console.log(`  🔄 Distribuyendo $${monto.toLocaleString('es-CL')} desde pool`);
    
    const r = emptyDenom();
    let restante = monto;
    
    if (!this.inicializado) {
      console.log(`  ⚠️ Pool no inicializado, usando distribución balanceada`);
      return this._distribuirBalanceado(monto);
    }
    
    // Verificar si hay denominaciones disponibles (ignorar totalPool negativo)
    const hayDisponible = DENOM_KEYS.some(k => (this.pool[k] || 0) > 0);
    if (!hayDisponible) {
      console.log(`  ⚠️ Pool vacío, usando distribución balanceada`);
      return this._distribuirBalanceado(monto);
    }
    
    // Paso 1: Intentar usar denominaciones disponibles del pool
    // Orden: de mayor a menor denominación
    for (const { key, val } of DENOM_ORDER) {
      if (restante <= 0) break;
      const disponible = this.pool[key] || 0;
      if (disponible <= 0) continue;
      
      // Cuánto necesitamos de esta denominación
      const maxNecesario = Math.floor(restante / val) * val;
      const usar = Math.min(disponible, maxNecesario);
      
      if (usar > 0) {
        // Usar en múltiplos enteros de la denominación
        const cant = Math.floor(usar / val) * val;
        if (cant > 0) {
          r[key] = (r[key] || 0) + cant;
          restante -= cant;
          console.log(`    ${key}: -${(cant/1000).toFixed(0)}k (pool tenía ${(disponible/1000).toFixed(0)}k)`);
        }
      }
    }
    
    // Paso 2: Si sobra, distribuir balanceado
    if (restante > 0) {
      console.log(`  ⚠️ Pool insuficiente: faltan $${restante.toLocaleString('es-CL')}`);
      const extra = this._distribuirBalanceado(restante);
      for (const key of DENOM_KEYS) {
        if (extra[key] > 0) {
          r[key] = (r[key] || 0) + extra[key];
          console.log(`    ${key} (extra): +${(extra[key]/1000).toFixed(0)}k`);
        }
      }
    }
    
    const suma = DENOM_KEYS.reduce((a, k) => a + (r[k] || 0), 0);
    console.log(`  ✅ Distribuido: $${suma.toLocaleString('es-CL')} (target $${monto.toLocaleString('es-CL')})`);
    
    return r;
  }

  /**
   * Distribución balanceada (fallback cuando no hay pool):
   - Solo 1 billete de $20k
   - Maximizar $10k con resto divisible por $5k
   - $5k para remainder
   */
  _distribuirBalanceado(monto) {
    const r = emptyDenom();
    let rest = monto;
    
    // Paso 1: intentar SIN $20k primero (minimizar b20k al máximo)
    // Solo usar b20k si es necesario para que el resto sea divisible por $5k
    r.b20k = 0;
    
    // Paso 2: maximizar $10k donde el resto sea múltiplo de $5k
    if (rest >= 10000) {
      let max10k = Math.floor(rest / 10000);
      // Buscar la cantidad que deje resto divisible por $5k
      while (max10k >= 0) {
        const restoCon10k = rest - (max10k * 10000);
        if (restoCon10k % 5000 === 0) {
          r.b10k = max10k * 10000;
          rest -= r.b10k;
          break;
        }
        max10k--;
      }
    }
    
    // Si después de $10k y $5k aún sobra, intentar con 1 × $20k
    // (solo si el resto no es múltiplo de $5k o $1k)
    if (rest > 0 && rest >= 20000) {
      // Verificar si agregar un b20k mejora la distribución
      // (reduce el número de billetes pequeños necesarios)
      const pruebaCon20k = rest - 20000;
      const max10kCon20k = Math.floor(pruebaCon20k / 10000);
      // Solo usar b20k si ayuda con la divisibilidad
      for (let n10k = max10kCon20k; n10k >= 0; n10k--) {
        const restante = pruebaCon20k - (n10k * 10000);
        if (restante % 5000 === 0) {
          r.b20k = 20000;
          r.b10k = (r.b10k || 0) + (n10k * 10000);
          rest = restante;
          break;
        }
      }
    }
    
    // Paso 3: $5k para el resto
    if (rest >= 5000) {
      r.b5k = Math.floor(rest / 5000) * 5000;
      rest -= r.b5k;
    }
    
    // Paso 4: denominaciones menores
    for (const { key, val } of DENOM_ORDER.slice(3)) {
      if (rest <= 0) break;
      const cant = Math.floor(rest / val);
      if (cant > 0) { r[key] = cant * val; rest -= cant * val; }
    }
    
    return r;
  }

  /**
   * Aplica un ingreso (caja→tesorería): SUMA al pool.
   */
  aplicarIngreso(denom) {
    for (const key of DENOM_KEYS) {
      const val = denom[key] || 0;
      if (val > 0) {
        this.pool[key] = (this.pool[key] || 0) + val;
        this.totalPool += val;
      }
    }
  }

  /**
   * Aplica un egreso (tesorería→caja): RESTA del pool.
   */
  aplicarEgreso(denom) {
    for (const key of DENOM_KEYS) {
      const val = denom[key] || 0;
      if (val > 0) {
        this.pool[key] = Math.max(0, (this.pool[key] || 0) - val);
        this.totalPool -= val;
      }
    }
  }

  /**
   * Obtiene el estado actual del pool.
   */
  estado() {
    const activas = DENOM_KEYS.filter(k => this.pool[k] > 0);
    return {
      pool: { ...this.pool },
      total: this.totalPool,
      activas: activas.length > 0 ? activas.map(k => `${k}=${(this.pool[k]/1000).toFixed(0)}k`).join(', ') : 'vacio'
    };
  }

  /**
   * Establece el pool directamente (para pruebas o inicialización forzada).
   */
  setPool(denom) {
    for (const key of DENOM_KEYS) {
      this.pool[key] = denom[key] || 0;
    }
    this.totalPool = DENOM_KEYS.reduce((a, k) => a + this.pool[k], 0);
    this.inicializado = true;
  }
}

// ===== TEST CON DATOS REALES =====
if (require.main === module) {
  const FECHA = process.argv.find(a => a.startsWith('--fecha='))?.split('=')[1] || '2026-05-19';
  const CAJA_ID = process.argv.find(a => a.startsWith('--caja='))?.split('=')[1] || '6df7849d-1d89-4db7-b044-afab16ffadb6';
  
  (async () => {
    const pool = new PoolDenominaciones();
    await pool.init(CAJA_ID, FECHA);
    
    console.log(`\n--- Distribuyendo $305,000 ---`);
    const resultado = pool.distribuir(305000);
    console.log('Resultado:', DENOM_KEYS.filter(k => resultado[k] > 0).map(k => `${k}=${(resultado[k]/1000).toFixed(0)}k`).join(', '));
    const suma = DENOM_KEYS.reduce((a, k) => a + (resultado[k] || 0), 0);
    console.log(`Suma: $${suma.toLocaleString('es-CL')}`);
    console.log(`\nEsperado: b20k=20k, b10k=240k, b5k=45k`);
    
    // Verificar
    const ok = resultado.b20k === 20000 && resultado.b10k === 240000 && resultado.b5k === 45000;
    console.log(`Coincide: ${ok ? '✅ SI' : '❌ NO'}`);
    
    console.log(`\n--- Pool después de egreso ---`);
    pool.aplicarEgreso(resultado);
    console.log(pool.estado());
  })().catch(e => console.error(e));
}

module.exports = { PoolDenominaciones, emptyDenom, DENOM_KEYS, DENOM_ORDER };
