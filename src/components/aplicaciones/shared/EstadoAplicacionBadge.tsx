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
 * Antes de este componente cada pantalla traía su propio mapa y no coincidían entre sí
 * (AplicacionesList.tsx tenía "En ejecución" en verde y "Cerrada" en gris; DetalleAplicacion.tsx
 * tenía "En ejecución" en ámbar y "Cerrada" en verde; ConsumoAplicacionesTable.tsx traía un tercero
 * en azul/ámbar/verde). Este es ahora la única fuente de verdad.
 *
 * **Un solo acento — decisión del dueño, 2026-08-20.** La primera versión de este archivo copió el
 * azul/ámbar/verde de ConsumoAplicacionesTable. Se descartó: tres hues compitiendo con el olivo de
 * marca en una lista de 20 filas convierten el color en ruido, y el semáforo sugiere que "Cerrada"
 * es bueno y "Calculada" es información, cuando en realidad son solo posiciones de un flujo.
 *
 * La jerarquía la carga la INTENSIDAD del mismo olivo, no el tono:
 * - `En ejecución` — olivo sólido. Es el único estado que pide acción del usuario hoy.
 * - `Calculada` — tinte de secondary. Planificada, todavía no arranca.
 * - `Cerrada` — neutro con borde. Archivo; 17 de 20 filas son esto y deben quedarse calladas.
 */
const ESTADO_ESTILOS: Record<EstadoAplicacion, string> = {
  Calculada: 'bg-secondary/40 text-secondary-foreground border-secondary',
  'En ejecución': 'bg-primary text-primary-foreground border-primary',
  Cerrada: 'bg-transparent text-muted-foreground border-border',
};

/**
 * El valor guardado NO es el que ve la usuaria. `AplicacionesList.tsx` viene mapeando
 * `Calculada` → "Planificada" desde siempre (su `ESTADO_LABELS`), y el filtro de estado usa esa
 * misma etiqueta. La primera versión de este componente renderizaba `{estado}` crudo, así que al
 * cablearlo habría cambiado en silencio la palabra que la gente lleva meses leyendo — sin tocar la
 * base de datos y sin que ningún test lo notara. El mapa vive acá para que las 5 pantallas digan
 * lo mismo.
 */
const ESTADO_ETIQUETAS: Record<EstadoAplicacion, string> = {
  Calculada: 'Planificada',
  'En ejecución': 'En Ejecución',
  Cerrada: 'Cerrada',
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
      {ESTADO_ETIQUETAS[estado]}
    </Badge>
  );
}
