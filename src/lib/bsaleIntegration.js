/**
 * Integración BSale → Sistema de Tesorería
 * Ubicación: C:\Users\jsanz\Desktop\Antigravity\Sistema de Tesoreria
 * 
 * Extrae movimientos diarios de cajas desde la API de BSale y los importa
 * al módulo de Venta Diaria del sistema (tabla: sales_entries o daily_sales).
 * 
 * REGLAS DE NEGOCIO:
 * 1. Las cajas se importan como "ABIERTO" o "PENDIENTE_REVISION" (NUNCA se cierran automáticamente).
 * 2. Se evitan duplicados por fecha + caja + movimiento_id.
 * 3. Mapeo estricto de tipos de pago de BSale a campos del sistema.
 */

const { realSupabase } = require('../supabaseClient.js');

const API_BASE = process.env.BSALE_API_BASE || 'https://api.bsale.com.co';
const API_KEY = process.env.BSALE_API_KEY;
if (!API_KEY) {
  console.error('ERROR: BSALE_API_KEY no está definida. Copia .env.example a .env y configura la clave.');
  process.exit(1);
}

const DAILY_TABLE = 'sales_entries';

async function getTurns(cajaId, fecha) {
  const res = await fetch(`${API_BASE}/api/v1/cajas/${cajaId}/turnos?fecha=${fecha}`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  if (!res.ok) throw new Error(`Turnos error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getPaymentMethods(turnoId) {
  const res = await fetch(`${API_BASE}/api/v1/turnos/${turnoId}/formas-pago`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  if (!res.ok) throw new Error(`Pagos error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function existsMovement(cajaId, fecha, movimientoId) {
  const { data } = await realSupabase
    .from(DAILY_TABLE)
    .select('id')
    .eq('caja_id', cajaId)
    .eq('fecha', fecha)
    .eq('movimiento_id', movimientoId)
    .single();
  return !!(data && data.id);
}

function mapPayment(method, amount) {
  const m = (method || '').toLowerCase();
  let efectivo = 0, tarjetaDebito = 0, tarjetaCredito = 0, transferencia = 0, credito = 0, edenred = 0, otros = 0;
  if (m.includes('efectivo') || m === 'cash') efectivo = Number(amount) || 0;
  else if (m.includes('debito') || m.includes('tarjeta_debito')) tarjetaDebito = Number(amount) || 0;
  else if (m.includes('credito') || m.includes('tarjeta_credito')) tarjetaCredito = Number(amount) || 0;
  else if (m.includes('transferencia') || m === 'transfer') transferencia = Number(amount) || 0;
  else if (m.includes('credito_fiado') || m === 'credit') credito = Number(amount) || 0;
  else if (m.includes('edenred')) edenred = Number(amount) || 0;
  else otros = Number(amount) || 0;
  return { efectivo, tarjetaDebito, tarjetaCredito, transferencia, credito, edenred, otros };
}

function isWithdrawal(concept) {
  if (!concept) return false;
  const c = (concept || '').toLowerCase();
  return c.includes('retiro') || c.includes('gasto') || c.includes('egreso') || c.includes('withdrawal');
}

async function syncDay(fecha) {
  // Por defecto: procesar el dia de ayer (fecha del sistema)
  const hoy = fecha || (() => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    return ayer.toISOString().split('T')[0];
  })();
  console.log(`[${hoy}] Iniciando sincronización BSale → ${DAILY_TABLE}`);

  const turns = await getTurnosCajaActivos(); // implementar: llama a la API de turnos para el rango
  console.log(`[${hoy}] Encontrados ${turns.length} turnos para sincronizar`);

  let insertados = 0, actualizados = 0, duplicados = 0;

  for (const t of turns) {
    const pagos = await getPaymentMethods(t.id);
    for (const p of pagos) {
      const key = `mov-${p.id}`;
      if (await existsMovement(t.caja_id, hoy, key)) { duplicados++; continue; }

      const m = mapPayment(p.tipo_o_medio, p.importe);
      const reg = {
        fecha: hoy,
        caja_id: t.caja_id,
        caja_nombre: t.caja_nombre,
        estado_caja: 'PENDIENTE_REVISION',
        sales_cash: m.efectivo,
        sales_card_debit: m.tarjetaDebito,
        sales_card_credit: m.tarjetaCredito,
        sales_transfer: m.transferencia,
        sales_credit: m.credito,
        sales_edenred: m.edenred,
        other_income: m.otros,
        cash_withdrawals: isWithdrawal(p.concepto) ? Math.abs(m.efectivo + m.tarjetaDebito + m.tarjetaCredito) : 0,
        total_sales: 0, // se recalculará abajo
        total_movements: 0,
        movimientos_id: key,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      reg.total_sales = reg.sales_cash + reg.sales_card_debit + reg.sales_card_credit + reg.sales_transfer + reg.sales_credit + reg.sales_edenred + reg.other_income;
      reg.total_movements = reg.cash_withdrawals > 0 ? reg.total_sales + reg.cash_withdrawals : reg.total_sales;

      try {
        await realSupabase.from(DAILY_TABLE).insert([reg]);
        insertados++;
        console.log(`[${hoy}] Insertado caja ${t.caja_id} — movimiento ${p.id}`);
      } catch (e) {
        // Si falla por duplicado (race condition), actualizar
        await realSupabase.from(DAILY_TABLE).update(reg).eq('caja_id', t.caja_id).eq('fecha', hoy).eq('movimiento_id', key);
        actualizados++;
      }
    }
  }

  console.log(`[${hoy}] Finalizado: ${insertados} insertados, ${actualizados} actualizados, ${duplicados} duplicados`);
  return { success: true, inserted: insertados, updated: actualizados, duplicated: duplicados, date: hoy };
}

async function getTurnosCajaActivos(fechaPipeline) {
  // Obtener turnos de caja abiertos/pendientes del día (usa fecha del pipeline)
  const fecha = fechaPipeline || (() => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    return ayer.toISOString().split('T')[0];
  })();
  const res = await fetch(`${API_BASE}/api/v1/turnos-caja?estado=abierto&fecha=${fecha}`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  if (!res.ok) { console.warn('Sin turnos abiertos o error al consultar turnos, se intenta rango de 7 días');
    const desde = new Date(); desde.setDate(desde.getDate() - 7);
    const r = await fetch(`${API_BASE}/api/v1/turnos-caja/rango?inicio=${desde.toISOString().split('T')[0]}&fin=${fecha}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    if (!r.ok) throw new Error('No se pudieron obtener turnos de caja');
    const data = await r.json();
    return data.data || [];
  }
  return res.data || [];
}

// Ejecutar desde consola: node -e "require('./integracion-bsale.js').syncDay()"
// Programar con node-cron: cron.schedule('0 2 * * *', () => syncDay().then(console.log).catch(console.error));

module.exports = { syncDay, mapPayment, existsMovement };
