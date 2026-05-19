import { useMemo } from 'react';
import { Sun, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ResumenDiario } from '@/types/clima';
import { buildRadiationPeriodContext, type RadiationPeriodContext } from '@/utils/calculosRadiacion';
import { Skeleton } from '@/components/ui/skeleton';

interface ContextoSolarProps {
  resumenesDiarios: ResumenDiario[];
  loading: boolean;
}

interface PeriodConfig {
  label: string;
  days: number;
}

const PERIODS: PeriodConfig[] = [
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
];

function splitRowsByPeriod(rows: ResumenDiario[], days: number) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const priorCutoff = new Date(cutoff.getTime() - days * 24 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const priorStr = priorCutoff.toISOString().slice(0, 10);

  const current = rows.filter(r => r.fecha >= cutoffStr);
  const prior = rows.filter(r => r.fecha >= priorStr && r.fecha < cutoffStr);
  return { current, prior };
}

function getYTDRows(rows: ResumenDiario[]) {
  const jan1 = `${new Date().getFullYear()}-01-01`;
  const prevJan1 = `${new Date().getFullYear() - 1}-01-01`;
  const prevSameDay = `${new Date().getFullYear() - 1}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${new Date().getDate().toString().padStart(2, '0')}`;

  const current = rows.filter(r => r.fecha >= jan1);
  const prior = rows.filter(r => r.fecha >= prevJan1 && r.fecha <= prevSameDay);
  return { current, prior };
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-gray-400">--</span>;

  const isPositive = delta > 0;
  const isNeutral = delta === 0;
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const color = isNeutral ? 'text-gray-500' : isPositive ? 'text-green-600' : 'text-amber-600';

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {isPositive ? '+' : ''}{delta}h
    </span>
  );
}

function PeriodRow({ label, ctx }: { label: string; ctx: RadiationPeriodContext }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-3">
        {ctx.current.avgSunHours !== null ? (
          <>
            <span className="text-sm font-semibold text-gray-900">
              {ctx.current.avgSunHours} h/día
            </span>
            {ctx.current.status && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${ctx.current.status.bgColor} ${ctx.current.status.textColor}`}>
                {ctx.current.status.label}
              </span>
            )}
            <DeltaBadge delta={ctx.delta} />
          </>
        ) : (
          <span className="text-sm text-gray-400">Sin datos</span>
        )}
      </div>
    </div>
  );
}

export function ContextoSolar({ resumenesDiarios, loading }: ContextoSolarProps) {
  const periodContexts = useMemo(() => {
    const results: { label: string; ctx: RadiationPeriodContext }[] = [];

    for (const period of PERIODS) {
      const { current, prior } = splitRowsByPeriod(resumenesDiarios, period.days);
      results.push({ label: period.label, ctx: buildRadiationPeriodContext(current, prior) });
    }

    const ytd = getYTDRows(resumenesDiarios);
    results.push({ label: 'Año a la fecha', ctx: buildRadiationPeriodContext(ytd.current, ytd.prior) });

    return results;
  }, [resumenesDiarios]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sun className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-gray-900">Contexto Solar</h3>
        <span className="text-xs text-gray-400">(horas-sol equivalentes/día)</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : (
        <div>
          {periodContexts.map(({ label, ctx }) => (
            <PeriodRow key={label} label={label} ctx={ctx} />
          ))}
          <p className="text-xs text-gray-400 mt-2">
            Rango óptimo Hass: 5.0 – 7.0 h/día. Delta vs. período anterior equivalente.
          </p>
        </div>
      )}
    </div>
  );
}
