-- ============================================================
-- RLS: Solo SELECT público. INSERT/UPDATE/DELETE via service_role
-- ============================================================

-- HABILITAR RLS (por si estaba deshabilitada)
ALTER TABLE public.cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta_diaria ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLA: CAJAS
-- ============================================================

DROP POLICY IF EXISTS cajas_select ON public.cajas;
CREATE POLICY cajas_select ON public.cajas
  FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE → solo service_role
DROP POLICY IF EXISTS cajas_insert ON public.cajas;
CREATE POLICY cajas_insert ON public.cajas
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS cajas_update ON public.cajas;
CREATE POLICY cajas_update ON public.cajas
  FOR UPDATE USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS cajas_delete ON public.cajas;
CREATE POLICY cajas_delete ON public.cajas
  FOR DELETE USING (auth.role() = 'service_role');

-- ============================================================
-- TABLA: VENTA_DIARIA
-- ============================================================

DROP POLICY IF EXISTS venta_diaria_select ON public.venta_diaria;
CREATE POLICY venta_diaria_select ON public.venta_diaria
  FOR SELECT USING (true);

DROP POLICY IF EXISTS venta_diaria_insert ON public.venta_diaria;
CREATE POLICY venta_diaria_insert ON public.venta_diaria
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS venta_diaria_update ON public.venta_diaria;
CREATE POLICY venta_diaria_update ON public.venta_diaria
  FOR UPDATE USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS venta_diaria_delete ON public.venta_diaria;
CREATE POLICY venta_diaria_delete ON public.venta_diaria
  FOR DELETE USING (auth.role() = 'service_role');
