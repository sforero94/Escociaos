import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { NegocioAccion } from '@/utils/accionesTipos';
import type { EntradaSelectores } from '@/utils/accionesHechos';
import type { AccionParaMostrar, FilaAccionCorrida, FilaAccionRecomendada } from '@/types/acciones';
import {
  agruparPorNegocio,
  elegirCorridaVigente,
  filtrarPorVisibilidad,
  renderizarFila,
  separarPorCotejo,
  vigenteHastaSilencio,
} from '@/utils/accionesRecomendadasEstado';

/**
 * Hook de datos del bloque "Acciones recomendadas" (Fase 4 --
 * `docs/brief_tecnico_motor_acciones.md` §10 / `docs/plan_dashboard_centro_control.md`
 * §4 Bloque 4). Sólo hace I/O contra Supabase y wirea el resultado a estado
 * de React -- toda la lógica de decisión vive en `accionesRecomendadasEstado.ts`
 * (pura, testeada sin Supabase).
 *
 * `acciones_recomendadas`/`acciones_corridas`/`acciones_silencios` no están
 * todavía en `src/types/database.ts` (migración 097 aplicada, tipos
 * generados no regenerados) -- `getSupabase() as any`, mismo patrón que
 * `hato_config`/`hato_alertas` en `src/components/hato/hooks/*`.
 *
 * Deliberadamente separado en DOS efectos, para que "cero consultas extra
 * en el navegador" (§6.2 del brief) sea cierto también dentro de este hook:
 *
 *   1. Un efecto que depende sólo de `negociosKey`/`esGerencia` -- éste es
 *      el que golpea Supabase (`acciones_corridas` + `acciones_recomendadas`).
 *   2. Un cotejo derivado (`useMemo`, puro) que depende de las filas ya
 *      traídas y de `entrada` -- lo que el pulso (bloque 3) ya cargó. Si
 *      `entrada` cambia de referencia (p. ej. porque el pulso terminó de
 *      cargar el ganado un segundo después del montaje), este hook vuelve
 *      a cotejar EN MEMORIA, nunca vuelve a pedirle nada a la base.
 *
 * `entrada` no necesita estar memoizada para la corrección de este hook
 * (el cotejo es una función pura, barata); sí conviene memoizarla en el
 * llamador por higiene general de renders, pero ya no es la que evita un
 * refetch de red -- eso ahora lo garantiza la separación de efectos.
 */

export interface UseAccionesRecomendadasParams {
  /** Negocios cuyo módulo el usuario tiene habilitado (`puedeAccederModulo`,
   *  ya filtrado por el llamador -- este hook nunca reimplementa el gate). */
  negocios: NegocioAccion[];
  /** Lo que el pulso (bloque 3) ya cargó, para el cotejo (§6.2). */
  entrada: EntradaSelectores;
  esGerencia: boolean;
  /** `acciones_silencios.descartada_por` -- uuid pelado, sin FK (096). */
  userId: string | null;
}

export type EstadoAccionesRecomendadas = 'cargando' | 'no_disponible' | 'todos_vacios' | 'con_acciones';

export interface UseAccionesRecomendadasResultado {
  estado: EstadoAccionesRecomendadas;
  generadoAt: string | null;
  porNegocio: Array<{ negocio: NegocioAccion; acciones: AccionParaMostrar[] }>;
  /** Escribe en `acciones_silencios` (§5.2) -- NUNCA en la fila de la
   *  acción, para que el descarte sobreviva a la regeneración de las 05:50. */
  descartar: (accion: AccionParaMostrar) => Promise<void>;
}

export function useAccionesRecomendadas(params: UseAccionesRecomendadasParams): UseAccionesRecomendadasResultado {
  const { negocios, entrada, esGerencia, userId } = params;
  const negociosKey = [...negocios].sort().join(',');

  const [cargando, setCargando] = useState(true);
  const [motorDisponible, setMotorDisponible] = useState(false);
  const [generadoAt, setGeneradoAt] = useState<string | null>(null);
  /** Filas ya filtradas por corrida vigente + visibilidad -- TODAVÍA sin
   *  cotejar (el cotejo es el `useMemo` de más abajo). */
  const [filasVisibles, setFilasVisibles] = useState<FilaAccionRecomendada[]>([]);
  /** Descartes aplicados en esta sesión, optimistas (§4.2 del plan: el
   *  descarte tiene que sentirse inmediato). La fila persistida sigue viva
   *  hasta la próxima corrida -- este set sólo oculta en ESTA pestaña. */
  const [idsDescartados, setIdsDescartados] = useState<ReadonlySet<string>>(new Set());

  // --- Efecto 1: fetch. Sólo depende de lo que cambia el CONJUNTO de filas
  // a traer -- nunca de `entrada`. ------------------------------------------------
  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setCargando(true);
      setIdsDescartados(new Set());
      try {
        if (negocios.length === 0) {
          if (!cancelado) {
            setMotorDisponible(false);
            setGeneradoAt(null);
            setFilasVisibles([]);
          }
          return;
        }

        const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- acciones_* no está en database.ts todavía

        const { data: corridas, error: errCorridas } = await supabase
          .from('acciones_corridas')
          .select('id, generado_at, estado')
          .order('generado_at', { ascending: false })
          .limit(5);
        if (errCorridas) throw errCorridas;

        const corridaVigente = elegirCorridaVigente((corridas ?? []) as FilaAccionCorrida[], new Date().toISOString());
        if (!corridaVigente) {
          if (!cancelado) {
            setMotorDisponible(false);
            setGeneradoAt(null);
            setFilasVisibles([]);
          }
          return;
        }

        const { data: filas, error: errFilas } = await supabase
          .from('acciones_recomendadas')
          .select('*')
          .eq('corrida_id', corridaVigente.id)
          .in('negocio', negocios)
          .is('caducada_at', null)
          .order('negocio', { ascending: true })
          .order('orden', { ascending: true });
        if (errFilas) throw errFilas;

        const visibles = filtrarPorVisibilidad((filas ?? []) as FilaAccionRecomendada[], esGerencia);

        if (!cancelado) {
          setFilasVisibles(visibles);
          setGeneradoAt(corridaVigente.generado_at);
          setMotorDisponible(true);
        }
      } catch {
        if (!cancelado) {
          setMotorDisponible(false);
          setGeneradoAt(null);
          setFilasVisibles([]);
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
    // `negocios` se resume en `negociosKey` (string estable) a propósito:
    // el array que llega por props puede tener una referencia nueva en cada
    // render aunque su contenido no cambie, y listarlo aquí reintroduciría
    // exactamente el refetch que esta separación de efectos existe para
    // evitar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negociosKey, esGerencia]);

  // --- Cotejo (§6): puro, en memoria, sobre lo que el pulso ya cargó. --------
  const { vigentes, idsACaducar } = useMemo(() => separarPorCotejo(filasVisibles, entrada), [filasVisibles, entrada]);

  // §6.4: dispara y olvida. Un efecto aparte, con clave por conjunto de ids
  // (no por `entrada`), para no reintentar el mismo PATCH en cada cotejo si
  // `entrada` cambia de referencia sin cambiar de contenido. Nunca bloquea
  // el render ni se reintenta si falla -- para un rol sin el GRANT de
  // columna (sólo Administrador/Gerencia lo tienen), el UPDATE simplemente
  // no aplica (RLS lo descarta en silencio, no hay error que mostrar).
  const idsACaducarClave = idsACaducar.join(',');
  useEffect(() => {
    if (idsACaducar.length === 0) return;
    const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    void supabase
      .from('acciones_recomendadas')
      .update({ caducada_at: new Date().toISOString() })
      .in('id', idsACaducar)
      .then(
        () => {},
        () => {},
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsACaducarClave]);

  const porNegocio = useMemo(() => {
    const mostrables = vigentes.filter((f) => !idsDescartados.has(f.id)).map(renderizarFila);
    return agruparPorNegocio(mostrables, negocios);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vigentes, idsDescartados, negociosKey]);

  const descartar = useCallback(
    async (accion: AccionParaMostrar) => {
      const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const ahora = new Date();
      const { error } = await supabase.from('acciones_silencios').upsert(
        {
          clave: accion.clave,
          negocio: accion.negocio,
          descartada_por: userId,
          descartada_at: ahora.toISOString(),
          vigente_hasta: vigenteHastaSilencio(ahora),
          frase_al_descartar: accion.frase,
        },
        { onConflict: 'clave' },
      );
      if (error) throw error;

      // Optimista: se quita de la vista YA, sin esperar a la corrida de
      // mañana -- es la única señal de calidad que el motor tiene (§4.2 del
      // plan), y tiene que sentirse inmediata.
      setIdsDescartados((prev) => new Set(prev).add(accion.id));
    },
    [userId],
  );

  const estado: EstadoAccionesRecomendadas = cargando
    ? 'cargando'
    : !motorDisponible
      ? 'no_disponible'
      : porNegocio.every((g) => g.acciones.length === 0)
        ? 'todos_vacios'
        : 'con_acciones';

  return { estado, generadoAt, porNegocio, descartar };
}
