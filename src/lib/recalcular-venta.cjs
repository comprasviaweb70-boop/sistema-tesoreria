/**
 * Helper: recalcula venta_diaria desde los modulos (misma logica que la app)
 * 
 * Reemplaza el PATCH manual y los triggers incorrectos.
 * Uso: node recalcular-venta.cjs --fecha 2026-05-19 --caja <uuid> --turno <turno>
 *      node recalcular-venta.cjs --fecha 2026-05-19 --todas
 */
require('dotenv').config();
const KEY = process.env.SUPABASE_SERVICE_KEY;
const URL = process.env.VITE_SUPABASE_URL;
const hdrs = {
  apikey: KEY,
  Authorization: 'Bearer ' + KEY
};

const args = process.argv.slice(2);
const FECHA = (() => {
  if (args.includes('--fecha')) return args[args.indexOf('--fecha')+1];
  // Por defecto: procesar el dia de ayer (fecha del sistema)
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  return ayer.toISOString().split('T')[0];
})();
const CAJA_ID = args.includes('--caja') ? args[args.indexOf('--caja')+1] : null;
const TODAS = args.includes('--todas');

// UUIDs de categorias: nombre → id
let CAT_MAP = {};

async function loadCategorias() {
  const r = await fetch(`${URL}/rest/v1/categorias_movimiento?select=id,nombre`, { headers: hdrs });
  const d = await r.json();
  d.forEach(c => { CAT_MAP[c.id] = c.nombre; });
}

async function recalcularCaja(fecha, turno, cajaId) {
  // 1. Reserva movimientos
  const r1 = await fetch(`${URL}/rest/v1/reserva_movimientos?fecha=eq.${fecha}&turno=eq.${turno}&caja_id=eq.${cajaId}&select=tipo,monto_total`, { headers: hdrs });
  const reservas = await r1.json();
  const sumReservaIngreso = (reservas||[]).filter(m => m.tipo === 'egreso').reduce((a,m) => a + (parseFloat(m.monto_total)||0), 0);
  const sumReservaEgreso  = (reservas||[]).filter(m => m.tipo === 'ingreso').reduce((a,m) => a + (parseFloat(m.monto_total)||0), 0);

  // 2. Otros movimientos
  const r2 = await fetch(`${URL}/rest/v1/otros_movimientos?fecha=eq.${fecha}&turno=eq.${turno}&caja_id=eq.${cajaId}&select=tipo,monto,categoria_id`, { headers: hdrs });
  const otros = await r2.json();

  let ingresos_efectivo = 0, gastos_rrhh = 0, servicios = 0, gastos = 0, otros_egresos = 0;
  let ajuste_venta_efectivo = 0, ajuste_redelcom = 0; // Ajustes por corrección de boleta
  let trasp_ing = sumReservaIngreso, trasp_egr = sumReservaEgreso;

  (otros||[]).forEach(m => {
    const monto = parseFloat(m.monto) || 0;
    const catName = (CAT_MAP[m.categoria_id] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Correcciones de boleta: ajustar venta_efectivo y redelcom, NO incluir en retiros
    // "Débito por Efectivo" (egreso): el débito es lo real → bajar efectivo, subir débito
    if (m.tipo === 'egreso' && catName.includes('debito por efectivo')) {
      ajuste_venta_efectivo -= monto;
      ajuste_redelcom += monto;
      return;
    }
    // "Efectivo por Débito" (ingreso): el efectivo es lo real → subir efectivo, bajar débito
    if (m.tipo === 'ingreso' && catName.includes('efectivo por debito')) {
      ajuste_venta_efectivo += monto;
      ajuste_redelcom -= monto;
      return;
    }
    
    if (m.tipo === 'ingreso') {
      if (catName.startsWith('traspaso')) trasp_ing += monto;
      else if (!catName.includes('varios')) ingresos_efectivo += monto;
    } else {
      if (catName.startsWith('rrhh')) gastos_rrhh += monto;
      else if (catName.startsWith('servicio') || catName.includes('servicios básicos')) servicios += monto;
      else if (catName.startsWith('gasto') || catName.includes('financieros') || catName.includes('crédito') || catName.includes('insumos')) gastos += monto;
      else if (catName.startsWith('traspaso')) trasp_egr += monto;
      else otros_egresos += monto;
    }
  });

  // 3. Pagos proveedor
  const r3 = await fetch(`${URL}/rest/v1/pagos_proveedor?fecha_pago=eq.${fecha}&turno=eq.${turno}&caja_id=eq.${cajaId}&select=monto_pagado,origen_fondos`, { headers: hdrs });
  const pagos = await r3.json();
  const pagCaja = (pagos||[]).filter(p => (p.origen_fondos||'').toLowerCase().trim() === 'caja' || (p.origen_fondos||'').toLowerCase().trim() === 'efectivo')
    .reduce((a,p) => a + (parseFloat(p.monto_pagado)||0), 0);
  const pagCC = (pagos||[]).filter(p => (p.origen_fondos||'').toLowerCase().includes('cuenta_corriente'))
    .reduce((a,p) => a + (parseFloat(p.monto_pagado)||0), 0);

  // 4. Leer venta_efectivo y redelcom actuales para aplicar ajustes
  let venta_efectivo_actual = 0, redelcom_actual = 0;
  try {
    const rV = await fetch(`${URL}/rest/v1/venta_diaria?caja_id=eq.${cajaId}&fecha=eq.${fecha}&select=venta_efectivo,redelcom`, { headers: hdrs });
    const vData = await rV.json();
    if (vData[0]) {
      venta_efectivo_actual = parseInt(vData[0].venta_efectivo) || 0;
      redelcom_actual = parseInt(vData[0].redelcom) || 0;
    }
  } catch (e) { /* ignorar */ }

  // 5. Calcular retiros_efectivo = suma de egresos de todos los modulos
  const retiros_efectivo = pagCaja + trasp_egr + gastos_rrhh + servicios + gastos + otros_egresos;

  // 6. Corrección de boleta: integrar el delta en venta_efectivo/redelcom antes del PATCH
  // correccion_boletas se guarda como 0 porque el ajuste ya está en las partidas operativas
  if (ajuste_venta_efectivo !== 0 || ajuste_redelcom !== 0) {
    venta_efectivo_actual += ajuste_venta_efectivo;
    redelcom_actual += ajuste_redelcom;
    console.log(`    📋 Corrección boleta: venta_efectivo ${ajuste_venta_efectivo >= 0 ? '+' : ''}${ajuste_venta_efectivo.toLocaleString('es-CL')}, redelcom ${ajuste_redelcom >= 0 ? '+' : ''}${ajuste_redelcom.toLocaleString('es-CL')}`);
  }

  // 7. UPDATE venta_diaria (único PATCH)
  const body = {
    ingresos_efectivo,
    traspaso_tesoreria_ingreso: trasp_ing,
    traspaso_tesoreria_egreso: trasp_egr,
    gastos_rrhh,
    servicios,
    gastos,
    otros_egresos,
    pago_facturas_caja: pagCaja,
    pago_facturas_cc: pagCC,
    venta_efectivo: venta_efectivo_actual,
    redelcom: redelcom_actual,
    correccion_boletas: 0,
    retiros_efectivo
  };

  const r4 = await fetch(`${URL}/rest/v1/venta_diaria?caja_id=eq.${cajaId}&fecha=eq.${fecha}`, {
    method: 'PATCH',
    headers: { ...hdrs, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  return { status: r4.status, body, ajustes: { venta_efectivo: ajuste_venta_efectivo, redelcom: ajuste_redelcom }, reservas: (reservas||[]).length, otros: (otros||[]).length, pagos: (pagos||[]).length };
}

(async () => {
  await loadCategorias();
  console.log(`Categorias cargadas: ${Object.keys(CAT_MAP).length}`);

  if (CAJA_ID) {
    // Averiguar turno desde venta_diaria
    const r = await fetch(`${URL}/rest/v1/venta_diaria?caja_id=eq.${CAJA_ID}&fecha=eq.${FECHA}&select=turno`, { headers: hdrs });
    const d = await r.json();
    if (!d[0]) { console.error('No hay venta_diaria para esta caja+fecha'); process.exit(1); }
    const res = await recalcularCaja(FECHA, d[0].turno, CAJA_ID);
    console.log(JSON.stringify(res, null, 2));
  }

  if (TODAS) {
    const r = await fetch(`${URL}/rest/v1/venta_diaria?fecha=eq.${FECHA}&select=id,caja_id,turno`, { headers: hdrs });
    const cajas = await r.json();
    console.log(`Recalculando ${cajas.length} cajas...`);
    for (const c of cajas) {
      const res = await recalcularCaja(FECHA, c.turno, c.caja_id);
      console.log(`  ${c.caja_id.substring(0,8)} | turno=${c.turno} | status=${res.status} | ret=${res.body.retiros_efectivo} pag=${res.body.pago_facturas_caja} rrhh=${res.body.gastos_rrhh} tr_egr=${res.body.traspaso_tesoreria_egreso} tr_ing=${res.body.traspaso_tesoreria_ingreso} otros_egr=${res.body.otros_egresos}`);
    }
    console.log('✅ Recalculo completo');
  }
})().catch(e => { console.error(e); process.exit(1); });
