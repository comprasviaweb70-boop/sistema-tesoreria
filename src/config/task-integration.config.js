/**
 * Configuración Integración BSale - Sistema de Tesoreria
 * Archivo: src/config/task-integration.config.js
 * 
 * Parámetros ajustables para la integración diaria de ventas
 */

module.exports = {
  // Configuración de la API de BSale
  bsale: {
    baseURL: process.env.BSALE_API_BASE || 'https://api.bsale.com.co',
    apiKey: process.env.BSALE_API_KEY,
    timeout: parseInt(process.env.BSALE_TIMEOUT) || 30000,
    retries: parseInt(process.env.BSALE_RETRIES) || 3,
  },

  // Configuración de la base de datos
  database: {
    table: 'sales_entries',
    schema: 'public',
  },

  // Configuración de sincronización
  sync: {
    // Fecha a sincronizar (YYYY-MM-DD) - null para hoy
    date: process.env.SYNC_DATE || null,
    
    // Forzar importación aunque ya existan datos
    force: process.env.SYNC_FORCE === 'true',
    
    // Horario de ejecución (formato: HH:mm) - para cron
    schedule: process.env.SYNC_SCHEDULE || '02:00',
    
    // Días hacia atrás para sincronizar (0 = hoy solo, 1 = hoy + ayer, etc.)
    daysBack: parseInt(process.env.SYNC_DAYS_BACK) || 0,
    
    // Pausar en errores
    pauseOnError: process.env.PAUSE_ON_ERROR !== 'false',
  },

  // Configuración de rendimiento
  performance: {
    batchSize: parseInt(process.env.BATCH_SIZE) || 50, // procesar en lotes
    concurrency: parseInt(process.env.CONCURRENCY) || 3, // máximo de solicitudes simultáneas
  },

  // Modo depuración
  debug: {
    enabled: process.env.DEBUG_MODE === 'true',
    logQueries: process.env.LOG_QUERIES !== 'false',
    logDuplicates: process.env.LOG_DUPLICATES !== 'false',
    logApiCalls: process.env.LOG_API_CALLS !== 'false',
  },

  // Mapeo de tipos de pago
  paymentMappings: {
    // Estos valores deben coincidir con lo que retorna la API de BSale
    cash: ['efectivo', 'cash'],
    debit: ['debito', 'tarjeta_debito', 'debit_card'],
    credit: ['credito', 'tarjeta_credito', 'credit_card'],
    transfer: ['transferencia', 'bank_transfer', 'p2p'],
    creditAccount: ['credito_fiado', 'accounts', 'credit_account'],
    edenred: ['edenred', 'tarjeta_edenred'],
    other: ['manual', 'otros', 'misc', 'income'],
  },

  // Patrones para identificar retiros de caja
  withdrawalPatterns: {
    keywords: ['retiro', 'gasto', 'egreso', 'withdrawal', 'expense', 'cash_out'],
    accounts: ['caja', 'efectivo', 'cash'],
  },

  // Estado por defecto para las caja
  defaultState: {
    cajaStatus: 'PENDIENTE_REVISION', // 'ABIERTO' o 'PENDIENTE_REVISION'
    synced: false,
  },

  // URLs y endpoints
  endpoints: {
    turns: '/api/v1/turnos-caja',
    payments: '/api/v1/turnos/:id/formas-pago',
    turnsByDate: '/api/v1/turnos-caja/rango',
  },

  // Límites de procesamiento
  limits: {
    maxRetries: 3,
    maxBatchSize: 500,
    maxPageSize: 1000,
  },
};
