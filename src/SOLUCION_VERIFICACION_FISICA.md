# 🔧 Solución: Productos No Cargan en Verificación Física

## 🎯 Problema Identificado

Al intentar iniciar una verificación física de inventario, **no se están cargando los productos activos**.

### Causa Raíz

Las **tablas de base de datos necesarias para el módulo de Verificación Física NO existen** en tu proyecto de Supabase:

- ❌ `verificaciones_inventario` - Tabla principal de verificaciones
- ❌ `verificaciones_detalle` - Detalle de productos verificados
- ❌ `vista_resumen_verificaciones` - Vista con resumen agregado
- ❌ Triggers para calcular diferencias automáticamente
- ⚠️ Posiblemente falta campo `activo` en tabla `productos`

## ✅ Solución Completa (5 minutos)

### Paso 1: Acceder al SQL Editor de Supabase

1. Ve a tu proyecto en [Supabase](https://supabase.com)
2. En el panel lateral, haz clic en **🛢️ SQL Editor**
3. Haz clic en **"+ New query"**

### Paso 2A: Si las tablas YA EXISTEN (error de columna faltante)

**Si recibiste el error:** `column vd.aprobado does not exist`

Esto significa que las tablas ya existen pero les faltan columnas. Ejecuta primero:

1. Abre el archivo `VERIFICACION_FIX_COLUMNAS.sql` (está en la carpeta `src`)
2. **Copia TODO el contenido** del archivo
3. **Pega** en el editor SQL de Supabase
4. Haz clic en **"Run"**
5. Deberías ver mensajes con ✅ indicando qué columnas se agregaron
6. **Luego continúa al Paso 2B**

### Paso 2B: Ejecutar el Script de Configuración Completo

1. Abre el archivo `VERIFICACION_INVENTARIO_SETUP.sql` (está en la carpeta `src`)
2. **Copia TODO el contenido** del archivo
3. **Pega** en el editor SQL de Supabase
4. Haz clic en **"Run"** (botón verde, esquina inferior derecha)
5. Espera 5-10 segundos mientras se ejecuta

### Paso 3: Verificar Instalación Exitosa

Deberías ver al final del resultado una tabla como esta:

```
tipo                          | cantidad
------------------------------|----------
Tablas creadas/verificadas    |    2
Vistas creadas                |    1
Triggers creados              |    1
Funciones creadas             |    2
```

✅ **¡Si ves estos números, todo está correctamente configurado!**

### Paso 4: Probar la Verificación Física

1. Regresa a tu aplicación
2. Ve a **Inventario** > **Verificaciones**
3. Haz clic en **"Nueva Verificación"**
4. **Deberías ver ahora la lista de todos tus productos activos** ✨

---

## 📊 ¿Qué Hace el Script?

El script `VERIFICACION_INVENTARIO_SETUP.sql` configura automáticamente:

### 1️⃣ Tablas Creadas

#### `verificaciones_inventario`
Registro principal de cada verificación física:
- ID único de verificación
- Fechas (inicio, fin, revisión)
- Estado (En proceso, Completada, Pendiente Aprobación, Aprobada, Rechazada)
- Usuario verificador y revisor
- Observaciones generales

#### `verificaciones_detalle`
Detalle de cada producto en la verificación:
- Cantidad teórica (del sistema)
- Cantidad física (contada en bodega)
- Diferencia calculada automáticamente
- Porcentaje de diferencia
- Valor monetario de la diferencia
- Estado (Pendiente, OK, Sobrante, Faltante)
- Flag de aprobación

### 2️⃣ Vista Creada

#### `vista_resumen_verificaciones`
Vista agregada con métricas calculadas:
- Total de productos
- Productos contados vs pendientes
- Productos OK vs con diferencias
- Valor total de diferencias
- Porcentaje de completado
- Productos aprobados

### 3️⃣ Triggers y Funciones

#### Trigger: `calcular_diferencias_verificacion`
Se ejecuta automáticamente cuando se ingresa la cantidad física y calcula:
- **Diferencia** = cantidad_fisica - cantidad_teorica
- **Porcentaje** = (diferencia / cantidad_teorica) × 100
- **Valor** = diferencia × precio_unitario
- **Estado** = OK / Sobrante / Faltante

#### Función: `aplicar_ajustes_verificacion`
Función que puede llamarse para aplicar los ajustes aprobados:
- Actualiza `cantidad_actual` en tabla `productos`
- Registra movimientos en `movimientos_inventario`
- Marca verificación como "Aprobada"

### 4️⃣ Políticas RLS Configuradas

Row Level Security habilitado con políticas que permiten:
- ✅ Usuarios autenticados pueden leer todas las verificaciones
- ✅ Usuarios autenticados pueden crear verificaciones
- ✅ Usuarios autenticados pueden actualizar verificaciones
- ✅ Usuarios autenticados pueden eliminar verificaciones

### 5️⃣ Campo `activo` en Productos

Si tu tabla `productos` no tenía el campo `activo`, el script lo agrega automáticamente:
```sql
ALTER TABLE productos ADD COLUMN activo BOOLEAN DEFAULT true;
```

---

## 🔄 Flujo Completo del Módulo

### Fase 1: Iniciar Verificación (NuevaVerificacion.tsx)
1. Usuario gerencia o verificador hace clic en "Nueva Verificación"
2. El sistema **carga todos los productos activos** (activo !== false)
3. Crea registro en `verificaciones_inventario` con estado "En proceso"
4. Crea un registro en `verificaciones_detalle` por cada producto
   - `cantidad_teorica` = cantidad actual del sistema
   - `cantidad_fisica` = null (se llenará en el conteo)
5. Redirige a pantalla de conteo físico

### Fase 2: Conteo Físico (ConteoFisico.tsx)
1. Interfaz optimizada para móvil/tablet
2. Verificador navega producto por producto
3. Ingresa cantidad encontrada en bodega
4. Puede agregar observaciones
5. Al guardar, **el trigger calcula automáticamente**:
   - Diferencia nominal
   - Porcentaje de diferencia
   - Valor monetario de la diferencia
   - Estado (OK, Sobrante, Faltante)
6. Al terminar todos los productos, marca verificación como "Pendiente Aprobación"

### Fase 3: Revisión y Aprobación (Próximamente)
1. Gerencia recibe badge de notificación
2. Revisa las diferencias encontradas
3. Puede aprobar todas o solo algunas (checkbox individual)
4. Todo lo aprobado se aplica oficialmente al inventario:
   - Se actualiza `cantidad_actual` en `productos`
   - Se registra en `movimientos_inventario`
5. Sistema queda conciliado con bodega física

---

## 🐛 Solución de Problemas

### ❌ Error: "column vd.aprobado does not exist" o "column ... does not exist"
**Problema**: Las tablas existen pero les faltan columnas
**Solución**:
1. Ejecuta primero `VERIFICACION_FIX_COLUMNAS.sql` (Paso 2A)
2. Luego ejecuta `VERIFICACION_INVENTARIO_SETUP.sql` (Paso 2B)

### ❌ Error: "relation verificaciones_inventario does not exist"
**Problema**: No ejecutaste el script SQL
**Solución**: Sigue los pasos 1-3 arriba

### ❌ Error: "permission denied for table verificaciones_inventario"
**Problema**: Las políticas RLS no se crearon correctamente
**Solución**: El script incluye las políticas. Ejecuta el script completo nuevamente.

### ❌ Error: "column activo does not exist in table productos"
**Problema**: La tabla productos no tiene el campo activo
**Solución**: El script lo agrega automáticamente. Ejecuta el script completo.

### ❌ Aún no cargan los productos
**Posibles causas**:
1. **No hay productos en tu base de datos**
   - Solución: Ejecuta `SAMPLE_DATA.sql` para insertar 23 productos de ejemplo
   - O agrega productos manualmente desde Inventario > Nueva Compra

2. **Todos los productos tienen activo = false**
   - Solución: Actualiza productos a activo = true:
   ```sql
   UPDATE productos SET activo = true WHERE activo = false;
   ```

3. **Error de autenticación**
   - Solución: Verifica que estés logueado correctamente
   - Revisa la consola del navegador (F12) para ver errores

### 🔍 Verificar Datos en la Base de Datos

Para verificar que tienes productos activos:

```sql
-- Ver todos los productos activos
SELECT id, nombre, categoria, cantidad_actual, activo
FROM productos
WHERE activo IS DISTINCT FROM false
ORDER BY nombre;

-- Contar productos activos
SELECT COUNT(*) AS total_productos_activos
FROM productos
WHERE activo IS DISTINCT FROM false;
```

---

## 📋 Checklist Final

Antes de reportar un problema, verifica:

- [ ] ✅ Ejecuté el script `VERIFICACION_INVENTARIO_SETUP.sql` completo
- [ ] ✅ Vi la tabla de verificación con 2 tablas, 1 vista, 1 trigger, 2 funciones
- [ ] ✅ Tengo productos en mi base de datos (mínimo 1)
- [ ] ✅ Los productos tienen `activo = true` o `activo = null`
- [ ] ✅ Estoy logueado con un usuario autenticado
- [ ] ✅ Revisé la consola del navegador (F12) y no hay errores en rojo
- [ ] ✅ Actualicé la página después de ejecutar el script

---

## 🎉 Resultado Esperado

Después de seguir estos pasos:

1. ✅ Al hacer clic en **"Nueva Verificación"** deberías ver:
   - Lista completa de productos activos
   - Cantidades actuales de cada producto
   - Resumen con total de productos y valor total
   - Botón "Iniciar Verificación" habilitado

2. ✅ Al hacer clic en **"Iniciar Verificación"**:
   - Se crea el registro de verificación
   - Te redirige a pantalla de conteo físico
   - Puedes navegar producto por producto
   - Puedes ingresar las cantidades encontradas

3. ✅ Al guardar una cantidad física:
   - El sistema calcula automáticamente la diferencia
   - Muestra si hay sobrante o faltante
   - Calcula el valor monetario de la diferencia

---

## 📞 Soporte Adicional

Si después de seguir todos estos pasos el problema persiste:

1. **Revisa la consola del navegador** (F12 > Console)
2. **Copia el mensaje de error exacto**
3. **Verifica las tablas en Supabase**:
   - Ve a **Table Editor** en Supabase
   - Confirma que existen `verificaciones_inventario` y `verificaciones_detalle`
4. **Consulta los logs de Supabase**:
   - Ve a **Logs** > **Postgres Logs** en Supabase
   - Busca errores recientes

---

**Tiempo estimado para aplicar la solución: 5 minutos** ⏱️

✅ **Una vez configurado, funcionará perfectamente y no necesitarás volver a hacer este proceso**

---

## 📚 Archivos Relacionados

- `VERIFICACION_INVENTARIO_SETUP.sql` - Script SQL completo (ejecutar en Supabase)
- `src/components/inventory/NuevaVerificacion.tsx` - Componente para iniciar verificación
- `src/components/inventory/ConteoFisico.tsx` - Componente de conteo físico
- `src/components/inventory/VerificacionesList.tsx` - Lista de verificaciones
- `SAMPLE_DATA.sql` - Datos de ejemplo (incluye 23 productos)

---

**¡Listo! Con esto deberías poder usar el módulo de Verificación Física sin problemas** 🎯
