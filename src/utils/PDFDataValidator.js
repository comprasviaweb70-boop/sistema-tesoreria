
export const validatePDFData = (data) => {
  const errors = [];
  const warnings = [];
  const fieldStatus = {}; // Tracks status per field: 'valid', 'warning', 'error'

  // Parse fields as numbers to ensure safe math
  const venta_efectivo = parseFloat(data.venta_efectivo) || 0;
  const redelcom = parseFloat(data.redelcom) || 0;
  const tarjeta_credito = parseFloat(data.tarjeta_credito) || 0;
  const credito = parseFloat(data.credito) || 0;
  const vuelta = parseFloat(data.vuelta) || 0;
  const ingresos_efectivo = parseFloat(data.ingresos_efectivo) || 0;
  const retiros_efectivo = parseFloat(data.retiros_efectivo) || 0;
  const transferencia = parseFloat(data.transferencia) || 0;
  const edenred = parseFloat(data.edenred) || 0;
  const total_ventas_pdf = parseFloat(data.total_ventas_pdf) || 0;

  // 1. Verify that extracted values are monetary amounts, not transaction counts
  const checkCountVsAmount = (val, fieldName, key) => {
    if (val > 0 && val < 100) {
      warnings.push(`El valor de ${fieldName} (${val}) parece ser una cantidad de transacciones, no un monto monetario.`);
      fieldStatus[key] = 'warning';
    } else {
      fieldStatus[key] = 'valid';
    }
  };

  const checkNonNegative = (val, fieldName, key) => {
    if (val < 0) {
      errors.push(`El campo ${fieldName} no puede ser negativo.`);
      fieldStatus[key] = 'error';
    } else if (!fieldStatus[key]) {
      fieldStatus[key] = 'valid';
    }
  }

  checkCountVsAmount(venta_efectivo, 'Efectivo', 'venta_efectivo');
  checkCountVsAmount(redelcom, 'Tarjeta Débito', 'redelcom');
  checkCountVsAmount(tarjeta_credito, 'Tarjeta Crédito', 'tarjeta_credito');
  checkCountVsAmount(credito, 'Crédito', 'credito');
  checkCountVsAmount(vuelta, 'Vuelta', 'vuelta');

  checkNonNegative(ingresos_efectivo, 'Ingresos de Efectivo', 'ingresos_efectivo');
  checkNonNegative(retiros_efectivo, 'Retiros de Efectivo', 'retiros_efectivo');

  // 2. Correct Calculations
  // Total Neto de Efectivo = Efectivo (Bruto) - Vuelto + Ingresos - Retiros
  const efectivoNeto = venta_efectivo - vuelta + ingresos_efectivo - retiros_efectivo;

  // Total Ventas = Efectivo Neto + Crédito + Tarjeta Débito (+ otros métodos)
  const calculoTotal = efectivoNeto + redelcom + tarjeta_credito + credito + transferencia + edenred;

  if (total_ventas_pdf > 0) {
    if (Math.abs(calculoTotal - total_ventas_pdf) > 100) {
      warnings.push(`La suma calculada ($${calculoTotal.toLocaleString('es-CL')}) difiere del Total extraído ($${total_ventas_pdf.toLocaleString('es-CL')}).`);
      fieldStatus['total_ventas_pdf'] = 'warning';
      fieldStatus['calculo_suma'] = 'error';
    } else {
      fieldStatus['total_ventas_pdf'] = 'valid';
      fieldStatus['calculo_suma'] = 'valid';
    }
  } else {
    fieldStatus['total_ventas_pdf'] = 'warning';
    warnings.push('No se pudo extraer el Total General del documento.');
  }

  if (efectivoNeto < 0) {
    warnings.push('El Efectivo Neto es negativo. Verifica que el Vuelto y Retiros no sean mayores a los Ingresos y Efectivo cobrado.');
    fieldStatus['venta_efectivo'] = 'warning';
    fieldStatus['vuelta'] = 'warning';
  }

  // Set default valid states for other fields if not already set
  ['transferencia', 'edenred', 'cierre_declarado_pdf', 'saldo_inicial', 'cierre_sistema_pdf', 'tarjeta_credito'].forEach(key => {
    if (!fieldStatus[key]) fieldStatus[key] = 'valid';
  });

  return {
    isValid: errors.length === 0, // Block submission only on hard errors
    hasWarnings: warnings.length > 0,
    errors,
    warnings,
    fieldStatus,
    calculatedTotals: {
      efectivoNeto,
      calculoTotal
    }
  };
};
