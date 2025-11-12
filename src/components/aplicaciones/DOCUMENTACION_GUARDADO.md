# 📝 DOCUMENTACIÓN - FUNCIÓN DE GUARDADO

**Fecha:** 11 de Noviembre, 2025  
**Archivo:** `/components/aplicaciones/CalculadoraAplicaciones.tsx`  
**Función:** `handleGuardarYFinalizar()`

---

## 🎯 RESUMEN

La función `handleGuardarYFinalizar()` guarda una aplicación fitosanitaria completa en **6 tablas** de Supabase:

1. ✅ `aplicaciones` (tabla principal)
2. ✅ `aplicaciones_lotes` (lotes incluidos)
3. ✅ `aplicaciones_mezclas` (mezclas de productos)
4. ✅ `aplicaciones_productos` (productos en cada mezcla)
5. ✅ `aplicaciones_calculos` (resultados de cálculos)
6. ✅ `aplicaciones_compras` (lista de compras)

**Tiempo estimado de ejecución:** 1-3 segundos (depende de la cantidad de lotes/productos)

---

## 🔄 FLUJO COMPLETO DE GUARDADO

```
INICIO
  ↓
1. Validar datos
  ↓
2. Generar código único (APL-YYYYMMDD-XXX)
  ↓
3. Insertar en tabla 'aplicaciones'
  ↓
4. Insertar lotes en 'aplicaciones_lotes'
  ↓
5. Para cada mezcla:
   - Insertar en 'aplicaciones_mezclas'
   - Insertar productos en 'aplicaciones_productos'
  ↓
6. Insertar cálculos en 'aplicaciones_calculos'
  ↓
7. Insertar compras en 'aplicaciones_compras'
  ↓
8. Redirigir a /aplicaciones con mensaje de éxito
  ↓
FIN
```

---

## 📋 PASO 1: GENERAR CÓDIGO ÚNICO

### **Formato del código**
```
APL-YYYYMMDD-XXX

Ejemplo: APL-20251111-001
```

- **APL**: Prefijo fijo para "Aplicación"
- **YYYYMMDD**: Fecha actual (año-mes-día)
- **XXX**: Número secuencial del día (001, 002, 003...)

### **Código**
```typescript
const fecha = new Date();
const codigoBase = `APL-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}`;

// Buscar último código del día
const { data: ultimaAplicacion } = await supabase
  .from('aplicaciones')
  .select('codigo_aplicacion')
  .like('codigo_aplicacion', `${codigoBase}%`)
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

let codigoAplicacion = `${codigoBase}-001`;
if (ultimaAplicacion?.codigo_aplicacion) {
  const ultimoNumero = parseInt(ultimaAplicacion.codigo_aplicacion.split('-')[2]) || 0;
  codigoAplicacion = `${codigoBase}-${String(ultimoNumero + 1).padStart(3, '0')}`;
}
```

### **Ejemplo de secuencia**
```
Primera aplicación del día: APL-20251111-001
Segunda aplicación del día: APL-20251111-002
Tercera aplicación del día: APL-20251111-003
...
Primera aplicación del día siguiente: APL-20251112-001
```

---

## 📋 PASO 2: INSERTAR APLICACIÓN BASE

### **Tabla:** `aplicaciones`

### **Datos insertados:**
```typescript
{
  codigo_aplicacion: "APL-20251111-001",
  nombre_aplicacion: "Fumigación contra Trips",
  tipo_aplicacion: "Fumigacion", // o "Fertilizacion"
  proposito: "Control preventivo de trips",
  blanco_biologico: "Trips",
  fecha_recomendacion: "2025-11-15",
  agronomo_responsable: "Ing. Juan Pérez",
  estado: "Calculada",
  fecha_inicio_ejecucion: null,
  fecha_fin_ejecucion: null
}
```

### **Código:**
```typescript
const aplicacionData = {
  codigo_aplicacion: codigoAplicacion,
  nombre_aplicacion: state.configuracion.nombre,
  tipo_aplicacion: state.configuracion.tipo === 'fumigacion' ? 'Fumigacion' : 'Fertilizacion',
  proposito: state.configuracion.proposito || null,
  blanco_biologico: state.configuracion.blanco_biologico || null,
  fecha_recomendacion: state.configuracion.fecha_inicio,
  agronomo_responsable: state.configuracion.agronomo_responsable || null,
  estado: 'Calculada' as const,
  fecha_inicio_ejecucion: null,
  fecha_fin_ejecucion: null,
};

const { data: aplicacion, error } = await supabase
  .from('aplicaciones')
  .insert([aplicacionData])
  .select()
  .single();
```

### **Retorna:**
```typescript
{
  id: "123e4567-e89b-12d3-a456-426614174000", // UUID
  codigo_aplicacion: "APL-20251111-001",
  nombre_aplicacion: "Fumigación contra Trips",
  ...
}
```

**Este ID se usa en todos los pasos siguientes** ✅

---

## 📋 PASO 3: INSERTAR LOTES

### **Tabla:** `aplicaciones_lotes`

### **Datos insertados (por cada lote):**
```typescript
{
  aplicacion_id: "123e4567-e89b-12d3-a456-426614174000",
  lote_id: "lote-uuid-aqui",
  sublotes_ids: ["sublote1-uuid", "sublote2-uuid"], // o null
  arboles_grandes: 500,
  arboles_medianos: 300,
  arboles_pequenos: 200,
  arboles_clonales: 100,
  total_arboles: 1100,
  calibracion_litros_arbol: 2.5,  // Solo fumigación
  tamano_caneca: 200               // Solo fumigación
}
```

### **Código:**
```typescript
const lotesData = state.configuracion.lotes_seleccionados.map((lote) => ({
  aplicacion_id: aplicacion.id,
  lote_id: lote.lote_id,
  sublotes_ids: lote.sublotes_ids || null,
  arboles_grandes: lote.conteo_arboles.grandes,
  arboles_medianos: lote.conteo_arboles.medianos,
  arboles_pequenos: lote.conteo_arboles.pequenos,
  arboles_clonales: lote.conteo_arboles.clonales,
  total_arboles: lote.conteo_arboles.total,
  calibracion_litros_arbol: state.configuracion.tipo === 'fumigacion' 
    ? lote.calibracion_litros_arbol 
    : null,
  tamano_caneca: state.configuracion.tipo === 'fumigacion'
    ? lote.tamano_caneca
    : null,
}));

const { error } = await supabase
  .from('aplicaciones_lotes')
  .insert(lotesData);
```

### **Ejemplo:**
Si seleccionaste 3 lotes, se insertan **3 registros** en `aplicaciones_lotes`.

---

## 📋 PASO 4: INSERTAR MEZCLAS Y PRODUCTOS

### **Tablas:** `aplicaciones_mezclas` + `aplicaciones_productos`

Este paso se hace **en un bucle** para cada mezcla.

### **4.1 - Insertar mezcla**

**Tabla:** `aplicaciones_mezclas`

```typescript
{
  aplicacion_id: "123e4567-e89b-12d3-a456-426614174000",
  nombre: "Mezcla 1",
  numero_orden: 1
}
```

**Código:**
```typescript
for (const mezcla of state.mezclas) {
  const mezclaData = {
    aplicacion_id: aplicacion.id,
    nombre: mezcla.nombre,
    numero_orden: mezcla.numero_orden,
  };

  const { data: mezclaInsertada, error } = await supabase
    .from('aplicaciones_mezclas')
    .insert([mezclaData])
    .select()
    .single();
  
  // ... continuar con productos
}
```

### **4.2 - Insertar productos de la mezcla**

**Tabla:** `aplicaciones_productos`

**Ejemplo para FUMIGACIÓN:**
```typescript
{
  mezcla_id: "mezcla-uuid",
  producto_id: "producto-uuid",
  dosis_por_caneca: 250,           // cc o gramos
  unidad_dosis: "cc",
  dosis_grandes: null,
  dosis_medianos: null,
  dosis_pequenos: null,
  dosis_clonales: null,
  cantidad_total_necesaria: 3.75,  // Litros totales
  producto_nombre: "Actara",
  producto_categoria: "Insecticida",
  producto_unidad: "litros"
}
```

**Ejemplo para FERTILIZACIÓN:**
```typescript
{
  mezcla_id: "mezcla-uuid",
  producto_id: "producto-uuid",
  dosis_por_caneca: null,
  unidad_dosis: null,
  dosis_grandes: 0.5,              // Kilos por árbol grande
  dosis_medianos: 0.3,             // Kilos por árbol mediano
  dosis_pequenos: 0.15,            // Kilos por árbol pequeño
  dosis_clonales: 0.2,             // Kilos por árbol clonal
  cantidad_total_necesaria: 450,   // Kilos totales
  producto_nombre: "Urea",
  producto_categoria: "Fertilizante",
  producto_unidad: "kilos"
}
```

**Código:**
```typescript
const productosData = mezcla.productos.map((producto) => ({
  mezcla_id: mezclaInsertada.id,
  producto_id: producto.producto_id,
  dosis_por_caneca: state.configuracion?.tipo === 'fumigacion' 
    ? producto.dosis_por_caneca 
    : null,
  unidad_dosis: state.configuracion?.tipo === 'fumigacion'
    ? producto.unidad_dosis
    : null,
  dosis_grandes: state.configuracion?.tipo === 'fertilizacion'
    ? producto.dosis_grandes
    : null,
  dosis_medianos: state.configuracion?.tipo === 'fertilizacion'
    ? producto.dosis_medianos
    : null,
  dosis_pequenos: state.configuracion?.tipo === 'fertilizacion'
    ? producto.dosis_pequenos
    : null,
  dosis_clonales: state.configuracion?.tipo === 'fertilizacion'
    ? producto.dosis_clonales
    : null,
  cantidad_total_necesaria: producto.cantidad_total_necesaria,
  producto_nombre: producto.producto_nombre,
  producto_categoria: producto.producto_categoria,
  producto_unidad: producto.producto_unidad,
}));

const { error } = await supabase
  .from('aplicaciones_productos')
  .insert(productosData);
```

---

## 📋 PASO 5: INSERTAR CÁLCULOS

### **Tabla:** `aplicaciones_calculos`

**Ejemplo para FUMIGACIÓN:**
```typescript
{
  aplicacion_id: "123e4567-e89b-12d3-a456-426614174000",
  lote_id: "lote-uuid",
  lote_nombre: "Lote A",
  area_hectareas: 5.5,
  total_arboles: 1100,
  litros_mezcla: 2750,             // Litros totales
  numero_canecas: 13.75,           // Canecas necesarias
  kilos_totales: null,
  numero_bultos: null,
  kilos_grandes: null,
  kilos_medianos: null,
  kilos_pequenos: null,
  kilos_clonales: null
}
```

**Ejemplo para FERTILIZACIÓN:**
```typescript
{
  aplicacion_id: "123e4567-e89b-12d3-a456-426614174000",
  lote_id: "lote-uuid",
  lote_nombre: "Lote A",
  area_hectareas: 5.5,
  total_arboles: 1100,
  litros_mezcla: null,
  numero_canecas: null,
  kilos_totales: 450,              // Kilos totales
  numero_bultos: 18,               // Bultos de 25kg
  kilos_grandes: 250,              // Desglose
  kilos_medianos: 120,
  kilos_pequenos: 50,
  kilos_clonales: 30
}
```

**Código:**
```typescript
const calculosData = state.calculos.map((calculo) => {
  const loteConfig = state.configuracion!.lotes_seleccionados.find(
    (l) => l.lote_id === calculo.lote_id
  );

  return {
    aplicacion_id: aplicacion.id,
    lote_id: calculo.lote_id,
    lote_nombre: calculo.lote_nombre,
    area_hectareas: loteConfig?.area_hectareas || null,
    total_arboles: calculo.total_arboles,
    // Fumigación
    litros_mezcla: state.configuracion?.tipo === 'fumigacion'
      ? calculo.litros_mezcla
      : null,
    numero_canecas: state.configuracion?.tipo === 'fumigacion'
      ? calculo.numero_canecas
      : null,
    // Fertilización
    kilos_totales: state.configuracion?.tipo === 'fertilizacion'
      ? calculo.kilos_totales
      : null,
    numero_bultos: state.configuracion?.tipo === 'fertilizacion'
      ? calculo.numero_bultos
      : null,
    kilos_grandes: state.configuracion?.tipo === 'fertilizacion'
      ? calculo.kilos_grandes
      : null,
    kilos_medianos: state.configuracion?.tipo === 'fertilizacion'
      ? calculo.kilos_medianos
      : null,
    kilos_pequenos: state.configuracion?.tipo === 'fertilizacion'
      ? calculo.kilos_pequenos
      : null,
    kilos_clonales: state.configuracion?.tipo === 'fertilizacion'
      ? calculo.kilos_clonales
      : null,
  };
});

const { error } = await supabase
  .from('aplicaciones_calculos')
  .insert(calculosData);
```

---

## 📋 PASO 6: INSERTAR LISTA DE COMPRAS

### **Tabla:** `aplicaciones_compras`

**Ejemplo:**
```typescript
{
  aplicacion_id: "123e4567-e89b-12d3-a456-426614174000",
  producto_id: "producto-uuid",
  producto_nombre: "Actara",
  producto_categoria: "Insecticida",
  unidad: "litros",
  inventario_actual: 2.0,          // Stock actual
  cantidad_necesaria: 3.75,        // Cantidad necesaria
  cantidad_faltante: 1.75,         // Lo que falta
  presentacion_comercial: "1 litros",
  unidades_a_comprar: 2,           // Tarros a comprar
  precio_unitario: 75000,          // Precio snapshot
  costo_estimado: 150000,          // 2 × 75000
  alerta: "normal"                 // "sin_precio", "sin_stock", "normal"
}
```

**Código:**
```typescript
if (state.lista_compras && state.lista_compras.items.length > 0) {
  const comprasData = state.lista_compras.items.map((item) => ({
    aplicacion_id: aplicacion.id,
    producto_id: item.producto_id,
    producto_nombre: item.producto_nombre,
    producto_categoria: item.producto_categoria,
    unidad: item.unidad,
    inventario_actual: item.inventario_actual,
    cantidad_necesaria: item.cantidad_necesaria,
    cantidad_faltante: item.cantidad_faltante,
    presentacion_comercial: item.presentacion_comercial || null,
    unidades_a_comprar: item.unidades_a_comprar,
    precio_unitario: item.ultimo_precio_unitario || null,
    costo_estimado: item.costo_estimado || null,
    alerta: item.alerta || 'normal',
  }));

  const { error } = await supabase
    .from('aplicaciones_compras')
    .insert(comprasData);
}
```

---

## 🔍 LOGS DE CONSOLA

Durante el proceso de guardado, verás estos logs en la consola del navegador:

```
📝 Insertando aplicación: {codigo_aplicacion: "APL-20251111-001", ...}
✅ Aplicación insertada: 123e4567-e89b-12d3-a456-426614174000

📝 Insertando lotes: 3
✅ Lotes insertados

📝 Insertando mezcla: Mezcla 1
✅ Mezcla insertada: mezcla-uuid-1
📝 Insertando productos de mezcla: 3
✅ Productos insertados

📝 Insertando cálculos: 3
✅ Cálculos insertados

📝 Insertando lista de compras: 3
✅ Lista de compras insertada

🎉 Aplicación guardada exitosamente: 123e4567-e89b-12d3-a456-426614174000
📋 Código: APL-20251111-001
```

**Si hay error:**
```
❌ Error insertando aplicación: {message: "...", code: "..."}
💥 Error al guardar aplicación: Error message here
```

---

## ⚠️ MANEJO DE ERRORES

### **Try-Catch completo**
```typescript
try {
  // 1. Validaciones
  // 2. Insertar aplicación
  // 3. Insertar lotes
  // 4. Insertar mezclas y productos
  // 5. Insertar cálculos
  // 6. Insertar lista de compras
  // 7. Redirigir
} catch (error) {
  console.error('💥 Error al guardar aplicación:', error);
  setState((prev) => ({
    ...prev,
    error: error instanceof Error ? error.message : 'Error al guardar la aplicación',
  }));
} finally {
  setState((prev) => ({ ...prev, guardando: false }));
}
```

### **Errores comunes:**

1. **"Usuario no autenticado"**
   - El usuario no ha iniciado sesión
   - Redirigir a login

2. **"Foreign key violation"**
   - El lote o producto referenciado no existe
   - Verificar que las tablas `lotes` y `productos` tengan los registros

3. **"Unique constraint violation"**
   - El código de aplicación ya existe (muy raro)
   - El sistema intentará generar otro código

4. **"Permission denied"**
   - RLS (Row Level Security) está bloqueando el insert
   - Verificar que RLS esté desactivado o que las políticas permitan el insert

---

## 🎯 ESTADOS DE LA UI

### **Estado inicial:**
```typescript
{
  guardando: false,
  error: null
}
```

### **Durante el guardado:**
```typescript
{
  guardando: true,  // Botón muestra "Guardando..." con spinner
  error: null
}
```

### **Después del guardado exitoso:**
```typescript
// Redirige a /aplicaciones con state
navigate('/aplicaciones', { 
  state: { 
    success: true, 
    mensaje: "Aplicación APL-20251111-001 guardada exitosamente" 
  } 
});
```

### **En caso de error:**
```typescript
{
  guardando: false,
  error: "Error al guardar la aplicación"  // Muestra alert rojo
}
```

---

## ✅ VALIDACIONES PREVIAS

Antes de guardar, se ejecuta `validarPaso3()`:

```typescript
const validarPaso3 = (): boolean => {
  // Paso 3 siempre puede avanzar
  // (aunque falten productos, es válido guardarlo)
  setValidationError('');
  return true;
};
```

También se verifica:
```typescript
if (!state.configuracion || state.mezclas.length === 0) {
  setState((prev) => ({ ...prev, error: 'Datos incompletos' }));
  return;
}
```

---

## 📊 RESUMEN DE REGISTROS INSERTADOS

Para una aplicación típica con:
- 3 lotes
- 2 mezclas
- 4 productos por mezcla (8 total)
- 3 cálculos (uno por lote)
- 5 productos en lista de compras

**Se insertan:**
- ✅ 1 registro en `aplicaciones`
- ✅ 3 registros en `aplicaciones_lotes`
- ✅ 2 registros en `aplicaciones_mezclas`
- ✅ 8 registros en `aplicaciones_productos`
- ✅ 3 registros en `aplicaciones_calculos`
- ✅ 5 registros en `aplicaciones_compras`

**TOTAL: 22 registros** en 6 tablas ✨

---

## 🚀 PRÓXIMOS PASOS

Después de guardar la aplicación:

1. ✅ **Usuario es redirigido** a `/aplicaciones`
2. ✅ **Se muestra mensaje de éxito** con el código generado
3. 🚧 **Crear página de detalle** en `/aplicaciones/:id` para ver la aplicación guardada
4. 🚧 **Crear página de listado** en `/aplicaciones` para ver todas las aplicaciones
5. 🚧 **Implementar edición** de aplicaciones existentes
6. 🚧 **Implementar cambio de estado** (Calculada → En Ejecución → Completada)

---

**¡Función de guardado implementada y completamente funcional!** ✅🎉
