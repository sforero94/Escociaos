import { Badge } from '@/components/ui/badge';
import { cn } from '@/components/ui/utils';
import type { EstadoAplicacion } from '@/types/aplicaciones';

interface EstadoAplicacionBadgeProps {
  estado: EstadoAplicacion | null;
  className?: string;
}

/**
 * Único mapa estado→estilo para las 5 pantallas del módulo de Aplicaciones.
 *
 * Antes de este componente, cada pantalla traía su propio mapa y no coincidían entre sí
 * (AplicacionesList.tsx tenía "En ejecución" en verde y "Cerrada" en gris; DetalleAplicacion.tsx
 * tenía "En ejecución" en ámbar y "Cerrada" en verde). Esta paleta es la que ya usa la mayoría
 * — coincide con DetalleAplicacion.tsx y con el mapa independiente de
 * `src/components/inventory/dashboard/components/ConsumoAplicacionesTable.tsx` — y pasa a ser
 * la única fuente de verdad.
 */
const ESTADO_ESTILOS: Record<EstadoAplicacion, string> = {
  Calculada: 'bg-blue-50 text-blue-700 border-blue-200',
  'En ejecución': 'bg-amber-50 text-amber-700 border-amber-200',
  Cerrada: 'bg-green-50 text-green-700 border-green-200',
};

/**
 * Badge de estado de una aplicación. `estado === null` renderiza "—", nunca un estado
 * inventado (regla 2 de CLAUDE.md: "sin dato" nunca es 0 ni un valor por defecto).
 */
export function EstadoAplicacionBadge({ estado, className }: EstadoAplicacionBadgeProps) {
  if (!estado) {
    return <span className={cn('text-sm text-muted-foreground', className)}>—</span>;
  }

  return (
    <Badge variant="outline" className={cn(ESTADO_ESTILOS[estado], className)}>
      {estado}
    </Badge>
  );
}
