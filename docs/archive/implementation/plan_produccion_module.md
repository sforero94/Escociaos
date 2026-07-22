# Implementation Plan: Producción Module

## Overview
Build a production analytics module to track avocado harvest data with visualizations showing trends by lote, sublote, harvest cycle (Principal/Traviesa), and year. The module will follow existing patterns from the Finanzas and Monitoreo modules, using the established UI design system and Recharts for visualizations.

## Key Design Decisions (Based on User Input)
- ✅ Migrate historical data from prototype (2023-2026)
- ✅ Store harvest info as simple fields (cosecha_tipo + año) in production table
- ✅ Add fecha_siembra to lotes table for age tracking
- ✅ Support both lote-level and sublote-level production records (sublote_id optional)

---

## Phase 1: Database Schema

### 1.1 Create Producción Table

**File:** `/src/sql/migrations/015_create_produccion_table.sql`

```sql
-- Main production table
CREATE TABLE produccion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Temporal
  fecha_cosecha DATE NOT NULL,
  ano INTEGER NOT NULL,
  cosecha_tipo TEXT NOT NULL CHECK (cosecha_tipo IN ('Principal', 'Traviesa')),

  -- Location (both lote and sublote support)
  lote_id UUID NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  sublote_id UUID REFERENCES sublotes(id) ON DELETE SET NULL,

  -- Production metrics
  kg_cosechados NUMERIC NOT NULL CHECK (kg_cosechados >= 0),

  -- Tree count snapshot (for historical accuracy)
  arboles_registrados INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  responsable TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_produccion_fecha ON produccion(fecha_cosecha);
CREATE INDEX idx_produccion_lote_id ON produccion(lote_id);
CREATE INDEX idx_produccion_sublote_id ON produccion(sublote_id);
CREATE INDEX idx_produccion_ano ON produccion(ano);
CREATE INDEX idx_produccion_cosecha_tipo ON produccion(cosecha_tipo);

-- Composite index for common query pattern
CREATE INDEX idx_produccion_lote_ano_cosecha
  ON produccion(lote_id, ano, cosecha_tipo);

-- Update timestamp trigger
CREATE TRIGGER update_produccion_updated_at
  BEFORE UPDATE ON produccion
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE produccion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_produccion"
  ON produccion FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_produccion"
  ON produccion FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_produccion"
  ON produccion FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
```

### 1.2 Add fecha_siembra to Lotes Table

**File:** `/src/sql/migrations/016_add_fecha_siembra_lotes.sql`

```sql
-- Add planting date for age calculation
ALTER TABLE lotes ADD COLUMN fecha_siembra DATE;

COMMENT ON COLUMN lotes.fecha_siembra IS 'Approximate planting date for age calculations';

-- Optional: Seed with approximate dates based on prototype data
UPDATE lotes SET fecha_siembra = '2011-01-01' WHERE nombre = 'Piedra Paula';
UPDATE lotes SET fecha_siembra = '2012-01-01' WHERE nombre = 'Salto Tequendama';
-- ... etc for other lotes
```

### 1.3 Seed Historical Data

**File:** `/src/sql/migrations/017_seed_produccion_historica.sql`

Create INSERT statements based on prototype's historyData and sublotData arrays. Map to actual lote/sublote UUIDs from database.

---

## Phase 2: TypeScript Types

**File:** `/src/types/produccion.ts`

```typescript
export interface RegistroProduccion {
  id: string;
  fecha_cosecha: string;
  ano: number;
  cosecha_tipo: CosechaTipo;
  lote_id: string;
  sublote_id?: string | null;
  kg_cosechados: number;
  arboles_registrados: number;
  responsable?: string | null;
  observaciones?: string | null;
  created_at?: string;
  updated_at?: string;

  // Relations (when joined)
  lote?: Lote;
  sublote?: Sublote;
}

export type CosechaTipo = 'Principal' | 'Traviesa';

export interface FiltrosProduccion {
  fecha_desde?: string;
  fecha_hasta?: string;
  ano?: number;
  anos?: number[];
  cosecha_tipo?: CosechaTipo | CosechaTipo[];
  lote_id?: string | string[];
  sublote_id?: string | string[];
}

export interface KPIsProduccion {
  produccion_total_kg: number;
  kg_por_arbol: number;
  ton_por_hectarea: number;
  numero_registros: number;
  lotes_activos: number;
  periodo_label: string;
}

export interface DatoTendencia {
  periodo: string;           // "2023 - Principal"
  periodo_codigo: string;    // "P23" for chart x-axis
  ano: number;
  cosecha_tipo: CosechaTipo;
  // Metrics by lote (dynamic keys like 'PP', 'ST', 'AU')
  [lote_code: string]: any;
}

export interface DatoRendimientoSublote {
  sublote_id: string;
  sublote_nombre: string;
  lote_id: string;
  lote_nombre: string;
  lote_color: string;
  kg_totales: number;
  kg_por_arbol: number;
  ton_por_hectarea: number;
  arboles_registrados: number;
  area_hectareas?: number;
  periodo: string;
}

export interface DatoEdadRendimiento {
  lote_id: string;
  lote_codigo: string;
  lote_nombre: string;
  lote_color: string;
  edad_anos: number;
  rendimiento_promedio: number;  // kg/árbol over recent periods
  arboles_actuales: number;
}

export type MetricaProduccion = 'kg_totales' | 'kg_por_arbol' | 'ton_por_hectarea';
```

---

## Phase 3: Data Layer

**File:** `/src/components/produccion/hooks/useProduccionData.ts`

Core hook following the pattern from `/src/components/finanzas/hooks/useFinanzasData.ts`

**Key Methods:**
- `getKPIs(filtros)` - Calculate summary metrics
- `getTendenciasHistoricas(filtros, metrica)` - Aggregate by period and lote
- `getRendimientosSublotes(filtros, metrica)` - Sublote performance data
- `getEdadRendimiento()` - Age vs yield analysis
- `getRegistros(filtros)` - Detailed production records

**Calculations:**
- `kg_por_arbol = kg_cosechados / arboles_registrados`
- `ton_por_hectarea = (kg_cosechados / 1000) / area_hectareas`
- Age calculation: `EXTRACT(YEAR FROM AGE(CURRENT_DATE, fecha_siembra))`

---

## Phase 4: UI Components

### Component Tree
```
ProduccionDashboard.tsx (main container)
├── FiltrosProduccion.tsx (global filters)
├── KPICardsProduccion.tsx (4 stat cards)
└── Tabs
    ├── Tab: Histórico
    │   └── GraficoTendenciasHistorico.tsx (LineChart)
    ├── Tab: Sublotes
    │   └── GraficoRendimientoSublotes.tsx (ScatterChart + Top List)
    └── Tab: Edad vs Rendimiento
        └── GraficoEdadRendimiento.tsx (ScatterChart with reference line)
```

### 4.1 Main Dashboard
**File:** `/src/components/produccion/ProduccionDashboard.tsx`

- Uses Tabs component from `/src/components/ui/tabs.tsx`
- Background: `bg-[#F8FAF5]`
- Layout: `space-y-6` with max-w-7xl container
- Color scheme: Primary `#73991C`, secondary `#BFD97D`

### 4.2 Global Filters
**File:** `/src/components/produccion/components/FiltrosProduccion.tsx`

Pattern: Similar to `/src/components/finanzas/components/FiltrosGlobales.tsx`

Filter controls:
- Year multi-select (2023-2026+)
- Harvest type (Principal, Traviesa, Ambas)
- Lote multi-select
- Metric toggle (KG Totales, KG/Árbol, Ton/Ha)

### 4.3 KPI Cards
**File:** `/src/components/produccion/components/KPICardsProduccion.tsx`

4 cards in grid (1 col mobile, 4 cols desktop):
1. **Producción Total** - Total kg with trend indicator
2. **Rendimiento Promedio** - KG/Árbol average
3. **Ton/Ha Promedio** - Area efficiency
4. **Lotes Activos** - Count of producing lotes

Card styling: `rounded-2xl p-6 bg-white shadow-sm border border-gray-200`

### 4.4 Historical Trends Chart
**File:** `/src/components/produccion/components/GraficoTendenciasHistorico.tsx`

- **Chart Type:** LineChart from Recharts
- **Data:** One line per lote (dynamic based on LOT_CONFIG)
- **X-Axis:** Harvest codes (P23, T23, P24, etc.)
- **Y-Axis:** Selected metric (kg_totales, kg_por_arbol, ton_por_hectarea)
- **Colors:** Match prototype (PP: #10b981, ST: #3b82f6, AU: #f59e0b, etc.)
- **Responsive:** Uses ChartContainer from `/src/components/ui/chart.tsx`

### 4.5 Sublote Performance
**File:** `/src/components/produccion/components/GraficoRendimientoSublotes.tsx`

**Layout:** 2-column grid (lg:grid-cols-2)

**Left Panel:** ScatterChart
- X-axis: Sublote name
- Y-axis: Selected metric
- Color by lote
- Filter by lote selector above chart

**Right Panel:** Top 10 List
- Ranked by selected metric
- Shows sublote name, lote badge, metric value
- Clickable for details (future enhancement)

### 4.6 Age vs Yield Analysis
**File:** `/src/components/produccion/components/GraficoEdadRendimiento.tsx`

- **Chart Type:** ScatterChart
- **X-Axis:** Edad (años) - calculated from fecha_siembra
- **Y-Axis:** Rendimiento promedio (kg/árbol) - average of recent 3-6 harvests
- **Point Size:** Proportional to arboles_actuales
- **Colors:** Use lote colors from config
- **Reference Line:** Optional threshold line (e.g., 4 kg/árbol)
- **Custom Tooltip:** Shows lote name, age, yield, tree count

---

## Phase 5: Navigation Integration

**File:** `/src/components/Layout.tsx`

Add "Producción" menu item (already exists in navigation list based on git status).

Icon suggestion: `BarChart3` or `TrendingUp` from lucide-react

---

## Phase 6: Configuration & Constants

**File:** `/src/components/produccion/constants.ts`

```typescript
export const LOT_CONFIG: Record<string, LotConfig> = {
  'PP': { name: 'Piedra Paula', color: '#10b981', code: 'PP' },
  'ST': { name: 'Salto Tequendama', color: '#3b82f6', code: 'ST' },
  'AU': { name: 'Australia', color: '#f59e0b', code: 'AU' },
  'LV': { name: 'La Vega', color: '#8b5cf6', code: 'LV' },
  'UN': { name: 'La Unión', color: '#ec4899', code: 'UN' },
  'PG': { name: 'Pedregal', color: '#6366f1', code: 'PG' },
  'IR': { name: 'Irlanda', color: '#ef4444', code: 'IR' },
  'AC': { name: 'Acueducto', color: '#14b8a6', code: 'AC' },
};

export const HARVEST_LABELS = {
  'Principal': 'Principal',
  'Traviesa': 'Traviesa',
};
```

Map lote names from DB to these codes in the hook.

---

## Implementation Sequence

### Step 1: Database (Day 1)
1. Create migration `015_create_produccion_table.sql`
2. Create migration `016_add_fecha_siembra_lotes.sql`
3. Run migrations in Supabase
4. Verify tables and RLS policies

### Step 2: Seed Data (Day 1)
1. Create migration `017_seed_produccion_historica.sql`
2. Map prototype data to DB lote/sublote IDs
3. Insert historical records (2023-2026)
4. Verify data integrity

### Step 3: Types & Constants (Day 1)
1. Create `/src/types/produccion.ts`
2. Create `/src/components/produccion/constants.ts`
3. Export from index files

### Step 4: Data Hook (Day 2)
1. Create `/src/components/produccion/hooks/useProduccionData.ts`
2. Implement getKPIs()
3. Implement getTendenciasHistoricas()
4. Implement getRendimientosSublotes()
5. Implement getEdadRendimiento()
6. Test queries in Supabase

### Step 5: UI Components (Days 3-5)
**Day 3:**
- FiltrosProduccion component
- KPICardsProduccion component

**Day 4:**
- GraficoTendenciasHistorico component
- Wire up to data hook

**Day 5:**
- GraficoRendimientoSublotes component
- GraficoEdadRendimiento component

### Step 6: Dashboard Integration (Day 6)
1. Create ProduccionDashboard.tsx
2. Integrate all child components
3. Wire up tabs navigation
4. Connect filters to all visualizations

### Step 7: Polish (Day 7)
1. Loading states
2. Error handling
3. Responsive design testing
4. Empty state messaging
5. Tooltips and help text

---

## Critical Files

### Database:
- `/src/sql/migrations/015_create_produccion_table.sql` - Core schema
- `/src/sql/migrations/016_add_fecha_siembra_lotes.sql` - Age tracking
- `/src/sql/migrations/017_seed_produccion_historica.sql` - Historical data

### Types & Data:
- `/src/types/produccion.ts` - All TypeScript interfaces
- `/src/components/produccion/hooks/useProduccionData.ts` - Data fetching logic
- `/src/components/produccion/constants.ts` - LOT_CONFIG and labels

### UI Components:
- `/src/components/produccion/ProduccionDashboard.tsx` - Main container
- `/src/components/produccion/components/FiltrosProduccion.tsx` - Filters
- `/src/components/produccion/components/KPICardsProduccion.tsx` - KPIs
- `/src/components/produccion/components/GraficoTendenciasHistorico.tsx` - Trends
- `/src/components/produccion/components/GraficoRendimientoSublotes.tsx` - Sublotes
- `/src/components/produccion/components/GraficoEdadRendimiento.tsx` - Age analysis

---

## Verification Plan

### Database Verification:
1. Run `SELECT * FROM produccion LIMIT 10;` - Verify structure
2. Test RLS: Login as test user, verify read access
3. Check indexes: `\d produccion` - Verify all indexes created
4. Verify FK constraints: Delete test lote, ensure CASCADE works

### Data Verification:
1. Query total records by year: Should have 7+ harvests per lote
2. Calculate manual KPI (sum kg_cosechados) - Compare to hook result
3. Test age calculation: `SELECT nombre, EXTRACT(YEAR FROM AGE(CURRENT_DATE, fecha_siembra)) FROM lotes;`

### UI Verification:
1. Load dashboard: All 3 tabs render without errors
2. Filter by year: Charts update correctly
3. Toggle metrics: Switch between KG/Árbol and Ton/Ha
4. Responsive: Test on mobile viewport (< 768px)
5. Loading states: Simulate slow network, verify spinners show

### Integration Testing:
1. Apply global filter → All charts reflect filter
2. Select specific lote in sublotes tab → Scatter plot updates
3. Switch tabs → State persists correctly
4. Navigate away and back → Filters reset or persist as designed

---

## Future Enhancements (Out of Scope)
- CSV export functionality
- Production record entry form (RegistroProduccionDialog)
- Photo upload for harvest documentation
- Comparison mode (compare years side-by-side)
- Forecasting based on historical trends
- Integration with weather data
- Mobile app for field data entry

---

## Design Patterns Summary

**Follow Existing Patterns:**
- UI: Match Finanzas dashboard layout and styling
- Data: Follow useFinanzasData hook pattern
- Filters: Use FiltrosGlobales component structure
- Charts: Use ChartContainer wrapper from ui/chart.tsx
- Types: Place in `/src/types/` with module name
- Colors: Use `#73991C` (primary green) consistently

**Database Conventions:**
- No prefix for core tables (produccion, like lotes)
- snake_case columns
- _id suffix for foreign keys
- RLS enabled with authenticated read access
- Timestamps: created_at, updated_at with trigger

**Component Structure:**
- Main container: ProduccionDashboard.tsx
- Child components in `/components/` subdirectory
- Custom hooks in `/hooks/` subdirectory
- Constants in separate file

---

This plan provides a complete roadmap for implementing the Producción module with full integration into your existing application architecture.
