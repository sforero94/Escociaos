import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { HatoVacaActiva, HatoPesajeLeche, HatoProduccionQuincenal } from '@/types/hato';

/**
 * Acceso a datos de Supabase para `/hato-lechero/produccion` (S5 — V2/V3/V4,
 * docs/plan_hato_lechero_module.md §7.1/§7.5). La lógica pura (fecha del
 * último día de pesaje, resolución/rango de quincena, productividad) vive
 * en `src/utils/calculosHato.ts` — este hook solo consulta y escribe.
 *
 * `hato_produccion_quincenal` usa UPDATE-por-id + INSERT, nunca upsert de
 * PostgREST (CLAUDE.md, precedente `CapturaCosechaGrid`): aunque
 * `UNIQUE(anio, mes, quincena)` no tiene el problema de NULL de
 * `fin_parametros`, seguimos el mismo patrón explícito por consistencia y
 * porque el contrato de la sesión lo exige así.
 */
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

  /** Historial de producción quincenal, más reciente primero. */
  const fetchHistorialQuincenal = useCallback(async (limite = 12): Promise<HatoProduccionQuincenal[]> => {
    const { data, error } = await supabase
      .from('hato_produccion_quincenal')
      .select('id, anio, mes, quincena, fecha_inicio, fecha_fin, litros_total, litros_pomar_confirmado, num_vacas_ordeno, notas, fuente')
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
      .order('quincena', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return (data ?? []) as HatoProduccionQuincenal[];
  }, [supabase]);

  /** Registro existente para (año, mes, quincena), o `null` si aún no se
   * ha capturado -- el formulario usa esto para decidir edición vs. alta. */
  const fetchQuincena = useCallback(async (anio: number, mes: number, quincena: 1 | 2): Promise<HatoProduccionQuincenal | null> => {
    const { data, error } = await supabase
      .from('hato_produccion_quincenal')
      .select('id, anio, mes, quincena, fecha_inicio, fecha_fin, litros_total, litros_pomar_confirmado, num_vacas_ordeno, notas, fuente')
      .eq('anio', anio)
      .eq('mes', mes)
      .eq('quincena', quincena)
      .maybeSingle();
    if (error) throw error;
    return (data as HatoProduccionQuincenal) ?? null;
  }, [supabase]);

  /** UPDATE-por-id si ya existe (anio, mes, quincena); INSERT si no --
   * nunca `upsert` de PostgREST (CLAUDE.md, precedente `CapturaCosechaGrid`
   * / `fin_parametros`). */
  const guardarQuincena = useCallback(async (params: {
    anio: number;
    mes: number;
    quincena: 1 | 2;
    fechaInicio: string;
    fechaFin: string;
    litrosTotal: number;
    litrosPomarConfirmado: number | null;
    numVacasOrdeno: number | null;
    notas: string | null;
  }): Promise<void> => {
    const existente = await fetchQuincena(params.anio, params.mes, params.quincena);

    const payload = {
      anio: params.anio,
      mes: params.mes,
      quincena: params.quincena,
      fecha_inicio: params.fechaInicio,
      fecha_fin: params.fechaFin,
      litros_total: params.litrosTotal,
      litros_pomar_confirmado: params.litrosPomarConfirmado,
      num_vacas_ordeno: params.numVacasOrdeno,
      notas: params.notas,
      fuente: 'web',
    };

    if (existente) {
      const { error } = await supabase
        .from('hato_produccion_quincenal')
        .update(payload)
        .eq('id', existente.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('hato_produccion_quincenal').insert(payload);
      if (error) throw error;
    }
  }, [supabase, fetchQuincena]);

  return {
    loading,
    fetchDiaPesajeSemanal,
    fetchVacasActivas,
    fetchPesajesPorFecha,
    guardarPesajes,
    fetchHistorialQuincenal,
    fetchQuincena,
    guardarQuincena,
  };
}
