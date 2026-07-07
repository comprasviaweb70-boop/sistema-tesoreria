require('dotenv').config();
const { customSupabaseClient } = require('./customSupabaseClient.cjs');
const { getCashBoxes, getCashBoxTurns, headers } = require('./bsaleApi.cjs');

const API_BASE = process.env.BSALE_API_BASE || 'https://api.bsale.io';
const API_KEY = process.env.BSALE_API_KEY;

if (!API_KEY) {
  console.error('ERROR: BSALE_API_KEY requerida en .env');
  process.exit(1);
}
console.log('[*] Conectando a la API de BSale en:', API_BASE);

async function getTurns(cajaId, fecha) {
  const data = await getCashBoxTurns(cajaId, fecha);
  return data && data.cash_box_turns ? data.cash_box_turns : [];
}
async function getPagos(turnoId) {
  const res = await fetch(`${API_BASE}/v1/cash_box_turns/${turnoId}/forms.json`,
    { headers } );
  if (!res.ok) return [];
  const d = await res.json();
  return d && d.forms ? d.forms : [];
}
async function existsMovement(cajaId, fecha, movimientoId) {
  const { data } = await customSupabaseClient
    .from('sales_entries')
    .select('id')
    .eq('caja_id', cajaId)
    .eq('fecha', fecha)
    .eq('movimiento_id', movimientoId)
    .single();
  return !!data;
}
function mapPayment(method, amount) {
  const m = (method||'').toLowerCase();
  return {
    efectivo: m.includes('efectivo')||m==='cash'?Number(amount)||0:0,
    debito: m.includes('debito')?Number(amount)||0:0,
    credito: m.includes('credito')?Number(amount)||0:0,
    transferencia: m.includes('transferencia')?Number(amount)||0:0,
    creditoFiado: (m.includes('credito_fiado')||m.includes('credit'))?Number(amount)||0:0,
    edenred: m.includes('edenred')?Number(amount)||0:0,
    otros: !(m.includes('efectivo')||m.includes('debito')||m.includes('credito')||m.includes('transferencia')||m.includes('credito_fiado')||m.includes('edenred')) && Number(amount)||0
  };
}
function isWithdrawal(concepto) {
  if (!concepto) return false;
  const c = (concepto||'').toLowerCase();
  return c.includes('retiro')||c.includes('gasto')||c.includes('egreso')||c.includes('withdrawal');
}
async function getTurnosCaja(fecha) {
  // Cajas activas/no-cerradas para la fecha
  const cajas = await getCashBoxes();
  // según la API, una caja cerrada tiene closed_at; si no lo tiene, considerarla activa
  return cajas.filter(cb => !cb.closed_at || cb.closed_at === null);
}
async function syncDay(fecha) {
  // Por defecto: procesar el dia de ayer (fecha del sistema)
  const hoy = fecha || (() => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    return ayer.toISOString().split('T')[0];
  })();
  console.log('['+hoy+'] Iniciando sincronizacion BSale -> Sistema de Tesoreria...');
  const cajas = await getTurnosCaja(hoy);
  console.log('['+hoy+'] Cajas encontradas:', cajas.length);
  let insertados=0, actualizados=0, duplicados=0;
  for (const caja of cajas) {
    const cajaId = caja.id;
    const turns = await getTurns(cajaId, hoy);
    console.log('['+hoy+'] Turnos para caja '+cajaId+':', turns.length);
    for (const t of turns) {
      const pagos = await getPagos(t.id);
      for (const p of pagos) {
        const key = 'mov-'+p.id;
        if (await existsMovement(t.caja_id, hoy, key)) { duplicados++; continue; }
        const mm = mapPayment(p.tipo_o_medio, p.importe);
        const reg = {
          fecha:hoy,
          caja_id:t.caja_id,
          caja_nombre:t.caja_nombre,
          estado_caja:'PENDIENTE_REVISION',
          sales_cash:mm.efectivo,
          sales_card_debit:mm.debito,
          sales_card_credit:mm.credito,
          sales_transfer:mm.transferencia,
          sales_credit:mm.creditoFiado,
          sales_edenred:mm.edenred,
          other_income:mm.otros,
          cash_withdrawals: isWithdrawal(p.concepto)?Math.abs(mm.efectivo+mm.debito+mm.credito):0,
          total_sales:0,total_movements:0,
          movimiento_id:key,observaciones:'',synced:false,
          created_at:new Date().toISOString(),updated_at:new Date().toISOString()
        };
        reg.total_sales = reg.sales_cash+reg.sales_card_debit+reg.sales_card_credit+reg.sales_transfer+reg.sales_credit+reg.sales_edenred+reg.other_income;
        reg.total_movements = reg.total_sales + reg.cash_withdrawals;
        try {
          await customSupabaseClient.from('sales_entries').insert([reg]);
          insertados++;
          console.log('['+hoy+'] INSERTADO '+t.caja_id+' '+p.id);
        } catch (e) {
          await customSupabaseClient.from('sales_entries').update(reg).eq('caja_id',t.caja_id).eq('fecha',hoy).eq('movimiento_id',key);
          actualizados++;
        }
      }
    }
  }
  console.log('['+hoy+'] RESULTADO: '+insertados+' ins, '+actualizados+' act, '+duplicados+' dup');
  return {success:true,inserted:insertados,updated:actualizados,duplicated:duplicados,date:hoy};
}
module.exports = { syncDay };
