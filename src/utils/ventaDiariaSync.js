
/**
 * Utility to synchronize and recalculate Venta Diaria totals from all source movement tables.
 * This ensures that even if movements were created before the Venta Diaria record, 
 * the totals will be correct.
 */
export async function recalculateVentaDiaria(supabase, fecha, turno, cajaId) {
  if (!fecha || !turno || !cajaId || cajaId === 'all') return null;

  console.log(`[ventaDiariaSync] Recalculating for: fecha=${fecha}, turno=${turno}, cajaId=${cajaId}`);

  try {
    // 1. Get Reserva Movements (Linked to this caja)
    const { data: reservaMovs, error: reservaError } = await supabase
      .from('reserva_movimientos')
      .select('tipo, monto_total')
      .eq('fecha', fecha)
      .eq('turno', turno)
      .eq('caja_id', cajaId);

    if (reservaError) throw reservaError;
    console.log(`[ventaDiariaSync] reserva_movimientos: ${reservaMovs?.length ?? 0} records`);

    // INGRESOS in Reserva = EGRESO (Entrega a Tesorería) from Caja
    // EGRESOS in Reserva = INGRESO (Traspaso Recibido) to Caja
    const sumTraspasoReservaIngreso = (reservaMovs || [])
      .filter(m => m.tipo === 'egreso')
      .reduce((acc, m) => acc + (parseFloat(m.monto_total) || 0), 0);
    
    const sumTraspasoReservaEgreso = (reservaMovs || [])
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
    console.log(`[ventaDiariaSync] otros_movimientos: ${otrosMovs?.length ?? 0} records`);

    // Aggregates for Otros Movimientos
    const aggregates = {
      ingresos_efectivo: 0,
      traspaso_tesoreria_ingreso: sumTraspasoReservaIngreso,
      traspaso_tesoreria_egreso: sumTraspasoReservaEgreso,
      gastos_rrhh: 0,
      servicios: 0,
      gastos: 0,
      otros_egresos: 0
    };

    (otrosMovs || []).forEach(m => {
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

    // 3. Get Supplier Payments — filter by fecha + turno + caja_id
    const { data: supplierPagos, error: supplierError } = await supabase
      .from('pagos_proveedor')
      .select('monto_pagado, origen_fondos')
      .eq('fecha_pago', fecha)
      .eq('turno', turno)
      .eq('caja_id', cajaId);

    if (supplierError) throw supplierError;
    console.log(`[ventaDiariaSync] pagos_proveedor found: ${supplierPagos?.length ?? 0} records`);
    if (supplierPagos?.length) {
      supplierPagos.forEach(p => console.log(`  -> origen=${p.origen_fondos}, monto=${p.monto_pagado}`));
    }

    // Cash payments: both 'caja' and 'efectivo' are treated as cash
    const sumPagosCaja = (supplierPagos || [])
      .filter(p => {
        const metodo = (p.origen_fondos || '').toLowerCase().trim();
        return metodo === 'caja' || metodo === 'efectivo';
      })
      .reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0);
    
    const sumPagosCC = (supplierPagos || [])
      .filter(p => (p.origen_fondos || '').toLowerCase().trim() === 'cuenta_corriente')
      .reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0);

    console.log(`[ventaDiariaSync] sumPagosCaja=${sumPagosCaja}, sumPagosCC=${sumPagosCC}`);

    // 4. Build PARTIAL update payload — only include fields from sources that returned data.
    // This prevents zeroing out existing values when a source has no records for this slot.
    const updateData = {};

    // From reserva_movimientos
    if (reservaMovs !== null) {
      updateData.traspaso_tesoreria_ingreso = sumTraspasoReservaIngreso;
      updateData.traspaso_tesoreria_egreso = sumTraspasoReservaEgreso;
    }

    // From otros_movimientos
    if (otrosMovs !== null) {
      updateData.ingresos_efectivo = aggregates.ingresos_efectivo;
      updateData.gastos_rrhh = aggregates.gastos_rrhh;
      updateData.servicios = aggregates.servicios;
      updateData.gastos = aggregates.gastos;
      updateData.otros_egresos = aggregates.otros_egresos;
    }

    // From pagos_proveedor
    if (supplierPagos !== null) {
      updateData.pago_facturas_caja = sumPagosCaja;
      updateData.pago_facturas_cc = sumPagosCC;
    }

    console.log(`[ventaDiariaSync] updateData keys: ${Object.keys(updateData).join(', ')}`);

    // 5. Find existing venta_diaria record
    const { data: existing, error: findError } = await supabase
      .from('venta_diaria')
      .select('id')
      .eq('fecha', fecha)
      .eq('turno', turno)
      .eq('caja_id', cajaId)
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      console.log(`[ventaDiariaSync] Updating existing record id=${existing.id}`);
      const { error: updateError } = await supabase
        .from('venta_diaria')
        .update(updateData)
        .eq('id', existing.id);
      
      if (updateError) throw updateError;
      return { action: 'updated', id: existing.id, fields: Object.keys(updateData) };
    } else {
      // Only update existing records — never auto-create to avoid RLS errors and data pollution.
      // The user must create venta_diaria records intentionally via the Venta Diaria page.
      console.warn(`[ventaDiariaSync] No venta_diaria record found — skipping. fecha=${fecha}, turno=${turno}, cajaId=${cajaId}`);
      return { action: 'skipped', reason: 'no record found for this fecha/turno/caja' };
    }
  } catch (error) {
    console.error('[ventaDiariaSync] Error:', error);
    throw error;
  }
}
