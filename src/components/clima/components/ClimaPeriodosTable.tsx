import { PeriodoResumen } from '@/types/clima';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/utils/format';

interface ClimaPeriodosTableProps {
  periodos: PeriodoResumen[];
  loading: boolean;
}

export function ClimaPeriodosTable({ periodos, loading }: ClimaPeriodosTableProps) {
  const formatValue = (value: number | null, decimals = 0): string => {
    if (value === null || value === undefined) return '--';
    return formatNumber(value, decimals);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Período</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Lluvia (mm)</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Temp Prom (°C)</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Temp Máx (°C)</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Temp Mín (°C)</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Humedad Prom (%)</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Viento Prom (km/h)</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Viento Máx (km/h)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3 text-right">
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              periodos.map((periodo, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}>
                  <td className="px-4 py-3 font-medium text-gray-900">{periodo.label}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatValue(periodo.resumen.lluvia_total_mm)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatValue(periodo.resumen.temp_promedio_c, 1)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatValue(periodo.resumen.temp_max_c, 1)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatValue(periodo.resumen.temp_min_c, 1)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatValue(periodo.resumen.humedad_promedio_pct)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatValue(periodo.resumen.viento_promedio_kmh, 1)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatValue(periodo.resumen.rafaga_max_kmh, 1)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
