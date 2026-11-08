import type { CosechaIdentidad, MetricaProduccion } from '../../../types/produccion';
import {
  COSECHA_SERIES_COLORS,
  METRICA_LABELS,
  formatMetricValue,
} from '../../../types/produccion';
import type { ComparacionLoteCosecha } from '@/utils/calculosProduccionAnalisis';
import { Grid3X3 } from 'lucide-react';

interface ComparacionLotesCosechaProps {
  filas: ComparacionLoteCosecha[];
  cosechas: CosechaIdentidad[];
  metrica: MetricaProduccion;
  loading?: boolean;
  notaCorte?: string;
}

function Skeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-64 mb-4" />
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded" />
        ))}
      </div>
    </div>
  );
}

export function ComparacionLotesCosecha({
  filas,
  cosechas,
  metrica,
  loading = false,
  notaCorte,
}: ComparacionLotesCosechaProps) {
  if (loading) return <Skeleton />;

  const maxAbs = Math.max(
    1,
    ...filas.flatMap((f) =>
      cosechas.map((c) => {
        const v = f.por_cosecha[c.key];
        return v != null ? Math.abs(v) : 0;
      }),
    ),
  );

  const leyenda = cosechas
    .map((c, i) => `${c.label} ● ${i === 0 ? 'verde' : 'claro'}`)
    .join(' / ');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
          <Grid3X3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Producción por lote y cosecha
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {leyenda || 'Sin cosechas seleccionadas'} · {METRICA_LABELS[metrica]}
          </p>
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-gray-500">
          No hay lotes con dato para la selección actual.
        </div>
      ) : (
        <div className="space-y-5">
          {filas.map((fila) => {
            const textos = cosechas.map((c) => {
              const v = fila.por_cosecha[c.key];
              if (v == null) return 'Sin dato';
              return metrica === 'kg_totales'
                ? v.toLocaleString('es-CO', { maximumFractionDigits: 0 })
                : formatMetricValue(v, metrica);
            });
            return (
              <div key={fila.lote_id} className="grid grid-cols-[minmax(7rem,11rem)_1fr_auto] gap-3 items-center">
                <div className="text-sm font-medium text-gray-800 truncate">
                  {fila.lote_nombre}
                </div>
                <div className="space-y-1.5 min-w-0">
                  {cosechas.map((c, i) => {
                    const v = fila.por_cosecha[c.key];
                    const width =
                      v == null ? 0 : Math.max(2, Math.round((Math.abs(v) / maxAbs) * 100));
                    return (
                      <div key={c.key} className="h-3 rounded-sm bg-gray-100 overflow-hidden">
                        {v != null ? (
                          <div
                            className="h-full rounded-sm transition-[width] duration-500 ease-out"
                            style={{
                              width: `${width}%`,
                              backgroundColor:
                                COSECHA_SERIES_COLORS[i % COSECHA_SERIES_COLORS.length],
                              opacity: i === 0 ? 1 : 0.55,
                            }}
                          />
                        ) : (
                          <div className="h-full w-full bg-[repeating-linear-gradient(135deg,#e5e7eb,#e5e7eb_4px,#f3f4f6_4px,#f3f4f6_8px)]" />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-gray-600 font-mono whitespace-nowrap text-right">
                  {textos.join(' / ')}
                  {metrica === 'kg_totales' ? ' kg' : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {notaCorte && (
        <p className="mt-5 text-xs text-gray-400">{notaCorte}</p>
      )}
      <p className="mt-2 text-xs text-gray-400">
        Sin dato en una campaña no se prolonga como cero: la barra queda vacía.
      </p>
    </div>
  );
}
