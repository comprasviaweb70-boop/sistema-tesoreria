require('dotenv').config();
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BSALE_USER = process.env.BSALE_WEB_USER;
const BSALE_PASS = process.env.BSALE_WEB_PASS;
const STORAGE_FILE = path.join(process.cwd(), '.bsale-session.json');

(async () => {
  const browser = await chromium.launch({ 
    headless: true
  });
  let context;
  if (fs.existsSync(STORAGE_FILE)) context = await browser.newContext({ storageState: STORAGE_FILE });
  else context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

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
      if ((page.url().includes('app.bsale.cl') || page.url().includes('landing.bsale.cl')) && !page.url().includes('login')) {
        console.log('  ✅ Login exitoso'); break;
      }
    }
    await context.storageState({ path: STORAGE_FILE });
  }
  const cookies = await context.cookies();
  await context.addCookies(cookies.map(c => ({
    name: c.name, value: c.value, domain: '.bsale.cl',
    path: c.path || '/', httpOnly: c.httpOnly, secure: c.secure, sameSite: 'Lax'
  })));

  await page.goto('https://app2.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url().substring(0, 100));

  // Fecha 18/05/2026
  await page.evaluate((f) => {
    const input = document.getElementById('fecha_reporte');
    if (input) {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(input, f);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, '18/05/2026');
  await page.waitForTimeout(2000);

  // Seleccionar JACQUELINE (value=30)
  await page.evaluate(() => {
    const select = document.getElementById('id_vendedor_cierre');
    if (select) { select.value = '30'; select.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(3000);

  // Click en "Retiros de Efectivo"
  const btn = page.locator('button', { hasText: 'Retiros de Efectivo' });
  const count = await btn.count();
  if (count > 0) {
    await btn.first().click();
    console.log('✅ Click en Retiros de Efectivo');
  } else {
    console.log('❌ Botón no encontrado');
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(3000);

  // Extraer datos de retiros desde el DOM
  const retiros = await page.evaluate(() => {
    const items = document.querySelectorAll('#dsr_docs_detail li.hpc-item');
    const results = [];
    items.forEach(item => {
      const label = item.querySelector('label');
      if (label) {
        const fullText = label.textContent || '';
        // "Retiros de Efectivo Nº 42353$ 26.160"
        const matchNum = fullText.match(/Nº\s*(\d+)/);
        const matchAmount = fullText.match(/\$\s*([\d.]+)/);
        const numero = matchNum ? matchNum[1] : '';
        const amount = matchAmount ? parseInt(matchAmount[1].replace(/\./g, '')) : 0;
        results.push({ numero, amount, detail: 'Retiro Nº ' + numero });
      }
    });
    return results;
  });

  console.log('\n📋 Retiros encontrados:', retiros.length);
  const csvLines = [['fecha', 'caja', 'detalle', 'numero_referencia', 'monto'].join(',')];
  retiros.forEach(r => {
    csvLines.push(['2026-05-18', 'JACQUELINE Y.', r.detail, r.numero, r.amount].join(','));
    console.log(`  Retiro Nº ${r.numero.padStart(5)} → $${r.amount.toLocaleString('es-CL')}`);
  });

  // Total
  const total = retiros.reduce((s, r) => s + r.amount, 0);
  csvLines.push(['2026-05-18', 'JACQUELINE Y.', 'TOTAL RETIROS', '', total].join(','));
  console.log(`  ${'─'.repeat(30)}\n  TOTAL → $${total.toLocaleString('es-CL')}`);

  // Guardar CSV
  const OUT = path.join(process.cwd(), 'retiros_2026-05-18_JACQUELINE.csv');
  fs.writeFileSync(OUT, csvLines.join('\n'), 'utf8');
  console.log(`\n✅ CSV guardado: ${OUT}`);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
