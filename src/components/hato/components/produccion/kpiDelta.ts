// ARCHIVO: components/hato/components/produccion/kpiDelta.ts
// DESCRIPCIÓN: delta de `HatoKpiCard` contra el período anterior. Sin
// variación (falta un lado, o el anterior es 0) no hay delta: nunca se
// fabrica una tendencia.

import { formatNumber } from '@/utils/format';
import type { HatoKpiCardDelta } from '../HatoKpiCard';

export function deltaContraAnterior(variacion: number | null, etiquetaAnterior: string): HatoKpiCardDelta | null {
  if (variacion == null) return null;
  const signo = variacion > 0 ? '+' : '';
  return {
    direction: variacion >= 0 ? 'up' : 'down',
    label: `${signo}${formatNumber(variacion * 100, 1)}% vs ${etiquetaAnterior}`,
  };
}
