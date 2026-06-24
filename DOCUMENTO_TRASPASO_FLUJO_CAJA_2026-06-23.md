# Documento de Traspaso: Módulo Flujo de Caja

**Fecha**: 2026-06-23
**Elaborado por**: Hermes Agent (Haiku 4.5)
**Proyecto**: Sistema de Tesorería — Iciz Market
**Sesión**: Revisión y corrección del módulo Flujo de Caja

---

## 1. Resumen Ejecutivo

El módulo Flujo de Caja (`FlujoCajaPage.jsx`) fue auditado y corregido. Se implementaron mejoras visuales y de validación. **Pendiente de resolución**: Bug crítico donde el saldo Banco Chile presenta valores negativos crecientes debido a que la lógica no distingue entre movimientos de Mercado Pago y Banco Chile.

---

## 2. Correcciones Implementadas (2026-06-23)

### 2.1 Alerta de Validación de Parámetros
- **Archivo**: `src/pages/FlujoCajaPage.jsx` (líneas 86-101)
- **Cambio**: Si la tabla `fjc_parametros` está vacía y falla la inserción de defaults, ahora muestra toast de error visible al usuario
- **Commit**: `8f0eedd`

```javascript
// Antes: catch silencioso
try {
    await supabase.from('fjc_parametros').insert(defaults);
} catch (e) {
    console.warn('No se pudieron insertar defaults:', e.message);
}

// Después: alerta visible
try {
    const { error: insertError } = await supabase.from('fjc_parametros').insert(defaults);
    if (insertError) {
        toast({
          title: "Advertencia: Parámetros no inicializados",
          description: "No se pudieron guardar los parámetros por defecto...",
          variant: "destructive"
        });
    }
} catch (e) {
    toast({
      title: "Error al inicializar parámetros",
      description: "Ocurrió un error al crear los parámetros por defecto.",
      variant: "destructive"
    });
}
```

### 2.2 Indicador Visual de Columnas Proyectadas
- **Archivo**: `src/pages/FlujoCajaPage.jsx`
- **Cambio**: Columnas de días futuros ahora tienen fondo azul claro para distinguirlos de datos reales
- **Commit**: `8f0eedd`

| Elemento | Color Original | Color Proyectado |
|----------|---------------|------------------|
| Header columnas | Sin color | `bg-blue-500/15` |
| Datos saldos | Sin color | `bg-blue-500/10` |
| Datos ingresos/egresos | Sin color | `bg-blue-500/10` |
| LIBRE DISPONIBILIDAD | Sin color | `bg-blue-500/20` |

---

## 3. Hallazgos Descartados (No eran problemas)

| # | Hallazgo Auditoría | Conclusión |
|---|-------------------|------------|
| C-2 | Variable antes de declaración | Falso positivo — `om.data` se usa correctamente después del Promise.all |
| Problema 2 | Duplicación venta_diaria + otros_movimientos | No es duplicación — son fuentes independientes |
| Problema 7 | Defaults en $0 | Falsa alarma — no ocurre en producción con datos reales |

---

## 4. Pendientes de Resolución

### 4.1 BUG CRÍTICO: Saldo BCH Negativo Creciente

**Severidad**: 🔴 CRÍTICO

**Descripción**: El saldo del Banco Chile presenta valores negativos crecientes. No tiene línea de crédito asociada, por lo que no debería ser negativo.

**Causa raíz identificada**: La lógica en líneas 286-311 y 332 no distingue entre movimientos de Mercado Pago y Banco Chile.

**Código problemático** (línea 286):
```javascript
// Captura TODOS los movimientos bancarios sin distinguir MP vs BCH
const bankMovs = historyData.otrosMovs.filter(m => 
  m.fecha === dStr && (m.caja_id === 'cuenta_corriente' || m.caja_id === null)
);

// Línea 332: Todos los egresos van a "pago_banco"
pago_banco: isProjected ? getParam('pagos_proveedor_banco') : (realData.pago_banco + bankAgg.egresos_prov),

// Línea 378: BCH absorbe TODOS los egresos bancarios
currentBCH += (flow.abonos_bch - flow.pago_banco - bankGastos - bankRrhh);
```

**Problema**: Cuando un proveedor se paga desde Mercado Pago, el egreso se descuenta de BCH en lugar de MP.

**Información necesaria para resolver**: ¿Cómo se distingue en `otros_movimientos` si un movimiento pertenece a Mercado Pago vs Banco Chile?
- ¿Por `categoria_id`?
- ¿Por `descripcion` (texto)?
- ¿Por otro campo?

### 4.2 Filtro `cuenta_corriente` (Línea 273)

**Severidad**: 🟡 BAJA — Monitoreo

**Descripción**: La comparación `m.caja_id === 'cuenta_corriente'` nunca matchea (caja_id es UUID o null), pero la condición `m.caja_id === null` sí funciona.

**Acción**: Monitorear con nuevos movimientos de bancos para confirmar que no causa errores.

### 4.3 `handleInitialChange` Legacy (Líneas 190-202)

**Severidad**: 🟢 BAJA — Cleanup

**Descripción**: Función no utilizada en el código actual. Contiene lógica incorrecta (actualiza ambos campos con el mismo valor).

**Acción**: Eliminar después de confirmar que no tiene referencias en otros módulos.

---

## 5. Datos de Referencia

### 5.1 Parámetros FJC (Saldos Iniciales Cierre 28/02/2026)

| Campo | Valor |
|-------|-------|
| initial_reserva | $272,500 |
| initial_cajas | $306,410 |
| initial_mp | $693,432 |
| initial_bch | $0 |

### 5.2 Tablas Involucradas en Flujo de Caja

| Tabla | Uso |
|-------|-----|
| `venta_diaria` | Ventas, efectivo, tarjetas, transferencias |
| `pagos_proveedor` | Pagos a proveedores con `origen_fondos` (caja/banco) |
| `reserva_movimientos` | Movimientos de reserva (ingreso/egreso) |
| `fjc_saldos_ajuste` | Ajustes (ej: comisiones MP) |
| `otros_movimientos` | Movimientos bancarios (MP, BCH, otros) |
| `saldos_diarios` | Snapshot de denominaciones por día |
| `fjc_parametros` | Parámetros de proyección (estimados) |

### 5.3 UUIDs de Categorías en `otros_movimientos`

Verificar en Supabase cómo se identifican las categorías de Mercado Pago vs Banco Chile.

---

## 6. Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `src/pages/FlujoCajaPage.jsx` | Alerta validación params + indicador visual proyectados |

**Último commit**: `8f0eedd` — "Fix: FlujoCajaPage - alerta validación params + indicador visual columnas proyectadas"

---

## 7. Próximos Pasos

1. **🔴 CRÍTICO**: Resolver bug BCH negativo — determinar cómo distinguir movimientos MP vs BCH en `otros_movimientos`
2. **🟡 MONITOREAR**: Comportamiento del filtro `cuenta_corriente` con nuevos datos
3. **🟢 LIMPIEZA**: Eliminar función `handleInitialChange` legacy después de confirmar

---

**Fin del documento de traspaso — Flujo de Caja**
*Generado: 2026-06-23*
