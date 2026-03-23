
/**
 * Utility to synchronize and recalculate Venta Diaria totals from all source movement tables.
 * This ensures that even if movements were created before the Venta Diaria record, 
 * the totals will be correct.
 */
export async function recalculateVentaDiaria(supabase, fecha, turno, cajaId) {
  if (!fecha || !turno || !cajaId || cajaId === 'all') return null;

  console.log(`Recalculating Venta Diaria for: ${fecha}, ${turno}, ${cajaId}`);

  try {
    // 1. Get Reserva Movements (Linked to this caja)
    const { data: reservaMovs, error: reservaError } = await supabase
      .from('reserva_movimientos')
      .select('tipo, monto_total')
      .eq('fecha', fecha)
      .eq('turno', turno)
      .eq('caja_id', cajaId);

    if (reservaError) throw reservaError;

    // Sum reserva movements
    // INGRESOS in Reserva = EGRESO (Entrega a Tesorería) from Caja
    // EGRESOS in Reserva = INGRESO (Traspaso Recibido) to Caja
    const sumTraspasoReservaIngreso = reservaMovs
      .filter(m => m.tipo === 'egreso')
      .reduce((acc, m) => acc + (parseFloat(m.monto_total) || 0), 0);
    
    const sumTraspasoReservaEgreso = reservaMovs
      .filter(m => m.tipo === 'ingreso')
      .reduce((acc, m) => acc + (parseFloat(m.monto_total) || 0), 0);

    // 2. Get Otros Movimientos (Linked to this caja)
    const { data: otrosMovs, error: otrosError } = await supabase
      .from('otros_movimientos')
      .select('tipo, monto, categorias_movimiento(nombre)')
      .eq('fecha', fecha)
      .eq('turno', turno)
      .eq('caja_id', cajaId);

    if (otrosError) throw otrosError;

    // Aggregates for Otros Movimientos
    const aggregates = {
      ingresos_efectivo: 0,
      traspaso_tesoreria_ingreso: sumTraspasoReservaIngreso, // Start with reserva value
      traspaso_tesoreria_egreso: sumTraspasoReservaEgreso,   // Start with reserva value
      gastos_rrhh: 0,
      servicios: 0,
      gastos: 0,
      otros_egresos: 0
    };

    otrosMovs.forEach(m => {
      const monto = parseFloat(m.monto) || 0;
      const catName = m.categorias_movimiento?.nombre?.toLowerCase() || '';
      const isCorreccion = catName.startsWith('correccion') || catName.startsWith('corrección');

      // Note: Corrections are handled separately in the form (modifying venta_efectivo directly)
      // and should not be counted here to avoid double counting balances, 
      // but we need to check how they are stored.
      if (isCorreccion) return; 

      if (m.tipo === 'ingreso') {
        if (catName.startsWith('traspaso')) {
          aggregates.traspaso_tesoreria_ingreso += monto;
        } else {
          aggregates.ingresos_efectivo += monto;
        }
      } else {
        if (catName.startsWith('rrhh')) {
          aggregates.gastos_rrhh += monto;
        } else if (catName.startsWith('servicio')) {
          aggregates.servicios += monto;
        } else if (catName.startsWith('gasto')) {
          aggregates.gastos += monto;
        } else if (catName.startsWith('traspaso')) {
          aggregates.traspaso_tesoreria_egreso += monto;
        } else {
          aggregates.otros_egresos += monto;
        }
      }
    });

    // 3. Get Supplier Payments
    const { data: supplierPagos, error: supplierError } = await supabase
      .from('pagos_proveedor')
      .select('monto_pagado, origen_fondos')
      .eq('fecha_pago', fecha)
      .eq('turno', turno)
      .eq('caja_id', cajaId);

    if (supplierError) throw supplierError;

    const sumPagosCaja = supplierPagos
      .filter(p => p.origen_fondos === 'caja')
      .reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0);
    
    const sumPagosCC = supplierPagos
      .filter(p => p.origen_fondos === 'cuenta_corriente')
      .reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0);

    // 4. Update or Upsert Venta Diaria
    const updateData = {
      ...aggregates,
      pago_facturas_caja: sumPagosCaja,
      pago_facturas_cc: sumPagosCC
    };

    // Check if record exists
    const { data: existing, error: findError } = await supabase
      .from('venta_diaria')
      .select('id')
      .eq('fecha', fecha)
      .eq('turno', turno)
      .eq('caja_id', cajaId)
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      const { error: updateError } = await supabase
        .from('venta_diaria')
        .update(updateData)
        .eq('id', existing.id);
      
      if (updateError) throw updateError;
      return { action: 'updated', id: existing.id };
    } else {
      // Create new record with default values + our calculated totals
      const newData = {
        fecha,
        turno,
        caja_id: cajaId,
        estado: 'Abierto',
        saldo_inicial: 0,
        venta_efectivo: 0,
        redelcom: 0,
        tarjeta_credito: 0,
        edenred: 0,
        transferencia: 0,
        credito: 0,
        total_ventas: 0,
        ...updateData
      };

      const { data: inserted, error: insertError } = await supabase
        .from('venta_diaria')
        .insert([newData])
        .select()
        .single();
      
      if (insertError) throw insertError;
      return { action: 'created', id: inserted.id };
    }
  } catch (error) {
    console.error('Error in recalculateVentaDiaria:', error);
    throw error;
  }
}
