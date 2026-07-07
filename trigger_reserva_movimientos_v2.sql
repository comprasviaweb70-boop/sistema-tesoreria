-- TRIGGER: reserva_movimientos (ingreso) → venta_diaria.traspaso_tesoreria_egreso
-- Los retiros de caja son egresos de la caja hacia tesorería

CREATE OR REPLACE FUNCTION public.actualizar_traspaso_efectivo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_caja_id UUID;
  v_fecha DATE;
  v_total NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_caja_id := OLD.caja_id;
    v_fecha := OLD.fecha;
  ELSE
    v_caja_id := NEW.caja_id;
    v_fecha := NEW.fecha;
  END IF;

  SELECT COALESCE(SUM(monto_total), 0)
  INTO v_total
  FROM public.reserva_movimientos
  WHERE caja_id = v_caja_id
    AND fecha = v_fecha
    AND tipo = 'ingreso';

  UPDATE public.venta_diaria
  SET traspaso_tesoreria_egreso = v_total,
      updated_at = NOW()
  WHERE caja_id = v_caja_id AND fecha = v_fecha;

  RETURN COALESCE(NEW, OLD);
END;
$$;
