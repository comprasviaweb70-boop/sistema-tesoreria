-- ==========================================
-- CREAR TABLA saldos_diarios + FUNCIÓN + TRIGGER
-- Ejecutar en orden en SQL Editor de Supabase
-- ==========================================

-- 1. Crear tabla
CREATE TABLE saldos_diarios (
  fecha DATE PRIMARY KEY,
  b20k INTEGER DEFAULT 0,
  b10k INTEGER DEFAULT 0,
  b5k  INTEGER DEFAULT 0,
  b2k  INTEGER DEFAULT 0,
  b1k  INTEGER DEFAULT 0,
  m500 INTEGER DEFAULT 0,
  m100 INTEGER DEFAULT 0,
  m50  INTEGER DEFAULT 0,
  m10  INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS
ALTER TABLE saldos_diarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lectura publica" ON saldos_diarios FOR SELECT USING (true);
CREATE POLICY "escritura service_role" ON saldos_diarios FOR ALL USING (false);

-- 3. Función de recálculo completo
CREATE OR REPLACE FUNCTION recalcular_saldos()
RETURNS void AS $$
DECLARE
  reg RECORD;
  _b20k INTEGER := 0;
  _b10k INTEGER := 0;
  _b5k  INTEGER := 0;
  _b2k  INTEGER := 0;
  _b1k  INTEGER := 0;
  _m500 INTEGER := 0;
  _m100 INTEGER := 0;
  _m50  INTEGER := 0;
  _m10  INTEGER := 0;
BEGIN
  TRUNCATE saldos_diarios;
  
  FOR reg IN
    SELECT fecha,
           SUM(CASE WHEN tipo='ingreso' THEN COALESCE(b20k,0) ELSE -COALESCE(b20k,0) END) as net_b20k,
           SUM(CASE WHEN tipo='ingreso' THEN COALESCE(b10k,0) ELSE -COALESCE(b10k,0) END) as net_b10k,
           SUM(CASE WHEN tipo='ingreso' THEN COALESCE(b5k,0)  ELSE -COALESCE(b5k,0)  END) as net_b5k,
           SUM(CASE WHEN tipo='ingreso' THEN COALESCE(b2k,0)  ELSE -COALESCE(b2k,0)  END) as net_b2k,
           SUM(CASE WHEN tipo='ingreso' THEN COALESCE(b1k,0)  ELSE -COALESCE(b1k,0)  END) as net_b1k,
           SUM(CASE WHEN tipo='ingreso' THEN COALESCE(m500,0) ELSE -COALESCE(m500,0) END) as net_m500,
           SUM(CASE WHEN tipo='ingreso' THEN COALESCE(m100,0) ELSE -COALESCE(m100,0) END) as net_m100,
           SUM(CASE WHEN tipo='ingreso' THEN COALESCE(m50,0)  ELSE -COALESCE(m50,0)  END) as net_m50,
           SUM(CASE WHEN tipo='ingreso' THEN COALESCE(m10,0)  ELSE -COALESCE(m10,0)  END) as net_m10
    FROM reserva_movimientos
    GROUP BY fecha
    ORDER BY fecha
  LOOP
    _b20k := GREATEST(0, _b20k + reg.net_b20k);
    _b10k := GREATEST(0, _b10k + reg.net_b10k);
    _b5k  := GREATEST(0, _b5k  + reg.net_b5k);
    _b2k  := GREATEST(0, _b2k  + reg.net_b2k);
    _b1k  := GREATEST(0, _b1k  + reg.net_b1k);
    _m500 := GREATEST(0, _m500 + reg.net_m500);
    _m100 := GREATEST(0, _m100 + reg.net_m100);
    _m50  := GREATEST(0, _m50  + reg.net_m50);
    _m10  := GREATEST(0, _m10  + reg.net_m10);
    
    INSERT INTO saldos_diarios (fecha, b20k, b10k, b5k, b2k, b1k, m500, m100, m50, m10, updated_at)
    VALUES (reg.fecha, _b20k, _b10k, _b5k, _b2k, _b1k, _m500, _m100, _m50, _m10, NOW())
    ON CONFLICT (fecha) DO UPDATE SET
      b20k = EXCLUDED.b20k, b10k = EXCLUDED.b10k, b5k = EXCLUDED.b5k,
      b2k = EXCLUDED.b2k, b1k = EXCLUDED.b1k,
      m500 = EXCLUDED.m500, m100 = EXCLUDED.m100, m50 = EXCLUDED.m50, m10 = EXCLUDED.m10,
      updated_at = NOW();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger automático (FOR EACH STATEMENT)
CREATE OR REPLACE FUNCTION trg_recalcular_saldos()
RETURNS trigger AS $$
BEGIN
  PERFORM recalcular_saldos();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_saldos_after_change
AFTER INSERT OR UPDATE OR DELETE ON reserva_movimientos
FOR EACH STATEMENT EXECUTE FUNCTION trg_recalcular_saldos();

-- 5. Población inicial
SELECT recalcular_saldos();

-- 6. Verificar
SELECT fecha, b20k, b10k, b5k, b1k, m500, m100, m50, m10 FROM saldos_diarios ORDER BY fecha;

-- Mensaje final
SELECT '✅ saldos_diarios creado y poblado exitosamente' as resultado;
