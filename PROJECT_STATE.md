# PROJECT_STATE.md - Sistema de Tesorería Iciz Market

**Última actualización:** 2026-07-22  
**Branch:** main  
**Modelo activo:** qwen3.6-plus  
**Último commit:** `4232643` — "Fix: delay 3min en sync, deteccion de dias pendientes por granulares, toast reserva silencioso"

---

## Visión del Proyecto

Automatizar completamente la conciliación financiera diaria del Emporio ICIZ (minimarket), eliminando el trabajo manual de conteo de caja, registro de movimientos y proyección de flujo de caja. El sistema debe:

1. **Capturar automáticamente** las ventas diarias desde BSale POS
2. **Clasificar inteligentemente** cada movimiento de efectivo (retiros preventivos, pagos a proveedores, RRHH, transferencias entre cajas)
3. **Mantener un pool de reserva** con control de denominaciones (billetes y monedas)
4. **Proyectar el flujo de caja** a 30 días para toma de decisiones de liquidez
5. **Conciliar transferencias** con cartola bancaria automáticamente

**Objetivo final:** Que el usuario solo deba verificar los resultados cada mañana, sin intervención manual en el pipeline de datos.

---

## Progreso Actual

| Módulo | Estado | % Completado |
|--------|--------|--------------|
| **Scraping BSale** | ✅ Funcional | 95% |
| **Pipeline de Sincronización** | ✅ Funcional (con delay de red) | 90% |
| **Venta Diaria (UI + BD)** | ✅ Funcional | 85% |
| **Reserva de Tesorería** | ✅ Funcional | 80% |
| **Pagos a Proveedores** | ✅ Funcional | 85% |
| **Flujo de Caja** | ⚠️ Funcional con bug BCH | 70% |
| **Conciliación Bancaria** | 🟡 En desarrollo | 40% |
| **Informes/Reportes** | ✅ Básico funcional | 60% |

**Progreso general del proyecto:** ~75%

---

## Estado Actual

El pipeline de sincronización Venta Diaria (BSale → Supabase) está **funcional pero con fallos intermitentes** en ejecución automática (Startup de Windows). El fallo se debe a que la red no está lista cuando el script se ejecuta al iniciar la PC.

**Solución implementada:** Delay de 3 minutos al inicio de `run-sync.ps1` para dar tiempo a que la red esté estable antes de scrapear BSale.

**Datos en Supabase:**
- `venta_diaria`: ~150+ registros (Junio-Julio 2026)
- `reserva_movimientos`: ~200+ registros
- `pagos_proveedor`: ~300+ registros
- `otros_movimientos`: ~200+ registros

**Último día procesado:** 2026-07-19 (completado automáticamente el 20/07)
**Días reprocesados:** 2026-07-16 y 2026-07-18 (granulares estaban en 0, corregidos)

---

## Decisiones Tomadas

| Decisión | Razón | Fecha |
|----------|-------|-------|
| **Delay de 3 min en run-sync.ps1** | La red no está lista al iniciar Windows, BSale falla al scrapear | 2026-07-17 |
| **Paso 4 se ejecuta aunque paso 3 falle** | Si hay movimientos de ejecuciones parciales, el recálculo corrige las granulares | 2026-07-17 |
| **Em-dash (—) reemplazado por guión normal (-)** | PowerShell 5.1 no parsea correctamente el carácter em-dash | 2026-07-17 |
| **Detección de días pendientes por granulares** | `detectar-dias-pendientes.cjs` ahora verifica `retiros_efectivo > 0` en vez de solo `total_ventas > 0`, para no saltar días donde el CSV se insertó pero el pipeline de movimientos no se ejecutó | 2026-07-20 |
| **Toast de reserva silencioso en vez de destructivo** | El toast "fecha fuera de rango" era confuso y agresivo; el filtro se limpia silenciosamente | 2026-07-20 |
| **No commitear `.env` ni `Keys Sistema de Tesoreria.txt`** | Contienen credenciales sensibles | 2026-06-22 |
| **NO tocar datos de 2026-06-17 a 2026-06-20** | Ya fueron corregidos manualmente, están correctos | 2026-06-22 |
| **NUNCA cambiar estado a 'Cerrado' sin confirmación** | Puede bloquear ediciones posteriores | 2026-06-22 |
| **REGLA INQUEBRANTABLE: Mañana egresos → Mañana ingresos → Tarde egresos → Tarde ingresos** | El pool de reserva debe estar actualizado antes de sumar ingresos | 2026-06-22 |
| **Stagear específico, NO `git add -A`** | Evitar commitear archivos sensibles | 2026-06-22 |
| **Clasificación por texto libre es frágil** | Se identificó como deuda técnica, pero se mantiene por ahora | 2026-06-22 |
| **Flujo de Caja tiene bug crítico BCH negativo** | No distingue movimientos MP vs BCH, pendiente de resolución | 2026-06-23 |
| **PROJECT_STATE.md conectado a Kilo Code** | Se creó `kilo.json` con `instructions: ["PROJECT_STATE.md"]` para que Kilo lo lea al inicio de cada sesión | 2026-07-17 |
| **Bug parser confunde monedas con billetes en reDe** | `parse-denominaciones.cjs` línea 86: `denominacion < 500` multiplicaba por 1000 **antes** de verificar si ya era denominación de moneda válida ($100, $50, $10). Ej: "200 DE $100" → `getDenomKey(100000)` = `null` → se descartaba. Fix aplicado: verificar `getDenomKey(valor, 'moneda')` antes de multiplicar en los 3 handlers (reDe, reDenom, reBillSinCant). Commit `71a9a63`. Detectado con retiro Nº 43902 de IRMA I. | 2026-07-22 |
| **Comunicación siempre en español** | Toda interacción con Kilo Code debe ser en español; respuestas, commits, y documentación en español | 2026-07-22 |

---

## Hitos Alcanzados

### Pipeline de Sincronización
- [x] Scraper de BSale con Playwright (`scrape-cierre-caja.cjs`)
- [x] Procesamiento de CSV a `venta_diaria` (`procesar-csv.cjs`)
- [x] Pipeline maestro de procesamiento diario (`procesar-dia.cjs`)
- [x] Recálculo de venta diaria desde módulos (`recalcular-venta.cjs`)
- [x] Detección de días pendientes por columnas granulares (`detectar-dias-pendientes.cjs`)
- [x] Pool de denominaciones desde `saldos_diarios` (`pool-reserva.cjs`)
- [x] Parser de denominaciones en observaciones (`parse-denominaciones.cjs`)
- [x] Script orquestador con delay de red (`run-sync.ps1`)
- [x] Ejecución automática desde Startup de Windows

### App Web (React + Vite)
- [x] Página Venta Diaria con edición y conciliación
- [x] Página Flujo de Caja con proyección a 30 días
- [x] Página Reserva con control de denominaciones
- [x] Página Informes/Reportes
- [x] Componente de pagos a proveedores
- [x] Componente de otros movimientos
- [x] Trigger de `saldos_diarios` automático
- [x] Toast de reserva silencioso (no destructivo)

### Infraestructura
- [x] Supabase configurado (Postgres + REST API + RLS)
- [x] Deploy en Vercel
- [x] Cron job de sincronización diaria
- [x] Logging de ejecuciones (`logs/sync-run.log`)
- [x] `PROJECT_STATE.md` como cerebro del proyecto
- [x] `kilo.json` conectado a Kilo Code

---

## Pendientes Críticos

### 🔴 Críticos
| Tarea | Descripción | Prioridad |
|-------|-------------|-----------|
| **Bug BCH negativo en Flujo de Caja** | El saldo Banco Chile muestra valores negativos crecientes porque no distingue movimientos MP vs BCH en `otros_movimientos` | ALTA |
| **Validar delay de 3 min en producción** | Verificar que el delay resuelve los fallos intermitentes en las próximas ejecuciones automáticas | ALTA |
| **Clasificación por texto frágil** | Múltiples módulos dependen de nombres de categoría por texto (`startsWith`, `includes`). Un cambio de nombre rompe la clasificación | MEDIA |

### 🟡 Importantes
| Tarea | Descripción | Prioridad |
|-------|-------------|-----------|
| **Cron job lunes: sábado + domingo** | El cron actual no procesa sábados/domingos acumulados el lunes | MEDIA |
| **Proveedores faltantes en BD** | HIPERLIMPIO y TAFI no existen en tabla `proveedores` | BAJA |
| **PATCH2 de corrección de boleta falla** | El segundo PATCH automático a veces no se aplica | MEDIA |
| **Filtro `cuenta_corriente` engañoso** | `m.caja_id === 'cuenta_corriente'` nunca matchea (es UUID, no string) | BAJA |
| **`handleInitialChange` actualiza ambos rangos** | Escribe `estimado_lun_jue` y `estimado_vie_dom` con el mismo valor | BAJA |
| **`upsert` destructivo en `fjc_parametros`** | Puede pisar valores manuales ajustados | MEDIA |

### 🟢 Mejoras
| Tarea | Descripción | Prioridad |
|-------|-------------|-----------|
| **Separar fuentes de verdad en Venta Diaria** | Múltiples capas calculan los mismos totales (UI, sync, BD) | MEDIA |
| **Reducir viajes repetidos a Supabase** | El sync hace varios refresh/re-fetch innecesarios | BAJA |
| **Extraer cálculo de Flujo de Caja a funciones puras** | El componente `FlujoCajaPage.jsx` mezcla demasiada lógica | BAJA |
| **Normalizar categorías por IDs estables** | Reemplazar clasificación por texto con IDs de categoría | MEDIA |

---

## Siguientes Pasos

1. **Monitorear ejecución automática** - Verificar que el delay de 3 min resuelve los fallos de red en las próximas mañanas
2. **Resolver bug BCH negativo** - Determinar cómo distinguir movimientos MP vs BCH en `otros_movimientos` (¿por `categoria_id`? ¿por `descripcion`?)
3. **Agregar proveedores faltantes** - HIPERLIMPIO y TAFI en tabla `proveedores`
4. **Modificar cron job para lunes** - Que ejecute sábado + domingo acumulados
5. **Investigar PATCH2 de corrección de boleta** - Por qué falla a veces el segundo PATCH automático

---

## UUIDs Críticos (Referencia Rápida)

### Categorías
```
RRHH_PT           = 82f02d10-b937-4006-8176-6fe5f50c9bae
TRANSF_INT        = 427f6489-fcf0-4d1d-96cf-4fae600bcb37
EFECTIVO_X_DEBITO = 9e2babac-97b1-45f3-9f0e-a4bea377b2e8
DEBITO_X_EFECTIVO = db4ae4a4-eec3-4d43-bf08-b53e2b7d47dd
```

### Cajas
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

---

## Archivos de Documentación Relacionados

| Archivo | Contenido |
|---------|-----------|
| `DOCUMENTO_TRASPASO_SISTEMA_TESORERIA_2026-06-22.md` | Visión general completa del pipeline |
| `DOCUMENTO_TRASPASO_FLUJO_CAJA_2026-06-23.md` | Bug crítico BCH negativo |
| `AUDITORIA_VENTA_DIARIA_2026-06-22.md` | Fuentes de verdad duplicadas, acoplamiento |
| `AUDITORIA_FLUJO_CAJA_2026-06-22.md` | Módulo sobrecargado, clasificación por texto |

---

*Este archivo debe actualizarse cada vez que se tome una decisión importante o se complete un hito.*
