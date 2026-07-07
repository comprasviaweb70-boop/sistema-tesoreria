#!/usr/bin/env node
/**
 * Script de Integración BSale → Sistema de Tesoreria (Antigravity)
 * 
 * Este script automatiza la importación de movimientos diarios de cajas
 * desde la API de BSale al módulo de Venta Diaria del sistema.
 * 
 * 📁 Ubicación: C:\Users\jsanz\Desktop\Antigravity\Sistema de Tesoreria
 * 🚀 Ejecución: node src/bin/sync-bsale.js [fecha opcional]
 * 
 * REGLAS DE NEGOCIO APLICADAS:
 * 1. Estado de caja: "PENDIENTE_REVISION" o "ABIERTO" (NUNCA se cierra automáticamente)
 * 2. Control de duplicados: verifica por fecha + caja + movimiento_id
 * 3. Mapeo estricto de tipos de pago de BSale a campos del sistema
 * 4. Los retiros de efectivo se registran en cash_withdrawals
 */

const { syncDay } = require('./src/lib/bsaleIntegration.js');

const fecha = process.argv[2] || null;

console.log('\n========================================');
console.log('  BSale → Sistema de Tesoreria');
console.log('  Integración de Ventas Diarias');
console.log('========================================\n');

syncDay(fecha)
  .then(r => { 
    console.log('\n✓ Sincronización completada:', r);
    process.exit(0); 
  })
  .catch(e => { 
    console.error('\n✗ Error:', e); 
    process.exit(1); 
  });

module.exports = { syncDay };
