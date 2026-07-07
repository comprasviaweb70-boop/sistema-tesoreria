require('dotenv').config();
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BSALE_USER = process.env.BSALE_WEB_USER;
const BSALE_PASS = process.env.BSALE_WEB_PASS;
const STORAGE_FILE = path.join(process.cwd(), '.bsale-session.json');

// Mapa BSale value → Supabase caja UUID + turno
const BSALE2CAJA = {
  '35': { id: 'f9ba9071-c0c4-402b-89eb-8d8e645cb645', nombre: 'CAJA 1 N.', turno: 'Tarde' },
  '37': { id: '0e28ce44-a6eb-4fe7-b787-396a17b6eed7', nombre: 'CAJA 2 N.', turno: 'Tarde' },
  '9':  { id: '6d872d03-2383-4c92-9157-0deb40be44f6', nombre: 'IRMA I.', turno: 'Mañana' },
  '30': { id: 'b6e52a93-e6e0-4bc1-aa3e-421b2031e96c', nombre: 'JACQUELINE Y.', turno: 'Mañana' },
};

const FECHA = '2026-06-15';
const FECHA_DISPLAY = '15/06/2026';

/**
 * Matching mejorado: busca palabras completas del nombre del proveedor en la observación.
 * Prioriza coincidencias multi-palabra sobre palabras sueltas.
 */
function matchProveedor(obs, proveedores) {
  const obsUpper = obs.toUpperCase();
  // Tokenizar observación en palabras completas
  const obsWords = obsUpper.split(/[\s,;:\-\.\(\)]+/).filter(w => w.length >= 3);

  let mejor = null;
  let mejorScore = { matchRatio: 0, totalWords: 0 };

  for (const p of proveedores) {
    const nom = p.nombre.toUpperCase().trim();
    const nomWords = nom.split(/[\s,\-]+/).filter(w => w.length >= 3);

    if (nomWords.length === 0) continue;

    // Contar cuántas palabras del nombre del proveedor aparecen como palabras COMPLETAS en la observación
    let coincidencias = 0;
    for (const nw of nomWords) {
      // Verificar que nw aparece como palabra completa en obsWords
      if (obsWords.includes(nw)) {
        coincidencias++;
      }
    }

    // Si nombre es una sola palabra y coincide exactamente → matcheo perfecto
    if (nomWords.length === 1 && coincidencias === 1) {
      // Si es una palabra >= 4 chars o es única, es buen match
      return p; // return inmediato para single-word exact match
    }

    // Para multi-palabra: al menos 50% de las palabras deben coincidir
    const ratio = coincidencias / nomWords.length;
    if (ratio >= 0.5 && (ratio > mejorScore.matchRatio || 
        (ratio === mejorScore.matchRatio && coincidencias > mejorScore.totalWords))) {
      mejor = p;
      mejorScore = { matchRatio: ratio, totalWords: coincidencias };
    }
  }

  return mejor;
}

(async () => {
  const browser = await chromium.launch({ headless: true, 
    args: ['--disable-blink-features=AutomationControlled']
  });
  let context;
  if (fs.existsSync(STORAGE_FILE)) context = await browser.newContext({ storageState: STORAGE_FILE });
  else context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  // Interceptar responses
  const receipts = {};
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('get_payment_receipt')) {
      const match = url.match(/id=(\d+)/);
      if (match) {
        try {
          const data = await response.json();
          receipts[match[1]] = data.html_doc || '';
        } catch(e) {}
      }
    }
  });

  // Login + cookies
  await page.goto('https://app.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  if (page.url().includes('login')) {
    console.log('Haciendo login...');
    await page.waitForSelector('input[type="text"], input[type="email"]', { state: 'visible', timeout: 20000 });
    await page.locator('input[type="text"], input[type="email"]').first().fill(BSALE_USER);
    await page.locator('input[type="password"]').first().fill(BSALE_PASS);
    await page.locator('input[type="password"]').first().press('Enter');
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(1000);
      if ((page.url().includes('app.bsale.cl') || page.url().includes('landing.bsale.cl')) && !page.url().includes('login')) break;
    }
    await context.storageState({ path: STORAGE_FILE });
  }
  const cookies = await context.cookies();
  await context.addCookies(cookies.map(c => ({
    name: c.name, value: c.value, domain: '.bsale.cl',
    path: c.path || '/', httpOnly: c.httpOnly, secure: c.secure, sameSite: 'Lax'
  })));

  // Obtener proveedores de Supabase
  const { createHash } = await import('crypto');
  const txt = fs.readFileSync('.env', 'utf8');
  const getVal = (k) => { const m = txt.match(new RegExp(k + '=(.+)')); return m ? m[1].trim() : null; };
  const supabaseKey = getVal('VITE_SUPABASE_SERVICE_KEY');
  const supabaseUrl = getVal('VITE_SUPABASE_URL');

  const provResp = await fetch(supabaseUrl + '/rest/v1/proveedores?select=id,nombre&activo=eq.true&limit=200', {
    headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey }
  });
  const proveedores = await provResp.json();
  console.log('Proveedores cargados:', proveedores.length);

  // Cajas a procesar
  const cajasConDatos = ['35', '37', '9', '30'];
  const allInserts = [];

  for (const bsaleVal of cajasConDatos) {
    const caja = BSALE2CAJA[bsaleVal];
    console.log(`\n=== ${caja.nombre} (${caja.turno}) ===`);

    // Navegar + seleccionar fecha + caja
    await page.goto('https://app2.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    await page.evaluate((f) => {
      const input = document.getElementById('fecha_reporte');
      if (input) {
        const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        s.call(input, f);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, FECHA_DISPLAY);
    await page.waitForTimeout(1500);

    await page.evaluate((val) => {
      const select = document.getElementById('id_vendedor_cierre');
      if (select) { select.value = val; select.dispatchEvent(new Event('change', { bubbles: true })); }
    }, bsaleVal);
    await page.waitForTimeout(2500);

    // Click Retiros de Efectivo
    const retirosBtn = page.locator('button', { hasText: 'Retiros de Efectivo' });
    if (await retirosBtn.count() === 0) {
      console.log('  Sin retiros');
      continue;
    }
    await retirosBtn.first().click();
    await page.waitForTimeout(2500);

    // Obtener lista de retiros
    const retirosList = await page.evaluate(() => {
      const items = document.querySelectorAll('#dsr_docs_detail li.hpc-item');
      return Array.from(items).map(li => {
        const label = li.querySelector('label');
        const fullText = label ? label.textContent : '';
        const num = (fullText.match(/Nº\s*(\d+)/) || [])[1];
        const amt = (fullText.match(/\$\s*([\d.]+)/) || [])[1];
        return { numero: num || '', monto: amt ? parseInt(amt.replace(/\./g, '')) : 0 };
      });
    });

    if (retirosList.length === 0) {
      console.log('  Sin retiros');
      continue;
    }
    console.log(`  Retiros encontrados: ${retirosList.length}`);

    // Click en cada botón print para obtener observaciones
    for (const retiro of retirosList) {
      const btns = page.locator('#dsr_docs_detail li.hpc-item button.hbi-print');
      const cnt = await btns.count();
      for (let i = 0; i < cnt; i++) {
        const code = await btns.nth(i).getAttribute('data-code');
        if (code && code.includes(retiro.numero)) {
          await btns.nth(i).click();
          await page.waitForTimeout(800);
          break;
        }
      }
    }

    // Extraer observaciones y matchear proveedores
    for (const retiro of retirosList) {
      const html = receipts[retiro.numero] || '';
      const obsMatch = html.match(/Observaci[óo]n:\s*([^<]+)/i);
      const obs = obsMatch ? obsMatch[1].trim() : '';
      const prov = matchProveedor(obs, proveedores);

      if (prov) {
        console.log(`  ✅ Nº ${retiro.numero} $${retiro.monto.toLocaleString('es-CL')} → ${prov.nombre} (${obs || '-'})`);
        allInserts.push({
          proveedor_id: prov.id,
          fecha_pago: FECHA,
          monto_pagado: retiro.monto,
          origen_fondos: 'caja',
          turno: caja.turno,
          caja_id: caja.id,
        });
      } else {
        console.log(`  ❌ Nº ${retiro.numero} $${retiro.monto.toLocaleString('es-CL')} → SIN PROVEEDOR (${obs || 'sin obs'})`);
      }
    }
  }

  // Insertar en pagos_proveedor
  console.log(`\n=== Insertando ${allInserts.length} pagos en pagos_proveedor ===`);
  for (const ins of allInserts) {
    const r = await fetch(supabaseUrl + '/rest/v1/pagos_proveedor', {
      method: 'POST',
      headers: { 
        apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json', Prefer: 'return=representation'
      },
      body: JSON.stringify(ins)
    });
    if (r.ok) {
      const d = await r.json();
      const nom = proveedores.find(p => p.id === ins.proveedor_id)?.nombre || '?';
      console.log(`  ✅ ${d[0]?.id?.substring(0,8)} | ${nom.padEnd(14)} | $${ins.monto_pagado.toLocaleString('es-CL')}`);
    } else {
      console.log('  ❌ Error:', (await r.text()).substring(0, 150));
    }
  }

  console.log('\n✅ Proceso completado');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
