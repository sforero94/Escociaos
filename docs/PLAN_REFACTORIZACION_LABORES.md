# Plan de Refactorización del Módulo de Labores

Este documento detalla el plan técnico para implementar mejoras críticas en la granularidad de datos, usabilidad de la interfaz y precisión de cálculos en el módulo de labores.

## 📋 Resumen de Fases

1.  **Fase 1: Base de Datos y Lógica Backend** (Integridad de Datos)
2.  **Fase 2: Refactorización UI de Registro** (Matriz y Simplificación)
3.  **Fase 3: Estandarización de Costos** (Cálculo Unificado)
4.  **Fase 4: Métricas Estratégicas y Reportes** (Eficiencia Real)

---

## 🛠️ Fase 1: Base de Datos y Lógica Backend

**Objetivo:** Preparar la estructura de datos para soportar el seguimiento granular por lote.

### 1.1 Actualización de Esquema (Granularidad)
*   **Análisis:** Verificar la tabla `registros_trabajo` en Supabase.
*   **Acción:** Asegurar que exista la columna `lote_id` (Foreign Key -> `lotes.id`, nullable).
*   **Propósito:** Permitir que un registro de trabajo esté vinculado específicamente a un lote, no solo a la tarea general. Esto es crucial para tareas que abarcan múltiples lotes pero donde el trabajo diario es específico.

### 1.2 Manejo de "Terceros" (Contratistas) - SIMPLIFICADO
*   **Nueva Estrategia:** Los contratistas se manejan como empleados regulares con tarifa por jornal en el campo `salario`.
*   **Beneficio:** No requiere cambios en la lógica backend ni en la estructura de datos.
*   **Implementación:** Crear empleado "Tercero / Contratista" con tarifa apropiada en el frontend de gestión de empleados.

---

## 🎨 Fase 2: Refactorización UI de Registro (La Matriz)

**Objetivo:** Transformar `RegistrarTrabajoDialog.tsx` para capturar datos precisos con una mejor experiencia de usuario.

### 2.1 Paso 2: Selección de Empleados (Simplificación)
*   **Rediseño de Tarjetas:**
    *   Eliminar cargo y salario de la vista.
    *   Mostrar solo el **Nombre Completo** en un contenedor compacto.
    *   Prevenir desbordamiento de texto (text-overflow: ellipsis).
*   **Integración de Terceros:**
    *   Asegurar que la tarjeta "Tercero / Contratista" sea fácilmente accesible (ej. siempre visible o destacada).
*   **Búsqueda:** Mantener la funcionalidad de filtrado actual pero aplicada al diseño simplificado.

### 2.2 Paso 3: Interfaz de Matriz (Nueva Lógica)
*   **Diseño de Grid Dinámico:** Reemplazar la lista lineal actual.
    *   **Filas:** Empleados seleccionados.
    *   **Columnas:** Lotes asignados a la Tarea (derivados de `tarea.lote_ids`).
*   **Celdas de Input:**
    *   Implementar un dropdown en cada intersección (Empleado x Lote).
    *   **Opciones:** 0 (Vacío), 0.25, 0.5, 0.75, 1.0, 1.5, etc.
*   **Validación:** Verificar que la suma de jornales por empleado sea lógica (warning si > 1.5 o 2.0 en un día).

### 2.3 Lógica de Envío (Submit)
*   **Construcción del Payload:**
    *   Iterar sobre la matriz de datos.
    *   Generar **un registro por cada celda no vacía**.
    *   *Ejemplo:* Si Empleado A trabaja 0.5 en Lote 1 y 0.5 en Lote 2, se crean dos registros en `registros_trabajo`, cada uno con su `lote_id` correspondiente.

---

## 💰 Fase 3: Estandarización de Costos

**Objetivo:** Eliminar discrepancias de cálculo mediante una "Fuente Única de Verdad".

### 3.1 Utilidad Centralizada de Costos
*   Crear `src/utils/laborCosts.ts`.
*   **Función:** `calculateLaborCost(salary, benefits, allowances, weeklyHours, fractionWorked)`.
*   **Fórmula:** `(salary + benefits + allowances) / weeklyHours * 8 * fractionWorked`.
*   **Estándar:** Hardcodear el jornal de **8 horas** para consistencia global.

### 3.2 Actualización de Vistas
*   **Crear/Editar Tarea (`CrearEditarTareaDialog.tsx`):**
    *   Actualizar cálculo de "Costo Estimado" usando la nueva utilidad.
    *   Lógica: `Jornales Estimados * (Costo Hora Responsable * 8)`.
*   **Detalle de Tarea (`TareaDetalleDialog.tsx`):**
    *   Refactorizar `calcularMetricas` para usar la utilidad centralizada.
    *   Asegurar que "Costo Actual" sea la suma directa de `costo_jornal` de la base de datos (que ya habrá sido calculado correctamente al insertar).

---

## 📊 Fase 4: Métricas Estratégicas y Reportes

**Objetivo:** Reflejar la nueva granularidad y métricas de eficiencia real.

### 4.1 Actualización de Queries (`ReportesView.tsx`)
*   **Join Granular:** Modificar la consulta Supabase para obtener `lote_id` directamente de `registros_trabajo`.
*   **Fallback:** Si el registro no tiene lote (datos antiguos), usar el lote principal de la tarea (`tareas.lote_id`).

### 4.2 Nueva Métrica de Eficiencia
*   **Eliminar:** "Costo Promedio por Tarea" (métrica vanidosa/poco útil).
*   **Implementar:** "Indicador de Eficiencia" (Jornales vs. Capacidad).
    *   **Jornales Trabajados:** Suma de `fraccion_jornal` en el período.
    *   **Capacidad Instalada:** `(Empleados Activos) * (Días Laborables del Período) * (Horas Semanales / 8)`.
    *   **Visualización:** Gráfico de barras comparativo o medidor de % de utilización.

### 4.3 Alineación de Exportación PDF
*   Actualizar `generarPDFReportesLabores.ts` para que la matriz "Actividades x Lotes" utilice los datos granulares reales, asegurando que el PDF coincida exactamente con la realidad operativa registrada en la nueva matriz de ingreso.