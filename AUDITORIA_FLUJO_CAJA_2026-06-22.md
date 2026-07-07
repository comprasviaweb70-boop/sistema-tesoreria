# Auditoría del Módulo Flujo de Caja

**Proyecto:** Sistema de Tesorería Iciz Market  
**Módulo:** Flujo de Caja  
**Fecha:** 2026-06-22  
**Enfoque:** incongruencias, basura funcional, conexiones ineficientes con otros módulos y oportunidades de mejora

---

## 1. Resumen Ejecutivo

El módulo **Flujo de Caja** es uno de los puntos más sensibles del sistema porque consolida varias fuentes:
- `venta_diaria`
- `pagos_proveedor`
- `reserva_movimientos`
- `otros_movimientos`
- `fjc_saldos_ajuste`
- `saldos_diarios`

Funciona, pero hoy combina demasiadas responsabilidades en un solo componente. La lógica de proyección, la lógica histórica, la edición de parámetros y la lectura de snapshots conviven sin una frontera clara.

### Veredicto
- **Estado general:** funcional, pero estructuralmente cargado
- **Riesgo principal:** proyección y acumulación mezcladas de forma frágil
- **Prioridad de intervención:** muy alta

---

## 2. Hallazgos Principales

### 2.1 `upsert` contradictorio con el criterio de preservación

El módulo usa:
- `supabase.from('fjc_parametros').upsert(editingParams)`

Eso contradice la idea de no sobrescribir valores manuales de forma destructiva.

**Impacto:**
- puede pisar valores ya ajustados,
- rompe el control fino por parámetro,
- y hace más difícil auditar qué cambió realmente.

### 2.2 `handleInitialChange()` destruye la separación entre lunes-jueves y viernes-domingo

Actualmente actualiza ambos campos con el mismo valor:
- `estimado_lun_jue: val`
- `estimado_vie_dom: val`

**Impacto:**
- elimina la distinción operativa entre semana normal y fin de semana,
- simplifica artificialmente la proyección,
- reduce la utilidad real del módulo.

### 2.3 Filtro de cuenta corriente inválido

El código filtra:
- `m.caja_id === 'cuenta_corriente' || m.caja_id === null`

Pero el modelo de datos usa `UUID` o `null`. El string `'cuenta_corriente'` es un camino muerto.

**Impacto:**
- confusión semántica,
- falsa percepción de soporte para un valor que no existe como UUID,
- riesgo de lectura equivocada del historial.

### 2.4 Reserva demasiado dependiente del snapshot

La reserva hace esto:
- si existe `saldos_diarios`, se usa snapshot,
- si no, se mantiene el último saldo conocido.

Eso puede funcionar, pero deja la reserva muy atada a la calidad del snapshot.

**Impacto:**
- si el snapshot falla, el cálculo puede quedar congelado o arrastrar un valor anterior,
- la trazabilidad del saldo de reserva se vuelve menos transparente.

### 2.5 Clasificación por texto libre

En `bankAgg` se clasifica por texto:
- `proveedor`
- `rrhh`
- `sueldo`
- `personal`
- else → gastos

**Impacto:**
- muy sensible a nombres de categorías,
- difícil de mantener,
- propenso a falsos positivos o falsos negativos.

### 2.6 Módulo demasiado concentrado

`dailyFlow` reúne:
- carga de datos históricos,
- clasificación bancaria,
- uso de snapshots,
- proyección futura,
- y salida para UI.

**Impacto:**
- muy difícil de probar en unidades pequeñas,
- difícil de razonar sin leer todo el componente,
- riesgo alto de regresión al modificar una sola parte.

---

## 3. Conexiones Ineficientes con Otros Módulos

### 3.1 Dependencia fuerte de Venta Diaria

Flujo de Caja consume gran parte de `venta_diaria` y luego la reinterpreta por método de pago y tipo de gasto.
Eso es correcto funcionalmente, pero no está bien encapsulado.

### 3.2 Dependencia de `otros_movimientos` para lógica bancaria

El módulo lee movimientos de cuenta corriente y luego los convierte en:
- ingresos,
- egresos proveedor,
- egresos RRHH,
- egresos gastos.

Eso significa que Flujo de Caja depende de que `otros_movimientos` ya venga extremadamente bien categorizado.

### 3.3 Dependencia de `saldos_diarios` como respaldo implícito

La reserva usa `saldos_diarios` como snapshot. Esa dependencia es útil, pero hoy no queda suficientemente explícito si es fuente primaria, secundaria o solo de respaldo.

---

## 4. Basura / Deuda Técnica Detectada

- `scrollContainerRef`, `topScrollRef` y sincronización de scroll: útiles, pero agregan complejidad UI al cálculo financiero.
- Doble estado de parámetros:
  - `params`
  - `editingParams`
- `historyData` cargando demasiadas tablas a la vez para un solo componente.
- Lógica de proyección, edición y consolidación mezcladas en la misma función.

---

## 5. Riesgos

1. **Pérdida de trazabilidad** del saldo de reserva.
2. **Cálculo incorrecto** por clasificación textual de movimientos.
3. **Sobrescritura accidental** de parámetros financieros.
4. **Complejidad excesiva** para un módulo que debería ser de lectura clara.
5. **Fragilidad** si otro módulo cambia nombres o estructuras de categorías.

---

## 6. Recomendaciones

### Prioridad alta
- Eliminar el `upsert` destructivo de `fjc_parametros`.
- Separar de verdad los parámetros de lunes-jueves y viernes-domingo.
- Corregir el filtro de cuenta corriente para usar un criterio consistente con el modelo de datos.

### Prioridad media
- Extraer el cálculo del flujo a funciones puras fuera del componente.
- Normalizar la clasificación de movimientos por IDs/categorías estables.
- Definir una política clara para reserva: snapshot, acumulación o híbrido documentado.

### Prioridad baja
- Separar la UI de edición de parámetros de la UI de reporte.
- Reducir el tamaño de `dailyFlow`.
- Revisar si la sincronización de scroll es realmente necesaria en el mismo componente.

---

## 7. Plan de Acción Sugerido

### Fase 1 — Correcciones críticas
1. Reemplazar el `upsert` por actualizaciones puntuales.
2. Corregir `handleInitialChange()` para no escribir ambos rangos con el mismo valor.
3. Eliminar el filtro de `'cuenta_corriente'` o reemplazarlo por una convención real.

### Fase 2 — Refactor funcional
1. Extraer el cálculo de flujo a utilidades puras.
2. Separar lectura histórica de proyección.
3. Normalizar categorías de movimientos.

### Fase 3 — Limpieza y robustez
1. Reducir estado duplicado.
2. Simplificar la UI de parámetros.
3. Documentar explícitamente el rol de `saldos_diarios`.

---

## 8. Conclusión

Flujo de Caja es el módulo con más deuda estructural. No porque falle siempre, sino porque hoy mezcla demasiadas capas de lógica financiera en un solo bloque.

Si se descompone en piezas más pequeñas y se corrige la relación con parámetros, cuenta corriente y snapshots, puede volverse mucho más confiable y legible.
