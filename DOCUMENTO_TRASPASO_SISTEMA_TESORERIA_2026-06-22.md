# Documento de Traspaso: Sistema de Tesorería - Iciz Market

**Fecha**: 2026-06-22  
**Último commit**: 3bb9c9c  
**Branch**: main  
**Modelo activo**: qwen3.7-plus (custom/opencode-go)

---

## 1. Resumen y Objetivo del Proyecto

El **Sistema de Tesorería** es el pipeline financiero del Emporio ICIZ (minimarket). Automatiza la conciliación diaria entre las cajas registradoras (BSale POS) y la reserva de tesorería física. Captura ventas por método de pago, retiros de efectivo, pagos a proveedores, otros movimientos y correcciones contables. El sistema genera un Flujo de Caja proyectado a 30 días y permite el control de liquidez en tiempo real.

---

## 2. Arquitectura y Stack Tecnológico

| Capa | Tecnología | Rol |
|------|------------|-----|
| Pipeline scraping | Node.js + Playwright | Extrae datos diarios de BSale |
| Scripts orquestación | CommonJS (.cjs) | Clasifica movimientos, parsea observaciones, inserta en BD |
| App web (frontend) | React 19 + Vite 7 + Tailwind | Dashboards de reserva, proveedores, flujo de caja |
| Backend/BD | Supabase (Postgres + REST API + RLS) | Persistencia y lógica de negocio server-side |
| Hosting frontend | Vercel | Deploy de la app web React |
| Agente IA | Hermes Agent (Nous Research) | Automatización, cron jobs, desarrollo |

**Instancia Supabase**: `txmhrtwhurqnmnmjztqh.supabase.co`  
**Repo GitHub**: `comprasviaweb70-boop/sistema-tesoreria.git`  
**App Vercel**: https://sistema-tesoreria-app.vercel.app/

---

## 3. Lógica Central y Estructura

### 3.1 Estructura de Directorios

```
Sistema de Tesoreria/
├── src/
│   ├── lib/                           # Pipeline principal
│   │   ├── procesar-dia.cjs           # Orquestador maestro (--fecha YYYY-MM-DD)
│   │   ├── scrape-cierre-caja.cjs     # Scraper de ventas diarias (Playwright)
│   │   ├── pool-reserva.cjs           # Pool de denominaciones desde saldos_diarios
│   │   ├── parse-denominaciones.cjs   # Parser de observaciones → billetes/monedas
│   │   ├── recalcular-venta.cjs       # Recalcula venta_diaria desde módulos
│   │   └── conciliar-transferencias.cjs # Conciliación cartola bancaria vs BSale
│   ├── components/                    # Componentes React
│   │   ├── OtrosMovimientosForm.jsx
│   │   ├── ProveedoresList.jsx
│   │   └── SupplierPaymentForm.jsx
│   ├── pages/                         # Páginas React
│   │   ├── FlujoCajaPage.jsx          # Flujo de Caja proyectado
│   │   ├── ReservaPage.jsx             # Control de reserva física
│   │   ├── VentaDiariaPage.jsx        # Ventas diarias
│   │   └── InformesPage.jsx            # Reportes
│   └── hooks/
│       └── useReserva.js              # Hook de reserva con saldos_diarios
├── scratch/                            # Scripts one-off de auditoría
└── .env                               # Variables de entorno (NO commiteado)
```

### 3.2 Flujo de Datos

```
BSale POS (app2.bsale.cl)
    ↓ (scraping diario - cron job 9:00 AM)
venta_diaria (Supabase)
    ↓ (consumido por)
Flujo de Caja ←→ Conciliación de Transferencias
    ↓                    ↓
otros_movimientos    cartola bancaria (Excel)
    ↓
pagos_proveedor
reserva_movimientos
saldos_diarios (snapshot automático vía trigger)
```

### 3.3 Pipeline Diario (procesar-dia.cjs)

**Uso**: `node src/lib/procesar-dia.cjs --fecha 2026-06-20`

Orquesta 5 fases en orden:
1. **Scrape** de retiros y otros ingresos (vía Playwright)
2. **Clasificación** de cada movimiento según reglas de negocio
3. **Inicialización** del pool de reserva desde `saldos_diarios`
4. **Inserción** en BD con orden estricto por turno
5. **Recálculo** final de `venta_diaria` vía `recalcular-venta.cjs`

### 3.4 Clasificación de Retiros de Efectivo

| # | Criterio | Clasificación | Destino |
|---|----------|---------------|---------|
| 1 | obs es `Timeout` | Pendiente (alertar) | Reserva ingreso con autoDenom |
| 2 | `RETIRO PREVENTIVO` o `BILLETES DE` o `MONEDAS DE` | Preventivo | `reserva_movimientos` (tipo=ingreso) |
| 3 | `PARA CAJA` o `DINERO CAJA` | Inter-caja | `otros_movimientos` (tipo=egreso, cat=TRANSF_INT) |
| 4 | Match en tabla `proveedores` | Pago proveedor | `pagos_proveedor` |
| 5 | "DEBITO PASADO POR EFECTIVO" / "BOLETA MAL PASADA" | Corrección boleta | `otros_movimientos` (tipo=egreso, cat=DÉBITO_POR_EFECTIVO) |
| 6 | Fallback | RRHH Part-Time | `otros_movimientos` (tipo=egreso, cat=RRHH_PT) |

### 3.5 Parser de Denominaciones (parse-denominaciones.cjs)

| Patrón | Interpretación | Ejemplo |
|--------|---------------|---------|
| `N BILLETES DE X` | Cantidad explícita | "4 BILLETES DE 20.000" = b20k=80k |
| `N.XXX MONEDAS DE Y` (con punto de miles) | **MONTO**, no cantidad | "10.000 MONEDAS DE 500" = m500=10k |
| `$N DE $X` (con signo $) | **MONTO** siempre | "$500 DE $10" = m10=500 |
| `N DE $X` (sin punto, sin $) | Cantidad | "5 DE $5.000" = b5k=25k |
| `BILLETES DE $X` sin cantidad | Calcula del total | "BILLETES DE $1.000" (total $20k) = b1k=20k |

**Fallbacks**:
1. Si parse > montoTotal → retorna `null` (usa `autoDenominacion`)
2. Si parse < montoTotal → completa con `autoDenominacionParse` (balanceado)
3. Si no hay match → `autoDenominacion(monto)` (de mayor a menor)

### 3.6 Tabla saldos_diarios (Snapshot Automático)

**Mecanismo**:
- Función `recalcular_saldos()` que borra y recalcula todo el histórico
- Trigger después de cada INSERT/UPDATE/DELETE en `reserva_movimientos`
- `pool.init(fecha)` lee SOLO la fila del día anterior (O(1) vs O(N))

**Estructura**:
```sql
saldos_diarios (
  fecha DATE PRIMARY KEY,
  b20k INTEGER, b10k INTEGER, b5k INTEGER, b2k INTEGER, b1k INTEGER,
  m500 INTEGER, m100 INTEGER, m50 INTEGER, m10 INTEGER,
  updated_at TIMESTAMP
)
```

### 3.7 Módulo Flujo de Caja (FlujoCajaPage.jsx)

**Propósito**: Proyección de liquidez a 30 días con acumulación día a día.

**Saldos iniciales** (cierre 28/02/2026, manuales en `fjc_parametros`):
- Reserva: $272,500
- Cajas: $306,410
- Mercado Pago: $693,432
- Banco Chile: $0

**Acumulación de saldos**:
```javascript
currentCajas += (venta_efectivo - pago_caja - cajaGastos - cajaRrhh + diferencia - reservaIn + reservaOut);
currentReserva += (reservaIn - reservaOut); // O usa snapshot de saldos_diarios si existe
currentMP += (abonos_mp - ajusteMP);
currentBCH += (abonos_bch - pago_banco - bankGastos - bankRrhh);
```

**Nota**: El saldo de reserva puede usar snapshot de `saldos_diarios` si existe, sino calcula acumulando.

---

## 4. Reglas Inmutables y Restricciones

### 4.1 Datos Sagrados (NO TOCAR)
- **NO tocar datos de 2026-06-17, 2026-06-18, 2026-06-19 ni 2026-06-20** (correctamente asentados)
- **NO reprocesar días ya corregidos manualmente** sin confirmación explícita del usuario
- **NUNCA cambiar estado a 'Cerrado'** sin visto bueno del usuario

### 4.2 Orden de Procesamiento
- **REGLA INQUEBRANTABLE**: Mañana egresos → Mañana ingresos → Tarde egresos → Tarde ingresos
- Motivo: el pool de reserva debe estar actualizado con los egresos antes de sumar los ingresos

### 4.3 Git y Deploy
- **Stagear específico**, NO `git add -A` ni `git add .`
- **NO commitear** `Keys Sistema de Tesoreria.txt` ni `.env`
- **Verificar Vercel deploys** después de push
- **Evitar force-push** (rompe webhook de Vercel)

### 4.4 Modelo y Comunicación
- **Modelo activo**: qwen3.7-plus (custom/opencode-go)
- **Regla**: NO modificar código, hacer commits, ejecutar scripts de mutación sin OK explícito
- **Regla**: Avisar cada cambio de modelo detectado y pedir ratificación
- **Idioma**: Toda la comunicación en ESPAÑOL
- **Preferencia**: El usuario prefiere EJECUTAR primero, explicar después

### 4.5 Variables de Entorno
- Usar `SUPABASE_SERVICE_KEY` (sin prefijo `VITE_`)
- BSale scraping: `PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright`
- BSale pass: `Iciz3525` (NO documentar en archivos commiteados)

### 4.6 UUIDs Críticos
```
RRHH_PT           = 82f02d10-b937-4006-8176-6fe5f50c9bae
TRANSF_INT        = 427f6489-fcf0-4d1d-96cf-4fae600bcb37
EFECTIVO_X_DEBITO = 9e2babac-97b1-45f3-9f0e-a4bea377b2e8
DEBITO_X_EFECTIVO = db4ae4a4-eec3-4d43-bf08-b53e2b7d47dd
```

### 4.7 Cajas (UUIDs)
```
26 (ALEJANDRA C.)  = f80cee57-8f37-4552-90e8-8309bf061102
35 (CAJA 1 N.)     = f9ba9071-c0c4-402b-89eb-8d8e645cb645
37 (CAJA 2 N.)     = 0e28ce44-a6eb-4fe7-b787-396a17b6eed7
39 (CAJA 3 N.)     = 6df7849d-1d89-4db7-b044-afab16ffadb6
27 (GABRIEL S.)    = a36578b3-dad1-4cee-8b6d-56f1acf67b1c
9  (IRMA I.)       = 6d872d03-2383-4c92-9157-0deb40be44f6
30 (JACQUELINE Y.) = b6e52a93-e6e0-4bc1-aa3e-421b2031e96c
2  (Julian S.)     = ca22e80f-d770-4966-9913-c32bde757297
```

### 4.8 Julian S. (Caja 2)
- Julian S. maneja pagos de cliente específico como transferencias grandes
- **NO flaggear como anómalo** si efectivo/débito=0 con transferencia alta

### 4.9 Correcciones de Boleta
- **NO afectan a retiros_efectivo**, sino que redistribuyen entre `venta_efectivo` y `redelcom`
- Requieren dos pasos: insertar en `otros_movimientos` + PATCH manual a `venta_diaria`
- El segundo PATCH automático falla a veces (workaround: PATCH manual)

### 4.10 Interdependencias entre Módulos
- **SEGURO cambiar en Flujo de Caja**: Lógica de visualización, cálculos de acumulación, filtros, parámetros
- **REQUIERE COORDINACIÓN**: Cambios en estructura de `venta_diaria`, modificaciones en `otros_movimientos`, cambios en lógica de scraping
- **NUNCA cambiar sin analizar impacto**: Eliminar columnas de tablas compartidas, cambiar nombres de campos usados por múltiples módulos

---

## 5. Estado Actual y Próximos Pasos

### 5.1 Estado Actual (2026-06-22)

**Último commit**: `3bb9c9c` - "Fix: aplicar snapshot de reserva antes de guardar saldos"

**Commits recientes**:
1. `3bb9c9c` - Fix: aplicar snapshot de reserva antes de guardar saldos
2. `b5a22df` - Fix: corregir lógica de snapshot de reserva
3. `98d0b51` - Fix: usar saldos_diarios para saldo de reserva en Flujo de Caja
4. `a67530c` - Fix: saldos iniciales se muestran como texto y no se sobrescriben con defaults
5. `718a88d` - Fix: saldos del Flujo de Caja ahora se acumulan correctamente entre días

**Datos en Supabase (Marzo 2026)**:
- venta_diaria: 126 registros
- reserva_movimientos: 186 registros
- pagos_proveedor: 287 registros
- otros_movimientos: 185 registros

**Cron Job**:
- ID: `sincronizacion-venta-diaria`
- Schedule: `0 9 * * *` (9:00 AM diario)
- **PENDIENTE**: Modificar para que los lunes ejecute sábado + domingo

### 5.2 Problemas Pendientes de Flujo de Caja

**Problema 1: Duplicación potencial de datos**
- **Ubicación**: Líneas 307-311 de FlujoCajaPage.jsx
- **Descripción**: Suma `venta_diaria` + `otros_movimientos` (bankAgg)
- **Riesgo**: Puede duplicar si los mismos movimientos están en ambas tablas

**Problema 2: Filtro de cuenta_corriente engañoso**
- **Ubicación**: Línea 262 de FlujoCajaPage.jsx
- **Código**: `m.caja_id === 'cuenta_corriente' || m.caja_id === null`
- **Problema**: `caja_id` es UUID type, el string nunca matchea. Solo `null` funciona

**Problema 3: Defaults de parámetros en $0**
- **Ubicación**: Líneas 78-81 de FlujoCajaPage.jsx
- **Descripción**: Si la tabla `fjc_parametros` está vacía, se insertan defaults en $0

**Problema 4: handleInitialChange actualiza ambos días**
- **Ubicación**: Líneas 187-199 de FlujoCajaPage.jsx
- **Código**: `.update({ estimado_lun_jue: val, estimado_vie_dom: val })`
- **Problema**: Actualiza Lun-Jue y Vie-Dom con el mismo valor

**Problema 5: Falta validación de datos vacíos**
- **Descripción**: No hay manejo explícito si `params` llega vacío después del fetch

**Problema 6: No hay indicador visual de datos proyectados vs reales**
- **Descripción**: Los días futuros usan `getParam()` (proyección), pero no hay separación visual clara

### 5.3 Próximos Pasos Inmediatos

1. **Modificar cron job** para que los lunes ejecute sincronización de sábado + domingo
2. **Investigar Problema 1** (duplicación potencial) en Flujo de Caja
3. **Limpiar Problema 2** (filtro engañoso) en Flujo de Caja
4. **Agregar proveedores faltantes** en BD: HIPERLIMPIO, TAFI
5. **Revisar por qué el PATCH2 de corrección de boleta falla** a veces

### 5.4 Scripts de Pipeline (Orden de Uso)

```bash
# 1. Scrapear cierre de caja desde BSale
PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright node src/lib/scrape-cierre-caja.cjs --fecha YYYY-MM-DD

# 2. Insertar venta_diaria desde CSV
node src/lib/procesar-csv.cjs --fecha=YYYY-MM-DD --modo=venta

# 3. Recalcular venta_diaria
node src/lib/recalcular-venta.cjs --fecha YYYY-MM-DD --todas

# 4. CIERRE MANUAL: UPDATE venta_diaria SET estado='Cerrado' WHERE fecha=YYYY-MM-DD
```

### 5.5 Bugs Conocidos del Pipeline

| # | Bug | Prioridad | Workaround |
|---|-----|-----------|------------|
| 1 | Pool no siempre refleja correcciones manuales en `reserva_movimientos` | MEDIA | Verificar `saldos_diarios` tras cambio pesado |
| 2 | Segundo PATCH de corrección de boleta no se aplica | MEDIA | Hacer PATCH manual con valores calculados |
| 3 | Falso positivo EMPANADAS OMA vs EMPANADAS VIKYS | BAJA | Preferir proveedor con más keywords absolutos |
| 4 | HIPERLIMPIO no existe en tabla `proveedores` | BAJA | Agregar en Supabase SQL Editor |
| 5 | TAFI no existe en tabla `proveedores` | BAJA | Agregar en Supabase SQL Editor |

---

## 6. Variables de Entorno

```bash
VITE_SUPABASE_URL=https://txmhrtwhurqnmnmjztqh.supabase.co
SUPABASE_SERVICE_KEY=<key>
BSALE_API_KEY=<key>
BSALE_WEB_USER=jsanz70@gmail.com
BSALE_WEB_PASS=Iciz3525
```

---

**Fin del documento de traspaso**

Generado el 22 de Junio de 2026 para migración a nuevo entorno de IA.
