-- ============================================================
-- TRIGGER AUTOMÁTICO: pagos_proveedor → venta_diaria
-- Al insertar, actualizar o eliminar un pago, se recalcula
-- el campo pago_facturas_caja en venta_diaria automáticamente
-- ============================================================

-- 1. Función que actualiza pago_facturas_caja para una caja y fecha
CREATE OR REPLACE FUNCTION public.actualizar_pago_facturas_caja()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_caja_id UUID;
  v_fecha DATE;
  v_total NUMERIC;
BEGIN
  -- Determinar caja_id y fecha según la operación
  IF TG_OP = 'DELETE' THEN
    v_caja_id := OLD.caja_id;
    v_fecha := OLD.fecha_pago;
  ELSE
    v_caja_id := NEW.caja_id;
    v_fecha := NEW.fecha_pago;
  END IF;

  -- Sumar todos los pagos de esta caja en esta fecha
  SELECT COALESCE(SUM(monto_pagado), 0)
  INTO v_total
  FROM public.pagos_proveedor
  WHERE caja_id = v_caja_id
    AND fecha_pago = v_fecha;

  -- Actualizar venta_diaria
  UPDATE public.venta_diaria
  SET pago_facturas_caja = v_total,
      updated_at = NOW()
  WHERE caja_id = v_caja_id
    AND fecha = v_fecha;

  -- Si no existe registro en venta_diaria, se omite (el scraper lo creará después)
  IF NOT FOUND THEN
    RAISE NOTICE 'No hay registro en venta_diaria para caja % fecha %', v_caja_id, v_fecha;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2. Trigger para INSERT
DROP TRIGGER IF EXISTS trg_pagos_proveedor_insert ON public.pagos_proveedor;
CREATE TRIGGER trg_pagos_proveedor_insert
  AFTER INSERT ON public.pagos_proveedor
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_pago_facturas_caja();

-- 3. Trigger para UPDATE
DROP TRIGGER IF EXISTS trg_pagos_proveedor_update ON public.pagos_proveedor;
CREATE TRIGGER trg_pagos_proveedor_update
  AFTER UPDATE ON public.pagos_proveedor
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_pago_facturas_caja();

-- 4. Trigger para DELETE
DROP TRIGGER IF EXISTS trg_pagos_proveedor_delete ON public.pagos_proveedor;
CREATE TRIGGER trg_pagos_proveedor_delete
  AFTER DELETE ON public.pagos_proveedor
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_pago_facturas_caja();

-- ============================================================
-- NOTA: Si la tabla venta_diaria no tiene columna updated_at,
-- eliminar la línea "updated_at = NOW()" de la función UPDATE.
-- ============================================================
