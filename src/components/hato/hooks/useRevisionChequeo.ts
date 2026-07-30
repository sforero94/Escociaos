// ARCHIVO: components/hato/hooks/useRevisionChequeo.ts
// DESCRIPCIÓN: Estado de la VENTANA DE CORRECCIÓN del chequeo (Fase 3a de
// `docs/plan_chequeo_captura_foto.md`, decisión D-C del dueño 2026-07-29).
// Junta tres cosas y ninguna más:
//   1. I/O: el estado FRESCO del hato con el que se re-clasifica en cliente
//      (`hato_config`, `hato_animales` activas, el último `hato_chequeo_vacas`
//      por animal, y los nombres de `hato_toros`).
//   2. El borrador de correcciones que teclea la persona que revisa.
//   3. La composición: filas corregidas (`aplicarCorreccionesHoja`, puro) ->
//      `construirDiffChequeo` (el MISMO motor que corre el servidor) -> filas
//      que se envían al commit.
//
// Por qué se re-diffea en el CLIENTE y no con un endpoint nuevo: el commit
// (`hato-chequeo-commit.ts`) ya revalida corriendo `construirDiffChequeo`
// sobre las filas QUE ENVÍA EL CLIENTE contra el estado fresco de la BD -- no
// re-parsea el `.xlsx`. Un valor corregido en pantalla es aceptable por
// construcción: solo cambia su clasificación entre `sin_cambio` y `cambio`,
// ambas escribibles. Así que la ventana de corrección no necesita ni endpoint
// nuevo ni tocar la RPC 065; solo necesita el mismo insumo que el servidor, y
// eso lo puede leer con la sesión del usuario (RLS de `hato_*`: SELECT para
// cualquier autenticado, migración 053).
//
// Las consultas replican EXACTAMENTE las del endpoint de preview
// (`hato-chequeo-preview.ts`): `hato_animales` filtrado a `estado='activa'`
// (migración 066: `numero` solo es único entre activas, así que sin ese filtro
// el Map por número sería ambiguo) y el histórico de `hato_chequeo_vacas`
// reducido con `seleccionarUltimoChequeoPorAnimal`. Si divergieran, el cliente
// mostraría una clasificación distinta de la que el commit va a revalidar.
// Diferencia deliberada: acá se pagina con `fetchAll` -- `hato_chequeo_vacas`
// ya tiene ~1.500 filas y PostgREST corta en 1.000 sin avisar.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from '@/utils/hatoConfigDesdeTabla';
import {
  construirDiffChequeo,
  seleccionarUltimoChequeoPorAnimal,
  type AnimalHatoActual,
  type FilaChequeoVacaHistorico,
  type ResultadoDiffChequeo,
  type UltimoChequeoVacaActual,
} from '@/utils/importHato/diffChequeo';
import {
  aplicarCorreccionesHoja,
  compararClasificaciones,
  detectarTorosNuevos,
  seleccionarFilasAprobables,
  validarFechaChequeo,
  type CampoCorreccionChequeo,
  type CambioDeClasificacion,
  type CorreccionesPorFila,
  type ErrorCorreccionChequeo,
  type ResumenCorrecciones,
} from '@/utils/hatoCorreccionChequeo';
import { obtenerFechaHoy } from '@/utils/fechas';
import type { HatoConfig } from '@/utils/calculosHato';
import type { FilaChequeoNormalizada } from '@/utils/importHato/tipos';
import type { PreviewChequeoRespuesta } from './useSubirChequeoExcel';

interface EstadoHatoFresco {
  config: HatoConfig;
  animales: AnimalHatoActual[];
  ultimosChequeos: UltimoChequeoVacaActual[];
  nombresToros: string[];
}

export interface RevisionChequeo {
  /** Diff VIGENTE que la UI muestra: el recalculado con estado fresco +
   * correcciones cuando ya se pudo cargar el estado; el del servidor mientras
   * carga (nunca una pantalla vacía). */
  diff: ResultadoDiffChequeo;
  /** Filas con las correcciones aplicadas -- la fuente de los valores que se
   * muestran en los inputs y lo que se envía al commit. */
  filasCorregidas: FilaChequeoNormalizada[];
  filasAprobables: FilaChequeoNormalizada[];
  correcciones: CorreccionesPorFila;
  camposCorregidosPorFila: Record<number, CampoCorreccionChequeo[]>;
  erroresCorreccion: ErrorCorreccionChequeo[];
  resumenCorrecciones: ResumenCorrecciones;
  /** Texto del input de fecha del chequeo (puede ser inválido mientras se escribe). */
  fechaChequeoTexto: string;
  fechaChequeoValida: string | null;
  errorFechaChequeo: string | null;
  /** Filas cuya clasificación YA cambió entre la vista previa del servidor y
   * el estado fresco, ANTES de cualquier corrección: el hato cambió entre
   * tanto. Se avisa acá en vez de esperar el 409 del commit. */
  derivasDesdePreview: CambioDeClasificacion[];
  /** Toros que el commit crearía en el catálogo al aprobar. */
  torosNuevos: string[];
  /** `true` cuando ya hay estado fresco: sin él no se puede re-clasificar y la
   * edición se deshabilita (nunca se edita sin poder recalcular). */
  puedeEditar: boolean;
  cargandoEstado: boolean;
  errorEstado: string | null;
  corregirCampo: (fila: number, campo: CampoCorreccionChequeo, texto: string) => void;
  deshacerFila: (fila: number) => void;
  setFechaChequeoTexto: (texto: string) => void;
  /** Vuelve a leer el estado del hato -- se llama tras crear la ficha de un
   * animal `nuevo`, que es lo que reclasifica esa fila a escribible. */
  recargarEstado: () => void;
}

const REVISION_VACIA_DIFF: ResultadoDiffChequeo = {
  filas: [],
  resumen: { totalFilas: 0, nuevos: 0, sinCambio: 0, cambios: 0, noReconocidos: 0, conIssues: 0 },
  colisionesEnHoja: [],
};

export function useRevisionChequeo(resultado: PreviewChequeoRespuesta | null): RevisionChequeo {
  const [estado, setEstado] = useState<EstadoHatoFresco | null>(null);
  const [cargandoEstado, setCargandoEstado] = useState(false);
  const [errorEstado, setErrorEstado] = useState<string | null>(null);
  const [correcciones, setCorrecciones] = useState<CorreccionesPorFila>({});
  const [fechaChequeoTexto, setFechaChequeoTexto] = useState('');

  const cargarEstado = useCallback(async () => {
    setCargandoEstado(true);
    setErrorEstado(null);
    try {
      // `hato_*` no está en `src/types/database.ts` (generado, anterior a la
      // migración 044) -- mismo `as any` que el resto de los hooks del módulo.
      const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

      const [configRes, animalesRes, torosRes] = await Promise.all([
        supabase.from('hato_config').select('clave, valor'),
        // Todas las activas, no solo las de la hoja: corregir una caravana
        // puede apuntar a un animal que no estaba en el archivo.
        fetchAll<AnimalHatoActual>((desde, hasta) =>
          supabase
            .from('hato_animales')
            .select('id, numero, nombre, etapa, estado')
            .eq('estado', 'activa')
            .order('numero')
            .range(desde, hasta),
        ),
        supabase.from('hato_toros').select('nombre'),
      ]);

      if (configRes.error) throw new Error(`No se pudo leer hato_config: ${configRes.error.message}`);
      if (torosRes.error) throw new Error(`No se pudo leer hato_toros: ${torosRes.error.message}`);

      // Lanza nombrando cada clave faltante/mal tipada -- mismo contrato que
      // el endpoint: sin config no hay derivación de SECAR/PP posible.
      const config = construirHatoConfigDesdeFilas((configRes.data ?? []) as FilaHatoConfig[]);

      const animales = animalesRes.filas;
      const animalIds = animales.map((a) => a.id);

      let historico: FilaChequeoVacaHistorico[] = [];
      if (animalIds.length > 0) {
        const historicoRes = await fetchAll<Record<string, unknown>>((desde, hasta) =>
          supabase
            .from('hato_chequeo_vacas')
            .select(
              'animal_id, pl, num_partos, fecha_servicio, toro, tipo_servicio, fecha_secar, fecha_probable_parto, estado, created_at, hato_chequeos(fecha)',
            )
            .in('animal_id', animalIds)
            .order('created_at', { ascending: true })
            .range(desde, hasta),
        );
        historico = historicoRes.filas.map((f) => {
          const chequeo = f.hato_chequeos as { fecha: string } | { fecha: string }[] | null;
          const fecha = Array.isArray(chequeo) ? chequeo[0]?.fecha : chequeo?.fecha;
          return {
            animalId: f.animal_id as string,
            chequeoFecha: fecha ?? '',
            createdAt: f.created_at as string,
            pl: f.pl as number | null,
            numPartos: f.num_partos as number | null,
            fechaServicio: f.fecha_servicio as string | null,
            toro: f.toro as string | null,
            tipoServicio: f.tipo_servicio as 'monta' | 'inseminacion' | null,
            fechaSecar: f.fecha_secar as string | null,
            fechaProbableParto: f.fecha_probable_parto as string | null,
            estado: f.estado as FilaChequeoVacaHistorico['estado'],
          };
        });
      }

      setEstado({
        config,
        animales,
        ultimosChequeos: seleccionarUltimoChequeoPorAnimal(historico),
        nombresToros: ((torosRes.data ?? []) as { nombre: string }[]).map((t) => t.nombre),
      });
    } catch (err) {
      setEstado(null);
      setErrorEstado(
        err instanceof Error
          ? err.message
          : 'Error desconocido leyendo el estado del hato para recalcular el diff',
      );
    } finally {
      setCargandoEstado(false);
    }
  }, []);

  // Cada vista previa nueva reinicia el borrador: las correcciones de un
  // archivo anterior no pueden filtrarse al siguiente.
  useEffect(() => {
    setCorrecciones({});
    if (!resultado) {
      setEstado(null);
      setErrorEstado(null);
      setFechaChequeoTexto('');
      return;
    }
    setFechaChequeoTexto(resultado.chequeoFecha ?? '');
    void cargarEstado();
  }, [resultado, cargarEstado]);

  const hoy = obtenerFechaHoy();
  const { fecha: fechaChequeoValida, error: errorFechaChequeo } = useMemo(
    () => validarFechaChequeo(fechaChequeoTexto, hoy),
    [fechaChequeoTexto, hoy],
  );

  // Memoizado (y no `resultado?.filasNormalizadas ?? []` inline) para que el
  // arreglo vacío no sea una referencia nueva en cada render y dispare los
  // useMemo de abajo -- que recalculan el diff de ~35 filas.
  const filasOriginales = useMemo(() => resultado?.filasNormalizadas ?? [], [resultado]);

  const aplicado = useMemo(() => {
    if (!estado) return null;
    return aplicarCorreccionesHoja(filasOriginales, correcciones, estado.config, fechaChequeoValida);
  }, [estado, filasOriginales, correcciones, fechaChequeoValida]);

  const diffFresco = useMemo(() => {
    if (!estado || !aplicado) return null;
    return construirDiffChequeo(aplicado.filas, estado.animales, estado.ultimosChequeos);
  }, [estado, aplicado]);

  /** Diff del estado fresco SIN correcciones -- solo para detectar que el hato
   * cambió desde la vista previa. Nunca se muestra como el diff vigente. */
  const diffFrescoSinCorregir = useMemo(() => {
    if (!estado) return null;
    return construirDiffChequeo(filasOriginales, estado.animales, estado.ultimosChequeos);
  }, [estado, filasOriginales]);

  const diff = diffFresco ?? resultado?.diffChequeos ?? REVISION_VACIA_DIFF;
  const filasCorregidas = aplicado?.filas ?? filasOriginales;

  const derivasDesdePreview = useMemo(() => {
    if (!resultado || !diffFrescoSinCorregir) return [];
    return compararClasificaciones(resultado.diffChequeos, diffFrescoSinCorregir);
  }, [resultado, diffFrescoSinCorregir]);

  const filasAprobables = useMemo(() => seleccionarFilasAprobables(filasCorregidas, diff), [filasCorregidas, diff]);

  const torosNuevos = useMemo(
    () => (estado ? detectarTorosNuevos(filasAprobables, estado.nombresToros) : []),
    [estado, filasAprobables],
  );

  const corregirCampo = useCallback((fila: number, campo: CampoCorreccionChequeo, texto: string) => {
    setCorrecciones((prev) => ({ ...prev, [fila]: { ...prev[fila], [campo]: texto } }));
  }, []);

  const deshacerFila = useCallback((fila: number) => {
    setCorrecciones((prev) => {
      const siguiente = { ...prev };
      delete siguiente[fila];
      return siguiente;
    });
  }, []);

  return {
    diff,
    filasCorregidas,
    filasAprobables,
    correcciones,
    camposCorregidosPorFila: aplicado?.camposPorFila ?? {},
    erroresCorreccion: aplicado?.errores ?? [],
    resumenCorrecciones:
      aplicado?.resumen ?? { filasCorregidas: 0, camposCorregidos: 0, fechaChequeoFijadaAMano: false },
    fechaChequeoTexto,
    fechaChequeoValida,
    errorFechaChequeo,
    derivasDesdePreview,
    torosNuevos,
    puedeEditar: estado !== null,
    cargandoEstado,
    errorEstado,
    corregirCampo,
    deshacerFila,
    setFechaChequeoTexto,
    recargarEstado: () => void cargarEstado(),
  };
}
