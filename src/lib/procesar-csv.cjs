/**
 * Procesar CSVs del scraper e insertar en Supabase
 * Uso: node src/lib/procesar-csv.cjs [--fecha=2026-05-19] [--modo=venta|pagos|reserva|todo]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const TXT = fs.readFileSync('.env', 'utf8');
const KEY = TXT.match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim();
const URL = TXT.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();

// Mapeo BSale value → UUID de cajas
const MAPA_CAJAS = {
  '26': 'f80cee57-8f37-4552-90e8-8309bf061102', // ALEJANDRA C.
  '35': 'f9ba9071-c0c4-402b-89eb-8d8e645cb645', // CAJA 1 N.
  '37': '0e28ce44-a6eb-4fe7-b787-396a17b6eed7', // CAJA 2 N.
  '39': '6df7849d-1d89-4db7-b044-afab16ffadb6', // CAJA 3 N.
  '27': 'a36578b3-dad1-4cee-8b6d-56f1acf67b1c', // GABRIEL S.
  '9':  '6d872d03-2383-4c92-9157-0deb40be44f6', // IRMA I.
  '30': 'b6e52a93-e6e0-4bc1-aa3e-421b2031e96c', // JACQUELINE Y.
  '2':  'ca22e80f-d770-4966-9913-c32bde757297', // Julian S.
};

function getTurno(cajaValue) {
  // CAJA 1 (35) y CAJA 2 (37) = Tarde, el resto = Mañana
  if (cajaValue === '35' || cajaValue === '37') return 'Tarde';
  return 'Mañana';
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',');
  const registros = [];
  
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = vals[idx]?.trim() || ''; });
    registros.push(row);
  }
  return registros;
}

async function insertarVentaDiaria(fecha, registros) {
  const fechasAProcesar = procesarRangoFechas(fecha);
  const resultados = [];
  
  for (const iterFecha of fechasAProcesar) {
    const csvPath = path.join(process.cwd(), 'cierre_caja_' + iterFecha + '.csv');
    if (!fs.existsSync(csvPath)) {
      console.log('  ⚠️ ' + iterFecha + ': CSV no encontrado');
      continue;
    }
    
    const csv = fs.readFileSync(csvPath, 'utf8');
    const rows = parseCSV(csv);
    const cajasConDatos = rows.filter(r => parseInt(r.total_ventas) > 0);
    
    if (cajasConDatos.length === 0) {
      console.log('  ' + iterFecha + ': sin datos');
      continue;
    }
    
    console.log('\n  ' + iterFecha + ': ' + cajasConDatos.length + ' cajas');
    
    for (const row of cajasConDatos) {
      const cajaUUID = MAPA_CAJAS[row.caja_id];
      if (!cajaUUID) { console.log('    ⚠️ caja_id ' + row.caja_id + ' sin UUID'); continue; }
      
      const body = {
        fecha: iterFecha,
        caja_id: cajaUUID,
        turno: getTurno(row.caja_id),
        estado: 'Abierto',
        saldo_inicial: parseInt(row.apertura) || 0,
        venta_efectivo: parseInt(row.efectivo) || 0,
        redelcom: parseInt(row.debito) || 0,
        tarjeta_credito: parseInt(row.tarjeta_credito) || 0,
        credito: parseInt(row.credito_local) || 0,
        transferencia: parseInt(row.transferencia) || 0,
        edenred: parseInt(row.edenred) || 0,
        vuelta: Math.abs(parseInt(row.vuelto) || 0),
        retiros_efectivo: Math.abs(parseInt(row.retiros) || 0),
        cierre_declarado_pdf: parseInt(row.efectivo_final) || 0,
        diferencia_caja: parseInt(row.diferencia_total) || parseInt(row.diferencia_efectivo) || 0,
        total_ventas: parseInt(row.total_ventas) || 0,
        ingresos_efectivo: parseInt(row.otros_ingresos) || 0,
        pago_facturas_caja: 0,
        traspaso_tesoreria_ingreso: 0,
        traspaso_tesoreria_egreso: 0,
      };
      
      // POST primero; si ya existe (409 conflict), hacer PATCH
      const postUrl = URL + '/rest/v1/venta_diaria';
      const resp = await fetch(postUrl, {
        method: 'POST',
        headers: { apikey: KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });

      const nom = row.caja_nombre?.replace(/"/g, '') || '?';
      if (resp.status === 201) {
        console.log('    ✅ ' + nom.padEnd(14) + ' cierre=$' + body.cierre_declarado_pdf.toLocaleString('es-CL') + ' (nuevo)');
      } else if (resp.status === 409) {
        // PATCH: Ya existe - Actualizar
        const patchUrl = URL + '/rest/v1/venta_diaria?fecha=eq.' + iterFecha + '&caja_id=eq.' + cajaUUID + '&turno=eq.' + encodeURIComponent(body.turno);
        const respPatch = await fetch(patchUrl, {
          method: 'PATCH',
          headers: { apikey: KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify(body)
        });
        if (respPatch.status >= 200 && respPatch.status < 300) {
          console.log('    ✅ ' + nom.padEnd(14) + ' cierre=$' + body.cierre_declarado_pdf.toLocaleString('es-CL') + ' (actualizado)');
        } else {
          const err = await respPatch.text();
          console.log('    ❌ ' + nom + ': PATCH ' + respPatch.status + ' ' + err.substring(0, 100));
        }
      } else {
        const err = await resp.text();
        console.log('    ❌ ' + nom + ': ' + resp.status + ' ' + err.substring(0, 100));
      }
    }
  }
  
  console.log('\n✅ venta_diaria insertado');
}

function procesarRangoFechas(fechaEspecifica) {
  if (fechaEspecifica) return [fechaEspecifica];
  const fechas = [];
  const start = new Date('2026-05-19');
  const end = new Date('2026-06-02');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    fechas.push(d.toISOString().split('T')[0]);
  }
  return fechas;
}

// ===== MAIN =====
const args = process.argv.slice(2);
const fechaArg = args.find(a => a.startsWith('--fecha='))?.split('=')[1];
const modo = args.find(a => a.startsWith('--modo='))?.split('=')[1] || 'todo';

(async () => {
  console.log('=== Procesando CSVs del scraper ===\n');
  
  if (modo === 'venta' || modo === 'todo') {
    await insertarVentaDiaria(fechaArg);
  }
  
  if (modo === 'pagos' || modo === 'todo') {
    console.log('\n(pendiente: modulo pagos_proveedor)');
  }
  
  if (modo === 'reserva' || modo === 'todo') {
    console.log('\n(pendiente: modulo reserva_movimientos)');
  }
  
  console.log('\n✅ Completado');
})().catch(e => console.log('Error:', e.message));
