require('dotenv').config();
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BSALE_USER = process.env.BSALE_WEB_USER;
const BSALE_PASS = process.env.BSALE_WEB_PASS;
const STORAGE_FILE = path.join(process.cwd(), '.bsale-session.json');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled']
  });
  let context;
  if (fs.existsSync(STORAGE_FILE)) context = await browser.newContext({ storageState: STORAGE_FILE });
  else context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  // Capturar respuestas de get_payment_receipt
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

  await page.goto('https://app.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  if (page.url().includes('login')) {
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

  await page.goto('https://app2.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);

  await page.evaluate((f) => {
    const input = document.getElementById('fecha_reporte');
    if (input) {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(input, f);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, '18/05/2026');
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    const select = document.getElementById('id_vendedor_cierre');
    if (select) { select.value = '30'; select.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(3000);

  // Click "Retiros de Efectivo" para expandir
  await page.locator('button', { hasText: 'Retiros de Efectivo' }).first().click();
  await page.waitForTimeout(3000);

  // Obtener lista de retiros con sus IDs
  const retirosList = await page.evaluate(() => {
    const items = document.querySelectorAll('#dsr_docs_detail li.hpc-item');
    return Array.from(items).map(li => {
      const label = li.querySelector('label');
      const fullText = label ? label.textContent : '';
      const numMatch = fullText.match(/Nº\s*(\d+)/);
      const amtMatch = fullText.match(/\$\s*([\d.]+)/);
      return {
        numero: numMatch ? numMatch[1] : '',
        monto: amtMatch ? parseInt(amtMatch[1].replace(/\./g, '')) : 0
      };
    });
  });

  console.log('Retiros encontrados:', retirosList.length);

  // Click en cada botón print para gatillar la API
  for (const retiro of retirosList) {
    const buttons = page.locator('#dsr_docs_detail li.hpc-item button.hbi-print');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const btnText = await btn.getAttribute('data-code');
      if (btnText && btnText.includes(retiro.numero)) {
        await btn.click();
        await page.waitForTimeout(1000);
        break;
      }
    }
  }
  await page.waitForTimeout(1000);

  // Extraer observaciones y generar CSV
  function extractObservacion(html) {
    if (!html) return '';
    const match = html.match(/Observaci[óo]n:\s*([^<]+)/i);
    return match ? match[1].trim() : '';
  }

  const csvLines = [['fecha', 'caja', 'numero_retiro', 'monto', 'observacion'].join(',')];
  console.log('\n=== Retiros con Observaciones ===');
  for (const retiro of retirosList) {
    const obs = extractObservacion(receipts[retiro.numero]);
    csvLines.push(['2026-05-18', 'JACQUELINE Y.', retiro.numero, retiro.monto, '"' + obs.replace(/"/g, '""') + '"'].join(','));
    console.log(`  Nº ${retiro.numero.padStart(5)} → $${retiro.monto.toLocaleString('es-CL').padStart(8)} | Obs: ${obs || '(sin observación)'}`);
  }

  const OUT = path.join(process.cwd(), 'retiros_2026-05-18_JACQUELINE.csv');
  fs.writeFileSync(OUT, csvLines.join('\n'), 'utf8');
  console.log(`\n✅ CSV guardado: ${OUT}`);
  console.log(csvLines.join('\n'));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
