// ARCHIVO: components/inventory/rondas/DesenlaceBadge.tsx
// DESCRIPCIÓN: Badge de UN estado de excepción de ronda de inventario.
// Contrato CA-10 (docs/plan_verificacion_inventario.md §7): los tres
// desenlaces terminales -- cerrada_sin_ajuste, resuelta_con_captura, y el
// trío ajuste_aprobado/ajuste_aplicado/ajuste_desestimado -- se renderizan
// SIEMPRE con etiqueta y color propios, nunca fundidos. Este componente es
// deliberadamente la ÚNICA pieza de UI que traduce un
// `EstadoExcepcionInventario` a texto -- ni RondasList.tsx ni
// RondaDetalle.tsx repiten el mapeo inline, para que no puedan divergir.
// Presentacional puro (sin hooks, sin fetch) -- probado con
// `renderToStaticMarkup`, mismo patrón que `EstadoHeader`/`AccionCard`.

import { Badge } from '@/components/ui/badge';
import { ESTADO_EXCEPCION_INFO } from '@/utils/rondaInventarioUi';
import type { EstadoExcepcionInventario } from '@/types/rondaInventario';

interface DesenlaceBadgeProps {
  estado: EstadoExcepcionInventario;
  className?: string;
}

export function DesenlaceBadge({ estado, className }: DesenlaceBadgeProps) {
  const info = ESTADO_EXCEPCION_INFO[estado];
  return (
    <Badge
      variant="outline"
      title={info.descripcion}
      className={`${info.badgeClassName} ${className ?? ''}`.trim()}
    >
      {info.etiqueta}
    </Badge>
  );
}
