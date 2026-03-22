-- SCRIPT DE CONFIGURACIÓN PARA EL MÓDULO DE FLUJO DE CAJA

-- 1. Tabla de Parámetros de Proyección
CREATE TABLE IF NOT EXISTS fjc_parametros (
    field_key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    estimado_lun_jue NUMERIC DEFAULT 0,
    estimado_vie_dom NUMERIC DEFAULT 0
);

-- 2. Tabla de Ajustes Manuales (Para saldos iniciales o correcciones)
CREATE TABLE IF NOT EXISTS fjc_saldos_ajuste (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha DATE NOT NULL,
    cuenta TEXT NOT NULL, -- 'mercado_pago', 'banco_chile', 'reserva', 'caja'
    monto_ajuste NUMERIC NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabla de Cierres Mensuales (Histórico)
CREATE TABLE IF NOT EXISTS fjc_cierres_mensuales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anio INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    fecha_cierre TIMESTAMPTZ DEFAULT now(),
    datos JSONB NOT NULL,
    UNIQUE(anio, mes)
);

-- 4. Datos iniciales para los parámetros
INSERT INTO fjc_parametros (field_key, label, estimado_lun_jue, estimado_vie_dom)
VALUES 
('venta_efectivo', 'Venta Efectivo', 0, 0),
('abonos_mp', 'Abonos Mercado Pago', 0, 0),
('abonos_bch', 'Abonos Banco Chile', 0, 0),
('pagos_proveedor_banco', 'Pagos Proveedor Banco', 0, 0),
('pagos_proveedor_caja', 'Pagos Proveedor Caja', 0, 0),
('servicios_gastos', 'Servicios y Gastos', 0, 0),
('rrhh', 'RRHH', 0, 0),
('initial_reserva', 'Saldo Inicial Reserva', 1500000, 1500000),
('initial_cajas', 'Saldo Inicial Cajas', 500000, 500000),
('initial_mp', 'Saldo Inicial Mercado Pago', 2000000, 2000000),
('initial_bch', 'Saldo Inicial Banco Chile', 50000, 50000)
ON CONFLICT (field_key) DO NOTHING;
