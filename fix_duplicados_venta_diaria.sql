-- FIX: Limpiar TODOS los duplicados historicos y crear constraint UNIQUE
-- Ejecutar en Supabase SQL Editor

-- ============================================
-- PASO 1: Ver duplicados existentes (consulta opcional)
-- ============================================
-- SELECT fecha, caja_id, turno, COUNT(*) 
-- FROM venta_diaria 
-- GROUP BY fecha, caja_id, turno
-- HAVING COUNT(*) > 1;

-- ============================================
-- PASO 2: Borrar TODOS los registros vacíos que tengan un duplicado con datos reales
-- ============================================
DELETE FROM venta_diaria vd1
WHERE EXISTS (
    SELECT 1 FROM venta_diaria vd2
    WHERE vd2.fecha = vd1.fecha
      AND vd2.caja_id = vd1.caja_id
      AND vd2.turno = vd1.turno
      AND vd2.id != vd1.id
)
  AND vd1.cierre_declarado_pdf = 0
  AND vd1.total_ventas = 0
  AND vd1.venta_efectivo = 0
  AND vd1.saldo_inicial = 0;

-- ============================================
-- PASO 3: Si quedan duplicados (ambos con datos), conservar el más reciente
-- ============================================
DELETE FROM venta_diaria a
WHERE EXISTS (
    SELECT 1 FROM venta_diaria b
    WHERE b.fecha = a.fecha
      AND b.caja_id = a.caja_id
      AND b.turno = a.turno
      AND b.id != a.id
      AND b.updated_at > a.updated_at
);

-- ============================================
-- PASO 4: Crear constraint UNIQUE (solo si no existe)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'venta_diaria_fecha_caja_turno_unique'
    ) THEN
        ALTER TABLE venta_diaria
        ADD CONSTRAINT venta_diaria_fecha_caja_turno_unique
        UNIQUE (fecha, caja_id, turno);
    END IF;
END $$;

-- ============================================
-- PASO 5: Verificar que no quedan duplicados
-- ============================================
-- SELECT fecha, caja_id, turno, COUNT(*) 
-- FROM venta_diaria 
-- GROUP BY fecha, caja_id, turno
-- HAVING COUNT(*) > 1;
