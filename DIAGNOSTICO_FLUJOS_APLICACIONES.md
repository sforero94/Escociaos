# DIAGNÓSTICO: Flujos de Aplicaciones de Agroinsumos
## Sistema Escociaos - Análisis de Código

**Fecha**: 2025-11-13
**Objetivo**: Diagnosticar flujos de creación, ejecución y cierre de aplicaciones de fertilización y drench
**Método**: Revisión de código fuente y simulación de 3 flujos completos

---

## RESUMEN EJECUTIVO

### ✅ Aspectos que Funcionan Correctamente

1. **Creación de aplicaciones**: El wizard de 3 pasos funciona bien para fumigación y fertilización
2. **Separación de responsabilidades**: Código bien modularizado en componentes
3. **Validaciones de formularios**: Mayoría de validaciones están implementadas
4. **Movimientos diarios**: Conversión de bultos a Kg funciona correctamente para fertilización
5. **Actualización de inventario al cierre**: El inventario se descuenta correctamente al cerrar aplicaciones

### ❌ Problemas Críticos Encontrados

| # | Severidad | Problema | Impacto | Archivos Afectados |
|---|-----------|----------|---------|-------------------|
| 1 | **CRÍTICO** | No se guardan costos calculados en la tabla `aplicaciones` | Sin análisis de costos post-cierre | `CierreAplicacion.tsx:377-393` |
| 2 | **CRÍTICO** | Cálculo de bultos usa valor fijo de 25kg en lugar de `presentacion_kg_l` | Cálculos incorrectos para productos con otras presentaciones | `calculosAplicaciones.ts:102` |
| 3 | **CRÍTICO** | No existe lógica específica para tipo "Drench" | Drench se trata como fumigación | `calculosAplicaciones.ts` |
| 4 | **ALTO** | Confusión en compras: ¿bultos o kilos? | Usuario puede registrar cantidades incorrectas | `NewPurchase.tsx:539-554` |
| 5 | **ALTO** | Productos sin precio causan costo 0 en cierres | Costos incorrectos o incompletos | `CierreAplicacion.tsx:461` |

---

## ANÁLISIS DETALLADO POR FLUJO

### 📋 FLUJO 1: Fertilización con Producto Nuevo

**Pasos simulados:**
1. Crear producto nuevo (Urea 50kg, sin stock)
2. Crear aplicación de fertilización para 3 lotes
3. Registrar compra de 10 bultos
4. Iniciar ejecución
5. Registrar movimientos diarios
6. Cerrar aplicación

#### ✅ Lo que funciona:

- ✓ Creación de producto con formulario de 3 pasos (`ProductForm.tsx`)
- ✓ Cálculo de precio unitario automático: `precio_unitario = precio_por_presentacion / presentacion_kg_l`
- ✓ Generación de lista de compras con cantidades faltantes
- ✓ Conversión de bultos a Kg en movimientos diarios (línea 374-393 de `DailyMovementForm.tsx`)
- ✓ Actualización de inventario al cerrar aplicación

#### ❌ Problemas encontrados:

**P1.1 - Cálculo de bultos incorrecto** (CRÍTICO)
- **Ubicación**: `src/utils/calculosAplicaciones.ts:102`
- **Código actual**:
```typescript
const numero_bultos = Math.ceil(kilos_totales / 25);
```
- **Problema**: Asume que todos los bultos son de 25kg, ignorando el campo `presentacion_kg_l` del producto
- **Ejemplo de impacto**:
  - Urea en bultos de 50kg: Sistema calcula 20 bultos cuando necesita 10
  - Fertilizante en bolsas de 10kg: Sistema calcula 5 bultos cuando necesita 25
- **Escenario del flujo**: Si se necesitan 500kg de Urea (bultos de 50kg), el sistema calculará 20 bultos en lugar de 10

**P1.2 - Confusión en registro de compras** (ALTO)
- **Ubicación**: `src/components/inventory/NewPurchase.tsx:539-554`
- **Código actual**:
```typescript
<Label className="text-xs text-[#4D240F]/70 mb-1">
  Cantidad * {unit && `(${unit})`}
</Label>
<Input type="number" ... />
```
- **Problema**: El campo "Cantidad" muestra la unidad del producto (Kg), pero el usuario piensa en bultos
- **Ejemplo de impacto**:
  - Usuario quiere comprar 10 bultos de 50kg = 500kg
  - Ve "Cantidad (Kg)" e ingresa "10" pensando en bultos
  - Sistema registra 10kg en lugar de 500kg
- **Escenario del flujo**: El usuario debe manualmente calcular 10 × 50 = 500 e ingresar 500

**P1.3 - Productos sin precio** (ALTO)
- **Ubicación**: `src/components/aplicaciones/CierreAplicacion.tsx:461`
- **Problema**: Si un producto se crea sin `precio_unitario`, el cálculo de costos falla o resulta en 0
- **Código actual**:
```typescript
valor_movimiento: cantidad * (producto.precio_unitario || 0)
```
- **Escenario del flujo**:
  - Producto nuevo creado sin precio
  - Aplicación se puede crear y ejecutar sin error
  - Al cerrar: costo_insumos = 0 (incorrecto)

**P1.4 - No se guardan costos en aplicaciones** (CRÍTICO)
- **Ubicación**: `src/components/aplicaciones/CierreAplicacion.tsx:377-393`
- **Código actual**:
```typescript
const { error: errorUpdate } = await supabase
  .from('aplicaciones')
  .update({
    estado: 'Cerrada',
    fecha_inicio_ejecucion: datosFinales.fechaInicioReal,
    fecha_fin_ejecucion: datosFinales.fechaFinReal,
    jornales_utilizados: totalJornales,
    valor_jornal: datosFinales.valorJornal,
    observaciones_cierre: datosFinales.observaciones,
  })
  .eq('id', aplicacion.id);
```
- **Problema**: **NO se guardan** los campos:
  - `costo_total_insumos`
  - `costo_total_mano_obra`
  - `costo_total`
  - `costo_por_arbol`
  - `arboles_jornal`
- **Impacto**:
  - Costos calculados en UI pero no persistidos
  - Imposible generar reportes de costos históricos
  - Imposible comparar costos entre aplicaciones
- **Schema confirma campos existen**: Ver línea 16-22 de schema SQL

**P1.5 - Validación incompleta de lista de compras** (MEDIO)
- **Ubicación**: `src/components/aplicaciones/CalculadoraAplicaciones.tsx:428-432`
- **Código actual**:
```typescript
const validarPaso3 = (): boolean => {
  // Paso 3 siempre puede avanzar (aunque falten productos)
  setValidationError('');
  return true;
};
```
- **Problema**: Se puede finalizar aplicación aunque falten productos en inventario
- **Impacto**:
  - Usuario puede crear aplicación sin comprar productos necesarios
  - Al ejecutar, no habrá stock suficiente (pero el sistema no lo previene)

---

### 📋 FLUJO 2: Drench sin Compras Adicionales

**Pasos simulados:**
1. Verificar stock de productos
2. Crear aplicación drench para 4 lotes
3. Registrar movimientos diarios
4. Cerrar aplicación

#### ❌ Problemas encontrados:

**P2.1 - No existe implementación para tipo "Drench"** (CRÍTICO)
- **Ubicación**: `src/utils/calculosAplicaciones.ts`
- **Archivos revisados**:
  - Solo existen funciones `calcularFumigacion()` y `calcularFertilizacion()`
  - No existe `calcularDrench()`
- **Código actual en PasoMezcla**: Debe estar usando fumigación para drench
- **Problema**: Drench se trata igual que fumigación, pero podría requerir lógica diferente
- **Evidencia en DailyMovementForm.tsx**:
```typescript
// Línea 284-289
if (aplicacion.tipo === 'fumigacion' || aplicacion.tipo === 'drench') {
  if (!numeroCanecas || parseFloat(numeroCanecas) <= 0) {
    setError('El número de canecas debe ser mayor a 0');
    return false;
  }
}

// Línea 500-530
{(aplicacion.tipo === 'fumigacion' || aplicacion.tipo === 'drench') && (
  <div>
    <label>Número de Canecas Aplicadas</label>
    ...
  </div>
)}
```
- **Impacto**:
  - Drench funciona como fumigación (usa canecas y dosis_por_caneca)
  - Si drench requiere lógica diferente (ej. litros por árbol), no está implementado
- **Nota**: Según la BD, `tipo_aplicacion_producto` tiene valor "Drench", sugiriendo que es un tipo válido

**P2.2 - Mismo problema de costos que flujo 1** (CRÍTICO)
- Ver P1.4

**P2.3 - Falta validación de stock al iniciar ejecución** (MEDIO)
- No hay validación que verifique stock suficiente antes de cambiar estado a "En ejecución"
- Usuario puede iniciar aplicación y descubrir en mitad de ejecución que faltan productos

---

### 📋 FLUJO 3: Drench con Compra de Producto Sin Stock

**Pasos simulados:**
1. Crear aplicación drench para 2 lotes
2. Identificar producto existente sin stock
3. Registrar compra de 3 litros
4. Registrar movimientos
5. Cerrar aplicación

#### ❌ Problemas encontrados:

**P3.1 - Mismos problemas que Flujo 2** (CRÍTICO)
- Ver P2.1: No existe lógica para Drench

**P3.2 - Confusión en unidades para productos líquidos** (ALTO)
- **Ubicación**: `src/components/inventory/NewPurchase.tsx:539-554`
- **Problema**: Si el producto es líquido (drench típicamente usa líquidos):
  - Unidad es "Litros"
  - Usuario quiere comprar "3 litros"
  - Pero si la presentación es "Tarro de 1L", ¿ingresa 3 litros o 3 tarros?
- **Código actual no distingue** entre presentación comercial y unidad base
- **Ejemplo de impacto**:
  - Producto: Insecticida líquido, presentación "Tarro 1L", precio_por_presentacion = $50,000
  - Usuario quiere comprar 3 tarros
  - ¿Ingresa "3" (tarros) o "3" (litros)?
  - Sistema espera litros, pero usuario podría pensar en tarros

**P3.3 - Mismo problema de costos** (CRÍTICO)
- Ver P1.4

---

## PROBLEMAS CONSOLIDADOS

### 🔴 CRÍTICOS (Requieren corrección inmediata)

#### C1: Costos no se persisten en base de datos
- **Archivos**: `CierreAplicacion.tsx:377-393`
- **Impacto**: Pérdida de información financiera crítica
- **Datos afectados**:
  - `costo_total_insumos`
  - `costo_total_mano_obra`
  - `costo_total`
  - `costo_por_arbol`
- **Evidencia**: Los campos existen en el schema pero no se escriben en el UPDATE
- **Solución sugerida**:
```typescript
const { error: errorUpdate } = await supabase
  .from('aplicaciones')
  .update({
    estado: 'Cerrada',
    fecha_inicio_ejecucion: datosFinales.fechaInicioReal,
    fecha_fin_ejecucion: datosFinales.fechaFinReal,
    jornales_utilizados: totalJornales,
    valor_jornal: datosFinales.valorJornal,
    observaciones_cierre: datosFinales.observaciones,
    // AGREGAR:
    costo_total_insumos: costoInsumos,
    costo_total_mano_obra: costoManoObra,
    costo_total: costoTotal,
    costo_por_arbol: costoPorArbol,
  })
  .eq('id', aplicacion.id);
```

#### C2: Cálculo de bultos usa valor fijo
- **Archivos**: `calculosAplicaciones.ts:102`
- **Impacto**: Cálculos incorrectos de cantidades necesarias
- **Código actual**: `const numero_bultos = Math.ceil(kilos_totales / 25);`
- **Solución sugerida**:
```typescript
// Necesita acceso a la información del producto
// Opción 1: Pasar presentacion_kg_l como parámetro
// Opción 2: Calcular por producto individual
const numero_bultos = productos.reduce((total, producto) => {
  const presentacion = producto.presentacion_kg_l || 25; // fallback a 25kg
  return total + Math.ceil(producto.cantidad_necesaria / presentacion);
}, 0);
```

#### C3: No existe función calcularDrench
- **Archivos**: `calculosAplicaciones.ts`
- **Impacto**: Drench no tiene lógica específica, se trata como fumigación
- **Pregunta a resolver**: ¿Drench debe funcionar igual que fumigación (canecas + dosis)?
- **Opciones**:
  1. Si drench = fumigación: Documentar y mantener código actual
  2. Si drench es diferente: Implementar `calcularDrench()` con lógica específica
- **Solución sugerida** (si drench = fumigación):
```typescript
// Renombrar función para claridad
export function calcularFumigacionYDrench(
  lote: LoteSeleccionado,
  mezcla: Mezcla,
  tipoAplicacion: 'fumigacion' | 'drench'
): CalculosPorLote {
  // Mismo cálculo, pero explícitamente soporta ambos tipos
  ...
}
```

### 🟡 ALTOS (Pueden causar errores operacionales)

#### A1: Confusión en registro de compras (bultos vs unidades base)
- **Archivos**: `NewPurchase.tsx:539-554`
- **Impacto**: Usuario puede registrar cantidades incorrectas
- **Solución sugerida**:
```typescript
// Opción 1: Mostrar dos campos
<div className="md:col-span-2">
  <Label>Cantidad en Unidades Comerciales</Label>
  <Input
    type="number"
    placeholder="Ej: 10 bultos"
    onChange={(e) => {
      const unidades = parseFloat(e.target.value);
      const presentacion = getProduct(item.producto_id)?.presentacion_kg_l || 1;
      updateItem(item.id, 'cantidad', (unidades * presentacion).toString());
    }}
  />
  <p className="text-xs text-gray-600 mt-1">
    = {item.cantidad} {unit} (unidad base)
  </p>
</div>

// Opción 2: Agregar selector de unidad
<select onChange={(e) => setUnidadIngreso(e.target.value)}>
  <option value="base">Unidad base ({unit})</option>
  <option value="comercial">Unidad comercial ({presentacion})</option>
</select>
```

#### A2: Productos sin precio permiten crear aplicaciones
- **Archivos**: `ProductForm.tsx`, `CierreAplicacion.tsx:461`
- **Impacto**: Costos calculados como 0
- **Solución sugerida**:
```typescript
// En CierreAplicacion, paso de revisión
const productosSinPrecio = productos.filter(
  (p) => !p.precio_unitario || p.precio_unitario === 0
);
if (productosSinPrecio.length > 0) {
  setError(
    `${productosSinPrecio.length} producto(s) no tienen precio asignado. ` +
    `Por favor actualiza los precios en el módulo de Inventario antes de cerrar.`
  );
  // Esto YA ESTÁ IMPLEMENTADO (líneas 231-243)
}

// AGREGAR validación también en creación de aplicación
// En PasoListaCompras, mostrar advertencia si hay productos sin precio
```

### 🟢 MEDIOS (Mejoras de UX y validaciones)

#### M1: Paso 3 permite avanzar sin stock suficiente
- **Archivos**: `CalculadoraAplicaciones.tsx:428-432`
- **Solución sugerida**:
```typescript
const validarPaso3 = (): boolean => {
  // Agregar advertencia (no bloquear) si hay productos faltantes
  if (state.lista_compras && state.lista_compras.productos_sin_stock > 0) {
    // Mostrar diálogo de confirmación
    const confirmar = confirm(
      `Hay ${state.lista_compras.productos_sin_stock} producto(s) sin stock suficiente. ` +
      `¿Desea continuar de todos modos?`
    );
    return confirmar;
  }
  return true;
};
```

#### M2: Falta validación de stock al iniciar ejecución
- Agregar validación antes de cambiar estado a "En ejecución"
- Verificar que cantidad_actual >= cantidad_necesaria para cada producto

#### M3: Falta cálculo de eficiencias y métricas
- **Ubicación**: `CierreAplicacion.tsx`
- **Campos que se calculan en UI pero no se guardan**:
  - `arboles_jornal` (eficiencia)
  - Desviaciones porcentuales
  - Comparaciones planificado vs real
- **Solución**: Guardar estos valores calculados en tablas de cierre

---

## VERIFICACIÓN DE TABLAS DE SUPABASE

### ✅ Tablas que se usan correctamente:

1. **aplicaciones** - Se crea y actualiza ✓
2. **aplicaciones_lotes** - Se pobla correctamente ✓
3. **aplicaciones_mezclas** - Se crea ✓
4. **aplicaciones_productos** - Se pobla con dosis ✓
5. **aplicaciones_calculos** - Se guardan cálculos por lote ✓
6. **aplicaciones_compras** - Lista de compras se guarda ✓
7. **movimientos_diarios** - Se registran movimientos ✓
8. **movimientos_diarios_productos** - Productos por movimiento ✓
9. **movimientos_inventario** - Se crea al cerrar aplicación ✓
10. **productos** - Se actualiza inventario ✓
11. **compras** - Se registran compras ✓

### ❌ Tablas que NO se usan o se usan incorrectamente:

1. **aplicaciones_cierre** - ❌ NO SE USA
   - Existe en el schema (líneas 47-56 del SQL)
   - Campos: `aplicacion_id`, `fecha_cierre`, `dias_aplicacion`, `valor_jornal`, `observaciones_generales`, `cerrado_por`
   - **Problema**: Los datos de cierre se guardan directamente en `aplicaciones`, no en tabla separada
   - **Impacto**: Diseño inconsistente con schema

2. **aplicaciones_lotes_real** - ❌ NO SE USA
   - Existe en el schema (líneas 91-109 del SQL)
   - Campos: `cierre_id`, `lote_id`, `canecas_20l`, `canecas_200l`, `canecas_500l`, `canecas_1000l`, `litros_mezcla_real`, jornales por tipo, costos
   - **Problema**: No se guarda detalle de canecas por tamaño ni jornales por lote/actividad
   - **Impacto**: Falta nivel de detalle en análisis post-cierre

3. **aplicaciones_productos_real** - ❌ NO SE USA
   - Existe en el schema (líneas 147-159 del SQL)
   - Campos: `cierre_id`, `lote_id`, `producto_id`, `cantidad_real`, `unidad`, `costo`
   - **Problema**: No se guarda detalle de productos reales por lote al cerrar
   - **Impacto**: Solo se conoce total consolidado, no desagregado por lote

4. **aplicaciones_lotes_planificado** - ✅ Parece no usarse
   - Existe en el schema (líneas 73-83 del SQL)
   - Posiblemente obsoleta o de diseño futuro

5. **aplicaciones_productos_planificado** - ✅ Parece no usarse
   - Existe en el schema (líneas 128-138 del SQL)
   - Posiblemente obsoleta o de diseño futuro

---

## RECOMENDACIONES

### 📊 Prioridad 1 - Correcciones Críticas (Inmediatas)

1. **Guardar costos en aplicaciones al cerrar**
   - Archivo: `CierreAplicacion.tsx:377-393`
   - Agregar campos: `costo_total_insumos`, `costo_total_mano_obra`, `costo_total`, `costo_por_arbol`
   - **Estimación**: 15 minutos

2. **Usar tabla aplicaciones_cierre**
   - En lugar de guardar todo en `aplicaciones`, usar tabla diseñada para cierre
   - Refactorizar código de cierre para usar estructura correcta
   - **Estimación**: 2-3 horas

3. **Corregir cálculo de bultos**
   - Archivo: `calculosAplicaciones.ts:102`
   - Usar `presentacion_kg_l` del producto en lugar de valor fijo 25
   - **Estimación**: 1 hora (requiere refactor para pasar datos de producto)

4. **Implementar o documentar Drench**
   - Decisión de negocio: ¿Drench = Fumigación?
   - Si sí: Renombrar funciones para claridad
   - Si no: Implementar `calcularDrench()`
   - **Estimación**: 2 horas (si es diferente) o 30 minutos (si es igual)

### 📊 Prioridad 2 - Mejoras de UX (Corto plazo)

1. **Mejorar formulario de compras**
   - Mostrar claramente si se ingresan bultos o unidades base
   - Agregar conversión automática
   - Mostrar equivalencia: "10 bultos = 500 Kg"
   - **Estimación**: 2-3 horas

2. **Validar stock antes de iniciar ejecución**
   - Agregar modal de confirmación si faltan productos
   - Mostrar lista de productos faltantes
   - **Estimación**: 1-2 horas

3. **Agregar validación de precios en cierre**
   - YA IMPLEMENTADO parcialmente (líneas 231-243 de CierreAplicacion.tsx)
   - Verificar que funciona correctamente
   - **Estimación**: 30 minutos de testing

### 📊 Prioridad 3 - Uso de tablas adicionales (Mediano plazo)

1. **Implementar aplicaciones_lotes_real**
   - Guardar detalle de canecas por tamaño
   - Guardar jornales por lote y actividad (ya se captura en UI, falta guardar)
   - Permite análisis más granular
   - **Estimación**: 4-6 horas

2. **Implementar aplicaciones_productos_real**
   - Guardar cantidad real por producto y lote
   - Permite comparar planificado vs real a nivel detallado
   - **Estimación**: 3-4 horas

3. **Limpiar tablas obsoletas**
   - Determinar si `aplicaciones_lotes_planificado` y `aplicaciones_productos_planificado` se usan
   - Si no, eliminar del schema
   - Si sí, implementar o documentar
   - **Estimación**: 1 hora (investigación + decisión)

---

## IMPACTO EN FLUJOS SIMULADOS

### Flujo 1: Fertilización con producto nuevo

| Paso | Funciona | Problemas |
|------|----------|-----------|
| 1. Crear producto | ✅ | ⚠️ Puede crearse sin precio |
| 2. Crear aplicación | ✅ | ⚠️ Cálculo de bultos incorrecto |
| 3. Registrar compra | ⚠️ | ❌ Confusión bultos/kg |
| 4. Iniciar ejecución | ✅ | ⚠️ No valida stock |
| 5. Registrar movimientos | ✅ | - |
| 6. Cerrar aplicación | ⚠️ | ❌ No guarda costos |

**Resultado esperado**: ⚠️ **FUNCIONA PARCIALMENTE**
- Aplicación se crea y cierra
- Inventario se actualiza correctamente
- **PERO**: Costos no se guardan, cantidades pueden ser incorrectas

### Flujo 2: Drench sin compras

| Paso | Funciona | Problemas |
|------|----------|-----------|
| 1. Verificar stock | ✅ | - |
| 2. Crear aplicación | ✅ | ⚠️ Usa lógica de fumigación |
| 3. Registrar movimientos | ✅ | - |
| 4. Cerrar aplicación | ⚠️ | ❌ No guarda costos |

**Resultado esperado**: ✅ **FUNCIONA**
- Si drench = fumigación, funciona correctamente
- **PERO**: Costos no se guardan

### Flujo 3: Drench con compra

| Paso | Funciona | Problemas |
|------|----------|-----------|
| 1. Crear aplicación | ✅ | ⚠️ Usa lógica de fumigación |
| 2. Identificar faltantes | ✅ | - |
| 3. Registrar compra | ⚠️ | ❌ Confusión litros/tarros |
| 4. Registrar movimientos | ✅ | - |
| 5. Cerrar aplicación | ⚠️ | ❌ No guarda costos |

**Resultado esperado**: ⚠️ **FUNCIONA PARCIALMENTE**
- Similar a Flujo 1
- Confusión adicional en unidades para líquidos

---

## CONCLUSIONES

### Estado General: ⚠️ FUNCIONAL CON LIMITACIONES CRÍTICAS

El sistema permite completar los 3 flujos de principio a fin, pero presenta **limitaciones críticas** que afectan:

1. **Análisis financiero**: Sin costos guardados, no hay visibilidad histórica
2. **Precisión de cálculos**: Bultos fijos y confusión en compras pueden llevar a errores
3. **Integridad de datos**: Tablas de cierre diseñadas pero no usadas
4. **Soporte de Drench**: Funciona como fumigación pero sin claridad si es correcto

### Riesgo Operacional: MEDIO-ALTO

- ✅ **Bajo riesgo**: Inventario se actualiza correctamente
- ⚠️ **Riesgo medio**: Confusión en compras puede causar stock incorrecto
- ❌ **Riesgo alto**: Sin datos de costos, imposible tomar decisiones financieras

### Recomendación Final

**CORREGIR ANTES DE USAR EN PRODUCCIÓN:**
1. Implementar guardado de costos (C1)
2. Corregir cálculo de bultos (C2)
3. Clarificar y documentar Drench (C3)
4. Mejorar UX de compras (A1)

**TOTAL ESTIMADO PARA CORRECCIONES CRÍTICAS**: 6-8 horas de desarrollo + 2-3 horas de testing

---

## ANEXOS

### A. Referencias de Código

- **Creación de aplicaciones**: `src/components/aplicaciones/CalculadoraAplicaciones.tsx`
- **Movimientos diarios**: `src/components/aplicaciones/DailyMovementForm.tsx`
- **Cierre de aplicaciones**: `src/components/aplicaciones/CierreAplicacion.tsx`
- **Compras**: `src/components/inventory/NewPurchase.tsx`
- **Cálculos**: `src/utils/calculosAplicaciones.ts`
- **Tipos**: `src/types/aplicaciones.ts`
- **Formulario de productos**: `src/components/inventory/ProductForm.tsx`

### B. Schema de Base de Datos

Ver archivo de configuración de Supabase proporcionado en el prompt inicial.

### C. Próximos Pasos Sugeridos

1. Revisar este diagnóstico con el equipo
2. Priorizar correcciones según impacto en negocio
3. Crear tickets/issues en GitHub para cada problema
4. Asignar y ejecutar correcciones críticas
5. Re-ejecutar pruebas de flujos después de correcciones
6. Documentar decisión sobre Drench (¿es igual a fumigación?)
7. Planificar implementación de tablas de cierre adicionales

---

**Fin del Diagnóstico**
