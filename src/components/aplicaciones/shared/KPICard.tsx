import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/utils';
import { formatearNumero } from '@/utils/format';

/**
 * `formatPercentage()` de `format.ts` NO sirve acá: usa `toFixed`, que imprime el punto decimal
 * anglosajón (`6.7%`). El resto del módulo ya formatea porcentajes con
 * `formatearNumero(v, 1)` — es decir `es-CO`, con coma (`6,7%`). Se usa el mismo camino para que
 * la misma cifra no se vea distinta en dos pantallas.
 */
function formatearPorcentajeConSigno(valor: number): string {
  const signo = valor > 0 ? '+' : '';
  return `${signo}${formatearNumero(valor, 1)}%`;
}

/**
 * Una comparación que la tarjeta puede mostrar como badge.
 *
 * **`delta` se OMITE por completo cuando no hay base de comparación** — no `null`, no `0`.
 * Quien arma los props ya decidió que no hay nada que mostrar; la tarjeta no vuelve a decidirlo.
 */
export interface KPIComparacion {
  tipo: 'plan' | 'anterior';
  /** "Plan" | "Anterior" */
  etiqueta: string;
  /** Ya formateado por format.ts. Ej: "Plan: $9.200.000" */
  valorFormateado: string;
  /** Porcentaje. Omitir el campo entero cuando la base es 0 o ausente. */
  delta?: number;
  /** Costo: subir es malo. Eficiencia/cantidad: subir es bueno. */
  invertido?: boolean;
}

export interface KPICardProps {
  titulo: string;
  /** Ya formateado — `formatearMoneda`/`formatearNumero`, nunca inline. */
  valor: string;
  icon: LucideIcon;
  /**
   * `primary` = ícono en olivo (Reporte). `neutro` = ícono apagado (Lista, donde la tarjeta
   * describe un estado y no un logro). Dos tratamientos, no un color por tarjeta.
   */
  tono?: 'primary' | 'neutro';
  /** 0, 1 (solo Plan o solo Anterior) o 2 (ambas). */
  comparaciones?: KPIComparacion[];
  /** `true` → el valor renderiza "—". Nunca 0, nunca cadena vacía. */
  sinDato?: boolean;
  /** Texto corto bajo el valor cuando `sinDato` — explica POR QUÉ no hay dato. */
  notaSinDato?: string;
  className?: string;
}

/**
 * Tarjeta KPI compartida por el Reporte de Aplicación (W04) y la Lista de Aplicaciones (W00).
 *
 * **Por qué existe y qué defecto cierra (D2).** Hoy las 4 tarjetas del Reporte muestran `+100,0%`
 * en TODAS las aplicaciones cerradas, siempre. La causa no es "no se eligió comparación": es que
 * `calcularDesviacion(planeado, real)` devuelve literalmente `100` cuando `planeado === 0`
 * (`calculosReporteAplicacion.ts:15`), y `aplicaciones_lotes_planificado` está vacía, así que el
 * plan es 0 estructuralmente en las 20 aplicaciones.
 *
 * La corrección vive en el CONTRATO, no en un parche: esta tarjeta es tonta a propósito. Si el
 * arreglo `comparaciones` trae un badge, lo pinta; si no lo trae, no pinta nada. La pregunta
 * "¿hay base de comparación?" se responde UNA vez, en quien arma los props, y la respuesta correcta
 * ya existe en el repo — `calcularCambio()` (mismo archivo) devuelve `undefined` cuando la base es
 * nula o 0. El módulo simplemente no la llama todavía.
 *
 * **Un solo acento.** `HeroKPICards.tsx` traía cuatro gradientes distintos por tarjeta
 * (`from-orange-500`, `from-blue-500`, `from-teal-500`, `from-primary`) sin criterio semántico.
 * Se retiran: dos tonos, ambos derivados de la marca. El color semántico (verde/rojo del delta)
 * es otra cosa y sí se conserva — mide bueno/malo, no decora.
 */
export function KPICard({
  titulo,
  valor,
  icon: Icon,
  tono = 'primary',
  comparaciones,
  sinDato = false,
  notaSinDato,
  className,
}: KPICardProps) {
  const badges = (comparaciones ?? []).filter((c) => c.delta !== undefined);

  return (
    <Card className={cn('flex flex-col gap-3 p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            tono === 'primary'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-[18px]" aria-hidden="true" />
        </div>

        {badges.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            {badges.map((c) => (
              <DeltaBadge key={c.tipo} comparacion={c} />
            ))}
          </div>
        )}
      </div>

      <div>
        {sinDato ? (
          <p className="text-xl font-semibold text-muted-foreground tabular-nums">—</p>
        ) : (
          <p className="text-xl font-bold tabular-nums tracking-tight">{valor}</p>
        )}
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">{titulo}</p>

        {sinDato && notaSinDato && (
          <p className="mt-1 text-xs italic text-muted-foreground">{notaSinDato}</p>
        )}

        {!sinDato &&
          (comparaciones ?? []).map((c) => (
            <p key={`${c.tipo}-valor`} className="mt-1 text-xs text-muted-foreground">
              {c.valorFormateado}
            </p>
          ))}
      </div>
    </Card>
  );
}

/**
 * El signo del delta no decide el color por sí solo: subir el costo es malo, subir la eficiencia
 * es bueno. `invertido` lo dice explícitamente en vez de dejarlo a una heurística por título.
 */
function DeltaBadge({ comparacion }: { comparacion: KPIComparacion }) {
  const { delta, invertido = false, etiqueta } = comparacion;
  if (delta === undefined) return null;

  const sube = delta > 0;
  const esBueno = invertido ? !sube : sube;
  const Icono = sube ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
        esBueno ? 'text-success' : 'text-destructive',
      )}
      title={`${etiqueta}: ${formatearPorcentajeConSigno(delta)}`}
    >
      <Icono className="size-3" aria-hidden="true" />
      {formatearPorcentajeConSigno(delta)}
    </span>
  );
}
