# 📊 Sistema de Carga CSV - Monitoreo de Plagas
## Escosia Hass - Gestión Integral de Aguacate

---

## 🎯 ¿QUÉ HACE ESTE SISTEMA?

Permite cargar masivamente registros de monitoreo de plagas desde un archivo CSV de Excel, con:

✅ **Validación automática** de estructura  
✅ **Mapeo inteligente** de lotes y sublotes  
✅ **Creación automática** de plagas nuevas  
✅ **Cálculos automáticos** de incidencia, severidad y gravedad  
✅ **Trazabilidad completa** para certificación GlobalGAP  

---

## 📋 ARCHIVOS DEL SISTEMA

### **Scripts SQL**
1. **`SETUP_LOTES_REALES.sql`** - Inserta 12 lotes del cultivo
2. **`SETUP_SUBLOTES_REALES.sql`** - Inserta 36 sublotes (3 por lote)
3. **`SETUP_COMPLETO_LOTES_SUBLOTES.sql`** - ⭐ Todo en uno (recomendado)

### **Documentación**
1. **`INSTRUCCIONES_SETUP_COMPLETO.md`** - Guía paso a paso detallada
2. **`CHECKLIST_SETUP.md`** - ⭐ Checklist visual (start here!)
3. **`README_CARGA_CSV.md`** - Este archivo

### **Código**
1. **`/utils/csvMonitoreo.ts`** - Parser, validador y cargador
2. **`/components/monitoreo/CargaCSV.tsx`** - Modal de carga
3. **`/types/monitoreo.ts`** - Tipos TypeScript

---

## 🚀 INICIO RÁPIDO (10 minutos)

### **1. Ejecuta el script SQL** (5 min)
```
Supabase → SQL Editor → New Query
→ Pega: SETUP_COMPLETO_LOTES_SUBLOTES.sql
→ Run
```

### **2. Recarga la app** (1 min)
```
F5 en tu navegador
Abre consola (F12)
```

### **3. Carga tu CSV** (4 min)
```
/monitoreo → "Cargar Monitoreos" → Selecciona CSV → "Cargar"
```

**¡Listo! ✅**

---

## 📊 ESTRUCTURA DE DATOS

### **Lotes (12)**
```
1. Piedra Paula
2. Salto de Tequendama
3. Australia
4. La Vega
5. Pedregal
6. La Unión
7. El Triunfo
8. Irlanda
8. Irlanda - clonales
9. Acueducto
9. Acueducto - clonales
10. Santa Rosa
```

### **Sublotes (36 = 12 × 3)**
Cada lote tiene:
- Sublote 1
- Sublote 2
- Sublote 3

### **Plagas**
Se crean automáticamente desde el CSV

---

## 🔍 FORMATO DEL CSV

### **Columnas Requeridas**
- `Fecha de monitoreo` - Formato: DD/MM/YYYY
- `Lote` - Ej: "1. Piedra Paula"
- `Sublote` - Ej: "Sublote 1"
- `Plaga o enfermedad` - Ej: "Verticilium"
- `Arboles Monitoreados\nA` - Número
- `Árboles Afectados\nB` - Número
- `Individuos encontrados\nC` - Número
- `Monitor` - Nombre del monitor
- `Semana` - Número de semana
- `Año` - Año
- `Mes` - Número de mes

### **Columnas Opcionales**
- `Observaciones` - Texto libre
- `Gravedad` - Calculado automáticamente
- `Incidencia` - Calculado automáticamente
- `Severidad` - Calculado automáticamente

---

## 🧮 CÁLCULOS AUTOMÁTICOS

El sistema calcula automáticamente:

### **1. Incidencia**
```
Incidencia = (Árboles Afectados / Árboles Monitoreados) × 100
```

### **2. Severidad**
```
Severidad = Individuos Encontrados / Árboles Afectados
```

### **3. Gravedad**
```
Baja:   Incidencia < 10%
Media:  10% ≤ Incidencia < 30%
Alta:   Incidencia ≥ 30%
```

---

## 🔧 CARACTERÍSTICAS TÉCNICAS

### **Mapeo Inteligente de Lotes**

El sistema puede hacer match de 3 formas:

1. **Exacto:** `"1. Piedra Paula"` = `"1. Piedra Paula"` ✅
2. **Parcial:** CSV `"1. Piedra Paula"` ↔ BD `"Piedra Paula"` ✅
3. **Inverso:** CSV `"Piedra Paula"` ↔ BD `"1. Piedra Paula"` ✅

### **Validación de Estructura**

Antes de cargar, el sistema valida:
- ✅ Columnas requeridas presentes
- ✅ Formatos de fecha correctos
- ✅ Valores numéricos válidos
- ⚠️ Warnings para datos faltantes opcionales

### **Inserción en Lotes**

Para archivos grandes (2000+ filas):
- Usa inserción en bulk para mejor rendimiento
- Maneja errores por fila sin detener todo
- Reporta estadísticas de éxito/fallo

---

## 📈 MÉTRICAS DE RENDIMIENTO

| Métrica | Valor Típico |
|---------|--------------|
| Tiempo de parsing | ~2-3 segundos |
| Tiempo de validación | ~1 segundo |
| Tiempo de inserción (2831 filas) | ~10-15 segundos |
| **Total** | **~15-20 segundos** |

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### **❌ Problema: "Filas transformadas: 0"**

**Causa:** Nombres de lotes/sublotes no coinciden

**Solución:**
1. Revisa los logs de consola
2. Busca líneas: `❌ Sin match para lote: XXXX`
3. Verifica que el script SQL se ejecutó correctamente
4. Verifica nombres en Supabase vs CSV

---

### **❌ Problema: "Error en insert"**

**Causa:** Constraint de foreign key o valor inválido

**Solución:**
1. Copia el error completo de la consola
2. Verifica que lotes y sublotes existen
3. Revisa formatos de fecha (DD/MM/YYYY)
4. Verifica valores numéricos

---

### **❌ Problema: CSV no se sube**

**Causa:** Tamaño o formato incorrecto

**Solución:**
1. Verifica que sea formato `.csv`
2. Tamaño máximo: ~10MB
3. Encoding: UTF-8
4. Separador: coma (`,`)

---

## 📚 DOCUMENTACIÓN ADICIONAL

### **Para Desarrollo**
- Ver código en: `/utils/csvMonitoreo.ts`
- Tipos: `/types/monitoreo.ts`
- UI: `/components/monitoreo/CargaCSV.tsx`

### **Para Usuarios**
- Checklist: `CHECKLIST_SETUP.md`
- Guía completa: `INSTRUCCIONES_SETUP_COMPLETO.md`

### **Para Base de Datos**
- Esquema completo: `/supabase_tablas.md`
- Scripts: `SETUP_*.sql`

---

## 🎯 SIGUIENTE PASO

**Lee el checklist:** [`CHECKLIST_SETUP.md`](./CHECKLIST_SETUP.md)

Es un checklist visual paso a paso que te guía en 10 minutos. ✅

---

## 📞 SOPORTE

Si encuentras problemas:

1. ✅ Revisa el checklist
2. ✅ Lee las instrucciones completas
3. ✅ Copia los logs de consola
4. ✅ Envía los logs y descripción del problema

---

**Versión:** 1.0  
**Última actualización:** 2025-11-15  
**Estado:** ✅ Producción  
**Autor:** Sistema Escosia Hass  
