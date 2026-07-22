# 🚀 SETUP COMPLETO - Sistema de Monitoreo CSV

## ✅ PROBLEMA IDENTIFICADO

**Diagnóstico:** 0 de 2831 filas transformadas ❌

**Causa:** Nombres de lotes en CSV no coinciden con nombres en BD:
- CSV: `"1. Piedra Paula"`, `"2. Salto de Tequendama"`, etc.
- BD: `"Lote 1"`, `"Lote 2"`, etc. (placeholders)

---

## 📋 SOLUCIÓN: 3 PASOS

### **PASO 1: Ejecutar Script SQL en Supabase** ⚡

1. **Abre el SQL Editor de Supabase:**
   ```
   Tu Proyecto → SQL Editor → New Query
   ```

2. **Copia y pega** el contenido del archivo `/SETUP_LOTES_REALES.sql`

3. **Ejecuta el script** (botón Run o Ctrl+Enter)

4. **Verifica** que se insertaron 12 lotes:
   ```sql
   SELECT numero_orden, nombre, activo 
   FROM lotes 
   ORDER BY numero_orden;
   ```

   Deberías ver:
   ```
   1  | 1. Piedra Paula
   2  | 2. Salto de Tequendama
   3  | 3. Australia
   4  | 4. La Vega
   5  | 5. Pedregal
   6  | 6. La Unión
   7  | 7. El Triunfo
   8  | 8. Irlanda
   9  | 8. Irlanda - clonales
   10 | 9. Acueducto
   11 | 9. Acueducto - clonales
   12 | 10. Santa Rosa
   ```

---

### **PASO 2: Crear Sublotes** 📍

**⚠️ NECESITO TU AYUDA:**

Tu CSV tiene sublotes como:
- `"Sublote 1"`
- `"Sublote 2"`
- `"Sublote 3"`
- etc.

**¿Qué sublotes tiene cada lote?**

Por ejemplo:
```
Lote "1. Piedra Paula":
  - Sublote 1
  - Sublote 2
  - Sublote 3

Lote "2. Salto de Tequendama":
  - Sublote 1
  - Sublote 2
```

**Una vez que me des esta información, crearé un script SQL para insertar todos los sublotes.**

**ALTERNATIVA:** Si cada sublote es único globalmente (ej: solo hay UN "Sublote 1" en todo el cultivo), dímelo y ajustaré el código.

---

### **PASO 3: Recargar y Probar** 🔄

Una vez que tengas lotes y sublotes:

1. **Recarga la aplicación** (F5)
2. **Navega a** `/monitoreo`
3. **Haz clic en** "Cargar Monitoreos"
4. **Selecciona tu CSV**
5. **Revisa los logs en consola:**

   Deberías ver:
   ```
   ✅ Match exacto lote: 1. Piedra Paula → 1. Piedra Paula
   ✅ Match exacto lote: 2. Salto de Tequendama → 2. Salto de Tequendama
   ...
   ✅ Filas transformadas: 2831 de 2831
   ```

6. **Haz clic en "Cargar X registros"**
7. **Espera la confirmación** ✅

---

## 🔧 MEJORAS IMPLEMENTADAS

### **1. Mapeo Inteligente de Lotes**

Ahora el sistema hace match de 3 formas:

1. **Exacto:** `"1. Piedra Paula"` = `"1. Piedra Paula"` ✅
2. **Parcial:** `"1. Piedra Paula"` contiene `"Piedra Paula"` ✅
3. **Inverso:** `"Piedra Paula"` está en `"1. Piedra Paula"` ✅

### **2. Logging Completo**

Cada match se registra en consola:
- ✅ Verde = Match exitoso
- ⚠️ Amarillo = Match parcial (funciona pero revísalo)
- ❌ Rojo = Sin match (no se procesará esa fila)

### **3. Validación Detallada**

Antes de insertar, el sistema te muestra:
- Lotes detectados vs lotes mapeados
- Sublotes detectados vs sublotes mapeados
- Plagas únicas (se crean automáticamente)
- Filas que no se pueden transformar (primeras 5)

---

## 📝 SIGUIENTE ACCIÓN

**¿Podrías enviarme la estructura de sublotes?**

Necesito saber:
1. ¿Cuántos sublotes tiene cada lote?
2. ¿Cómo se llaman?

Con eso crearé el script SQL de sublotes y el sistema estará 100% funcional.

---

## 🆘 SOPORTE

Si algo falla:
1. Copia TODOS los logs de la consola
2. Envíamelos
3. Te ayudaré a resolver el problema específico

---

**Estado actual: 🟡 LISTO PARA EJECUTAR PASO 1**
