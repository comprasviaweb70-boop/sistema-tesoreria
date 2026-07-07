-- ==========================================
-- ROLLBACK: Eliminar tabla saldos_diarios y triggers
-- Ejecutar en SQL Editor de Supabase si es necesario revertir
-- ==========================================

-- 1. Eliminar trigger
DROP TRIGGER IF EXISTS trg_saldos_after_change ON reserva_movimientos;

-- 2. Eliminar función del trigger
DROP FUNCTION IF EXISTS trg_recalcular_saldos();

-- 3. Eliminar función de recálculo
DROP FUNCTION IF EXISTS recalcular_saldos();

-- 4. Eliminar tabla
DROP TABLE IF EXISTS saldos_diarios;

-- 5. Verificar limpieza
SELECT 'Rollback completado. Tabla y triggers eliminados.' as resultado;
