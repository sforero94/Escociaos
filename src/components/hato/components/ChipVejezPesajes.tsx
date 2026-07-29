// ARCHIVO: components/hato/components/ChipVejezPesajes.tsx
// DESCRIPCIÓN: Indicador PERMANENTE de vejez del pesaje semanal (decisión
// 17 del dueño, plan `docs/plan_hato_produccion_rework.md` §4.2d/§4.3,
// SOW 5) -- se muestra SIEMPRE en el tablero de Producción, nunca solo
// cuando hay backlog. El tablero nunca oculta el tracker por datos viejos
// (riesgo R-7): sigue graficando lo que hay, con este chip al lado como
// advertencia. Envoltorio delgado sobre `chipVejezPesajes` (`hatoUi.ts`,
// fuente única de la paleta de chips del módulo) + `EstadoChip`.

import { EstadoChip } from './EstadoChip';
import { chipVejezPesajes } from '@/utils/hatoUi';
import type { VejezPesajes } from '@/utils/hatoProduccion';

export function ChipVejezPesajes({ vejez, className }: { vejez: VejezPesajes; className?: string }) {
  return <EstadoChip chip={chipVejezPesajes(vejez)} className={className ?? 'flex-shrink-0'} />;
}
