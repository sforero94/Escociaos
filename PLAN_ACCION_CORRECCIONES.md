# PLAN DE ACCIÓN - Correcciones Prioritarias
## Sistema Escociaos - Aplicaciones de Agroinsumos

**Fecha**: 2025-11-13
**Basado en**: DIAGNOSTICO_FLUJOS_APLICACIONES.md
**Actualizado**: Con precisiones sobre Drench y sistema de unidades

---

## 🎯 ACLARACIONES FUNDAMENTALES

### Sistema de Tipos de Aplicación

El sistema maneja **2 TIPOS DE LÓGICA**, NO 3:

1. **FUMIGACIÓN + DRENCH** → Misma lógica (canecas + dosis por caneca)
   - Fumigación: Aplicación foliar
   - Drench: Aplicación al suelo/raíz
   - **Método**: Ambos usan calibración (L/árbol) y canecas

2. **FERTILIZACIÓN** → Lógica diferente (dosis por tamaño de árbol)
   - Aplicación edáfica de fertilizantes sólidos
   - **Método**: Dosis en kg según tamaño del árbol (grande/mediano/pequeño/clonal)

### ⚠️ CRÍTICO: Sistema de Unidades en 3 Niveles

El sistema trabaja con **3 niveles de unidades** que DEBEN estar correctamente enlazados:

```
┌─────────────────────────────────────────────────────────────────┐
│ NIVEL 1: DOSIS (unidad más pequeña - para cálculos precisos)   │
├─────────────────────────────────────────────────────────────────┤
│ • Fumigación/Drench: cc o g por caneca de 200L                 │
│ • Fertilización: g o kg por árbol según tamaño                 │
│                                                                 │
│ Ejemplo: "50 cc de Insecticida por caneca"                     │
│         "100 g de Urea por árbol grande"                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓ CONVERSIÓN
┌─────────────────────────────────────────────────────────────────┐
│ NIVEL 2: APLICACIÓN (unidad base - para uso en campo)          │
├─────────────────────────────────────────────────────────────────┤
│ • Siempre en unidades base: L (litros) o Kg (kilos)            │
│ • Se calcula automáticamente: dosis × cantidad                 │
│                                                                 │
│ Ejemplo: 50 canecas × 50 cc = 2,500 cc = 2.5 L de Insecticida  │
│         1,000 árboles × 100 g = 100,000 g = 100 Kg de Urea     │
└─────────────────────────────────────────────────────────────────┘
                            ↓ CONVERSIÓN
┌─────────────────────────────────────────────────────────────────┐
│ NIVEL 3: COMPRA (unidad comercial - presentación de venta)     │
├─────────────────────────────────────────────────────────────────┤
│ • Tarros, Frascos, Bidones (líquidos)                          │
│ • Bultos, Bolsas, Sacos (sólidos)                              │
│ • Cada producto tiene su presentacion_kg_l                     │
│                                                                 │
│ Ejemplo: 2.5 L ÷ 1 L/tarro = 3 tarros de Insecticida           │
│         100 Kg ÷ 50 Kg/bulto = 2 bultos de Urea                │
└─────────────────────────────────────────────────────────────────┘
```

**EL PROBLEMA ACTUAL**:
- ✅ NIVEL 1 (dosis) funciona correctamente
- ✅ NIVEL 2 (aplicación) se calcula bien
- ❌ NIVEL 3 (compra) tiene inconsistencias:
  - Cálculo de bultos usa valor fijo de 25kg
  - Formulario de compras confunde bultos con unidades base
  - Usuario debe hacer conversiones mentales

**OBJETIVO DE LAS CORRECCIONES**:
Hacer que los 3 niveles funcionen transparentemente con conversiones automáticas y claras para el usuario.

---

## 🚨 CORRECCIONES CRÍTICAS - IMPLEMENTAR INMEDIATAMENTE

### 1. Guardar Costos al Cerrar Aplicación (15 min)

**Archivo**: `src/components/aplicaciones/CierreAplicacion.tsx`
**Línea**: 377-393

**Problema**: Los costos se calculan en UI pero NO se escriben en la base de datos.

**Código Actual**:
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

**Código Corregido**:
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
    // 👇 AGREGAR ESTOS CAMPOS CRÍTICOS
    costo_total_insumos: costoInsumos,
    costo_total_mano_obra: costoManoObra,
    costo_total: costoTotal,
    costo_por_arbol: costoPorArbol,
  })
  .eq('id', aplicacion.id);
```

**Verificación**: Las variables ya están calculadas en líneas 496-508 del mismo archivo.

---

### 2. Renombrar Función y Documentar Drench = Fumigación (30 min)

**Archivo**: `src/utils/calculosAplicaciones.ts`
**Línea**: 14-56

**Problema**: Solo existe `calcularFumigacion()`, NO hay `calcularDrench()`, causando confusión sobre si drench debería ser diferente.

**CLARIFICACIÓN**: Drench y Fumigación usan **LA MISMA LÓGICA**:
- Ambos usan calibración (L/árbol)
- Ambos usan canecas
- Ambos usan dosis por caneca en cc o g
- La única diferencia es semántica (foliar vs edáfico)

**Código Actual**:
```typescript
/**
 * CÁLCULOS PARA FUMIGACIÓN
 * Fórmulas según documento de diseño:
 * - Litros de mezcla = (# árboles × calibración L/árbol)
 * - # canecas = Litros de mezcla / Tamaño caneca
 * - Cantidad de cada producto = (# canecas × dosis por caneca) / 1000
 */
export function calcularFumigacion(
  lote: LoteSeleccionado,
  mezcla: Mezcla
): CalculosPorLote {
  // ... implementación actual ...
}
```

**Código Corregido** (renombrar y agregar alias):
```typescript
/**
 * CÁLCULOS PARA FUMIGACIÓN Y DRENCH
 *
 * Ambos tipos usan el MISMO método de cálculo:
 * - Fumigación: Aplicación foliar (spray sobre hojas)
 * - Drench: Aplicación edáfica (directo al suelo/raíz)
 *
 * Fórmulas:
 * 1. Litros de mezcla = (# árboles × calibración L/árbol)
 * 2. # canecas = Litros de mezcla / Tamaño caneca
 * 3. Cantidad producto = (# canecas × dosis por caneca) / 1000
 *    - dosis en cc → resultado en L
 *    - dosis en g → resultado en Kg
 *
 * @param lote - Lote con calibración y tamaño de caneca configurados
 * @param mezcla - Mezcla con productos y dosis por caneca
 * @returns Cálculos por lote (litros, canecas, cantidades de productos)
 */
export function calcularFumigacionODrench(
  lote: LoteSeleccionado,
  mezcla: Mezcla
): CalculosPorLote {
  const total_arboles = lote.conteo_arboles.total;
  const calibracion = lote.calibracion_litros_arbol || 0;
  const tamano_caneca = lote.tamano_caneca || 200;

  // Paso 1: Calcular litros de mezcla total
  const litros_mezcla = total_arboles * calibracion;

  // Paso 2: Calcular número de canecas
  const numero_canecas = litros_mezcla / tamano_caneca;

  // Paso 3: Calcular cantidad de cada producto
  const productos = mezcla.productos.map(producto => {
    const dosis_por_caneca = producto.dosis_por_caneca || 0;

    // IMPORTANTE: La dosis está en cc o gramos
    // Dividimos entre 1000 para convertir:
    // - cc → L (1000 cc = 1 L)
    // - g → Kg (1000 g = 1 Kg)
    const cantidad_necesaria = (numero_canecas * dosis_por_caneca) / 1000;

    return {
      producto_id: producto.producto_id,
      cantidad_necesaria: Math.ceil(cantidad_necesaria * 100) / 100
    };
  });

  return {
    lote_id: lote.lote_id,
    lote_nombre: lote.nombre,
    total_arboles,
    litros_mezcla: Math.ceil(litros_mezcla * 100) / 100,
    numero_canecas: Math.ceil(numero_canecas * 100) / 100,
    productos
  };
}

// 👇 MANTENER ALIAS PARA RETROCOMPATIBILIDAD
// Esto permite usar ambos nombres sin romper código existente
export const calcularFumigacion = calcularFumigacionODrench;
export const calcularDrench = calcularFumigacionODrench;
```

**Cambios en archivos que usan estas funciones**:

1. **PasoMezcla.tsx** - Agregar caso para drench:
```typescript
// Alrededor de la línea donde se decide qué función usar
if (configuracion.tipo === 'fumigacion' || configuracion.tipo === 'drench') {
  calculo = calcularFumigacionODrench(lote, mezcla);
} else if (configuracion.tipo === 'fertilizacion') {
  calculo = calcularFertilizacion(lote, mezcla, productosInfo);
}
```

---

### 3. Corregir Cálculo de Bultos con presentacion_kg_l Real (1-2 horas)

**Archivo**: `src/utils/calculosAplicaciones.ts`
**Línea**: 102

**Problema**: Usa valor fijo de 25kg, ignorando el campo `presentacion_kg_l` de cada producto.

**Impacto en Sistema de Unidades**:
```
NIVEL 2 (aplicación): 500 Kg de Urea necesarios ✓
                      ↓
NIVEL 3 (compra):     500 ÷ 25 = 20 bultos ❌ INCORRECTO
                      500 ÷ 50 = 10 bultos ✓ CORRECTO
```

**Código Actual**:
```typescript
export function calcularFertilizacion(
  lote: LoteSeleccionado,
  mezcla: Mezcla
): CalculosPorLote {
  // ... cálculos de kilos ...

  const kilos_totales = productos.reduce((sum, p) => sum + p.cantidad_necesaria, 0);

  // ❌ PROBLEMA: Valor fijo de 25kg
  const numero_bultos = Math.ceil(kilos_totales / 25);

  return { /* ... */ };
}
```

**Código Corregido** (pasar info de productos):
```typescript
export function calcularFertilizacion(
  lote: LoteSeleccionado,
  mezcla: Mezcla,
  productosInfo: Map<string, { presentacion_kg_l: number }> // 👈 NUEVO PARÁMETRO
): CalculosPorLote {
  // Calcular kilos por cada tipo de árbol para cada producto
  let kilos_grandes_total = 0;
  let kilos_medianos_total = 0;
  let kilos_pequenos_total = 0;
  let kilos_clonales_total = 0;

  const productos = mezcla.productos.map(producto => {
    const kilos_grandes = lote.conteo_arboles.grandes * (producto.dosis_grandes || 0);
    const kilos_medianos = lote.conteo_arboles.medianos * (producto.dosis_medianos || 0);
    const kilos_pequenos = lote.conteo_arboles.pequenos * (producto.dosis_pequenos || 0);
    const kilos_clonales = lote.conteo_arboles.clonales * (producto.dosis_clonales || 0);

    kilos_grandes_total += kilos_grandes;
    kilos_medianos_total += kilos_medianos;
    kilos_pequenos_total += kilos_pequenos;
    kilos_clonales_total += kilos_clonales;

    const cantidad_necesaria = kilos_grandes + kilos_medianos + kilos_pequenos + kilos_clonales;

    return {
      producto_id: producto.producto_id,
      cantidad_necesaria: Math.ceil(cantidad_necesaria * 100) / 100
    };
  });

  const kilos_totales = productos.reduce((sum, p) => sum + p.cantidad_necesaria, 0);

  // ✅ SOLUCIÓN: Calcular bultos por producto usando su presentación real
  const numero_bultos = productos.reduce((total, producto) => {
    const info = productosInfo.get(producto.producto_id);
    const presentacion = info?.presentacion_kg_l || 25; // Fallback a 25kg
    const bultosProducto = Math.ceil(producto.cantidad_necesaria / presentacion);

    console.log(`📦 Producto ${producto.producto_id}: ${producto.cantidad_necesaria} Kg ÷ ${presentacion} Kg/bulto = ${bultosProducto} bultos`);

    return total + bultosProducto;
  }, 0);

  return {
    lote_id: lote.lote_id,
    lote_nombre: lote.nombre,
    total_arboles: lote.conteo_arboles.total,
    kilos_totales: Math.ceil(kilos_totales * 100) / 100,
    numero_bultos, // 👈 Ahora usa presentación real de cada producto
    kilos_grandes: Math.ceil(kilos_grandes_total * 100) / 100,
    kilos_medianos: Math.ceil(kilos_medianos_total * 100) / 100,
    kilos_pequenos: Math.ceil(kilos_pequenos_total * 100) / 100,
    kilos_clonales: Math.ceil(kilos_clonales_total * 100) / 100,
    productos,
  };
}
```

**Cambios en PasoMezcla.tsx** (archivo que llama a calcularFertilizacion):

```typescript
// ANTES de calcular, cargar info de productos desde BD
const productosInfo = new Map<string, { presentacion_kg_l: number }>();

// Obtener IDs únicos de todos los productos en la mezcla
const productosIds = mezcla.productos.map(p => p.producto_id);

// Cargar presentaciones desde BD
const { data: productosData, error: errorProductos } = await supabase
  .from('productos')
  .select('id, presentacion_kg_l')
  .in('id', productosIds);

if (errorProductos) {
  console.error('Error cargando presentaciones:', errorProductos);
} else {
  productosData?.forEach(p => {
    productosInfo.set(p.id, {
      presentacion_kg_l: p.presentacion_kg_l || 25 // Fallback
    });
  });
}

// LLAMAR función con nuevo parámetro
const calculo = calcularFertilizacion(lote, mezcla, productosInfo);
```

---

### 4. Mejorar Formulario de Compras con Sistema de Unidades Explícito (3-4 horas) 🌟 CRÍTICO

**Archivo**: `src/components/inventory/NewPurchase.tsx`
**Línea**: 505-665

**Problema CRÍTICO**: El formulario actual causa confusión masiva en el **NIVEL 3** del sistema de unidades.

**Escenario de Error Actual**:
```
Usuario quiere comprar:
→ 10 bultos de Urea (50 Kg/bulto)

Ve en pantalla:
┌─────────────────────────────┐
│ Cantidad (Kg) *             │  ← Usuario confundido
│ [____10____]                │  ← Ingresa "10" pensando en bultos
└─────────────────────────────┘

Sistema guarda:
→ 10 Kg (ERROR - debería ser 500 Kg)

Inventario queda incorrecto ❌
```

**Solución Propuesta**: Agregar selector explícito de unidad + conversión automática

**Código Nuevo** (reemplazar sección de productos en el formulario):

```typescript
// 1. AGREGAR ESTADOS NUEVOS al inicio del componente
const [unidadesIngreso, setUnidadesIngreso] = useState<Map<string, 'base' | 'comercial'>>(new Map());
const [cantidadesComerciales, setCantidadesComerciales] = useState<Map<string, string>>(new Map());

// 2. FUNCIONES AUXILIARES para conversión
const obtenerUnidadComercial = (productoId: string): string => {
  const product = getProduct(productoId);
  if (!product) return 'unidades';

  const presentacion = product.presentacion_kg_l || 1;
  const unidad = product.unidad_medida;

  // Ejemplos: "Bulto de 50 Kg", "Tarro de 1 L", "Frasco de 500 cc"
  if (unidad === 'Kilos' || unidad === 'Kg') {
    if (presentacion >= 25) return `Bulto de ${presentacion} Kg`;
    if (presentacion >= 1) return `Bolsa de ${presentacion} Kg`;
    return `Paquete de ${presentacion * 1000} g`;
  } else if (unidad === 'Litros' || unidad === 'L') {
    if (presentacion >= 5) return `Bidón de ${presentacion} L`;
    if (presentacion >= 1) return `Tarro de ${presentacion} L`;
    return `Frasco de ${presentacion * 1000} cc`;
  }

  return `Unidad de ${presentacion} ${unidad}`;
};

const convertirAUnidadBase = (
  cantidad: number,
  productoId: string,
  tipoUnidad: 'base' | 'comercial'
): number => {
  if (tipoUnidad === 'base') return cantidad;

  const product = getProduct(productoId);
  const presentacion = product?.presentacion_kg_l || 1;

  return cantidad * presentacion;
};

const convertirAUnidadComercial = (
  cantidadBase: number,
  productoId: string
): number => {
  const product = getProduct(productoId);
  const presentacion = product?.presentacion_kg_l || 1;

  return cantidadBase / presentacion;
};

// 3. MODIFICAR RENDERIZADO DE CADA PRODUCTO
{purchaseItems.map((item, index) => {
  const product = getProduct(item.producto_id);
  const unit = getProductUnit(item.producto_id);
  const unidadComercial = obtenerUnidadComercial(item.producto_id);
  const tipoUnidad = unidadesIngreso.get(item.id) || 'comercial';
  const cantidadComercial = cantidadesComerciales.get(item.id) || '';
  const subtotal = calculateSubtotal(item);

  return (
    <div
      key={item.id}
      className="bg-[#F8FAF5] rounded-xl p-4 border border-[#73991C]/10"
    >
      {/* Primera fila: Producto + Selector de Tipo de Unidad */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start mb-3">
        {/* Producto */}
        <div className="md:col-span-5">
          <Label className="text-xs text-[#4D240F]/70 mb-1">
            Producto *
          </Label>
          <select
            value={item.producto_id}
            onChange={(e) => {
              updateItem(item.id, 'producto_id', e.target.value);
              // Resetear unidad a comercial cuando cambia producto
              setUnidadesIngreso(prev => new Map(prev).set(item.id, 'comercial'));
            }}
            className="w-full px-3 py-2 border border-[#73991C]/20 rounded-lg text-sm focus:outline-none focus:border-[#73991C] bg-white"
            required
          >
            <option value="">Seleccionar...</option>
            {filteredProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* 🌟 NUEVO: Selector de Tipo de Unidad */}
        <div className="md:col-span-4">
          <Label className="text-xs text-[#4D240F]/70 mb-1">
            Tipo de Unidad *
          </Label>
          <select
            value={tipoUnidad}
            onChange={(e) => {
              const nuevoTipo = e.target.value as 'base' | 'comercial';
              setUnidadesIngreso(prev => new Map(prev).set(item.id, nuevoTipo));

              // Convertir cantidad actual
              if (item.cantidad) {
                const cantidadActual = parseFloat(item.cantidad);
                if (nuevoTipo === 'comercial') {
                  const comercial = convertirAUnidadComercial(cantidadActual, item.producto_id);
                  setCantidadesComerciales(prev => new Map(prev).set(item.id, comercial.toFixed(2)));
                } else {
                  setCantidadesComerciales(prev => {
                    const map = new Map(prev);
                    map.delete(item.id);
                    return map;
                  });
                }
              }
            }}
            className="w-full px-3 py-2 border border-[#73991C]/20 rounded-lg text-sm focus:outline-none focus:border-[#73991C] bg-white"
            disabled={!item.producto_id}
          >
            <option value="comercial">🛒 Unidad Comercial ({unidadComercial})</option>
            <option value="base">📊 Unidad Base ({unit})</option>
          </select>
        </div>

        {/* Botón Eliminar */}
        <div className="md:col-span-3 flex items-end justify-end">
          {purchaseItems.length > 1 && (
            <Button
              type="button"
              onClick={() => removeItem(item.id)}
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Segunda fila: Cantidad + Conversión Visual */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start mb-3">
        {/* Cantidad */}
        <div className="md:col-span-4">
          <Label className="text-xs text-[#4D240F]/70 mb-1">
            {tipoUnidad === 'comercial'
              ? `Cantidad (${unidadComercial}) *`
              : `Cantidad (${unit}) *`
            }
          </Label>
          <Input
            type="number"
            step={tipoUnidad === 'comercial' ? '1' : '0.01'}
            min="0"
            placeholder={tipoUnidad === 'comercial' ? 'Ej: 10' : 'Ej: 500'}
            value={tipoUnidad === 'comercial' ? cantidadComercial : item.cantidad}
            onChange={(e) => {
              const valor = e.target.value;

              if (tipoUnidad === 'comercial') {
                setCantidadesComerciales(prev => new Map(prev).set(item.id, valor));
                const cantidadBase = convertirAUnidadBase(
                  parseFloat(valor) || 0,
                  item.producto_id,
                  'comercial'
                );
                updateItem(item.id, 'cantidad', cantidadBase.toString());
              } else {
                updateItem(item.id, 'cantidad', valor);
              }
            }}
            className="border-[#73991C]/20 focus:border-[#73991C] rounded-lg text-sm h-9"
            required
          />
        </div>

        {/* 🌟 NUEVO: Visualización de Conversión */}
        <div className="md:col-span-5 flex items-end">
          {item.cantidad && item.producto_id && (
            <div className="w-full px-3 py-2 bg-gradient-to-r from-[#73991C]/5 to-[#BFD97D]/10 border border-[#73991C]/20 rounded-lg">
              {tipoUnidad === 'comercial' ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#4D240F]/70">Equivale a:</span>
                  <span className="text-[#172E08] font-semibold">
                    {parseFloat(item.cantidad).toFixed(2)} {unit}
                  </span>
                  <span className="text-[#73991C]">✓</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#4D240F]/70">Equivale a:</span>
                  <span className="text-[#172E08] font-semibold">
                    {convertirAUnidadComercial(parseFloat(item.cantidad), item.producto_id).toFixed(2)} {unidadComercial}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Precio Unitario + Subtotal */}
        <div className="md:col-span-3">
          <Label className="text-xs text-[#4D240F]/70 mb-1">
            Subtotal
          </Label>
          <div className="px-3 py-2 bg-[#73991C]/5 rounded-lg text-sm font-medium text-[#172E08] h-9 flex items-center">
            {formatCurrency(subtotal)}
          </div>
        </div>
      </div>

      {/* Tercera fila: Precio Unitario, Lote, Vencimiento */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
        <div className="md:col-span-3">
          <Label className="text-xs text-[#4D240F]/70 mb-1">
            Precio Unit. ({tipoUnidad === 'comercial' ? 'por ' + unidadComercial : 'por ' + unit}) *
          </Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0"
            value={item.precio_unitario}
            onChange={(e) => updateItem(item.id, 'precio_unitario', e.target.value)}
            className="border-[#73991C]/20 focus:border-[#73991C] rounded-lg text-sm h-9"
            required
          />
        </div>

        <div className="md:col-span-3">
          <Label className="text-xs text-[#4D240F]/70 mb-1">Lote</Label>
          <Input
            type="text"
            placeholder="Ej: L-2025-001"
            value={item.lote_producto}
            onChange={(e) => updateItem(item.id, 'lote_producto', e.target.value)}
            className="border-[#73991C]/20 focus:border-[#73991C] rounded-lg text-sm h-9"
          />
        </div>

        <div className="md:col-span-3">
          <Label className="text-xs text-[#4D240F]/70 mb-1">Vencimiento</Label>
          <Input
            type="date"
            value={item.fecha_vencimiento}
            onChange={(e) => updateItem(item.id, 'fecha_vencimiento', e.target.value)}
            className="border-[#73991C]/20 focus:border-[#73991C] rounded-lg text-sm h-9"
          />
        </div>

        <div className="md:col-span-3">
          <Label className="text-xs text-[#4D240F]/70 mb-1">Permitido Gerencia *</Label>
          <div className="flex items-center gap-4 h-9">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`pg-${item.id}`}
                checked={item.permitido_gerencia === true}
                onChange={() => updateItem(item.id, 'permitido_gerencia', true)}
                className="w-4 h-4 text-[#73991C]"
              />
              <span className="text-sm">Sí</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`pg-${item.id}`}
                checked={item.permitido_gerencia === false}
                onChange={() => updateItem(item.id, 'permitido_gerencia', false)}
                className="w-4 h-4 text-[#73991C]"
              />
              <span className="text-sm">No</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
})}
```

**Ejemplo de Uso**:
```
Usuario selecciona:
┌─────────────────────────────────────┐
│ Producto: Urea 46%                  │
│ Tipo de Unidad: 🛒 Unidad Comercial │
│                  (Bulto de 50 Kg)   │
│ Cantidad: 10                        │
│ ───────────────────────────────     │
│ Equivale a: 500.00 Kg ✓             │
└─────────────────────────────────────┘

Sistema guarda correctamente: 500 Kg ✅
```

---

### 5. Usar Tabla aplicaciones_cierre (2-3 horas)

**Archivo**: `src/components/aplicaciones/CierreAplicacion.tsx`
**Línea**: 365-486

**Problema**: Existe tabla `aplicaciones_cierre` diseñada para datos de cierre, pero no se usa.

**Cambio Estructural**:

```typescript
// PASO 1: Crear registro en aplicaciones_cierre ANTES del UPDATE de aplicaciones

const cerrarAplicacion = async () => {
  try {
    setProcesando(true);
    console.log('🔒 Iniciando cierre de aplicación...');

    // Calcular total de jornales
    const totalJornales = datosFinales.jornalesPorLote.reduce(
      (sum, j) => sum + j.preparacion + j.aplicacion + j.transporte,
      0
    );

    // Calcular días de aplicación
    const fechaInicio = new Date(datosFinales.fechaInicioReal);
    const fechaFin = new Date(datosFinales.fechaFinReal);
    const diasAplicacion = Math.ceil((fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24));

    // Obtener usuario actual
    const { data: { user } } = await supabase.auth.getUser();

    // 👇 NUEVO: Insertar en aplicaciones_cierre
    const { data: cierreData, error: errorCierre } = await supabase
      .from('aplicaciones_cierre')
      .insert([
        {
          aplicacion_id: aplicacion.id,
          fecha_cierre: datosFinales.fechaFinReal,
          dias_aplicacion: diasAplicacion,
          valor_jornal: datosFinales.valorJornal,
          observaciones_generales: datosFinales.observaciones || null,
          cerrado_por: user?.email || null,
        },
      ])
      .select()
      .single();

    if (errorCierre) {
      console.error('❌ Error creando registro de cierre:', errorCierre);
      throw new Error('Error al crear registro de cierre: ' + errorCierre.message);
    }

    console.log('✅ Registro de cierre creado:', cierreData.id);

    // PASO 2: Actualizar aplicaciones (simplificado)
    const { error: errorUpdate } = await supabase
      .from('aplicaciones')
      .update({
        estado: 'Cerrada',
        fecha_cierre: datosFinales.fechaFinReal,
        costo_total_insumos: costoInsumos,
        costo_total_mano_obra: costoManoObra,
        costo_total: costoTotal,
        costo_por_arbol: costoPorArbol,
      })
      .eq('id', aplicacion.id);

    if (errorUpdate) {
      console.error('❌ Error actualizando aplicación:', errorUpdate);
      throw new Error('Error al actualizar la aplicación: ' + errorUpdate.message);
    }

    console.log('✅ Aplicación actualizada a estado Cerrada');

    // ... resto del código de consolidación de inventario ...
  } catch (err: any) {
    console.error('Error cerrando aplicación:', err);
    setError('Error al cerrar la aplicación: ' + err.message);
  } finally {
    setProcesando(false);
  }
};
```

---

### 6. Usar Tabla aplicaciones_lotes_real (4-6 horas)

**Archivo**: `src/components/aplicaciones/CierreAplicacion.tsx`
**Línea**: Después de crear `aplicaciones_cierre`

**Problema**: Jornales por lote se capturan en UI pero no se guardan estructuradamente.

**Código Nuevo**:

```typescript
// Después de crear cierreData, guardar detalle por lote
for (const lote of lotes) {
  const jornal = datosFinales.jornalesPorLote.find(j => j.lote_id === lote.lote_id);
  if (!jornal) {
    console.warn(`⚠️ No se encontraron jornales para lote ${lote.nombre}`);
    continue;
  }

  // Calcular costos por lote
  const jornalesTotalLote = jornal.preparacion + jornal.aplicacion + jornal.transporte;
  const costoManoObraLote = jornalesTotalLote * datosFinales.valorJornal;

  // Calcular costo de insumos por lote
  // Nota: 'movimientos' debe estar disponible en el scope
  const movimientosLote = movimientos.filter(m => {
    // Necesitas tener info de qué movimientos pertenecen a qué lote
    // Esto puede requerir join con movimientos_diarios
    return true; // TODO: Filtrar correctamente
  });

  const costoInsumosLote = movimientosLote.reduce(
    (sum, mov) => sum + (mov.cantidad_utilizada * mov.costo_unitario),
    0
  );

  const costoTotalLote = costoInsumosLote + costoManoObraLote;
  const costoPorArbolLote = lote.arboles > 0 ? costoTotalLote / lote.arboles : 0;

  // Insertar en aplicaciones_lotes_real
  const { error: errorLoteReal } = await supabase
    .from('aplicaciones_lotes_real')
    .insert([
      {
        cierre_id: cierreData.id,
        lote_id: lote.lote_id,
        // Canecas por tamaño (opcional - detallar si se requiere)
        canecas_20l: null,
        canecas_200l: null,
        canecas_500l: null,
        canecas_1000l: null,
        // Litros mezcla real (calcular de movimientos si aplica)
        litros_mezcla_real: null,
        // Jornales desglosados
        jornales_mezcla: jornal.preparacion,
        jornales_aplicacion: jornal.aplicacion,
        jornales_transporte: jornal.transporte,
        jornales_total: jornalesTotalLote,
        // Costos
        costo_insumos: costoInsumosLote,
        costo_mano_obra: costoManoObraLote,
        costo_total: costoTotalLote,
      },
    ]);

  if (errorLoteReal) {
    console.error(`❌ Error guardando lote real ${lote.nombre}:`, errorLoteReal);
    throw new Error(`Error guardando lote ${lote.nombre}: ` + errorLoteReal.message);
  }

  console.log(`✅ Lote ${lote.nombre} guardado en aplicaciones_lotes_real`);
}
```

---

## 📊 MEJORAS ADICIONALES - IMPLEMENTAR EN CORTO PLAZO

### 7. Validar Stock Antes de Iniciar Ejecución (1-2 horas)

**Archivo**: `src/components/aplicaciones/IniciarEjecucionModal.tsx` (o crear si no existe)

**Objetivo**: Prevenir que se inicie ejecución sin stock suficiente.

**Código**:

```typescript
const validarStockSuficiente = async (aplicacionId: string): Promise<boolean> => {
  // 1. Cargar productos necesarios
  const { data: productosNecesarios } = await supabase
    .from('aplicaciones_productos')
    .select(`
      producto_id,
      producto_nombre,
      cantidad_total_necesaria,
      mezcla_id,
      aplicaciones_mezclas!inner(aplicacion_id)
    `)
    .eq('aplicaciones_mezclas.aplicacion_id', aplicacionId);

  if (!productosNecesarios || productosNecesarios.length === 0) {
    return true; // Sin productos, ok continuar
  }

  // 2. Cargar stock actual
  const productosIds = [...new Set(productosNecesarios.map(p => p.producto_id))];
  const { data: productosStock } = await supabase
    .from('productos')
    .select('id, nombre, cantidad_actual, unidad_medida')
    .in('id', productosIds);

  const stockMap = new Map(productosStock?.map(p => [p.id, p.cantidad_actual]) || []);

  // 3. Consolidar cantidades necesarias por producto
  const necesidadesPorProducto = new Map<string, number>();
  productosNecesarios.forEach(p => {
    const actual = necesidadesPorProducto.get(p.producto_id) || 0;
    necesidadesPorProducto.set(p.producto_id, actual + p.cantidad_total_necesaria);
  });

  // 4. Verificar faltantes
  const productosFaltantes: Array<{ nombre: string; necesario: number; disponible: number }> = [];

  necesidadesPorProducto.forEach((necesario, productoId) => {
    const disponible = stockMap.get(productoId) || 0;
    if (disponible < necesario) {
      const producto = productosNecesarios.find(p => p.producto_id === productoId);
      productosFaltantes.push({
        nombre: producto?.producto_nombre || 'Desconocido',
        necesario,
        disponible,
      });
    }
  });

  // 5. Mostrar advertencia si hay faltantes
  if (productosFaltantes.length > 0) {
    const mensaje = `⚠️ Stock insuficiente para ${productosFaltantes.length} producto(s):\n\n` +
      productosFaltantes.map(p =>
        `• ${p.nombre}: Necesita ${p.necesario.toFixed(2)}, Disponible ${p.disponible.toFixed(2)}`
      ).join('\n') +
      `\n\n¿Desea continuar de todos modos?`;

    return window.confirm(mensaje);
  }

  return true;
};

// Usar en handleIniciarEjecucion
const handleIniciarEjecucion = async () => {
  const puedeIniciar = await validarStockSuficiente(aplicacion.id);
  if (!puedeIniciar) return;

  // Continuar con inicio...
  const { error } = await supabase
    .from('aplicaciones')
    .update({
      estado: 'En ejecución',
      fecha_inicio_ejecucion: new Date().toISOString().split('T')[0],
    })
    .eq('id', aplicacion.id);

  if (error) {
    showError('Error al iniciar ejecución: ' + error.message);
  } else {
    showSuccess('Aplicación iniciada correctamente');
    onSuccess();
  }
};
```

---

### 8. Implementar aplicaciones_productos_real (3-4 horas)

**Archivo**: `src/components/aplicaciones/CierreAplicacion.tsx`

**Objetivo**: Guardar detalle de productos reales usados por lote.

**Código** (agregar después de `aplicaciones_lotes_real`):

```typescript
// Para cada lote, guardar productos usados
for (const lote of lotes) {
  // Cargar movimientos de este lote
  const { data: movimientosLote } = await supabase
    .from('movimientos_diarios')
    .select(`
      id,
      lote_id,
      movimientos_diarios_productos (
        producto_id,
        producto_nombre,
        cantidad_utilizada,
        unidad
      )
    `)
    .eq('lote_id', lote.lote_id)
    .eq('aplicacion_id', aplicacion.id);

  if (!movimientosLote || movimientosLote.length === 0) continue;

  // Consolidar por producto
  const productosPorLote = new Map<string, { nombre: string; cantidad: number; unidad: string; costo: number }>();

  movimientosLote.forEach(mov => {
    mov.movimientos_diarios_productos?.forEach(prod => {
      if (!productosPorLote.has(prod.producto_id)) {
        productosPorLote.set(prod.producto_id, {
          nombre: prod.producto_nombre,
          cantidad: 0,
          unidad: prod.unidad,
          costo: 0,
        });
      }

      const item = productosPorLote.get(prod.producto_id)!;
      item.cantidad += prod.cantidad_utilizada;
      // Obtener costo del producto
      const producto = await supabase
        .from('productos')
        .select('precio_unitario')
        .eq('id', prod.producto_id)
        .single();
      item.costo += prod.cantidad_utilizada * (producto.data?.precio_unitario || 0);
    });
  });

  // Insertar cada producto
  for (const [productoId, datos] of productosPorLote.entries()) {
    await supabase
      .from('aplicaciones_productos_real')
      .insert([
        {
          cierre_id: cierreData.id,
          lote_id: lote.lote_id,
          producto_id: productoId,
          cantidad_real: datos.cantidad,
          unidad: datos.unidad,
          costo: datos.costo,
        },
      ]);
  }
}
```

---

## 📝 CHECKLIST DE IMPLEMENTACIÓN

### ✅ Prioridad 1 - Crítico (1-2 días)

- [ ] **1. Guardar costos al cerrar** (15 min)
  - Agregar 4 campos al UPDATE en CierreAplicacion.tsx:377-393
  - Verificar que variables existen en scope

- [ ] **2. Renombrar función Drench** (30 min)
  - Renombrar `calcularFumigacion` → `calcularFumigacionODrench`
  - Agregar alias `calcularDrench` = `calcularFumigacionODrench`
  - Agregar documentación clara sobre ambos tipos
  - Actualizar PasoMezcla.tsx para usar drench

- [ ] **3. Corregir cálculo de bultos** (1-2 horas)
  - Modificar `calcularFertilizacion` para recibir `productosInfo`
  - Actualizar PasoMezcla.tsx para cargar presentaciones antes de calcular
  - Reemplazar `/25` fijo por presentación real de cada producto

- [ ] **4. Mejorar formulario de compras** (3-4 horas) 🌟 **MUY CRÍTICO**
  - Agregar selector de tipo de unidad (comercial vs base)
  - Agregar estados para manejar cantidades comerciales
  - Agregar conversión visual y automática
  - Agregar funciones auxiliares de conversión
  - Testing exhaustivo de conversiones

**Total P1**: 5-7 horas

### ✅ Prioridad 2 - Alto (2-3 días)

- [ ] **5. Usar tabla aplicaciones_cierre** (2-3 horas)
  - Crear registro en aplicaciones_cierre antes de UPDATE
  - Simplificar UPDATE de aplicaciones
  - Migrar campos redundantes a tabla correcta

- [ ] **6. Usar tabla aplicaciones_lotes_real** (4-6 horas)
  - Guardar jornales desglosados por lote
  - Calcular costos por lote
  - Manejar correctamente filtrado de movimientos

- [ ] **7. Validar stock antes de iniciar** (1-2 horas)
  - Crear función `validarStockSuficiente`
  - Integrar en flujo de inicio de ejecución
  - Agregar mensajes claros de advertencia

**Total P2**: 7-11 horas

### ✅ Prioridad 3 - Medio (1 semana)

- [ ] **8. Implementar aplicaciones_productos_real** (3-4 horas)
  - Guardar detalle de productos por lote
  - Consolidar movimientos por producto
  - Calcular costos individuales

- [ ] **9. Agregar métricas de eficiencia** (2 horas)
  - Calcular árboles por jornal
  - Guardar en tabla aplicaciones
  - Mostrar en UI de cierre

**Total P3**: 5-6 horas

---

## 🧪 TESTING COMPLETO DESPUÉS DE CORRECCIONES

### Test 1: Flujo Fertilización con Sistema de Unidades Completo

**Objetivo**: Verificar conversión automática en los 3 niveles

```
1. Crear producto: Urea 46%
   - Presentación: 50 Kg
   - Precio por bulto: $150,000
   - Precio unitario: $3,000/Kg (auto-calculado)

2. Crear aplicación fertilización
   - 3 lotes: 500 árboles grandes c/u
   - Dosis: 100 g/árbol grande

3. Verificar cálculos:
   NIVEL 1 (dosis): 100 g/árbol × 1,500 árboles = 150,000 g
   NIVEL 2 (aplicación): 150 Kg necesarios ✓
   NIVEL 3 (compra): 150 ÷ 50 = 3 bultos ✓ (antes: 150 ÷ 25 = 6 ❌)

4. Comprar con nuevo formulario:
   - Selector: "🛒 Unidad Comercial (Bulto de 50 Kg)"
   - Cantidad: 3
   - Ver conversión: "Equivale a: 150.00 Kg ✓"
   - Verificar que se guarden 150 Kg

5. Iniciar ejecución:
   - Verificar validación de stock
   - Confirmar inicio

6. Registrar movimientos:
   - 1 bulto = 50 Kg (conversión automática)
   - 3 movimientos × 50 Kg = 150 Kg ✓

7. Cerrar aplicación:
   - Verificar costos guardados en tabla aplicaciones ✓
   - Verificar cierre en tabla aplicaciones_cierre ✓
   - Verificar jornales en aplicaciones_lotes_real ✓
   - Verificar inventario: 150 Kg descontados ✓
```

### Test 2: Flujo Drench Completo

**Objetivo**: Verificar que drench usa misma lógica que fumigación

```
1. Crear aplicación drench
   - 4 lotes con calibración
   - Productos con dosis en cc por caneca

2. Verificar función usada:
   - Console log debe mostrar: "calcularFumigacionODrench" o "calcularDrench"
   - Cálculos: litros, canecas, cantidades

3. Registrar movimientos:
   - Campo: "Número de canecas" (no bultos) ✓
   - Productos en cc/L

4. Cerrar:
   - Verificar costos guardados ✓
```

### Test 3: Compra de Producto Líquido con Nuevo Formulario

**Objetivo**: Verificar sistema de unidades para líquidos

```
1. Crear producto: Insecticida X
   - Presentación: 1 L
   - Precio por tarro: $50,000
   - Precio unitario: $50,000/L (auto-calculado)

2. Comprar con nuevo formulario:
   - Selector: "🛒 Unidad Comercial (Tarro de 1 L)"
   - Cantidad: 3
   - Ver conversión: "Equivale a: 3.00 L ✓"
   - Precio: $50,000 (por tarro)
   - Subtotal: $150,000 ✓

3. Verificar en BD:
   - compras.cantidad = 3
   - compras.unidad = "Litros"
   - productos.cantidad_actual += 3 ✓
```

---

## 📞 NOTAS FINALES PARA DESARROLLO

### Prioridad de Implementación Sugerida:

**DÍA 1**: Correcciones críticas de datos
1. Guardar costos (15 min)
2. Renombrar Drench (30 min)
3. Corregir bultos (1-2 hrs)

**DÍA 2-3**: Sistema de unidades
4. Formulario compras completo (3-4 hrs) + testing (2 hrs)

**DÍA 4-5**: Estructura de BD
5. Tabla aplicaciones_cierre (2-3 hrs)
6. Tabla aplicaciones_lotes_real (4-6 hrs)

**DÍA 6**: Validaciones
7. Validar stock (1-2 hrs)
8. Testing integral (4 hrs)

### Puntos de Verificación:

✅ **Después de cada corrección**:
- Ejecutar test específico
- Verificar BD directamente (no solo UI)
- Comparar antes/después en consola

✅ **Antes de pasar a producción**:
- Ejecutar los 3 tests completos
- Verificar todas las tablas se llenan
- Revisar logs de conversiones
- Probar con datos reales

---

**Documento listo para implementación**
**Última actualización**: 2025-11-13
**Contacto para dudas**: Revisar con equipo de desarrollo

---

**FIN DEL PLAN DE ACCIÓN**
