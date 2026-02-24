# Plan: Automatic Weekly Report with Stunning HTML Design

## Context

The current weekly report system works end-to-end but has two problems:
1. **Design quality**: Gemini is asked to generate both the analysis *and* the HTML. This produces inconsistent, generic layouts that ignore the Escocia OS design system.
2. **No automation**: The wizard is purely manual. The user wants the report pre-generated every Monday.

The goal is to split Gemini's job — it handles analysis only (returns structured JSON), while a deterministic TypeScript template handles rendering (consistent, beautiful HTML following `STYLES.md`). A one-click "Generar Rápido" button replaces the 4-step wizard for routine weekly generation. PDF conversion stays in the browser (html2pdf.js) to avoid server-side headless browser complexity and Vercel free-tier execution costs.

---

## Architecture: Before → After

```
BEFORE:
  Frontend data → Edge Function → Gemini (analysis + HTML) → html2pdf → Storage (PDF)

AFTER (manual):
  Frontend data → Edge Function → Gemini (JSON analysis) → TS HTML Template → html2pdf → Storage (PDF)

AFTER (quick-generate):
  "Generar Rápido" button → Edge Function → DB queries → Gemini (JSON analysis)
                          → TS HTML Template → Storage (HTML)
                          → HistorialReportes shows new entry
                          → User clicks download → fetch HTML → html2pdf → PDF
```

No new libraries. No server-side PDF generation. Fully additive changes.

---

## Step 1: Change Gemini's Role — Return JSON Analysis

**File:** `supabase/functions/make-server-1ccce916/generar-reporte-semanal.ts`

Replace `SYSTEM_PROMPT` and `llamarGemini()` to produce structured JSON instead of HTML:

```typescript
// New Gemini output schema
interface AnalisisGemini {
  resumen_ejecutivo: string;           // 2-3 sentences
  highlights: string[];               // 3-5 bullet points
  alertas: Array<{
    nivel: 'urgente' | 'atencion' | 'ok';
    titulo: string;
    descripcion: string;
    accion?: string;
  }>;
  analisis_jornales: string;           // 1-2 paragraphs
  analisis_aplicaciones: string | null;
  analisis_monitoreo: string;
  recomendaciones: string[];           // 3-5 items
  narrativa_semana: string;            // Closing paragraph
}
```

New prompt instructs Gemini to respond with **only valid JSON**, no markdown, no HTML. Uses `responseMimeType: "application/json"` in Gemini API call to enforce it.

---

## Step 2: Build the TypeScript HTML Template

**File (new):** `supabase/functions/make-server-1ccce916/generar-reporte-html.ts`

A pure TypeScript function:
```typescript
export function generarHTMLReporte(
  datos: DatosReporteSemanal,
  analisis: AnalisisGemini
): string
```

Design follows `STYLES.md` → **Escocia OS style**:
- Font: Visby CF from `https://fonts.cdnfonts.com/s/19460/`
- Colors: `#F8FAF5` bg, `#73991C` primary, `#BFD97D` secondary, `#172E08` text, `#E7EDDD` muted
- Cards with `border-radius: 1rem`, `border: 1px solid rgba(115,153,28,0.1)`
- Badges: lime green pills for section labels
- Print CSS: `@media print` with `page-break-before` at each section
- A4-optimized: 210mm width, 15mm margins

**Sections rendered by template (not AI):**
1. Cover — week dates + resumen_ejecutivo + highlights chips
2. Alertas — colored cards (red/yellow/green) from `analisis.alertas`
3. Personal — summary boxes (total, empleados, contratistas, fallas, permisos)
4. Distribución de Jornales — full matrix table with totals row/column
5. Aplicaciones — progress bars (CSS only) for active apps; shopping list table for planned
6. Monitoreo Fitosanitario — trend table + severity-coded lot detail
7. Temas Adicionales — rendered text/image blocks
8. Recomendaciones — styled list from `analisis.recomendaciones`

---

## Step 3: Update the Existing Edge Function Flow

**File:** `supabase/functions/make-server-1ccce916/generar-reporte-semanal.ts`

Update `generarReporteSemanal()` to:
1. Call new `llamarGeminiAnalisis()` → get `AnalisisGemini` JSON
2. Call `generarHTMLReporte(datos, analisis)` from new template file
3. Return `{ success, html, analisis, tokens_usados }` — same contract as before

`GenerateReportResponse` gains optional `analisis` field (non-breaking — frontend ignores it).

---

## Step 4: Port Data Fetching to the Edge Function

**File (new):** `supabase/functions/make-server-1ccce916/fetch-datos-reporte.ts`

Port the 5 queries from `src/utils/fetchDatosReporteSemanal.ts` to Deno:
- `fetchPersonalSemana(supabase, semana)`
- `fetchMatrizJornales(supabase, semana)`
- `fetchAplicacionesPlaneadas(supabase)`
- `fetchAplicacionesActivas(supabase)`
- `fetchDatosMonitoreo(supabase)`
- `fetchDatosReporteSemanal(supabase, semana)` — orchestrator

Uses `@supabase/supabase-js` (same package, already available in Deno). Uses `SUPABASE_SERVICE_ROLE_KEY` env var (already set in edge function environment for other operations like user management).

Week utilities (`getNumeroSemanaISO`, `calcularSemanaAnterior`) also ported as pure functions — no DOM dependencies.

---

## Step 5: Add the Quick-Generate Endpoint + Button

**No cron job** — the auto-generate endpoint is triggered manually from the frontend (avoids serverless execution costs on Vercel free tier).

**File:** `supabase/functions/make-server-1ccce916/index.ts`

Add new route:
```
POST /make-server-1ccce916/reportes/generar-semanal-rapido
```

Handler (called with user's auth token from the frontend):
1. Accepts optional `{ semana?: RangoSemana }` body — defaults to previous week if not provided
2. Checks if report already exists for this week (idempotent — returns existing if found)
3. Calls `fetchDatosReporteSemanal()` using service role key (fetches its own data — no wizard needed)
4. Calls updated `generarReporteSemanal()` → gets HTML
5. Uploads HTML to `reportes-semanales` storage as `{año}/auto-reporte-semana-{año}-S{nn}.html`
6. Upserts metadata to `reportes_semanales` with `generado_automaticamente = true`, `html_storage = path`
7. Returns `{ success, semana, html_storage }`

**File:** `src/components/reportes/ReportesDashboard.tsx`

Add a **"Generar Rápido"** button (secondary style) that:
- Calls the new endpoint with the anon key (user is authenticated)
- Shows a loading spinner while generating
- On success, refreshes `HistorialReportes` to show the new entry
- This gives one-click generation without the 4-step wizard

---

## Step 6: Database Migration

**File (new):** `src/sql/migrations/XXXX_auto_reporte_semanal.sql`

```sql
-- Add columns to reportes_semanales (backward compatible, nullable)
ALTER TABLE reportes_semanales
  ADD COLUMN IF NOT EXISTS html_storage TEXT,
  ADD COLUMN IF NOT EXISTS generado_automaticamente BOOLEAN DEFAULT FALSE;
```

No pg_cron, no pg_net extensions needed.

---

## Step 7: Frontend — Download Handler Update

**File:** `src/utils/reporteSemanalService.ts`

Add `descargarReporteHTML()`:
```typescript
// Fetches HTML from storage, converts to PDF via html2pdf, triggers download
export async function descargarReporteDesdeHTML(htmlStoragePath: string, filename: string): Promise<void>
```

Update `fetchHistorialReportes()` to also select `html_storage, generado_automaticamente`.

**File:** `src/components/reportes/HistorialReportes.tsx`

- Add "Auto" badge on rows where `generado_automaticamente = true`
- Download button: if `html_storage` exists (auto report), call `descargarReporteDesdeHTML()`; if `url_storage` is a PDF (manual report), use existing `descargarReportePDF()`
- Add "Listo" / "Pendiente" status indicator

---

## Critical Files

| File | Action |
|------|--------|
| `supabase/functions/make-server-1ccce916/generar-reporte-semanal.ts` | Modify — JSON analysis instead of HTML |
| `supabase/functions/make-server-1ccce916/generar-reporte-html.ts` | **Create** — Escocia OS HTML template |
| `supabase/functions/make-server-1ccce916/fetch-datos-reporte.ts` | **Create** — Server-side DB queries |
| `supabase/functions/make-server-1ccce916/index.ts` | Modify — Add quick-generate route |
| `src/sql/migrations/XXXX_auto_reporte_semanal.sql` | **Create** — Two additive columns only |
| `src/utils/reporteSemanalService.ts` | Modify — HTML download handler + quick-generate call |
| `src/components/reportes/ReportesDashboard.tsx` | Modify — Add "Generar Rápido" button |
| `src/components/reportes/HistorialReportes.tsx` | Modify — Auto badge + dual download |
| `src/types/reporteSemanal.ts` | Modify — Add `html_storage`, `generado_automaticamente` to metadata type |

---

## Reuse From Codebase

- `src/utils/fetchDatosReporteSemanal.ts` — Source of truth for all queries (porting to edge function)
- `src/utils/format.ts` — `formatCurrency`, `formatShortDate` logic to replicate in HTML template
- Existing `reportes-semanales` storage bucket — no changes needed
- Existing `reportes_semanales` table — additive columns only
- Existing `SUPABASE_SERVICE_ROLE_KEY` env var — already set in edge function environment
- `GEMINI_API_KEY` env var — already set, just changing what we ask Gemini to do

---

## Verification

1. **Unit-test Gemini prompt change**: Call the edge function manually with sample data → verify it returns valid JSON matching `AnalisisGemini` interface
2. **Test HTML template**: Call full `/reportes/generar-semanal` with sample data → open returned HTML in browser → verify Escocia OS design renders correctly, all sections present
3. **Test PDF output**: Run through full wizard → download PDF → verify design quality matches expectations
4. **Test quick-generate endpoint**: Click "Generar Rápido" → verify HTML stored in `reportes-semanales` bucket, metadata in table with `generado_automaticamente = true`
5. **Test frontend download**: Open HistorialReportes → click download on quick-generated report → verify PDF is generated from HTML
6. **Test idempotency**: Click "Generar Rápido" twice for same week → verify only one record, no duplicate storage files
