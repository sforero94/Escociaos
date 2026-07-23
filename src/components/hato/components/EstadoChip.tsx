// ARCHIVO: components/hato/components/EstadoChip.tsx
// DESCRIPCIÓN: Envoltorio scoped del módulo hato sobre `ui/badge.tsx` (V1 del
// plan -- no se toca el primitivo global). Renderiza cualquier `ChipEstilo`
// producido por `utils/hatoUi.ts`, la única fuente de color-por-estado.

import { Badge } from '@/components/ui/badge';
import type { ChipEstilo } from '@/utils/hatoUi';

export function EstadoChip({ chip, className }: { chip: ChipEstilo; className?: string }) {
  return (
    <Badge variant="outline" className={`${chip.className} ${className ?? ''}`.trim()}>
      {chip.label}
    </Badge>
  );
}
