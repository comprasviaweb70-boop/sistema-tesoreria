require('dotenv').config();
const txt = require('fs').readFileSync('.env','utf8');
const url = txt.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = txt.match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim();

async function main() {
  const fecha = process.argv[2] || new Date(Date.now() - 86400000).toISOString().split('T')[0];
  console.log('Consultando fecha:', fecha);
  const hdrs = { apikey: key, Authorization: 'Bearer ' + key };

  const vd = await fetch(url+`/rest/v1/venta_diaria?fecha=eq.${fecha}&select=caja_id,turno,venta_efectivo,redelcom,retiros_efectivo,diferencia_caja,estado`, {headers: hdrs}).then(r=>r.json());
  console.log('venta_diaria rows:', vd.length);
  vd.forEach(r=>console.log(' ', r.caja_id.substring(0,8), r.turno, 'efectivo='+r.venta_efectivo, 'ret='+r.retiros_efectivo, 'diff='+r.diferencia_caja));

  const rm = await fetch(url+`/rest/v1/reserva_movimientos?fecha=eq.${fecha}&select=id,tipo,caja_id,monto_total,descripcion`, {headers: hdrs}).then(r=>r.json());
  console.log('\nreserva_movimientos rows:', rm.length);
  rm.slice(0,12).forEach(r=>console.log(' ', r.tipo, r.monto_total, r.descripcion?.substring(0,60)));

  const om = await fetch(url+`/rest/v1/otros_movimientos?fecha=eq.${fecha}&select=id,tipo,caja_id,monto`, {headers: hdrs}).then(r=>r.json());
  console.log('\notros_movimientos rows:', om.length);
  om.forEach(r=>console.log(' ', r.tipo, r.monto, r.caja_id?.substring(0,8)));

  const ppRes = await fetch(url+`/rest/v1/pagos_proveedor?fecha_pago=eq.${fecha}&select=id,monto_pagado,comprobante_nombre`, {headers: hdrs});
  const pp = await ppRes.json();
  console.log('\npagos_proveedor rows:', Array.isArray(pp) ? pp.length : 'ERROR: ' + JSON.stringify(pp));
  if (Array.isArray(pp)) pp.forEach(r=>console.log(' ', r.monto_pagado, r.comprobante_nombre?.substring(0,40)));
}
main().catch(console.error);
