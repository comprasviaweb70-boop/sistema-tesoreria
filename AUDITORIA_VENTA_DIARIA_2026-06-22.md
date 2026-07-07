# Auditoría del Módulo Venta Diaria

**Proyecto:** Sistema de Tesorería Iciz Market  
**Módulo:** Venta Diaria  
**Fecha:** 2026-06-22  
**Enfoque:** incongruencias, basura funcional, conexiones ineficientes con otros módulos y oportunidades de mejora

---

## 1. Resumen Ejecutivo

El módulo **Venta Diaria** cumple su función principal, pero hoy concentra demasiadas responsabilidades:
- captura y edición manual de datos,
- creación de registros,
- re-sincronización automática,
- cálculo de totales en UI,
- conciliación con PDF,
- y persistencia directa en Supabase.

Eso lo vuelve útil, pero también frágil y difícil de mantener. La principal debilidad no es una falla aislada, sino la **superposición de fuentes de verdad** y la dependencia de reglas de clasificación basadas en texto.

### Veredicto
- **Estado general:** funcional, pero sobredimensionado
- **Riesgo principal:** resultados inconsistentes por múltiples capas de cálculo
- **Prioridad de intervención:** alta

---

## 2. Hallazgos Principales

### 2.1 Fuentes de verdad duplicadas

En el módulo conviven varias formas de calcular o reconstruir el mismo dato:
- `calculateTotals(record)` en la UI,
- `recalculateVentaDiaria()` en `src/utils/ventaDiariaSync.js`,
- `useVentaDiariaRecord()` que crea el registro y luego lo vuelve a sincronizar,
- persistencia manual campo por campo en `handleFieldChange()`.

**Impacto:**
- el mismo valor puede estar calculado en más de un lugar,
- aumentan los riesgos de desalineación entre interfaz y base de datos,
- es difícil saber qué capa manda realmente.

### 2.2 Acoplamiento fuerte con otros módulos

`recalculateVentaDiaria()` depende de:
- `reserva_movimientos`
- `otros_movimientos`
- `pagos_proveedor`

Esto es esperable en un sistema financiero, pero la implementación actual está acoplada a detalles de categorías y texto.

**Problema específico:**
- clasifica con `startsWith()` y con nombres de categoría,
- usa `catName.includes(...)` para correcciones,
- y fuerza `correccion_boletas` a `0` durante el sync.

**Impacto:**
- una categoría mal nombrada cambia el resultado,
- cualquier typo rompe la clasificación,
- el módulo depende demasiado de convenciones textuales de otros módulos.

### 2.3 Complejidad sobrante y estado posiblemente obsoleto

Hay estados e imports que sugieren evolución previa del módulo y posible acumulación de restos:
- `historyPrevShiftClosures`
- `prevShiftClosures`
- `searchResults`
- `searchLoading`
- `discrepanciasPdf`
- imports de `SummaryPanel`, `SearchFilterBar`, `PDFUploadModal`, `CajaSelector`

No todos son necesariamente basura, pero sí hay señales de que el componente fue creciendo por adición y no por refactor estructurado.

### 2.4 Re-sincronización excesiva

El flujo actual hace varios viajes innecesarios:
- crear registro,
- refrescar,
- recalcular,
- volver a consultar,
- volver a setear estado.

**Impacto:**
- más carga a Supabase,
- más complejidad de UI,
- más puntos donde una actualización puede quedar a medias.

### 2.5 Riesgo funcional en la lógica de edición

`handleFieldChange()` hace persistencia inmediata sobre cada cambio. Eso es práctico, pero en un dominio financiero puede generar:
- escrituras muy frecuentes,
- estados intermedios no deseados,
- y dependencia fuerte de que el usuario no dispare cambios parciales fuera de orden.

---

## 3. Conexiones Ineficientes con Otros Módulos

### 3.1 Dependencia de clasificación por nombre

El sync depende de nombres como:
- `traspaso`
- `rrhh`
- `servicio`
- `gasto`

Eso convierte la semántica de negocio en semántica de texto.

**Riesgo:** si otro módulo cambia la etiqueta, Venta Diaria interpreta mal el dato.

### 3.2 Dependencia de columnas y campos derivados

El cálculo usa muchos campos acumulados:
- `ingresos_efectivo`
- `retiros_efectivo`
- `traspaso_tesoreria_ingreso`
- `traspaso_tesoreria_egreso`
- `pago_facturas_caja`
- `pago_facturas_cc`

Eso está bien si el esquema está congelado, pero hoy el módulo depende demasiado de que esas columnas no cambien de forma ni de nombre.

### 3.3 Lógica de re-carga ligada al ciclo visual

`handleCreateNewRecord()` crea y luego refresca para “ver movimientos huérfanos”.
Eso es útil, pero también muestra que la creación no queda claramente separada del sync posterior.

---

## 4. Basura / Deuda Técnica Detectada

- Estados auxiliares con uso incierto o histórico.
- Imports de componentes posiblemente no esenciales para el flujo central.
- Comentarios de debugging y diagnóstico que ya no deberían estar en el camino normal.
- Recalculo y alerta diagnóstica muy acoplados a la UI.

---

## 5. Riesgos

1. **Inconsistencia entre UI y BD** si el sync queda a medias.
2. **Dependencia frágil** de nombres de categorías y textos.
3. **Sobrecarga operativa** por múltiples refrescos y resyncs.
4. **Complejidad innecesaria** al mezclar edición, validación, cálculo y diagnóstico en el mismo módulo.

---

## 6. Recomendaciones

### Prioridad alta
- Definir una sola fuente de verdad para los totales.
- Separar claramente:
  - creación de registro,
  - sync de movimientos,
  - refresco visual.
- Reemplazar la clasificación por texto por IDs o reglas normalizadas.

### Prioridad media
- Revisar estados/imports que ya no aporten valor al flujo central.
- Reducir viajes repetidos a Supabase.
- Aislar el modo diagnóstico en una ruta o panel específico.

### Prioridad baja
- Revisar si la reconciliación con PDF debe seguir en el mismo componente.
- Separar mejor la edición manual del cálculo automático.

---

## 7. Plan de Acción Sugerido

### Fase 1 — Estabilización
1. Identificar la fuente de verdad principal.
2. Documentar qué campos se calculan en UI y cuáles en backend.
3. Auditar estados/imports no utilizados.

### Fase 2 — Refactor funcional
1. Separar sync automático de edición manual.
2. Mover clasificación a reglas normalizadas.
3. Reducir rondas de refresh/re-fetch.

### Fase 3 — Limpieza
1. Retirar restos de debugging.
2. Eliminar lógica muerta o duplicada.
3. Simplificar el componente principal.

---

## 8. Conclusión

Venta Diaria no está roto, pero sí está **más complejo de lo necesario**. La mejora mayor no viene por agregar funcionalidades, sino por reducir duplicación, acoplamiento y recalculo redundante.

Si se ordena su arquitectura interna, puede convertirse en un módulo mucho más confiable y fácil de mantener.
