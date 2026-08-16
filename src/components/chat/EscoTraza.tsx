/**
 * Traza de Esco — qué está consultando, mientras lo consulta.
 *
 * Reemplaza el spinner de 16 px con la palabra "Consultando datos…", que era todo
 * lo que se veía durante ~27 de los 30 segundos que tarda una respuesta con
 * herramientas. Los datos ya existían: el tool-calling loop siempre supo qué
 * estaba llamando, solo que no lo contaba hasta terminar.
 *
 * Adaptado del primitivo Thinking de Beautiful UI (Turbo,
 * https://beautiful-ui-five.vercel.app/#thinking-state). Se conserva su gramática
 * — encabezado con shimmer, hilo vertical, filas escalonadas, chevron que gira,
 * se auto-expande al trabajar y se asienta colapsado al terminar — y se cambia
 * todo lo demás:
 *
 *  - Tokens de Escocia OS, no los de la librería (evita el choque de `--accent`,
 *    que en Beautiful UI es el color de marca y en shadcn la superficie de hover).
 *  - Estado real desde eventos SSE, no la secuencia de `setTimeout` del demo.
 *  - Animaciones en CSS (`globals.css`) para que `prefers-reduced-motion` las
 *    alcance; en el original van en línea y el ajuste del sistema no las toca.
 *  - Anillo de foco visible y área táctil de 44 px, que el original no trae.
 */

import { useState } from 'react';
import { Check, ChevronDown, Sparkles, TriangleAlert } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import {
  detalleArgumentos,
  etiquetaHerramienta,
  formatearDuracion,
  resumenTraza,
} from '@/utils/escoHerramientas';
import type { PasoTraza } from '@/types/chat';

interface EscoTrazaProps {
  pasos: PasoTraza[];
  /** `true` mientras el loop sigue corriendo: encabezado con shimmer y auto-expandida. */
  trabajando: boolean;
}

export function EscoTraza({ pasos, trabajando }: EscoTrazaProps) {
  // `null` = seguir el comportamiento automático; un booleano = el usuario decidió.
  const [expandidaManual, setExpandidaManual] = useState<boolean | null>(null);
  const expandida = expandidaManual ?? trabajando;

  if (pasos.length === 0 && !trabajando) return null;

  const enCurso = pasos.find((p) => p.ms === undefined);

  // Las herramientas son rápidas (decenas de ms); casi toda la espera se va en el
  // modelo. Por eso "Redactando la respuesta…" es el estado que más se ve, y tiene
  // que estar en el encabezado — que es lo único visible cuando está colapsada.
  const titulo = !trabajando
    ? resumenTraza(pasos)
    : enCurso
      ? etiquetaHerramienta(enCurso.tool)
      : pasos.length === 0
        ? 'Pensando…'
        : 'Redactando la respuesta…';

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        aria-expanded={expandida}
        onClick={() => setExpandidaManual((actual) => !(actual ?? trabajando))}
        className={cn(
          // `touch-target` (globals.css) sube el alto a 44 px solo bajo 1024 px:
          // los primitivos originales traen botones de 28 px, muy por debajo del
          // piso táctil, y Escocia OS se usa desde el celular en campo.
          'touch-target group -mx-1.5 -my-1 flex w-fit items-center gap-2 rounded-lg px-1.5 py-2',
          'transition-colors hover:bg-muted/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        )}
      >
        <Sparkles
          className={cn('h-4 w-4 shrink-0', trabajando ? 'text-primary' : 'text-muted-foreground')}
          aria-hidden
        />
        <span
          className={cn(
            'text-[13px] font-medium whitespace-nowrap',
            trabajando ? 'esco-traza-activo' : 'text-muted-foreground',
          )}
        >
          {titulo}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-300',
            expandida && 'rotate-180',
          )}
        />
      </button>

      <div className="esco-traza-caja" data-abierta={expandida}>
        <div className="overflow-hidden">
          {/* El hilo vertical ancla las filas al encabezado. */}
          <div className="relative ml-[7px] mt-1 border-l border-border pl-4">
            <div className="flex flex-col gap-0.5 py-1">
              {pasos.map((paso, i) => {
                const corriendo = paso.ms === undefined;
                const fallo = paso.ok === false;
                const detalle = detalleArgumentos(paso.args);

                return (
                  <div
                    key={paso.index}
                    className="esco-traza-fila flex min-h-7 items-center gap-2"
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    {corriendo ? (
                      <span
                        aria-hidden
                        className="esco-traza-spinner h-3 w-3 shrink-0 rounded-full border-[1.5px] border-border border-t-muted-foreground"
                      />
                    ) : fallo ? (
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                    ) : (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    )}

                    <span
                      className={cn(
                        'min-w-0 truncate text-[12.5px]',
                        fallo ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {etiquetaHerramienta(paso.tool)}
                    </span>

                    {detalle && (
                      <span className="shrink-0 truncate text-[11.5px] text-muted-foreground">
                        {detalle}
                      </span>
                    )}

                    {paso.ms !== undefined && (
                      <span className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-muted-foreground">
                        {formatearDuracion(paso.ms)}
                      </span>
                    )}
                  </div>
                );
              })}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
