# 📋 INSTRUCCIONES PASO A PASO - CREAR TABLAS RELACIONADAS EN SUPABASE

**Fecha:** 11 de Noviembre, 2025  
**Objetivo:** Crear 5 tablas relacionadas para guardar aplicaciones fitosanitarias

---

## 🎯 RESUMEN DE LO QUE VAMOS A CREAR

Vamos a crear **5 nuevas tablas** que se relacionan con la tabla `aplicaciones` existente:

1. ✅ **`aplicaciones_lotes`** - Qué lotes se incluyen en la aplicación
2. ✅ **`aplicaciones_mezclas`** - Las mezclas de productos
3. ✅ **`aplicaciones_productos`** - Productos en cada mezcla con sus dosis
4. ✅ **`aplicaciones_calculos`** - Resultados de cálculos por lote
5. ✅ **`aplicaciones_compras`** - Lista de compras generada

---

## 📝 PASO 1: ABRIR EL SQL EDITOR EN SUPABASE

1. Ve a tu proyecto de Supabase: https://supabase.com/dashboard
2. En el menú lateral izquierdo, click en **"SQL Editor"** (ícono de código)
3. Click en el botón **"New query"** (arriba a la derecha)
4. Verás un editor de SQL vacío

---

## 💾 PASO 2: COPIAR Y PEGAR TODO EL SQL

**IMPORTANTE:** Copia **TODO** el código SQL de abajo (desde `-- TABLA 1` hasta el final) y pégalo en el SQL Editor.

```sql
-- ==========================================
-- TABLAS RELACIONADAS PARA APLICACIONES
-- Escocia Hass - Sistema de Gestión
-- ==========================================

-- ==========================================
-- TABLA 1: aplicaciones_lotes
-- Almacena qué lotes están incluidos en cada aplicación
-- ==========================================
CREATE TABLE IF NOT EXISTS public.aplicaciones_lotes (
  id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  aplicacion_id UUID NOT NULL,
  lote_id UUID NOT NULL,
  
  -- Sublotes incluidos (array de UUIDs)
  sublotes_ids UUID[] NULL,
  
  -- Datos de árboles al momento de la planificación
  arboles_grandes INTEGER NOT NULL DEFAULT 0,
  arboles_medianos INTEGER NOT NULL DEFAULT 0,
  arboles_pequenos INTEGER NOT NULL DEFAULT 0,
  arboles_clonales INTEGER NOT NULL DEFAULT 0,
  total_arboles INTEGER NOT NULL DEFAULT 0,
  
  -- Configuración específica para fumigación
  calibracion_litros_arbol NUMERIC(10, 4) NULL,
  tamano_caneca INTEGER NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT aplicaciones_lotes_pkey PRIMARY KEY (id),
  CONSTRAINT aplicaciones_lotes_unique UNIQUE (aplicacion_id, lote_id),
  CONSTRAINT aplicaciones_lotes_aplicacion_fkey FOREIGN KEY (aplicacion_id) 
    REFERENCES aplicaciones(id) ON DELETE CASCADE,
  CONSTRAINT aplicaciones_lotes_lote_fkey FOREIGN KEY (lote_id) 
    REFERENCES lotes(id) ON DELETE RESTRICT
) TABLESPACE pg_default;

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_aplicaciones_lotes_aplicacion 
  ON public.aplicaciones_lotes USING btree (aplicacion_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_aplicaciones_lotes_lote 
  ON public.aplicaciones_lotes USING btree (lote_id) TABLESPACE pg_default;

-- ==========================================
-- TABLA 2: aplicaciones_mezclas
-- Almacena las mezclas de productos
-- ==========================================
CREATE TABLE IF NOT EXISTS public.aplicaciones_mezclas (
  id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  aplicacion_id UUID NOT NULL,
  
  nombre TEXT NOT NULL,
  numero_orden INTEGER NOT NULL DEFAULT 1,
  
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT aplicaciones_mezclas_pkey PRIMARY KEY (id),
  CONSTRAINT aplicaciones_mezclas_aplicacion_fkey FOREIGN KEY (aplicacion_id) 
    REFERENCES aplicaciones(id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Índice
CREATE INDEX IF NOT EXISTS idx_aplicaciones_mezclas_aplicacion 
  ON public.aplicaciones_mezclas USING btree (aplicacion_id) TABLESPACE pg_default;

-- ==========================================
-- TABLA 3: aplicaciones_productos
-- Almacena los productos de cada mezcla con sus dosis
-- ==========================================
CREATE TABLE IF NOT EXISTS public.aplicaciones_productos (
  id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  mezcla_id UUID NOT NULL,
  producto_id UUID NOT NULL,
  
  -- Dosis para fumigación
  dosis_por_caneca NUMERIC(10, 4) NULL,
  unidad_dosis TEXT NULL, -- 'cc' o 'gramos'
  
  -- Dosis para fertilización (por tipo de árbol)
  dosis_grandes NUMERIC(10, 4) NULL,
  dosis_medianos NUMERIC(10, 4) NULL,
  dosis_pequenos NUMERIC(10, 4) NULL,
  dosis_clonales NUMERIC(10, 4) NULL,
  
  -- Cantidades calculadas
  cantidad_total_necesaria NUMERIC(12, 4) NOT NULL DEFAULT 0,
  
  -- Datos del producto al momento de la planificación
  producto_nombre TEXT NOT NULL,
  producto_categoria TEXT NOT NULL,
  producto_unidad TEXT NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT aplicaciones_productos_pkey PRIMARY KEY (id),
  CONSTRAINT aplicaciones_productos_unique UNIQUE (mezcla_id, producto_id),
  CONSTRAINT aplicaciones_productos_mezcla_fkey FOREIGN KEY (mezcla_id) 
    REFERENCES aplicaciones_mezclas(id) ON DELETE CASCADE,
  CONSTRAINT aplicaciones_productos_producto_fkey FOREIGN KEY (producto_id) 
    REFERENCES productos(id) ON DELETE RESTRICT
) TABLESPACE pg_default;

-- Índices
CREATE INDEX IF NOT EXISTS idx_aplicaciones_productos_mezcla 
  ON public.aplicaciones_productos USING btree (mezcla_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_aplicaciones_productos_producto 
  ON public.aplicaciones_productos USING btree (producto_id) TABLESPACE pg_default;

-- ==========================================
-- TABLA 4: aplicaciones_calculos
-- Almacena los resultados de cálculos por lote
-- ==========================================
CREATE TABLE IF NOT EXISTS public.aplicaciones_calculos (
  id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  aplicacion_id UUID NOT NULL,
  lote_id UUID NOT NULL,
  
  -- Datos del lote (snapshot)
  lote_nombre TEXT NOT NULL,
  area_hectareas NUMERIC(10, 2) NULL,
  total_arboles INTEGER NOT NULL,
  
  -- Resultados para fumigación
  litros_mezcla NUMERIC(12, 4) NULL,
  numero_canecas NUMERIC(10, 2) NULL,
  
  -- Resultados para fertilización
  kilos_totales NUMERIC(12, 4) NULL,
  numero_bultos INTEGER NULL,
  
  -- Desglose por tipo de árbol (fertilización)
  kilos_grandes NUMERIC(12, 4) NULL,
  kilos_medianos NUMERIC(12, 4) NULL,
  kilos_pequenos NUMERIC(12, 4) NULL,
  kilos_clonales NUMERIC(12, 4) NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT aplicaciones_calculos_pkey PRIMARY KEY (id),
  CONSTRAINT aplicaciones_calculos_unique UNIQUE (aplicacion_id, lote_id),
  CONSTRAINT aplicaciones_calculos_aplicacion_fkey FOREIGN KEY (aplicacion_id) 
    REFERENCES aplicaciones(id) ON DELETE CASCADE,
  CONSTRAINT aplicaciones_calculos_lote_fkey FOREIGN KEY (lote_id) 
    REFERENCES lotes(id) ON DELETE RESTRICT
) TABLESPACE pg_default;

-- Índices
CREATE INDEX IF NOT EXISTS idx_aplicaciones_calculos_aplicacion 
  ON public.aplicaciones_calculos USING btree (aplicacion_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_aplicaciones_calculos_lote 
  ON public.aplicaciones_calculos USING btree (lote_id) TABLESPACE pg_default;

-- ==========================================
-- TABLA 5: aplicaciones_compras
-- Almacena la lista de compras generada
-- ==========================================
CREATE TABLE IF NOT EXISTS public.aplicaciones_compras (
  id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  aplicacion_id UUID NOT NULL,
  producto_id UUID NOT NULL,
  
  -- Datos del producto (snapshot)
  producto_nombre TEXT NOT NULL,
  producto_categoria TEXT NOT NULL,
  unidad TEXT NOT NULL,
  
  -- Cantidades
  inventario_actual NUMERIC(12, 4) NOT NULL,
  cantidad_necesaria NUMERIC(12, 4) NOT NULL,
  cantidad_faltante NUMERIC(12, 4) NOT NULL DEFAULT 0,
  
  -- Compra
  presentacion_comercial TEXT NULL,
  unidades_a_comprar INTEGER NOT NULL DEFAULT 0,
  
  -- Costos (al momento de la planificación)
  precio_unitario NUMERIC(12, 2) NULL,
  costo_estimado NUMERIC(12, 2) NULL,
  
  -- Alertas
  alerta TEXT NULL, -- 'sin_precio', 'sin_stock', 'normal'
  
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT aplicaciones_compras_pkey PRIMARY KEY (id),
  CONSTRAINT aplicaciones_compras_unique UNIQUE (aplicacion_id, producto_id),
  CONSTRAINT aplicaciones_compras_aplicacion_fkey FOREIGN KEY (aplicacion_id) 
    REFERENCES aplicaciones(id) ON DELETE CASCADE,
  CONSTRAINT aplicaciones_compras_producto_fkey FOREIGN KEY (producto_id) 
    REFERENCES productos(id) ON DELETE RESTRICT
) TABLESPACE pg_default;

-- Índices
CREATE INDEX IF NOT EXISTS idx_aplicaciones_compras_aplicacion 
  ON public.aplicaciones_compras USING btree (aplicacion_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_aplicaciones_compras_producto 
  ON public.aplicaciones_compras USING btree (producto_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_aplicaciones_compras_alerta 
  ON public.aplicaciones_compras USING btree (alerta) TABLESPACE pg_default;

-- ==========================================
-- COMENTARIOS EN LAS TABLAS
-- ==========================================
COMMENT ON TABLE public.aplicaciones_lotes IS 
  'Lotes incluidos en cada aplicación con sus datos al momento de planificación';

COMMENT ON TABLE public.aplicaciones_mezclas IS 
  'Mezclas de productos definidas para la aplicación';

COMMENT ON TABLE public.aplicaciones_productos IS 
  'Productos incluidos en cada mezcla con sus dosis específicas';

COMMENT ON TABLE public.aplicaciones_calculos IS 
  'Resultados de cálculos por lote (litros, canecas, kilos, bultos)';

COMMENT ON TABLE public.aplicaciones_compras IS 
  'Lista de compras generada comparando necesidades con inventario';
```

---

## ▶️ PASO 3: EJECUTAR EL SQL

1. **Verifica que todo el código esté copiado** (deberías ver desde "TABLA 1" hasta "COMMENT ON TABLE")
2. Click en el botón **"Run"** (o presiona `Ctrl+Enter` / `Cmd+Enter`)
3. Espera 3-5 segundos
4. Deberías ver un mensaje verde que dice **"Success. No rows returned"**

**Si ves algún error:**
- Verifica que copiaste TODO el código
- Asegúrate de que las tablas `aplicaciones`, `lotes`, y `productos` existan
- Copia el mensaje de error y dime cuál es

---

## ✅ PASO 4: VERIFICAR QUE SE CREARON LAS TABLAS

1. En el menú lateral izquierdo, click en **"Table Editor"**
2. Deberías ver las 5 nuevas tablas:
   - ✅ `aplicaciones_lotes`
   - ✅ `aplicaciones_mezclas`
   - ✅ `aplicaciones_productos`
   - ✅ `aplicaciones_calculos`
   - ✅ `aplicaciones_compras`

3. Click en cada tabla y verifica que tenga las columnas correctas

---

## 🔍 PASO 5: PROBAR QUE FUNCIONA (OPCIONAL)

Vuelve al **SQL Editor** y crea una nueva query con esto:

```sql
-- Verificar estructura de las tablas
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN (
  'aplicaciones_lotes',
  'aplicaciones_mezclas',
  'aplicaciones_productos',
  'aplicaciones_calculos',
  'aplicaciones_compras'
)
ORDER BY table_name, ordinal_position;
```

Click en **"Run"**. Deberías ver una lista con todas las columnas de las 5 tablas.

---

## 📊 ESTRUCTURA FINAL DE LAS TABLAS

### **1. aplicaciones_lotes**
Relaciona aplicaciones con lotes.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | ID único |
| `aplicacion_id` | UUID | → aplicaciones.id |
| `lote_id` | UUID | → lotes.id |
| `sublotes_ids` | UUID[] | Array de sublotes incluidos |
| `arboles_grandes` | INTEGER | Snapshot al planificar |
| `arboles_medianos` | INTEGER | Snapshot al planificar |
| `arboles_pequenos` | INTEGER | Snapshot al planificar |
| `arboles_clonales` | INTEGER | Snapshot al planificar |
| `total_arboles` | INTEGER | Total calculado |
| `calibracion_litros_arbol` | NUMERIC | Solo fumigación |
| `tamano_caneca` | INTEGER | Solo fumigación |

**Relaciones:**
- `aplicacion_id` → `aplicaciones.id` (CASCADE)
- `lote_id` → `lotes.id` (RESTRICT)

---

### **2. aplicaciones_mezclas**
Las mezclas de productos.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | ID único |
| `aplicacion_id` | UUID | → aplicaciones.id |
| `nombre` | TEXT | "Mezcla 1", "Mezcla 2" |
| `numero_orden` | INTEGER | Orden de la mezcla |

**Relaciones:**
- `aplicacion_id` → `aplicaciones.id` (CASCADE)

---

### **3. aplicaciones_productos**
Productos en cada mezcla con sus dosis.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | ID único |
| `mezcla_id` | UUID | → aplicaciones_mezclas.id |
| `producto_id` | UUID | → productos.id |
| `dosis_por_caneca` | NUMERIC | Solo fumigación |
| `unidad_dosis` | TEXT | 'cc' o 'gramos' |
| `dosis_grandes` | NUMERIC | Solo fertilización |
| `dosis_medianos` | NUMERIC | Solo fertilización |
| `dosis_pequenos` | NUMERIC | Solo fertilización |
| `dosis_clonales` | NUMERIC | Solo fertilización |
| `cantidad_total_necesaria` | NUMERIC | Total calculado |
| `producto_nombre` | TEXT | Snapshot |
| `producto_categoria` | TEXT | Snapshot |
| `producto_unidad` | TEXT | Snapshot |

**Relaciones:**
- `mezcla_id` → `aplicaciones_mezclas.id` (CASCADE)
- `producto_id` → `productos.id` (RESTRICT)

---

### **4. aplicaciones_calculos**
Resultados de cálculos por lote.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | ID único |
| `aplicacion_id` | UUID | → aplicaciones.id |
| `lote_id` | UUID | → lotes.id |
| `lote_nombre` | TEXT | Snapshot |
| `area_hectareas` | NUMERIC | Snapshot |
| `total_arboles` | INTEGER | Snapshot |
| `litros_mezcla` | NUMERIC | Solo fumigación |
| `numero_canecas` | NUMERIC | Solo fumigación |
| `kilos_totales` | NUMERIC | Solo fertilización |
| `numero_bultos` | INTEGER | Solo fertilización |
| `kilos_grandes` | NUMERIC | Solo fertilización |
| `kilos_medianos` | NUMERIC | Solo fertilización |
| `kilos_pequenos` | NUMERIC | Solo fertilización |
| `kilos_clonales` | NUMERIC | Solo fertilización |

**Relaciones:**
- `aplicacion_id` → `aplicaciones.id` (CASCADE)
- `lote_id` → `lotes.id` (RESTRICT)

---

### **5. aplicaciones_compras**
Lista de compras generada.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | ID único |
| `aplicacion_id` | UUID | → aplicaciones.id |
| `producto_id` | UUID | → productos.id |
| `producto_nombre` | TEXT | Snapshot |
| `producto_categoria` | TEXT | Snapshot |
| `unidad` | TEXT | Snapshot |
| `inventario_actual` | NUMERIC | Al momento de planificar |
| `cantidad_necesaria` | NUMERIC | Calculado |
| `cantidad_faltante` | NUMERIC | Calculado |
| `presentacion_comercial` | TEXT | Del producto |
| `unidades_a_comprar` | INTEGER | Calculado |
| `precio_unitario` | NUMERIC | Snapshot |
| `costo_estimado` | NUMERIC | Calculado |
| `alerta` | TEXT | 'sin_precio', 'sin_stock', 'normal' |

**Relaciones:**
- `aplicacion_id` → `aplicaciones.id` (CASCADE)
- `producto_id` → `productos.id` (RESTRICT)

---

## 🔐 POLÍTICA DE SEGURIDAD (RLS)

**IMPORTANTE:** Por defecto, Supabase activa Row Level Security (RLS). Para probar rápidamente, puedes desactivarlo temporalmente:

```sql
-- Desactivar RLS en las nuevas tablas (SOLO PARA DESARROLLO)
ALTER TABLE aplicaciones_lotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE aplicaciones_mezclas DISABLE ROW LEVEL SECURITY;
ALTER TABLE aplicaciones_productos DISABLE ROW LEVEL SECURITY;
ALTER TABLE aplicaciones_calculos DISABLE ROW LEVEL SECURITY;
ALTER TABLE aplicaciones_compras DISABLE ROW LEVEL SECURITY;
```

**Para producción**, deberías crear políticas RLS apropiadas más adelante.

---

## ✅ CHECKLIST FINAL

- [ ] ✅ Copiaste y pegaste TODO el SQL
- [ ] ✅ Ejecutaste el SQL (botón "Run")
- [ ] ✅ Viste el mensaje "Success"
- [ ] ✅ Verificaste las 5 tablas en Table Editor
- [ ] ✅ (Opcional) Ejecutaste el SQL de verificación
- [ ] ✅ (Opcional) Desactivaste RLS para desarrollo

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### **Error: "relation aplicaciones does not exist"**
➡️ La tabla `aplicaciones` no existe. Créala primero.

### **Error: "relation lotes does not exist"**
➡️ La tabla `lotes` no existe. Créala primero.

### **Error: "relation productos does not exist"**
➡️ La tabla `productos` no existe. Créala primero.

### **Error: "permission denied"**
➡️ Tu usuario no tiene permisos. Usa el usuario admin de Supabase.

### **Error: "table already exists"**
➡️ Ya ejecutaste el SQL antes. Está bien, ignora el error.

---

## 🎉 ¡LISTO!

Si todo salió bien, ahora tienes las 5 tablas relacionadas creadas y listas para usar.

**Siguiente paso:** Implementar la función `guardarAplicacion()` en el código de React.

---

**¿Necesitas ayuda?** Avísame si viste algún error o tienes dudas. 🚀
