import { Diff, Info } from 'lucide-react';
import { GAPS_PRODUCCION_ANALISIS } from '@/utils/calculosProduccionAnalisis';

interface ConciliacionEtapasGapProps {
  produccionKg: number | null;
  periodo: string;
}

export function ConciliacionEtapasGap({
  produccionKg,
  periodo,
}: ConciliacionEtapasGapProps) {
  const etapas = [
    {
      label: 'Producción registrada',
      valor: produccionKg,
      nota: 'Única etapa con dato en produccion',
    },
    { label: 'Clasificado', valor: null as number | null, nota: 'Sin fuente' },
    { label: 'Despachado', valor: null as number | null, nota: 'Sin fuente' },
  ];

  const maxRef = Math.max(produccionKg ?? 0, 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 h-full">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
          <Diff className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Conciliación al corte</h3>
          <p className="text-sm text-gray-500">
            {periodo || 'Sin período'} · etapas no sumables
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {etapas.map((e) => (
          <div key={e.label}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-gray-700">{e.label}</span>
              <span className="font-mono text-gray-900">
                {e.valor != null
                  ? `${e.valor.toLocaleString('es-CO')} kg`
                  : 'Sin dato'}
              </span>
            </div>
            <div className="h-3.5 rounded-sm bg-gray-100 overflow-hidden">
              {e.valor != null ? (
                <div
                  className="h-full bg-primary/80 rounded-sm transition-[width] duration-500"
                  style={{ width: `${Math.round((e.valor / maxRef) * 100)}%` }}
                />
              ) : (
                <div className="h-full w-full bg-[repeating-linear-gradient(135deg,#e5e7eb,#e5e7eb_4px,#f9fafb_4px,#f9fafb_8px)]" />
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">{e.nota}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">Diferencias por revisar — no merma inferida</p>
        <p className="mt-1 text-amber-900/80 text-xs leading-relaxed">
          {GAPS_PRODUCCION_ANALISIS.despachos} No se inventa relación entre
          registros ni se llama merma a toda diferencia.
        </p>
      </div>

      <div className="mt-3 flex items-start gap-2 text-xs text-gray-500">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>{GAPS_PRODUCCION_ANALISIS.clasificacion_detalle}</p>
      </div>
    </div>
  );
}
