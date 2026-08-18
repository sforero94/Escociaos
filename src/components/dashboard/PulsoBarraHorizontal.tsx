interface PulsoBarraHorizontalProps {
  etiqueta: string;
  valorTexto: string;
  /** 0..1 -- se recorta a ese rango antes de convertirlo a ancho. */
  proporcion: number;
  /** Clase Tailwind de fondo para el relleno (ej. `bg-primary`,
   *  `bg-red-500`) -- cada tarjeta decide su propio color, este componente
   *  sólo dibuja la barra. */
  colorClassName: string;
}

/**
 * PulsoBarraHorizontal - fila de "etiqueta + barra + valor" compartida por
 * las tarjetas de Aguacate ("barra e incidencia") y Ganado ("barras
 * horizontales por finca") del bloque "Pulso por negocio"
 * (docs/plan_dashboard_centro_control.md §3.2/§3.3).
 */
export function PulsoBarraHorizontal({ etiqueta, valorTexto, proporcion, colorClassName }: PulsoBarraHorizontalProps) {
  const ancho = Math.max(0, Math.min(1, proporcion)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-foreground truncate">{etiqueta}</span>
        <span className="text-sm font-medium text-foreground shrink-0">{valorTexto}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1">
        <div className={`h-full rounded-full ${colorClassName}`} style={{ width: `${ancho}%` }} />
      </div>
    </div>
  );
}
