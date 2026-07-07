/**
 * TRASPASO: pagos_proveedor → venta_diaria.pago_facturas_caja
 * 
 * Lee los pagos a proveedores agrupados por caja y fecha,
 * y actualiza el campo pago_facturas_caja en venta_diaria.
 * 
 * Uso: node src/lib/traspaso-pagos-proveedor.js [YYYY-MM-DD]
 */

const fs = require('fs');
const path = require('path');
const txt = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8');
const getVal = (k) => { const m = txt.match(new RegExp(k + '=(.+)')); return m ? m[1].trim() : null; };
const SUPABASE_URL = getVal('VITE_SUPABASE_URL');
const SUPABASE_KEY = getVal('VITE_SUPABASE_SERVICE_KEY');

// Por defecto: procesar el dia de ayer (fecha del sistema)
const fecha = process.argv[2] || (() => {
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  return ayer.toISOString().split('T')[0];
})();

async function traspasarPagosProveedores(fechaStr) {
  console.log(`\n=== TRASPASO: pagos_proveedor → venta_diaria (${fechaStr}) ===`);

  // 1. Obtener pagos_proveedor agrupados por caja
  const r = await fetch(SUPABASE_URL + '/rest/v1/pagos_proveedor?select=caja_id,monto_pagado&fecha_pago=eq.' + fechaStr + '&order=monto_pagado.asc', {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  const pagos = await r.json();

  if (!Array.isArray(pagos) || pagos.length === 0) {
    console.log('  No hay pagos de proveedores para esta fecha');
    return { total: 0, cajas: {} };
  }

  // Agrupar por caja
  const porCaja = {};
  for (const p of pagos) {
    if (!p.caja_id) continue;
    if (!porCaja[p.caja_id]) porCaja[p.caja_id] = 0;
    porCaja[p.caja_id] += p.monto_pagado;
  }

  console.log(`  Pagos encontrados: ${pagos.length}`);
  console.log(`  Cajas con pagos: ${Object.keys(porCaja).length}`);

  // 2. Actualizar venta_diaria para cada caja
  let totalTraspasado = 0;
  const resultados = {};

  for (const [cajaId, montoTotal] of Object.entries(porCaja)) {
    // Buscar registro de venta_diaria para esta caja y fecha
    const r2 = await fetch(SUPABASE_URL + '/rest/v1/venta_diaria?select=id&caja_id=eq.' + cajaId + '&fecha=eq.' + fechaStr, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    });
    const ventas = await r2.json();

    if (!Array.isArray(ventas) || ventas.length === 0) {
      console.log(`  ⚠️  No hay registro en venta_diaria para caja ${cajaId.substring(0,8)}`);
      resultados[cajaId] = { monto: montoTotal, status: 'sin_registro_venta' };
      continue;
    }

    // Actualizar pago_facturas_caja
    const r3 = await fetch(SUPABASE_URL + '/rest/v1/venta_diaria?id=eq.' + ventas[0].id, {
      method: 'PATCH',
      headers: { 
        apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json', Prefer: 'return=representation'
      },
      body: JSON.stringify({ pago_facturas_caja: montoTotal })
    });

    if (r3.ok) {
      const upd = await r3.json();
      const montoStr = '$' + montoTotal.toLocaleString('es-CL');
      console.log(`  ✅ Caja ${cajaId.substring(0,8)} → pago_facturas_caja = ${montoStr}`);
      totalTraspasado += montoTotal;
      resultados[cajaId] = { monto: montoTotal, status: 'ok' };
    } else {
      const err = await r3.text();
      console.log(`  ❌ Caja ${cajaId.substring(0,8)} → Error: ${err.substring(0,100)}`);
      resultados[cajaId] = { monto: montoTotal, status: 'error' };
    }
  }

  console.log(`\n  ✅ Traspaso completado: $${totalTraspasado.toLocaleString('es-CL')} distribuido en ${Object.keys(porCaja).length} cajas`);
  return { fecha: fechaStr, total: totalTraspasado, cajas: resultados };
}

// Ejecutar
traspasarPagosProveedores(fecha).then(r => {
  console.log('\nResumen:', JSON.stringify(r, null, 2));
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
