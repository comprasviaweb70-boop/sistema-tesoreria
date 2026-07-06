/**
 * Mantiene un running balance de denominaciones de la RESERVA (tesorería).
 * 
 * AHORA: init() lee desde saldos_diarios (día anterior) en vez de
 * sumar todo el histórico de reserva_movimientos.
 * 
 * La tabla saldos_diarios se actualiza automáticamente vía trigger
 * cada vez que se modifica reserva_movimientos.
 * 
 * Uso: const pool = new PoolReserva();
 *      await pool.init(fecha);   // lee saldo del día anterior
 *      const denom = pool.distribuir(monto);
 *      pool.sumarIngreso(denom);
 *      pool.restarEgreso(denom);
 */
require('dotenv').config();
const KEY = process.env.SUPABASE_SERVICE_KEY;
const URL = process.env.VITE_SUPABASE_URL;
const hdrs = { apikey: KEY, 'Authorization': 'Bearer ' + KEY };

const { parseDenominaciones } = require('./parse-denominaciones.cjs');

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

class PoolReserva {
  constructor() {
    this.pool = emptyDenom();
    this.totalPool = 0;
    this.inicializado = false;
  }

  /**
   * Inicializa el pool desde saldos_diarios del día anterior.
   * La tabla saldos_diarios se actualiza automáticamente vía trigger
   * ante cualquier cambio en reserva_movimientos.
   * 
   * @param {string} fechaHoy - Fecha a procesar YYYY-MM-DD
   */
  async init(fechaHoy) {
    const fechaParts = fechaHoy.split('-').map(Number);
    const d = new Date(fechaParts[0], fechaParts[1] - 1, fechaParts[2]);
    d.setDate(d.getDate() - 1);
    const diaAnterior = d.toISOString().split('T')[0];
    
    console.log(`\nLeyendo saldo de ${diaAnterior} desde saldos_diarios...`);
    
    const r = await fetch(
      `${URL}/rest/v1/saldos_diarios?fecha=eq.${diaAnterior}&select=${DENOM_KEYS.join(',')}`,
      { headers: hdrs }
    );
    const rows = await r.json();
    
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`  ⚠️ No hay saldo registrado para ${diaAnterior}, usando pool vacío`);
      this.inicializado = true;
      return;
    }
    
    const saldo = rows[0];
    for (const key of DENOM_KEYS) {
      this.pool[key] = saldo[key] || 0;
    }
    this.totalPool = DENOM_KEYS.reduce((a, k) => a + this.pool[k], 0);
    this.inicializado = true;
    
    const activas = DENOM_KEYS.filter(k => this.pool[k] > 0);
    console.log(`  ✅ Pool desde ${diaAnterior}: $${this.totalPool.toLocaleString('es-CL')}`);
    if (activas.length > 0) {
      console.log(`     ${activas.map(k => `${k}=${(this.pool[k]/1000).toFixed(0)}k`).join(', ')}`);
    }
  }

  /**
   * Distribuye un monto desde el pool disponible de la Reserva.
   * Usa denominaciones disponibles en orden descendente.
   * NO inventa denominaciones — solo devuelve lo que hay en el pool.
   * 
   * @param {number} monto - Monto a distribuir
   * @param {string} descripcion - Para logging
   * @param {string} observacion - Observación del movimiento (opcional)
   * @returns {object} Denominaciones { b20k, b10k, ... }
   */
  distribuir(monto, descripcion = '', observacion = '') {
    console.log(`  🔄 Reserva da $${monto.toLocaleString('es-CL')}${descripcion ? ` (${descripcion})` : ''}`);
    
    const r = emptyDenom();
    let restante = monto;
    
    if (!this.inicializado) {
      console.log(`  ⚠️ Reserva no inicializada — no hay denominaciones disponibles`);
      return r;
    }
    
    // Mínimos para monedas
    const MINIMOS_MONEDAS = {
      m500: 10000,
      m100: 5000,
      m50: 2000,
      m10: 500
    };
    
    // Primero intentar parsear la observación para ver si menciona denominaciones específicas
    if (observacion) {
      const parsed = parseDenominaciones(observacion, monto);
      if (parsed) {
        console.log(`    📝 Observación parseada: ${observacion.substring(0, 50)}`);
        
        // Aviso: si el detalle digitado no cubre el monto total explícitamente
        // (parseDenominaciones ya autocompletó matemáticamente la diferencia)
        if (typeof parsed._explicitTotal === 'number' && parsed._explicitTotal < monto) {
          console.log(`    ⚠️ DETALLE INCOMPLETO: el cajero digitó $${parsed._explicitTotal.toLocaleString('es-CL')} de $${monto.toLocaleString('es-CL')} — faltan $${(monto - parsed._explicitTotal).toLocaleString('es-CL')}, completado automáticamente. Revisar digitación.`);
        }

        // Usar las denominaciones parseadas, pero respetando mínimos para monedas y disponibilidad del pool
        for (const key of DENOM_KEYS) {
          const montoDenom = parsed[key] || 0;
          if (montoDenom <= 0) continue;
          
          const disponible = this.pool[key] || 0;
          
          // Verificar mínimo para monedas
          if (key.startsWith('m') && montoDenom < MINIMOS_MONEDAS[key]) {
            console.log(`    ⚠️ ${key}: $${montoDenom.toLocaleString('es-CL')} menor al mínimo ($${MINIMOS_MONEDAS[key].toLocaleString('es-CL')}) — se ignora`);
            continue;
          }
          
          // Usar lo disponible (no más de lo que hay en el pool)
          const usar = Math.min(disponible, montoDenom);
          if (usar > 0) {
            r[key] = (r[key] || 0) + usar;
            restante -= usar;
            console.log(`    ${key}: -$${(usar/1000).toFixed(0)}k (disponible $${(disponible/1000).toFixed(0)}k)`);
          }
          if (usar < montoDenom) {
            console.log(`    ⚠️ ${key}: el detalle pedía $${montoDenom.toLocaleString('es-CL')} pero solo había $${disponible.toLocaleString('es-CL')} disponible — se usará otra denominación para cubrir la diferencia.`);
          }
        }
        
        // Si se pudo distribuir todo, retornar
        if (restante <= 0) return r;
        
        console.log(`    ⚠️ Parse incompleto, faltan $${restante.toLocaleString('es-CL')} — usando lógica automática`);
      }
    }
    
    // Lógica automática: distribuir desde pool respetando mínimos
    for (const { key, val } of DENOM_ORDER) {
      if (restante <= 0) break;
      const disponible = Math.max(0, (this.pool[key] || 0) - (r[key] || 0));
      if (disponible <= 0) continue;
      
      // Verificar mínimo para monedas
      if (key.startsWith('m') && val < MINIMOS_MONEDAS[key]) {
        // Saltar si el monto restante es menor al mínimo
        if (restante < MINIMOS_MONEDAS[key]) continue;
      }
      
      const maxNecesario = Math.floor(restante / val) * val;
      const usar = Math.min(disponible, maxNecesario);
      
      if (usar > 0) {
        r[key] = (r[key] || 0) + usar;
        restante -= usar;
        console.log(`    ${key}: -$${(usar/1000).toFixed(0)}k (disponible $${(disponible/1000).toFixed(0)}k)`);
      }
    }
    
    if (restante > 0) {
      console.log(`  ❌ Reserva insuficiente: solo cubre $${(monto-restante).toLocaleString('es-CL')} de $${monto.toLocaleString('es-CL')}, faltan $${restante.toLocaleString('es-CL')}`);
    }
    
    return r;
  }

  /**
   * Suma denominaciones al pool (después de un retiro preventivo).
   */
  sumarIngreso(denom) {
    let suma = 0;
    const detalles = [];
    for (const key of DENOM_KEYS) {
      const val = denom[key] || 0;
      if (val > 0) {
        this.pool[key] = (this.pool[key] || 0) + val;
        suma += val;
        detalles.push(`${key}+=${(val/1000).toFixed(0)}k`);
      }
    }
    this.totalPool = DENOM_KEYS.reduce((a, k) => a + this.pool[k], 0);
    if (detalles.length > 0) {
      console.log(`  🏦 Reserva +$${suma.toLocaleString('es-CL')} → total $${this.totalPool.toLocaleString('es-CL')} [${detalles.join(', ')}]`);
    }
  }

  /**
   * Resta denominaciones del pool (después de un egreso a caja).
   */
  restarEgreso(denom) {
    let suma = 0;
    const detalles = [];
    for (const key of DENOM_KEYS) {
      const val = denom[key] || 0;
      if (val > 0) {
        this.pool[key] = Math.max(0, (this.pool[key] || 0) - val);
        suma += val;
        detalles.push(`${key}-=${(val/1000).toFixed(0)}k`);
      }
    }
    this.totalPool = DENOM_KEYS.reduce((a, k) => a + this.pool[k], 0);
    if (detalles.length > 0) {
      console.log(`  🏦 Reserva -$${suma.toLocaleString('es-CL')} → total $${this.totalPool.toLocaleString('es-CL')} [${detalles.join(', ')}]`);
    }
  }

  /**
   * Estado actual de la Reserva.
   */
  estado() {
    const activas = DENOM_KEYS.filter(k => this.pool[k] > 0);
    return {
      pool: { ...this.pool },
      total: this.totalPool,
      activas: activas.length > 0
        ? activas.map(k => `${k}=${(this.pool[k]/1000).toFixed(0)}k`).join(', ')
        : 'vacía'
    };
  }
}

module.exports = { PoolReserva, emptyDenom, DENOM_KEYS, DENOM_ORDER };
