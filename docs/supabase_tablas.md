# 📊 SUPABASE - ESQUEMA DE TABLAS
## Sistema de Gestión Escocia Hass

**Última actualización:** 2025-11-13
**Versión:** 1.1
**Propósito:** Referencia histórica del esquema de base de datos

> **Estado de mantenimiento (2026-07-22):** pendiente de actualización integral. Para cambios de esquema, RLS o migraciones, las fuentes de verdad son `src/sql/migrations/`, los tipos y las consultas actuales. Esta referencia no cubre varios dominios creados después de 2025 y puede listar tablas retiradas.

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
   - [Hato Lechero](#8-hato-lechero)
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
| `numero_canecas` | `numeric` | Número total de canecas aplicadas (fumigación/drench) | CHECK >= 0 |
| `numero_bultos` | `numeric` | Número total de bultos usados (fertilización) | CHECK >= 0 |
| `equipo_aplicacion` | `text` | Equipo usado para la aplicación | CHECK IN ('Bomba espalda', 'Bomba estacionaria', 'Fumiducto') |
| `personal` | `text` | Personal que participó en la aplicación | |
| `hora_inicio` | `time` | Hora de inicio de la aplicación | DEFAULT '07:20:00' |
| `hora_fin` | `time` | Hora de finalización de la aplicación | DEFAULT '15:50:00' |
| `responsable` | `text` | Responsable del movimiento | NOT NULL |
| `condiciones_meteorologicas` | `text` | Condiciones del clima durante aplicación | CHECK IN ('soleadas', 'nubladas', 'lluvia suave', 'lluvia fuerte') |
| `notas` | `text` | Observaciones | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que registró | FK → auth.users(id) |

**Relaciones:**
- N:1 con `aplicaciones`
- N:1 con `lotes`
- 1:N con `movimientos_diarios_productos` (detalle de productos utilizados)

**Propósito:**
Los movimientos diarios son registros **provisionales** durante la ejecución de aplicaciones que:
- Registran el número de canecas aplicadas (fumigación/drench) o bultos usados (fertilización) por día en cada lote
- Los productos utilizados en cada movimiento se registran en la tabla relacionada `movimientos_diarios_productos`
- Mantienen trazabilidad para GlobalGAP sin afectar inventario inmediatamente
- Permiten comparar lo planificado vs lo realmente utilizado
- Se revisan al cerrar la aplicación antes de crear los movimientos definitivos de inventario

**Notas importantes:**
- Para fumigación y drench: se usa `numero_canecas` (NULL para fertilización)
- Para fertilización: se usa `numero_bultos` (NULL para fumigación/drench)
- Los productos individuales se registran en `movimientos_diarios_productos` con sus unidades apropiadas (cc/L/g/Kg)

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

## 8. Hato Lechero

> Añadido 2026-07-22 (S1 del módulo Hato Lechero, migraciones `053`–`060` de
> `src/sql/migrations/`; ver `docs/plan_hato_lechero_module.md` §7.1–7.2 y el
> brief técnico de la sesión). Estas 15 tablas + 2 vistas son posteriores al
> conteo de "32 tablas" de la Visión General (§ arriba) — ese conteo no se
> actualizó, ver la nota de estado de mantenimiento al inicio del documento.
> Prefijo `hato_` (dominio propio, distinto de `gan_*` — ver
> `docs/plan_hato_lechero_module.md` §5 "Relación con el módulo Ganado
> existente").
>
> **Diseño en tres capas:** capa cruda (`hato_chequeo_vacas`, columnas
> `*_raw`) → capa de eventos append-only (`hato_eventos`) → capa derivada
> (vista `v_hato_estado_actual`, solo hechos, sin constantes de negocio ni
> clasificación de estado — esa lógica vive en `calculosHato.ts`, sesión S2).
> Todos los umbrales/ventanas/periodos de secado por raza se leen de
> `hato_config` en tiempo de ejecución — nunca hardcodeados.
>
> **RLS:** patrón 044 en todas las tablas salvo `hato_config`
> (Gerencia-only en escritura, vía `es_usuario_gerencia()`) — SELECT para
> cualquier `authenticated`, escritura para Administrador + Gerencia.
> `hato_alertas`/`hato_alertas_config` además reciben escritura del cron/bot
> vía `service_role`, que bypasea RLS (no lleva política propia — ver
> comentario en la migración 056).

### 📍 `hato_toros`
Catálogo editable de toros/sementales — fuente única del progenitor para genealogía (`hato_animales.padre_toro_id`), eventos de servicio (`hato_eventos.toro_id`) y pajillas (`hato_pajillas.toro_id`).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `nombre` | `text` | Nombre del toro | NOT NULL |
| `tipo` | `text` | Modo de servicio | CHECK IN ('monta','inseminacion') |
| `raza` | `text` | Raza del toro | |
| `activo` | `boolean` | Si sigue en uso | NOT NULL, DEFAULT true |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que lo creó | FK → auth.users(id) |

**Índices:** UNIQUE case-insensitive sobre `lower(nombre)` (`hato_toros_nombre_unique`).

---

### 📍 `hato_animales`
Ficha por animal, para siempre — `numero` es la chapeta permanente y nunca se recicla (ningún animal se elimina).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `numero` | `integer` | Chapeta permanente | UNIQUE, nullable |
| `nombre` | `text` | Nombre del animal | |
| `sexo` | `text` | Sexo | CHECK IN ('hembra','macho'), DEFAULT 'hembra' |
| `etapa` | `text` | Etapa productiva | NOT NULL, CHECK IN ('ternera','novilla','vaca','toro') |
| `raza` | `text` | Raza (FK lógica al catálogo de `hato_config`) | |
| `estado` | `text` | Estado de ciclo de vida | NOT NULL, DEFAULT 'activa', CHECK IN ('activa','vendida','muerta','descartada') |
| `fecha_estado` | `date` | Fecha del último cambio de estado | |
| `fecha_nacimiento` | `date` | Fecha de nacimiento (nunca inventada) | |
| `fecha_nacimiento_confianza` | `text` | Confianza del dato de nacimiento | NOT NULL, DEFAULT 'desconocida', CHECK IN ('exacta','aproximada','desconocida') |
| `madre_id` | `uuid` | Madre (self-FK) | FK → hato_animales(id) |
| `padre_toro_id` | `uuid` | Padre desde el catálogo de toros | FK → hato_toros(id) |
| `padre_id` | `uuid` | Padre, si es un animal propio del hato | FK → hato_animales(id) |
| `finca_id` | `uuid` | Finca (reutiliza el catálogo de Ganado) | FK → gan_fincas(id) |
| `origen` | `text` | Origen del registro | CHECK IN ('nacimiento','compra','importacion_historica') |
| `confianza` | `text` | Confianza del registro (importación) | NOT NULL, DEFAULT 'alta', CHECK IN ('alta','media','baja') |
| `import_meta` | `jsonb` | Metadatos de importación | |
| `notas` | `text` | Notas libres | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que lo creó | FK → auth.users(id) |

**Relaciones:**
- 1:N con `hato_chequeo_vacas`, `hato_eventos`, `hato_pesajes_leche`, `hato_tratamientos`, `hato_pajillas_uso`
- N:1 con `hato_toros` (padre_toro_id), `gan_fincas` (finca_id)

**Índices:** `(estado, etapa)`, `(madre_id)`.

---

### 📍 `hato_chequeos`
Cabecera de ronda del chequeo veterinario bimestral (patrón `rondas_monitoreo`).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `fecha` | `date` | Fecha del chequeo | NOT NULL |
| `veterinario` | `text` | Veterinario a cargo | |
| `estado` | `text` | Estado de la ronda | NOT NULL, DEFAULT 'borrador', CHECK IN ('borrador','cerrado') |
| `fuente` | `text` | Origen del registro | NOT NULL, DEFAULT 'web', CHECK IN ('web','importacion') |
| `sheet_ref` | `text` | Referencia a la hoja de Excel origen | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que lo creó | FK → auth.users(id) |

**Relaciones:** 1:N con `hato_chequeo_vacas`, `hato_tratamientos`.

---

### 📍 `hato_chequeo_vacas`
Una fila por vaca por chequeo. Capa cruda (`*_raw`, preserva la planilla verbatim) + capa normalizada (nullable).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `chequeo_id` | `uuid` | Chequeo al que pertenece | NOT NULL, FK → hato_chequeos(id) ON DELETE CASCADE |
| `animal_id` | `uuid` | Animal | NOT NULL, FK → hato_animales(id) |
| `pl_raw`, `np_raw`, `ultima_cria_raw`, `sx_raw`, `fecha_servicio_raw`, `toro_raw`, `tp_raw`, `estado_raw`, `secar_raw`, `pp_raw`, `ttto_raw` | `text` | Valores textuales verbatim de la planilla | nullable |
| `pl` | `numeric` | PL normalizado | nullable |
| `num_partos` | `integer` | Número de partos normalizado | nullable |
| `fecha_servicio` | `date` | Fecha de servicio normalizada | nullable |
| `toro` | `text` | Toro (texto, capa normalizada) | nullable |
| `tipo_servicio` | `text` | Tipo de servicio | CHECK IN ('monta','inseminacion') |
| `meses_prenez` | `numeric` | Meses de preñez | nullable |
| `fecha_secar` | `date` | Fecha de secado calculada (por `calculosHato.ts`) | nullable |
| `fecha_probable_parto` | `date` | Fecha probable de parto calculada | nullable |
| `normalizacion_issues` | `jsonb` | Problemas de normalización detectados | nullable |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

**Constraints:** UNIQUE (chequeo_id, animal_id).
**Índices:** `(animal_id)`.

---

### 📍 `hato_eventos`
Log append-only del ciclo reproductivo/de vida — la fuente de verdad. Un ciclo puede tener varios `servicio` encadenados (uno que no cuaja, seguido de `celo` y un re-servicio); todos quedan en el log.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `animal_id` | `uuid` | Animal | NOT NULL, FK → hato_animales(id) |
| `tipo` | `text` | Tipo de evento | NOT NULL, CHECK IN ('servicio','celo','confirmacion_prenez','parto','aborto','secado_real','venta','muerte','compra','cambio_etapa','rechequeo') |
| `fecha` | `date` | Fecha del evento | NOT NULL |
| `fecha_confianza` | `text` | Confianza de la fecha | NOT NULL, DEFAULT 'exacta', CHECK IN ('exacta','aproximada','desconocida') |
| `toro_id` | `uuid` | Toro (para eventos de servicio) | FK → hato_toros(id) |
| `tipo_servicio` | `text` | Monta o inseminación | CHECK IN ('monta','inseminacion') |
| `cria_id` | `uuid` | Cría (para eventos de parto) | FK → hato_animales(id) |
| `cria_destino` | `text` | Destino de la cría | CHECK IN ('retenida','macho_vendido','hembra_vendida','muerta','aborto') |
| `sx_raw` | `text` | Código SX de origen (importación) | |
| `chequeo_vaca_id` | `uuid` | Procedencia: chequeo que generó el evento | FK → hato_chequeo_vacas(id) |
| `alerta_id` | `uuid` | Procedencia: alerta que generó el evento | FK → hato_alertas(id) ON DELETE SET NULL (back-patch en migración 056) |
| `transaccion_ganado_id` | `uuid` | Vínculo con la transacción de finanzas (venta/muerte) | FK → fin_transacciones_ganado(id) ON DELETE SET NULL |
| `fuente` | `text` | Canal de captura | CHECK IN ('web','telegram','importacion','alerta','chequeo') |
| `datos` | `jsonb` | Datos adicionales del evento | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que lo creó | FK → auth.users(id) |

**Índices:** `(animal_id, fecha)`, `(tipo, fecha)`, parcial `(animal_id, fecha) WHERE tipo='servicio'`.

---

### 📍 `hato_pesajes_leche`
Pesaje semanal por vaca (AM/PM).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `animal_id` | `uuid` | Animal | NOT NULL, FK → hato_animales(id) |
| `fecha` | `date` | Fecha del pesaje | NOT NULL |
| `litros_am` | `numeric` | Litros de la ordeña de la mañana | nullable |
| `litros_pm` | `numeric` | Litros de la ordeña de la tarde | nullable |
| `litros_total` | `numeric` | Suma AM+PM | GENERATED ALWAYS AS (COALESCE(litros_am,0)+COALESCE(litros_pm,0)) STORED |
| `fuente` | `text` | Canal de captura | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que lo creó | FK → auth.users(id) |

**Constraints:** UNIQUE (animal_id, fecha).
**Índices:** `(fecha)`.
**Nota:** vaca no pesada = sin dato (fila ausente), nunca 0 — regla de UI, misma convención del módulo de Monitoreo.

---

### 📍 `hato_produccion_quincenal`
Litros al camión por quincena (ciclo de liquidación del Pomar) — reemplaza el concepto de "litros diarios" del diseño original.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `anio` | `integer` | Año | NOT NULL |
| `mes` | `integer` | Mes | NOT NULL, CHECK BETWEEN 1 AND 12 |
| `quincena` | `integer` | Quincena del mes | NOT NULL, CHECK IN (1,2) |
| `fecha_inicio` | `date` | Fecha de inicio (informativa) | nullable |
| `fecha_fin` | `date` | Fecha de fin (informativa) | nullable |
| `litros_total` | `numeric` | Litros entregados al camión | NOT NULL, CHECK >= 0 |
| `litros_pomar_confirmado` | `numeric` | Litros confirmados por el Pomar | nullable |
| `num_vacas_ordeno` | `integer` | Vacas en ordeño (base de la productividad) | nullable |
| `notas` | `text` | Notas libres | |
| `fuente` | `text` | Canal de captura | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que lo creó | FK → auth.users(id) |

**Constraints:** UNIQUE (anio, mes, quincena) — corregido desde el diseño original `UNIQUE(anio, quincena)`, que solo permitía 2 filas por año.
**Índices:** `(anio, mes)`.
**Nota:** productividad = `litros_total / num_vacas_ordeno` (derivada, nunca almacenada).

---

### 📍 `hato_protocolos`
Catálogo reusable de protocolos de tratamiento (ej. "Estrumate": día 0 aplicar → día 7 servir → día 9 verificar celo).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `nombre` | `text` | Nombre del protocolo | NOT NULL |
| `descripcion` | `text` | Descripción | |
| `pasos_default` | `jsonb` | Array de `{paso_num, offset_dias, descripcion, requiere_confirmacion}` | |
| `activo` | `boolean` | Si está disponible para elegir | NOT NULL, DEFAULT true |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que lo creó | FK → auth.users(id) |

**Índices:** UNIQUE case-insensitive sobre `lower(nombre)` (`hato_protocolos_nombre_unique`).

---

### 📍 `hato_tratamientos`
Prescripción por animal — protocolo elegido o tratamiento libre (nota libre siempre disponible).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `animal_id` | `uuid` | Animal | NOT NULL, FK → hato_animales(id) |
| `chequeo_id` | `uuid` | Ronda que prescribió el tratamiento | FK → hato_chequeos(id) |
| `protocolo_id` | `uuid` | Protocolo aplicado (opcional) | FK → hato_protocolos(id) |
| `nombre` | `text` | Nombre libre del tratamiento | |
| `fecha_inicio` | `date` | Fecha de inicio | NOT NULL |
| `estado` | `text` | Estado del tratamiento | NOT NULL, DEFAULT 'activo', CHECK IN ('activo','completado','cancelado') |
| `nota` | `text` | Nota libre | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que lo creó | FK → auth.users(id) |

**Relaciones:** 1:N con `hato_tratamiento_pasos`.
**Índices:** `(animal_id)`.

---

### 📍 `hato_tratamiento_pasos`
Pasos programados/ejecutados de cada tratamiento — el motor de alertas lee los pendientes (regla `tratamiento_paso`).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `tratamiento_id` | `uuid` | Tratamiento al que pertenece | NOT NULL, FK → hato_tratamientos(id) ON DELETE CASCADE |
| `paso_num` | `integer` | Número de paso | NOT NULL |
| `descripcion` | `text` | Descripción del paso | |
| `offset_dias` | `integer` | Días desde el inicio del tratamiento | NOT NULL, DEFAULT 0 |
| `fecha_programada` | `date` | Fecha en que toca el paso | NOT NULL |
| `fecha_ejecutada` | `date` | Fecha en que se ejecutó (null = pendiente) | nullable |
| `requiere_confirmacion` | `boolean` | Si necesita confirmación por Telegram | NOT NULL, DEFAULT true |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |

**Constraints:** UNIQUE (tratamiento_id, paso_num).
**Índices:** parcial `(fecha_programada) WHERE fecha_ejecutada IS NULL`.

---

### 📍 `hato_alertas`
Cola de tareas salientes por Telegram (secado, tratamientos, servicios sin confirmar, rechequeos, partos próximos).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `tipo` | `text` | Tipo de alerta | NOT NULL, CHECK IN ('secado_due','tratamiento_paso','rechequeo_due','servicio_sin_confirmacion','parto_proximo') |
| `animal_id` | `uuid` | Animal relacionado | FK → hato_animales(id) |
| `regla_clave` | `text` | Clave de idempotencia del motor | NOT NULL, UNIQUE |
| `fecha_programada` | `date` | Fecha en que debe dispararse | NOT NULL |
| `estado` | `text` | Estado de la alerta | NOT NULL, DEFAULT 'pendiente', CHECK IN ('pendiente','enviada','respondida','confirmada','descartada','escalada','expirada') |
| `destinatario_telegram_id` | `text` | Destinatario | nullable |
| `intentos` | `integer` | Número de reintentos | NOT NULL, DEFAULT 0 |
| `respuesta` | `text` | Respuesta recibida | |
| `respondida_por` | `text` | Quién respondió | |
| `paso_id` | `uuid` | Paso de tratamiento relacionado (alertas `tratamiento_paso`) | FK → hato_tratamiento_pasos(id) |
| `datos` | `jsonb` | Datos adicionales | |
| `escalada_at` | `timestamptz` | Momento del escalamiento a Martha | nullable |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `updated_at` | `timestamptz` | Última actualización | DEFAULT now(), trigger `update_updated_at_column()` |
| `created_by` | `uuid` | Usuario que la creó (si es manual) | FK → auth.users(id) |

**Índices:** `(estado)`, `(tipo, fecha_programada)`, `(animal_id)`.
**Nota RLS:** el tick diario y el bot de Telegram escriben con `service_role`, que bypasea RLS — no lleva política propia para ese canal.

---

### 📍 `hato_alertas_config`
Destinatario y horas de escalamiento por tipo de alerta — sembrada con las 5 reglas para que el motor corra sin UI de Ajustes.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `tipo` | `text` | Tipo de alerta | NOT NULL, UNIQUE, CHECK IN (los mismos 5 tipos de `hato_alertas`) |
| `destinatario_telegram_id` | `text` | Destinatario por defecto | nullable |
| `horas_escalamiento` | `integer` | Horas antes de escalar a Martha | NOT NULL, DEFAULT 48 |
| `activo` | `boolean` | Si el tipo de alerta está habilitado | NOT NULL, DEFAULT true |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `updated_at` | `timestamptz` | Última actualización | DEFAULT now(), trigger `update_updated_at_column()` |

---

### 📍 `hato_pajillas`
Inventario de pajillas de inseminación por toro — deliberadamente mínimo, sin proveedor/costo.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `toro_id` | `uuid` | Toro | NOT NULL, FK → hato_toros(id) |
| `cantidad_inicial` | `integer` | Cantidad inicial en inventario | NOT NULL, CHECK >= 0 |
| `activa` | `boolean` | Si sigue en uso | NOT NULL, DEFAULT true |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que la creó | FK → auth.users(id) |

**Relaciones:** 1:N con `hato_pajillas_uso`.
**Índices:** `(toro_id)`.

---

### 📍 `hato_pajillas_uso`
Log de uso de pajillas, append-only. La vaca servida es opcional (mejor registrar el uso sin la vaca que no registrarlo).

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `pajilla_id` | `uuid` | Pajilla usada | NOT NULL, FK → hato_pajillas(id) |
| `fecha_uso` | `date` | Fecha de uso | NOT NULL |
| `animal_id` | `uuid` | Vaca servida (opcional) | FK → hato_animales(id), nullable |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `created_by` | `uuid` | Usuario que lo registró | FK → auth.users(id) |

**Índices:** `(pajilla_id)`.

---

### 📍 `hato_config`
Parámetros configurables clave/valor (jsonb) de las fórmulas del motor de fechas y del motor de alertas — ninguna de estas constantes vive en código.

| Campo | Tipo | Descripción | Constraints |
|-------|------|-------------|-------------|
| `id` | `uuid` | Identificador único | PK, DEFAULT gen_random_uuid() |
| `clave` | `text` | Nombre del parámetro | NOT NULL, UNIQUE |
| `valor` | `jsonb` | Valor (escalar, lista o mapa) | NOT NULL |
| `descripcion` | `text` | Descripción del parámetro | |
| `created_at` | `timestamptz` | Fecha creación | DEFAULT now() |
| `updated_at` | `timestamptz` | Última actualización | DEFAULT now(), trigger `update_updated_at_column()` |
| `updated_by` | `uuid` | Usuario que lo editó | FK → auth.users(id) |

**Claves sembradas** (9, `ON CONFLICT (clave) DO NOTHING`): `razas`, `meses_secado_por_raza`, `meses_gestacion_default`, `umbral_partos_reemplazo`, `ventana_proxima_secar_dias`, `ventana_proximo_parir_dias`, `dias_parto_proximo_alerta`, `dias_servicio_sin_confirmacion`, `dias_rechequeo_due`.
**RLS:** SELECT para cualquier `authenticated`; escritura Gerencia-only vía `es_usuario_gerencia()`.

---

### 👁️ Vistas

#### `v_hato_estado_actual`
Una fila por animal en `hato_animales` con los últimos hechos reproductivos (último chequeo, último servicio, último parto, último secado real, última confirmación de preñez, último evento). **Solo hechos** — no calcula `fecha_secar`, no clasifica estado reproductivo ni aplica ningún umbral de `hato_config`; esa lógica vive en `calculosHato.ts` (S2). `security_invoker = true` (nunca `SECURITY DEFINER` — mismo fix que la migración 033 aplicó a las vistas financieras). Definida en la migración `056_create_hato_alertas.sql`.

#### `v_hato_pajillas_stock`
`cantidad_actual = cantidad_inicial - COUNT(usos)` por pajilla — sin tabla de stock materializada. Puede quedar negativa (la UI advierte, no bloquea). `security_invoker = true`. Definida en la migración `057_create_hato_pajillas.sql`.

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
  → movimientos_inventario (salidas)
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
| 2025-11-13 | Actualización documentación tabla `movimientos_diarios`: agregado campo `numero_bultos` para fertilización y campo `condiciones_meteorologicas` ENUM | Sistema |
| 2026-07-22 | Agregada sección "8. Hato Lechero": 15 tablas (`hato_toros`, `hato_animales`, `hato_chequeos`, `hato_chequeo_vacas`, `hato_eventos`, `hato_pesajes_leche`, `hato_produccion_quincenal`, `hato_protocolos`, `hato_tratamientos`, `hato_tratamiento_pasos`, `hato_alertas`, `hato_alertas_config`, `hato_pajillas`, `hato_pajillas_uso`, `hato_config`) y 2 vistas (`v_hato_estado_actual`, `v_hato_pajillas_stock`) — migraciones `053`–`060` (S1 del módulo Hato Lechero) | Backend |

---

## 📚 Referencias

- [Documentación Supabase](https://supabase.com/docs)
- [SUPABASE_CONFIG.md](/src/SUPABASE_CONFIG.md) - Configuración inicial
- [SUPABASE_INTEGRATION.md](/src/components/aplicaciones/SUPABASE_INTEGRATION.md) - Integración aplicaciones