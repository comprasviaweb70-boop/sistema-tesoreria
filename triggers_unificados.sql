-- ============================================================
-- TRIGGERS UNIFICADOS: Todos los modulos → venta_diaria
-- Una sola funcion recalcula todas las columnas derivadas
-- ============================================================

-- 1. Funcion unica de recalculo
CREATE OR REPLACE FUNCTION public.recalcular_venta_diaria()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_caja_id UUID;
  v_fecha DATE;
  v_pago NUMERIC;
  v_tr_egr NUMERIC;
  v_tr_ing NUMERIC;
  v_otros_egr NUMERIC;
  v_otros_ing NUMERIC;
BEGIN
  -- Determinar caja_id y fecha según la operación
  IF TG_OP = 'DELETE' THEN
    v_caja_id := OLD.caja_id;
    v_fecha := CASE WHEN TG_TABLE_NAME = 'pagos_proveedor' THEN OLD.fecha_pago ELSE OLD.fecha END;
  ELSE
    v_caja_id := NEW.caja_id;
    v_fecha := CASE WHEN TG_TABLE_NAME = 'pagos_proveedor' THEN NEW.fecha_pago ELSE NEW.fecha END;
  END IF;

  -- Sumar todos los modulos
  SELECT COALESCE(SUM(monto_pagado), 0) INTO v_pago
  FROM public.pagos_proveedor
  WHERE caja_id = v_caja_id AND fecha_pago = v_fecha;

  SELECT COALESCE(SUM(monto_total), 0) INTO v_tr_egr
  FROM public.reserva_movimientos
  WHERE caja_id = v_caja_id AND fecha = v_fecha AND tipo = 'ingreso';

  SELECT COALESCE(SUM(monto_total), 0) INTO v_tr_ing
  FROM public.reserva_movimientos
  WHERE caja_id = v_caja_id AND fecha = v_fecha AND tipo = 'egreso';

  SELECT COALESCE(SUM(monto), 0) INTO v_otros_egr
  FROM public.otros_movimientos
  WHERE caja_id = v_caja_id AND fecha = v_fecha AND tipo = 'egreso';

  SELECT COALESCE(SUM(monto), 0) INTO v_otros_ing
  FROM public.otros_movimientos
  WHERE caja_id = v_caja_id AND fecha = v_fecha AND tipo = 'ingreso';

  -- Actualizar venta_diaria: retiros_efectivo = suma de egresos de todos los modulos
  UPDATE public.venta_diaria
  SET pago_facturas_caja = v_pago,
      traspaso_tesoreria_egreso = v_tr_egr,
      traspaso_tesoreria_ingreso = v_tr_ing,
      otros_gastos = v_otros_egr,
      ingresos_efectivo = v_otros_ing,
      retiros_efectivo = v_pago + v_tr_egr + v_otros_egr,
      updated_at = NOW()
  WHERE caja_id = v_caja_id AND fecha = v_fecha;

  IF NOT FOUND THEN
    RAISE NOTICE 'No hay venta_diaria para caja % fecha %', v_caja_id, v_fecha;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2. Trigger: pagos_proveedor
DROP TRIGGER IF EXISTS trg_pagos_proveedor_venta ON public.pagos_proveedor;
CREATE TRIGGER trg_pagos_proveedor_venta
  AFTER INSERT OR UPDATE OR DELETE ON public.pagos_proveedor
  FOR EACH ROW
  EXECUTE FUNCTION public.recalcular_venta_diaria();

-- 3. Trigger: reserva_movimientos
DROP TRIGGER IF EXISTS trg_reserva_movimientos_venta ON public.reserva_movimientos;
CREATE TRIGGER trg_reserva_movimientos_venta
  AFTER INSERT OR UPDATE OR DELETE ON public.reserva_movimientos
  FOR EACH ROW
  EXECUTE FUNCTION public.recalcular_venta_diaria();

-- 4. Trigger: otros_movimientos
DROP TRIGGER IF EXISTS trg_otros_movimientos_venta ON public.otros_movimientos;
CREATE TRIGGER trg_otros_movimientos_venta
  AFTER INSERT OR UPDATE OR DELETE ON public.otros_movimientos
  FOR EACH ROW
  EXECUTE FUNCTION public.recalcular_venta_diaria();

-- 5. Eliminar triggers anteriores si existen (nombres viejos)
DROP TRIGGER IF EXISTS trg_pagos_proveedor_insert ON public.pagos_proveedor;
DROP TRIGGER IF EXISTS trg_pagos_proveedor_update ON public.pagos_proveedor;
DROP TRIGGER IF EXISTS trg_pagos_proveedor_delete ON public.pagos_proveedor;
DROP TRIGGER IF EXISTS trg_otros_movimientos_insert ON public.otros_movimientos;
DROP TRIGGER IF EXISTS trg_otros_movimientos_update ON public.otros_movimientos;
DROP TRIGGER IF EXISTS trg_otros_movimientos_delete ON public.otros_movimientos;

-- ============================================================
-- RECALCULAR DATOS EXISTENTES (19/05)
-- Solo tocará las cajas que tienen datos en los modulos
-- ============================================================
-- Ya que se eliminaron y recrearon los triggers, y los datos
-- ya existen, se puede forzar un recalculo tocando 1 registro
-- de cada modulo. Al hacer un UPDATE sin cambios sobre un
-- registro existente, el trigger se dispara y recalcula.
-- 
-- Ejecutar en SQL Editor:
--   UPDATE pagos_proveedor SET origen_fondos = origen_fondos WHERE fecha_pago = '2026-05-19' LIMIT 1;
--   UPDATE reserva_movimientos SET descripcion = descripcion WHERE fecha = '2026-05-19' LIMIT 1;
--   UPDATE otros_movimientos SET descripcion = descripcion WHERE fecha = '2026-05-19' LIMIT 1;

-- NOTA: Si venta_diaria no tiene columna updated_at, eliminar la
-- linea ", updated_at = NOW()" de la funcion recalcular_venta_diaria
