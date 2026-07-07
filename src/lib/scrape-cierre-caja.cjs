/**
 * RPA de cierre de caja para BSale (interacción DOM)
 * Navega a la página de cierre, cambia fecha, selecciona cada caja,
 * y extrae datos del DOM renderizado.
 *
 * Uso: node src/lib/scrape-cierre-caja.cjs --fecha 2026-05-18
 */

require('dotenv').config();
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BSALE_USER = process.env.BSALE_WEB_USER;
const BSALE_PASS = process.env.BSALE_WEB_PASS;
if (!BSALE_USER || !BSALE_PASS) { console.error('ERROR: Credenciales faltantes en .env'); process.exit(1); }

const STORAGE_FILE = path.join('/home/jsanz/.hermes/bsale-sessions', 'session.json');
const args = process.argv.slice(2);
const params = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--fecha') params.fecha = args[++i];
}
// Por defecto: procesar el dia de ayer (fecha del sistema)
const fecha = params.fecha || (() => {
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  return ayer.toISOString().split('T')[0];
})();
// Convertir YYYY-MM-DD a DD/MM/YYYY para el datepicker
const fechaParts = fecha.split('-');
const fechaDisplay = `${fechaParts[2]}/${fechaParts[1]}/${fechaParts[0]}`;
const OUT = path.join(process.cwd(), 'cierre_caja_' + fecha + '.csv');

// Lista de cajas del select id_vendedor_cierre
const CAJAS = [
  { value: '0',  nombre: 'Todos' },
  { value: '26', nombre: 'ALEJANDRA C.' },
  { value: '35', nombre: 'CAJA 1 N.' },
  { value: '37', nombre: 'CAJA 2 N.' },
  { value: '39', nombre: 'CAJA 3 N.' },
  { value: '27', nombre: 'GABRIEL S.' },
  { value: '9',  nombre: 'IRMA I.' },
  { value: '30', nombre: 'JACQUELINE Y.' },
  { value: '2',  nombre: 'Julian S.' },
];

/**
 * Extrae valores numéricos del texto visible de la página.
 * Busca patrones como "EFECTIVO (49): + $ 276.165"
 */
function extractDataFromText(text, isMultiple = false) {
  const result = {
    efectivo: 0, debito: 0, tarjeta_credito: 0, credito_local: 0,
    transferencia: 0, edenred: 0,
    apertura: 0, total_efectivo: 0, retiros: 0, vuelto: 0,
    efectivoFinal: 0, diferenciaEfectivo: 0, diferenciaTotal: 0,
    totalVentas: 0
  };

  // Bandera para evitar duplicar POS MERCADOPAGOPOINT
  let posMercadoRegistrado = false;

  // Función para extraer monto: "$ 276.165" → 276165, "$ 1.234.567" → 1234567
  const parseAmount = (str) => {
    if (!str) return 0;
    const clean = str.replace(/[$\s]/g, '').replace(/\./g, '');
    return parseInt(clean) || 0;
  };

  // Buscar Resumen de Ventas $ XXX
  const ventasMatch = text.match(/Resumen de Ventas\s*\$?\s*([\d.]+)/);
  if (ventasMatch) result.totalVentas = parseAmount(ventasMatch[1]);

  // Procesar líneas, algunas son multi-línea (label en línea 1, valor en línea 2)
  const lines = text.split('\n');
  let prevLabel = '';
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.includes('Sin Registros')) continue;

    // Efectivo Final (label y valor en líneas separadas)
    if (/^Efectivo Final/i.test(trimmed)) {
      // Buscar el $ en la siguiente línea
      const nextLine = lines[i + 1] || '';
      const m = nextLine.match(/\$\s*([\d.]+)/);
      if (m) result.efectivoFinal = parseAmount(m[1]);
      continue;
    }
    // Diferencia Efectivo
    else if (/^Diferencia Efectivo/i.test(trimmed)) {
      const nextLine = lines[i + 1] || '';
      const m = nextLine.match(/\$\s*([\d.]+)/);
      if (m) result.diferenciaEfectivo = parseAmount(m[1]);
      continue;
    }
    // Diferencia Total Caja
    else if (/^Diferencia Total/i.test(trimmed)) {
      const nextLine = lines[i + 1] || '';
      const m = nextLine.match(/\$\s*([\d.]+)/);
      if (m) result.diferenciaTotal = parseAmount(m[1]);
      continue;
    }
    // Resumen de Ventas: valor en la misma línea
    else if (/^Resumen de Ventas/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) result.totalVentas = parseAmount(m[1]);
      continue;
    }
    // No procesar más líneas después de "Resumen de Documentos"
    else if (/^Resumen de Documentos/i.test(trimmed)) {
      break;
    }

    // EFECTIVO: "EFECTIVO (49): + $ 276.165" → capturar "276.165"
    if (/^EFECTIVO/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) {
        if (isMultiple) result.efectivo += parseAmount(m[1]);
        else if (result.efectivo === 0) result.efectivo = parseAmount(m[1]);
      }
    }
    // TARJETA DEBITO: "TARJETA DEBITO (38): + $ 160.269"
    else if (/^TARJETA DEBITO/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) {
        if (isMultiple) result.debito += parseAmount(m[1]);
        else if (result.debito === 0) result.debito = parseAmount(m[1]);
      }
    }
    // POS MERCADOPAGOPOINT: se suma a TARJETA DEBITO (nuevo estándar 2026-06-26)
    else if (/^POS\s+MERCADOPAGOPOINT/i.test(trimmed) && !posMercadoRegistrado) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) {
        result.debito += parseAmount(m[1]);
        posMercadoRegistrado = true;
        console.log(`    → POS MERCADOPAGOPOINT +$${parseAmount(m[1]).toLocaleString('es-CL')} sumado a débito`);
      }
    }
    // TARJETA CREDITO
    else if (/^TARJETA CREDITO/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) {
        if (isMultiple) result.tarjeta_credito += parseAmount(m[1]);
        else if (result.tarjeta_credito === 0) result.tarjeta_credito = parseAmount(m[1]);
      }
    }
    // CREDITO (crédito directo/local, distinto de tarjeta)
    else if (/^CREDITO/i.test(trimmed) && !trimmed.includes('TARJETA')) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) {
        if (isMultiple) result.credito_local += parseAmount(m[1]);
        else if (result.credito_local === 0) result.credito_local = parseAmount(m[1]);
      }
    }
    // TRANSFERENCIA: "TRANSFERENCIA BANCARIA (2): + $ 193.165"
    else if (/^TRANSFERENCIA/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) {
        if (isMultiple) result.transferencia += parseAmount(m[1]);
        else if (result.transferencia === 0) result.transferencia = parseAmount(m[1]);
      }
    }
    // EDENRED: "EDENRED (1): + $ 6.310"
    else if (/^EDENRED/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) {
        if (isMultiple) result.edenred += parseAmount(m[1]);
        else if (result.edenred === 0) result.edenred = parseAmount(m[1]);
      }
    }
    // Vuelto: "Vuelto - $ 72.184"
    else if (/^Vuelto/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) result.vuelto = parseAmount(m[1]);
    }
    // Efectivo Final: "Efectivo Final $ 132.180"
    else if (/^Efectivo Final/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) result.efectivoFinal = parseAmount(m[1]);
    }
    // Diferencia Efectivo: "Diferencia Efectivo + $ 49"
    else if (/^Diferencia Efectivo/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) result.diferenciaEfectivo = parseAmount(m[1]);
    }
    // Diferencia Total Caja: "Diferencia Total Caja + $ 49"
    else if (/^Diferencia Total/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) result.diferenciaTotal = parseAmount(m[1]);
    }
    // Saldo de Apertura: "Saldo de Apertura + $ 168.970"
    else if (/saldo\s*de\s*apertura/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) {
        const val = parseAmount(m[1]);
        if (isMultiple) result.apertura += val;
        else if (result.apertura === 0) result.apertura = val;
      }
    }
    // Retiros de Efectivo
    else if (/^Retiros de Efectivo/i.test(trimmed)) {
      const m = trimmed.match(/\$\s*([\d.]+)/);
      if (m) result.retiros = parseAmount(m[1]);
    }
  }

  return result;
}

async function gotoConReintentos(page, url, options = {}) {
  const maxIntentos = 3;
  let lastError;
  for (let i = 1; i <= maxIntentos; i++) {
    try {
      await page.goto(url, options);
      return;
    } catch (e) {
      lastError = e;
      console.log(`  ⚠️ Intento ${i}/${maxIntentos} falló para ${url}: ${e.message}`);
      if (i < maxIntentos) {
        const espera = Math.min(1000 * Math.pow(2, i - 1), 10000);
        console.log(`  Reintentando en ${espera}ms...`);
        await new Promise(r => setTimeout(r, espera));
      }
    }
  }
  throw new Error(`No se pudo cargar ${url} tras ${maxIntentos} intentos: ${lastError.message}`);
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true, 
      args: ['--disable-blink-features=AutomationControlled', '--disable-autofill', '--disable-saved-passwords']
    });

    let context;
    if (fs.existsSync(STORAGE_FILE)) {
      console.log('Cargando sesión guardada...');
      context = await browser.newContext({ storageState: STORAGE_FILE });
    } else {
      context = await browser.newContext();
    }
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // ---------- LOGIN (si necesario) ----------
    console.log('Verificando sesión...');
    await gotoConReintentos(page, 'https://app.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    if (page.url().includes('login')) {
      console.log('Haciendo login...');
      await page.waitForSelector('input[type="text"], input[type="email"]', { state: 'visible', timeout: 20000 });
      await page.locator('input[type="text"], input[type="email"]').first().fill(BSALE_USER);
      await page.locator('input[type="password"]').first().fill(BSALE_PASS);
      await page.locator('input[type="password"]').first().press('Enter');
      let loggedIn = false;
      for (let i = 0; i < 25; i++) {
        await page.waitForTimeout(1000);
        const url = page.url();
        if ((url.includes('app.bsale.cl') || url.includes('landing.bsale.cl')) && !url.includes('login')) {
          loggedIn = true; console.log('  ✅ Login exitoso'); break;
        }
      }
      if (!loggedIn) { console.error('ERROR: Login falló'); await context.close(); process.exit(1); }
      await context.storageState({ path: STORAGE_FILE });
    } else {
      console.log('Sesión activa ✓');
    }

    // Reescribir cookies para cross-subdominio
    const cookies = await context.cookies();
    await context.addCookies(cookies.map(c => ({
      name: c.name, value: c.value, domain: '.bsale.cl',
      path: c.path || '/', httpOnly: c.httpOnly, secure: c.secure, sameSite: 'Lax'
    })));

    // ---------- IR A PÁGINA DE CIERRE ----------
    console.log('Cargando página de cierre de caja...');
    await gotoConReintentos(page, 'https://app2.bsale.cl/mobile/close', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    console.log('  URL:', page.url().substring(0, 100));

    // Cambiar la fecha al día deseado
    console.log('Estableciendo fecha: %s...', fechaDisplay);
    await page.evaluate((fechaStr) => {
      const input = document.getElementById('fecha_reporte');
      if (input) {
        // jQuery UI Datepicker requiere disparar eventos específicos
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(input, fechaStr);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        // Para jQuery UI Datepicker
        if (typeof $ !== 'undefined' && $.fn && $.fn.datepicker) {
          $(input).datepicker('setDate', fechaStr);
        }
      }
    }, fechaDisplay);
    await page.waitForTimeout(2000);

    // También intentar con el método directo de jQuery UI
    await page.evaluate((fechaDisplay) => {
      const input = document.getElementById('fecha_reporte');
      if (input) {
        input.value = fechaDisplay;
        ['change', 'input', 'blur', 'keyup'].forEach(evt => {
          input.dispatchEvent(new Event(evt, { bubbles: true }));
        });
      }
    }, fechaDisplay);
    await page.waitForTimeout(2000);

    // Verificar qué fecha tiene ahora
    const currentDate = await page.evaluate(() => {
      const input = document.getElementById('fecha_reporte');
      return input ? input.value : 'no encontrado';
    });
    console.log('  Fecha actual en input:', currentDate);

    // ---------- PROCESAR CADA CAJA (excepto "Todos" que se calcula al final) ----------
    const cajasIndividuales = CAJAS.filter(c => c.value !== '0');
    const resultados = {};  // guardar resultados para calcular Totales
    const csvLines = [[
      'fecha', 'caja_id', 'caja_nombre', 'efectivo', 'debito',
      'tarjeta_credito', 'credito_local', 'transferencia', 'edenred',
      'apertura', 'total_efectivo', 'retiros', 'vuelto',
      'efectivo_final', 'diferencia_efectivo', 'diferencia_total',
      'total_ventas', 'observaciones'
    ].join(',')];
    let errores = 0;

    for (const caja of cajasIndividuales) {
      try {
        console.log('\nProcesando: %s (value=%s)...', caja.nombre, caja.value);

        // Seleccionar caja — el select nativo está oculto, disparamos eventos
        // que atraviesen shadow DOM y simulamos interacción real
        await page.evaluate((value) => {
          const select = document.getElementById('id_vendedor_cierre');
          if (!select) return;
          select.value = value;
          // Eventos con composed para atravesar shadow DOM (Svelte/Web Components)
          const inputEvt = new Event('input', { bubbles: true, composed: true });
          Object.defineProperty(inputEvt, 'target', { value: select, enumerable: true });
          select.dispatchEvent(inputEvt);
          const changeEvt = new Event('change', { bubbles: true, composed: true });
          Object.defineProperty(changeEvt, 'target', { value: select, enumerable: true });
          select.dispatchEvent(changeEvt);
          // Forzar blur para que el framework detecte salida del campo
          select.blur();
          // Simular keydown Enter
          const keyEvt = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true });
          select.dispatchEvent(keyEvt);
          const keyUpEvt = new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, composed: true });
          select.dispatchEvent(keyUpEvt);
        }, caja.value);

        // También enviar Enter a nivel de página (por si hay un form)
        await page.keyboard.press('Enter');
        await page.waitForTimeout(4000);

        // Buscar y hacer click en botón de búsqueda/consulta si existe
        const btnTextos = ['Buscar', 'Consultar', 'Filtrar', 'Consultar Cierre', 'Ver', 'Aceptar'];
        for (const txt of btnTextos) {
          const btn = page.locator(`button:has-text("${txt}")`);
          if (await btn.count() > 0) {
            await btn.first().click({ force: true }).catch(() => {});
            await page.waitForTimeout(2000);
            break;
          }
        }

        // === DETECTAR SELECT DE SESIONES / TURNOS ===
        // Algunas cajas tienen múltiples sesiones (ej: error de apertura).
        // Seleccionamos la PRIMERA (la más temprana del día).
        await page.waitForTimeout(1500);
        const sesionesInfo = await page.evaluate(() => {
          const selects = Array.from(document.querySelectorAll('select'));
          for (const s of selects) {
            if (s.id === 'id_vendedor_cierre') continue;
            if (s.id === 'fecha_reporte') continue;
            const opts = Array.from(s.querySelectorAll('option')).filter(o => o.value && o.value !== '0' && o.value !== '');
            if (opts.length >= 1) {
              // Detectar si parece un selector de sesión (opciones con hora o fecha)
              const texts = opts.map(o => o.textContent.trim());
              const pareceSesion = texts.some(t => /\d{2}:\d{2}/.test(t));
              if (pareceSesion) {
                return {
                  id: s.id,
                  name: s.name,
                  className: s.className,
                  opciones: opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
                };
              }
            }
          }
          return null;
        });

        if (sesionesInfo && sesionesInfo.opciones.length > 1) {
          console.log('    Sesiones encontradas: ' + sesionesInfo.opciones.map(o => o.text).join(' | '));
          // Elegir la sesión con hora más TEMPRANA del día
          // (BSale ordena de más reciente a más antigua; la correcta es la primera apertura)
          const parseHora = (text) => {
            const m = text.match(/(\d{2}):(\d{2}):(\d{2})/);
            return m ? (parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3])) : Infinity;
          };
          const masTemprana = sesionesInfo.opciones.slice().sort((a, b) => parseHora(a.text) - parseHora(b.text))[0];
          console.log('    → Seleccionando sesión más temprana: %s', masTemprana.text);
          await page.evaluate((args) => {
            const s = document.getElementById(args.id) || document.querySelector(`select[name="${args.name}"]`) || document.querySelector(`.${args.className.split(' ')[0]}`);
            if (s) {
              s.value = args.value;
              s.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              s.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
              s.blur();
            }
          }, { id: sesionesInfo.id, name: sesionesInfo.name, className: sesionesInfo.className, value: masTemprana.value });
          await page.waitForTimeout(3000);
        } else if (sesionesInfo) {
          console.log('    Sesión única: %s', sesionesInfo.opciones[0]?.text || 'N/A');
        }

        // Extraer texto visible de la página
        const pageText = await page.locator('body').innerText().catch(() => '');
        // Pasar flag isMultiple: si es "Todos" (value=0), sumar múltiples líneas del mismo tipo
        const data = extractDataFromText(pageText, caja.value === '0');

        // Si no hay datos (Sin Registros), igual registramos con 0s
        const totalPaymentTypes = data.efectivo + data.debito + data.tarjeta_credito + data.credito_local + data.transferencia + data.edenred;
        const tieneDatos = totalPaymentTypes > 0 || data.vuelto > 0 || data.efectivoFinal > 0;

        // Extraer Saldo Apertura desde el HTML (sub-línea dentro de Total Efectivo)
        if (tieneDatos) {
          try {
            const aperturaVal = await page.evaluate(() => {
              // Búsqueda flexible: cualquier elemento que contenga "Saldo de Apertura"
              const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
              );
              let node;
              while (node = walker.nextNode()) {
                const text = (node.textContent || '').trim();
                if (/saldo\s*de\s*apertura/i.test(text)) {
                  // Buscar el valor en el padre o hermanos
                  const parent = node.parentElement;
                  if (parent) {
                    // Buscar el primer $ en el padre (excluyendo el nodo del label)
                    const allText = parent.textContent || '';
                    const amounts = allText.match(/\$\s*([\d.]+)/g);
                    if (amounts && amounts.length > 0) {
                      // Tomar el último monto (es el valor)
                      const last = amounts[amounts.length - 1];
                      return last.replace(/[$\s\.]/g, '');
                    }
                  }
                  // Buscar en el padre del padre (más arriba)
                  const grandparent = parent ? parent.parentElement : null;
                  if (grandparent) {
                    const gt = grandparent.textContent || '';
                    const am = gt.match(/\$\s*([\d.]+)/);
                    if (am) return am[1].replace(/\./g, '');
                  }
                }
              }
              return null;
            });
            if (aperturaVal) {
              data.apertura = parseInt(aperturaVal) || 0;
            }
          } catch (e) {
            // ignorar
          }

          // Extraer Total Efectivo REAL (columna derecha, data-value del input)
          try {
            const totalEfReal = await page.evaluate(() => {
              // Buscar el input en la fila de Total Efectivo con clase crd_det_real
              const buttons = document.querySelectorAll('button');
              for (const btn of buttons) {
                if (btn.textContent.includes('Total Efectivo')) {
                  const parentRow = btn.closest('div')?.parentElement;
                  if (parentRow) {
                    const realInput = parentRow.querySelector('.crd_det_real input');
                    if (realInput) {
                      const dv = realInput.getAttribute('data-value');
                      if (dv) return dv;
                    }
                    // Fallback: buscar el input en el siguiente hermano
                    const nextDiv = parentRow.nextElementSibling;
                    if (nextDiv) {
                      const inp = nextDiv.querySelector('input[data-value]');
                      if (inp) return inp.getAttribute('data-value');
                    }
                  }
                }
              }
              return null;
            });
            if (totalEfReal) {
              data.total_efectivo = parseInt(totalEfReal) || 0;
            }
          } catch (e) {
            // ignorar
          }
        }

        // Guardar resultado para calcular Totales
        resultados[caja.value] = data;

        csvLines.push([
          fecha, caja.value, caja.nombre,
          data.efectivo, data.debito, data.tarjeta_credito, data.credito_local,
          data.transferencia, data.edenred,
          data.apertura,
          data.total_efectivo,
          0, // retiros desde el DOM (extraer del modal)
          data.vuelto,
          data.efectivoFinal,
          data.diferenciaEfectivo,
          data.diferenciaTotal,
          data.totalVentas || totalPaymentTypes,
          tieneDatos ? '' : 'Sin datos para esta caja'
        ].join(','));

        if (tieneDatos) {
          console.log('  ✓ %s — efec=%s deb=%s tc=%s cl=%s transf=%s eden=%s vue=%s',
            caja.nombre,
            data.efectivo.toLocaleString('es-CL'),
            data.debito.toLocaleString('es-CL'),
            data.tarjeta_credito.toLocaleString('es-CL'),
            data.credito_local.toLocaleString('es-CL'),
            data.transferencia.toLocaleString('es-CL'),
            data.edenred.toLocaleString('es-CL'),
            data.vuelto.toLocaleString('es-CL')
          );
        } else {
          console.log('  - %s — sin datos en esta fecha', caja.nombre);
        }
      } catch (err) {
        errores++;
        console.error('  ✗ %s : %s', caja.nombre, err?.message || err);
        csvLines.push([fecha, caja.value, caja.nombre, '', '', '', '', '', '', '', '', '', '', '', '', 'ERROR: ' + (err?.message || err)].join(','));
      }
    }

    // ---------- CALCULAR "Todos" como suma de cajas individuales ----------
    const totals = { efectivo: 0, debito: 0, tarjeta_credito: 0, credito_local: 0,
      transferencia: 0, edenred: 0,
      apertura: 0, total_efectivo: 0, vuelto: 0, efectivoFinal: 0,
      diferenciaEfectivo: 0, diferenciaTotal: 0, totalVentas: 0 };
    for (const data of Object.values(resultados)) {
      totals.efectivo += data.efectivo;
      totals.debito += data.debito;
      totals.tarjeta_credito += data.tarjeta_credito;
      totals.credito_local += data.credito_local;
      totals.transferencia += data.transferencia;
      totals.edenred += data.edenred;
      totals.apertura += data.apertura;
      totals.vuelto += data.vuelto;
      totals.efectivoFinal += data.efectivoFinal;
      totals.diferenciaEfectivo += data.diferenciaEfectivo;
      totals.diferenciaTotal += data.diferenciaTotal;
      totals.totalVentas += data.totalVentas;
    }
    // total_efectivo no se suma (es valor derivado individual), se calcula
    totals.total_efectivo = totals.efectivo + totals.apertura;
    const totalVentasCalc = totals.efectivo + totals.debito + totals.tarjeta_credito + totals.credito_local + totals.transferencia + totals.edenred;
    csvLines.push([
      fecha, '0', 'Todos',
      totals.efectivo, totals.debito, totals.tarjeta_credito, totals.credito_local,
      totals.transferencia, totals.edenred,
      totals.apertura, totals.total_efectivo, 0, totals.vuelto,
      totals.efectivoFinal, totals.diferenciaEfectivo, totals.diferenciaTotal,
      totals.totalVentas || totalVentasCalc, ''
    ].join(','));

    // Escribir CSV (con fallback a temp si el archivo está bloqueado)
    try {
      fs.writeFileSync(OUT, csvLines.join('\n'), 'utf8');
    } catch (writeErr) {
      const tmpOut = OUT.replace('.csv', '_tmp.csv');
      fs.writeFileSync(tmpOut, csvLines.join('\n'), 'utf8');
      try { fs.renameSync(tmpOut, OUT); } catch {}
    }
    console.log('\n=== RESUMEN ===');
    console.log('CSV: %s', OUT);
    console.log('Cajas: %d, Errores: %d', CAJAS.length, errores);
    console.log('---');
    console.log(csvLines.join('\n'));

    process.exit(0);
  } catch (err) {
    console.error('ERROR FATAL:', err?.message || err);
    if (err?.stack) console.error(err.stack);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
