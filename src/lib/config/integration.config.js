/**
 * Configuración Integración BSale - Sistema de Tesoreria
 * Archivo: src/lib/config/integration.config.js
 * 
 * Parámetros ajustables para la integración sin modificar código
 */

module.exports = {
  // Configuración de la API de BSale
  bsale: {
    baseURL: process.env.BSALE_API_BASE || 'https://api.bsale.com.co',
    apiKey: process.env.BSALE_API_KEY,
    apiSecret: process.env.BSALE_API_SECRET,
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
    date: process.env.SYNC_DATE || null,
    force: process.env.SYNC_FORCE === 'true',
    schedule: process.env.SYNC_SCHEDULE || '02:00',
    daysBack: parseInt(process.env.SYNC_DAYS_BACK) || 0,
    pauseOnError: process.env.PAUSE_ON_ERROR !== 'false',
  },

  // Configuración de rendimiento
  performance: {
    maxRetries: parseInt(process.env.MAX_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.RETRY_DELAY) || 1000,
    batchSize: parseInt(process.env.BATCH_SIZE) || 0,
    concurrency: parseInt(process.env.CONCURRENCY) || 3,
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
    cash: ['efectivo', 'cash'],
    debit: ['debito', 'tarjeta_debito', 'debit_card'],
    credit: ['credito', 'tarjeta_credito', 'credit_card'],
    transfer: ['transferencia', 'bank_transfer', 'p2p'],
    creditAccount: ['credito_fiado', 'accounts', 'credit_account'],
    edenred: ['edenred', 'tarjeta_edenred'],
    other: ['manual', 'otros', 'misc', 'income'],
  },

  // Patrones para identificar retiros
  withdrawalPatterns: {
    keywords: ['retiro', 'gasto', 'egreso', 'withdrawal', 'expense', 'cash_out'],
    accounts: ['caja', 'efectivo', 'cash'],
  },

  // Estado por defecto
  defaultState: {
    cajaStatus: 'PENDIENTE_REVISION',
    synced: false,
  },

  // Limites
  limits: {
    maxRetries: 3,
    maxBatchSize: 500,
    maxPageSize: 1000,
  },
};
