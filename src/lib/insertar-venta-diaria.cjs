#!/usr/bin/env node
/**
 * Inserta datos del scraper de BSale en Supabase (tabla sales_entries)
 * 
 * Uso: node scripts/insertar-venta-diaria.cjs --fecha 2026-05-18 --caja 35
 *   --caja: value del select en BSale (35=CAJA 1 N., 37=CAJA 2 N., etc.)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY;
const TABLE = 'venta_diaria';

// Parse args
const args = process.argv.slice(2);
const params = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--fecha') params.fecha = args[++i];
  else if (args[i] === '--caja') params.caja = args[++i];
  else if (args[i] === '--csv') params.csv = args[++i];
}

// Por defecto: procesar el dia de ayer (fecha del sistema)
const fecha = params.fecha || (() => {
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  return ayer.toISOString().split('T')[0];
})();

// Mapeo de caja_value a caja_nombre, turno y UUID
const CAJA_MAP = [
  { value: '26', nombre: 'ALEJANDRA C.', turno: 'Mañana', uuid: 'f80cee57-8f37-4552-90e8-8309bf061102' },
  { value: '35', nombre: 'CAJA 1 N.', turno: 'Tarde', uuid: 'f9ba9071-c0c4-402b-89eb-8d8e645cb645' },
  { value: '37', nombre: 'CAJA 2 N.', turno: 'Tarde', uuid: '0e28ce44-a6eb-4fe7-b787-396a17b6eed7' },
  { value: '39', nombre: 'CAJA 3 N.', turno: 'Mañana', uuid: '6df7849d-1d89-4db7-b044-afab16ffadb6' },
  { value: '27', nombre: 'GABRIEL S.', turno: 'Mañana', uuid: 'a36578b3-dad1-4cee-8b6d-56f1acf67b1c' },
  { value: '9',  nombre: 'IRMA I.', turno: 'Mañana', uuid: '6d872d03-2383-4c92-9157-0deb40be44f6' },
  { value: '30', nombre: 'JACQUELINE Y.', turno: 'Mañana', uuid: 'b6e52a93-e6e0-4bc1-aa3e-421b2031e96c' },
  { value: '2',  nombre: 'Julian S.', turno: 'Mañana', uuid: 'ca22e80f-d770-4966-9913-c32bde757297' }
];

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: VITE_SUPABASE_URL y VITE_SUPABASE_SERVICE_KEY requeridas en .env');
    process.exit(1);
  }

  // Leer datos: desde CSV o por caja específica
  let rows = [];

  if (params.csv) {
    // Leer desde CSV
    const csvContent = fs.readFileSync(params.csv, 'utf8');
    const lines = csvContent.trim().split('\n');
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep);
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(sep);
      const row = {};
      headers.forEach((h, idx) => row[h.trim()] = vals[idx]?.trim() || '0');
      rows.push(row);
    }
  } else if (cajaValue) {
    // Buscar en el CSV generado por el scraper
    const csvDir = path.join(__dirname, '..', 'cierre_caja_' + fecha + '.csv');
    const csvContent = fs.readFileSync(csvDir, 'utf8');
    const lines = csvContent.trim().split('\n');
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep);
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(sep);
      if (vals[1] === cajaValue) {
        const row = {};
        headers.forEach((h, idx) => row[h.trim()] = vals[idx]?.trim() || '0');
        rows.push(row);
        break;
      }
    }
    if (rows.length === 0) {
      console.error('ERROR: Caja con value=' + cajaValue + ' no encontrada en el CSV');
      process.exit(1);
    }
  } else {
    console.error('ERROR: Debes especificar --caja o --csv');
    process.exit(1);
  }

  // Para cada fila, mapear e insertar
  for (const row of rows) {
    const cajaInfo = CAJA_MAP.find(c => c.value === row.caja_id);
    const cajaNombre = cajaInfo.nombre || row.caja_nombre || 'Caja ' + row.caja_id;
    const turno = cajaInfo.turno || 'manana';

    // Mapear columnas del CSV → columnas de Supabase
const registro = {
      fecha: fecha,
      caja_id: cajaInfo.uuid || null,
      turno: turno,
      saldo_inicial: parseInt(row.apertura) || 0,
      venta_efectivo: parseInt(row.efectivo) || 0,
      redelcom: parseInt(row.debito) || 0,
      edenred: parseInt(row.edenred) || 0,
      transferencia: parseInt(row.transferencia) || 0,
      credito: parseInt(row.credito_local) || 0,
      tarjeta_credito: parseInt(row.tarjeta_credito) || 0,
      total_ventas: parseInt(row.total_ventas) || 0,
      pago_facturas_caja: 0,
      pago_facturas_cc: 0,
      gastos_rrhh: 0,
      otros_gastos: 0,
      traspaso_efectivo: 0,
      cierre_declarado_pdf: parseInt(row.efectivo_final) || 0,
      estado: 'Cerrado',
      pdf_url: null,
      cajero_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      vuelta: parseInt(row.vuelto) || 0,
      ingresos_efectivo: 0,
      servicios: 0,
      gastos: 0,
      correccion_boletas: 0,
      otros_egresos: 0,
      traspaso_tesoreria_ingreso: 0,
      traspaso_tesoreria_egreso: 0
    };

    console.log('\n📦 Registro a insertar:');
    console.log(JSON.stringify(registro, null, 2));

    // Upsert en Supabase (evita duplicados por fecha+caja_id)
    const url = `${SUPABASE_URL}/rest/v1/${TABLE}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(registro)
    });

    if (response.ok) {
      console.log(`✅ Insertado: ${cajaNombre} — ${fecha} (turno ${turno})`);
    } else {
      const errText = await response.text();
      console.error(`❌ Error insertando ${cajaNombre}: ${response.status} — ${errText}`);
    }
  }
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
