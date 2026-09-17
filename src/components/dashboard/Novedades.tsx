import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { obtenerFechaHoy } from '@/utils/fechas';
import type { ProfileParaModulos } from '@/utils/modulosAcceso';
import { formatearListaNombres } from '@/utils/novedades/frases';
import type { ErrorModulo, FuenteNovedad, GrupoDia, ModuloNovedad } from '@/utils/novedades/tipos';
import { useNovedades } from './hooks/useNovedades';
import { NovedadLinea } from './NovedadLinea';

/**
 * Bloque "Novedades" del Tablero General (issue #266, F3 -- reemplaza
 * "Acciones recomendadas" en la MISMA ranura -- `docs/plan_novedades.md` /
 * `docs/plan_novedades_implementacion.md`). NO SE MONTA todavía en
 * `Dashboard.tsx` -- eso es F4 (el release: monta Novedades, desmonta y
 * borra `AccionesRecomendadas`, en el mismo commit -- §11.4 del plan
 * técnico: "dos PR, un solo release").
 *
 * Llama a `useNovedades` internamente (mismo patrón que
 * `AccionesRecomendadas` con `useAccionesRecomendadas`, no el de
 * `RequiereDecision`/`resultado` por prop -- este bloque no comparte
 * ningún estado con ningún vecino, así que no hay motivo para que
 * `Dashboard.tsx` llame al hook por su cuenta).
 *
 * Los seis estados de pantalla (§4.4 del brief + el sexto "truncado" que
 * agrega §7 del plan técnico): cero módulos (Uriel, la sección entera
 * desaparece) → cargando (skeleton) → ventana vacía (nombra los módulos
 * del lector) → con novedades (el peek muestra siempre 5 líneas, móvil y
 * escritorio por igual -- decisión de Santiago 2026-09-17, reemplaza el
 * 3/5 original del brief; tope duro de 20 aun expandido) → una fuente
 * falla (línea gris, el resto se pinta igual) → truncado (nota honesta,
 * sin publicar la cifra como total). "Captura masiva" (§4.4) no tiene UI
 * propia: el grano ya la colapsó en `agrupar.ts`, la línea sólo declara su
 * tamaño.
 *
 * Cero rojo/ámbar, cero badges, cero contador de "nuevas" (§4.4/§5.5 del
 * brief) -- el punto de color es por MÓDULO, nunca por severidad.
 */

export interface NovedadesProps {
  profile: (ProfileParaModulos & { id?: string | null }) | null | undefined;
}

/** Etiqueta corta por módulo para la nota de truncado (§8.3 del plan
 *  técnico) -- deliberadamente local a este archivo: la de
 *  `useNovedades.ts` construye el mensaje del ESTADO DE FALLO ("No se pudo
 *  leer el hato."), que es un texto distinto del de truncado. */
const ETIQUETA_MODULO_TRUNCADO: Record<ModuloNovedad, string> = {
  hato_lechero: 'el hato',
  aguacate: 'aguacate',
  finanzas: 'finanzas',
  ganado: 'ganado',
};

/** Recorta `grupos` (YA ordenados, capturadoEn descendente) a un tope de
 *  LÍNEAS totales, preservando los encabezados de día -- un día que se
 *  queda sin ninguna línea visible no aporta su encabezado (nunca un "Hoy"
 *  vacío). Puro: sin red, sin React. */
function limitarGrupos(grupos: readonly GrupoDia[], tope: number): GrupoDia[] {
  const resultado: GrupoDia[] = [];
  let restante = tope;
  for (const grupo of grupos) {
    if (restante <= 0) break;
    const novedades = grupo.novedades.slice(0, restante);
    if (novedades.length > 0) resultado.push({ ...grupo, novedades });
    restante -= novedades.length;
  }
  return resultado;
}

function totalNovedades(grupos: readonly GrupoDia[]): number {
  return grupos.reduce((acc, g) => acc + g.novedades.length, 0);
}

/** El peek (antes de expandir) SIEMPRE muestra 5 líneas, móvil y escritorio
 *  por igual -- decisión de Santiago 2026-09-17. El brief original pedía
 *  3/5 por breakpoint; esto lo reemplaza a propósito, no lo complementa. */
const PEEK_LINEAS = 5;

function NovedadesSkeleton() {
  return (
    <div className="animate-pulse space-y-4 rounded-xl border border-primary/10 bg-white p-4 shadow-sm" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-4 w-2/3 rounded bg-gray-200" />
          <div className="h-3 w-1/3 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

interface FeedProps {
  grupos: GrupoDia[];
  tope: number;
  hoyBogota: string;
  errores: ErrorModulo[];
  notasTruncado: string[];
  notaPie: string | null;
  onNavegar: (fuente: FuenteNovedad) => void;
  onExpandir: () => void;
}

/** El cuerpo del feed a UN tope de líneas dado. Un solo render -- el peek es
 *  5 tanto en móvil como en escritorio (decisión 2026-09-17), así que ya no
 *  hace falta el doble árbol `lg:hidden`/`hidden lg:block` que el diseño
 *  original (3 móvil / 5 escritorio) exigía. */
export function NovedadesFeed({ grupos, tope, hoyBogota, errores, notasTruncado, notaPie, onNavegar, onExpandir }: FeedProps) {
  const total = totalNovedades(grupos);
  const gruposVisibles = limitarGrupos(grupos, tope);
  const restantes = total - totalNovedades(gruposVisibles);

  return (
    <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-primary/10 bg-white shadow-sm">
      {gruposVisibles.map((grupo) => (
        <div key={grupo.fecha}>
          <p className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-brand-brown/50">{grupo.encabezado}</p>
          <div className="divide-y divide-gray-50">
            {grupo.novedades.map((n) => (
              <NovedadLinea key={n.id} novedad={n} hoyBogota={hoyBogota} onNavegar={onNavegar} />
            ))}
          </div>
        </div>
      ))}

      {restantes > 0 && (
        <button
          type="button"
          onClick={onExpandir}
          className="flex w-full items-center justify-end gap-1 px-4 py-3 text-sm text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          ver las {restantes} restantes
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      {/* Una fuente falla (§4.4 del brief): las demás líneas ya se
          pintaron arriba -- esto SUMA una línea gris, nunca reemplaza el
          resto del feed. */}
      {errores.map((error) => (
        <div key={error.modulo} className="p-4 text-sm text-brand-brown/60">
          {error.mensaje}
        </div>
      ))}

      {/* Truncado (§8.3 del plan técnico, el sexto estado): nota honesta,
          las cifras de ese módulo no se publicaron como totales. */}
      {notasTruncado.map((nota) => (
        <div key={nota} className="p-4 text-xs text-brand-brown/50">
          {nota}
        </div>
      ))}

      {notaPie && (
        <div className="p-4 text-xs text-brand-brown/50">{notaPie}</div>
      )}
    </div>
  );
}

export function Novedades({ profile }: NovedadesProps) {
  const { cargando, grupos, notaPie, errores, modulosTruncados, modulosLegibles, registrarExpansion, registrarNavegacion } =
    useNovedades({ profile });
  const [expandido, setExpandido] = useState(false);

  // Cero módulos habilitados (Uriel): la sección entera desaparece --
  // mismo criterio que `AccionesRecomendadas`/`PulsoNegocio` (§8 del plan
  // del tablero: "nunca un mensaje de 'sin permisos'"). El mensaje que
  // pediría U5.4 no vive acá (§17.3 del plan técnico: "un bloque que no se
  // monta no puede hablar") -- es un cambio de nivel `Dashboard.tsx`, fuera
  // de esta fase.
  if (modulosLegibles.length === 0) return null;

  if (cargando) {
    return (
      <section className="space-y-3">
        <h2 className="text-xl text-foreground">Novedades</h2>
        <NovedadesSkeleton />
      </section>
    );
  }

  // Vacío (grupos y errores, los dos en cero) -- NUNCA "0 novedades"
  // (§4.4/U5.1 del brief). "Sólo errores, sin grupos" no es este estado
  // (mismo criterio que `RequiereDecision`): el feed sigue mostrando la
  // línea gris del fallo aunque no tenga ninguna línea real que ofrecer.
  const vacio = grupos.length === 0 && errores.length === 0;

  const notasTruncado = modulosTruncados.map(
    (modulo) => `Puede haber más de lo que se muestra en ${ETIQUETA_MODULO_TRUNCADO[modulo]} -- se alcanzó el límite de lectura de esta ventana.`,
  );

  return (
    <section className="space-y-3">
      <h2 className="text-xl text-foreground">Novedades</h2>

      {vacio ? (
        <p className="text-sm text-brand-brown/60">
          No se registró nada en {formatearListaNombres(modulosLegibles)} en los últimos 7 días.
        </p>
      ) : (
        <NovedadesFeed
          grupos={grupos}
          tope={expandido ? totalNovedades(grupos) : PEEK_LINEAS}
          hoyBogota={obtenerFechaHoy()}
          errores={errores}
          notasTruncado={notasTruncado}
          notaPie={notaPie}
          onNavegar={registrarNavegacion}
          onExpandir={() => {
            registrarExpansion();
            setExpandido(true);
          }}
        />
      )}
    </section>
  );
}
