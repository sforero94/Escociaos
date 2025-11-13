# 🧪 GUÍA DE PRUEBAS - SISTEMA DE APLICACIONES E INVENTARIO

**Fecha:** 2024-11-13  
**Versión:** 1.0  
**Correcciones implementadas:** Errores #8, #4, #1, #3

---

## 📋 RESUMEN DE CORRECCIONES A VALIDAR

| # | Error | Corrección | Archivo Modificado |
|---|-------|------------|-------------------|
| **#8** | No se actualizan movimientos de inventario al cerrar | ✅ Consolidación automática de inventario | `CierreAplicacion.tsx` |
| **#4** | Presentación comercial mal parseada | ✅ Soporte para comas decimales | `PasoListaCompras.tsx` |
| **#1** | Falta validación de calibración | ✅ Validación en Paso 1 | `CalculadoraAplicaciones.tsx` |
| **#3** | Cierre sin bloquear productos sin precio | ✅ Bloqueo con return | `CierreAplicacion.tsx` |

---

## 🎯 TEST CASE 1: FLUJO COMPLETO EXITOSO

### Objetivo
Validar que el inventario se actualiza correctamente al cerrar una aplicación de fumigación.

### Precondiciones
```
✅ 3 lotes configurados con árboles
✅ 3 productos en inventario con stock ≥ 50 unidades
✅ Productos con precio configurado
✅ Calibración configurada en los lotes
```

---

### PASO 1: Verificar Stock Inicial

**Acción:** Ir a **Inventario** y anotar las cantidades actuales.

**Ejemplo de datos iniciales:**

| Producto | Stock Actual | Precio Unitario |
|----------|--------------|-----------------|
| Producto A (Fungicida) | 100.00 L | $50,000 |
| Producto B (Insecticida) | 80.00 L | $60,000 |
| Producto C (Coadyuvante) | 120.00 L | $30,000 |

**✅ CHECKPOINT 1:** Anota estos valores, los necesitarás para comparar después.

---

### PASO 2: Crear Nueva Aplicación

**Acción:** Navegar a **Aplicaciones** → **Nueva Aplicación**

#### Paso 1 - Configuración

1. **Nombre:** `TEST_INVENTARIO_001`
2. **Tipo:** Fumigación
3. **Fecha inicio:** Hoy
4. **Lotes:** Seleccionar 3 lotes
5. **Calibración (para cada lote):**
   - Lote 1: `0.5 L/árbol`, Caneca: `200 L`
   - Lote 2: `0.4 L/árbol`, Caneca: `200 L`
   - Lote 3: `0.6 L/árbol`, Caneca: `200 L`

**🧪 PRUEBA #1 (Error #1):** Intentar avanzar SIN configurar calibración en un lote.

```
ESPERADO: 
❌ Sistema muestra error: "Los siguientes lotes necesitan calibración completa..."
❌ NO permite avanzar al Paso 2

RESULTADO: [ ] ✅ Funciona  [ ] ❌ Falla
```

6. Configurar calibración y hacer clic en **Siguiente**

---

#### Paso 2 - Mezclas

1. **Crear Mezcla 1:**
   - Nombre: "Mezcla Lote 1"
   - Asignar: Lote 1
   - Agregar productos:
     - Producto A: 500 cc/caneca
     - Producto B: 300 cc/caneca

2. **Crear Mezcla 2:**
   - Nombre: "Mezcla Lote 2"
   - Asignar: Lote 2
   - Agregar productos:
     - Producto A: 400 cc/caneca
     - Producto C: 200 cc/caneca

3. **Crear Mezcla 3:**
   - Nombre: "Mezcla Lote 3"
   - Asignar: Lote 3
   - Agregar productos:
     - Producto B: 350 cc/caneca
     - Producto C: 250 cc/caneca

4. Hacer clic en **Siguiente**

**✅ CHECKPOINT 2:** Verifica que los cálculos automáticos se muestran correctamente.

---

#### Paso 3 - Lista de Compras

1. Hacer clic en **Generar Lista de Compras**

**✅ CHECKPOINT 3:** Todos los productos deben mostrar "Stock suficiente" (barra verde).

2. Hacer clic en **Guardar y Finalizar**

**ESPERADO:** Aplicación guardada con estado `Calculada`

---

### PASO 3: Iniciar Ejecución

**Acción:** En el listado de aplicaciones, encontrar `TEST_INVENTARIO_001`

1. Hacer clic en el botón **Iniciar Ejecución**
2. Seleccionar fecha de inicio: Hoy
3. Confirmar

**ESPERADO:** Estado cambia a `En ejecución`

---

### PASO 4: Registrar Movimientos Diarios

**Acción:** Hacer clic en **Ver Detalles** → Tab **Movimientos Diarios**

#### Movimiento 1 - Lote 1

1. Hacer clic en **Registrar Movimiento Diario**
2. Fecha: Hoy
3. Lote: Lote 1
4. Número de canecas: `5`
5. Agregar productos:
   - Producto A: `2.5 L` (5 canecas × 500cc = 2500cc = 2.5L)
   - Producto B: `1.5 L` (5 canecas × 300cc = 1500cc = 1.5L)
6. Responsable: Tu nombre
7. Guardar

#### Movimiento 2 - Lote 2

1. Fecha: Hoy
2. Lote: Lote 2
3. Número de canecas: `6`
4. Agregar productos:
   - Producto A: `2.4 L` (6 × 400cc)
   - Producto C: `1.2 L` (6 × 200cc)
5. Guardar

#### Movimiento 3 - Lote 3

1. Fecha: Hoy
2. Lote: Lote 3
3. Número de canecas: `4`
4. Agregar productos:
   - Producto B: `1.4 L` (4 × 350cc)
   - Producto C: `1.0 L` (4 × 250cc)
5. Guardar

**✅ CHECKPOINT 4:** Verifica que los 3 movimientos se guardaron correctamente.

**📊 CONSOLIDACIÓN ESPERADA:**
```
Producto A: 2.5 + 2.4 = 4.9 L
Producto B: 1.5 + 1.4 = 2.9 L
Producto C: 1.2 + 1.0 = 2.2 L
```

---

### PASO 5: Cerrar Aplicación (ERROR CRÍTICO #8)

**Acción:** Hacer clic en **Cerrar Aplicación**

#### Paso 1 - Revisión
- Verificar que los movimientos se muestran correctamente
- Hacer clic en **Siguiente**

#### Paso 2 - Datos Finales
1. Jornales: `3`
2. Valor jornal: `$80,000`
3. Fecha inicio real: Hoy
4. Fecha fin real: Hoy
5. Hacer clic en **Siguiente**

#### Paso 3 - Confirmación

**🧪 PRUEBA #3 (Error #3):** Si algún producto NO tiene precio, el sistema debe bloquear.

```
ESPERADO:
❌ Error: "X producto(s) no tienen precio asignado..."
❌ NO permite cerrar

RESULTADO: [ ] ✅ Funciona  [ ] ❌ Falla
```

**Asumiendo que todos tienen precio:**

1. Revisar el resumen
2. Hacer clic en **Confirmar Cierre**

**ESPERADO:**
- ✅ Mensaje: "Aplicación cerrada exitosamente"
- ✅ Console logs:
  ```
  📦 Iniciando consolidación de inventario...
  📊 Productos consolidados: {...}
  ✅ Producto A: 100.00 → 95.10 L
  ✅ Producto B: 80.00 → 77.10 L
  ✅ Producto C: 120.00 → 117.80 L
  ✅ Inventario consolidado exitosamente
  ✅ Aplicación cerrada exitosamente
  ```

---

### PASO 6: VERIFICACIÓN CRÍTICA (ERROR #8)

#### 6.1 Verificar Estado de Aplicación

**Acción:** Ir a Aplicaciones y verificar `TEST_INVENTARIO_001`

```
ESPERADO:
✅ Estado: Cerrada
✅ Costo total calculado
✅ No se puede editar
```

---

#### 6.2 Verificar Movimientos de Inventario

**Acción:** Abrir la consola de Supabase → SQL Editor

**Query 1: Verificar que se crearon movimientos de SALIDA**

```sql
SELECT 
  fecha_movimiento,
  tipo_movimiento,
  cantidad,
  unidad,
  saldo_anterior,
  saldo_nuevo,
  observaciones,
  productos.nombre AS producto_nombre
FROM movimientos_inventario
LEFT JOIN productos ON movimientos_inventario.producto_id = productos.id
WHERE aplicacion_id = (
  SELECT id FROM aplicaciones WHERE nombre_aplicacion = 'TEST_INVENTARIO_001'
)
ORDER BY producto_nombre;
```

**ESPERADO:**

| producto_nombre | tipo_movimiento | cantidad | saldo_anterior | saldo_nuevo |
|----------------|-----------------|----------|----------------|-------------|
| Producto A | Salida | 4.90 | 100.00 | 95.10 |
| Producto B | Salida | 2.90 | 80.00 | 77.10 |
| Producto C | Salida | 2.20 | 120.00 | 117.80 |

```
✅ 3 registros con tipo_movimiento = 'Salida'
✅ Cantidades coinciden con consolidado esperado
✅ Saldos calculados correctamente

RESULTADO: [ ] ✅ CORRECTO  [ ] ❌ INCORRECTO
```

---

#### 6.3 Verificar Inventario Actualizado

**Query 2: Verificar stock actual de productos**

```sql
SELECT 
  nombre,
  cantidad_actual,
  unidad_medida
FROM productos
WHERE nombre IN ('Producto A', 'Producto B', 'Producto C')
ORDER BY nombre;
```

**ESPERADO:**

| nombre | cantidad_actual | unidad_medida |
|--------|----------------|---------------|
| Producto A | 95.10 | L |
| Producto B | 77.10 | L |
| Producto C | 117.80 | L |

```
✅ Stock reducido correctamente
✅ Coincide con saldo_nuevo de movimientos_inventario

RESULTADO: [ ] ✅ CORRECTO  [ ] ❌ INCORRECTO
```

---

#### 6.4 Verificar Trazabilidad Completa

**Query 3: Trazabilidad desde aplicación hasta inventario**

```sql
WITH aplicacion_info AS (
  SELECT id, nombre_aplicacion, estado 
  FROM aplicaciones 
  WHERE nombre_aplicacion = 'TEST_INVENTARIO_001'
),
movimientos_diarios_totales AS (
  SELECT 
    mdp.producto_id,
    p.nombre,
    SUM(
      CASE 
        WHEN mdp.unidad = 'cc' THEN mdp.cantidad_utilizada / 1000
        WHEN mdp.unidad = 'g' THEN mdp.cantidad_utilizada / 1000
        ELSE mdp.cantidad_utilizada
      END
    ) AS total_usado
  FROM movimientos_diarios md
  JOIN movimientos_diarios_productos mdp ON md.id = mdp.movimiento_diario_id
  JOIN productos p ON mdp.producto_id = p.id
  WHERE md.aplicacion_id = (SELECT id FROM aplicacion_info)
  GROUP BY mdp.producto_id, p.nombre
),
movimientos_inventario_totales AS (
  SELECT 
    producto_id,
    productos.nombre,
    cantidad AS total_descontado
  FROM movimientos_inventario
  JOIN productos ON movimientos_inventario.producto_id = productos.id
  WHERE aplicacion_id = (SELECT id FROM aplicacion_info)
  AND tipo_movimiento = 'Salida'
)
SELECT 
  md.nombre AS producto,
  md.total_usado AS usado_en_campo,
  mi.total_descontado AS descontado_de_inventario,
  ROUND(md.total_usado - mi.total_descontado, 2) AS diferencia
FROM movimientos_diarios_totales md
LEFT JOIN movimientos_inventario_totales mi ON md.producto_id = mi.producto_id
ORDER BY md.nombre;
```

**ESPERADO:**

| producto | usado_en_campo | descontado_de_inventario | diferencia |
|----------|----------------|--------------------------|------------|
| Producto A | 4.90 | 4.90 | 0.00 |
| Producto B | 2.90 | 2.90 | 0.00 |
| Producto C | 2.20 | 2.20 | 0.00 |

```
✅ Diferencia = 0.00 para todos los productos
✅ Trazabilidad completa: movimientos diarios → inventario

RESULTADO: [ ] ✅ CORRECTO  [ ] ❌ INCORRECTO
```

---

## 🎯 TEST CASE 2: VALIDACIONES

### TEST 2.1 - Presentación Comercial con Comas (Error #4)

**Acción:** Ir a **Inventario** → **Productos**

1. Editar un producto
2. Cambiar **Presentación Comercial** a: `25,5 L` (con coma)
3. Guardar

4. Crear nueva aplicación que use este producto
5. Ir a Paso 3 - Lista de Compras
6. Generar lista

**🧪 PRUEBA #4:**

```
ESPERADO:
✅ Sistema extrae correctamente: 25.5 (no 25 ni 1)
✅ Cálculo de unidades a comprar correcto

EJEMPLO:
- Cantidad necesaria: 51 L
- Presentación: 25,5 L
- Unidades a comprar: 2 (51 ÷ 25.5 = 2)

RESULTADO: [ ] ✅ Funciona  [ ] ❌ Falla
```

---

### TEST 2.2 - Calibración Faltante (Error #1)

Ya probado en Test Case 1, Paso 2.

**Resumen:**
```
✅ No permite avanzar sin calibración
✅ Mensaje claro indicando qué lotes faltan
```

---

### TEST 2.3 - Cierre sin Precios (Error #3)

**Acción:** 

1. Crear aplicación de prueba
2. Ejecutar movimientos diarios
3. Ir a **Inventario** → Editar uno de los productos usados
4. Borrar el **Precio Unitario** (dejar en 0)
5. Guardar
6. Volver a la aplicación e intentar cerrarla

**🧪 PRUEBA #5:**

```
ESPERADO:
❌ Error en Paso 1 - Revisión
❌ Mensaje: "X producto(s) no tienen precio asignado..."
❌ NO permite avanzar a Paso 2 (datos finales)

RESULTADO: [ ] ✅ Funciona  [ ] ❌ Falla
```

7. Volver a asignar precio
8. Cerrar normalmente

---

## 📊 CHECKLIST FINAL DE VALIDACIÓN

### ✅ Error Crítico #8 - Movimientos de Inventario

- [ ] Movimientos de inventario se crean al cerrar aplicación
- [ ] `tipo_movimiento = 'Salida'` correcto
- [ ] Cantidades consolidadas correctamente (cc→L, g→Kg)
- [ ] `saldo_anterior` y `saldo_nuevo` calculados correctamente
- [ ] `productos.cantidad_actual` se actualiza
- [ ] Observaciones incluyen nombre de aplicación
- [ ] `valor_movimiento` calculado (cantidad × precio)
- [ ] Trazabilidad completa (diferencia = 0)
- [ ] Logs en consola informativos

---

### ✅ Error #4 - Presentación Comercial

- [ ] Soporta formato con punto: "25.5 L"
- [ ] Soporta formato con coma: "25,5 L"
- [ ] Extrae número correctamente: "Bulto 50kg" → 50
- [ ] Maneja valores inválidos: "L" → 1 (default)
- [ ] No causa NaN en cálculos

---

### ✅ Error #1 - Validación de Calibración

- [ ] Valida `calibracion_litros_arbol` presente
- [ ] Valida `calibracion_litros_arbol > 0`
- [ ] Valida `tamano_caneca` presente
- [ ] Solo aplica para fumigaciones (no fertilización)
- [ ] Mensaje claro con nombres de lotes
- [ ] Bloquea avance hasta corregir

---

### ✅ Error #3 (Menor) - Bloqueo sin Precios

- [ ] Detecta productos sin precio
- [ ] Muestra error descriptivo
- [ ] Bloquea avance en cierre
- [ ] Indica ir al módulo de Inventario
- [ ] Permite cerrar después de corregir

---

## 🐛 REPORTE DE ERRORES

Si encuentras algún error durante las pruebas, documéntalo aquí:

### Error Encontrado #1

**Test Case:** 
**Paso:** 
**Comportamiento esperado:** 
**Comportamiento actual:** 
**Logs de consola:** 
**Captura de pantalla:** 

---

## ✅ FIRMA DE APROBACIÓN

**Pruebas realizadas por:** ________________  
**Fecha:** ________________  
**Resultado general:** [ ] ✅ APROBADO  [ ] ❌ RECHAZADO  

**Comentarios adicionales:**

---

## 📞 SOPORTE

Si necesitas ayuda durante las pruebas:

1. Revisa los logs de consola del navegador (F12)
2. Revisa los logs de Supabase (Dashboard → Logs)
3. Ejecuta las queries SQL de verificación
4. Documenta el error encontrado

---

**Fin de la Guía de Pruebas v1.0**
