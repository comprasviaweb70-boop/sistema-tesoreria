/**
 * Procesador automatizado de cierre diario (todas las cajas, un pase)
 * 
 * Uso: node src/lib/procesar-dia.cjs --fecha 2026-05-19
 */
require('dotenv').config();
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { parseDenominaciones } = require('./parse-denominaciones.cjs');
const { PoolReserva, DENOM_KEYS } = require('./pool-reserva.cjs');

// === CONFIG ===
const BSALE_USER = process.env.BSALE_WEB_USER;
const BSALE_PASS = process.env.BSALE_WEB_PASS;
const STORAGE_FILE = path.join(process.cwd(), '.bsale-session.json');
const KEY = process.env.SUPABASE_SERVICE_KEY;
const URL = process.env.VITE_SUPABASE_URL;

const args = process.argv.slice(2);
const FECHA_ARG = (() => {
  const idx = args.findIndex(a => a === '--fecha');
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const eq = args.find(a => a.startsWith('--fecha='));
  if (eq) return eq.split('=')[1];
  return null;
})();
if (!FECHA_ARG) { console.error('Uso: --fecha 2026-05-19'); process.exit(1); }

const fp = FECHA_ARG.split('-');
const FECHA_DISPLAY = `${fp[2]}/${fp[1]}/${fp[0]}`;

const CAJAS_BSALE = [
  { value: '26', nombre: 'ALEJANDRA C.' },
  { value: '35', nombre: 'CAJA 1 N.' },
  { value: '37', nombre: 'CAJA 2 N.' },
  { value: '39', nombre: 'CAJA 3 N.' },
  { value: '27', nombre: 'GABRIEL S.' },
  { value: '9',  nombre: 'IRMA I.' },
  { value: '30', nombre: 'JACQUELINE Y.' },
  { value: '2',  nombre: 'Julian S.' },
];

const CAJA_UUID = {
  '26': 'f80cee57-8f37-4552-90e8-8309bf061102',
  '35': 'f9ba9071-c0c4-402b-89eb-8d8e645cb645',
  '37': '0e28ce44-a6eb-4fe7-b787-396a17b6eed7',
  '39': '6df7849d-1d89-4db7-b044-afab16ffadb6',
  '27': 'a36578b3-dad1-4cee-8b6d-56f1acf67b1c',
  '9':  '6d872d03-2383-4c92-9157-0deb40be44f6',
  '30': 'b6e52a93-e6e0-4bc1-aa3e-421b2031e96c',
  '2':  'ca22e80f-d770-4966-9913-c32bde757297',
};

function getTurno(val) { return (val === '35' || val === '37') ? 'Tarde' : 'Mañana'; }

// Categorias (full UUIDs)
const CAT = {
  RRHH_PT: '82f02d10-b937-4006-8176-6fe5f50c9bae',
  TRANSF_INT: '427f6489-fcf0-4d1d-96cf-4fae600bcb37',
};

// ===== HELPERS =====
function parseAmount(s) { return parseInt(String(s).replace(/[$.]/g, '')) || 0; }

function autoDenominacion(monto) {
  const d = { b20k:20000, b10k:10000, b5k:5000, b2k:2000, b1k:1000, m500:500, m100:100, m50:50, m10:10 };
  const r = { b20k:0, b10k:0, b5k:0, b2k:0, b1k:0, m500:0, m100:0, m50:0, m10:0 };
  let rest = monto;
  for (const [k, v] of Object.entries(d)) {
    if (rest <= 0) break;
    const cant = Math.floor(rest / v);
    if (cant > 0) { r[k] = cant * v; rest -= cant * v; }
  }
  return r;
}

// ===== BSALE NAVEGACION =====
async function login(page, context) {
  await page.goto('https://app.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  if (page.url().includes('login')) {
    console.log('  Login...');
    await page.waitForSelector('input[type="text"], input[type="email"]', { state: 'visible', timeout: 20000 });
    await page.locator('input[type="text"], input[type="email"]').first().fill(BSALE_USER);
    await page.locator('input[type="password"]').first().fill(BSALE_PASS);
    await page.locator('input[type="password"]').first().press('Enter');
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); if (!page.url().includes('login')) break; }
    await context.storageState({ path: STORAGE_FILE });
  }
}

async function setFecha(page) {
  await page.evaluate((f) => {
    const i = document.getElementById('fecha_reporte');
    if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, f); i.dispatchEvent(new Event('input', { bubbles: true })); }
  }, FECHA_DISPLAY);
  await page.waitForTimeout(2000);
}

async function selectCaja(page, value) {
  await page.evaluate((val) => {
    const s = document.getElementById('id_vendedor_cierre');
    if (s) { s.value = val; s.dispatchEvent(new Event('change', { bubbles: true })); }
  }, value);
  await page.waitForTimeout(3000);
}

async function hasData(page) {
  const text = await page.evaluate(() => document.body.innerText);
  return text.includes('Resumen de Ventas') && !text.includes('Sin Registros');
}

// FIX: usar page.locator en vez de page.$ (no soporta :has-text)
async function clickButton(page, text) {
  const btn = page.locator(`button:has-text("${text}")`);
  if (await btn.count() === 0) return false;
  await btn.first().click();
  await page.waitForTimeout(3000);
  return true;
}

async function closePanel(page) {
  await page.evaluate(() => { const c = document.querySelector('#det_doc_close'); if (c) c.click(); });
  await page.waitForTimeout(1000);
}

async function getDocuments(page) {
  return await page.evaluate(() => {
    const lis = document.querySelectorAll('#dsr_docs_detail li');
    return Array.from(lis).map(li => {
      const label = li.querySelector('label');
      const em = li.querySelector('em');
      const btn = li.querySelector('button');
      const code = btn?.getAttribute('data-code') || '';
      const nro = code ? parseInt(code.replace(/^\D+/, '')) : 0;
      return { nro, code, text: label?.textContent?.trim() || '', monto: em?.textContent?.trim() || '',
        amount: parseInt((em?.textContent||'').replace(/[$.]/g,''))||0 };
    });
  });
}

async function readObservation(page, nro, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const obs = await page.evaluate(async (n) => {
      return new Promise((resolve) => {
        var orig = window.printHtmlDocument;
        window.printHtmlDocument = function(html) {
          window.printHtmlDocument = orig;
          var m = html.match(/[Oo]bservaci[óo]n[^:]*:\s*([^<]{2,300})/);
          resolve(m ? m[1].trim() : '(sin obs)');
          return orig.apply(this, arguments);
        };
        if (window.loadOtherForPrint) window.loadOtherForPrint(parseInt(n), 'cf');
        setTimeout(function(){ window.printHtmlDocument=orig; resolve('Timeout'); },15000);
      });
    }, nro);
    if (obs !== 'Timeout' && obs !== '(sin obs)') return obs;
    if (obs === 'Timeout') console.log(`      ⏱️ Reintento ${attempt}/${maxRetries} Nº${nro}...`);
    await new Promise(r => setTimeout(r, 2000));
  }
  return 'Timeout';
}

// ===== CLASIFICACION =====
async function loadProveedores() {
  const r = await fetch(`${URL}/rest/v1/proveedores?select=id,nombre`, { headers: { apikey: KEY, 'Authorization': 'Bearer ' + KEY } });
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}

function matchProveedor(obs, proveedores) {
  const upper = obs.toUpperCase();
  
  // Lista de excepciones: nombres cortos que deben aceptarse tal cual
  const SHORT_NAMES = ['CCU', 'BAT', 'ICB', 'PF', 'VCT'];
  
  // Palabras "comunes" que no son distintivas de un proveedor.
  // Requerimos que al menos UNA palabra específica (no común) coincida
  // para evitar falsos positivos como "EMPANADAS OMA" vs "EMPANADAS VIKYS".
  const COMMON_WORDS = [
    'EMPANADAS', 'PANADERIA', 'PAGO', 'SUPERMERCADO', 'DISTRIBUIDORA',
    'COMERCIAL', 'SOCIEDAD', 'LIMITADA', 'CENTRO', 'ESTACION',
    'SERVICIOS', 'PRODUCTOS', 'ALMACEN', 'MINIMARKET', 'COMERCIALIZADORA',
    'INDUSTRIA', 'ALIMENTOS', 'GENERAL', 'DEL', 'DE', 'LA', 'EL', 'Y', 'S'
  ];
  
  function wordMatches(word, texto) {
    // Match exacto con palabra completa (word boundary)
    // Evita falsos positivos como "MAD" dentro de "MADELEINE" o "COLA" dentro de "COLACION"
    const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasWholeWord = new RegExp('\\b' + escape(word) + '\\b', 'i');
    if (hasWholeWord.test(texto)) return true;
    // Tolerancia de 1 caracter (plurales, abreviaciones): probar sin la última letra
    if (word.length >= 4) {
      const short = word.slice(0, -1);
      const hasShort = new RegExp('\\b' + escape(short) + '\\b', 'i');
      if (hasShort.test(texto)) return true;
    }
    // Tolerancia de 2 caracteres: probar quitando la penúltima letra
    if (word.length >= 5) {
      const mod = word.slice(0, -2) + word.slice(-1);
      const hasMod = new RegExp('\\b' + escape(mod) + '\\b', 'i');
      if (hasMod.test(texto)) return true;
    }
    return false;
  }
  
  let best = null;
  let bestScore = 0;
  let bestSpecific = 0;

  for (const p of proveedores) {
    const nombre = p.nombre.toUpperCase();
    const words = nombre.split(/\s+/);
    const sigWords = words.filter(w => w.length > 2 || SHORT_NAMES.includes(w));
    if (sigWords.length === 0) continue;
    
    // Separar palabras específicas (distintivas) de comunes
    const specificWords = sigWords.filter(w => !COMMON_WORDS.includes(w));
    // Si no hay palabras específicas, usar todas las significativas
    const wordsToMatch = specificWords.length > 0 ? specificWords : sigWords;
    
    const matchingAll = sigWords.filter(w => wordMatches(w, upper)).length;
    const matchingSpecific = wordsToMatch.filter(w => wordMatches(w, upper)).length;
    
    // Requerir al menos UNA palabra específica coincidente
    if (matchingSpecific === 0) continue;
    
    const score = matchingAll / sigWords.length;
    
    // Umbral: 50% de coincidencia general
    if (score >= 0.5) {
      // Preferir el proveedor con MÁS matches específicos (desempate por score)
      if (matchingSpecific > bestSpecific || 
          (matchingSpecific === bestSpecific && score > bestScore)) {
        best = p;
        bestScore = score;
        bestSpecific = matchingSpecific;
      }
    }
  }
  
  return best;
}

function isInterCaja(obs) {
  return /PARA CAJA|DINERO CAJA/i.test(obs);
}

function isPreventivo(obs) {
  // Excluir pagos a personas/proveedores que mencionan denominaciones en la obs
  // Ej: "PAGO PAN LA ABUELA, 1 BILLETE DE 20.000" NO es preventivo
  if (/^PAGO\s/i.test(obs.trim())) return false;
  return /RETIRO PREVENTIVO|BILLETES? DE|MONEDAS? DE|RETIRO EFECTIVO/i.test(obs);
}

function isCorreccionBoleta(obs) {
  // Detecta observaciones que indican corrección de boleta
  // (boleta mal pasada, efectivo que se registró como débito, etc.)
  // Estos movimientos NO tocan la reserva, solo ajustan venta_diaria
  return /MAL\s*(PASADA|REGISTRADA|INGRESADA)|ES\s+(EFECTIVO|DEB|DEBITO)|CORREGIR|CORRECCI.O*N/i.test(obs);
}

function isPagoDiferencia(obs) {
  // Detecta pagos/devoluciones por diferencia
  // Estos van a otros_movimientos categoría "Diferencia en Ventas", NO a reserva
  // Matchea: "PAGO DE DIFERENCIA POR CAMBIO", "CLIENTE PAGA DIFERENCIA", etc.
  return /(?:PAGO|PAGA)\s+(?:DE\s+)?DIFERENCIA/i.test(obs);
}

function isInsumosLocal(proveedorNombre) {
  // Detecta proveedores de insumos de aseo y afines
  // Estos van a otros_movimientos categoría "Insumos local", NO a pagos_proveedor
  const INSUMOS_LOCALES = ['HIPERLIMPIO', 'VISION DEL SUR'];
  return INSUMOS_LOCALES.some(nombre => proveedorNombre.toUpperCase().includes(nombre));
}

// ===== INSERCIONES =====
async function api(method, table, params, body) {
  let url = `${URL}/rest/v1/${table}`;
  if (params) url += '?' + params;
  const opts = { method, headers: { apikey: KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  return r;
}

// ===== PROCESAR DIA =====
async function processDay(page) {
  console.log(`\n========== ${FECHA_ARG} ==========`);
  
  const proveedores = await loadProveedores();
  console.log(`Proveedores cargados: ${proveedores.length}`);
  
  const resultados = [];

  for (const caja of CAJAS_BSALE) {
    await selectCaja(page, caja.value);
    if (!(await hasData(page))) {
      console.log(`  ${caja.nombre.padEnd(16)} ⏭️ sin datos`);
      continue;
    }
    
    console.log(`\n  ${caja.nombre.padEnd(16)} 🔍`);
    const cajaUUID = CAJA_UUID[caja.value];
    const turno = getTurno(caja.value);
    
    const data = { caja: caja.nombre, cajaUUID, turno, retiros: [], otrosIngresos: [] };
    
    // === RETIROS ===
    if (await clickButton(page, 'Retiros de Efectivo')) {
      const docs = await getDocuments(page);
      console.log(`    Retiros: ${docs.length}`);
      
      for (const doc of docs) {
        const obs = await readObservation(page, doc.nro);
        console.log(`      Nº${doc.nro} $${doc.amount.toLocaleString('es-CL')} | ${obs.substring(0,60)}`);
        data.retiros.push({ ...doc, obs });
      }
      await closePanel(page);
    }
    
    // === OTROS INGRESOS ===
    if (await clickButton(page, 'Otros Ingresos')) {
      const docs = await getDocuments(page);
      console.log(`    Otros Ingresos: ${docs.length}`);
      
      for (const doc of docs) {
        const obs = await readObservation(page, doc.nro);
        console.log(`      Nº${doc.nro} $${doc.amount.toLocaleString('es-CL')} | ${obs.substring(0,60)}`);
        data.otrosIngresos.push({ ...doc, obs });
      }
      await closePanel(page);
    }
    
    resultados.push(data);
  }
  
  return resultados;
}


// ===== INSERTAR DATOS =====
async function insertResults(resultados) {
  if (resultados.length === 0) { console.log('  Sin resultados que insertar'); return; }
  
  console.log('\n========== INSERTANDO DATOS ==========');
  
  // ==== PISAR DATOS — BSale reemplaza todo en las 3 tablas ====
  for (const cajaUUID of resultados.map(r => r.cajaUUID)) {
    // Reserva movimientos
    try {
      const rRes = await fetch(URL + '/rest/v1/reserva_movimientos?fecha=eq.' + FECHA_ARG + '&caja_id=eq.' + cajaUUID, {
        method: 'GET', headers: { apikey: KEY, 'Authorization': 'Bearer ' + KEY }
      });
      const reservas = await rRes.json();
      if (Array.isArray(reservas) && reservas.length > 0) {
        console.log('  ⚠️ Reserva ' + cajaUUID.substring(0,8) + ' (' + reservas.length + ' reg) — reemplazados por BSale');
        await fetch(URL + '/rest/v1/reserva_movimientos?fecha=eq.' + FECHA_ARG + '&caja_id=eq.' + cajaUUID, {
          method: 'DELETE', headers: { apikey: KEY, 'Authorization': 'Bearer ' + KEY, Prefer: 'return=minimal' }
        });
      }
    } catch (e) { /* ignorar */ }

    // Pagos proveedor
    try {
      const rPago = await fetch(URL + '/rest/v1/pagos_proveedor?fecha_pago=eq.' + FECHA_ARG + '&caja_id=eq.' + cajaUUID, {
        method: 'GET', headers: { apikey: KEY, 'Authorization': 'Bearer ' + KEY }
      });
      const pagos = await rPago.json();
      if (Array.isArray(pagos) && pagos.length > 0) {
        console.log('  ⚠️ Pagos ' + cajaUUID.substring(0,8) + ' (' + pagos.length + ' reg) — reemplazados por BSale');
        await fetch(URL + '/rest/v1/pagos_proveedor?fecha_pago=eq.' + FECHA_ARG + '&caja_id=eq.' + cajaUUID, {
          method: 'DELETE', headers: { apikey: KEY, 'Authorization': 'Bearer ' + KEY, Prefer: 'return=minimal' }
        });
      }
    } catch (e) { /* ignorar */ }

    // Otros movimientos
    try {
      const rOtro = await fetch(URL + '/rest/v1/otros_movimientos?fecha=eq.' + FECHA_ARG + '&caja_id=eq.' + cajaUUID, {
        method: 'GET', headers: { apikey: KEY, 'Authorization': 'Bearer ' + KEY }
      });
      const otros = await rOtro.json();
      if (Array.isArray(otros) && otros.length > 0) {
        console.log('  ⚠️ Otros ' + cajaUUID.substring(0,8) + ' (' + otros.length + ' reg) — reemplazados por BSale');
        await fetch(URL + '/rest/v1/otros_movimientos?fecha=eq.' + FECHA_ARG + '&caja_id=eq.' + cajaUUID, {
          method: 'DELETE', headers: { apikey: KEY, 'Authorization': 'Bearer ' + KEY, Prefer: 'return=minimal' }
        });
      }
    } catch (e) { /* ignorar */ }
  }

  const pool = new PoolReserva();
  await pool.init(FECHA_ARG);
  
  // Separar por turno: Mañana primero, luego Tarde
  const manana = resultados.filter(r => r.turno === 'Mañana');
  const tarde  = resultados.filter(r => r.turno === 'Tarde');
  
  console.log(`\nTurno Mañana: ${manana.length} cajas, Turno Tarde: ${tarde.length} cajas`);
  
  // ===== REGLA 1: EGRESOS (Otros Ingresos) ANTES que INGRESOS (Retiros) =====
  // ===== REGLA 2: Procesar por turno (Mañana → Tarde) =====
  
  for (const grupo of [manana, tarde]) {
    if (grupo.length === 0) continue;
    const turno = grupo[0].turno;
    console.log(`\n========== TURNO ${turno.toUpperCase()} ==========`);
    
    // --- PASO 1: EGRESOS de todos los cajas de este turno ---
    console.log('\n--- Paso 1: Egresos (Otros Ingresos de Efectivo) ---');
    for (const r of grupo) {
      for (const ing of r.otrosIngresos) {
        if (isInterCaja(ing.obs)) {
          // Inter-caja IN: no toca reserva, va a otros_movimientos
          await api('POST', 'otros_movimientos', null, {
            fecha: FECHA_ARG, turno: r.turno, caja_id: r.cajaUUID,
            tipo: 'ingreso', categoria_id: CAT.TRANSF_INT,
            descripcion: `${r.caja} - INGRESO N� ${ing.nro} - ${ing.obs}`,
            monto: ing.amount
          });
          console.log(`  🔄 Inter-caja IN $${ing.amount.toLocaleString('es-CL')} (${r.caja})`);
        } else if (isCorreccionBoleta(ing.obs)) {
          // Corrección de boleta: no toca reserva, ajusta venta_diaria
          await api('POST', 'otros_movimientos', null, {
            fecha: FECHA_ARG, turno: r.turno, caja_id: r.cajaUUID,
            tipo: 'ingreso', categoria_id: '9e2babac-97b1-45f3-9f0e-a4bea377b2e8',
            descripcion: `${r.caja} - CORRECCI�N N� ${ing.nro} - ${ing.obs}`,
            monto: ing.amount
          });
          console.log(`  ✅ Corrección boleta $${ing.amount.toLocaleString('es-CL')} (${r.caja})`);
        } else if (isPagoDiferencia(ing.obs)) {
          // Pago por diferencia de cambio: no toca reserva, va a otros_movimientos
          await api('POST', 'otros_movimientos', null, {
            fecha: FECHA_ARG, turno: r.turno, caja_id: r.cajaUUID,
            tipo: 'ingreso', categoria_id: 'cb02e2e4-a10b-48cf-887c-8ec297b63513',
            descripcion: `${r.caja} - INGRESO N° ${ing.nro} - ${ing.obs}`,
            monto: ing.amount
          });
          console.log(`  ✅ Diferencia en Ventas $${ing.amount.toLocaleString('es-CL')} (${r.caja})`);
        } else {
          // Egreso de Tesoreria → usar pool.distribuir() (NO autoDenominacion)
          const denom = pool.distribuir(ing.amount, `Egreso Nº${ing.nro} ${r.caja}`);
          
          // Verificar que la suma de denominaciones cubre el monto ANTES de insertar
          const sumaDenom = DENOM_KEYS.reduce((a,k) => a + (denom[k]||0), 0);
          if (sumaDenom < ing.amount) {
            console.error(`  ❌ SOBREGIRO: Reserva insuficiente para $${ing.amount.toLocaleString('es-CL')} en ${r.caja} Nº${ing.nro}`);
            console.error(`     Solo hay $${sumaDenom.toLocaleString('es-CL')} disponible en la Reserva`);
            console.error(`     FALTAN: $${(ing.amount - sumaDenom).toLocaleString('es-CL')}`);
            console.error(`     ⛔ No se insertó ni modificó nada. Pool intacto.`);
            console.error(`     Revisa los movimientos del día para verificar montos.`);
            return; // Saliendo sin abortar — se reporta y sigue
          }
          
          const descEgreso = `${r.caja} - INGRESO Nº ${ing.nro} - ${ing.obs}`;
          await api('POST', 'reserva_movimientos', null, {
            fecha: FECHA_ARG, turno: r.turno, caja_id: r.cajaUUID,
            tipo: 'egreso', descripcion: descEgreso,
            monto_total: ing.amount, ...denom
          });
          pool.restarEgreso(denom);
          console.log(`  ✅ Reserva egreso $${ing.amount.toLocaleString('es-CL')} (${r.caja})`);
        }
      }
    }
    
    // --- PASO 2: INGRESOS (Retiros) de todas las cajas de este turno ---
    console.log('\n--- Paso 2: Ingresos (Retiros de Efectivo) ---');
    for (const r of grupo) {
      for (const ret of r.retiros) {
        if (isInterCaja(ret.obs)) {
          // Inter-caja OUT → otros_movimientos, no toca reserva
          await api('POST', 'otros_movimientos', null, {
            fecha: FECHA_ARG, turno: r.turno, caja_id: r.cajaUUID,
            tipo: 'egreso', categoria_id: CAT.TRANSF_INT,
            descripcion: `${r.caja} - RETIRO Nº ${ret.nro} - ${ret.obs}`,
            monto: ret.amount
          });
          console.log(`  🔄 Inter-caja OUT $${ret.amount.toLocaleString('es-CL')} (${r.caja})`);
          
        } else if (isCorreccionBoleta(ret.obs)) {
          // Corrección de boleta desde Retiros: no toca reserva, ajusta venta_diaria
          await api('POST', 'otros_movimientos', null, {
            fecha: FECHA_ARG, turno: r.turno, caja_id: r.cajaUUID,
            tipo: 'egreso', categoria_id: 'db4ae4a4-eec3-4d43-bf08-b53e2b7d47dd',
            descripcion: `${r.caja} - RETIRO Nº ${ret.nro} - ${ret.obs}`,
            monto: ret.amount
          });
          console.log(`  ✅ Corrección boleta (retiro) $${ret.amount.toLocaleString('es-CL')} (${r.caja})`);
          
        } else {
          // PRIORIDAD: Buscar proveedor ANTES de isPreventivo
          // Regla: "PAGO <nombre>" con match en proveedores → pago_facturas_caja
          //        "PAGO <nombre propio>" sin match → RRHH Part-Time (cajeras: TAFI, SOFI, etc.)
          const prov = matchProveedor(ret.obs, await loadProveedores());
          if (prov) {
            // Verificar si es proveedor de insumos locales (HIPERLIMPIO, VISION DEL SUR)
            // Estos van a otros_movimientos categoría "Insumos local", NO a pagos_proveedor
            if (isInsumosLocal(prov.nombre)) {
              await api('POST', 'otros_movimientos', null, {
                fecha: FECHA_ARG, turno: r.turno, caja_id: r.cajaUUID,
                tipo: 'egreso', categoria_id: 'd37f7d9a-463b-4384-a6b9-4f4f40e8532a',
                descripcion: `${r.caja} - RETIRO Nº ${ret.nro} - ${ret.obs}`,
                monto: ret.amount
              });
              console.log(`  ✅ Insumos local $${ret.amount.toLocaleString('es-CL')} (${prov.nombre} ${r.caja})`);
            } else {
              await api('POST', 'pagos_proveedor', null, {
                fecha_pago: FECHA_ARG, turno: r.turno, caja_id: r.cajaUUID,
                monto_pagado: ret.amount, proveedor_id: prov.id,
                origen_fondos: 'caja', comprobante_nombre: ret.obs.substring(0,100)
              });
              console.log(`  ✅ Pago proveedor $${ret.amount.toLocaleString('es-CL')} (${prov.nombre} ${r.caja})`);
            }
          } else if (isPreventivo(ret.obs)) {
            // Retiro Preventivo → reserva ingreso, suma al pool
            const parsed = parseDenominaciones(ret.obs, ret.amount);
            const denom = parsed || autoDenominacion(ret.amount);
            
            const descIngreso = `${r.caja} - RETIRO Nº ${ret.nro} - ${ret.obs}`;
            await api('POST', 'reserva_movimientos', null, {
              fecha: FECHA_ARG, turno: r.turno, caja_id: r.cajaUUID,
              tipo: 'ingreso', descripcion: descIngreso,
              monto_total: ret.amount, ...denom
            });
            pool.sumarIngreso(denom);
            console.log(`  ✅ Reserva ingreso $${ret.amount.toLocaleString('es-CL')} (PREVENTIVO ${r.caja})`);
          } else if (ret.obs.toUpperCase().includes('VISION DEL SUR') || ret.obs.toUpperCase().includes('HIPERLIMPIO')) {
            // Proveedores de insumos locales van a otros_movimientos categoría "Insumos local"
            await api('POST', 'otros_movimientos', null, {
              fecha: FECHA_ARG, turno: r.turno, caja_id: r.cajaUUID,
              tipo: 'egreso', categoria_id: 'd37f7d9a-463b-4384-a6b9-4f4f40e8532a',
              descripcion: `${r.caja} - RETIRO Nº ${ret.nro} - ${ret.obs}`,
              monto: ret.amount
            });
            console.log(`  ✅ Insumos local $${ret.amount.toLocaleString('es-CL')} (${r.caja} - ${ret.obs.substring(0,30)})`);
          } else {
            // RRHH Part-Time: nombre propio no encontrado en proveedores
            // (cajeras PT como TAFI, SOFI/SOFIA, etc.)
            await api('POST', 'otros_movimientos', null, {
              fecha: FECHA_ARG, turno: r.turno, caja_id: r.cajaUUID,
              tipo: 'egreso', categoria_id: CAT.RRHH_PT,
              descripcion: `${r.caja} - RETIRO Nº ${ret.nro} - ${ret.obs}`,
              monto: ret.amount
            });
            console.log(`  ⚠️ RRHH PT $${ret.amount.toLocaleString('es-CL')} (${r.caja} - ${ret.obs.substring(0,30)})`);
          }
        }
      }
    }
  }
  
  console.log(`\n🏦 Estado final Reserva: $${pool.totalPool.toLocaleString('es-CL')}`);
  const activas = DENOM_KEYS.filter(k => (pool.pool[k]||0) > 0);
  if (activas.length > 0) {
    console.log(`   ${activas.map(k => `${k}=${((pool.pool[k]||0)/1000).toFixed(0)}k`).join(', ')}`);
  }
}

// ===== RECALCULO FINAL =====
async function recalcularTodas() {
  console.log('\n========== RECALCULANDO VENTA DIARIA ==========');
  const { execSync } = require('child_process');
  const script = path.join(__dirname, 'recalcular-venta.cjs');
  const out = execSync(`node "${script}" --fecha ${FECHA_ARG} --todas`, { encoding: 'utf8', timeout: 60000 });
  console.log(out.trim());
}

// ===== MAIN =====
(async () => {
  console.log(`Procesando ${FECHA_ARG}...`);
  
  const browser = await chromium.launch({ headless: true,  args: ['--disable-blink-features=AutomationControlled'] });
  let context;
  if (fs.existsSync(STORAGE_FILE)) context = await browser.newContext({ storageState: STORAGE_FILE });
  else context = await browser.newContext();
  const page = await context.newPage(); page.setDefaultTimeout(15000);

  await login(page, context);
  const cookies = await context.cookies();
  await context.addCookies(cookies.map(c => ({ name: c.name, value: c.value, domain: '.bsale.cl', path: c.path || '/', httpOnly: c.httpOnly, secure: c.secure, sameSite: 'Lax' })));
  await page.goto('https://app2.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  await setFecha(page);

  const resultados = await processDay(page);
  await browser.close();
  
  await insertResults(resultados);
  
  await recalcularTodas();
  
  console.log(`\n✅ ${FECHA_ARG} procesado`);
})().catch(e => { console.error(e); process.exit(1); });
