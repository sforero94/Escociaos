# ✅ SETUP FINAL - Sistema de Carga CSV Monitoreo

## 🎯 RESUMEN EJECUTIVO

**Problema resuelto:** El CSV se parseaba correctamente pero **0 filas se transformaban** porque los nombres de lotes en la BD no coincidían con los del CSV.

**Solución implementada:**
1. ✅ Script SQL para insertar **12 lotes reales** con nomenclatura correcta
2. ✅ Script SQL para insertar **36 sublotes** (3 por lote)
3. ✅ **Mapeo inteligente** de lotes (exacto y parcial)
4. ✅ **Mapeo compuesto** de sublotes (lote_id + nombre)
5. ✅ **Logging exhaustivo** para diagnóstico

---

## 🚀 INSTRUCCIONES FINALES (3 PASOS - 10 MINUTOS)

### **PASO 1: Ejecutar Script SQL en Supabase** ⚡ (5 min)

1. **Abre Supabase Dashboard**
   ```
   https://supabase.com/dashboard/project/[tu-proyecto]
   ```

2. **Ve a SQL Editor**
   - Menú izquierdo → "SQL Editor"
   - Haz clic en **"New Query"**

3. **Ejecuta el script completo**
   - Abre el archivo: `/SETUP_COMPLETO_LOTES_SUBLOTES.sql`
   - Copia TODO el contenido
   - Pégalo en el editor
   - Haz clic en **"Run"** (o Ctrl+Enter)

4. **Verifica el resultado**
   
   Deberías ver al final:
   ```
   ✅ 12 lotes creados:
      1. Piedra Paula
      2. Salto de Tequendama
      3. Australia
      4. La Vega
      5. Pedregal
      6. La Unión
      7. El Triunfo
      8. Irlanda
      9. Irlanda - clonales
      10. Acueducto
      11. Acueducto - clonales
      12. Santa Rosa
   
   ✅ 36 sublotes creados (3 por lote)
   ```

---

### **PASO 2: Recargar la Aplicación** 🔄 (1 min)

1. **Vuelve a tu aplicación web**
2. **Presiona F5** (o Ctrl+R para recargar)
3. **Abre la consola del navegador:**
   - Windows/Linux: `F12` o `Ctrl+Shift+I`
   - Mac: `Cmd+Option+I`
4. **Ve a la pestaña "Console"**

---

### **PASO 3: Cargar el CSV** 📊 (4 min)

1. **Navega a la página de monitoreo:**
   ```
   /monitoreo
   ```

2. **Haz clic en el botón "Cargar Monitoreos"** (esquina superior derecha)

3. **Selecciona tu archivo CSV**

4. **ESPERA Y OBSERVA LA CONSOLA** 👀

   Deberías ver estos logs en secuencia:
   
   ```
   🔵 [CargaCSV] Archivo seleccionado: ...
   🔵 [CargaCSV] Iniciando parseCSVFile...
   ✅ [CargaCSV] CSV parseado exitosamente. Filas: 2831
   🔵 [CargaCSV] Iniciando validación...
   ✅ [CargaCSV] Validación completada: { isValid: true }
   🔵 [CargaCSV] Iniciando carga...
   🔵 [procesarYGuardarCSV] Mapeando lotes y sublotes...
   
   🔍 [mapearLotesYSublotes] Lotes en BD:
      ["1. Piedra Paula", "2. Salto de Tequendama", ...]
   
   🔍 [mapearLotesYSublotes] Lotes en CSV:
      ["1. Piedra Paula", "2. Salto de Tequendama", ...]
   
   ✅ [mapearLotesYSublotes] Match exacto lote: 1. Piedra Paula → 1. Piedra Paula
   ✅ [mapearLotesYSublotes] Match exacto lote: 2. Salto de Tequendama → 2. Salto de Tequendama
   ... (x12 lotes)
   
   ✅ [procesarYGuardarCSV] Lotes mapeados: 12
   ✅ [procesarYGuardarCSV] Sublotes mapeados: 36
   ✅ [procesarYGuardarCSV] Plagas mapeadas: 33
   
   🔵 [procesarYGuardarCSV] Transformando filas...
   ✅ [procesarYGuardarCSV] Filas transformadas: 2831 de 2831 ✅✅✅
   
   🔵 [procesarYGuardarCSV] Insertando en Supabase...
   ✅ [procesarYGuardarCSV] Insertados: 2831 registros
   ```

5. **¿Qué hacer según el resultado?**

   ### ✅ **SI VES "Filas transformadas: 2831 de 2831":**
   - ¡PERFECTO! El sistema está funcionando correctamente
   - Haz clic en el botón **"Cargar 2831 registros"**
   - Espera 10-15 segundos
   - Deberías ver: **"✅ Carga exitosa"**
   - **¡LISTO!** 🎉

   ### ❌ **SI VES "Filas transformadas: 0 de 2831":**
   - Algo salió mal en el mapeo
   - Busca en los logs líneas que empiecen con `❌`
   - Copia TODOS los logs y envíamelos
   - NO continues con la carga

---

## 🔍 VERIFICACIÓN POST-CARGA

### **En Supabase:**

1. **Ve a Table Editor → `monitoreos`**
2. **Verifica que haya ~2831 filas**
3. **Haz clic en algunas filas al azar**
4. **Verifica que tengan:**
   - ✅ `lote_id` (UUID válido)
   - ✅ `sublote_id` (UUID válido)
   - ✅ `plaga_enfermedad_id` (UUID válido)
   - ✅ `fecha_monitoreo` (fecha)
   - ✅ `incidencia` (número)
   - ✅ `gravedad_texto` ('Baja', 'Media', 'Alta')

### **En la Aplicación:**

1. **Recarga `/monitoreo`** (F5)
2. **Verifica que aparezcan:**
   - 📊 Vistas Rápidas
   - 📈 Gráficos de tendencias
   - 🐛 Listado de plagas
3. **Haz clic en "Plagas Críticas"**
4. **Verifica que aparezcan datos reales**

---

## 🚨 TROUBLESHOOTING

### ❌ **Error: "Filas transformadas: 0"**

**Posibles causas:**

1. **Script SQL no ejecutado:**
   - Vuelve al PASO 1
   - Verifica que no haya errores en la ejecución

2. **Nombres de lotes diferentes:**
   - Busca en logs: `❌ [mapearLotesYSublotes] Sin match para lote: XXXX`
   - Copia el nombre exacto que aparece
   - Envíamelo para ajustar el script

3. **Sublotes no coinciden:**
   - Busca en logs: `❌ [transformarFila] Sublote no encontrado: { lote: ..., sublote: ..., key: ... }`
   - Verifica que tu CSV use "Sublote 1", "Sublote 2", "Sublote 3"
   - Si usa otra nomenclatura, envíame ejemplos

---

### ❌ **Error: "Error en insert"**

**Posibles causas:**

1. **Constraint de foreign key:**
   ```
   Error: violates foreign key constraint
   ```
   - Significa que lote_id o sublote_id no existe
   - Revisa que el script SQL se ejecutó correctamente

2. **Formato de fecha incorrecto:**
   ```
   Error: invalid input syntax for type date
   ```
   - Verifica que las fechas en CSV sean: DD/MM/YYYY
   - Ejemplo válido: "15/01/2025"

3. **Valores NULL:**
   ```
   Error: null value in column "XXX" violates not-null constraint
   ```
   - Algún campo requerido está vacío en el CSV
   - Envíame el error completo

---

## 📊 MÉTRICAS DE ÉXITO

| Métrica | Esperado | ¿OK? |
|---------|----------|------|
| Lotes en BD | 12 | ☐ |
| Sublotes en BD | 36 | ☐ |
| Lotes mapeados | 12 | ☐ |
| Sublotes mapeados | 36 | ☐ |
| Plagas creadas | ~33 | ☐ |
| Filas transformadas | 2831/2831 | ☐ |
| Registros insertados | 2831 | ☐ |
| Dashboard funcional | ✅ | ☐ |

---

## 📚 DOCUMENTACIÓN DISPONIBLE

1. **`/CHECKLIST_SETUP.md`** - Checklist visual paso a paso
2. **`/README_CARGA_CSV.md`** - Documentación completa del sistema
3. **`/SETUP_COMPLETO_LOTES_SUBLOTES.sql`** - Script SQL unificado
4. **`/supabase_tablas.md`** - Esquema completo de la base de datos

---

## 🎉 ¡ÉXITO!

Si completaste todos los pasos y todas las métricas están en ✅, el sistema está **100% operativo**.

**Ahora puedes:**
- 📊 Visualizar tendencias de plagas
- 🔍 Analizar incidencias por lote
- 📈 Generar reportes
- 🐛 Monitorear plagas críticas
- ✅ Cumplir con trazabilidad GlobalGAP

---

## 📞 SOPORTE

Si encuentras problemas:

1. ✅ Copia TODOS los logs de consola (desde `🔵 [CargaCSV] Archivo seleccionado` hasta el final)
2. ✅ Haz captura de pantalla del error (si hay)
3. ✅ Indica en qué paso del proceso falló
4. ✅ Envíame toda la información junta

**No te preocupes**, el sistema tiene logging exhaustivo y podré diagnosticar el problema rápidamente.

---

**Versión:** 1.0  
**Última actualización:** 2025-11-15  
**Estado:** ✅ Listo para producción  
**Tiempo estimado:** 10 minutos  
**Dificultad:** ⭐ Fácil  
