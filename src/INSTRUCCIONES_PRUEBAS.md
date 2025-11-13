# 🎯 INSTRUCCIONES PARA EJECUTAR PRUEBAS

**Sistema:** Escocia Hass - Gestión de Aplicaciones e Inventario  
**Fecha:** 2024-11-13  
**Versión:** 1.0

---

## ✅ CORRECCIONES IMPLEMENTADAS

Se han implementado exitosamente **4 correcciones críticas**:

1. ✅ **ERROR CRÍTICO #8** - Consolidación de inventario al cerrar aplicación
2. ✅ **ERROR #4** - Presentación comercial con soporte para comas decimales  
3. ✅ **ERROR #1** - Validación de calibración en fumigaciones
4. ✅ **ERROR #3** - Bloqueo de cierre sin precios

---

## 🚀 CÓMO EJECUTAR LAS PRUEBAS

### OPCIÓN 1: Monitor Visual Automático (Recomendado)

El monitor visual ejecuta pruebas automáticas y muestra el estado del sistema en tiempo real.

**Pasos:**

1. Inicia sesión en la aplicación
2. Navega a: **Monitoreo** (en el menú lateral)
3. El sistema ejecutará automáticamente todas las validaciones
4. Revisa los resultados:
   - ✅ Verde = Correcto
   - ⚠️ Amarillo = Advertencia
   - ❌ Rojo = Error crítico

**Qué valida:**
- Movimientos de inventario en aplicaciones cerradas
- Productos sin precio
- Trazabilidad campo → inventario
- Calibraciones en fumigaciones activas
- Estadísticas generales del sistema

**Ventajas:**
- No requiere conocimiento técnico
- Resultados instantáneos
- Actualización en tiempo real
- Interfaz visual clara

---

### OPCIÓN 2: Pruebas Manuales Completas

Para validación exhaustiva paso a paso.

**Archivo:** `/GUIA_PRUEBAS.md`

**Incluye:**
- Test Case 1: Flujo completo exitoso (creación → ejecución → cierre)
- Test Case 2: Validaciones (calibración, precios, presentación)
- Checkpoints de verificación
- Queries SQL para validar datos

**Ideal para:**
- Validar flujo completo de usuario
- Detectar problemas de UX
- Verificar comportamiento en casos edge
- Documentar resultados

---

### OPCIÓN 3: Queries SQL Directas

Para desarrolladores y análisis técnico profundo.

**Archivo:** `/QUERIES_VERIFICACION.sql`

**Incluye 10 categorías de queries:**

1. Diagnóstico rápido de inventario
2. Validación de aplicación específica
3. Trazabilidad completa
4. Verificación de stocks actuales
5. Auditoría de movimientos por producto
6. Validación de aplicaciones cerradas
7. Reporte de aplicaciones activas
8. Verificación de calibraciones
9. Estadísticas generales
10. Queries de limpieza (desarrollo)

**Cómo usar:**
1. Abre Supabase Dashboard → SQL Editor
2. Copia una query del archivo
3. Reemplaza valores de ejemplo (nombres de aplicaciones/productos)
4. Ejecuta y analiza resultados

---

## 📋 PLAN DE PRUEBAS RECOMENDADO

### FASE 1: Validación Rápida (5 minutos)

1. ✅ Ir a **Monitoreo** y ejecutar pruebas automáticas
2. ✅ Verificar que no hay errores rojos
3. ✅ Si todo está verde, el sistema funciona correctamente

**Si hay errores rojos:**
- Continuar con Fase 2

---

### FASE 2: Validación Funcional (30 minutos)

Sigue los pasos de `/GUIA_PRUEBAS.md` - Test Case 1:

1. ✅ Verificar stock inicial
2. ✅ Crear nueva aplicación de fumigación
3. ✅ Probar validación de calibración (intentar avanzar sin calibración)
4. ✅ Configurar mezclas y productos
5. ✅ Generar lista de compras
6. ✅ Iniciar ejecución
7. ✅ Registrar movimientos diarios
8. ✅ Cerrar aplicación
9. ✅ **CRÍTICO:** Verificar que se crearon movimientos de inventario

**Queries de verificación críticas:**

```sql
-- 1. Ver movimientos de la aplicación
SELECT * FROM movimientos_inventario 
WHERE aplicacion_id = (
  SELECT id FROM aplicaciones WHERE nombre_aplicacion = 'TU_APLICACION'
);

-- 2. Ver inventario actualizado
SELECT nombre, cantidad_actual FROM productos 
WHERE nombre IN ('Producto A', 'Producto B', 'Producto C');

-- 3. Verificar trazabilidad (debe dar diferencia = 0)
-- Copiar la query completa de QUERIES_VERIFICACION.sql sección 3.1
```

---

### FASE 3: Validación de Casos Edge (15 minutos)

Sigue `/GUIA_PRUEBAS.md` - Test Case 2:

1. ✅ Presentación comercial con comas (`25,5 L`)
2. ✅ Intentar crear fumigación sin calibración
3. ✅ Intentar cerrar aplicación sin precios

---

## 🎯 RESULTADOS ESPERADOS

### ✅ ÉXITO - Sistema Funcionando Correctamente

**Monitor Visual:**
- 4/4 pruebas en verde
- 0 errores críticos
- Estadísticas coherentes

**Pruebas Manuales:**
- Aplicación se cierra correctamente
- Movimientos de inventario creados
- Stock actualizado
- Trazabilidad = 0 diferencia

**Queries SQL:**
```sql
-- Esta query NO debe devolver filas:
SELECT * FROM aplicaciones 
WHERE estado = 'Cerrada' 
AND NOT EXISTS (
  SELECT 1 FROM movimientos_inventario 
  WHERE aplicacion_id = aplicaciones.id 
  AND tipo_movimiento = 'Salida'
);
```

---

### ❌ FALLO - Requiere Revisión

**Síntomas:**

1. **Monitor muestra errores rojos**
   - Aplicaciones cerradas sin movimientos de inventario
   - Trazabilidad con diferencias > 0.01

2. **Inventario NO se actualiza al cerrar**
   - Stock permanece igual después de cerrar
   - No hay registros en `movimientos_inventario`

3. **Validaciones NO funcionan**
   - Permite crear fumigación sin calibración
   - Permite cerrar aplicación sin precios

**Acción:**
- Revisar logs de consola del navegador
- Ejecutar queries SQL de diagnóstico
- Reportar error con capturas de pantalla

---

## 📊 CHECKLIST DE VALIDACIÓN FINAL

Antes de dar por cerradas las pruebas, verifica:

### Funcionalidad Crítica
- [ ] Monitor visual muestra todas las pruebas en verde
- [ ] Aplicación de prueba se cerró correctamente
- [ ] Se crearon movimientos de inventario tipo "Salida"
- [ ] Stock de productos se redujo correctamente
- [ ] Trazabilidad campo → inventario = 0 diferencia

### Validaciones
- [ ] No permite avanzar sin calibración (fumigación)
- [ ] No permite cerrar sin precios
- [ ] Presentación comercial parsea comas: "25,5" → 25.5

### Datos
- [ ] Saldo_anterior y saldo_nuevo calculados correctamente
- [ ] Conversión de unidades cc→L, g→Kg funciona
- [ ] Observaciones incluyen nombre de aplicación
- [ ] Valor_movimiento = cantidad × precio

### Trazabilidad
- [ ] Suma de movimientos diarios = suma de movimientos inventario
- [ ] Producto_id coincide entre tablas
- [ ] Cantidades consolidadas correctamente

---

## 🐛 REPORTE DE ERRORES

Si encuentras errores, documenta:

1. **Descripción del error:**
2. **Pasos para reproducir:**
3. **Comportamiento esperado:**
4. **Comportamiento actual:**
5. **Logs de consola:**
6. **Resultado de query SQL:**

---

## 📞 PRÓXIMOS PASOS

### Si todo funciona correctamente ✅

1. Marcar pruebas como completadas
2. Continuar con desarrollo de otras funcionalidades
3. Opcionalmente: Implementar correcciones de Fase 3 (mejoras)

### Si hay errores ❌

1. Reportar con evidencia
2. Revisar archivos modificados:
   - `/components/aplicaciones/CierreAplicacion.tsx`
   - `/components/aplicaciones/PasoListaCompras.tsx`
   - `/components/aplicaciones/CalculadoraAplicaciones.tsx`
3. Verificar logs de Supabase

---

## 📁 ARCHIVOS DE REFERENCIA

| Archivo | Propósito |
|---------|-----------|
| `/GUIA_PRUEBAS.md` | Guía paso a paso de pruebas manuales |
| `/QUERIES_VERIFICACION.sql` | Queries SQL para análisis profundo |
| `/INSTRUCCIONES_PRUEBAS.md` | Este archivo - Resumen ejecutivo |
| `/components/testing/SistemaMonitoreo.tsx` | Monitor visual automático |

---

## 🎉 RESUMEN

**Sistema Corregido:**
- ✅ Inventario se actualiza al cerrar aplicaciones
- ✅ Trazabilidad completa implementada
- ✅ Validaciones de calibración y precios
- ✅ Presentación comercial robusta

**Herramientas de Validación:**
- 🎯 Monitor visual en `/monitoreo`
- 📋 Guía de pruebas completa
- 💾 Queries SQL de verificación

**Estado:** LISTO PARA PRUEBAS ✅

---

**¡Buena suerte con las pruebas! 🚀**
