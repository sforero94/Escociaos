# 📊 SUPABASE - ESQUEMA DE TABLAS
## Sistema de Gestión Escocia Hass

**Última actualización:** 2025-11-13
**Versión:** 1.1
**Propósito:** Documentación técnica completa del esquema de base de datos

---

## 📖 Índice

1. [Visión General](#visión-general)
2. [Tipos Personalizados (ENUMs)](#tipos-personalizados-enums)
3. [Tablas por Dominio](#tablas-por-dominio)
   - [Configuración Base](#1-configuración-base)
   - [Aplicaciones Fitosanitarias](#2-aplicaciones-fitosanitarias)
   - [Inventario y Compras](#3-inventario-y-compras)
   - [Cosechas y Despachos](#4-cosechas-y-despachos)
   - [Monitoreo y Control](#5-monitoreo-y-control)
   - [Verificaciones de Inventario](#6-verificaciones-de-inventario)
   - [Auditoría y Usuarios](#7-auditoría-y-usuarios)
4. [Diagrama de Relaciones](#diagrama-de-relaciones)
5. [Índices y Constraints](#índices-y-constraints)
6. [Notas de Implementación](#notas-de-implementación)

---

## 🎯 Visión General

Este esquema de base de datos soporta un sistema completo de gestión agronómica para cultivos de aguacate Hass con certificación GlobalGAP. Incluye:

- **32 tablas** principales
- **7+ tipos personalizados** (ENUMs)
- **Trazabilidad completa** desde aplicación hasta despacho
- **Control de inventario** con verificaciones físicas
- **Auditoría** de todas las operaciones críticas

### Principios de Diseño

- ✅ Normalización: Evita duplicación de datos
- ✅ Trazabilidad: Cada operación es auditable
- ✅ Flexibilidad: Soporta múltiples tipos de aplicaciones
- ✅ Integridad: Foreign keys y constraints estrictos
- ✅ Rendimiento: Campos calculados para consultas rápidas

---

## 🏷️ Tipos Personalizados (ENUMs)

### `tipo_aplicacion`
```sql
'Fumigación' | 'Fertilización' | 'Drench'
```

### `estado_aplicacion`
```sql
'Calculada' | 'En ejecución' | 'Cerrada'
```

### `categoria_producto`
```sql
'Fertilizante' | 'Fungicida' | 'Insecticida' | 'Acaricida' | 
'Herbicida' | 'Biocontrolador' | 'Coadyuvante' | 'Herramienta' | 
'Equipo' | 'Otros'
```

### `grupo_producto`
```sql
'Agroinsumos' | 'Herramientas' | 'Maquinaria y equipo'
```

### `tipo_aplicacion_producto`
```sql
'Foliar' | 'Edáfico' | 'Drench'
```

### `estado_fisico`
```sql
'Liquido' | 'Sólido'
```

### `estado_producto`
```sql
'OK' | 'Sin existencias' | 'Vencido' | 'Perdido'
```

### `tipo_movimiento`
```sql
'Entrada' | 'Salida por Aplicación' | 'Salida Otros' | 'Ajuste'
```

### `estado_verificacion`
```sql
'En proceso' | 'Completada' | 'Pendiente Aprobación' | 'Aprobada' | 'Rechazada'
```

### `gravedad_texto`
```sql
'Baja' | 'Media' | 'Alta'
```

### `rol_usuario`
```sql
'Administrador' | 'Verificador' | 'Gerencia'
```

### `condiciones_meteorologicas`
```sql
'soleadas' | 'nubladas' | 'lluvia suave' | 'lluvia fuerte'
```

---

## 📊 Tablas por Dominio

---

## 1. Configuración Base

### 📍 `lotes`
Lotes principales del cultivo.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `nombre` | `text` | Nombre del lote | NOT NULL, UNIQUE |
| `numero_orden` | `integer` | Orden de visualización | |
| `area_hectareas` | `numeric` | Área en hectáreas | |
| `arboles_grandes` | `integer` | Cantidad árboles grandes | DEFAULT 0 |
| `arboles_medianos` | `integer` | Cantidad árboles medianos | DEFAULT 0 |
| `arboles_pequenos` | `integer` | Cantidad árboles pequeños | DEFAULT 0 |
| `arboles_clonales` | `integer` | Cantidad árboles clonales | DEFAULT 0 |
| `total_arboles` | `integer` | Total calculado | GENERATED: suma de todos |
| `activo` | `boolean` | Si está activo | DEFAULT true |

**Relaciones:**
- 1:N con `sublotes`
- 1:N con `aplicaciones_lotes`
- 1:N con `cosechas`
- 1:N con `monitoreos`
- 1:N con `focos`

**Índices:**
- PK: `lotes_pkey` (id)
- UNIQUE: `nombre`

---

### 📍 `sublotes`
Subdivisiones de lotes.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `lote_id` | `uuid` | Referencia al lote padre | NOT NULL, FK → lotes(id) |
| `nombre` | `text` | Nombre del sublote | NOT NULL |
| `numero_sublote` | `integer` | Número de orden | |
| `arboles_grandes` | `integer` | Cantidad árboles grandes | DEFAULT 0 |
| `arboles_medianos` | `integer` | Cantidad árboles medianos | DEFAULT 0 |
| `arboles_pequenos` | `integer` | Cantidad árboles pequeños | DEFAULT 0 |
| `arboles_clonales` | `integer` | Cantidad árboles clonales | DEFAULT 0 |
| `total_arboles` | `integer` | Total calculado | GENERATED: suma de todos |

**Relaciones:**
- N:1 con `lotes`
- 1:N con `cosechas`
- 1:N con `monitoreos`
- 1:N con `focos`

---

### 📍 `productos`
Catálogo de productos fitosanitarios, fertilizantes y otros insumos.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `nombre` | `text` | Nombre del producto | NOT NULL, UNIQUE |
| `categoria` | `categoria_producto` | Categoría del producto | NOT NULL (ENUM) |
| `grupo` | `grupo_producto` | Grupo del producto | NOT NULL (ENUM) |
| `registro_ica` | `text` | Número de registro ICA | |
| `blanco_biologico` | `text` | Plaga/enfermedad objetivo | |
| **Ingredientes activos** | | | |
| `ingrediente_activo_1` | `text` | Primer ingrediente activo | |
| `concentracion_ia_1` | `numeric` | Concentración % o g/L | |
| `ingrediente_activo_2` | `text` | Segundo ingrediente activo | |
| `concentracion_ia_2` | `numeric` | Concentración % o g/L | |
| `ingrediente_activo_3` | `text` | Tercer ingrediente activo | |
| `concentracion_ia_3` | `numeric` | Concentración % o g/L | |
| **Seguridad** | | | |
| `periodo_reingreso_horas` | `integer` | Horas antes de reingreso | |
| `periodo_carencia_dias` | `integer` | Días antes de cosecha | |
| `tipo_aplicacion` | `tipo_aplicacion` | Tipo de aplicación | (ENUM) |
| `estado_fisico` | `estado_fisico` | Estado físico | (ENUM) |
| `permitido_gerencia` | `boolean` | Requiere autorización | DEFAULT false |
| **Composición nutricional** | | | |
| `nitrogeno` | `numeric` | % Nitrógeno (N) | |
| `fosforo` | `numeric` | % Fósforo (P) | |
| `potasio` | `numeric` | % Potasio (K) | |
| `calcio` | `numeric` | % Calcio (Ca) | |
| `magnesio` | `numeric` | % Magnesio (Mg) | |
| `azufre` | `numeric` | % Azufre (S) | |
| `hierro` | `numeric` | % Hierro (Fe) | |
| `manganeso` | `numeric` | % Manganeso (Mn) | |
| `zinc` | `numeric` | % Zinc (Zn) | |
| `cobre` | `numeric` | % Cobre (Cu) | |
| `boro` | `numeric` | % Boro (B) | |
| `molibdeno` | `numeric` | % Molibdeno (Mo) | |
| `carbono_organico` | `numeric` | % Carbono orgánico | |
| `silicio` | `numeric` | % Silicio (Si) | |
| `sodio` | `numeric` | % Sodio (Na) | |
| **Riesgos** | | | |
| `epp_alto_nivel` | `boolean` | Requiere EPP especial | DEFAULT false |
| `riesgo_acuatico` | `boolean` | Riesgo para vida acuática | DEFAULT false |
| `riesgo_vida_silvestre` | `boolean` | Riesgo fauna silvestre | DEFAULT false |
| `riesgo_polinizador` | `boolean` | Riesgo para polinizadores | DEFAULT false |
| `riesgo_transeunte` | `boolean` | Riesgo transeúntes | DEFAULT false |
| **Documentación** | | | |
| `link_ficha_tecnica` | `text` | URL ficha técnica | |
| `link_hoja_seguridad` | `text` | URL hoja de seguridad | |
| **Comercial** | | | |
| `unidad_medida` | `text` | 'litros' \| 'kilos' \| 'unidades' | NOT NULL |
| `presentacion_kg_l` | `numeric` | Tamaño presentación comercial | |
| `precio_por_presentacion` | `numeric` | Precio por presentación | |
| `precio_unitario` | `numeric` | Precio por unidad base | |
| **Inventario** | | | |
| `cantidad_actual` | `numeric` | Stock actual | DEFAULT 0 |
| `estado` | `estado_producto` | Estado del stock | DEFAULT 'OK' (ENUM) |
| `stock_minimo` | `numeric` | Stock mínimo | DEFAULT 0 |
| `activo` | `boolean` | Si está activo | DEFAULT true |
| **Auditoría** | | | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `updated_at` | `timestamptz` | Fecha actualización | DEFAULT now() |
| `updated_by` | `uuid` | Usuario que actualizó | FK → auth.users(id) |

**Relaciones:**
- 1:N con `aplicaciones_productos`
- 1:N con `aplicaciones_mezclas_productos`
- 1:N con `compras`
- 1:N con `movimientos_inventario`
- 1:N con `focos_productos`

---

## 2. Aplicaciones Fitosanitarias

### 📍 `aplicaciones`
Registro maestro de aplicaciones fitosanitarias o fertilización.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `codigo_aplicacion` | `text` | Código único autogenerado | UNIQUE |
| `nombre_aplicacion` | `text` | Nombre descriptivo | |
| `tipo_aplicacion` | `tipo_aplicacion` | Fumigación o Fertilización | NOT NULL (ENUM) |
| `proposito` | `text` | Propósito de la aplicación | |
| `blanco_biologico` | `text` | Plaga/enfermedad objetivo | |
| **Fechas Planificadas** | | | |
| `fecha_inicio_planeada` | `date` | Fecha planeada de inicio | |
| `fecha_fin_planeada` | `date` | Fecha planeada de fin | |
| `fecha_recomendacion` | `date` | Fecha recomendada por agrónomo | |
| **Ejecución** | | | |
| `agronomo_responsable` | `text` | Nombre del agrónomo | |
| `estado` | `estado_aplicacion` | Estado actual | DEFAULT 'Calculada' (ENUM) |
| `fecha_inicio_ejecucion` | `date` | Inicio real de aplicación | |
| `fecha_fin_ejecucion` | `date` | Fin real de aplicación | |
| `fecha_cierre` | `timestamptz` | Timestamp de cierre | |
| **Costos y Métricas** | | | |
| `jornales_utilizados` | `numeric` | Total jornales usados | DEFAULT 0 |
| `valor_jornal` | `numeric` | Valor COP por jornal | DEFAULT 0 |
| `costo_total_insumos` | `numeric` | Costo total productos | DEFAULT 0 |
| `costo_total_mano_obra` | `numeric` | Costo total jornales | DEFAULT 0 |
| `costo_total` | `numeric` | Costo total aplicación | DEFAULT 0 |
| `costo_por_arbol` | `numeric` | Costo calculado por árbol | |
| `arboles_jornal` | `numeric` | Árboles procesados por jornal | |
| `observaciones_cierre` | `text` | Observaciones al cerrar | |
| **Auditoría** | | | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `updated_at` | `timestamptz` | Fecha actualización | DEFAULT now() |

**Relaciones:**
- 1:N con `aplicaciones_lotes`
- 1:N con `aplicaciones_mezclas`
- 1:N con `aplicaciones_productos`
- 1:N con `aplicaciones_calculos`
- 1:N con `aplicaciones_compras`
- 1:1 con `aplicaciones_cierre`
- 1:N con `movimientos_inventario`
- 1:N con `focos`

**Estados:**
- **Calculada:** Planificada pero no iniciada
- **En ejecución:** En proceso de aplicación
- **Cerrada:** Finalizada y costos registrados

---

### 📍 `aplicaciones_lotes`
Configuración de lotes incluidos en una aplicación.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `aplicacion_id` | `uuid` | Referencia a aplicación | NOT NULL, FK → aplicaciones(id) |
| `lote_id` | `uuid` | Referencia al lote | NOT NULL, FK → lotes(id) |
| `sublotes_ids` | `uuid[]` | Array de sublotes incluidos | ARRAY |
| `arboles_grandes` | `integer` | Árboles grandes a aplicar | NOT NULL, DEFAULT 0 |
| `arboles_medianos` | `integer` | Árboles medianos a aplicar | NOT NULL, DEFAULT 0 |
| `arboles_pequenos` | `integer` | Árboles pequeños a aplicar | NOT NULL, DEFAULT 0 |
| `arboles_clonales` | `integer` | Árboles clonales a aplicar | NOT NULL, DEFAULT 0 |
| `total_arboles` | `integer` | Total árboles | NOT NULL, DEFAULT 0 |
| `calibracion_litros_arbol` | `numeric` | Calibración L/árbol | |
| `tamano_caneca` | `integer` | Tamaño caneca (L) | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

---

### 📍 `aplicaciones_mezclas`
Mezclas de productos para una aplicación (permite múltiples mezclas por aplicación).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `aplicacion_id` | `uuid` | Referencia a aplicación | NOT NULL, FK → aplicaciones(id) |
| `numero_mezcla` | `integer` | Número de mezcla | NOT NULL, CHECK > 0 |
| `nombre_mezcla` | `text` | Nombre descriptivo | |

**Relaciones:**
- N:1 con `aplicaciones`
- 1:N con `aplicaciones_mezclas_productos`
- 1:N con `aplicaciones_productos`
- 1:N con `aplicaciones_lotes_planificado`

---

### 📍 `aplicaciones_mezclas_productos`
Productos y dosis por mezcla.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `mezcla_id` | `uuid` | Referencia a mezcla | NOT NULL, FK → aplicaciones_mezclas(id) |
| `producto_id` | `uuid` | Referencia a producto | NOT NULL, FK → productos(id) |
| `dosis` | `numeric` | Dosis del producto | NOT NULL |
| `unidad_dosis` | `text` | Unidad de la dosis | NOT NULL |

---

### 📍 `aplicaciones_productos`
Cantidades calculadas de productos por mezcla y tipo de árbol.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `mezcla_id` | `uuid` | Referencia a mezcla | NOT NULL, FK → aplicaciones_mezclas(id) |
| `producto_id` | `uuid` | Referencia a producto | NOT NULL, FK → productos(id) |
| `dosis_por_caneca` | `numeric` | Dosis por caneca | |
| `unidad_dosis` | `text` | Unidad de dosis | |
| `dosis_grandes` | `numeric` | Dosis para árboles grandes | |
| `dosis_medianos` | `numeric` | Dosis para árboles medianos | |
| `dosis_pequenos` | `numeric` | Dosis para árboles pequeños | |
| `dosis_clonales` | `numeric` | Dosis para árboles clonales | |
| `cantidad_total_necesaria` | `numeric` | Total necesario | NOT NULL, DEFAULT 0 |
| `producto_nombre` | `text` | Nombre del producto (cache) | NOT NULL |
| `producto_categoria` | `text` | Categoría (cache) | NOT NULL |
| `producto_unidad` | `text` | Unidad (cache) | NOT NULL |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

---

### 📍 `aplicaciones_calculos`
Cálculos de mezcla por lote.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `aplicacion_id` | `uuid` | Referencia a aplicación | NOT NULL, FK → aplicaciones(id) |
| `lote_id` | `uuid` | Referencia al lote | NOT NULL, FK → lotes(id) |
| `lote_nombre` | `text` | Nombre del lote (cache) | NOT NULL |
| `area_hectareas` | `numeric` | Área del lote | |
| `total_arboles` | `integer` | Total árboles | NOT NULL |
| `litros_mezcla` | `numeric` | Litros totales de mezcla | |
| `numero_canecas` | `numeric` | Número de canecas | |
| `kilos_totales` | `numeric` | Kilos totales | |
| `numero_bultos` | `integer` | Número de bultos | |
| `kilos_grandes` | `numeric` | Kilos para grandes | |
| `kilos_medianos` | `numeric` | Kilos para medianos | |
| `kilos_pequenos` | `numeric` | Kilos para pequeños | |
| `kilos_clonales` | `numeric` | Kilos para clonales | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

---

### 📍 `aplicaciones_compras`
Lista de compras necesarias (comparación con inventario).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `aplicacion_id` | `uuid` | Referencia a aplicación | NOT NULL, FK → aplicaciones(id) |
| `producto_id` | `uuid` | Referencia a producto | NOT NULL, FK → productos(id) |
| `producto_nombre` | `text` | Nombre producto (cache) | NOT NULL |
| `producto_categoria` | `text` | Categoría (cache) | NOT NULL |
| `unidad` | `text` | Unidad de medida | NOT NULL |
| `inventario_actual` | `numeric` | Stock actual | NOT NULL |
| `cantidad_necesaria` | `numeric` | Cantidad requerida | NOT NULL |
| `cantidad_faltante` | `numeric` | Faltante | NOT NULL, DEFAULT 0 |
| `presentacion_comercial` | `text` | Presentación comercial | |
| `unidades_a_comprar` | `integer` | Unidades a comprar | NOT NULL, DEFAULT 0 |
| `precio_unitario` | `numeric` | Precio por unidad | |
| `costo_estimado` | `numeric` | Costo total estimado | |
| `alerta` | `text` | Mensaje de alerta | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

---

### 📍 `aplicaciones_lotes_planificado`
Datos planificados por lote y mezcla.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `aplicacion_id` | `uuid` | Referencia a aplicación | NOT NULL, FK → aplicaciones(id) |
| `lote_id` | `uuid` | Referencia al lote | NOT NULL, FK → lotes(id) |
| `mezcla_id` | `uuid` | Referencia a mezcla | NOT NULL, FK → aplicaciones_mezclas(id) |
| `calibracion_l_arbol` | `numeric` | Calibración litros/árbol | |
| `tamano_caneca` | `integer` | Tamaño de caneca (L) | |
| `litros_mezcla_planificado` | `numeric` | Litros planificados | |
| `canecas_planificado` | `numeric` | Canecas planificadas | |

---

### 📍 `aplicaciones_productos_planificado`
Productos planificados por aplicación.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `aplicacion_id` | `uuid` | Referencia a aplicación | NOT NULL, FK → aplicaciones(id) |
| `producto_id` | `uuid` | Referencia a producto | NOT NULL, FK → productos(id) |
| `cantidad_total_planificada` | `numeric` | Cantidad total planificada | |
| `unidad` | `text` | Unidad de medida | |

---

### 📍 `aplicaciones_cierre`
Cierre de aplicación con datos reales de ejecución.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `aplicacion_id` | `uuid` | Referencia a aplicación | NOT NULL, UNIQUE, FK → aplicaciones(id) |
| `fecha_cierre` | `date` | Fecha de cierre | NOT NULL |
| `dias_aplicacion` | `integer` | Días que duró | |
| `valor_jornal` | `numeric` | Valor jornal diario | |
| `observaciones_generales` | `text` | Observaciones generales | |
| `cerrado_por` | `text` | Usuario que cerró | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

**Relaciones:**
- 1:1 con `aplicaciones`
- 1:N con `aplicaciones_lotes_real`
- 1:N con `aplicaciones_productos_real`

---

### 📍 `aplicaciones_lotes_real`
Datos reales por lote ejecutado.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `cierre_id` | `uuid` | Referencia al cierre | NOT NULL, FK → aplicaciones_cierre(id) |
| `lote_id` | `uuid` | Referencia al lote | NOT NULL, FK → lotes(id) |
| `canecas_20l` | `numeric` | Canecas 20L usadas | DEFAULT 0 |
| `canecas_200l` | `numeric` | Canecas 200L usadas | DEFAULT 0 |
| `canecas_500l` | `numeric` | Canecas 500L usadas | DEFAULT 0 |
| `canecas_1000l` | `numeric` | Canecas 1000L usadas | DEFAULT 0 |
| `litros_mezcla_real` | `numeric` | Litros reales usados | |
| `jornales_aplicacion` | `numeric` | Jornales aplicación | DEFAULT 0 |
| `jornales_mezcla` | `numeric` | Jornales mezcla | DEFAULT 0 |
| `jornales_transporte` | `numeric` | Jornales transporte | DEFAULT 0 |
| `jornales_total` | `numeric` | Total jornales | GENERATED: suma |
| `costo_insumos` | `numeric` | Costo insumos | |
| `costo_mano_obra` | `numeric` | Costo mano de obra | |
| `costo_total` | `numeric` | Costo total | GENERATED: suma |

---

### 📍 `aplicaciones_productos_real`
Productos realmente usados por lote.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `cierre_id` | `uuid` | Referencia al cierre | NOT NULL, FK → aplicaciones_cierre(id) |
| `lote_id` | `uuid` | Referencia al lote | NOT NULL, FK → lotes(id) |
| `producto_id` | `uuid` | Referencia a producto | NOT NULL, FK → productos(id) |
| `cantidad_real` | `numeric` | Cantidad realmente usada | |
| `unidad` | `text` | Unidad de medida | |
| `costo` | `numeric` | Costo del producto | |

---

### 📍 `movimientos_diarios`
Registro provisional de movimientos diarios durante la ejecución de aplicaciones (para trazabilidad GlobalGAP).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `aplicacion_id` | `uuid` | Referencia a aplicación | NOT NULL, FK → aplicaciones(id) ON DELETE CASCADE |
| `fecha_movimiento` | `date` | Fecha del movimiento | NOT NULL |
| `lote_id` | `uuid` | Lote donde se aplicó | NOT NULL, FK → lotes(id) |
| `lote_nombre` | `text` | Nombre del lote (cache) | NOT NULL |
| `numero_canecas` | `numeric` | Número total de canecas aplicadas | NOT NULL, CHECK >= 0 |
| `responsable` | `text` | Responsable del movimiento | NOT NULL |
| `notas` | `text` | Observaciones | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que registró | FK → auth.users(id) |

**Relaciones:**
- N:1 con `aplicaciones`
- N:1 con `lotes`
- 1:N con `movimientos_diarios_productos` (detalle de productos utilizados)

**Propósito:**
Los movimientos diarios son registros **provisionales** durante la ejecución de aplicaciones que:
- Registran el número de canecas aplicadas por día en cada lote (sin duplicar el conteo)
- Los productos utilizados en cada movimiento se registran en la tabla relacionada `movimientos_diarios_productos`
- Mantienen trazabilidad para GlobalGAP sin afectar inventario inmediatamente
- Permiten comparar lo planificado vs lo realmente utilizado
- Se revisan al cerrar la aplicación antes de crear los movimientos definitivos de inventario

**Índices:**
- PK: `movimientos_diarios_pkey` (id)
- INDEX: `idx_movimientos_aplicacion` (aplicacion_id)
- INDEX: `idx_movimientos_fecha` (fecha_movimiento)

---

### 📍 `movimientos_diarios_productos`
Detalle de productos utilizados en cada movimiento diario (relación N:N entre movimientos y productos).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `movimiento_diario_id` | `uuid` | Referencia al movimiento diario | NOT NULL, FK → movimientos_diarios(id) ON DELETE CASCADE |
| `producto_id` | `uuid` | Producto utilizado | NOT NULL, FK → productos(id) ON DELETE RESTRICT |
| `producto_nombre` | `text` | Nombre del producto (cache) | NOT NULL |
| `producto_categoria` | `text` | Categoría del producto (cache) | NOT NULL |
| `cantidad_utilizada` | `numeric` | Cantidad utilizada del producto | NOT NULL, CHECK > 0 |
| `unidad` | `text` | Unidad de medida | NOT NULL, CHECK IN ('cc', 'L', 'g', 'Kg') |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

**Relaciones:**
- N:1 con `movimientos_diarios`
- N:1 con `productos`

**Propósito:**
Esta tabla permite registrar múltiples productos mezclados en las canecas de un movimiento diario:
- Evita duplicar el conteo de canecas (se cuenta en movimientos_diarios)
- Registra la cantidad de cada producto usado en unidades apropiadas (cc/L para líquidos, g/Kg para sólidos)
- Facilita el cálculo de consumo real por producto al cerrar la aplicación

**Ejemplo:**
Si en un día se aplican 5 canecas en un lote, y cada caneca contiene 3 productos mezclados:
- 1 registro en `movimientos_diarios` (numero_canecas = 5)
- 3 registros en `movimientos_diarios_productos` (uno por cada producto con su cantidad)

**Índices:**
- PK: `movimientos_diarios_productos_pkey` (id)
- INDEX: `idx_mdp_movimiento` (movimiento_diario_id)
- INDEX: `idx_mdp_producto` (producto_id)
- INDEX: `idx_mdp_created_at` (created_at)

---

## 3. Inventario y Compras

### 📍 `compras`
Registro de compras de productos.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `fecha_compra` | `date` | Fecha de compra | NOT NULL |
| `proveedor` | `text` | Nombre del proveedor | NOT NULL |
| `numero_factura` | `text` | Número de factura | |
| `producto_id` | `uuid` | Producto comprado | NOT NULL, FK → productos(id) |
| `cantidad` | `numeric` | Cantidad comprada | NOT NULL, CHECK > 0 |
| `unidad` | `text` | Unidad de medida | NOT NULL |
| `numero_lote_producto` | `text` | Lote del fabricante | |
| `fecha_vencimiento` | `date` | Fecha de vencimiento | |
| `costo_unitario` | `numeric` | Costo por unidad | NOT NULL, CHECK > 0 |
| `costo_total` | `numeric` | Costo total | NOT NULL, CHECK > 0 |
| `link_factura` | `text` | URL de factura digital | |
| `usuario_registro` | `text` | Usuario que registró | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `updated_at` | `timestamp` | Fecha actualización | DEFAULT now() |
| `updated_by` | `uuid` | Usuario que actualizó | FK → auth.users(id) |

**Relaciones:**
- N:1 con `productos`

---

### 📍 `movimientos_inventario`
Registro de todos los movimientos de inventario.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `fecha_movimiento` | `date` | Fecha del movimiento | NOT NULL |
| `producto_id` | `uuid` | Producto afectado | NOT NULL, FK → productos(id) |
| `tipo_movimiento` | `tipo_movimiento` | Tipo de movimiento | NOT NULL (ENUM) |
| `cantidad` | `numeric` | Cantidad del movimiento | NOT NULL |
| `unidad` | `text` | Unidad de medida | NOT NULL |
| `lote_aplicacion` | `text` | Lote donde se aplicó | |
| `aplicacion_id` | `uuid` | Referencia a aplicación | FK → aplicaciones(id) |
| `factura` | `text` | Número de factura | |
| `saldo_anterior` | `numeric` | Saldo antes del movimiento | |
| `saldo_nuevo` | `numeric` | Saldo después del movimiento | |
| `valor_movimiento` | `numeric` | Valor monetario | |
| `responsable` | `text` | Responsable del movimiento | |
| `observaciones` | `text` | Observaciones | |
| `provisional` | `boolean` | Si es provisional | DEFAULT false |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

**Relaciones:**
- N:1 con `productos`
- N:1 con `aplicaciones` (opcional)

**Tipos de movimiento:**
- **Entrada:** Compras, ajustes positivos
- **Salida por Aplicación:** Aplicaciones, ajustes negativos
- **Salida Otros:** Salidas no relacionadas con aplicaciones
- **Ajuste:** Correcciones de inventario

---

## 4. Cosechas y Despachos

### 📍 `cosechas`
Registro de cosechas por lote/sublote.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `fecha_cosecha` | `date` | Fecha de cosecha | NOT NULL |
| `lote_id` | `uuid` | Lote cosechado | NOT NULL, FK → lotes(id) |
| `sublote_id` | `uuid` | Sublote cosechado | FK → sublotes(id) |
| `kilos_cosechados` | `numeric` | Kilos cosechados | NOT NULL, CHECK > 0 |
| `numero_canastillas` | `integer` | Número de canastillas | |
| `responsables` | `text` | Responsables de cosecha | |
| `observaciones` | `text` | Observaciones | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

**Relaciones:**
- N:1 con `lotes`
- N:1 con `sublotes` (opcional)
- 1:N con `despachos_trazabilidad`
- 1:N con `preselecciones`

---

### 📍 `clientes`
Catálogo de clientes.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `nombre` | `text` | Nombre del cliente | NOT NULL, UNIQUE |
| `nit` | `text` | NIT o identificación | |
| `telefono` | `text` | Teléfono | |
| `email` | `text` | Email | |
| `direccion` | `text` | Dirección | |
| `activo` | `boolean` | Si está activo | DEFAULT true |

**Relaciones:**
- 1:N con `despachos`

---

### 📍 `despachos`
Registro de despachos a clientes.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `fecha_despacho` | `date` | Fecha de despacho | NOT NULL |
| `cliente_id` | `uuid` | Cliente destino | NOT NULL, FK → clientes(id) |
| `kilos_despachados` | `numeric` | Kilos despachados | NOT NULL, CHECK > 0 |
| `precio_por_kilo` | `numeric` | Precio por kilo | NOT NULL, CHECK > 0 |
| `valor_total` | `numeric` | Valor total | GENERATED: kilos * precio |
| `numero_factura` | `text` | Número de factura | |
| `numero_guia` | `text` | Número de guía transporte | |
| `responsable` | `text` | Responsable despacho | |
| `observaciones` | `text` | Observaciones | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

**Relaciones:**
- N:1 con `clientes`
- 1:N con `despachos_trazabilidad`

---

### 📍 `despachos_trazabilidad`
Trazabilidad: asociación despacho-cosecha.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `despacho_id` | `uuid` | Referencia al despacho | NOT NULL, FK → despachos(id) |
| `cosecha_id` | `uuid` | Referencia a cosecha | NOT NULL, FK → cosechas(id) |
| `kilos_de_esta_cosecha` | `numeric` | Kilos de esta cosecha | NOT NULL, CHECK > 0 |

**Permite trazabilidad completa:** De lote → cosecha → despacho → cliente

---

### 📍 `preselecciones`
Clasificación de cosechas en sanos/descarte.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `fecha_preseleccion` | `date` | Fecha de clasificación | NOT NULL |
| `cosecha_id` | `uuid` | Referencia a cosecha | FK → cosechas(id) |
| `kilos_clasificados` | `numeric` | Total clasificado | NOT NULL |
| `kilos_sanos` | `numeric` | Kilos sanos | NOT NULL |
| `kilos_descarte` | `numeric` | Kilos descarte | NOT NULL |
| `porcentaje_sanos` | `numeric` | % sanos | GENERATED: (sanos/total)*100 |
| `porcentaje_descarte` | `numeric` | % descarte | GENERATED: (descarte/total)*100 |
| `responsable` | `text` | Responsable clasificación | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

---

## 5. Monitoreo y Control

### 📍 `plagas_enfermedades_catalogo`
Catálogo de plagas y enfermedades.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `nombre` | `text` | Nombre de la plaga/enfermedad | NOT NULL, UNIQUE |
| `tipo` | `text` | Tipo (plaga, enfermedad, etc.) | |
| `descripcion` | `text` | Descripción | |
| `link_info` | `text` | URL información | |
| `activo` | `boolean` | Si está activo | DEFAULT true |

**Relaciones:**
- 1:N con `monitoreos`

---

### 📍 `monitoreos`
Registro de monitoreos fitosanitarios.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `fecha_monitoreo` | `date` | Fecha del monitoreo | NOT NULL |
| `lote_id` | `uuid` | Lote monitoreado | NOT NULL, FK → lotes(id) |
| `sublote_id` | `uuid` | Sublote monitoreado | FK → sublotes(id) |
| `plaga_enfermedad_id` | `uuid` | Plaga/enfermedad | NOT NULL, FK → plagas_enfermedades_catalogo(id) |
| `arboles_monitoreados` | `integer` | Árboles monitoreados | NOT NULL, CHECK > 0 |
| `arboles_afectados` | `integer` | Árboles afectados | NOT NULL, CHECK >= 0 |
| `individuos_encontrados` | `integer` | Individuos encontrados | NOT NULL, CHECK >= 0 |
| `incidencia` | `numeric` | Incidencia % | GENERATED: (afectados/monitoreados)*100 |
| `severidad` | `numeric` | Severidad | GENERATED: individuos/afectados |
| `gravedad_texto` | `gravedad_texto` | Nivel gravedad texto | (ENUM) |
| `gravedad_numerica` | `integer` | Nivel gravedad 1-3 | CHECK IN (1,2,3) |
| `observaciones` | `text` | Observaciones | |
| `monitor` | `text` | Persona que monitorea | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

**Relaciones:**
- N:1 con `lotes`
- N:1 con `sublotes` (opcional)
- N:1 con `plagas_enfermedades_catalogo`

---

### 📍 `focos`
Aplicaciones focalizadas (spot treatments).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `aplicacion_id` | `uuid` | Aplicación relacionada | FK → aplicaciones(id) |
| `fecha_aplicacion` | `date` | Fecha de aplicación | NOT NULL |
| `lote_id` | `uuid` | Lote del foco | NOT NULL, FK → lotes(id) |
| `sublote_id` | `uuid` | Sublote del foco | FK → sublotes(id) |
| `blanco_biologico` | `text` | Objetivo del foco | |
| `numero_focos` | `integer` | Número de focos | |
| `numero_bombas_30l` | `integer` | Bombas de 30L usadas | |
| `costo_insumos` | `numeric` | Costo insumos | |
| `jornales` | `numeric` | Jornales usados | |
| `costo_mano_obra` | `numeric` | Costo mano de obra | |
| `costo_total` | `numeric` | Costo total | GENERATED: insumos + mano_obra |
| `observaciones` | `text` | Observaciones | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

**Relaciones:**
- N:1 con `aplicaciones` (opcional)
- N:1 con `lotes`
- N:1 con `sublotes` (opcional)
- 1:N con `focos_productos`

---

### 📍 `focos_productos`
Productos usados en focos.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `foco_id` | `uuid` | Referencia al foco | NOT NULL, FK → focos(id) |
| `producto_id` | `uuid` | Producto usado | NOT NULL, FK → productos(id) |
| `dosis_por_bomba` | `numeric` | Dosis por bomba | |
| `costo_producto` | `numeric` | Costo del producto | |

---

## 6. Verificaciones de Inventario

### 📍 `verificaciones_inventario`
Proceso de verificación física de inventario.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `fecha_inicio` | `date` | Fecha inicio verificación | NOT NULL |
| `fecha_fin` | `date` | Fecha fin verificación | |
| `estado` | `estado_verificacion` | Estado del proceso | DEFAULT 'En proceso' (ENUM) |
| `usuario_verificador` | `text` | Usuario verificador | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `fecha_completada` | `timestamptz` | Fecha completada | |
| `fecha_revision` | `timestamptz` | Fecha revisión | |
| `revisada_por` | `text` | Revisado por | |
| `observaciones_generales` | `text` | Observaciones | |
| `motivo_rechazo` | `text` | Motivo de rechazo | |
| `updated_at` | `timestamptz` | Fecha actualización | DEFAULT now() |

**Relaciones:**
- 1:N con `verificaciones_detalle`

**Estados:**
- **En proceso:** Verificación en curso
- **Completada:** Finalizada por verificador
- **Pendiente Aprobación:** Revisada pero no aprobada
- **Aprobada:** Aprobada y ajustes aplicados
- **Rechazada:** Rechazada por supervisor

---

### 📍 `verificaciones_detalle`
Detalle de cada producto verificado.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `verificacion_id` | `uuid` | Referencia a verificación | NOT NULL, FK → verificaciones_inventario(id) |
| `producto_id` | `uuid` | Producto verificado | NOT NULL, FK → productos(id) |
| `cantidad_teorica` | `numeric` | Cantidad en sistema | |
| `cantidad_fisica` | `numeric` | Cantidad física contada | |
| `diferencia` | `numeric` | Diferencia | |
| `porcentaje_diferencia` | `numeric` | % diferencia | |
| `valor_diferencia` | `numeric` | Valor monetario diferencia | |
| `estado_diferencia` | `text` | Estado diferencia | |
| `observaciones` | `text` | Observaciones | |
| `ajuste_realizado` | `boolean` | Si se ajustó inventario | DEFAULT false |
| `contado` | `boolean` | Si fue contado físicamente | DEFAULT false |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `updated_at` | `timestamptz` | Fecha actualización | DEFAULT now() |
| `aprobado` | `boolean` | Si fue aprobado | DEFAULT false |

---

## 7. Auditoría y Usuarios

### 📍 `usuarios`
Perfiles de usuarios del sistema.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | ID de auth.users | NOT NULL, PK, FK → auth.users(id) |
| `email` | `text` | Email del usuario | NOT NULL, UNIQUE |
| `nombre_completo` | `text` | Nombre completo | |
| `rol` | `rol_usuario` | Rol del usuario | NOT NULL (ENUM) |
| `activo` | `boolean` | Si está activo | DEFAULT true |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `last_login` | `timestamptz` | Último login | |

**Relaciones:**
- 1:1 con `auth.users`

**Roles:**
- **Administrador:** Acceso completo
- **Verificador:** Realizar verificaciones de inventario
- **Gerencia:** Autorizar aplicaciones y ajustes

---

### 📍 `logs_auditoria`
Log de auditoría de operaciones.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT uuid_generate_v4() |
| `usuario_id` | `uuid` | Usuario que realizó acción | FK → auth.users(id) |
| `tabla` | `text` | Tabla afectada | NOT NULL |
| `accion` | `text` | Tipo de acción | NOT NULL, CHECK IN ('INSERT','UPDATE','DELETE') |
| `registro_id` | `uuid` | ID del registro afectado | |
| `datos_antiguos` | `jsonb` | Datos antes del cambio | |
| `datos_nuevos` | `jsonb` | Datos después del cambio | |
| `timestamp` | `timestamptz` | Momento de la acción | DEFAULT now() |

---

### 📍 `kv_store_1ccce916`
Almacenamiento key-value (posiblemente para caché o configuración).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `key` | `text` | Clave | NOT NULL, PK |
| `value` | `jsonb` | Valor en JSON | NOT NULL |

---

## 📊 Diagrama de Relaciones

```
┌─────────────┐
│   LOTES     │───┐
└─────────────┘   │
       │          │
       │ 1:N      │
       ▼          │
┌─────────────┐   │
│  SUBLOTES   │   │
└─────────────┘   │
                  │
┌─────────────┐   │
│  PRODUCTOS  │   │
└─────────────┘   │
       │          │
       │          │
       ├──────────┼───────────┬──────────┐
       │          │           │          │
       │ N:1      │ N:1       │ N:1      │ N:1
       ▼          ▼           ▼          ▼
┌─────────────┐ ┌──────────────────┐ ┌──────────┐ ┌──────────────┐
│   COMPRAS   │ │ APLICACIONES     │ │ COSECHAS │ │ MONITOREOS   │
└─────────────┘ └──────────────────┘ └──────────┘ └──────────────┘
                       │                   │
                       │ 1:N               │ 1:N
                       ▼                   ▼
              ┌──────────────────┐  ┌──────────────────┐
              │ APLIC_LOTES      │  │ DESPACHOS        │
              │ APLIC_MEZCLAS    │  │ DESPACHOS_TRAZ   │
              │ APLIC_PRODUCTOS  │  │ PRESELECCIONES   │
              │ APLIC_CALCULOS   │  └──────────────────┘
              │ APLIC_COMPRAS    │
              │ APLIC_CIERRE     │
              └──────────────────┘
                       │
                       │ 1:1
                       ▼
              ┌──────────────────┐
              │ APLIC_LOTES_REAL │
              │ APLIC_PROD_REAL  │
              └──────────────────┘

┌─────────────────────────┐
│ VERIFICACIONES_INV      │
└─────────────────────────┘
              │
              │ 1:N
              ▼
┌─────────────────────────┐
│ VERIFICACIONES_DETALLE  │
└─────────────────────────┘

┌─────────────┐
│   USUARIOS  │───► LOGS_AUDITORIA
└─────────────┘
```

---

## 🔑 Índices y Constraints

### Primary Keys
Todas las tablas usan `uuid` como PK con generación automática:
```sql
id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY
```

### Foreign Keys Importantes

**Aplicaciones:**
- `aplicaciones_lotes.aplicacion_id` → `aplicaciones.id`
- `aplicaciones_lotes.lote_id` → `lotes.id`
- `aplicaciones_mezclas.aplicacion_id` → `aplicaciones.id`
- `aplicaciones_productos.mezcla_id` → `aplicaciones_mezclas.id`
- `aplicaciones_productos.producto_id` → `productos.id`
- `aplicaciones_cierre.aplicacion_id` → `aplicaciones.id` (UNIQUE)

**Inventario:**
- `compras.producto_id` → `productos.id`
- `movimientos_inventario.producto_id` → `productos.id`
- `movimientos_inventario.aplicacion_id` → `aplicaciones.id`

**Cosechas:**
- `cosechas.lote_id` → `lotes.id`
- `despachos_trazabilidad.despacho_id` → `despachos.id`
- `despachos_trazabilidad.cosecha_id` → `cosechas.id`

### Unique Constraints
- `lotes.nombre` UNIQUE
- `productos.nombre` UNIQUE
- `clientes.nombre` UNIQUE
- `usuarios.email` UNIQUE
- `plagas_enfermedades_catalogo.nombre` UNIQUE
- `aplicaciones.codigo_aplicacion` UNIQUE
- `aplicaciones_cierre.aplicacion_id` UNIQUE

### Check Constraints
- Cantidades > 0 en compras, cosechas, despachos
- `gravedad_numerica` IN (1, 2, 3)
- `accion` IN ('INSERT', 'UPDATE', 'DELETE')
- `numero_mezcla` > 0

---

## 📝 Notas de Implementación

### 1. Campos Calculados (GENERATED)

Algunos campos se calculan automáticamente:

```sql
-- Lotes
total_arboles = arboles_grandes + arboles_medianos + arboles_pequenos + arboles_clonales

-- Monitoreos
incidencia = (arboles_afectados / arboles_monitoreados) * 100
severidad = individuos_encontrados / arboles_afectados

-- Preselecciones
porcentaje_sanos = (kilos_sanos / kilos_clasificados) * 100
porcentaje_descarte = (kilos_descarte / kilos_clasificados) * 100

-- Aplicaciones Lotes Real
jornales_total = jornales_aplicacion + jornales_mezcla + jornales_transporte
costo_total = costo_insumos + costo_mano_obra

-- Despachos
valor_total = kilos_despachados * precio_por_kilo

-- Focos
costo_total = costo_insumos + costo_mano_obra
```

### 2. Triggers Recomendados

#### Actualizar `updated_at`
```sql
CREATE TRIGGER update_updated_at
BEFORE UPDATE ON productos
FOR EACH ROW EXECUTE FUNCTION update_modified_column();
```

#### Crear movimiento de inventario en compras
```sql
CREATE TRIGGER crear_movimiento_compra
AFTER INSERT ON compras
FOR EACH ROW EXECUTE FUNCTION registrar_entrada_inventario();
```

#### Actualizar cantidad_actual de productos
```sql
CREATE TRIGGER actualizar_stock_producto
AFTER INSERT ON movimientos_inventario
FOR EACH ROW EXECUTE FUNCTION actualizar_cantidad_producto();
```

#### Log de auditoría
```sql
CREATE TRIGGER audit_aplicaciones
AFTER INSERT OR UPDATE OR DELETE ON aplicaciones
FOR EACH ROW EXECUTE FUNCTION audit_table_changes();
```

### 3. Políticas RLS (Row Level Security)

**Para usuarios autenticados:**
```sql
-- Lectura: Todos pueden leer
CREATE POLICY "read_all" ON productos FOR SELECT TO authenticated USING (true);

-- Escritura: Solo Administradores y Agrónomos
CREATE POLICY "write_admin" ON aplicaciones FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
    AND usuarios.rol IN ('Administrador', 'Agronomo')
  )
);
```

### 4. Vistas Útiles

#### Vista de inventario con alertas
```sql
CREATE VIEW v_inventario_alertas AS
SELECT
  p.id,
  p.nombre,
  p.categoria,
  p.cantidad_actual,
  p.stock_minimo,
  p.estado,
  CASE
    WHEN p.cantidad_actual = 0 THEN 'Agotado'
    WHEN p.cantidad_actual <= p.stock_minimo THEN 'Bajo Stock'
    ELSE 'OK'
  END AS alerta
FROM productos p
WHERE p.activo = true;
```

#### Vista de aplicaciones con totales
```sql
CREATE VIEW v_aplicaciones_resumen AS
SELECT
  a.id,
  a.codigo_aplicacion,
  a.nombre_aplicacion,
  a.tipo_aplicacion,
  a.estado,
  COUNT(DISTINCT al.lote_id) as num_lotes,
  SUM(ac.total_arboles) as total_arboles,
  SUM(ac.litros_mezcla) as total_litros,
  SUM(alr.costo_total) as costo_total_real
FROM aplicaciones a
LEFT JOIN aplicaciones_lotes al ON a.id = al.aplicacion_id
LEFT JOIN aplicaciones_calculos ac ON a.id = ac.aplicacion_id
LEFT JOIN aplicaciones_cierre ci ON a.id = ci.aplicacion_id
LEFT JOIN aplicaciones_lotes_real alr ON ci.id = alr.cierre_id
GROUP BY a.id;
```

### 5. Flujo de Trabajo de Aplicaciones

```
1. Crear aplicación (estado='Calculada')
   ├─ aplicaciones
   ├─ aplicaciones_lotes
   ├─ aplicaciones_mezclas
   ├─ aplicaciones_mezclas_productos
   ├─ aplicaciones_productos
   ├─ aplicaciones_calculos
   ├─ aplicaciones_compras
   └─ aplicaciones_productos_planificado

2. Iniciar ejecución (estado='En ejecución')
   └─ UPDATE aplicaciones SET estado='En ejecución'

3. Cerrar aplicación (estado='Cerrada')
   ├─ aplicaciones_cierre
   ├─ aplicaciones_lotes_real
   ├─ aplicaciones_productos_real
   └─ movimientos_inventario (salidas)
```

### 6. Trazabilidad Completa

**De aplicación a costo:**
```sql
aplicaciones
  → aplicaciones_cierre
  → aplicaciones_lotes_real (jornales, costos)
  → aplicaciones_productos_real (productos usados)
  → movimientos_inventario (salidas de bodega)
```

**De cosecha a cliente:**
```sql
lotes
  → cosechas
  → despachos_trazabilidad
  → despachos
  → clientes
```

---

## 🔄 Mantenimiento del Documento

### Cuándo Actualizar
- Al agregar nuevas tablas
- Al modificar tipos de datos
- Al agregar/eliminar columnas
- Al cambiar relaciones
- Al agregar nuevos ENUMs

### Formato de Actualización
```markdown
**Fecha:** YYYY-MM-DD
**Cambio:** Descripción del cambio
**Tablas afectadas:** lista de tablas
**Razón:** Motivo del cambio
```

### Historial de Cambios

| Fecha | Cambio | Responsable |
|-------|--------|-------------|
| 2025-11-12 | Creación inicial del documento | Sistema |
| 2025-11-13 | Agregada tabla `movimientos_diarios` | Sistema |
| 2025-11-13 | Agregadas columnas `costo_por_arbol` y `arboles_jornal` a tabla `aplicaciones` para métricas de eficiencia | Sistema |
| 2025-11-13 | Reestructuración de sistema de movimientos diarios: modificada tabla `movimientos_diarios` (agregado `numero_canecas`, eliminadas columnas de productos individuales) y creada tabla `movimientos_diarios_productos` para evitar duplicación de conteo de canecas | Sistema |

---

## 📚 Referencias

- [Documentación Supabase](https://supabase.com/docs)
- [SUPABASE_CONFIG.md](/src/SUPABASE_CONFIG.md) - Configuración inicial
- [SUPABASE_INTEGRATION.md](/src/components/aplicaciones/SUPABASE_INTEGRATION.md) - Integración aplicaciones