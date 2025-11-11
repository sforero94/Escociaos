# Estado Actual del Módulo de Aplicaciones 🥑

**Fecha:** Noviembre 11, 2025  
**Sistema:** Escocia Hass - Gestión Integral de Cultivo de Aguacate

---

## ✅ COMPLETADO

### **1. Arquitectura Base**
- ✅ Tipos TypeScript completos (`/types/aplicaciones.ts`)
- ✅ Funciones de cálculo (`/utils/calculosAplicaciones.ts`)
- ✅ Estructura de rutas en App.tsx
- ✅ Documentación completa (README.md)

### **2. Componentes UI**
- ✅ `AplicacionesList.tsx` - Lista principal con:
  - Estadísticas (total, planificadas, en ejecución, cerradas)
  - Filtros (tipo, estado, búsqueda)
  - Estado vacío con CTA
  - Navegación a calculadora

- ✅ `CalculadoraAplicaciones.tsx` - Wizard COMPLETO con:
  - Stepper visual responsivo (desktop/mobile)
  - 3 pasos con componentes importados
  - Validaciones por paso
  - Navegación (Anterior/Siguiente/Guardar)
  - Dialog de confirmación de cancelación
  - Manejo de errores
  - Estado de carga
  - Integración con Supabase para guardar

- ✅ `PasoConfiguracion.tsx` - ⭐ **COMPLETO Y FUNCIONAL**
  - Formulario con inputs (nombre, tipo, fecha, agrónomo, propósito)
  - Selector de lotes con checkboxes
  - Carga lotes desde Supabase
  - Configuración de calibración y caneca (fumigación)
  - Desglose de árboles por tipo
  - Resumen automático de totales
  - Auto-guardado al cambiar
  - Validaciones en tiempo real
  
- ✅ `PasoMezcla.tsx` - ⭐ **COMPLETO Y FUNCIONAL**
  - Selector de productos desde Supabase (filtrado por tipo)
  - Agregar/quitar productos a la mezcla
  - Inputs de dosis según tipo de aplicación:
    - Fumigación: dosis por caneca (cc/gramos)
    - Fertilización: dosis por tipo de árbol (kg)
  - Botón "Calcular Cantidades" con validaciones
  - Resultados por lote (litros, canecas, kilos, bultos)
  - Cantidad total necesaria por producto
  - Auto-guardado de mezclas y cálculos
  - Estado vacío con mensaje de ayuda
  
- ✅ `PasoListaCompras.tsx` - ⭐ **COMPLETO Y FUNCIONAL**
  - Generación automática de lista de compras
  - Carga inventario desde Supabase
  - 3 stats cards: A comprar, Disponibles, Inversión
  - Alertas para productos sin precio o sin stock
  - Tabla de productos a comprar con:
    - Stock vs Necesario vs Faltante
    - Unidades a comprar
    - Costo estimado
  - Tabla de productos disponibles en stock
  - Resumen final de la aplicación
  - Mensaje de éxito si todo está disponible
  - Botón exportar PDF (placeholder)
  - Auto-guardado de lista de compras

### **3. Funciones de Cálculo**
- ✅ `calcularFumigacion()` - Litros, canecas, productos
- ✅ `calcularFertilizacion()` - Kilos por tipo, bultos
- ✅ `calcularTotalesProductos()` - Suma cantidades
- ✅ `generarListaCompras()` - Inventario vs necesario
- ✅ `formatearMoneda()` - Pesos colombianos
- ✅ `formatearNumero()` - Separador de miles
- ✅ Validaciones (lotes y productos)

---

## 🚧 PENDIENTE

### **Componentes de Pasos del Wizard**

#### **1. PasoConfiguracion.tsx** (PRIORIDAD ALTA)
**Descripción:** Formulario de configuración inicial

**Campos obligatorios:**
- [ ] Input texto: Nombre de la aplicación
- [ ] Radio buttons: Tipo (fumigación/fertilización)
- [ ] Date picker: Fecha de inicio
- [ ] Textarea: Propósito/observaciones (opcional)
- [ ] Input texto: Agrónomo responsable (opcional)

**Selector de Lotes:**
- [ ] Cargar lotes desde Supabase (tabla `lotes`)
- [ ] Checkboxes para seleccionar múltiples lotes
- [ ] Por cada lote seleccionado:
  - [ ] Checkboxes para sublotes
  - [ ] Mostrar: área (ha), # árboles por tipo
  
**Solo para Fumigación:**
- [ ] Input numérico: Calibración (L/árbol)
- [ ] Select: Tamaño de caneca (20, 200, 500, 1000 L)
- [ ] Select: Mezcla asignada (se llena en paso 2)

**Resumen automático:**
- [ ] Total área (ha)
- [ ] Total árboles por tipo (grandes, medianos, pequeños, clonales)
- [ ] Total general de árboles

**Validaciones:**
- [ ] Nombre no vacío
- [ ] Tipo seleccionado
- [ ] Fecha válida y no en el pasado
- [ ] Al menos 1 lote seleccionado
- [ ] Si fumigación: calibración > 0 y tamaño caneca

---

#### **2. PasoMezcla.tsx** (PRIORIDAD ALTA)
**Descripción:** Creador de mezclas de productos

**Gestión de Mezclas:**
- [ ] Botón "Agregar Mezcla"
- [ ] Lista de mezclas creadas
- [ ] Editar/Eliminar mezcla
- [ ] Input: Nombre de la mezcla

**Por cada Mezcla:**
- [ ] Botón "Agregar Producto"
- [ ] Buscador de productos del inventario
- [ ] Filtrar por categoría (insecticida, fungicida, etc.)
- [ ] Mostrar: nombre, categoría, stock actual

**Configuración de Dosis:**

**Si Fumigación:**
- [ ] Input numérico: Dosis por caneca
- [ ] Select: Unidad (cc/gramos)
- [ ] Auto-calcular cantidad total según # canecas

**Si Fertilización:**
- [ ] Input numérico: Dosis árboles grandes (kg/árbol)
- [ ] Input numérico: Dosis árboles medianos (kg/árbol)
- [ ] Input numérico: Dosis árboles pequeños (kg/árbol)
- [ ] Input numérico: Dosis árboles clonales (kg/árbol)
- [ ] Auto-calcular kilos totales

**Tabla Resumen por Mezcla:**
- [ ] Columnas: Producto, Dosis, Unidad, Cantidad Total
- [ ] Total general por mezcla
- [ ] Acciones: Editar/Eliminar producto

**Asignación Lote-Mezcla (solo fumigación):**
- [ ] Por cada lote, select para asignar mezcla
- [ ] Validar que todos los lotes tengan mezcla asignada

**Cálculos Automáticos:**
- [ ] Al cambiar dosis, recalcular cantidad total
- [ ] Llamar a `calcularFumigacion()` o `calcularFertilizacion()`
- [ ] Llamar a `calcularTotalesProductos()`

**Validaciones:**
- [ ] Al menos 1 mezcla creada
- [ ] Cada mezcla tiene nombre
- [ ] Cada mezcla tiene al menos 1 producto
- [ ] Todos los productos tienen dosis > 0
- [ ] Fumigación: todos los lotes tienen mezcla asignada

---

#### **3. PasoListaCompras.tsx** (PRIORIDAD MEDIA)
**Descripción:** Comparador de inventario y generador de lista de compras

**Tabla de Productos:**
- [ ] Columnas:
  - Producto (nombre + categoría)
  - Necesario (cantidad calculada)
  - Disponible (inventario actual)
  - Faltante (calculado)
  - Presentación comercial
  - Unidades a comprar
  - Precio unitario
  - Costo estimado
  - Alerta

**Indicadores Visuales:**
- [ ] Badge rojo: Sin stock
- [ ] Badge amarillo: Sin precio
- [ ] Badge verde: Suficiente inventario
- [ ] Badge azul: Requiere compra

**Resumen Superior:**
- [ ] Total productos: X
- [ ] Productos con stock suficiente: X
- [ ] Productos a comprar: X
- [ ] Productos sin precio: X
- [ ] Costo total estimado: $X.XXX.XXX

**Acciones:**
- [ ] Botón "Exportar a PDF"
- [ ] Botón "Enviar a WhatsApp" (opcional)
- [ ] Filtros por alerta (sin stock, sin precio, etc.)

**Cálculos:**
- [ ] Llamar a `generarListaCompras()`
- [ ] Formatear con `formatearMoneda()` y `formatearNumero()`

**Opciones Avanzadas:**
- [ ] Checkbox: "Incluir productos con stock suficiente en PDF"
- [ ] Checkbox: "Marcar productos para compra inmediata"

---

### **Integración con Supabase**

#### **Cargar Datos:**
- [ ] Lotes y sublotes (tabla `lotes`)
- [ ] Productos del inventario (tabla `productos`)
- [ ] Conteo de árboles por lote (tabla `arboles` o campo en `lotes`)
- [ ] Precios de productos (tabla `compras` o `productos`)

#### **Guardar Aplicación:**
- [ ] Crear tabla `aplicaciones` en Supabase
- [ ] Endpoint: POST `/aplicaciones`
- [ ] Guardar configuración como JSONB
- [ ] Guardar mezclas como JSONB
- [ ] Guardar cálculos como JSONB
- [ ] Guardar lista de compras como JSONB
- [ ] Registrar usuario creador
- [ ] Timestamps automáticos

#### **Actualizar Estado:**
- [ ] Cambiar estado: planificada → en_ejecucion
- [ ] Cambiar estado: en_ejecucion → cerrada
- [ ] Registrar fecha de cierre

---

### **Funcionalidades Adicionales**

#### **Lista de Aplicaciones:**
- [ ] Cargar aplicaciones desde Supabase
- [ ] Paginación (10-20 por página)
- [ ] Click en card → detalle de aplicación
- [ ] Menú de opciones (editar, duplicar, eliminar)
- [ ] Cambiar estado desde la lista

#### **Detalle de Aplicación:**
- [ ] Ver configuración completa
- [ ] Ver mezclas y dosis
- [ ] Ver lista de compras
- [ ] Ver historial de cambios
- [ ] Botón "Editar" (si no está cerrada)
- [ ] Botón "Duplicar"
- [ ] Botón "Cerrar aplicación"
- [ ] Botón "Exportar PDF completo"

#### **Mejoras UX:**
- [ ] Auto-guardado en localStorage
- [ ] Recuperar sesión si se cierra el navegador
- [ ] Templates de mezclas frecuentes
- [ ] Sugerencias de dosis basadas en histórico
- [ ] Alertas de productos próximos a agotar
- [ ] Gráfico de consumo histórico

---

## 🎯 PRIORIDADES

### **Sprint 1: Configuración Básica** (Prioridad: ALTA)
1. ✅ Tipos TypeScript
2. ✅ Funciones de cálculo
3. ✅ Componente base del wizard
4. 🚧 PasoConfiguracion.tsx

**Objetivo:** Poder configurar tipo, lotes y fecha

---

### **Sprint 2: Mezclas y Cálculos** (Prioridad: ALTA)
1. 🚧 PasoMezcla.tsx
2. 🚧 Integrar funciones de cálculo
3. 🚧 Validaciones completas

**Objetivo:** Calcular cantidades automáticamente

---

### **Sprint 3: Lista de Compras** (Prioridad: MEDIA)
1. 🚧 PasoListaCompras.tsx
2. 🚧 Comparar con inventario
3. 🚧 Generar PDF

**Objetivo:** Lista de compras exportable

---

### **Sprint 4: Backend y Persistencia** (Prioridad: MEDIA)
1. 🚧 Crear tabla en Supabase
2. 🚧 Guardar aplicación
3. 🚧 Cargar aplicaciones
4. 🚧 Detalle de aplicación

**Objetivo:** Persistir datos en BD

---

### **Sprint 5: Mejoras y Optimización** (Prioridad: BAJA)
1. 🚧 Auto-guardado
2. 🚧 Templates de mezclas
3. 🚧 Duplicar aplicaciones
4. 🚧 Gráficos y reportes

**Objetivo:** Mejorar experiencia de usuario

---

## 📝 NOTAS TÉCNICAS

### **Integración con Inventario:**
El módulo de aplicaciones debe:
1. Leer cantidades disponibles de `productos`
2. Al cerrar una aplicación, descontar del inventario
3. Registrar movimiento en `movimientos_inventario`
4. Vincular con trazabilidad GlobalGAP

### **Cálculos en Tiempo Real:**
- Recalcular al cambiar dosis
- Recalcular al agregar/quitar lotes
- Recalcular al cambiar calibración
- Mostrar preview de cantidades

### **Validaciones de Negocio:**
- No permitir dosis negativas
- Validar que exista inventario mínimo
- Alertar si costo supera presupuesto
- Validar fechas lógicas

### **Exportación PDF:**
Debe incluir:
- Logo de Escocia Hass
- Fecha y nombre de aplicación
- Tabla de lotes y áreas
- Tabla de productos y dosis
- Lista de compras con precios
- Total general
- Firma de responsable

---

## 🔗 DEPENDENCIAS

### **Tablas de Supabase Necesarias:**
- ✅ `productos` (ya existe)
- ✅ `lotes` (verificar estructura)
- 🚧 `aplicaciones` (crear)
- 🚧 `sublotes` (verificar si existe)
- 🚧 `arboles` (verificar conteo por lote)

### **Componentes UI Necesarios:**
- ✅ Stepper (implementado)
- 🚧 Selector de lotes con checkboxes
- 🚧 Buscador de productos
- 🚧 Tabla editable de dosis
- 🚧 Generador de PDF

---

## 📊 MÉTRICAS DE ÉXITO

- [ ] Tiempo de creación de aplicación < 5 minutos
- [ ] Cálculos automáticos 100% precisos
- [ ] 0 errores de validación al guardar
- [ ] Lista de compras exportable en < 2 segundos
- [ ] Sincronización con inventario en tiempo real
- [ ] Trazabilidad GlobalGAP completa

---

**Última actualización:** Nov 11, 2025  
**Próximo paso:** Implementar `PasoConfiguracion.tsx`