-- ==========================================
-- TABLAS RELACIONADAS PARA APLICACIONES
-- Escocia Hass - Sistema de Gestión
-- Fecha: 11 de Noviembre, 2025
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

-- ==========================================
-- OPCIONAL: DESACTIVAR RLS PARA DESARROLLO
-- ==========================================
-- Ejecuta esto solo si quieres probar sin configurar políticas de seguridad

ALTER TABLE aplicaciones_lotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE aplicaciones_mezclas DISABLE ROW LEVEL SECURITY;
ALTER TABLE aplicaciones_productos DISABLE ROW LEVEL SECURITY;
ALTER TABLE aplicaciones_calculos DISABLE ROW LEVEL SECURITY;
ALTER TABLE aplicaciones_compras DISABLE ROW LEVEL SECURITY;
