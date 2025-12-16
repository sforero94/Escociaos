# Plan de Implementación: Módulo de Flujos Financieros

**Fecha:** 16 de diciembre de 2025
**Estado:** En desarrollo
**Branch:** `claude/financial-flows-module-CbVZI`

---

## Resumen del Módulo

El módulo de Flujos Financieros permitirá el registro, seguimiento y análisis de ingresos y gastos de 7 unidades de negocio en 7 regiones geográficas. Acceso exclusivo para rol **Gerencia**.

---

## Fases de Implementación

### FASE 1: Estructura Base y Navegación
**Objetivo:** Configurar la navegación, rutas y estructura de carpetas del módulo.

#### Tareas:

1. **Crear estructura de carpetas**
   ```
   src/components/finanzas/
   ├── FinanzasDashboard.tsx      # Dashboard principal con KPIs
   ├── GastosView.tsx             # Vista de gastos (lista + formulario)
   ├── IngresosView.tsx           # Vista de ingresos (lista + formulario)
   ├── ReportesView.tsx           # P&G y reportes
   ├── ConfiguracionFinanzas.tsx  # Gestión de catálogos
   ├── components/                # Subcomponentes
   │   ├── GastoForm.tsx          # Formulario de gastos
   │   ├── IngresoForm.tsx        # Formulario de ingresos
   │   ├── GastosList.tsx         # Lista de gastos
   │   ├── IngresosList.tsx       # Lista de ingresos
   │   ├── KPICards.tsx           # Tarjetas de KPIs
   │   ├── GraficoTendencias.tsx  # Gráfico líneas ingresos vs gastos
   │   ├── GraficoDistribucion.tsx # Pie chart gastos por categoría
   │   ├── PyGReport.tsx          # Componente P&G
   │   └── FiltrosGlobales.tsx    # Filtros de período/negocio/región
   └── hooks/
       └── useFinanzasData.ts     # Hook para cargar datos financieros
   ```

2. **Crear tipos TypeScript** (`src/types/finanzas.ts`)
   - Interfaces para: Negocio, Region, MedioPago, CategoriaGasto, ConceptoGasto, Proveedor, Gasto
   - Interfaces para: CategoriaIngreso, Comprador, Ingreso
   - Types para filtros y estados

3. **Modificar Layout.tsx**
   - Agregar item "Finanzas" en `menuStructure`
   - Icono: `DollarSign` o `Wallet` de lucide-react
   - Path: `/finanzas`
   - Condicionar visibilidad solo para rol "Gerencia"

4. **Configurar rutas en App.tsx**
   ```tsx
   <Route path="finanzas">
     <Route index element={<FinanzasDashboard />} />
     <Route path="gastos" element={<GastosView />} />
     <Route path="ingresos" element={<IngresosView />} />
     <Route path="reportes" element={<ReportesView />} />
     <Route path="configuracion" element={<ConfiguracionFinanzas />} />
   </Route>
   ```

5. **Crear componente RoleGuard** (si no existe funcional)
   - Wrapper que verifica rol antes de renderizar
   - Redirige o muestra mensaje si no tiene permisos

---

### FASE 2: Dashboard Principal con KPIs
**Objetivo:** Crear el dashboard financiero con métricas principales.

#### Tareas:

1. **Crear FinanzasDashboard.tsx**
   - Layout con grid responsive
   - 4 tarjetas KPI superiores:
     - Ingresos del Período (verde)
     - Gastos del Período (rojo)
     - Flujo Neto (azul/verde según positivo/negativo)
     - Margen % (porcentaje)
   - Filtros globales (período, negocio, región)
   - Sección de gráficos

2. **Crear KPICards.tsx**
   - Componente reutilizable para tarjetas de métricas
   - Props: título, valor, icono, color, tendencia (opcional)
   - Formato de moneda COP usando `formatNumber` existente

3. **Crear FiltrosGlobales.tsx**
   - Select de período: Mes actual, Trimestre, YTD, Año anterior, Rango personalizado
   - Select de negocio: Todos + 7 negocios
   - Select de región: Todas + 7 regiones
   - Date pickers para rango personalizado

4. **Crear GraficoTendencias.tsx**
   - LineChart con Recharts (ya disponible en proyecto)
   - Línea verde: Ingresos
   - Línea roja: Gastos
   - Eje X: Meses
   - Tooltip con valores formateados

5. **Crear GraficoDistribucion.tsx**
   - PieChart con Recharts
   - Distribución de gastos por categoría
   - Leyenda con porcentajes

6. **Crear hook useFinanzasData.ts**
   - Cargar KPIs desde Supabase
   - Funciones para:
     - `getKPIs(filtros)` - Totales de ingresos/gastos
     - `getTendencias(filtros)` - Datos para gráfico de líneas
     - `getDistribucion(filtros)` - Datos para pie chart
   - Manejo de estados loading/error

---

### FASE 3: Módulo de Gastos
**Objetivo:** CRUD completo de gastos con formulario y lista.

#### Tareas:

1. **Crear GastosView.tsx**
   - Layout con tabs o toggle: Lista / Nuevo Gasto
   - Subnavegación interna
   - Estado para gestionar vista activa

2. **Crear GastosList.tsx**
   - Tabla de gastos con columnas:
     - Fecha, Negocio, Región, Categoría, Concepto, Nombre, Valor, Estado
   - Filtros: búsqueda, categoría, negocio, región, estado
   - Acciones: Ver, Editar, Eliminar
   - Paginación o infinite scroll
   - Badge de estado (Confirmado/Pendiente)
   - Destacar gastos pendientes de compras

3. **Crear GastoForm.tsx (Dialog)**
   - Campos según documento de diseño:
     - Fecha (DatePicker, default=hoy)
     - Negocio (Select)
     - Región (Select)
     - Categoría (Select con 15 opciones)
     - Concepto (Select dinámico según categoría)
     - Nombre del gasto (Input texto)
     - Proveedor (Combobox con opción crear nuevo)
     - Valor (Input numérico con formato moneda)
     - Medio de pago (Select)
     - Observaciones (Textarea opcional)
   - Validaciones:
     - Campos requeridos: fecha, negocio, región, categoría, concepto, valor, medio_pago
     - Valor > 0
   - Modo crear/editar según props

4. **Implementar carga dinámica de conceptos**
   - Al seleccionar categoría, filtrar conceptos
   - Query: `fin_conceptos_gastos WHERE categoria_id = X`

5. **Implementar Combobox de proveedores**
   - Búsqueda en lista existente
   - Opción "Crear nuevo proveedor"
   - Modal rápido para crear proveedor inline

6. **Funciones CRUD en Supabase**
   - `createGasto(data)`
   - `updateGasto(id, data)`
   - `deleteGasto(id)`
   - `getGastos(filtros)`
   - `confirmarGasto(id)` - Cambiar estado Pendiente → Confirmado

---

### FASE 4: Módulo de Ingresos
**Objetivo:** CRUD completo de ingresos con formulario y lista.

#### Tareas:

1. **Crear IngresosView.tsx**
   - Similar a GastosView
   - Tabs: Lista / Nuevo Ingreso

2. **Crear IngresosList.tsx**
   - Tabla de ingresos con columnas:
     - Fecha, Negocio, Región, Categoría, Nombre, Comprador, Valor, Medio de Pago
   - Filtros similares a gastos
   - Acciones: Ver, Editar, Eliminar

3. **Crear IngresoForm.tsx (Dialog)**
   - Campos:
     - Fecha (DatePicker)
     - Negocio (Select) - **Importante: al cambiar, actualiza categorías**
     - Región (Select)
     - Categoría (Select dinámico según negocio)
     - Nombre del ingreso (Input texto)
     - Comprador (Combobox con crear nuevo)
     - Valor (Input numérico)
     - Medio de pago (Select)
     - Observaciones (Textarea)

4. **Implementar carga dinámica de categorías de ingreso**
   - Al seleccionar negocio, filtrar categorías
   - Query: `fin_categorias_ingresos WHERE negocio_id = X`

5. **Funciones CRUD en Supabase**
   - `createIngreso(data)`
   - `updateIngreso(id, data)`
   - `deleteIngreso(id)`
   - `getIngresos(filtros)`

---

### FASE 5: Reportes y P&G
**Objetivo:** Implementar reportes financieros con comparativos.

#### Tareas:

1. **Crear ReportesView.tsx**
   - Tabs: P&G | Flujo de Caja
   - Filtros de período y comparativo
   - Botones de exportación

2. **Crear PyGReport.tsx**
   - Estructura jerárquica:
     ```
     INGRESOS
     ├── [Por negocio]
     │   └── [Por categoría]
     └── TOTAL INGRESOS

     GASTOS
     ├── [Por categoría]
     │   └── [Detalle opcional]
     └── TOTAL GASTOS

     UTILIDAD OPERATIVA
     ```
   - Columnas: Concepto, Período Actual, Período Comparativo, Variación %, Variación $

3. **Implementar comparativos**
   - YoY: Mismo período año anterior
   - Trimestre anterior
   - YTD vs mismo período año anterior
   - Mes anterior

4. **Crear utilidades de exportación**
   - `generarPDFPyG.ts` - Usando jsPDF (ya en proyecto)
   - `generarExcelPyG.ts` - Usando librería de Excel
   - Formato profesional con logo y fecha

---

### FASE 6: Configuración de Catálogos
**Objetivo:** Permitir gestión de proveedores, compradores y medios de pago.

#### Tareas:

1. **Crear ConfiguracionFinanzas.tsx**
   - Tabs: Proveedores | Compradores | Medios de Pago
   - CRUD para cada catálogo

2. **Crear ProveedoresConfig.tsx**
   - Lista de proveedores
   - Crear/Editar: nombre, NIT (opcional), teléfono (opcional)
   - Activar/Desactivar

3. **Crear CompradoresConfig.tsx**
   - Similar a proveedores

4. **Crear MediosPagoConfig.tsx**
   - Lista de medios de pago
   - Solo Gerencia puede agregar nuevos

---

### FASE 7: Integración con Módulo de Inventario (Compras → Gastos)
**Objetivo:** Integrar compras del inventario como gastos pendientes.

#### Tareas:

1. **Verificar trigger existente en Supabase**
   - Confirmar que `trigger_compra_a_gasto` existe
   - Si no existe, documentar SQL para crearlo

2. **Crear vista de Gastos Pendientes**
   - Filtro especial en GastosList para estado='Pendiente'
   - Destacar visualmente gastos de compras
   - Acción "Completar y Confirmar"

3. **Crear CompletarGastoDialog.tsx**
   - Para gastos pendientes de compras
   - Permite asignar: negocio, región, categoría, concepto
   - Campos prellenados: fecha, valor, nombre (de la compra)
   - Botón "Confirmar Gasto"

4. **Notificación en Dashboard**
   - Mostrar contador de "Gastos Pendientes por Confirmar"
   - Link directo a la lista filtrada

---

### FASE 8: Pruebas y Ajustes Finales
**Objetivo:** Validar funcionamiento completo y corregir bugs.

#### Tareas:

1. **Pruebas de integración**
   - Flujo completo: crear gasto → ver en lista → editar → eliminar
   - Flujo completo: crear ingreso → ver en dashboard → reportes
   - Filtros funcionan correctamente
   - KPIs calculan bien

2. **Pruebas de permisos**
   - Usuario Gerencia puede acceder
   - Usuario Administrador NO puede acceder
   - Menú se oculta para roles sin permiso

3. **Pruebas de rendimiento**
   - Dashboard carga en < 2 segundos
   - Listas con > 100 registros funcionan bien
   - Exportación PDF/Excel funciona

4. **Validación con datos reales**
   - Cargar datos de prueba representativos
   - Verificar cálculos de P&G
   - Validar comparativos temporales

5. **Ajustes de UX**
   - Mensajes de error claros
   - Estados de loading apropiados
   - Confirmaciones antes de eliminar
   - Toasts de éxito/error

---

## Dependencias entre Fases

```
FASE 1 ──────────────────────────────────────────────────────────────►
         │
         ▼
FASE 2 (Dashboard) ─────────────────────────────────────────────────►
         │
         ├───────────────────┬───────────────────┐
         ▼                   ▼                   ▼
FASE 3 (Gastos)      FASE 4 (Ingresos)   FASE 6 (Config)
         │                   │
         └─────────┬─────────┘
                   ▼
            FASE 5 (Reportes)
                   │
                   ▼
         FASE 7 (Integración)
                   │
                   ▼
         FASE 8 (Pruebas)
```

---

## Archivos a Crear/Modificar

### Archivos Nuevos (17 archivos):
```
src/types/finanzas.ts
src/components/finanzas/FinanzasDashboard.tsx
src/components/finanzas/GastosView.tsx
src/components/finanzas/IngresosView.tsx
src/components/finanzas/ReportesView.tsx
src/components/finanzas/ConfiguracionFinanzas.tsx
src/components/finanzas/components/GastoForm.tsx
src/components/finanzas/components/IngresoForm.tsx
src/components/finanzas/components/GastosList.tsx
src/components/finanzas/components/IngresosList.tsx
src/components/finanzas/components/KPICards.tsx
src/components/finanzas/components/GraficoTendencias.tsx
src/components/finanzas/components/GraficoDistribucion.tsx
src/components/finanzas/components/PyGReport.tsx
src/components/finanzas/components/FiltrosGlobales.tsx
src/components/finanzas/hooks/useFinanzasData.ts
src/utils/generarPDFPyG.ts
```

### Archivos a Modificar (2 archivos):
```
src/components/Layout.tsx     # Agregar item Finanzas en menú
src/App.tsx                   # Agregar rutas de finanzas
```

---

## Tablas de Supabase Requeridas

Ya creadas según el documento:
- `fin_negocios` - Catálogo de negocios
- `fin_regiones` - Catálogo de regiones
- `fin_medios_pago` - Catálogo de medios de pago
- `fin_categorias_gastos` - 15 categorías de gastos
- `fin_conceptos_gastos` - 100+ conceptos por categoría
- `fin_proveedores` - Proveedores
- `fin_gastos` - Tabla principal de gastos
- `fin_categorias_ingresos` - Categorías por negocio
- `fin_compradores` - Compradores
- `fin_ingresos` - Tabla principal de ingresos

---

## Notas de Implementación

1. **Patrones a seguir:**
   - Formularios: Seguir patrón de `CrearEditarTareaDialog.tsx`
   - Listas: Seguir patrón de `AplicacionesList.tsx`
   - Dashboard: Seguir patrón de `Dashboard.tsx` y `MovementsDashboard.tsx`
   - Hooks: Seguir patrón de queries con `getSupabase()`

2. **Componentes UI a reutilizar:**
   - Dialog/AlertDialog de Radix UI
   - Select, Input, Textarea de `src/components/ui/`
   - Button, Card, Badge
   - Toasts con Sonner

3. **Utilidades existentes:**
   - `formatNumber()` de `src/utils/format.ts` para COP
   - `formatearFechaCorta()` de `src/utils/fechas.ts`
   - `getSupabase()` de `src/utils/supabase/client.ts`

4. **Colores del sistema:**
   - Verde primario: `#73991C`
   - Verde secundario: `#BFD97D`
   - Fondo: `#F8FAF5`
   - Texto oscuro: `#172E08`
   - Error/Rojo: `#DC3545`

---

## Siguiente Paso

**Comenzar con FASE 1:**
1. Crear archivo de tipos `src/types/finanzas.ts`
2. Crear estructura de carpetas
3. Modificar Layout.tsx para agregar navegación
4. Configurar rutas en App.tsx
5. Crear componentes placeholder

---

*Plan generado el 16 de diciembre de 2025*
