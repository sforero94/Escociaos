# ✅ CHECKLIST DE SETUP - Carga CSV Monitoreo

## 🎯 OBJETIVO
Cargar 2831 registros de monitoreo desde CSV a Supabase

---

## 📋 CHECKLIST (3 pasos - 10 minutos)

### ☐ **PASO 1: Ejecutar Script SQL** (5 min)

1. ☐ Abre Supabase Dashboard
2. ☐ Ve a **SQL Editor** (menú izquierdo)
3. ☐ Haz clic en **"New Query"**
4. ☐ Copia el contenido de `/SETUP_COMPLETO_LOTES_SUBLOTES.sql`
5. ☐ Pégalo en el editor
6. ☐ Haz clic en **"Run"** (o Ctrl+Enter)
7. ☐ Espera mensaje de éxito
8. ☐ Verifica que muestre:
   - ✅ 12 lotes creados
   - ✅ 36 sublotes creados
   - ✅ Todos los estados "OK"

---

### ☐ **PASO 2: Recargar Aplicación** (1 min)

1. ☐ Vuelve a tu aplicación web
2. ☐ Presiona **F5** (o Ctrl+R)
3. ☐ Abre la **consola del navegador** (F12)
4. ☐ Navega a `/monitoreo`

---

### ☐ **PASO 3: Cargar CSV** (4 min)

1. ☐ Haz clic en **"Cargar Monitoreos"**
2. ☐ Selecciona tu archivo CSV
3. ☐ Espera a que termine el parsing (~2 seg)
4. ☐ **REVISA LOS LOGS EN CONSOLA:**

   **Logs que debes ver:**
   ```
   ✅ CSV parseado exitosamente. Filas: 2831
   ✅ Validación completada: isValid: true
   ✅ Lotes mapeados: 12 (o el número que uses)
   ✅ Sublotes mapeados: 36
   ✅ Plagas mapeadas: 33
   ✅ Filas transformadas: 2831 de 2831 ← ¡CRÍTICO!
   ```

5. ☐ Si ves **"Filas transformadas: 2831"**, continúa
6. ☐ Si ves **"Filas transformadas: 0"**, DETENTE y avísame
7. ☐ Haz clic en **"Cargar 2831 registros"**
8. ☐ Espera la inserción (~10-15 seg)
9. ☐ Espera mensaje: **"✅ Carga exitosa"**

---

## 🔍 VERIFICACIÓN POST-CARGA

### ☐ **En Supabase:**

1. ☐ Ve a **Table Editor** → **monitoreos**
2. ☐ Verifica que hay ~2831 filas
3. ☐ Haz clic en algunas filas al azar
4. ☐ Verifica que tengan:
   - ✅ `lote_id` (UUID)
   - ✅ `sublote_id` (UUID)
   - ✅ `plaga_enfermedad_id` (UUID)
   - ✅ `fecha_monitoreo` (fecha)
   - ✅ `incidencia` (número)

### ☐ **En la Aplicación:**

1. ☐ Recarga `/monitoreo` (F5)
2. ☐ Verifica que aparezcan las **Vistas Rápidas**:
   - Plagas Críticas
   - Tendencias Recientes
   - Alertas Activas
3. ☐ Haz clic en alguna vista rápida
4. ☐ Verifica que los datos se muestren correctamente

---

## 🚨 TROUBLESHOOTING

### ❌ **Si ves "Filas transformadas: 0"**

**Causas posibles:**

1. **Lotes no coinciden:**
   - Busca en los logs: `❌ Sin match para lote: XXXX`
   - Solución: Dime qué lote falla y lo arreglo

2. **Sublotes no coinciden:**
   - Busca en los logs: `❌ Sin match para sublote: XXXX`
   - Solución: Verifica que el CSV use "Sublote 1", "Sublote 2", "Sublote 3"

3. **Script SQL no ejecutado:**
   - Solución: Vuelve al PASO 1

---

### ❌ **Si el CSV no se sube**

1. Verifica el tamaño del archivo (máx ~10MB)
2. Verifica que sea formato CSV
3. Revisa la consola por errores de parsing

---

### ❌ **Si la inserción falla**

**Busca en los logs:**
```
❌ [procesarYGuardarCSV] Error en insert: XXXXX
```

**Causas comunes:**
- Constraint de foreign key (lote/sublote/plaga no existe)
- Formato de fecha incorrecto
- Valores NULL en campos requeridos

**Solución:** Copia el error completo y envíamelo.

---

## 📊 MÉTRICAS DE ÉXITO

Al finalizar deberías tener:

| Métrica | Valor Esperado | ¿OK? |
|---------|---------------|------|
| Lotes en BD | 12 | ☐ |
| Sublotes en BD | 36 | ☐ |
| Plagas en catálogo | ~33 | ☐ |
| Registros en `monitoreos` | 2831 | ☐ |
| Filas transformadas | 2831/2831 | ☐ |
| Dashboard funcional | ✅ | ☐ |

---

## 🎉 ¡TODO LISTO!

Si todos los checkboxes están marcados, el sistema está **100% operativo**.

Puedes proceder a:
- ✅ Ver tendencias de plagas
- ✅ Analizar incidencias
- ✅ Generar reportes
- ✅ Crear vistas rápidas personalizadas

---

**Tiempo estimado total: ~10 minutos**
**Dificultad: ⭐ Fácil**
**Requisitos: Acceso a Supabase Dashboard + Consola del navegador**
