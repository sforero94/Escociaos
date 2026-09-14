import { PeriodoResumen } from '@/types/clima';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatNumber } from '@/utils/format';
import { getRadiationStatus, TEXTO_ENERGIA_SOLAR, TEXTO_TIEMPO_SOL, wm2ToEnergiaDiaria } from '@/utils/calculosRadiacion';

interface ClimaPeriodosTableProps {
  periodos: PeriodoResumen[];
  loading: boolean;
}

export function ClimaPeriodosTable({ periodos, loading }: ClimaPeriodosTableProps) {
  const formatValue = (value: number | null | undefined, decimals = 0): string => {
    if (value === null || value === undefined) return '--';
    return formatNumber(value, decimals);
  };

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Período</TableHead>
          <TableHead className="text-right">Lluvia (mm)</TableHead>
          <TableHead className="text-right">Temp Prom (°C)</TableHead>
          <TableHead className="text-right">Temp Máx (°C)</TableHead>
          <TableHead className="text-right">Temp Mín (°C)</TableHead>
          <TableHead className="text-right">Humedad Prom (%)</TableHead>
          <TableHead className="text-right">Viento Prom (km/h)</TableHead>
          <TableHead className="text-right">Viento Máx (km/h)</TableHead>
          <TableHead className="text-right">
            <span className="inline-flex items-center justify-end">
              Energía (kWh/m²)
            </span>
          </TableHead>
          <TableHead className="text-right">Tiempo de sol (h)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody striped>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              {Array.from({ length: 9 }).map((_, j) => (
                <TableCell key={j} className="text-right">
                  <Skeleton className="h-4 w-12 ml-auto" />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          periodos.map((periodo, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium text-gray-900">{periodo.label}</TableCell>
              <TableCell className="text-right text-gray-700">{formatValue(periodo.resumen.lluvia_total_mm)}</TableCell>
              <TableCell className="text-right text-gray-700">
                {formatValue(periodo.resumen.temp_promedio_c, 1)}
              </TableCell>
              <TableCell className="text-right text-gray-700">{formatValue(periodo.resumen.temp_max_c, 1)}</TableCell>
              <TableCell className="text-right text-gray-700">{formatValue(periodo.resumen.temp_min_c, 1)}</TableCell>
              <TableCell className="text-right text-gray-700">
                {formatValue(periodo.resumen.humedad_promedio_pct)}
              </TableCell>
              <TableCell className="text-right text-gray-700">
                {formatValue(periodo.resumen.viento_promedio_kmh, 1)}
              </TableCell>
              <TableCell className="text-right text-gray-700">{formatValue(periodo.resumen.rafaga_max_kmh, 1)}</TableCell>
              <TableCell className="text-right">
                {(() => {
                  const wm2 = periodo.resumen.radiacion_promedio_wm2;
                  if (wm2 === null) return <span className="text-gray-700">--</span>;
                  const energia = Math.round(wm2ToEnergiaDiaria(wm2) * 10) / 10;
                  const status = getRadiationStatus(energia);
                  return (
                    <span className="inline-flex items-center gap-1.5" title={TEXTO_ENERGIA_SOLAR}>
                      <span className="text-gray-700">{energia}</span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${status.bgColor} ${status.textColor}`}>
                        {status.label}
                      </span>
                    </span>
                  );
                })()}
              </TableCell>
              <TableCell className="text-right text-gray-700" title={TEXTO_TIEMPO_SOL}>
                {formatValue(periodo.resumen.tiempo_sol_promedio_h, 1)}
                {(periodo.resumen.dias_cobertura_parcial ?? 0) > 0 && (
                  <span className="block text-[10px] text-amber-700">
                    {periodo.resumen.dias_cobertura_parcial} d parcial
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
    </div>
  );
}
