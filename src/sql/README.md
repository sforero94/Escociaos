# 📊 Scripts SQL - Escosia Hass

## 🎯 Propósito

Este directorio contiene scripts SQL para configurar y mantener la base de datos de Supabase del sistema Escosia Hass.

---

## 📝 Scripts Disponibles

### 1. `agregar_categorias_productos.sql`

**Propósito:** Agregar las 8 categorías faltantes al ENUM `categoria_producto` para soportar la importación masiva de productos.

**Categorías que agrega:**
- Insecticida - Acaricida
- Biológicos
- Regulador
- Fitorregulador
- Desinfectante
- Enmienda
- Enmienda - regulador
- Maquinaria

**Resultado:** El ENUM pasará de 10 categorías a 18 categorías.

---

## 🚀 Cómo Ejecutar los Scripts

### Opción 1: Supabase Dashboard (Recomendada)

1. **Abre tu proyecto en Supabase:**
   - Ve a [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Selecciona tu proyecto "Escosia Hass"

2. **Accede al SQL Editor:**
   - En el menú lateral, haz clic en **"SQL Editor"**
   - Haz clic en **"New Query"** o **"+ Nueva Consulta"**

3. **Copia el script:**
   - Abre el archivo `/sql/agregar_categorias_productos.sql`
   - Copia TODO el contenido del archivo

4. **Pega y ejecuta:**
   - Pega el script en el editor SQL
   - Haz clic en el botón **"Run"** o presiona `Ctrl+Enter` (Windows/Linux) o `Cmd+Enter` (Mac)

5. **Verifica los resultados:**
   - Deberías ver un mensaje de éxito
   - Al final del script hay una consulta SELECT que muestra todas las categorías
   - Verifica que aparezcan las 18 categorías

### Opción 2: CLI de Supabase

```bash
# Si tienes Supabase CLI instalado
supabase db push --db-url "tu_connection_string"

# O ejecutar directamente
psql -h db.xxx.supabase.co -U postgres -d postgres -f agregar_categorias_productos.sql
```

---

## ⚠️ Notas Importantes

### PostgreSQL < 14
Si tu versión de PostgreSQL es anterior a la 14, el comando `IF NOT EXISTS` no está disponible. En ese caso:

1. **Ejecuta cada `ALTER TYPE` línea por línea**
2. **Ignora los errores de duplicados** (error 42710)
3. O usa el formato alternativo que está comentado al final del script

### Errores Comunes

**Error: "type already exists"**
- ✅ Esto es normal si ya ejecutaste el script antes
- ✅ Simplemente ignóralo y continúa

**Error: "permission denied"**
- ❌ Necesitas permisos de administrador
- ❌ Asegúrate de estar usando el usuario correcto

**Error: "syntax error"**
- ❌ Verifica que copiaste TODO el script completo
- ❌ Asegúrate de no haber cortado ninguna línea

---

## 🔄 Orden de Ejecución

Si tienes múltiples scripts en el futuro, ejecuta en este orden:

1. ✅ `agregar_categorias_productos.sql` (primero)
2. Otros scripts de configuración...
3. Scripts de datos de prueba (si existen)

---

## ✅ Verificación Post-Ejecución

Después de ejecutar el script, verifica que todo funciona:

1. **En Supabase Dashboard:**
   - Ve a **Table Editor** → **productos**
   - Intenta crear un producto nuevo
   - En el campo `categoria`, deberías ver las 18 opciones

2. **En la aplicación:**
   - Ve a **Inventario** → **Importar Productos**
   - Descarga la plantilla CSV
   - Verifica que las notas mencionen las 18 categorías
   - Intenta importar un CSV con las nuevas categorías

---

## 📞 Soporte

Si tienes problemas ejecutando los scripts:

1. Verifica que tienes permisos de administrador en Supabase
2. Revisa los logs de error en el SQL Editor
3. Consulta la documentación oficial: [Supabase SQL Editor](https://supabase.com/docs/guides/database/sql)

---

**Última actualización:** 2025-11-19  
**Versión:** 1.0.0  
**Proyecto:** Escosia Hass - Sistema de Gestión Integral
