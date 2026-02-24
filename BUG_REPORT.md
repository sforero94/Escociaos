# Bug Report: Reporte Semanal Module - Critical Issues

**Date:** 2026-02-24  
**Status:** Multiple critical bugs unresolved  
**Priority:** HIGH

---

## Executive Summary

The Reporte Semanal (Weekly Report) module has multiple critical data flow and rendering issues that prevent it from functioning correctly. Despite multiple attempted fixes, the following issues persist:

1. **Personal details (Fallas/Permisos) not appearing in PDF**
2. **Labores Programadas showing "—" for Tipo and Lotes columns**
3. **Closed applications cost calculations incorrect**
4. **Sublote monitoring view showing only 1 observation instead of 3**
5. **Report saving fails with RLS errors**
6. **PDF download broken**

---

## Issue 1: Fallas/Permisos Details Missing in Report

### Problem
User enters fallas (absences) and permisos (permissions) details in the wizard (Step 1), including:
- Employee names
- Reasons/motives

These details appear correctly in the wizard UI but are **NOT** appearing in the generated PDF report. The PDF shows empty tables with "undefined" for employee names.

### Data Flow
1. **Wizard Input** (`ReporteSemanalWizard.tsx`, lines ~400-500)
   - User inputs: `fallas`, `permisos` counts + `detalleFallas[]`, `detallePermisos[]` arrays
   - Each detail has: `{ empleado: string, razon?: string }`

2. **Data Aggregation** (`fetchDatosReporteSemanal.ts`, lines ~1280-1360)
   ```typescript
   return {
     semana,
     personal: {
       ...personalBase,
       fallas,
       permisos,
       detalleFallas,      // ← Passed correctly
       detallePermisos,    // ← Passed correctly
       // ...
     }
   }
   ```

3. **Edge Function** (`generar-reporte-semanal.tsx`)
   - **CURRENTLY:** Does NOT read `detalleFallas` or `detallePermisos` from the data
   - **ATTEMPTED FIX:** Added explicit handling (lines ~69-84), but still not appearing

4. **PDF Generation**
   - Uses Gemini to generate HTML
   - HTML template for fallas/permisos shows empty data

### Root Cause Analysis
The Edge Function receives the data but may not be:
- Properly formatting it for the Gemini prompt
- The Gemini prompt template doesn't instruct showing the details
- HTML template may have incorrect data structure access

### Files to Check
- `src/supabase/functions/server/generar-reporte-semanal.tsx` - `formatearDatosParaPrompt()` function
- `construirSlidePersonal()` function in same file

---

## Issue 2: Labores Programadas - Empty Tipo and Lotes

### Problem
In the "Labores Programadas" slide of the PDF:
- **Nombre** shows correctly (e.g., "Visita ICA", "Zanjas")
- **Tipo** column shows "—" (should show task type like "Mantenimiento", "Fumigación")
- **Lotes** column shows "—" (should show comma-separated lot names)

### Data Flow
1. **Database Query** (`fetchDatosReporteSemanal.ts`, lines ~175-191)
   ```typescript
   const { data: tareas } = await supabase
     .from('vista_tareas_resumen')
     .select(`
       id,
       codigo_tarea,
       nombre,
       estado,
       fecha_estimada_inicio,
       fecha_estimada_fin,
       fecha_inicio_real,
       fecha_fin_real,
       lote_nombres,        // ← Field from view
       tipo_tarea_nombre    // ← Field from view
     `)
   ```

2. **Data Transformation** (lines ~218-232)
   ```typescript
   resultado.push({
     id: t.id,
     codigoTarea: t.codigo_tarea,
     nombre: t.nombre,
     tipoTarea: (t as any).tipo_tarea_nombre || 'Sin tipo',  // ← May be undefined
     lotes: lotesNombres,  // ← Parsed from t.lote_nombres
   })
   ```

3. **Edge Function Processing** (`generar-reporte-semanal.tsx`, lines ~118-128)
   ```typescript
   datos.labores.programadas.forEach((labor: any) => {
     const tipoTarea = labor.tipoTarea || labor.tipo || 'Sin tipo';
     const lotesStr = (labor.lotes || []).join(', ') || 'Sin lotes';
   ```

### Root Cause Analysis
**LIKELY:** The database view `vista_tareas_resumen` is not returning `tipo_tarea_nombre` or `lote_nombres` as expected.

**Debug Steps:**
1. Check if `vista_tareas_resumen` actually returns these fields
2. Log the raw data from Supabase query
3. Verify field names match exactly (case-sensitive)

### Screenshot Evidence
User screenshot shows:
```
Nombre          Tipo    Estado      Inicio      Fin         Lotes
Visita ICA      —       Terminada   2026-01-19  2026-02-20  —
Zanjas          —       En proceso  2026-01-21  2026-07-04  —
```

---

## Issue 3: Closed Applications Cost Calculations Wrong

### Problem
For closed applications (aplicaciones cerradas) in the report:
- Planned costs for materials (insumos) not calculated correctly
- Mano de Obra (labor) costs showing same value for planned and real
- Costo Total = Costo Insumos + Costo Mano de Obra, but each should be compared separately
- Grand totals missing from tables

### Current Behavior
From screenshot of "Plan: Fumigación N°2 (Floración)":
- Lista de Compras shows products with "Costo Est." column showing $0 for all items
- Costo por litro and Costo por árbol showing "—" (not calculated)

### Expected Behavior
- Costo Total = Costo Pedido (purchase) + Valor Inventario (inventory used)
- Should show breakdown: Insumos vs Mano de Obra vs Total
- Should calculate: Costo por litro/kg and Costo por árbol

### Data Flow
1. **Query** (`fetchDatosReporteSemanal.ts`, `fetchAplicacionesCerradas()`)
   - Fetches `aplicaciones` with `costo_total_insumos`, `costo_total_mano_obra`
   - Distributes costs by lote weight

2. **Calculations** (lines ~800-850, PREVIOUSLY FIXED)
   ```typescript
   // FIXED: Calculate planned MO cost from planned jornales * average cost per jornal
   const avgCostoJornal = totalJornalesReal > 0 ? costoManoObraTotal / totalJornalesReal : 50000;
   const costoLoteManoObraPlan = jornalesPlan * avgCostoJornal;  // ← Was copying real value
   ```

3. **Grand Totals Added** (lines ~849-888)
   - Added `TOTAL` row to KPI table
   - Added `TOTAL` row to Financial table

### Issue: Planned Applications (Not Closed)
For planned (not closed) applications, costs not calculated at all.
- Shows $0 for all items
- Missing cost per litro/kg and cost per arbol

---

## Issue 4: Sublote View Shows Only 1 Observation

### Problem
In the monitoreo por sublote slide:
- Should show 3 observations per cell (for 3 monitoring dates)
- Currently shows only 1 observation per cell

### Data Structure
**Correct Structure** (from `buildVistasPorSublote()` in `fetchDatosReporteSemanal.ts`):
```typescript
interface VistaMonitoreoSublote {
  loteId: string;
  loteNombre: string;
  sublotes: string[];    // Column names
  plagas: string[];      // Row names  
  celdas: Record<string, Record<string, ObservacionFecha[]>>;
  // celdas[plaga][sublote] = [obs1, obs2, obs3]
}

interface ObservacionFecha {
  fecha: string;
  incidencia: number | null;
}
```

### Edge Function Bug
**File:** `generar-reporte-semanal.tsx`

**Line ~1218:** Wrong data source
```typescript
// WRONG:
const vistasPorSublote: any[] = monitoreo?.detallePorLote || [];

// SHOULD BE:
const vistasPorSublote: any[] = monitoreo?.vistasPorSublote || [];
```

**Function `construirSlideMonitoreoPorSublote()` (lines ~1099-1139):**
- Was expecting wrong data structure
- Fixed to use `loteVista.celdas[plaga][sublote]`

---

## Issue 5: RLS Policy Errors on Save

### Error Message
```
No se pudo guardar en almacenamiento: Error al guardar metadatos: 
new row violates row-level security policy (USING expression) 
for table "reportes_semanales"
```

### SQL Migration File
**File:** `src/sql/migrations/018_create_reportes_semanales.sql`

Current policies:
```sql
-- INSERT policy - should work
CREATE POLICY "Authenticated users can create reports"
  ON reportes_semanales FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE policy - ATTEMPTED FIX
CREATE POLICY "Users can update own reports"
  ON reportes_semanales FOR UPDATE
  TO authenticated
  USING (true)  -- Changed from (generado_por = auth.uid())
  WITH CHECK (generado_por = auth.uid());
```

### Root Cause
Upsert operation fails because:
1. If record exists → tries UPDATE
2. UPDATE policy requires `USING (true)` or ownership check
3. Original policy had `USING (generado_por = auth.uid())` which fails for upsert

### ATTEMPTED FIXES
1. Changed UPDATE policy to `USING (true)` ✓
2. Added fallback in `reporteSemanalService.ts` to try insert-only if upsert fails ✓
3. Added detailed error logging ✓

**Still failing** - User reports SQL was run but error persists.

---

## Issue 6: PDF Download Broken

### Problem
PDF download not working after report generation.

### Potential Causes
1. **RLS on Storage Bucket:** `reportes-semanales` bucket may have restrictive policies
2. **Missing File:** File not saved to storage before download attempt
3. **CORS Issues:** Browser blocking download from Supabase storage

### Storage Policies (File: `019_storage_policies_reportes.sql`)
```sql
CREATE POLICY "Authenticated users can upload reports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'reportes-semanales');

CREATE POLICY "Authenticated users can read reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'reportes-semanales');
```

---

## Attempted Fixes Summary

### By Previous Agent:

1. ✅ **RLS Policy Update** - Added UPDATE policy for upsert
2. ✅ **Cost Calculation Fix** - Fixed MO planned cost calculation (was copying real value)
3. ✅ **Grand Totals** - Added TOTAL rows to KPI and Financial tables
4. ✅ **Monitoreo Order** - Fixed to show oldest→newest (WORKING)
5. ✅ **Sublote Data Structure** - Fixed Edge Function to use correct data structure
6. ⚠️ **Fallas/Permisos** - Added to prompt but NOT appearing in PDF
7. ⚠️ **Labores Tipo/Lotes** - Debug logging added but root cause not found
8. ⚠️ **Planned App Costs** - Partial fix, still showing $0

---

## Recommended Next Steps

### Priority 1: Fix Data Flow Issues

1. **Verify Database Views:**
   ```sql
   -- Check if vista_tareas_resumen returns expected fields
   SELECT id, codigo_tarea, nombre, tipo_tarea_nombre, lote_nombres
   FROM vista_tareas_resumen
   LIMIT 5;
   ```

2. **Add Console Logging:**
   - In browser, check what `detalleFallas` and `labores.programadas` contain before sending to Edge Function
   - Log the actual data structure received by Edge Function

3. **Test Edge Function Locally:**
   ```bash
   supabase functions serve generar-reporte-semanal
   ```

### Priority 2: Fix RLS Issues

1. **Verify policies applied:**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'reportes_semanales';
   ```

2. **Test insert manually:**
   ```sql
   -- As authenticated user
   INSERT INTO reportes_semanales (fecha_inicio, fecha_fin, numero_semana, ano, generado_por, url_storage)
   VALUES ('2025-01-01', '2025-01-07', 1, 2025, auth.uid(), 'test/path.pdf');
   ```

### Priority 3: Verify Cost Data

1. Check if `aplicaciones_compras` has `costo_estimado` values
2. Verify `aplicaciones_calculos` has correct totals
3. Check if inventory values are available for cost calculation

---

## Files Modified (With Issues)

| File | Lines | Changes | Status |
|------|-------|---------|--------|
| `src/sql/migrations/018_create_reportes_semanales.sql` | 49-60 | Added UPDATE policy | Applied? |
| `src/utils/fetchDatosReporteSemanal.ts` | ~800-888 | Fixed MO cost, added totals | Need verification |
| `src/supabase/functions/server/generar-reporte-semanal.tsx` | ~69-84, ~1099-1140 | Fixed fallas/permisos, sublote | Need Edge Function deploy |
| `src/utils/reporteSemanalService.ts` | ~173-260 | Added RLS fallback | Need verification |

---

## Environment

- **Frontend:** React + Vite + TypeScript + Tailwind
- **Backend:** Supabase (PostgreSQL + Edge Functions)
- **AI:** Gemini for HTML generation
- **PDF:** html2pdf.js for conversion
- **Port:** 3002 (running locally)

---

## User's Main Complaint

> "NOTHING works. The LITERAL ONLY FIX YOU DID WAS SORTING THE MONITOREO OBSERVATIONS RIGHT"

**Confirmed Working:**
- ✅ Monitoreo column order (oldest→newest)

**Still Broken:**
- ❌ Fallas/Permisos details in PDF
- ❌ Labores Tipo and Lotes showing "—"
- ❌ Cost calculations for planned apps
- ❌ Sublote multiple observations
- ❌ Report saving (RLS errors)
- ❌ PDF download

---

## End of Report

**Next Action Required:** Deploy Edge Function and verify data structures in browser console.
