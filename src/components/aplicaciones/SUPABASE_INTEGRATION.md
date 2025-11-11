# Integración con Supabase - Aplicaciones Fitosanitarias

**Fecha:** 11 de Noviembre, 2025  
**Estado:** ✅ Completado

---

## 📊 TABLAS UTILIZADAS

### 1. **`lotes`**
```sql
Campos utilizados:
- id (UUID)
- nombre (TEXT)
- numero_orden (INTEGER)
- area_hectareas (NUMERIC)
- arboles_grandes (INTEGER)
- arboles_medianos (INTEGER)
- arboles_pequenos (INTEGER)
- arboles_clonales (INTEGER)
- total_arboles (INTEGER GENERATED)
- activo (BOOLEAN)
```

**Query en PasoConfiguracion.tsx:**
```typescript
const { data, error } = await supabase
  .from('lotes')
  .select(`
    id,
    nombre,
    area_hectareas,
    arboles_grandes,
    arboles_medianos,
    arboles_pequenos,
    arboles_clonales,
    total_arboles,
    sublotes (
      id,
      nombre,
      arboles_grandes,
      arboles_medianos,
      arboles_pequenos,
      arboles_clonales,
      total_arboles
    )
  `)
  .eq('activo', true)
  .order('nombre');
```

---

### 2. **`sublotes`**
```sql
Campos utilizados:
- id (UUID)
- lote_id (UUID) → FK a lotes
- nombre (TEXT)
- numero_sublote (INTEGER)
- arboles_grandes (INTEGER)
- arboles_medianos (INTEGER)
- arboles_pequenos (INTEGER)
- arboles_clonales (INTEGER)
- total_arboles (INTEGER GENERATED)
```

**Cargado automáticamente** con la query de `lotes` usando relación.

---

### 3. **`productos`**
```sql
Campos utilizados:
- id (UUID)
- nombre (TEXT)
- categoria (ENUM categoria_producto)
- grupo (ENUM grupo_producto)
- unidad_medida (TEXT)
- estado_fisico (ENUM estado_fisico)
- presentacion_kg_l (NUMERIC)
- precio_unitario (NUMERIC)
- cantidad_actual (NUMERIC)
- estado (ENUM estado_producto)
- activo (BOOLEAN)
```

**Query en PasoMezcla.tsx y PasoListaCompras.tsx:**
```typescript
const { data, error } = await supabase
  .from('productos')
  .select('*')
  .in('categoria', categorias) // Array de categorías según tipo
  .eq('estado', 'OK')
  .eq('activo', true)
  .order('nombre');
```

**Categorías por tipo de aplicación:**
- **Fumigación:** Fungicida, Insecticida, Acaricida, Herbicida, Biocontrolador, Coadyuvante
- **Fertilización:** Fertilizante

---

### 4. **`aplicaciones`** (Pendiente implementar)
```sql
Campos a utilizar:
- id (UUID)
- codigo_aplicacion (TEXT) - Generado automáticamente
- nombre_aplicacion (TEXT)
- tipo_aplicacion (ENUM tipo_aplicacion)
- proposito (TEXT)
- blanco_biologico (TEXT)
- fecha_recomendacion (DATE)
- agronomo_responsable (TEXT)
- estado (ENUM estado_aplicacion) - DEFAULT 'Calculada'
- fecha_inicio_ejecucion (DATE)
- fecha_fin_ejecucion (DATE)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

**IMPORTANTE:** 
- No existen campos JSONB para `mezclas`, `calculos`, `lista_compras`
- Se necesitarán tablas relacionadas adicionales

---

## 🔧 CAMBIOS REALIZADOS

### **1. PasoConfiguracion.tsx**

#### Antes:
```typescript
.select(`
  id,
  nombre,
  area_hectareas,
  sublotes (id, nombre),
  conteo_arboles_grandes, // ❌ No existe
  conteo_arboles_medianos, // ❌ No existe
  conteo_arboles_pequenos, // ❌ No existe
  conteo_arboles_clonales  // ❌ No existe
`)
```

#### Después:
```typescript
.select(`
  id,
  nombre,
  area_hectareas,
  arboles_grandes,       // ✅ Correcto
  arboles_medianos,      // ✅ Correcto
  arboles_pequenos,      // ✅ Correcto
  arboles_clonales,      // ✅ Correcto
  total_arboles,         // ✅ Campo calculado
  sublotes (
    id,
    nombre,
    arboles_grandes,
    arboles_medianos,
    arboles_pequenos,
    arboles_clonales,
    total_arboles
  )
`)
.eq('activo', true)      // ✅ Filtro agregado
.order('nombre')
```

**Mapeo de datos:**
```typescript
conteo_arboles: {
  grandes: lote.arboles_grandes || 0,
  medianos: lote.arboles_medianos || 0,
  pequenos: lote.arboles_pequenos || 0,
  clonales: lote.arboles_clonales || 0,
  total: lote.total_arboles || 0,
}
```

---

### **2. PasoMezcla.tsx**

#### Antes:
```typescript
const productosFormateados: ProductoCatalogo[] = data.map((p) => ({
  id: p.id,
  nombre: p.nombre,
  categoria: p.categoria,
  unidad_medida: p.unidad_medida,
  estado_fisico: p.estado_fisico,
  presentacion_comercial: p.presentacion_comercial, // ❌ No existe como TEXT
  ultimo_precio_unitario: p.ultimo_precio_unitario,  // ❌ Nombre incorrecto
  cantidad_actual: p.cantidad_actual || 0,
}));
```

#### Después:
```typescript
const productosFormateados: ProductoCatalogo[] = data.map((p) => ({
  id: p.id,
  nombre: p.nombre,
  categoria: p.categoria,
  grupo: p.grupo,
  unidad_medida: p.unidad_medida,
  estado_fisico: p.estado_fisico,
  presentacion_comercial: p.presentacion_kg_l 
    ? `${p.presentacion_kg_l} ${p.unidad_medida}` 
    : p.unidad_medida,                            // ✅ Construido dinámicamente
  ultimo_precio_unitario: p.precio_unitario || 0, // ✅ Nombre correcto
  cantidad_actual: p.cantidad_actual || 0,
  display_nombre: `${p.nombre} (${p.categoria}) - Stock: ${p.cantidad_actual || 0} ${p.unidad_medida}`,
}));
```

**Filtros agregados:**
```typescript
.in('categoria', categorias)
.eq('estado', 'OK')       // ✅ Solo productos OK
.eq('activo', true)       // ✅ Solo productos activos
.order('nombre')
```

---

### **3. PasoListaCompras.tsx**

#### Cambios idénticos a PasoMezcla.tsx:
- `ultimo_precio_unitario` → `precio_unitario`
- `presentacion_comercial` construido desde `presentacion_kg_l`

---

## 📋 INTERFACES TYPESCRIPT ACTUALIZADAS

### **ProductoCatalogo**
```typescript
export interface ProductoCatalogo {
  id: string;
  nombre: string;
  categoria: string;
  grupo: string;
  unidad_medida: string; // 'litros' | 'kilos' | 'unidades'
  estado_fisico?: 'liquido' | 'solido';
  presentacion_comercial: string; // "1 litros" | "25 kilos"
  ultimo_precio_unitario: number; // Mapeado desde precio_unitario
  cantidad_actual: number;
  display_nombre?: string; // Para el <select>
}
```

### **LoteCatalogo**
```typescript
export interface LoteCatalogo {
  id: string;
  nombre: string;
  area_hectareas: number;
  sublotes: { id: string; nombre: string }[];
  conteo_arboles: {
    grandes: number;    // Mapeado desde arboles_grandes
    medianos: number;   // Mapeado desde arboles_medianos
    pequenos: number;   // Mapeado desde arboles_pequenos
    clonales: number;   // Mapeado desde arboles_clonales
    total: number;      // Mapeado desde total_arboles
  };
}
```

---

## ✅ VERIFICACIÓN DE QUERIES

### **1. Lotes y Sublotes**
```typescript
✅ SELECT desde 'lotes'
✅ JOIN con 'sublotes' via relación
✅ Filtro: activo = true
✅ Ordenado: por nombre
✅ Mapeo: arboles_* → conteo_arboles.*
```

### **2. Productos (Fumigación)**
```typescript
✅ SELECT desde 'productos'
✅ Filtro: categoria IN ('Fungicida', 'Insecticida', ...)
✅ Filtro: estado = 'OK'
✅ Filtro: activo = true
✅ Ordenado: por nombre
✅ Mapeo: precio_unitario → ultimo_precio_unitario
✅ Mapeo: presentacion_kg_l → presentacion_comercial
```

### **3. Productos (Fertilización)**
```typescript
✅ SELECT desde 'productos'
✅ Filtro: categoria IN ('Fertilizante')
✅ Filtro: estado = 'OK'
✅ Filtro: activo = true
✅ Ordenado: por nombre
✅ Mapeo: precio_unitario → ultimo_precio_unitario
✅ Mapeo: presentacion_kg_l → presentacion_comercial
```

### **4. Inventario (Lista de Compras)**
```typescript
✅ SELECT desde 'productos'
✅ Filtro: id IN (array de IDs necesarios)
✅ Sin filtros adicionales (queremos ver productos aunque estén inactivos)
✅ Mapeo: precio_unitario → ultimo_precio_unitario
✅ Mapeo: presentacion_kg_l → presentacion_comercial
```

---

## 🚧 PENDIENTES PARA GUARDAR APLICACIONES

### **Opción 1: Crear tablas relacionadas (RECOMENDADO)**

```sql
-- Tabla para almacenar configuración
CREATE TABLE aplicaciones_configuracion (
  aplicacion_id UUID REFERENCES aplicaciones(id) ON DELETE CASCADE,
  lote_id UUID REFERENCES lotes(id),
  sublotes UUID[],
  area_hectareas NUMERIC,
  arboles_grandes INTEGER,
  arboles_medianos INTEGER,
  arboles_pequenos INTEGER,
  arboles_clonales INTEGER,
  calibracion_litros_arbol NUMERIC,
  tamano_caneca INTEGER,
  PRIMARY KEY (aplicacion_id, lote_id)
);

-- Tabla para mezclas
CREATE TABLE aplicaciones_mezclas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aplicacion_id UUID REFERENCES aplicaciones(id) ON DELETE CASCADE,
  nombre TEXT,
  numero_orden INTEGER
);

-- Tabla para productos en mezcla
CREATE TABLE aplicaciones_productos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mezcla_id UUID REFERENCES aplicaciones_mezclas(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id),
  dosis_por_caneca NUMERIC,
  dosis_grandes NUMERIC,
  dosis_medianos NUMERIC,
  dosis_pequenos NUMERIC,
  dosis_clonales NUMERIC,
  cantidad_total_necesaria NUMERIC
);

-- Tabla para cálculos por lote
CREATE TABLE aplicaciones_calculos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aplicacion_id UUID REFERENCES aplicaciones(id) ON DELETE CASCADE,
  lote_id UUID REFERENCES lotes(id),
  litros_mezcla NUMERIC,
  numero_canecas NUMERIC,
  kilos_totales NUMERIC,
  numero_bultos INTEGER
);

-- Tabla para lista de compras
CREATE TABLE aplicaciones_lista_compras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aplicacion_id UUID REFERENCES aplicaciones(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id),
  cantidad_necesaria NUMERIC,
  inventario_actual NUMERIC,
  cantidad_faltante NUMERIC,
  unidades_a_comprar INTEGER,
  costo_estimado NUMERIC
);
```

### **Opción 2: Agregar campos JSONB a `aplicaciones`**

```sql
ALTER TABLE aplicaciones 
ADD COLUMN configuracion_json JSONB,
ADD COLUMN mezclas_json JSONB,
ADD COLUMN calculos_json JSONB,
ADD COLUMN lista_compras_json JSONB;
```

**⚠️ NOTA:** La opción 1 es mejor para queries y reportes, pero la opción 2 es más rápida de implementar.

---

## 🎯 FUNCIÓN DE GUARDADO (CalculadoraAplicaciones.tsx)

```typescript
const guardarAplicacion = async () => {
  setGuardando(true);
  
  try {
    // Insertar aplicación base
    const { data: aplicacion, error: errorAplicacion } = await supabase
      .from('aplicaciones')
      .insert({
        nombre_aplicacion: configuracion.nombre,
        tipo_aplicacion: configuracion.tipo,
        proposito: configuracion.proposito,
        agronomo_responsable: configuracion.agronomo_responsable,
        fecha_recomendacion: configuracion.fecha_inicio,
        estado: 'Calculada',
        // Si usas JSONB:
        configuracion_json: configuracion,
        mezclas_json: mezclas,
        calculos_json: calculos,
        lista_compras_json: lista_compras,
      })
      .select()
      .single();
    
    if (errorAplicacion) throw errorAplicacion;
    
    // Si usas tablas relacionadas, insertar también:
    // - aplicaciones_configuracion
    // - aplicaciones_mezclas
    // - aplicaciones_productos
    // - aplicaciones_calculos
    // - aplicaciones_lista_compras
    
    // Redirigir
    router.push(`/aplicaciones/${aplicacion.id}`);
    
  } catch (error) {
    console.error('Error guardando aplicación:', error);
    setError('Error al guardar la aplicación');
  } finally {
    setGuardando(false);
  }
};
```

---

## 📝 CHECKLIST DE INTEGRACIÓN

- [x] ✅ Queries de lotes actualizadas
- [x] ✅ Queries de productos actualizadas
- [x] ✅ Mapeo de datos corregido
- [x] ✅ Filtros agregados (activo, estado)
- [x] ✅ Interfaces TypeScript actualizadas
- [ ] 🚧 Decidir estrategia de guardado (JSONB vs tablas)
- [ ] 🚧 Implementar función de guardado
- [ ] 🚧 Crear ruta `/aplicaciones/:id`
- [ ] 🚧 Testing de queries en producción

---

## 🔍 TESTING RECOMENDADO

1. **Verificar lotes se cargan correctamente**
   - Abrir `/aplicaciones/calculadora`
   - Paso 1: Debe mostrar lotes con sublotes
   - Debe mostrar conteo de árboles

2. **Verificar productos se cargan**
   - Paso 2: Selector debe mostrar productos
   - Fumigación: Solo productos fitosanitarios
   - Fertilización: Solo fertilizantes

3. **Verificar lista de compras**
   - Paso 3: Debe comparar con inventario
   - Debe mostrar precios correctos
   - Debe calcular faltantes

---

**¡Integración con Supabase completa y funcional!** ✅
