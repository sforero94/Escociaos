# 📋 PLAN DE REFINAMIENTO - MÓDULO DE MONITOREO
**Escosia Hass - Sistema de Gestión Integral**

---

## 🎯 OBJETIVO
Refinar el módulo de monitoreo de plagas para garantizar funcionalidad completa, visualización correcta de datos y experiencia de usuario óptima.

---

## 🐛 PROBLEMAS IDENTIFICADOS

### 1. **Vistas del Dashboard No Cambian**
- **Problema**: Los botones "Dashboard" y "Todos" no alternan entre vistas
- **Ubicación**: `MonitoreoDashboard.tsx` líneas 330-370
- **Causa**: La variable `vistaActual` cambia pero no hay renderizado condicional completo
- **Impacto**: Alto - Navegación principal del módulo no funciona

### 2. **KPIs Superiores Sin Datos**
- **Problema**: Las 4 métricas superiores (Último Monitoreo, Registros, Críticos, Incidencia) muestran valores incorrectos o vacíos
- **Ubicación**: `MonitoreoDashboard.tsx` líneas 75-163
- **Causa Potencial**: 
  - Query limitado a 7 días (línea 81)
  - No hay refresh después de cargar CSV
  - Cálculos incorrectos de métricas
- **Impacto**: Alto - Información clave no disponible

### 3. **Vista "Todos" Muestra Solo Observaciones**
- **Problema**: La tabla en vista "Todos" solo muestra columna de observaciones
- **Ubicación**: `TablaMonitoreos.tsx`
- **Causa**: Renderizado incompleto de columnas en la tabla
- **Impacto**: Medio - Datos disponibles pero no visibles

### 4. **Datos Posteriores al 16-Oct No Visibles**
- **Problema**: Gráficos y vistas no muestran datos después del 16 de octubre
- **Ubicación**: 
  - `GraficoTendencias.tsx`
  - `MonitoreoDashboard.tsx` líneas 81-94
- **Causa**: Filtro de fechas hardcodeado o límite de 7 días
- **Impacto**: Crítico - Datos recientes no visibles

### 5. **Botones de Tabla Inactivos**
- **Problema**: Botones "PLAGA", "SUBLOTES", "INC. PROM", "MÁX", "TENDENCIA" no hacen nada
- **Ubicación**: `TablaMonitoreos.tsx` (header de tabla)
- **Causa**: Botones no implementados o sin handlers
- **Impacto**: Medio - Funcionalidad de ordenamiento faltante

---

## 📐 ARQUITECTURA ACTUAL

```
MonitoreoDashboard.tsx (componente raíz)
├── KPIs (4 métricas)
│   ├── Último Monitoreo
│   ├── Registros (7 días)  
│   ├── Críticos
│   └── Incidencia Promedio
├── Insights Automáticos
│   └── Cards con alertas y recomendaciones
├── Top 5 Plagas (tabla resumen)
├── Botones de Vista
│   ├── Dashboard (vista principal)
│   ├── Todos (tabla completa)
│   ├── Tendencias (gráfico temporal)
│   ├── Vistas Rápidas
│   └── Catálogo de Plagas
└── Contenido Dinámico (según vistaActual)
    ├── GraficoTendencias.tsx
    ├── TablaMonitoreos.tsx
    ├── VistasRapidas.tsx
    ├── CatalogoPlagas.tsx
    └── CargaCSV.tsx
```

---

## 🔧 PLAN DE TRABAJO DETALLADO

### **FASE 1: Corrección de Vistas y Navegación** ⏱️ 15 min

#### Tarea 1.1: Implementar Renderizado Condicional Completo
- **Archivo**: `MonitoreoDashboard.tsx`
- **Líneas**: 318-500
- **Acciones**:
  1. Crear secciones claras para cada vista
  2. Renderizar contenido según `vistaActual`
  3. Mantener KPIs e Insights visibles solo en vista "Dashboard"
  4. Mostrar tabla completa en vista "Todos"
  5. Agregar transiciones suaves entre vistas

#### Tarea 1.2: Mejorar Botones de Navegación
- **Archivo**: `MonitoreoDashboard.tsx`
- **Líneas**: 330-370
- **Acciones**:
  1. Agregar botones faltantes (Tendencias, Vistas, Catálogo, Cargar)
  2. Mejorar estilos visuales (activo/inactivo)
  3. Agregar iconos descriptivos
  4. Responsive: dropdown en móvil

---

### **FASE 2: Corrección de KPIs y Métricas** ⏱️ 20 min

#### Tarea 2.1: Eliminar Límite de 7 Días
- **Archivo**: `MonitoreoDashboard.tsx`
- **Líneas**: 75-108
- **Acciones**:
  1. Modificar query para traer TODOS los monitoreos (no solo 7 días)
  2. Agregar selector de rango de fechas (última semana, último mes, último trimestre, todo)
  3. Actualizar cálculos de métricas con rangos dinámicos

#### Tarea 2.2: Recalcular KPIs Correctamente
- **Archivo**: `MonitoreoDashboard.tsx`
- **Líneas**: 114-163
- **Acciones**:
  1. Verificar que `incidencia` y `severidad` se lean como columnas generadas
  2. Calcular última fecha real (no limitada a 7 días)
  3. Calcular registros totales vs. registros en rango
  4. Calcular críticos correctamente (gravedad_texto === 'Alta')
  5. Calcular incidencia promedio global

#### Tarea 2.3: Agregar Auto-Refresh Después de CSV
- **Archivo**: `MonitoreoDashboard.tsx`
- **Acciones**:
  1. Escuchar evento de carga CSV exitosa
  2. Llamar a `cargarDatosDashboard()` después de inserción
  3. Mostrar toast de confirmación

---

### **FASE 3: Corrección de Tabla "Todos"** ⏱️ 15 min

#### Tarea 3.1: Completar Columnas de Tabla
- **Archivo**: `TablaMonitoreos.tsx`
- **Líneas**: 100-300
- **Acciones**:
  1. Verificar que se renderizan TODAS las columnas:
     - Fecha
     - Lote
     - Sublote
     - Plaga/Enfermedad
     - Árboles Monitoreados
     - Árboles Afectados
     - Individuos
     - Incidencia (%)
     - Severidad
     - Gravedad
     - Monitor
     - Observaciones
  2. Agregar formato condicional (colores según gravedad)
  3. Agregar tooltip para observaciones largas

#### Tarea 3.2: Implementar Botones de Header
- **Archivo**: `TablaMonitoreos.tsx`
- **Acciones**:
  1. Crear handlers de ordenamiento:
     - `ordenarPorPlaga()` - alfabético
     - `ordenarPorSublotes()` - alfabético
     - `ordenarPorIncidencia()` - numérico descendente
     - `ordenarPorMaximo()` - por incidencia máxima
     - `ordenarPorTendencia()` - por tendencia (subiendo primero)
  2. Agregar indicador visual de columna ordenada
  3. Toggle ascendente/descendente

---

### **FASE 4: Corrección de Rango de Fechas** ⏱️ 10 min

#### Tarea 4.1: Quitar Límites de Fecha Hardcodeados
- **Archivos**: 
  - `MonitoreoDashboard.tsx` líneas 81-94
  - `GraficoTendencias.tsx`
- **Acciones**:
  1. Eliminar filtros `.gte()` y `.lte()` del query base
  2. Aplicar filtros SOLO cuando el usuario seleccione un rango
  3. Por defecto mostrar TODOS los datos

#### Tarea 4.2: Agregar Selector de Rango Dinámico
- **Archivo**: `MonitoreoDashboard.tsx`
- **Acciones**:
  1. Agregar selector de rango:
     - "Última Semana"
     - "Último Mes"
     - "Último Trimestre"
     - "Todo" (default)
  2. Actualizar KPIs según rango seleccionado
  3. Actualizar gráficos según rango

---

### **FASE 5: Mejoras UX y Visualización** ⏱️ 20 min

#### Tarea 5.1: Mejorar Gráfico de Tendencias
- **Archivo**: `GraficoTendencias.tsx`
- **Acciones**:
  1. Verificar que muestre datos completos (no limitados)
  2. Agregar zoom y pan
  3. Agregar tooltip detallado
  4. Agregar leyenda interactiva
  5. Agregar selector de agrupación (diario, semanal, mensual)

#### Tarea 5.2: Mejorar Top 5 Plagas
- **Archivo**: `MonitoreoDashboard.tsx`
- **Líneas**: 236-273
- **Acciones**:
  1. Agregar badge de tendencia visible
  2. Hacer cards clickeables (filtrar por plaga)
  3. Agregar mini-gráfico sparkline
  4. Mostrar última fecha de monitoreo

#### Tarea 5.3: Mejorar Insights Automáticos
- **Archivo**: `MonitoreoDashboard.tsx`
- **Líneas**: 169-230
- **Acciones**:
  1. Agregar más insights relevantes:
     - Sublote con mayor incidencia
     - Plagas que aumentaron esta semana
     - Recomendaciones de tratamiento
  2. Hacer insights clickeables (aplicar filtros)
  3. Agregar dismiss button

---

### **FASE 6: Testing y Validación** ⏱️ 15 min

#### Tarea 6.1: Testing de Funcionalidad
- **Checklist**:
  - [ ] Botones de vista cambian contenido correctamente
  - [ ] KPIs muestran valores correctos
  - [ ] Tabla muestra todas las columnas
  - [ ] Datos posteriores al 16-Oct son visibles
  - [ ] Botones de ordenamiento funcionan
  - [ ] Filtros en tabla funcionan
  - [ ] Gráficos muestran datos completos
  - [ ] Auto-refresh después de CSV funciona
  - [ ] Responsive en móvil

#### Tarea 6.2: Validación de Datos
- **Checklist**:
  - [ ] Incidencia calculada correctamente por PostgreSQL
  - [ ] Severidad calculada correctamente por PostgreSQL
  - [ ] Gravedad asignada correctamente (Baja/Media/Alta)
  - [ ] Fechas parseadas correctamente
  - [ ] Relaciones con lotes/sublotes/plagas correctas

#### Tarea 6.3: Testing de Edge Cases
- **Checklist**:
  - [ ] Sin datos: muestra mensaje apropiado
  - [ ] Un solo registro: no rompe cálculos
  - [ ] Datos con valores null: manejo correcto
  - [ ] Fechas futuras: validación
  - [ ] Paginación con muchos registros

---

## 🎨 MEJORAS VISUALES ADICIONALES

### Mejora A: Cards de KPI Mejorados
- Agregar mini-gráfico sparkline en cada KPI
- Agregar comparación con período anterior
- Animación de counter al cargar

### Mejora B: Tabla Interactiva
- Hover row highlight
- Sticky header al hacer scroll
- Export a CSV/Excel
- Selección múltiple para acciones batch

### Mejora C: Filtros Avanzados
- Panel lateral de filtros
- Multi-select de plagas
- Multi-select de lotes/sublotes
- Rango de incidencia (slider)
- Guardar filtros como "Vista Rápida"

---

## 📊 PRIORIZACIÓN

### **PRIORIDAD CRÍTICA** (Hacer YA)
1. ✅ Corrección de rango de fechas (FASE 4)
2. ✅ Corrección de tabla "Todos" (FASE 3.1)
3. ✅ Corrección de KPIs (FASE 2)
4. ✅ Navegación de vistas (FASE 1.1)

### **PRIORIDAD ALTA** (Esta sesión)
5. Implementar botones de ordenamiento (FASE 3.2)
6. Mejorar gráfico de tendencias (FASE 5.1)
7. Auto-refresh después de CSV (FASE 2.3)

### **PRIORIDAD MEDIA** (Siguiente sesión)
8. Selector de rango dinámico (FASE 4.2)
9. Mejorar Top 5 Plagas (FASE 5.2)
10. Mejorar Insights (FASE 5.3)

### **PRIORIDAD BAJA** (Futuro)
11. Mejoras visuales avanzadas (MEJORAS A-C)
12. Export a Excel
13. Filtros guardados como vistas

---

## 🚀 ORDEN DE EJECUCIÓN RECOMENDADO

```
1. FASE 4 (Fechas) → Desbloquea visualización de todos los datos
2. FASE 2 (KPIs) → Muestra métricas correctas
3. FASE 3.1 (Tabla) → Muestra datos completos
4. FASE 1.1 (Vistas) → Navegación funcional
5. FASE 3.2 (Ordenamiento) → Interactividad de tabla
6. FASE 2.3 (Auto-refresh) → UX mejorada
7. FASE 5 (Mejoras UX) → Polish final
8. FASE 6 (Testing) → Validación
```

---

## ✅ CRITERIOS DE ÉXITO

### Funcionalidad
- ✅ Todas las vistas navegables
- ✅ KPIs muestran valores correctos
- ✅ Tabla muestra todas las columnas
- ✅ Datos completos visibles (incluyendo Nov 7)
- ✅ Ordenamiento funciona
- ✅ Filtros funcionan

### UX
- ✅ Navegación intuitiva
- ✅ Feedback visual inmediato
- ✅ Loading states apropiados
- ✅ Mensajes de error claros
- ✅ Responsive en móvil

### Rendimiento
- ✅ Carga inicial < 2 segundos
- ✅ Cambio de vista instantáneo
- ✅ Tabla con paginación eficiente
- ✅ Gráficos responsive

### Certificación GlobalGAP
- ✅ Trazabilidad completa
- ✅ Todos los campos visibles
- ✅ Fechas correctas
- ✅ Relaciones lote/sublote/plaga claras

---

## 🛠️ STACK TÉCNICO

- **Frontend**: React + TypeScript
- **Base de Datos**: Supabase PostgreSQL
- **Gráficos**: Recharts
- **UI**: Shadcn/ui + Tailwind
- **Paleta**: 
  - Primary: `#73991C`
  - Secondary: `#BFD97D`
  - Background: `#F8FAF5`
  - Dark: `#172E08`, `#4D240F`

---

## 📝 NOTAS IMPORTANTES

1. **Columnas Generadas**: `incidencia` y `severidad` son GENERATED en PostgreSQL, NO insertar valores
2. **Relaciones**: Join con `lotes`, `sublotes`, `plagas_enfermedades_catalogo`
3. **Archivo de Referencia**: `/supabase_tablas.md` líneas 765-800
4. **Template CSV**: Botón de descarga con columnas exactas
5. **Mobile-First**: Diseño responsive obligatorio

---

**Última actualización**: 19 Nov 2024
**Estado**: Plan aprobado - Listo para ejecución
