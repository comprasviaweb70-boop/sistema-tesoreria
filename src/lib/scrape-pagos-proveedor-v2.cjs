require('dotenv').config();
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BSALE_USER = process.env.BSALE_WEB_USER;
const BSALE_PASS = process.env.BSALE_WEB_PASS;
const STORAGE_FILE = path.join(process.cwd(), '.bsale-session.json');
const FECHA = '2026-06-15';
const FECHA_DISPLAY = '15/06/2026';

const BSALE2CAJA = {
  '35': { id: 'f9ba9071-c0c4-402b-89eb-8d8e645cb645', nombre: 'CAJA 1 N.', turno: 'Tarde' },
  '37': { id: '0e28ce44-a6eb-4fe7-b787-396a17b6eed7', nombre: 'CAJA 2 N.', turno: 'Tarde' },
  '9':  { id: '6d872d03-2383-4c92-9157-0deb40be44f6', nombre: 'IRMA I.', turno: 'Mañana' },
  '30': { id: 'b6e52a93-e6e0-4bc1-aa3e-421b2031e96c', nombre: 'JACQUELINE Y.', turno: 'Mañana' },
};

function matchProveedor(obs, proveedores) {
  if (!obs) return null;
  const obsUpper = obs.toUpperCase();
  const obsWords = obsUpper.split(/[\s,;:\-\.\(\)]+/).filter(w => w.length >= 3);
  let mejor = null;
  let mejorRatio = 0;
  let mejorCoincidencias = 0;
  for (const p of proveedores) {
    const nom = p.nombre.toUpperCase().trim();
    const nomWords = nom.split(/[\s,\-]+/).filter(w => w.length >= 3);
    if (nomWords.length === 0) continue;
    let coincidencias = 0;
    for (const nw of nomWords) {
      if (obsWords.includes(nw)) coincidencias++;
    }
    const ratio = coincidencias / nomWords.length;
    if (ratio >= 0.5 && (ratio > mejorRatio || (ratio === mejorRatio && coincidencias > mejorCoincidencias))) {
      mejor = p;
      mejorRatio = ratio;
      mejorCoincidencias = coincidencias;
    }
  }
  return mejor;
}

(async () => {
  // Probar matching con los retiros de CAJA 2
  const proveedores = [
    { id: 'dummy', nombre: 'JENIFER' },
    { id: 'dummy2', nombre: 'OTROS' },
  ];
  console.log('Test matching:');
  console.log('  "PAGO JENIFER" →', matchProveedor('PAGO JENIFER', proveedores)?.nombre || 'NO MATCH');
  console.log('');

  // Ahora el scraper real
  const browser = await chromium.launch({ headless: true, 
    args: ['--disable-blink-features=AutomationControlled']
  });
  let context;
  if (fs.existsSync(STORAGE_FILE)) context = await browser.newContext({ storageState: STORAGE_FILE });
  else context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  const receipts = {};
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('get_payment_receipt') && url.includes('id=')) {
      const match = url.match(/id=(\d+)/);
      if (match) {
        try { receipts[match[1]] = (await response.json()).html_doc || ''; } catch(e) {}
      }
    }
  });

  // Login
  await page.goto('https://app.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  if (page.url().includes('login')) {
    console.log('Login...');
    await page.waitForSelector('input[type=\"text\"], input[type=\"email\"]', { state: 'visible', timeout: 20000 });
    await page.locator('input[type=\"text\"], input[type=\"email\"]').first().fill(BSALE_USER);
    await page.locator('input[type=\"password\"]').first().fill(BSALE_PASS);
    await page.locator('input[type=\"password\"]').first().press('Enter');
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

  // Obtener proveedores
  const txt = fs.readFileSync('.env', 'utf8');
  const getVal = (k) => { const m = txt.match(new RegExp(k + '=(.+)')); return m ? m[1].trim() : null; };
  const supabaseKey = getVal('VITE_SUPABASE_SERVICE_KEY');
  const supabaseUrl = getVal('VITE_SUPABASE_URL');
  const provResp = await fetch(supabaseUrl + '/rest/v1/proveedores?select=id,nombre&activo=eq.true&limit=200', {
    headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey }
  });
  const proveedoresList = await provResp.json();
  console.log('Proveedores:', proveedoresList.length);

  // Procesar cada caja
  const cajasConDatos = ['35', '37', '9', '30'];
  const allInserts = [];

  for (const bsaleVal of cajasConDatos) {
    const caja = BSALE2CAJA[bsaleVal];
    console.log(`\n=== ${caja.nombre} ===`);

    // Ir a close page
    await page.goto('https://app2.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    // Fecha
    await page.evaluate((f) => {
      const inp = document.getElementById('fecha_reporte');
      if (inp) {
        const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        s.call(inp, f);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, FECHA_DISPLAY);
    await page.waitForTimeout(2000);

    // Seleccionar caja
    await page.evaluate((val) => {
      const sel = document.getElementById('id_vendedor_cierre');
      if (sel) { sel.value = val; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }, bsaleVal);
    await page.waitForTimeout(4000); // Más tiempo para carga

    // Click en Retiros de Efectivo
    let retirosBtn = page.locator('button', { hasText: 'Retiros de Efectivo' });
    let btnCount = await retirosBtn.count();
    if (btnCount === 0) {
      // Intentar con texto exacto
      retirosBtn = page.locator('button:has-text("Retiros")');
      btnCount = await retirosBtn.count();
    }
    if (btnCount === 0) {
      console.log('  Sin retiros');
      continue;
    }
    await retirosBtn.first().click();
    await page.waitForTimeout(3000);

    // Leer retiros del DOM
    const retirosList = await page.evaluate(() => {
      const items = document.querySelectorAll('#dsr_docs_detail li.hpc-item');
      return Array.from(items).map(li => {
        const t = (li.querySelector('label')?.textContent || '');
        const n = (t.match(/Nº\s*(\d+)/) || [])[1];
        const a = (t.match(/\$\s*([\d.]+)/) || [])[1];
        return { numero: n || '', monto: a ? parseInt(a.replace(/\./g, '')) : 0 };
      });
    });

    console.log(`  Retiros: ${retirosList.length}`);
    if (retirosList.length === 0) continue;

    // Click en cada print button
    for (const retiro of retirosList) {
      const btns = page.locator('#dsr_docs_detail li.hpc-item button.hbi-print');
      const cnt = await btns.count();
      for (let i = 0; i < cnt; i++) {
        const code = await btns.nth(i).getAttribute('data-code');
        if (code && code.includes(retiro.numero)) {
          await btns.nth(i).click();
          await page.waitForTimeout(1000);
          break;
        }
      }
    }

    // Matchear
    for (const retiro of retirosList) {
      const html = receipts[retiro.numero] || '';
      const obs = (html.match(/Observaci[óo]n:\s*([^<]+)/i) || [])[1]?.trim() || '';
      const prov = matchProveedor(obs, proveedoresList);
      if (prov) {
        console.log(`  ✅ Nº ${retiro.numero} $${retiro.monto.toLocaleString('es-CL')} → ${prov.nombre}`);
        allInserts.push({
          proveedor_id: prov.id, fecha_pago: FECHA,
          monto_pagado: retiro.monto, origen_fondos: 'caja',
          turno: caja.turno, caja_id: caja.id,
        });
      } else {
        console.log(`  ❌ Nº ${retiro.numero} $${retiro.monto.toLocaleString('es-CL')} → SIN PROV (${obs || '-'})`);
      }
    }
  }

  // Insertar
  console.log(`\n=== Insertando ${allInserts.length} pagos ===`);
  for (const ins of allInserts) {
    const r = await fetch(supabaseUrl + '/rest/v1/pagos_proveedor', {
      method: 'POST',
      headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(ins)
    });
    if (r.ok) {
      const d = await r.json();
      const nom = proveedoresList.find(p => p.id === ins.proveedor_id)?.nombre || '?';
      console.log(`  ✅ ${d[0].id.substring(0,8)} | ${nom.padEnd(14)} | $${ins.monto_pagado.toLocaleString('es-CL')}`);
    } else {
      const err = await r.text();
      console.log('  ❌ Error:', err.substring(0, 150));
    }
  }
  console.log('\n✅ Hecho');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
