import { cn } from '@/components/ui/utils';
import { formatNumber } from '@/utils/format';
import { ORDEN_ETAPAS, ETIQUETA_ETAPA } from '@/types/ganado';
import type { EtapaBucket, ResumenEtapas } from '@/types/ganado';

/**
 * Rampa de un solo tono (el verde primario de la app en distintas
 * opacidades) para representar la progresión terneros → repele: es un
 * continuo, no categorías sin relación, así que una rampa dice más que
 * colores arbitrarios. "Sin clasificar" queda deliberadamente fuera de la
 * rampa (gris, cursiva) — es la categoría de lo que falta resolver, no un
 * punto más de la escala productiva.
 */
export const ETAPA_DOT: Record<EtapaBucket, string> = {
  terneros: 'bg-primary/30',
  levante: 'bg-primary/55',
  ceba: 'bg-primary/80',
  repele: 'bg-primary',
  sin_clasificar: 'bg-gray-300',
};

export const ETAPA_CHIP_CLASS: Record<EtapaBucket, string> = {
  terneros: 'bg-primary/5 text-foreground border-primary/15',
  levante: 'bg-primary/10 text-foreground border-primary/20',
  ceba: 'bg-primary/15 text-foreground border-primary/25',
  repele: 'bg-primary/20 text-foreground border-primary/30',
  sin_clasificar: 'bg-gray-50 text-brand-brown/50 border-gray-200 italic',
};

interface EtapaChipProps {
  etapa: EtapaBucket;
  cabezas?: number;
  className?: string;
  size?: 'sm' | 'md';
}

/** Un solo chip de etapa — para una fila de potrero. */
export function EtapaChip({ etapa, cabezas, className, size = 'sm' }: EtapaChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs',
        ETAPA_CHIP_CLASS[etapa],
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', ETAPA_DOT[etapa])} />
      {ETIQUETA_ETAPA[etapa]}
      {cabezas != null && <span className="tabular-nums">{formatNumber(cabezas)}</span>}
    </span>
  );
}

interface ChipsEtapaProps {
  porEtapa: ResumenEtapas;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Desglose por etapa productiva en ORDEN_ETAPAS. "Sin clasificar" se
 * muestra siempre que sea > 0 — es una categoría real con su propio color,
 * no un hueco que se esconde (A-2, R-1).
 */
export function ChipsEtapa({ porEtapa, className, size = 'md' }: ChipsEtapaProps) {
  const entradas = ORDEN_ETAPAS.filter((etapa) => (porEtapa[etapa] || 0) > 0);
  if (entradas.length === 0) {
    return <span className={cn('text-xs text-brand-brown/40', className)}>Sin cabezas</span>;
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {entradas.map((etapa) => (
        <EtapaChip key={etapa} etapa={etapa} cabezas={porEtapa[etapa]} size={size === 'md' ? 'md' : 'sm'} />
      ))}
    </div>
  );
}

interface BarraEtapaProps {
  porEtapa: ResumenEtapas;
  total: number;
  className?: string;
}

/** Barra horizontal apilada de la distribución por etapa (panel/fila de finca). */
export function BarraEtapa({ porEtapa, total, className }: BarraEtapaProps) {
  if (total <= 0) {
    return <div className={cn('h-2.5 rounded-full bg-gray-100', className)} />;
  }
  return (
    <div className={cn('flex h-2.5 rounded-full overflow-hidden bg-gray-100', className)}>
      {ORDEN_ETAPAS.filter((etapa) => (porEtapa[etapa] || 0) > 0).map((etapa) => (
        <span
          key={etapa}
          className={ETAPA_DOT[etapa]}
          style={{ width: `${((porEtapa[etapa] || 0) / total) * 100}%` }}
          title={`${ETIQUETA_ETAPA[etapa]}: ${formatNumber(porEtapa[etapa])}`}
        />
      ))}
    </div>
  );
}
