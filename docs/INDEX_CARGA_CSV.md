# 📚 ÍNDICE - Sistema de Carga CSV Monitoreo

## 🎯 ¿POR DÓNDE EMPEZAR?

### **Para USUARIOS (Setup rápido):**
👉 **Lee primero:** [`SETUP_FINAL_INSTRUCCIONES.md`](./SETUP_FINAL_INSTRUCCIONES.md)

Este archivo te guiará paso a paso en **10 minutos** para cargar tus datos.

---

### **Para ADMINISTRADORES (Checklist):**
👉 **Usa:** [`CHECKLIST_SETUP.md`](./CHECKLIST_SETUP.md)

Checklist visual con checkboxes para verificar cada paso.

---

### **Para DESARROLLADORES (Técnico):**
👉 **Lee:** [`CAMBIOS_IMPLEMENTADOS.md`](./CAMBIOS_IMPLEMENTADOS.md)

Resumen técnico de todos los cambios implementados.

---

## 📂 ESTRUCTURA DE ARCHIVOS

### **📋 Documentación (LEE PRIMERO)**

| Archivo | Descripción | Público |
|---------|-------------|---------|
| **`INDEX_CARGA_CSV.md`** | Este archivo - Índice general | 👥 Todos |
| **`SETUP_FINAL_INSTRUCCIONES.md`** | ⭐ Guía paso a paso (START HERE) | 👤 Usuarios |
| **`CHECKLIST_SETUP.md`** | Checklist visual | 👤 Usuarios |
| **`README_CARGA_CSV.md`** | Documentación completa del sistema | 📖 Referencia |
| **`CAMBIOS_IMPLEMENTADOS.md`** | Resumen técnico de cambios | 👨‍💻 Devs |

---

### **🗄️ Scripts SQL (EJECUTA EN SUPABASE)**

| Archivo | Descripción | ¿Ejecutar? |
|---------|-------------|-----------|
| **`SETUP_COMPLETO_LOTES_SUBLOTES.sql`** | ⭐ Script unificado (RECOMENDADO) | ✅ SÍ |
| `SETUP_LOTES_REALES.sql` | Solo lotes (12) | ⚠️ Opcional |
| `SETUP_SUBLOTES_REALES.sql` | Solo sublotes (36) | ⚠️ Opcional |

**Recomendación:** Usa solo el script completo para evitar errores.

---

### **💻 Código Fuente (NO MODIFICAR)**

| Archivo | Descripción | Función |
|---------|-------------|---------|
| `/utils/csvMonitoreo.ts` | Parser, validador, cargador CSV | Core |
| `/components/monitoreo/CargaCSV.tsx` | Modal de carga UI | UI |
| `/types/monitoreo.ts` | Tipos TypeScript | Types |
| `/utils/calculosMonitoreo.ts` | Cálculos de incidencia/severidad | Logic |

---

## 🚀 GUÍA RÁPIDA (3 PASOS)

### **PASO 1: Ejecuta el script SQL** (5 min)
```
Supabase Dashboard → SQL Editor → New Query
→ Pega: SETUP_COMPLETO_LOTES_SUBLOTES.sql
→ Run
```

### **PASO 2: Recarga la app** (1 min)
```
F5 → Abre consola (F12)
```

### **PASO 3: Carga tu CSV** (4 min)
```
/monitoreo → "Cargar Monitoreos" → Selecciona CSV → "Cargar"
```

**¿Necesitas más detalles?** → Lee [`SETUP_FINAL_INSTRUCCIONES.md`](./SETUP_FINAL_INSTRUCCIONES.md)

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

### **Plagas (~33)**
Se crean automáticamente desde el CSV

---

## 🔍 FORMATO DEL CSV REQUERIDO

### **Columnas Obligatorias**
```
Fecha de monitoreo       → DD/MM/YYYY
Lote                     → "1. Piedra Paula"
Sublote                  → "Sublote 1"
Plaga o enfermedad       → "Verticilium"
Arboles Monitoreados\nA  → Número
Árboles Afectados\nB     → Número
Individuos encontrados\nC → Número
Monitor                  → Nombre
Semana                   → Número
Año                      → Año
Mes                      → Número
```

### **Columnas Opcionales**
```
Observaciones → Texto libre
```

### **Cálculos Automáticos**
```
✅ Incidencia = (Árboles Afectados / Árboles Monitoreados) × 100
✅ Severidad = Individuos Encontrados / Árboles Afectados
✅ Gravedad = Baja (<10%) | Media (10-30%) | Alta (≥30%)
```

---

## 🆘 TROUBLESHOOTING

### **❌ "Filas transformadas: 0"**
👉 **Solución:** [`SETUP_FINAL_INSTRUCCIONES.md`](./SETUP_FINAL_INSTRUCCIONES.md) → Sección "Troubleshooting"

### **❌ "Error en insert"**
👉 **Solución:** Copia el error completo y busca en la documentación

### **❌ "CSV no se sube"**
👉 **Verifica:**
- Formato: `.csv`
- Tamaño: < 10MB
- Encoding: UTF-8

---

## 📈 MÉTRICAS DE ÉXITO

Al finalizar deberías tener:

| Métrica | Valor |
|---------|-------|
| Lotes en BD | 12 |
| Sublotes en BD | 36 |
| Lotes mapeados | 12 |
| Sublotes mapeados | 36 |
| Plagas en catálogo | ~33 |
| Filas transformadas | 2831/2831 |
| Registros insertados | 2831 |
| Dashboard funcional | ✅ |

---

## 🎯 FLUJO COMPLETO

```
┌─────────────────┐
│  Usuario        │
│  selecciona CSV │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  1. PARSE       │  Papa.parse → 2831 filas
│  (2-3 seg)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. VALIDACIÓN  │  Estructura + columnas OK
│  (1 seg)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. MAPEO       │  Lotes (12) + Sublotes (36)
│  (1 seg)        │  + Plagas (33)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. TRANSFORM   │  2831 filas → objetos Monitoreo
│  (2-3 seg)      │  Incidencia + Severidad + Gravedad
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. INSERT      │  Bulk insert a Supabase
│  (10-15 seg)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ✅ ÉXITO       │  2831 registros en BD
│                 │  Dashboard actualizado
└─────────────────┘
```

---

## 🔧 CARACTERÍSTICAS DEL SISTEMA

### **Mapeo Inteligente**
✅ Match exacto: `"1. Piedra Paula"` = `"1. Piedra Paula"`  
✅ Match parcial: `"1. Piedra Paula"` ↔ `"Piedra Paula"`  
✅ Key compuesta: `lote_id|sublote` para sublotes

### **Validación Robusta**
✅ Columnas requeridas  
✅ Formatos de fecha  
✅ Valores numéricos  
⚠️ Warnings para datos opcionales

### **Logging Exhaustivo**
✅ Cada paso registrado  
✅ Identifica problemas específicos  
✅ Fácil de debuggear  
✅ Sin herramientas externas

### **Producción-Ready**
✅ Manejo de errores completo  
✅ Scripts SQL verificados  
✅ Documentación completa  
✅ Testado con datos reales

---

## 📞 SOPORTE

### **Si tienes problemas:**

1. ✅ Lee [`SETUP_FINAL_INSTRUCCIONES.md`](./SETUP_FINAL_INSTRUCCIONES.md)
2. ✅ Revisa [`CHECKLIST_SETUP.md`](./CHECKLIST_SETUP.md)
3. ✅ Busca tu error en "Troubleshooting"
4. ✅ Copia TODOS los logs de consola
5. ✅ Envía logs + descripción del problema

---

## 📚 REFERENCIAS

### **Documentación Técnica**
- **Esquema BD:** `/supabase_tablas.md`
- **Tipos:** `/types/monitoreo.ts`
- **Utils:** `/utils/csvMonitoreo.ts`

### **Documentación de Usuario**
- **Setup:** `SETUP_FINAL_INSTRUCCIONES.md`
- **Checklist:** `CHECKLIST_SETUP.md`
- **README:** `README_CARGA_CSV.md`

### **Código**
- **Parser:** `/utils/csvMonitoreo.ts` (350 líneas)
- **Modal:** `/components/monitoreo/CargaCSV.tsx` (200 líneas)
- **Cálculos:** `/utils/calculosMonitoreo.ts` (100 líneas)

---

## 🎯 SIGUIENTE PASO

### **¿Primera vez?**
👉 Lee: [`SETUP_FINAL_INSTRUCCIONES.md`](./SETUP_FINAL_INSTRUCCIONES.md)

### **¿Setup rápido?**
👉 Usa: [`CHECKLIST_SETUP.md`](./CHECKLIST_SETUP.md)

### **¿Documentación completa?**
👉 Lee: [`README_CARGA_CSV.md`](./README_CARGA_CSV.md)

### **¿Cambios técnicos?**
👉 Lee: [`CAMBIOS_IMPLEMENTADOS.md`](./CAMBIOS_IMPLEMENTADOS.md)

---

**Versión:** 1.0  
**Última actualización:** 2025-11-15  
**Estado:** ✅ Producción  
**Tiempo de setup:** 10 minutos  
**Dificultad:** ⭐ Fácil  
