-- ============================================================
-- MIGRACIÓN: retiros_efectivo → GENERATED column
-- Elimina triggers conflictivos y convierte retiros_efectivo
-- en columna generada (única fuente de verdad)
-- ============================================================

-- 1. DROP TRIGGERS conflictivos
DROP TRIGGER IF EXISTS trg_pagos_proveedor_venta ON public.pagos_proveedor;
DROP TRIGGER IF EXISTS trg_reserva_movimientos_venta ON public.reserva_movimientos;
DROP TRIGGER IF EXISTS trg_otros_movimientos_venta ON public.otros_movimientos;
DROP TRIGGER IF EXISTS trg_reserva_movimientos_v2 ON public.reserva_movimientos;
DROP TRIGGER IF EXISTS trg_pagos_proveedor_insert ON public.pagos_proveedor;
DROP TRIGGER IF EXISTS trg_pagos_proveedor_update ON public.pagos_proveedor;
DROP TRIGGER IF EXISTS trg_pagos_proveedor_delete ON public.pagos_proveedor;
DROP TRIGGER IF EXISTS trg_otros_movimientos_insert ON public.otros_movimientos;
DROP TRIGGER IF EXISTS trg_otros_movimientos_update ON public.otros_movimientos;
DROP TRIGGER IF EXISTS trg_otros_movimientos_delete ON public.otros_movimientos;

-- 2. DROP FUNCTION recalcular_venta_diaria()
DROP FUNCTION IF EXISTS public.recalcular_venta_diaria() CASCADE;
DROP FUNCTION IF EXISTS public.actualizar_traspaso_efectivo() CASCADE;

-- 3. Migrar datos de otros_gastos a otros_egresos si hay valores no migrados
-- (otros_gastos es columna duplicada del split, no entra en la fórmula generada)
UPDATE public.venta_diaria
SET otros_egresos = COALESCE(otros_egresos, 0) + COALESCE(otros_gastos, 0)
WHERE otros_gastos IS NOT NULL AND otros_gastos > 0
  AND otros_egresos IS NOT NULL
  AND otros_egresos = 0;

-- 4. Asegurar que todas las columnas granulares tengan default 0 (no NULL)
UPDATE public.venta_diaria SET pago_facturas_caja = 0 WHERE pago_facturas_caja IS NULL;
UPDATE public.venta_diaria SET traspaso_tesoreria_egreso = 0 WHERE traspaso_tesoreria_egreso IS NULL;
UPDATE public.venta_diaria SET gastos_rrhh = 0 WHERE gastos_rrhh IS NULL;
UPDATE public.venta_diaria SET servicios = 0 WHERE servicios IS NULL;
UPDATE public.venta_diaria SET gastos = 0 WHERE gastos IS NULL;
UPDATE public.venta_diaria SET otros_egresos = 0 WHERE otros_egresos IS NULL;

-- 5. DROP COLUMN retiros_efectivo (normal column)
ALTER TABLE public.venta_diaria DROP COLUMN IF EXISTS retiros_efectivo;

-- 6. RECREATE as GENERATED ALWAYS AS (suma de granulares) STORED
ALTER TABLE public.venta_diaria
  ADD COLUMN retiros_efectivo INTEGER GENERATED ALWAYS AS (
    COALESCE(pago_facturas_caja, 0) +
    COALESCE(traspaso_tesoreria_egreso, 0) +
    COALESCE(gastos_rrhh, 0) +
    COALESCE(servicios, 0) +
    COALESCE(gastos, 0) +
    COALESCE(otros_egresos, 0)
  ) STORED;

-- 7. Verificación: contar filas donde retiros_efectivo != suma manual
-- (debería ser 0 por definición de GENERATED)
SELECT
  count(*) AS total_filas,
  count(*) FILTER (WHERE retiros_efectivo <>
    COALESCE(pago_facturas_caja, 0) +
    COALESCE(traspaso_tesoreria_egreso, 0) +
    COALESCE(gastos_rrhh, 0) +
    COALESCE(servicios, 0) +
    COALESCE(gastos, 0) +
    COALESCE(otros_egresos, 0)
  ) AS mismatches
FROM public.venta_diaria;
