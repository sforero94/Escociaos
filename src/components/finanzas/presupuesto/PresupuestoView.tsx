import { useState, useEffect, useCallback } from 'react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { FinanzasSubNav } from '@/components/finanzas/components/FinanzasSubNav';
import { PresupuestoControls } from './PresupuestoControls';
import { PresupuestoTable } from './PresupuestoTable';
import { StatusDot } from './EjecucionBadge';
import { usePresupuestoData } from '@/components/finanzas/hooks/usePresupuestoData';
import { getSupabase } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PresupuestoData } from '@/types/finanzas';

function getCurrentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

export function PresupuestoView() {
  const currentYear = new Date().getFullYear();
  const [anio, setAnio] = useState(currentYear);
  const [quarters, setQuarters] = useState<number[]>([getCurrentQuarter()]);
  const [showPct, setShowPct] = useState(false);
  const [modoPresupuesto, setModoPresupuesto] = useState(false);
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [data, setData] = useState<PresupuestoData | null>(null);

  const { loading, fetchPresupuesto, upsertPresupuesto } = usePresupuestoData();

  // Resolve Aguacate Hass negocio_id on mount
  useEffect(() => {
    async function resolveNegocio() {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('fin_negocios')
        .select('id')
        .eq('nombre', 'Aguacate Hass')
        .eq('activo', true);
      if (data && data.length > 0) {
        setNegocioId((data as Array<{ id: string }>)[0].id);
      }
    }
    resolveNegocio();
  }, []);

  // Stable key for quarters array to use in useCallback deps
  const quartersKey = quarters.join(',');

  // Fetch data when params change
  const loadData = useCallback(async () => {
    if (!negocioId || quarters.length === 0) return;
    const result = await fetchPresupuesto(anio, quarters, negocioId, modoPresupuesto);
    setData(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, quartersKey, negocioId, modoPresupuesto, fetchPresupuesto]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleQuarter = (q: number) => {
    setQuarters((prev) => {
      if (prev.includes(q)) {
        // Don't allow deselecting the last quarter
        if (prev.length === 1) return prev;
        return prev.filter((v) => v !== q).sort((a, b) => a - b);
      }
      return [...prev, q].sort((a, b) => a - b);
    });
  };

  const handleBudgetChange = async (conceptoId: string, categoriaId: string, newAmount: number) => {
    if (!negocioId) return;

    // Optimistic update
    if (data) {
      setData((prev) => {
        if (!prev) return prev;
        const next = JSON.parse(JSON.stringify(prev)) as PresupuestoData;
        for (const cat of next.categorias) {
          for (const row of cat.conceptos) {
            if (row.concepto_id === conceptoId) {
              row.monto_anual = newAmount;
              row.monto_trimestral = (newAmount * quarters.length) / 4;
              row.ejecucion_vs_q = row.monto_trimestral > 0 ? Math.round((row.actual_q / row.monto_trimestral) * 100) : null;
              row.ejecucion_vs_anio = newAmount > 0 ? Math.round((row.actual_q / newAmount) * 100) : null;
            }
          }
        }
        return next;
      });
    }

    const result = await upsertPresupuesto({
      anio,
      negocio_id: negocioId,
      categoria_id: categoriaId,
      concepto_id: conceptoId,
      monto_anual: newAmount,
    });

    if (result) {
      toast.success('Presupuesto actualizado');
    } else {
      toast.error('Error al guardar presupuesto');
      loadData();
    }
  };

  return (
    <RoleGuard allowedRoles={['Gerencia']}>
      <FinanzasSubNav />

      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Presupuesto</h1>
          <p className="text-sm text-gray-500">
            Aguacate Hass — Control presupuestal por categoría y concepto
          </p>
        </div>

        {/* Controls */}
        <PresupuestoControls
          anio={anio}
          quarters={quarters}
          onAnioChange={setAnio}
          onToggleQuarter={handleToggleQuarter}
          showPct={showPct}
          onTogglePct={() => setShowPct((v) => !v)}
          modoPresupuesto={modoPresupuesto}
          onToggleModo={() => setModoPresupuesto((v) => !v)}
        />

        {/* Table */}
        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-gray-500">Cargando presupuesto...</span>
          </div>
        ) : data ? (
          <PresupuestoTable
            data={data}
            showPct={showPct}
            anio={anio}
            quarters={quarters}
            modoPresupuesto={modoPresupuesto}
            onBudgetChange={handleBudgetChange}
          />
        ) : (
          <div className="text-center py-20 text-gray-400 text-sm">
            No se encontró el negocio Aguacate Hass
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-6 text-xs text-gray-400">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5"><StatusDot ejecucion={50} /> <span>≤80%</span></div>
            <div className="flex items-center gap-1.5"><StatusDot ejecucion={90} /> <span>80-100%</span></div>
            <div className="flex items-center gap-1.5"><StatusDot ejecucion={120} /> <span>&gt;100%</span></div>
          </div>
          {modoPresupuesto && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-green-50 border border-primary/20" />
              <span>Celda editable</span>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
