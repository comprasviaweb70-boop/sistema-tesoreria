/**
 * Parser de observaciones de retiros de BSale a denominaciones.
 * Extrae billetes y monedas de textos como:
 * "13 BILLETES DE 10.000 Y 7 BILLETES DE 5.000"
 * "MONEDAS DE $500"
 * "1 DE $20.000 - 8 DE $10.000"
 * "4 BILLETES DE 20" (sin .000 → $20.000)
 * "BILLETES DE $1.000" (sin cantidad → calcular del monto total)
 */

function parseDenominaciones(texto, montoTotal) {
  if (!texto) return null;
  const upper = texto.toUpperCase();
  
  const result = {
    b20k: 0, b10k: 0, b5k: 0, b2k: 0, b1k: 0,
    m500: 0, m100: 0, m50: 0, m10: 0,
    monto_total: montoTotal || 0
  };

  // Encontrar TODAS las ocurrencias de denominaciones en el texto
  // usando exec() en loop para obtener cada match
  const reDenom = /(\d+)\s*BILLETES?\s*DE\s*\$?\s*([\d.]+)/gi;
  let m;
  while ((m = reDenom.exec(upper)) !== null) {
    const cantidad = parseInt(m[1]);
    let denominacion = parseInt(m[2].replace(/\./g, ''));
    if (denominacion < 500 && denominacion >= 1 && !getDenomKey(denominacion)) denominacion *= 1000;
    const tipo = getDenomKey(denominacion, 'billete');
    if (tipo) {
      result[tipo] = (result[tipo] || 0) + cantidad * denominacion;
    }
  }

  // Patrón: "BILLETES DE $1.000" sin cantidad explícita → calcular desde el monto total
  const reBillSinCant = /BILLETES?\s*DE\s*\$?\s*([\d.]+)/gi;
  while ((m = reBillSinCant.exec(upper)) !== null) {
    // Solo si NO tiene cantidad antes (ej: "2 BILLETES" ya lo capturó reDenom)
    const idx = m.index;
    const before = upper.slice(Math.max(0, idx - 5), idx);
    if (/\d/.test(before)) continue; // ya capturado por reDenom
    let denominacion = parseInt(m[1].replace(/\./g, ''));
    if (denominacion < 500 && denominacion >= 1 && !getDenomKey(denominacion)) denominacion *= 1000;
    const tipo = getDenomKey(denominacion, 'billete');
    if (tipo && denominacion > 0 && montoTotal) {
      if (result[tipo] > 0) continue;   // ya capturado con cantidad explícita, evitar duplicar
      const cantidad = Math.round(montoTotal / denominacion);
      if (cantidad > 0) {
        result[tipo] = (result[tipo] || 0) + cantidad * denominacion;
      }
    }
  }
  const reMoneda = /(\d+)?\s*MONEDAS?\s*DE\s*\$?\s*([\d.]+)/gi;
  while ((m = reMoneda.exec(upper)) !== null) {
    const rawCant = m[1] || '';
    let denominacion = parseInt(m[2].replace(/\./g, ''));
    const tipo = getDenomKey(denominacion, 'moneda');
    if (!tipo) continue;

    // Regla: si el número tiene punto (ej: "10.000"), es un MONTO, no cantidad
    // "10.000 MONEDAS DE 500" → $10.000 en monedas de $500
    // "5 MONEDAS DE 100" → 5 monedas de $100 = $500
    if (rawCant.includes('.')) {
      // Es un monto
      const monto = parseInt(rawCant.replace(/\./g, ''));
      result[tipo] = (result[tipo] || 0) + monto;
    } else {
      const cantidad = rawCant ? parseInt(rawCant) : 0;
      if (cantidad > 0) {
        result[tipo] = (result[tipo] || 0) + cantidad * denominacion;
      }
    }
  }

  // Patrón: "1 DE $20.000" o "$500 DE $10"
  // Si el número tiene $ adelante → MONTO siempre
  // Si no tiene $ → cantidad (billetes de X)
  const reDe = /\$?([\d.]+)\s*DE\s*\$?\s*([\d.]+)/gi;
  while ((m = reDe.exec(upper)) !== null) {
    const rawNum = m[1];
    // Verificar si hay $ antes del número capturado
    const beforeMatch = upper.substring(Math.max(0, m.index - 1), m.index + m[0].indexOf(rawNum));
    const tieneSigno = beforeMatch.includes('$');
    
    let denominacion = parseInt(m[2].replace(/\./g, ''));
    let tipo = getDenomKey(denominacion);
    if (!tipo && denominacion < 500 && denominacion >= 1) {
      const monedaCheck = getDenomKey(denominacion, 'moneda');
      if (!monedaCheck) {
        denominacion *= 1000;
        tipo = getDenomKey(denominacion);
      } else {
        tipo = monedaCheck;
      }
    }
    if (!tipo) continue;

    if (tieneSigno) {
      // Tiene $ → es un MONTO en esa denominación
      const monto = parseInt(rawNum.replace(/\./g, ''));
      result[tipo] = (result[tipo] || 0) + monto;
    } else if (rawNum.includes('.')) {
      // Tiene punto de miles (sin $) → también monto
      const monto = parseInt(rawNum.replace(/\./g, ''));
      result[tipo] = (result[tipo] || 0) + monto;
    } else {
      // Sin $ ni punto → cantidad de unidades
      const cantidad = parseInt(rawNum);
      if (cantidad > 0) {
        result[tipo] = (result[tipo] || 0) + cantidad * denominacion;
      }
    }
  }

  // Patrón: "$30.000 BILLETE DE 10" — monto ANTES del tipo
  const reMontoBill = /\$?\s*([\d.]+)\s*BILLETES?\s*DE\s*(\d+)/gi;
  while ((m = reMontoBill.exec(upper)) !== null) {
    const monto = parseInt(m[1].replace(/\./g, ''));
    const denominacion = parseInt(m[2]) * 1000;
    const tipo = getDenomKey(denominacion, 'billete');
    if (tipo && denominacion > 0) {
      const cantidad = Math.round(monto / denominacion);
      result[tipo] = (result[tipo] || 0) + cantidad * denominacion;
    }
  }

  // Calcular cuánto se logró parsear
  let montoParseado = sumDenom(result);

  // Si lo parseado excede el monto real, no confiar en el parse
  if (montoParseado > (montoTotal || 0)) {
    return null;
  }

  // Si NO se encontró nada con los patrones de billete/moneda específico,
  // intentar con bolsas de monedas (Patrón 5)
  if (montoParseado === 0 && upper.includes('MONEDA') && montoTotal) {
    montoParseado = parseCoinBags(upper, montoTotal, result);
  }

  // Monto que el cajero realmente especificó en el texto, antes de
  // completar matemáticamente cualquier faltante (usado para detectar
  // detalles incompletos/typos y avisar en distribuir()).
  const explicitTotal = montoParseado;

  // Si se encontró algo pero incompleto, completar el resto con autoDenominacion
  if (montoParseado > 0 && montoParseado < (montoTotal || 0)) {
    const restante = montoTotal - montoParseado;
    const extra = autoDenominacionParse(restante);
    for (const key of Object.keys(extra)) {
      if (extra[key] > 0) {
        result[key] = (result[key] || 0) + extra[key];
        montoParseado += extra[key];
      }
    }
  }

  result.monto_total = montoTotal || montoParseado;
  result._explicitTotal = explicitTotal;
  return montoParseado > 0 ? result : null;
}

function sumDenom(denom) {
  return ['b20k','b10k','b5k','b2k','b1k','m500','m100','m50','m10']
    .reduce((a,k) => a + (denom[k]||0), 0);
}

function autoDenominacionParse(monto) {
  const r = { b20k:0, b10k:0, b5k:0, b2k:0, b1k:0, m500:0, m100:0, m50:0, m10:0 };
  let rest = monto;
  
  // Sin b20k primero
  r.b10k = Math.min(Math.floor(rest / 10000) * 10000, Math.floor(rest / 10000) * 10000);
  rest -= r.b10k;
  
  if (rest % 5000 !== 0 && r.b10k >= 10000) {
    r.b10k -= 10000;
    rest += 10000;
  }
  
  r.b5k = Math.floor(rest / 5000) * 5000;
  rest -= r.b5k;
  
  // El resto en denominaciones menores
  const valores = [2000, 1000, 500, 100, 50, 10];
  const keys = ['b2k', 'b1k', 'm500', 'm100', 'm50', 'm10'];
  for (let i = 0; i < valores.length && rest > 0; i++) {
    if (rest >= valores[i]) {
      r[keys[i]] = Math.floor(rest / valores[i]) * valores[i];
      rest -= r[keys[i]];
    }
  }
  
  return r;
}

function parseCoinBags(upper, montoTotal, result) {
  const COIN_BAGS = {
    m500: { bagValue: 10000, denom: 500 },
    m100: { bagValue: 5000,  denom: 100 },
    m50:  { bagValue: 2000,  denom: 50 },
    m10:  { bagValue: 500,   denom: 10 },
  };
  
  const tiposMencionados = [];
  for (const [tipo, info] of Object.entries(COIN_BAGS)) {
    if (upper.includes(String(info.denom))) {
      tiposMencionados.push(tipo);
    }
  }
  
  if (tiposMencionados.length === 0) return 0;
  
  tiposMencionados.sort((a, b) => COIN_BAGS[b].bagValue - COIN_BAGS[a].bagValue);
  
  let montoParseado = 0;
  let restante = montoTotal;
  for (const tipo of tiposMencionados) {
    if (restante <= 0) break;
    const bagVal = COIN_BAGS[tipo].bagValue;
    const cantBolsas = Math.floor(restante / bagVal);
    if (cantBolsas > 0) {
      const valorBolsa = cantBolsas * bagVal;
      result[tipo] = (result[tipo] || 0) + valorBolsa;
      montoParseado += valorBolsa;
      restante -= valorBolsa;
    } else if (tiposMencionados.length === 1) {
      result[tipo] = montoTotal;
      montoParseado = montoTotal;
      restante = 0;
    }
  }
  
  return montoParseado;
}

function getDenomKey(valor, tipo) {
  const mapaBilletes = { 20000: 'b20k', 10000: 'b10k', 5000: 'b5k', 2000: 'b2k', 1000: 'b1k' };
  const mapaMonedas = { 500: 'm500', 100: 'm100', 50: 'm50', 10: 'm10' };
  
  if (tipo === 'billete' && mapaBilletes[valor]) return mapaBilletes[valor];
  if (tipo === 'moneda' && mapaMonedas[valor]) return mapaMonedas[valor];
  
  if (!tipo) {
    if (mapaBilletes[valor]) return mapaBilletes[valor];
    if (mapaMonedas[valor]) return mapaMonedas[valor];
    return null;
  }
  
  if (tipo !== 'moneda' && valor < 500 && valor >= 1) {
    valor = valor * 1000;
  }
  
  if (mapaBilletes[valor]) return mapaBilletes[valor];
  if (mapaMonedas[valor]) return mapaMonedas[valor];
  return null;
}

module.exports = { parseDenominaciones };