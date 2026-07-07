-- MIGRACIÓN: Crear tabla sales_entries para integración BSale
-- Archivo: create_sales_entries_table.sql
-- Ubicación: C:\Users\jsanz\Desktop\Antigravity\Sistema de Tesoreria

CREATE TABLE IF NOT EXISTS public.sales_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fecha DATE NOT NULL,
    caja_id VARCHAR(50) NOT NULL,
    caja_nombre VARCHAR(100),
    estado_caja VARCHAR(20) DEFAULT 'PENDIENTE_REVISION' CHECK (estado_caja IN ('ABIERTO', 'PENDIENTE_REVISION')),
    
    -- Campos de ventas por tipo de pago
    sales_cash NUMERIC(12,2) DEFAULT 0,
    sales_card_debit NUMERIC(12,2) DEFAULT 0,
    sales_card_credit NUMERIC(12,2) DEFAULT 0,
    sales_transfer NUMERIC(12,2) DEFAULT 0,
    sales_credit NUMERIC(12,2) DEFAULT 0,
    sales_edenred NUMERIC(12,2) DEFAULT 0,
    other_income NUMERIC(12,2) DEFAULT 0,
    
    -- Campos de movimientos de caja
    cash_withdrawals NUMERIC(12,2) DEFAULT 0,
    
    -- Totales calculados
    total_sales NUMERIC(12,2) GENERATED ALWAYS AS (sales_cash + sales_card_debit + sales_card_credit + sales_transfer + sales_credit + sales_edenred + other_income) STORED,
    total_movements NUMERIC(12,2) GENERATED ALWAYS AS (total_sales + cash_withdrawals) STORED,
    
    -- Identificador único de movimiento en BSale (para evitar duplicados)
    movimiento_id VARCHAR(100),
    
    -- Metadatos
    observaciones TEXT,
    synced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Índices para rendimiento
    CONSTRAINT idx_sales_entries_fecha_caja UNIQUE (fecha, caja_id, movimiento_id),
    INDEX idx_sales_entries_fecha (fecha),
    INDEX idx_sales_entries_caja (caja_id),
    INDEX idx_sales_entries_synced (synced)
);

-- Política RLS (opcional, habilitar si usas Row Level Security)
-- ALTER TABLE public.sales_entries ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Usuarios autenticados pueden leer" ON public.sales_entries FOR SELECT USING (true);
-- CREATE POLICY "Solo servicio integrador puede insertar" ON public.sales_entries FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Solo servicio integrador puede actualizar" ON public.sales_entries FOR UPDATE USING (true);

-- Función trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION public.updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at automáticamente
DROP TRIGGER IF EXISTS update_sales_entries_updated_at ON public.sales_entries;
CREATE TRIGGER update_sales_entries_updated_at
    BEFORE UPDATE ON public.sales_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.updated_at_column();

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE 'Tabla sales_entries creada/verificada correctamente';
END $$;
