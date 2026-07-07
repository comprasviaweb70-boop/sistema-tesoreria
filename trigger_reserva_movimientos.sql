-- TRIGGER: reserva_movimientos → venta_diaria.traspaso_efectivo
-- Al insertar/actualizar/eliminar un ingreso en reserva, se actualiza
-- el campo traspaso_efectivo en venta_diaria automáticamente

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

  -- Sumar solo ingresos de reserva (tipo = 'ingreso')
  SELECT COALESCE(SUM(monto_total), 0)
  INTO v_total
  FROM public.reserva_movimientos
  WHERE caja_id = v_caja_id
    AND fecha = v_fecha
    AND tipo = 'ingreso';

  UPDATE public.venta_diaria
  SET traspaso_efectivo = v_total,
      updated_at = NOW()
  WHERE caja_id = v_caja_id AND fecha = v_fecha;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Triggers
DROP TRIGGER IF EXISTS trg_reserva_movimientos_insert ON public.reserva_movimientos;
CREATE TRIGGER trg_reserva_movimientos_insert
  AFTER INSERT ON public.reserva_movimientos
  FOR EACH ROW
  WHEN (NEW.tipo = 'ingreso')
  EXECUTE FUNCTION public.actualizar_traspaso_efectivo();

DROP TRIGGER IF EXISTS trg_reserva_movimientos_update ON public.reserva_movimientos;
CREATE TRIGGER trg_reserva_movimientos_update
  AFTER UPDATE ON public.reserva_movimientos
  FOR EACH ROW
  WHEN (NEW.tipo = 'ingreso' OR OLD.tipo = 'ingreso')
  EXECUTE FUNCTION public.actualizar_traspaso_efectivo();

DROP TRIGGER IF EXISTS trg_reserva_movimientos_delete ON public.reserva_movimientos;
CREATE TRIGGER trg_reserva_movimientos_delete
  AFTER DELETE ON public.reserva_movimientos
  FOR EACH ROW
  WHEN (OLD.tipo = 'ingreso')
  EXECUTE FUNCTION public.actualizar_traspaso_efectivo();
