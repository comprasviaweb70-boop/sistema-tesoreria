/**
 * Insertar Otros Ingresos de Efectivo en reserva_movimientos como egreso
 * + Actualizar venta_diaria.traspaso_tesoreria_ingreso
 */
require('dotenv').config();
const fs = require('fs');
const txt = fs.readFileSync('.env', 'utf8');
const getVal = (k) => { const m = txt.match(new RegExp(k + '=(.+)')); return m ? m[1].trim() : null; };
const key = getVal('VITE_SUPABASE_SERVICE_KEY');
const url = getVal('VITE_SUPABASE_URL');

function autoDenominacion(montoTotal) {
  const denoms = [
    { key: 'b20k', valor: 20000 },
    { key: 'b10k', valor: 10000 },
    { key: 'b5k',  valor: 5000 },
    { key: 'b2k',  valor: 2000 },
    { key: 'b1k',  valor: 1000 },
    { key: 'm500', valor: 500 },
    { key: 'm100', valor: 100 },
    { key: 'm50',  valor: 50 },
    { key: 'm10',  valor: 10 },
  ];
  const result = { b20k:0, b10k:0, b5k:0, b2k:0, b1k:0, m500:0, m100:0, m50:0, m10:0 };
  let restante = montoTotal;
  for (const d of denoms) {
    if (restante <= 0) break;
    const cantidad = Math.floor(restante / d.valor);
    if (cantidad > 0) {
      result[d.key] = cantidad * d.valor;
      restante -= cantidad * d.valor;
    }
  }
  return result;
}

const CAJAS = {
  '9':  { id: '6d872d03-2383-4c92-9157-0deb40be44f6', nombre: 'IRMA I.', turno: 'Mañana' },
  '30': { id: 'b6e52a93-e6e0-4bc1-aa3e-421b2031e96c', nombre: 'JACQUELINE Y.', turno: 'Mañana' },
  '37': { id: '0e28ce44-7a4e-4ebc-95f8-628f3ae62699', nombre: 'CAJA 2 N.', turno: 'Tarde' },
  '35': { id: 'f9ba9071-4f19-4f90-8841-f75c00a9e284', nombre: 'CAJA 1 N.', turno: 'Tarde' },
};

const MOVIMIENTOS = [
  // IRMA - 80,560 (traspaso tesoreria)
  { cajaKey: '9', numero: 42357, monto: 80560, descripcion: 'Traspaso de Tesorería' },
  // IRMA - 15,000 (apertura mal clasificada - va igual a reserva)
  { cajaKey: '9', numero: 42360, monto: 15000, descripcion: 'Saldo Apertura mal clasificado' },
  // JACQUELINE - 685,000
  { cajaKey: '30', numero: 42356, monto: 685000, descripcion: 'Traspaso de Tesorería' },
  // CAJA 2 - 1,000
  { cajaKey: '37', numero: 42369, monto: 1000, descripcion: 'Traspaso de Tesorería' },
];

(async () => {
  console.log('=== Insertando Otros Ingresos en reserva_movimientos (egreso) ===\n');

  // Primero eliminar registros viejos/duplicados
  console.log('Eliminando registros egreso viejo...');
  const oldIds = ['7eaf4d1f', 'f09b66cc']; // JACQUELINE $685k e IRMA $15k
  for (const id of oldIds) {
    const resp = await fetch(url + '/rest/v1/reserva_movimientos?id=like.' + id + '*', {
      method: 'DELETE', headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    console.log('  Eliminado ID=' + id + '... (status ' + resp.status + ')');
  }

  for (const mov of MOVIMIENTOS) {
    const caja = CAJAS[mov.cajaKey];
    const denom = autoDenominacion(mov.monto);
    const glosa = caja.nombre + ' - OTROS INGRESOS Nº ' + mov.numero + ' - ' + mov.descripcion;

    // Mostrar denominacion
    const det = [];
    if (denom.b20k) det.push((denom.b20k/20000)+'×$20k');
    if (denom.b10k) det.push((denom.b10k/10000)+'×$10k');
    if (denom.b5k) det.push((denom.b5k/5000)+'×$5k');
    if (denom.b2k) det.push((denom.b2k/2000)+'×$2k');
    if (denom.b1k) det.push((denom.b1k/1000)+'×$1k');
    if (denom.m500) det.push((denom.m500/500)+'×$500');
    if (denom.m100) det.push((denom.m100/100)+'×$100');
    if (denom.m50) det.push((denom.m50/50)+'×$50');
    if (denom.m10) det.push((denom.m10/10)+'×$10');

    console.log(caja.nombre.padEnd(16), '| $' + mov.monto.toLocaleString('es-CL').padStart(7), '| ' + det.join(' + '));

    const body = {
      fecha: '2026-05-18',
      turno: caja.turno,
      caja_id: caja.id,
      tipo: 'egreso',
      descripcion: glosa,
      monto_total: mov.monto,
      ...denom
    };

    const resp = await fetch(url + '/rest/v1/reserva_movimientos', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(body)
    });
    const result = await resp.json();
    const id = result[0]?.id;
    console.log('  ✅ Insertado ID:', id?.substring(0,8));
  }

  console.log('\n=== Verificando venta_diaria.traspaso_tesoreria_ingreso ===');
  const r = await fetch(url + '/rest/v1/venta_diaria?select=caja_id,turno,traspaso_tesoreria_ingreso&fecha=eq.2026-05-18&order=turno.asc', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  const vd = await r.json();
  const nomMap = {'f9ba9071':'CAJA 1','0e28ce44':'CAJA 2','6d872d03':'IRMA','b6e52a93':'JACQUELINE'};
  vd.forEach(v => {
    const nom = nomMap[v.caja_id?.substring(0,8)] || '?';
    console.log(nom.padEnd(12), '| traspaso_tesoreria_ingreso = $' + (v.traspaso_tesoreria_ingreso || 0).toLocaleString('es-CL'));
  });

  console.log('\n=== Actualizando venta_diaria.traspaso_tesoreria_ingreso ===');
  // Sumar egresos de reserva agrupados por caja
  const r2 = await fetch(url + '/rest/v1/reserva_movimientos?select=caja_id,monto_total&fecha=eq.2026-05-18&tipo=eq.egreso', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  const egresos = await r2.json();
  
  const totalsByCaja = {};
  egresos.forEach(e => {
    const cid = e.caja_id.substring(0,8);
    totalsByCaja[cid] = (totalsByCaja[cid] || 0) + e.monto_total;
  });

  for (const [cid, total] of Object.entries(totalsByCaja)) {
    const resp = await fetch(url + '/rest/v1/venta_diaria?caja_id=like.' + cid + '*&fecha=eq.2026-05-18', {
      method: 'PATCH',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ traspaso_tesoreria_ingreso: total })
    });
    const nomInvert = {'f9ba9071':'CAJA 1','0e28ce44':'CAJA 2','6d872d03':'IRMA','b6e52a93':'JACQUELINE'};
    console.log((nomInvert[cid] || cid).padEnd(12), '| traspaso_tesoreria_ingreso = $' + total.toLocaleString('es-CL'), '| status', resp.status);
  }

  console.log('\n✅ Otros Ingresos insertados correctamente');
})().catch(e => console.log('Error:', e.message));
