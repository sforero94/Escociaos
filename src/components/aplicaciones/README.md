# Módulo de Aplicaciones Fitosanitarias - Escocia Hass

## 📋 Descripción General

Módulo completo para gestionar aplicaciones fitosanitarias (fumigaciones y fertilizaciones) en el cultivo de aguacate Hass, con calculadora automática de productos, dosis y lista de compras.

## 📁 Estructura de Archivos

```
/components/aplicaciones/
├── AplicacionesList.tsx          ← Lista principal de aplicaciones
├── CalculadoraAplicaciones.tsx   ← Wizard de 3 pasos
├── PasoConfiguracion.tsx         ← TODO: Paso 1 (Configuración)
├── PasoMezcla.tsx                ← TODO: Paso 2 (Mezcla de productos)
├── PasoListaCompras.tsx          ← TODO: Paso 3 (Lista de compras)
└── README.md                     ← Este archivo

/types/
└── aplicaciones.ts               ← Tipos TypeScript completos

/utils/
└── calculosAplicaciones.ts       ← ✅ Funciones de cálculo
```

## 🎯 Funcionalidades Principales

### **1. Lista de Aplicaciones (`AplicacionesList.tsx`)**
- ✅ Visualización de todas las aplicaciones (fumigación y fertilización)
- ✅ Estadísticas por estado (planificada, en ejecución, cerrada)
- ✅ Filtros por tipo, estado y búsqueda
- ✅ Navegación a calculadora y detalles
- ⏳ Carga de datos desde Supabase (pendiente)

### **2. Calculadora de Aplicaciones (`CalculadoraAplicaciones.tsx`)**
Wizard de 3 pasos con stepper visual y validaciones:

#### **Paso 1: Configuración**
- Nombre de la aplicación
- Tipo: Fumigación o Fertilización
- Fecha de inicio
- Propósito / observaciones
- Agrónomo responsable
- Selección de lotes y sublotes
- **Validaciones:**
  - ✅ Nombre obligatorio
  - ✅ Tipo obligatorio
  - ✅ Fecha obligatoria
  - ✅ Al menos 1 lote seleccionado

#### **Paso 2: Mezcla de Productos**
- Crear una o más mezclas
- Seleccionar productos del inventario
- Configurar dosis según tipo:
  - **Fumigación:** cc/gramos por caneca de 200L
  - **Fertilización:** kilos por árbol (grandes, medianos, pequeños, clonales)
- Cálculo automático de cantidades totales
- **Validaciones:**
  - ✅ Al menos 1 mezcla creada
  - ✅ Cada mezcla debe tener productos
  - ✅ Todos los productos deben tener dosis configuradas

#### **Paso 3: Lista de Compras**
- Comparación con inventario disponible
- Identificación de productos faltantes
- Cálculo de costo estimado
- Alertas de productos sin precio o sin stock
- **Puede avanzar siempre** (aunque falten productos)

## 📊 Tipos de Datos

### **Tipos de Aplicación**
```typescript
type TipoAplicacion = 'fumigacion' | 'fertilizacion';
type EstadoAplicacion = 'planificada' | 'en_ejecucion' | 'cerrada';
```

### **Configuración (Paso 1)**
```typescript
interface ConfiguracionAplicacion {
  nombre: string;
  tipo: TipoAplicacion;
  fecha_inicio: string;
  proposito?: string;
  agronomo_responsable?: string;
  lotes_seleccionados: LoteSeleccionado[];
}
```

### **Mezcla (Paso 2)**
```typescript
interface Mezcla {
  id: string;
  nombre: string;
  productos: ProductoEnMezcla[];
}

interface ProductoEnMezcla {
  producto_id: string;
  producto_nombre: string;
  
  // Fumigación
  dosis_por_caneca?: number;
  unidad_dosis?: 'cc' | 'gramos';
  
  // Fertilización
  dosis_grandes?: number;
  dosis_medianos?: number;
  dosis_pequenos?: number;
  dosis_clonales?: number;
  
  cantidad_total_necesaria: number;
}
```

### **Lista de Compras (Paso 3)**
```typescript
interface ItemListaCompras {
  producto_id: string;
  producto_nombre: string;
  inventario_actual: number;
  cantidad_necesaria: number;
  cantidad_faltante: number;
  unidades_a_comprar: number;
  costo_estimado?: number;
  alerta?: 'sin_precio' | 'sin_stock' | 'normal';
}
```

## 🎨 Diseño

### **Paleta de Colores**
- **Primary:** `#73991C` (verde aguacate)
- **Secondary:** `#BFD97D` (verde claro)
- **Background:** `#F8FAF5` (beige claro)
- **Dark:** `#172E08` (verde oscuro)
- **Brown:** `#4D240F` (café)

### **Estados del Wizard**
| Estado | Color | Icono |
|--------|-------|-------|
| Planificada | Azul (`blue-100`) | Clock |
| En Ejecución | Verde (`green-100`) | Play |
| Cerrada | Gris (`gray-100`) | CheckCircle2 |

### **Stepper Visual**
- **Desktop:** Stepper horizontal con círculos grandes (64px)
- **Mobile:** Breadcrumbs con barras de progreso
- **Paso activo:** Gradiente verde con escala 110%
- **Paso completado:** Verde sólido con checkmark
- **Paso pendiente:** Gris claro

## 🛣️ Rutas

```tsx
/aplicaciones                    → AplicacionesList
/aplicaciones/calculadora        → CalculadoraAplicaciones
/aplicaciones/:id                → Detalle (pendiente)
```

## 🔄 Flujo de Uso

1. Usuario navega a `/aplicaciones`
2. Ve lista con estadísticas y filtros
3. Click en "Nueva Aplicación" → `/aplicaciones/calculadora`
4. **Paso 1:** Configura tipo, lotes y fecha
5. **Paso 2:** Crea mezclas con productos y dosis
6. **Paso 3:** Revisa inventario y lista de compras
7. Click en "Guardar y Finalizar"
8. Sistema guarda en Supabase y redirige a lista

## ✅ Validaciones por Paso

| Paso | Validación | Mensaje de Error |
|------|------------|------------------|
| 1 | Nombre vacío | "Debes ingresar un nombre para la aplicación" |
| 1 | Sin tipo | "Debes seleccionar un tipo de aplicación" |
| 1 | Sin fecha | "Debes seleccionar una fecha de inicio" |
| 1 | Sin lotes | "Debes seleccionar al menos un lote" |
| 2 | Sin mezclas | "Debes crear al menos una mezcla" |
| 2 | Mezcla sin productos | "Todas las mezclas deben tener al menos un producto" |
| 2 | Producto sin dosis | "Todos los productos deben tener dosis configuradas" |
| 3 | Ninguna | Siempre puede avanzar |

## 📦 Integración con Supabase

### **Tabla: `aplicaciones`**
```sql
-- TODO: Crear tabla en Supabase
CREATE TABLE aplicaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('fumigacion', 'fertilizacion')),
  fecha_inicio DATE NOT NULL,
  fecha_cierre DATE,
  estado TEXT NOT NULL CHECK (estado IN ('planificada', 'en_ejecucion', 'cerrada')),
  proposito TEXT,
  agronomo_responsable TEXT,
  configuracion JSONB NOT NULL,
  mezclas JSONB NOT NULL,
  calculos JSONB NOT NULL,
  lista_compras JSONB NOT NULL,
  creado_en TIMESTAMP DEFAULT NOW(),
  creado_por TEXT,
  actualizado_en TIMESTAMP DEFAULT NOW()
);
```

## 🧮 Funciones de Cálculo (`/utils/calculosAplicaciones.ts`)

### **Cálculos de Fumigación**
```typescript
calcularFumigacion(lote, mezcla) → CalculosPorLote
```
**Fórmulas:**
1. `Litros de mezcla = # árboles × calibración (L/árbol)`
2. `# canecas = Litros de mezcla ÷ Tamaño caneca`
3. `Cantidad producto = (# canecas × dosis cc/gramos) ÷ 1000`

**Ejemplo:**
- Lote: 500 árboles
- Calibración: 5 L/árbol
- Caneca: 200L
- Producto X: 250cc/caneca

**Resultado:**
- Litros de mezcla: `500 × 5 = 2,500 L`
- Canecas: `2,500 ÷ 200 = 12.5 canecas`
- Producto X: `(12.5 × 250) ÷ 1000 = 3.125 L`

### **Cálculos de Fertilización**
```typescript
calcularFertilizacion(lote, mezcla) → CalculosPorLote
```
**Fórmulas:**
1. `Kilos por tipo = # árboles × dosis (kg/árbol)`
2. `Kilos totales = Σ(kilos de cada tipo)`
3. `Bultos = Kilos totales ÷ 25kg`

**Ejemplo:**
- Lote: 200 grandes, 150 medianos, 100 pequeños, 50 clonales
- Fertilizante: 2kg/grande, 1.5kg/mediano, 1kg/pequeño, 0.5kg/clonal

**Resultado:**
- Grandes: `200 × 2 = 400 kg`
- Medianos: `150 × 1.5 = 225 kg`
- Pequeños: `100 × 1 = 100 kg`
- Clonales: `50 × 0.5 = 25 kg`
- **Total: 750 kg (30 bultos de 25kg)**

### **Calcular Totales**
```typescript
calcularTotalesProductos(calculos, mezclas) → ProductoEnMezcla[]
```
Suma las cantidades necesarias de cada producto en todos los lotes.

### **Generar Lista de Compras**
```typescript
generarListaCompras(productosNecesarios, inventario) → ListaCompras
```
**Fórmula:**
- `Cantidad faltante = Max(0, Necesario - Disponible)`
- `Unidades a comprar = Ceil(Faltante ÷ Tamaño presentación)`
- `Costo estimado = Unidades × Tamaño × Precio unitario`

**Alertas:**
- `sin_precio`: Producto sin precio registrado
- `sin_stock`: Inventario actual = 0
- `normal`: Todo OK

### **Funciones de Formato**
```typescript
formatearMoneda(valor) → "$1.234.567"
formatearNumero(valor, decimales) → "1.234,56"
```

### **Funciones de Validación**
```typescript
validarLoteFumigacion(lote) → string | null
validarProductoFumigacion(producto) → string | null
validarProductoFertilizacion(producto) → string | null
```

## 🚀 Próximos Pasos (TODO)

### **Componentes Pendientes**
- [ ] `PasoConfiguracion.tsx` - Formulario completo de configuración
  - [ ] Selector de tipo con radio buttons
  - [ ] Selector de lotes con checkboxes
  - [ ] Selector de sublotes por lote
  - [ ] Inputs de calibración (fumigación)
  - [ ] Resumen automático de área y árboles

- [ ] `PasoMezcla.tsx` - Creador de mezclas
  - [ ] Crear/editar/eliminar mezclas
  - [ ] Buscador de productos del inventario
  - [ ] Inputs de dosis según tipo de aplicación
  - [ ] Cálculo automático de cantidades
  - [ ] Tabla resumen por mezcla

- [ ] `PasoListaCompras.tsx` - Comparador de inventario
  - [ ] Tabla de productos necesarios vs disponibles
  - [ ] Indicadores visuales de faltantes
  - [ ] Cálculo de costo total
  - [ ] Botón de exportar a PDF
  - [ ] Alertas de productos críticos

### **Funcionalidades Backend**
- [ ] Guardar aplicación en Supabase
- [ ] Cargar aplicaciones existentes
- [ ] Actualizar estado de aplicaciones
- [ ] Integrar con módulo de inventario
- [ ] Calcular consumo real vs planificado
- [ ] Generar reportes de trazabilidad GlobalGAP

### **Mejoras UX**
- [ ] Auto-guardado del wizard
- [ ] Recuperar sesión si se cierra el navegador
- [ ] Duplicar aplicaciones existentes
- [ ] Templates de mezclas frecuentes
- [ ] Historial de cambios

## 📱 Responsive Design

- **Desktop (≥1024px):** Stepper horizontal, 2 columnas en formularios
- **Tablet (768-1023px):** Stepper horizontal compacto, 1-2 columnas
- **Mobile (<768px):** Breadcrumbs, 1 columna, inputs full-width

## 🔐 Permisos

| Rol | Lista | Crear | Editar | Eliminar |
|-----|-------|-------|--------|----------|
| Gerencia | ✅ | ✅ | ✅ | ✅ |
| Administrador | ✅ | ✅ | ✅ | ❌ |
| Verificador | ✅ | ❌ | ❌ | ❌ |

## 📚 Referencias

- [Tipos TypeScript](/types/aplicaciones.ts)
- [Componente Principal](/components/aplicaciones/CalculadoraAplicaciones.tsx)
- [Lista de Aplicaciones](/components/aplicaciones/AplicacionesList.tsx)