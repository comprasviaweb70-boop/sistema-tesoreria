-- SCRIPT PARA CREAR LA TABLA DE SALDOS DIARIOS
-- Ejecutar este script en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS fjc_saldos_diarios (
    fecha DATE PRIMARY KEY,
    saldo_reserva NUMERIC DEFAULT 0,
    saldo_cajas NUMERIC DEFAULT 0,
    saldo_mp NUMERIC DEFAULT 0,
    saldo_bch NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS si es necesario (opcional, dependiendo de tu configuración)
-- ALTER TABLE fjc_saldos_diarios ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Permitir todo a usuarios autenticados" ON fjc_saldos_diarios FOR ALL TO authenticated USING (true);
