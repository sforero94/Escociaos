import { useQuincenaConfirmation } from './useQuincenaConfirmation';
import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { resolverLitrosQuincenal } from '@/utils/hatoProduccion';
import { ETAPAS_ROSTER_PESAJE, esCandidataRosterPesaje } from '@/utils/importHato/ocrPesaje';
import type {
  HatoVacaActiva,
  HatoPesajeLeche,
  HatoProduccionQuincenal,
  OrigenDatoProduccionQuincenal,
  OrigenNumVacasOrdeno,
} from '@/types/hato';

/**
 * Acceso a datos de Supabase para `/hato-lechero/produccion` (S5 — V2/V3/V4,
 * docs/plan_hato_lechero_module.md §7.1/§7.5; reescrito en SOW 3 de
 * `docs/plan_hato_produccion_rework.md` §3/§6 sobre el vínculo financiero de
 * la migración 070). La lógica pura (fecha del último día de pesaje,
 * resolución/rango de quincena, productividad) vive en
 * `src/utils/calculosHato.ts`; la lógica pura de este rework (resolución de
 * litros de una fila `medido`) vive en `src/utils/hatoProduccion.ts` — este
 * hook solo consulta y escribe.
 *
 * La venta medida usa preparación del par producción/ingreso, revisión
 * capturada, confirmación explícita y recuperación del intento original.
 * Preparar no registra ni elimina; el servidor calcula ICA y neto.

 */

/** Embed `fin_ingreso:fin_ingresos(...)` que trae `SELECT_QUINCENA` --
 * campos NOT NULL de `fin_ingresos` (R5) que el formulario necesita para
 * prellenar la edición de una quincena `medido`. `null` cuando RLS bloqueó
 * el embed (usuario sin acceso a Finanzas) -- `resolverLitrosQuincenal`
 * decide qué hacer con eso, nunca se asume no-null. */
interface FinIngresoEmbedQuincena {
  fecha: string;
  valor: number;
  region_id: string;
  medio_pago_id: string;
  comprador_id: string | null;
  nombre: string;
  cantidad: number | null;
}

/** Fila de `hato_animales` tal como la consulta `fetchRosterPesaje` -- solo
 * lo que el predicado del roster y el PDF necesitan. */
interface FilaRosterPesajeDb {
  id: string;
  numero: number | null;
  nombre: string | null;
  etapa: string | null;
  estado: string | null;
}

interface FilaQuincenalDb {
  id: string;
  anio: number;
  mes: number;
  quincena: 1 | 2;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  litros_total: number | null;
  litros_pomar_confirmado: number | null;
  num_vacas_ordeno: number | null;
  /** Precio bruto por litro (D-11/D-12, migración 085) -- `null` para
   * filas anteriores a esa migración. */
  precio_bruto_litro: number | null;
  notas: string | null;
  fuente: string | null;
  origen_dato: OrigenDatoProduccionQuincenal;
  num_vacas_ordeno_origen: OrigenNumVacasOrdeno | null;
  fin_ingreso_id: string;
  updated_at: string | null;
  updated_by: string | null;
  fin_ingreso: FinIngresoEmbedQuincena | null;
}

/** Fila de `hato_produccion_quincenal` con `litros_total` YA resuelto (ver
 * `resolverLitrosQuincenal`) + el ingreso enlazado completo -- lo que
 * necesita `ProduccionQuincenalForm` para editar y lo que ya consumían
 * `HatoDashboard`/`ProduccionView`/`GraficoLitrosQuincenal` (que solo leen
 * los campos de `HatoProduccionQuincenal`, así que siguen compilando sin
 * cambios contra este tipo, más amplio). */
export interface HatoProduccionQuincenalConIngreso extends HatoProduccionQuincenal {
  finIngreso: FinIngresoEmbedQuincena | null;
}

const SELECT_QUINCENA =
  'id, anio, mes, quincena, fecha_inicio, fecha_fin, litros_total, litros_pomar_confirmado, num_vacas_ordeno, precio_bruto_litro, notas, fuente, origen_dato, num_vacas_ordeno_origen, fin_ingreso_id, updated_at, updated_by, fin_ingreso:fin_ingresos(fecha,valor,region_id,medio_pago_id,comprador_id,nombre,cantidad)';

function mapFilaConIngreso(fila: FilaQuincenalDb): HatoProduccionQuincenalConIngreso {
  return {
    id: fila.id,
    anio: fila.anio,
    mes: fila.mes,
    quincena: fila.quincena,
    fecha_inicio: fila.fecha_inicio,
    fecha_fin: fila.fecha_fin,
    litros_total: resolverLitrosQuincenal(fila),
    litros_pomar_confirmado: fila.litros_pomar_confirmado,
    num_vacas_ordeno: fila.num_vacas_ordeno,
    precio_bruto_litro: fila.precio_bruto_litro,
    notas: fila.notas,
    fuente: fila.fuente,
    fin_ingreso_id: fila.fin_ingreso_id,
    origen_dato: fila.origen_dato,
    num_vacas_ordeno_origen: fila.num_vacas_ordeno_origen,
    updated_at: fila.updated_at,
    updated_by: fila.updated_by,
    finIngreso: fila.fin_ingreso,
  };
}

/** Form fields mapped to the protected measured-pair draft. Period dates are
 * derived by the server; preparation is separate from confirmed posting. */
export interface GuardarQuincenaVentaParams {
  quincenaId: string | null;
  anio: number;
  mes: number;
  quincena: 1 | 2;
  fechaInicio: string;
  fechaFin: string;
  litrosTotal: number;
  litrosPomarConfirmado: number | null;
  numVacasOrdeno: number | null;
  notas: string | null;
  finIngreso: {
    fecha: string;
    /** Bruto de la liquidación de El Pomar (D-11, migración 085) -- el RPC
     * calcula el neto y el ICA a partir de este valor; nunca el neto
     * capturado a mano. */
    valorBruto: number;
    regionId: string;
    medioPagoId: string;
    compradorId: string | null;
    nombre: string | null;
  };
}

export function useProduccionHato(enabled = true, contextKey = "") {
  const confirmation = useQuincenaConfirmation(enabled, contextKey);
  const [loading, setLoading] = useState(false);
  // `hato_*` no está en el `Database` generado (mismo caso que `gan_*` en
  // useGanadoInventario.ts) -- se sigue el mismo workaround ya establecido
  // en el repo en vez de regenerar tipos como parte de esta sesión.
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Lee `hato_config.dia_pesaje_semanal` (migración 064) en vivo. Lanza un
   * error explícito si falta o está mal tipado -- nunca un default
   * silencioso (mismo contrato que `construirHatoConfigDesdeFilas`). */
  const fetchDiaPesajeSemanal = useCallback(async (): Promise<{ iso: number; nombre: string }> => {
    const { data, error } = await supabase
      .from('hato_config')
      .select('valor')
      .eq('clave', 'dia_pesaje_semanal')
      .maybeSingle();
    if (error) throw error;
    const valor = data?.valor as { iso?: unknown; nombre?: unknown } | undefined;
    if (!valor || typeof valor.iso !== 'number' || valor.iso < 1 || valor.iso > 7) {
      throw new Error(
        'hato_config.dia_pesaje_semanal no está configurado o tiene un valor inválido (migración 064). ' +
          'Verifica que la migración se aplicó en este entorno.',
      );
    }
    return { iso: valor.iso, nombre: typeof valor.nombre === 'string' ? valor.nombre : '' };
  }, [supabase]);

  /** Lee `hato_config.retencion_ica_leche` (migración 085) en vivo -- D-11:
   * "nunca una constante en código". Lanza un error explícito si falta o
   * está mal tipada, mismo contrato que `fetchDiaPesajeSemanal`. Es SOLO
   * para el preview del formulario antes de guardar (D-11/D-12): el ICA
   * que realmente se persiste siempre lo calcula el RPC del lado del
   * servidor, leyendo la MISMA clave en el mismo instante del guardado. */
  const fetchRetencionIcaLeche = useCallback(async (): Promise<number> => {
    const { data, error } = await supabase
      .from('hato_config')
      .select('valor')
      .eq('clave', 'retencion_ica_leche')
      .maybeSingle();
    if (error) throw error;
    const valor = data?.valor;
    if (typeof valor !== 'number' || valor < 0 || valor >= 1) {
      throw new Error(
        'hato_config.retencion_ica_leche no está configurada o tiene un valor inválido (migración 085). ' +
          'Verifica que la migración se aplicó en este entorno.',
      );
    }
    return valor;
  }, [supabase]);

  /**
   * Roster de la planilla mensual de pesaje: TODO el hato ordeñable -- vacas
   * en ordeño, horras y novillas, todas las activas (decisión del dueño,
   * 2026-08-11: un solo template). El criterio NO se escribe acá: vive en
   * `esCandidataRosterPesaje` (`importHato/ocrPesaje.ts`), el único archivo
   * que se espeja a los dos árboles de servidor, para que el PDF, el roster
   * del OCR y la revalidación del commit no puedan divergir.
   *
   * El `.in('etapa', …)` es un filtro ancho para no traerse las terneras;
   * quien decide de verdad es el predicado.
   */
  const fetchRosterPesaje = useCallback(async (): Promise<HatoVacaActiva[]> => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hato_animales')
        .select('id, numero, nombre, etapa, estado')
        .eq('estado', 'activa')
        .in('etapa', ETAPAS_ROSTER_PESAJE as string[]);
      if (error) throw error;
      return ((data ?? []) as FilaRosterPesajeDb[])
        .filter((f) => esCandidataRosterPesaje({ etapa: f.etapa, estado: f.estado }))
        .map((f) => ({ id: f.id, numero: f.numero, nombre: f.nombre }));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  /** Historial de producción quincenal, más reciente primero, con
   * `litros_total` ya resuelto (medido -> `fin_ingreso.cantidad`;
   * derivado_mensual -> la columna). */
  const fetchHistorialQuincenal = useCallback(async (limite = 12): Promise<HatoProduccionQuincenalConIngreso[]> => {
    const { data, error } = await supabase
      .from('hato_produccion_quincenal')
      .select(SELECT_QUINCENA)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
      .order('quincena', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return ((data ?? []) as FilaQuincenalDb[]).map(mapFilaConIngreso);
  }, [supabase]);

  /** Registro existente para (año, mes, quincena), o `null` si aún no se
   * ha capturado -- el formulario usa esto para decidir edición vs. alta, y
   * para prellenar los campos del ingreso enlazado (`finIngreso`). */
  const fetchQuincena = useCallback(
    async (anio: number, mes: number, quincena: 1 | 2): Promise<HatoProduccionQuincenalConIngreso | null> => {
      const { data, error } = await supabase
        .from('hato_produccion_quincenal')
        .select(SELECT_QUINCENA)
        .eq('anio', anio)
        .eq('mes', mes)
        .eq('quincena', quincena)
        .maybeSingle();
      if (error) throw error;
      return data ? mapFilaConIngreso(data as FilaQuincenalDb) : null;
    },
    [supabase],
  );

  /** Prepare only; posting requires a separate captured review. */
  const guardarQuincena = useCallback(
    (params: GuardarQuincenaVentaParams) => confirmation.prepare({
      version: 1, kind: 'save', targetId: params.quincenaId,
      fields: {year: params.anio, month: params.mes, quincena: params.quincena,
        liters: params.litrosTotal, pomar: params.litrosPomarConfirmado,
        cows: params.numVacasOrdeno, notes: params.notas,
        incomeDate: params.finIngreso.fecha, gross: params.finIngreso.valorBruto,
        regionId: params.finIngreso.regionId, mediumId: params.finIngreso.medioPagoId,
        buyerId: params.finIngreso.compradorId, name: params.finIngreso.nombre},
    }), [confirmation.prepare],
  );
  const eliminarQuincena = useCallback(
    (quincenaId: string) => confirmation.prepare({version: 1, kind: 'delete', targetId: quincenaId, fields: null}),
    [confirmation.prepare],
  );

  return {
    loading,
    confirmation,
    fetchDiaPesajeSemanal,
    fetchRetencionIcaLeche,
    fetchRosterPesaje,
    fetchHistorialQuincenal,
    fetchQuincena,
    guardarQuincena,
    eliminarQuincena,
  };
}
