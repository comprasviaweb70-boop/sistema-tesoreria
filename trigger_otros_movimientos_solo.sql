-- ============================================================
-- TRIGGER: otros_movimientos → venta_diaria
-- Solo agrega el modulo faltante, sin tocar los existentes
-- ============================================================

CREATE OR REPLACE FUNCTION public.actualizar_otros_movimientos()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_caja_id UUID;
  v_fecha DATE;
  v_total_egresos NUMERIC;
  v_total_ingresos NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_caja_id := OLD.caja_id;
    v_fecha := OLD.fecha;
  ELSE
    v_caja_id := NEW.caja_id;
    v_fecha := NEW.fecha;
  END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_total_egresos
  FROM public.otros_movimientos
  WHERE caja_id = v_caja_id AND fecha = v_fecha AND tipo = 'egreso';

  SELECT COALESCE(SUM(monto), 0) INTO v_total_ingresos
  FROM public.otros_movimientos
  WHERE caja_id = v_caja_id AND fecha = v_fecha AND tipo = 'ingreso';

  UPDATE public.venta_diaria
  SET otros_gastos = v_total_egresos,
      ingresos_efectivo = v_total_ingresos,
      updated_at = NOW()
  WHERE caja_id = v_caja_id AND fecha = v_fecha;

  IF NOT FOUND THEN
    RAISE NOTICE 'No hay venta_diaria para caja % fecha %', v_caja_id, v_fecha;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Solo el trigger para otros_movimientos
DROP TRIGGER IF EXISTS trg_otros_movimientos_sync ON public.otros_movimientos;
CREATE TRIGGER trg_otros_movimientos_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.otros_movimientos
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_otros_movimientos();
