// ARCHIVO: components/hato/hooks/useAnimalesParaPlanillaChequeo.ts
// DESCRIPCIÓN: B5.1 (export de la planilla del PRÓXIMO chequeo, pre-llenada
// -- docs/hato/sesiones-b5-d7-e3.md, `ChequeosList.tsx`). Carga SOLO lo que
// ese export necesita: identidad + último estado conocido de cada vaca
// activa (chapeta, nombre, PL, #Partos, última cría, sexo de esa cría, fecha
// de servicio, toro, estado del último chequeo) más Secar/Parto Probable ya
// derivados por el motor (`derivarEstadoReproductivo`, el MISMO cálculo que
// el resto del módulo -- nunca una segunda fórmula).
//
// Fase 1 de `docs/plan_chequeo_captura_foto.md`: la planilla es INCREMENTAL
// -- pre-llena todo lo que el sistema ya sabe para que Martha solo anote lo
// que cambió. Antes de esta fase, Sexo cría/Fecha Servicio/Toro/Estado
// salían en `null` fijo desde `ChequeosList.tsx`, aunque la vista ya exponía
// tres de los cuatro.
//
// Deliberadamente independiente de `useHatoAnimales.ts` (que alimenta
// Tablero/Animales/Alertas y no expone "última cría"): esta sesión no toca
// ese hook compartido -- lo usan `HatoDashboard.tsx`/`AnimalesList.tsx`, que
// están fuera de este alcance (ver CLAUDE.md "Hato Lechero" / la nota de la
// sesión de UI en paralelo). Mismo patrón de I/O que el resto del módulo:
// `hato_config` + `v_hato_estado_actual`, `getSupabase() as any` (
// `src/types/database.ts` no incluye tablas/vistas `hato_*`, follow-up #3
// del plan), y `fetchAll` en `hato_eventos`, que ya ronda las 770 filas y
// crece chequeo a chequeo -- un `.select()` liso se truncaría en 1.000 en
// silencio.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from '@/utils/hatoConfigDesdeTabla';
import {
  derivarEstadoReproductivo,
  derivarSexoCria,
  type EstadoActualHatoRow,
  type CriaDestino,
  type SexoCria,
  type TipoEstado,
} from '@/utils/calculosHato';
import type { EstadoActualHatoViewRow, TipoServicioHato } from '@/types/hato';
import { obtenerFechaHoy } from '@/utils/fechas';

export interface AnimalParaPlanillaChequeo {
  numero: number | null;
  nombre: string | null;
  pl: number | null;
  numPartos: number;
  /** "Última Cría" -- fecha del último parto conocido, cruda de la vista
   * (`ultimo_parto_fecha`). `null` = sin partos registrados, nunca una
   * fecha inventada. */
  ultimoPartoFecha: string | null;
  /** Celda `SX` verbatim del parto que corresponde a `ultimoPartoFecha`
   * (`hato_eventos.sx_raw`). Es lo que se imprime en el `.xlsx`: ese archivo
   * es el artefacto de MÁQUINA y debe seguir siendo re-parseable por
   * `importHato/` sin enseñarle alias nuevos. La etiqueta legible ("Hembra
   * (retenida #206)") pertenece al PDF, otro artefacto y otra fase. */
  sexoCriaRaw: string | null;
  /** `hato_eventos.cria_destino` del MISMO parto -- respaldo de `sexoCriaRaw`
   * para derivar el sexo, y dato del que el PDF armará el destino legible. */
  criaDestino: CriaDestino | null;
  /** Sexo ya derivado (`derivarSexoCria`, motor puro) del mismo parto.
   * `null` = no determinable, nunca un valor por defecto. Hoy lo consume el
   * PDF de la Fase 2; el `.xlsx` imprime `sexoCriaRaw`. */
  sexoCria: SexoCria | null;
  /** `ultimo_servicio_fecha` de la vista -- fecha del último servicio
   * registrado. `null` = sin servicio conocido. */
  ultimoServicioFecha: string | null;
  /** Nombre del toro del último servicio, resuelto contra `hato_toros`
   * (`ultimo_servicio_toro_id` es un uuid, no un nombre). `null` cuando el
   * servicio no registró toro o el id no resuelve -- nunca el uuid crudo. */
  toroNombre: string | null;
  /** `ultimo_tipo_servicio` -- gobierna el prefijo `Toro `/`Ins ` que
   * `textoCeldaToro` reconstruye para que `parseToro` lo lea de vuelta. */
  tipoServicio: TipoServicioHato | null;
  /** `ultimo_estado_chequeo` (migración 062) -- el `tipo` NORMALIZADO de
   * `parseEstado`, no el crudo. Hoy solo una minoría de vacas lo tiene; el
   * resto sale en blanco, que es correcto ("sin dato, nunca inventado") y se
   * va llenando chequeo a chequeo. */
  ultimoEstadoChequeo: TipoEstado | null;
  /** Referencia de solo-lectura calculada por el motor (`calculosHato.ts`)
   * con la raza REAL del animal -- distinta de la que deriva
   * `procesarHojaChequeo` durante el parseo de una planilla (que no conoce
   * la raza y usa el `_default` de `HatoConfig`, ver `chequeos.ts`). Es la
   * mejor referencia disponible para que el veterinario la vea impresa. */
  fechaSecar: string | null;
  fechaProbableParto: string | null;
}

/** Lo que se necesita de un evento `parto` para resolver el sexo de la cría
 * SIN romper la coherencia con la fecha que la planilla ya imprime. */
interface UltimoPartoDelAnimal {
  fecha: string;
  sxRaw: string | null;
  criaDestino: CriaDestino | null;
}

/** Fila cruda de `hato_eventos` (tipo `parto`) tal como se consulta acá. */
interface FilaEventoParto {
  animal_id: string;
  fecha: string;
  sx_raw: string | null;
  cria_destino: CriaDestino | null;
  created_at: string;
}

/**
 * `animal_id` -> último parto, con el MISMO criterio con que
 * `v_hato_estado_actual` calcula `ultimo_parto_fecha`: `MAX(fecha)` sobre los
 * eventos tipo `parto` (migración 056). Eso es lo que hace que la fecha de
 * "Última Cría" y el sexo impresos salgan de la MISMA fila y no puedan
 * contradecirse -- el llamador además compara la fecha resuelta acá contra la
 * de la vista antes de usar el sexo.
 *
 * Desempate cuando dos partos comparten la fecha máxima (dato residual, no un
 * caso esperado): gana el insertado más tarde (`created_at`), la lectura más
 * reciente. Determinista a propósito: sin criterio, el sexo impreso dependería
 * del orden en que PostgREST devolvió las filas.
 */
function indexarUltimoParto(filas: readonly FilaEventoParto[]): Map<string, UltimoPartoDelAnimal & { createdAt: string }> {
  const mapa = new Map<string, UltimoPartoDelAnimal & { createdAt: string }>();
  for (const fila of filas) {
    const actual = mapa.get(fila.animal_id);
    const gana =
      !actual ||
      fila.fecha > actual.fecha ||
      (fila.fecha === actual.fecha && fila.created_at > actual.createdAt);
    if (gana) {
      mapa.set(fila.animal_id, {
        fecha: fila.fecha,
        sxRaw: fila.sx_raw,
        criaDestino: fila.cria_destino,
        createdAt: fila.created_at,
      });
    }
  }
  return mapa;
}

function filaVistaAFactRow(fila: EstadoActualHatoViewRow): EstadoActualHatoRow {
  return {
    etapa: fila.etapa,
    raza: fila.raza,
    estado: fila.estado,
    num_partos: fila.num_partos,
    ultimo_chequeo_fecha: fila.ultimo_chequeo_fecha,
    ultimo_servicio_fecha: fila.ultimo_servicio_fecha,
    ultimo_parto_fecha: fila.ultimo_parto_fecha,
    ultimo_secado_real_fecha: fila.ultimo_secado_real_fecha,
    ultima_confirmacion_prenez_fecha: fila.ultima_confirmacion_prenez_fecha,
    ultimo_evento_fecha: fila.ultimo_evento_fecha,
    ultimo_estado_chequeo: fila.ultimo_estado_chequeo,
  };
}

/**
 * Orden de la planilla: **alfabético por NOMBRE**, no por chapeta.
 *
 * POR QUÉ: el nombre es el identificador real del animal, no el número
 * (decisión del dueño, repetida; y `hato_animales.id` siempre fue la
 * identidad, con `numero` degradado a "chapeta actual" mutable en la
 * migración 066). La evidencia decisiva es la planilla que Martha ya usa: sus
 * hojas vienen ordenadas A-Z por nombre. Ordenar por número obligaría a leerla
 * en un orden distinto al que ella tiene interiorizado, y además pondría al
 * final —fuera de contexto— justo a los animales con número provisional
 * (800-999), que son los que hay que identificar por nombre sí o sí.
 *
 * `localeCompare` con locale español para que Ñ y las tildes ordenen bien
 * (CUÑA, MAGNÍFICA). Una vaca sin nombre va al final: es la excepción, no
 * merece encabezar la hoja.
 */
function ordenarPorNombreDeVaca(a: AnimalParaPlanillaChequeo, b: AnimalParaPlanillaChequeo): number {
  if (!a.nombre && !b.nombre) return 0;
  if (!a.nombre) return 1;
  if (!b.nombre) return -1;
  return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
}

/** Solo vacas adultas activas (etapa `vaca`, estado `activa`) -- ordeño y
 * horro por igual, terneras/novillas quedan fuera: la planilla de chequeo
 * histórica es específicamente el ciclo reproductivo de vacas adultas
 * (esquema TERNERAS es una tabla aparte, ver CLAUDE.md "Hato Lechero"). */
function esCandidataAPlanilla(fila: EstadoActualHatoViewRow): boolean {
  return fila.etapa === 'vaca' && fila.estado === 'activa';
}

export function useAnimalesParaPlanillaChequeo() {
  const [animales, setAnimales] = useState<AnimalParaPlanillaChequeo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase() as any;
      const [
        { data: configRows, error: configError },
        { data: estadoRows, error: estadoError },
        { data: toroRows, error: toroError },
        partosRes,
      ] = await Promise.all([
        supabase.from('hato_config').select('clave, valor'),
        supabase.from('v_hato_estado_actual').select('*'),
        // 68 toros en producción, muy lejos del corte de 1.000 -- no necesita
        // paginar. `hato_eventos` sí (ver más abajo).
        supabase.from('hato_toros').select('id, nombre'),
        fetchAll<FilaEventoParto>((desde, hasta) =>
          supabase
            .from('hato_eventos')
            .select('animal_id, fecha, sx_raw, cria_destino, created_at')
            .eq('tipo', 'parto')
            .order('fecha', { ascending: true })
            .range(desde, hasta),
        ),
      ]);
      if (configError) throw configError;
      if (estadoError) throw estadoError;
      if (toroError) throw toroError;

      const config = construirHatoConfigDesdeFilas((configRows ?? []) as FilaHatoConfig[]);
      const hoy = obtenerFechaHoy();
      const nombrePorToroId = new Map<string, string>(
        ((toroRows ?? []) as { id: string; nombre: string }[]).map((t) => [t.id, t.nombre]),
      );
      const ultimoPartoPorAnimal = indexarUltimoParto(partosRes.filas);

      const filas: AnimalParaPlanillaChequeo[] = ((estadoRows ?? []) as EstadoActualHatoViewRow[])
        .filter(esCandidataAPlanilla)
        .map((fila) => {
          const derivado = derivarEstadoReproductivo(filaVistaAFactRow(fila), config, hoy);

          // Coherencia dura entre "Última Cría" y "Sexo cría": la fecha
          // impresa viene de la vista, así que el sexo solo se usa si sale
          // del parto que corresponde a ESA misma fecha. Si no coinciden (la
          // vista y esta consulta se leyeron por separado, o hay un evento
          // recién insertado), se prefiere no imprimir sexo antes que
          // imprimir el de otra cría.
          const parto = ultimoPartoPorAnimal.get(fila.animal_id);
          const partoCoherente = parto && parto.fecha === fila.ultimo_parto_fecha ? parto : null;

          const toroId = fila.ultimo_servicio_toro_id;
          return {
            numero: fila.numero,
            nombre: fila.nombre,
            pl: fila.pl,
            numPartos: fila.num_partos,
            ultimoPartoFecha: fila.ultimo_parto_fecha,
            sexoCriaRaw: partoCoherente?.sxRaw ?? null,
            criaDestino: partoCoherente?.criaDestino ?? null,
            sexoCria: partoCoherente
              ? derivarSexoCria({ sxRaw: partoCoherente.sxRaw, criaDestino: partoCoherente.criaDestino })
              : null,
            ultimoServicioFecha: fila.ultimo_servicio_fecha,
            toroNombre: (toroId ? nombrePorToroId.get(toroId) : undefined) ?? null,
            tipoServicio: fila.ultimo_tipo_servicio,
            ultimoEstadoChequeo: fila.ultimo_estado_chequeo,
            fechaSecar: derivado.fecha_secar,
            fechaProbableParto: derivado.fecha_probable_parto,
          };
        })
        .sort(ordenarPorNombreDeVaca);

      setAnimales(filas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando el hato para la planilla');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { animales, loading, error, reload };
}
