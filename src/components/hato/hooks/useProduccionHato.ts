import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { resolverLitrosQuincenal } from '@/utils/hatoProduccion';
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
 * `hato_pesajes_leche` sigue en UPDATE-por-id + INSERT, nunca upsert de
 * PostgREST (CLAUDE.md, precedente `CapturaCosechaGrid`). La producción
 * quincenal YA NO se escribe con ese patrón desde este hook: el "registro
 * único" quincena+ingreso (migración 070, plan §2.0) se escribe con UN
 * `.rpc()` atómico (`fn_hato_guardar_quincena_venta` / `fn_hato_eliminar_
 * quincena_venta`), nunca con dos `.insert()`/`.update()` sueltos -- un
 * fallo entre ellos dejaría una quincena sin ingreso o un ingreso sin
 * quincena (plan §3.1, opción A rechazada).
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
  'id, anio, mes, quincena, fecha_inicio, fecha_fin, litros_total, litros_pomar_confirmado, num_vacas_ordeno, notas, fuente, origen_dato, num_vacas_ordeno_origen, fin_ingreso_id, updated_at, updated_by, fin_ingreso:fin_ingresos(fecha,valor,region_id,medio_pago_id,comprador_id,nombre,cantidad)';

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

/** Payload de `guardarQuincena` -- espejo en camelCase del jsonb que espera
 * `fn_hato_guardar_quincena_venta` (migración 070 §3). `quincenaId` es
 * `null` en alta; presente decide edición (el RPC exige que sea `medido`,
 * nunca `derivado_mensual`, y lo rechaza con una excepción legible si no). */
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
    valor: number;
    regionId: string;
    medioPagoId: string;
    compradorId: string | null;
    nombre: string | null;
  };
}

export function useProduccionHato() {
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

  /** Vacas activas en etapa `vaca` -- universo de la grilla de pesaje
   * semanal (D1/V2). Novillas y terneras no se pesan semanalmente. */
  const fetchVacasActivas = useCallback(async (): Promise<HatoVacaActiva[]> => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hato_animales')
        .select('id, numero, nombre')
        .eq('etapa', 'vaca')
        .eq('estado', 'activa')
        .order('numero', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as HatoVacaActiva[];
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  /** Pesajes existentes para una fecha, indexados por `animal_id` -- una
   * vaca sin entrada en el mapa significa "no pesada ese día" (nunca 0). */
  const fetchPesajesPorFecha = useCallback(async (fecha: string): Promise<Map<string, HatoPesajeLeche>> => {
    const { data, error } = await supabase
      .from('hato_pesajes_leche')
      .select('id, animal_id, fecha, litros_total, litros_am, litros_pm, fuente')
      .eq('fecha', fecha);
    if (error) throw error;
    const mapa = new Map<string, HatoPesajeLeche>();
    for (const fila of (data ?? []) as HatoPesajeLeche[]) {
      mapa.set(fila.animal_id, fila);
    }
    return mapa;
  }, [supabase]);

  /** Guarda pesajes de una jornada: UPDATE-por-id para filas existentes,
   * INSERT para nuevas (UNIQUE(animal_id, fecha) ya lo garantiza, pero
   * evitamos upsert de PostgREST por consistencia con el resto del
   * módulo). Solo se guardan entradas con `litros_total` definido -- una
   * vaca sin valor digitado no genera fila (ausencia = no pesada). */
  const guardarPesajes = useCallback(async (
    fecha: string,
    entradas: Array<{ animal_id: string; litros_total: number; existenteId?: string }>,
  ): Promise<{ guardados: number }> => {
    const existentes = entradas.filter((e) => e.existenteId);
    const nuevas = entradas.filter((e) => !e.existenteId);

    for (const e of existentes) {
      const { error } = await supabase
        .from('hato_pesajes_leche')
        .update({ litros_total: e.litros_total })
        .eq('id', e.existenteId!);
      if (error) throw error;
    }

    if (nuevas.length > 0) {
      const { error } = await supabase.from('hato_pesajes_leche').insert(
        nuevas.map((e) => ({ animal_id: e.animal_id, fecha, litros_total: e.litros_total, fuente: 'web' })),
      );
      if (error) throw error;
    }

    return { guardados: entradas.length };
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

  /** Escritura atómica del "registro único" quincena+ingreso -- UN
   * `.rpc()` a `fn_hato_guardar_quincena_venta` (migración 070 §3.2),
   * nunca dos escrituras sueltas. `SECURITY INVOKER`: la RLS de
   * `fin_ingresos` (Gerencia-only) sigue aplicando dentro de la función --
   * un Administrador recibe el error de política de Postgres tal cual,
   * nunca un bypass. Devuelve los ids del registro (alta o edición). */
  const guardarQuincena = useCallback(
    async (params: GuardarQuincenaVentaParams): Promise<{ quincenaId: string; finIngresoId: string }> => {
      const { data, error } = await supabase.rpc('fn_hato_guardar_quincena_venta', {
        payload: {
          quincena_id: params.quincenaId,
          anio: params.anio,
          mes: params.mes,
          quincena: params.quincena,
          fecha_inicio: params.fechaInicio,
          fecha_fin: params.fechaFin,
          litros_total: params.litrosTotal,
          litros_pomar_confirmado: params.litrosPomarConfirmado,
          num_vacas_ordeno: params.numVacasOrdeno,
          notas: params.notas,
          fin_ingreso: {
            fecha: params.finIngreso.fecha,
            valor: params.finIngreso.valor,
            region_id: params.finIngreso.regionId,
            medio_pago_id: params.finIngreso.medioPagoId,
            comprador_id: params.finIngreso.compradorId,
            nombre: params.finIngreso.nombre,
          },
        },
      });
      if (error) throw error;
      return data as { quincenaId: string; finIngresoId: string };
    },
    [supabase],
  );

  /** Borra la quincena MEDIDA y su `fin_ingresos` enlazado, en una
   * transacción (`fn_hato_eliminar_quincena_venta`, migración 070 §2.1) --
   * único camino de borrado; desde `/finanzas/ingresos` el FK `ON DELETE
   * RESTRICT` lo bloquea (`IngresosList.tsx` traduce el 23503). Rechaza con
   * excepción legible si la quincena es `derivado_mensual` (read-only). */
  const eliminarQuincena = useCallback(
    async (quincenaId: string): Promise<void> => {
      const { error } = await supabase.rpc('fn_hato_eliminar_quincena_venta', { p_quincena_id: quincenaId });
      if (error) throw error;
    },
    [supabase],
  );

  return {
    loading,
    fetchDiaPesajeSemanal,
    fetchVacasActivas,
    fetchPesajesPorFecha,
    guardarPesajes,
    fetchHistorialQuincenal,
    fetchQuincena,
    guardarQuincena,
    eliminarQuincena,
  };
}
