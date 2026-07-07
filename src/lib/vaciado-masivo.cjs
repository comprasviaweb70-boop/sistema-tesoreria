/**
 * Script principal de vaciado masivo.
 * Procesa todas las fechas de 19/05 a 02/06 en lote.
 * 
 * Modo 1: scrape-only (extrae datos a CSV)
 * Modo 2: insert-only (lee CSV e inserta en Supabase)
 * Modo 3: full (scrape + insert)
 */
require('dotenv').config();
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BSALE_USER = process.env.BSALE_WEB_USER;
const BSALE_PASS = process.env.BSALE_WEB_PASS;
const STORAGE_FILE = path.join(process.cwd(), '.bsale-session.json');
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;

const CAJAS = [
  { value: '26', nombre: 'ALEJANDRA C.' },
  { value: '35', nombre: 'CAJA 1 N.' },
  { value: '37', nombre: 'CAJA 2 N.' },
  { value: '39', nombre: 'CAJA 3 N.' },
  { value: '27', nombre: 'GABRIEL S.' },
  { value: '9',  nombre: 'IRMA I.' },
  { value: '30', nombre: 'JACQUELINE Y.' },
  { value: '2',  nombre: 'Julian S.' },
];

// Por defecto: procesar SOLO el dia de ayer (fecha del sistema)
const FECHAS = (() => {
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  return [ayer.toISOString().split('T')[0]];
})();

function parseAmount(str) {
  if (!str) return 0;
  return parseInt(str.replace(/[$.]/g, '').replace(/,/g, '')) || 0;
}

async function scrapeFecha(page, fecha) {
  const fechaParts = fecha.split('-');
  const fechaDisplay = `${fechaParts[2]}/${fechaParts[1]}/${fechaParts[0]}`;
  
  console.log(`\n===== ${fecha} =====`);
  
  // Setear fecha
  await page.evaluate((f) => {
    const input = document.getElementById('fecha_reporte');
    if (input) {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(input, f);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, fechaDisplay);
  await page.waitForTimeout(2000);

  const resultados = [];

  for (const caja of CAJAS) {
    // Seleccionar caja
    await page.evaluate((val) => {
      const select = document.getElementById('id_vendedor_cierre');
      if (select) { select.value = val; select.dispatchEvent(new Event('change', { bubbles: true })); }
    }, caja.value);
    await page.waitForTimeout(3000);

    // Extraer texto de la pagina
    const pageText = await page.evaluate(() => document.body.innerText);
    
    // Detectar si tiene datos
    if (pageText.includes('Sin Registros') || !pageText.includes('Resumen de Ventas')) {
      resultados.push({
        fecha, caja_id: caja.value, caja_nombre: caja.nombre,
        efectivo:0, debito:0, tarjeta_credito:0, credito_local:0,
        transferencia:0, edenred:0, apertura:0, total_efectivo:0,
        retiros:0, vuelto:0, efectivo_final:0,
        diferencia_efectivo:0, diferencia_total:0, total_ventas:0,
        observaciones: 'Sin datos'
      });
      continue;
    }

    function findVal(label) {
      const lines = pageText.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith(label)) {
          const m = lines[i + 1]?.match(/\$?\s*([\d.]+)/);
          if (m) return parseAmount(m[1]);
        }
      }
      return 0;
    }

    // Extraer valores del texto
    const efectivo = extractValue(pageText, 'EFECTIVO');
    const debito = extractValue(pageText, 'TARJETA DEBITO');
    const tc = extractValue(pageText, 'TARJETA CREDITO');
    const cl = extractCreditLocal(pageText);
    const transf = extractValue(pageText, 'TRANSFERENCIA');
    const eden = extractValue(pageText, 'EDENRED');
    const vuelto = extractSigned(pageText, 'Vuelto');
    const apertura = extractSigned(pageText, 'Saldo de Apertura');
    const retiros = extractSigned(pageText, 'Retiros de Efectivo');
    const efecFinal = findVal('Efectivo Final');
    const difEfec = findVal('Diferencia Efectivo');
    const difTotal = findVal('Diferencia Total Caja');
    const totalVtas = extractValue(pageText, 'Resumen de Ventas');
    const otrosIngresos = extractSigned(pageText, 'Otros Ingresos de Efectivo');

    resultados.push({
      fecha, caja_id: caja.value, caja_nombre: caja.nombre,
      efectivo, debito, tarjeta_credito: tc, credito_local: cl,
      transferencia: transf, edenred: eden,
      apertura, total_efectivo: efecFinal, // efecFinal es lo mismo que cierre_declarado_pdf
      retiros, vuelto, efectivo_final: efecFinal,
      diferencia_efectivo: difEfec, diferencia_total: difTotal,
      total_ventas: totalVtas, otros_ingresos: otrosIngresos,
      observaciones: ''
    });
  }

  return resultados;
}

function extractValue(text, label) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith(label)) {
      const m = t.match(/\+\s*\$?\s*([\d.]+)/);
      if (m) return parseAmount(m[1]);
    }
  }
  return 0;
}

function extractCreditLocal(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('CREDITO') && !t.includes('TARJETA')) {
      const m = t.match(/\+\s*\$?\s*([\d.]+)/);
      if (m) return parseAmount(m[1]);
    }
  }
  return 0;
}

function extractSigned(text, label) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith(label)) {
      const m = t.match(/[\+\-]\s*\$?\s*([\d.]+)/);
      if (m) return parseAmount(m[1]);
    }
  }
  return 0;
}

// ===== MAIN =====
(async () => {
  const modo = process.argv.find(a => a.startsWith('--modo='))?.split('=')[1] || 'scrape';
  const fechaUnica = process.argv.find(a => a.startsWith('--fecha='))?.split('=')[1];

  const fechasAProcesar = fechaUnica ? [fechaUnica] : FECHAS;

  if (modo === 'scrape' || modo === 'full') {
    console.log(`Procesando ${fechasAProcesar.length} fechas...`);
    
    const browser = await chromium.launch({ headless: true, channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled']
    });
    let context;
    if (fs.existsSync(STORAGE_FILE)) context = await browser.newContext({ storageState: STORAGE_FILE });
    else context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Login
    await page.goto('https://app.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    if (page.url().includes('login')) {
      console.log('Login...');
      await page.waitForSelector('input[type="text"], input[type="email"]', { state: 'visible', timeout: 20000 });
      await page.locator('input[type="text"], input[type="email"]').first().fill(BSALE_USER);
      await page.locator('input[type="password"]').first().fill(BSALE_PASS);
      await page.locator('input[type="password"]').first().press('Enter');
      for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); if (!page.url().includes('login')) break; }
      await context.storageState({ path: STORAGE_FILE });
    }
    const cookies = await context.cookies();
    await context.addCookies(cookies.map(c => ({ name: c.name, value: c.value, domain: '.bsale.cl', path: c.path || '/', httpOnly: c.httpOnly, secure: c.secure, sameSite: 'Lax' })));
    await page.goto('https://app2.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    for (const fecha of fechasAProcesar) {
      const resultados = await scrapeFecha(page, fecha);
      const csv = generarCSV(resultados);
      const csvPath = path.join(process.cwd(), `cierre_caja_${fecha}.csv`);
      fs.writeFileSync(csvPath, csv);
      const cajasConDatos = resultados.filter(r => r.total_ventas > 0);
      console.log(`  ${cajasConDatos.length} cajas con datos → ${path.basename(csvPath)}`);
    }

    await browser.close();
  }

  if (modo === 'insert' || modo === 'full') {
    console.log('\n=== Insertando en Supabase ===');
    for (const fecha of fechasAProcesar) {
      const csvPath = path.join(process.cwd(), `cierre_caja_${fecha}.csv`);
      if (!fs.existsSync(csvPath)) {
        console.log(`  ${fecha}: CSV no encontrado, saltando`);
        continue;
      }
      const csv = fs.readFileSync(csvPath, 'utf8');
      await procesarCSV(fecha, csv);
    }
  }

  console.log('\n✅ Listo');
})().catch(e => { console.error(e); process.exit(1); });

function generarCSV(resultados) {
  const headers = ['fecha','caja_id','caja_nombre','efectivo','debito','tarjeta_credito','credito_local',
    'transferencia','edenred','apertura','total_efectivo','retiros','vuelto','otros_ingresos',
    'efectivo_final','diferencia_efectivo','diferencia_total','total_ventas','observaciones'];
  const lines = [headers.join(',')];
  for (const r of resultados) {
    lines.push([r.fecha, r.caja_id, `"${r.caja_nombre}"`, r.efectivo, r.debito, r.tarjeta_credito,
      r.credito_local, r.transferencia, r.edenred, r.apertura, r.total_efectivo,
      r.retiros, r.vuelto, r.otros_ingresos||0,
      r.efectivo_final, r.diferencia_efectivo, r.diferencia_total, r.total_ventas,
      r.observaciones ? `"${r.observaciones}"` : ''
    ].join(','));
  }
  return lines.join('\n');
}

async function procesarCSV(fecha, csv) {
  // TODO: Implementar insercion en venta_diaria
  console.log(`  ${fecha}: lectura pendiente de implementar`);
}
