# ✅ Test de Cierre de Aplicación

## 🎯 Objetivo
Verificar que el cierre de aplicaciones funciona correctamente con las nuevas columnas agregadas a la tabla `aplicaciones`.

## 📋 Checklist de Verificación

### 1. ✅ Columnas Agregadas (Verificar en Supabase)
Ejecutar en SQL Editor:
```sql
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'aplicaciones'
  AND column_name IN (
    'fecha_cierre',
    'jornales_utilizados',
    'valor_jornal',
    'costo_total_insumos',
    'costo_total_mano_obra',
    'costo_total',
    'observaciones_cierre',
    'costo_por_arbol',
    'arboles_jornal'
  )
ORDER BY column_name;
```

**Resultado esperado:** 9 filas

---

### 2. ✅ Documentación Actualizada
- [x] `/supabase_tablas.md` actualizado con nuevas columnas
- [x] `/APLICACIONES_COLUMNAS_NECESARIAS.md` creado con documentación completa
- [x] `/FORMATO_FECHAS.md` creado para sistema de fechas dd/mm/aaaa

---

### 3. 🧪 Test Manual en UI

#### Paso 1: Crear una aplicación de prueba
1. Ir a **Aplicaciones** → **Nueva Aplicación**
2. Configurar:
   - Nombre: "TEST - Cierre 13-11-2025"
   - Tipo: Fumigación
   - Fecha inicio: 13/11/2025
   - Seleccionar 1 lote
   - Agregar 1 producto con dosis
3. Guardar y calcular
4. ✅ Verificar que se crea con `estado = 'Calculada'`

#### Paso 2: Iniciar ejecución
1. Abrir la aplicación TEST
2. Click en **Iniciar Ejecución**
3. Ingresar fecha de inicio
4. ✅ Verificar que cambia a `estado = 'En ejecución'`

#### Paso 3: Registrar movimientos diarios (opcional)
1. Ir a pestaña **Movimientos Diarios**
2. Registrar 1 movimiento de prueba
3. ✅ Verificar que se guarda correctamente

#### Paso 4: Cerrar aplicación
1. Click en **Cerrar Aplicación**
2. Completar formulario:
   - Fecha inicio real: 13/11/2025
   - Fecha fin real: 13/11/2025
   - Jornales: 5
   - Valor jornal: 50000
   - Observaciones: "Test de cierre"
3. Click en **Cerrar Aplicación**
4. ✅ **VERIFICAR:**
   - No hay error de columnas faltantes
   - La aplicación cambia a `estado = 'Cerrada'`
   - Se muestra mensaje de éxito

---

### 4. 🔍 Verificar en Base de Datos

Ejecutar en Supabase SQL Editor:
```sql
SELECT 
  id,
  codigo_aplicacion,
  nombre_aplicacion,
  estado,
  fecha_inicio_ejecucion,
  fecha_fin_ejecucion,
  fecha_cierre,
  jornales_utilizados,
  valor_jornal,
  costo_total_insumos,
  costo_total_mano_obra,
  costo_total,
  costo_por_arbol,
  arboles_jornal,
  observaciones_cierre
FROM aplicaciones
WHERE nombre_aplicacion LIKE '%TEST - Cierre%'
ORDER BY created_at DESC
LIMIT 1;
```

**Valores esperados:**
- `estado` = 'Cerrada'
- `fecha_cierre` IS NOT NULL
- `jornales_utilizados` = 5
- `valor_jornal` = 50000
- `costo_total_mano_obra` = 250000 (5 x 50000)
- `costo_total` = costo_total_insumos + costo_total_mano_obra
- `costo_por_arbol` > 0 (si hay árboles)
- `arboles_jornal` > 0 (árboles totales / jornales)
- `observaciones_cierre` = "Test de cierre"

---

### 5. 🎨 Verificar en UI - Vista de Detalle

1. Abrir la aplicación TEST cerrada
2. ✅ Verificar que se muestra:
   - Badge de estado "Cerrada" (gris)
   - Sección de costos con:
     - Costo de insumos
     - Costo de mano de obra
     - Costo total
     - Costo por árbol
     - Árboles por jornal
   - Observaciones de cierre
   - Fechas reales de ejecución

---

### 6. 📊 Test de Formato de Fechas

1. ✅ Verificar que TODAS las fechas se muestran en formato **dd/mm/aaaa**:
   - Fecha inicio planeada
   - Fecha fin planeada
   - Fecha inicio real
   - Fecha fin real
   - Fecha de cierre

2. ✅ Verificar que los inputs de fecha muestran:
   - Placeholder: "dd/mm/aaaa"
   - Se puede escribir: 13/11/2025
   - Auto-completa las barras "/"
   - Valida fecha inválida (ej: 32/13/2025)

---

## 🚨 Problemas Conocidos Resueltos

### ❌ Antes (ERROR):
```
Error: column "fecha_cierre" of relation "aplicaciones" does not exist
Error: column "jornales_utilizados" of relation "aplicaciones" does not exist
...
```

### ✅ Ahora (FUNCIONA):
```
✅ Aplicación cerrada exitosamente
```

---

## 📸 Capturas Esperadas

### 1. Input de fecha con formato dd/mm/aaaa
- Muestra placeholder "dd/mm/aaaa"
- Icono de calendario
- Auto-completa barras al escribir

### 2. Aplicación cerrada - Vista de lista
- Badge "Cerrada" en gris
- Muestra fecha de cierre en dd/mm/aaaa

### 3. Aplicación cerrada - Vista de detalle
- Sección de costos completa
- Métricas de eficiencia (costo/árbol, árboles/jornal)
- Observaciones de cierre

---

## 🎉 Criterios de Éxito

- [ ] ✅ Sin errores al cerrar aplicación
- [ ] ✅ Todos los campos se guardan correctamente
- [ ] ✅ Los costos se calculan automáticamente
- [ ] ✅ Las fechas se muestran en formato dd/mm/aaaa
- [ ] ✅ El input de fecha funciona correctamente
- [ ] ✅ La aplicación cambia a estado "Cerrada"
- [ ] ✅ Se puede ver el detalle de la aplicación cerrada

---

## 🔄 Rollback (Si algo sale mal)

Si necesitas revertir los cambios:

```sql
-- Eliminar columnas agregadas
ALTER TABLE aplicaciones DROP COLUMN IF EXISTS fecha_cierre;
ALTER TABLE aplicaciones DROP COLUMN IF EXISTS jornales_utilizados;
ALTER TABLE aplicaciones DROP COLUMN IF EXISTS valor_jornal;
ALTER TABLE aplicaciones DROP COLUMN IF EXISTS costo_total_insumos;
ALTER TABLE aplicaciones DROP COLUMN IF EXISTS costo_total_mano_obra;
ALTER TABLE aplicaciones DROP COLUMN IF EXISTS costo_total;
ALTER TABLE aplicaciones DROP COLUMN IF EXISTS observaciones_cierre;
```

**NOTA:** No revertir `costo_por_arbol` y `arboles_jornal` ya que se agregaron antes.

---

## 📞 Soporte

Si encuentras algún problema:
1. Revisar `/APLICACIONES_COLUMNAS_NECESARIAS.md`
2. Verificar que todas las columnas existen en Supabase
3. Revisar la consola del navegador (F12) para errores
4. Verificar la consola de Supabase para errores SQL

---

**Última actualización:** 13/11/2025  
**Estado:** ✅ LISTO PARA PROBAR
