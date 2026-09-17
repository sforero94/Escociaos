import { useNavigate } from 'react-router-dom';
import { diaBogota, horaBogota } from '@/utils/fechas';
import { frasearNovedad } from '@/utils/novedades/frases';
import type { FuenteNovedad, ModuloNovedad, Novedad } from '@/utils/novedades/tipos';

/**
 * Una línea del bloque "Novedades" (issue #266, F3 -- §4.1 del brief: "tres
 * partes y nada más"). Presentacional: recibe la `Novedad` YA agrupada y
 * `hoyBogota` YA calculado por el llamador (mismo patrón "reloj como
 * parámetro" que `agrupar.ts`/`frases.ts` -- nunca `obtenerFechaHoy()`
 * propio, para que este componente sea testeable con fixtures fijas).
 *
 * Punto de color = MÓDULO, nunca severidad (§4.1 del brief: "El bloque no
 * lleva lenguaje de alerta"). Mismo patrón de `Punto`/`DOT_CLASS` que
 * `SaludDatos.tsx` ya usa para su propio punto de frescura.
 *
 * La línea entera navega cuando `novedad.ruta` no es `null` -- un
 * `<button>` nativo, no un `<div onClick>`, para que el teclado la alcance
 * gratis (CLAUDE.md: "fix the markup", no parchar con ARIA). Sin `ruta`
 * (fuente que todavía no tiene destino que filtrar, §17.4 del plan
 * técnico) es un `<div>` plano: no debe parecer clicable si no lo es.
 */

const DOT_MODULO: Record<ModuloNovedad, string> = {
  hato_lechero: 'bg-sky-400',
  aguacate: 'bg-lime-600',
  finanzas: 'bg-violet-400',
  ganado: 'bg-orange-400',
};

function Punto({ modulo }: { modulo: ModuloNovedad }) {
  return <span className={`mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${DOT_MODULO[modulo]}`} aria-hidden="true" />;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Hora si la captura fue HOY (Bogotá); el día calendario de captura si no
 *  (§4.1 del brief, parte 3 -- "hora si es hoy; el día si no"). Formatea
 *  directamente el string `AAAA-MM-DD` que ya devolvió `diaBogota()` --
 *  ninguna conversión de huso adicional, sólo aritmética de texto (mismo
 *  criterio que `diaYMes()` en `frases.ts`). */
function etiquetaCaptura(capturadoEn: string, hoyBogota: string): string {
  const dia = diaBogota(capturadoEn);
  if (dia === hoyBogota) return horaBogota(capturadoEn);
  const [, mes, d] = dia.split('-').map(Number);
  return `${d} ${MESES_CORTOS[mes - 1]}`;
}

export interface NovedadLineaProps {
  novedad: Novedad;
  /** Día calendario Bogotá de "hoy" -- lo calcula el llamador una sola vez
   *  (`obtenerFechaHoy()`) y lo reparte, nunca cada línea por su cuenta. */
  hoyBogota: string;
  /** M-5 (§9 del plan técnico) -- se llama ANTES de navegar, nunca después
   *  (si la navegación desmonta este componente, el disparo posterior
   *  jamás correría). */
  onNavegar: (fuente: FuenteNovedad) => void;
}

export function NovedadLinea({ novedad, hoyBogota, onNavegar }: NovedadLineaProps) {
  const navigate = useNavigate();
  const { autor, texto, detalle } = frasearNovedad(novedad);
  const captura = etiquetaCaptura(novedad.capturadoEn, hoyBogota);
  const puedeNavegar = novedad.ruta != null;
  // `texto` empieza SIEMPRE con `autor` (contrato de `FraseNovedad` en
  // frases.ts) -- separar por longitud, no por texto, evita depender de que
  // ningún nombre contenga caracteres especiales de regex.
  const resto = texto.slice(autor.length);

  const contenido = (
    <>
      <Punto modulo={novedad.modulo} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-foreground lg:truncate">
            <strong className="font-semibold">{autor}</strong>
            {resto}
          </p>
          <span className="flex-shrink-0 text-xs tabular-nums text-brand-brown/60">{captura}</span>
        </div>
        {detalle && <p className="mt-0.5 text-xs text-brand-brown/70">{detalle}</p>}
      </div>
    </>
  );

  if (!puedeNavegar) {
    return <div className="flex min-h-11 items-start gap-3 px-4 py-3">{contenido}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => {
        onNavegar(novedad.fuente);
        navigate(novedad.ruta!);
      }}
      className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      {contenido}
    </button>
  );
}
