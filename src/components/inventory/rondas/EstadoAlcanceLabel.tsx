// ARCHIVO: components/inventory/rondas/EstadoAlcanceLabel.tsx
// DESCRIPCIÓN: Etiqueta del estado de UN producto frente al alcance
// declarado de una ronda (R-2/R-3, CA-15/CA-16, docs/plan_verificacion_inventario.md
// §7). Presentacional puro -- toda la lógica de qué texto/color le
// corresponde a cada estado vive en `etiquetaEstadoProductoRonda`
// (utils/rondaInventarioUi.ts); este componente sólo la renderiza, para que
// ningún consumidor pueda inventar un cuarto texto ("contado", "0", etc.).

import { etiquetaEstadoProductoRonda } from '@/utils/rondaInventarioUi';
import type { EstadoProductoEnRonda } from '@/utils/rondaInventarioUi';

interface EstadoAlcanceLabelProps {
  estado: EstadoProductoEnRonda;
  className?: string;
}

export function EstadoAlcanceLabel({ estado, className }: EstadoAlcanceLabelProps) {
  const { texto, className: colorClassName } = etiquetaEstadoProductoRonda(estado);
  return <span className={`${colorClassName} ${className ?? ''}`.trim()}>{texto}</span>;
}
