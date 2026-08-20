import type { DiaFranjaLluvia } from '@/utils/calculosClima';
import { formatNumber } from '@/utils/format';

interface FranjaLluviaProps {
  /** Ya construidos por `construirFranjaLluvia` (`calculosClima.ts`), ordenados
   *  ascendente (más antiguo primero). Este componente sólo pinta — nunca
   *  decide qué día es "sin dato". */
  dias: DiaFranjaLluvia[];
  /** Cuántas barras (las más recientes) quedan siempre visibles; el resto
   *  sólo se ve desde `lg:` (escritorio). §9.2: "la franja baja a 7 días" en
   *  móvil. Default 7. */
  visibleEnMovil?: number;
}

const ALTURA_PX = 40;
/** "Casi una línea" — mínimo visible para que un 0mm real no desaparezca. */
const ALTURA_MIN_PX = 3;
/** Ni llena (lluvia) ni plana (seco): a media altura, para que la rayada se
 *  note como un tercer estado y no como una variante de los otros dos. */
const ALTURA_SIN_DATO_PX = 22;

/** mm con 1 decimal si es menor a 10, sin decimales si no — formato
 *  colombiano (coma decimal) vía `formatNumber` (`src/utils/format.ts`). */
export function formatearMm(mm: number): string {
  return `${formatNumber(mm, mm < 10 ? 1 : 0)} mm`;
}

function etiquetaDia(fechaISO: string): string {
  const [, , dia] = fechaISO.split('-');
  return dia;
}

/** Frase de la causa dominante cuando hay días sin dato — sólo nombra el
 *  contador congelado (migración 068) cuando es realmente esa la causa; si
 *  todos los días sin dato lo son por falta de fila (`sin_registro`), no
 *  inventa una explicación que no tiene. */
function causaTexto(dias: DiaFranjaLluvia[]): string | null {
  if (dias.some((d) => d.causa === 'contador_congelado')) {
    return ' — el contador del pluviómetro no se reinició';
  }
  if (dias.some((d) => d.causa === 'cobertura_parcial')) {
    return ' — la estación no registró el día completo';
  }
  return null;
}

/**
 * FranjaLluvia — barra por día de los últimos N días de lluvia
 * (docs/plan_dashboard_centro_control.md §4 Bloque 2.1 / §9.2). Tres estados
 * visualmente distintos, y ninguno se confunde con otro:
 *
 * - `lluvia`: barra azul, altura proporcional a los mm del día.
 * - `seco`: barra plana (0mm real) en un tono neutro, nunca azul.
 * - `sin_dato`: rectángulo rayado con borde punteado, altura fija a media
 *   escala — ni lleno como la lluvia ni plano como el cero real. Nunca
 *   0mm disfrazado: es exactamente el bug que esta franja existe para
 *   hacer visible (migración 068, contador de lluvia congelado).
 */
export function FranjaLluvia({ dias, visibleEnMovil = 7 }: FranjaLluviaProps) {
  if (dias.length === 0) return null;

  const conDato = dias.filter((d) => d.mm !== null);
  const maxMm = conDato.reduce((max, d) => Math.max(max, d.mm ?? 0), 0);
  const acumuladoMm = conDato.reduce((sum, d) => sum + (d.mm ?? 0), 0);
  const sinDatoDias = dias.filter((d) => d.estado === 'sin_dato');
  const causa = causaTexto(sinDatoDias);
  const ocultarEnMovil = Math.max(0, dias.length - visibleEnMovil);

  return (
    <div className="pt-3 border-t border-gray-100 space-y-1.5">
      <span className="text-[10px] uppercase text-brand-brown/40 tracking-wide">
        Lluvia · últimos {dias.length} días
      </span>

      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: ALTURA_PX }}>
        {dias.map((d, i) => {
          const oculto = i < ocultarEnMovil;
          const contenedorClase = `flex-1 flex flex-col items-center justify-end gap-1 ${oculto ? 'hidden lg:flex' : 'flex'}`;

          if (d.estado === 'sin_dato') {
            return (
              <div key={d.fecha} className={contenedorClase}>
                <div
                  data-estado="sin_dato"
                  className="w-full rounded-t-sm border border-dashed border-brand-brown/40 bg-[repeating-linear-gradient(135deg,rgba(77,36,15,0.14)_0px,rgba(77,36,15,0.14)_3px,transparent_3px,transparent_6px)]"
                  style={{ height: ALTURA_SIN_DATO_PX }}
                >
                  <span className="sr-only">
                    {d.fecha}: sin dato de lluvia
                    {d.causa === 'contador_congelado' ? ' — contador del pluviómetro congelado' : ''}
                    {d.causa === 'cobertura_parcial' ? ' — la estación no registró el día completo' : ''}
                  </span>
                </div>
                <span className="text-[10px] text-brand-brown/40">{etiquetaDia(d.fecha)}</span>
                <span aria-hidden="true" className="text-[9px] text-brand-brown/40 -mt-1">s/d</span>
              </div>
            );
          }

          const mm = d.mm ?? 0;
          const alturaBarra = d.estado === 'lluvia' && maxMm > 0
            ? Math.max(ALTURA_MIN_PX, Math.round((mm / maxMm) * ALTURA_PX))
            : ALTURA_MIN_PX;

          return (
            <div key={d.fecha} className={contenedorClase}>
              <div
                data-estado={d.estado}
                className={`w-full rounded-t-sm ${d.estado === 'lluvia' ? 'bg-blue-400' : 'bg-brand-brown/15'}`}
                style={{ height: alturaBarra }}
              >
                <span className="sr-only">{d.fecha}: {formatearMm(mm)}</span>
              </div>
              <span className="text-[10px] text-brand-brown/40">{etiquetaDia(d.fecha)}</span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-brand-brown/60">
        {formatearMm(acumuladoMm)} acumulados
        {sinDatoDias.length > 0 && (
          <span className="text-amber-600">
            {' · '}
            {sinDatoDias.length} de {dias.length} días sin dato de lluvia
            {causa}
          </span>
        )}
      </p>
    </div>
  );
}
