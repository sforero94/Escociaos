// ARCHIVO: components/hato/hooks/useHatoAlertas.ts
// DESCRIPCIÓN: Carga la cola de `hato_alertas` (migración 056) para
// `AlertasView.tsx` (S6/V11). Dos consultas + join en cliente -- mismo
// patrón que `useHatoAnimales.ts`: `hato_alertas` no expone `numero`/
// `nombre` (solo `animal_id`), así que se resuelven contra `hato_animales`
// igual que un join manual, sin depender de la sintaxis de embed de
// PostgREST (evita sorpresas si `animal_id` es NULL en una alerta futura
// sin animal asociado, ej. un recordatorio genérico).
//
// Escritura: `actualizarEstadoAlerta` hace un UPDATE simple (estado +
// respondida_por opcional) -- la RLS de la tabla (migración 056) ya
// restringe la escritura a Administrador/Gerencia; este hook no duplica
// esa validación, solo la ejecuta. El gating de la UI (ocultar/deshabilitar
// los botones para otros roles) vive en `AlertasView.tsx`, igual que
// `GanadoMovimientos.tsx` con `useGanadoInventario.ts`.
//
// Issue #217: `responderAlerta` reclama la fila con el mismo set de estados
// abiertos que el bot (`ESTADOS_ALERTA_RESPONSIBLES`) y aplica el MISMO
// efecto de dominio (`efectoDominioRespuestaAlerta`). Editar/crear manual
// no tocan tablas clínicas.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';
import { obtenerFechaHoy } from '@/utils/fechas';
import {
  ESTADOS_ALERTA_RESPONSIBLES,
  efectoDominioRespuestaAlerta,
  estadoTrasRespuestaAlerta,
  payloadEventoSecadoDesdeAlerta,
  type RespuestaAlertaHato,
} from '@/utils/hatoAlertas';
import {
  datosConNotaGestor,
  validarAlertaManual,
  validarEdicionAlerta,
  type InputAlertaManual,
  type InputEditarAlerta,
} from '@/utils/hatoAlertasGestor';
import type { TipoAlertaHato, EstadoAlertaHato } from '@/utils/hatoAlertasUi';

/** Fila cruda de `hato_alertas` (migración 056) tal como llega de Supabase. */
export interface HatoAlertaRow {
  id: string;
  tipo: TipoAlertaHato;
  animal_id: string | null;
  regla_clave: string;
  fecha_programada: string;
  estado: EstadoAlertaHato;
  destinatario_telegram_id: string | null;
  intentos: number;
  respuesta: string | null;
  respondida_por: string | null;
  paso_id: string | null;
  datos: Record<string, unknown> | null;
  escalada_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/** Fila enriquecida con la identidad del animal (número + nombre), la única
 * información que la vista necesita de `hato_animales`. Un `animal_id` nulo
 * (o que ya no resuelve -- no debería pasar por la FK, pero un animal podría
 * no estar en el mapa si la consulta de animales falla parcialmente) deja
 * ambos campos en `null`: "sin caravana"/"—", nunca un valor inventado. */
export interface AlertaHatoEnriquecida extends HatoAlertaRow {
  animalNumero: number | null;
  animalNombre: string | null;
  animalNumeroEsProvisional: boolean;
}

export function useHatoAlertas() {
  const [alertas, setAlertas] = useState<AlertaHatoEnriquecida[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `src/types/database.ts` no incluye las tablas hato_* -- mismo
      // workaround documentado en `useHatoAnimales.ts`/`useGanadoInventario.ts`.
      const supabase = getSupabase() as any;
      const { data: alertaRows, error: alertasError } = await supabase
        .from('hato_alertas')
        .select('*')
        .order('fecha_programada', { ascending: true });
      if (alertasError) throw alertasError;

      const rows = (alertaRows ?? []) as HatoAlertaRow[];
      const animalIds = Array.from(new Set(rows.map((r) => r.animal_id).filter((id): id is string => !!id)));

      let animalPorId = new Map<string, { numero: number | null; nombre: string | null }>();
      if (animalIds.length > 0) {
        const { data: animalRows, error: animalesError } = await supabase
          .from('hato_animales')
          .select('id, numero, nombre')
          .in('id', animalIds);
        if (animalesError) throw animalesError;
        animalPorId = new Map(
          ((animalRows ?? []) as { id: string; numero: number | null; nombre: string | null }[]).map((a) => [
            a.id,
            { numero: a.numero, nombre: a.nombre },
          ]),
        );
      }

      const enriquecidas: AlertaHatoEnriquecida[] = rows.map((r) => {
        const animal = r.animal_id ? animalPorId.get(r.animal_id) : undefined;
        const numero = animal?.numero ?? null;
        return {
          ...r,
          animalNumero: numero,
          animalNombre: animal?.nombre ?? null,
          animalNumeroEsProvisional: esNumeroProvisional(numero),
        };
      });

      setAlertas(enriquecidas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando la cola de alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const actualizarEstadoAlerta = useCallback(
    async (id: string, cambios: { estado: EstadoAlertaHato; respondidaPor?: string | null }) => {
      const supabase = getSupabase() as any;
      const { error: updateError } = await supabase
        .from('hato_alertas')
        .update({
          estado: cambios.estado,
          ...(cambios.respondidaPor !== undefined ? { respondida_por: cambios.respondidaPor } : {}),
        })
        .eq('id', id);
      if (updateError) throw updateError;
      await reload();
    },
    [reload],
  );

  /** T3a (ronda agosto 2026) -- descarte masivo / expiración automática: UN
   * `.update().in('id', ids)` en vez de N requests secuenciales, mismo
   * cambio para todas las filas seleccionadas. La RLS de escritura
   * (Administrador/Gerencia, migración 056) es la misma que ya cubre
   * `actualizarEstadoAlerta`; este hook no la duplica. */
  const actualizarEstadoAlertas = useCallback(
    async (ids: string[], cambios: { estado: EstadoAlertaHato; respondidaPor?: string | null }) => {
      if (ids.length === 0) return;
      const supabase = getSupabase() as any;
      const { error: updateError } = await supabase
        .from('hato_alertas')
        .update({
          estado: cambios.estado,
          ...(cambios.respondidaPor !== undefined ? { respondida_por: cambios.respondidaPor } : {}),
        })
        .in('id', ids);
      if (updateError) throw updateError;
      await reload();
    },
    [reload],
  );

  const aplicarEfectoDominio = useCallback(
    async (
      alerta: { id: string; tipo: TipoAlertaHato; animal_id: string | null; paso_id: string | null },
      respuesta: RespuestaAlertaHato,
    ) => {
      const supabase = getSupabase() as any;
      const efecto = efectoDominioRespuestaAlerta(alerta, respuesta);
      const hoy = obtenerFechaHoy();
      if (efecto.kind === 'secado_real') {
        const { error: errorEvento } = await supabase
          .from('hato_eventos')
          .insert(payloadEventoSecadoDesdeAlerta(efecto.animal_id, alerta.id, hoy));
        if (errorEvento) throw errorEvento;
      } else if (efecto.kind === 'tratamiento_paso') {
        const { error: errorPaso } = await supabase
          .from('hato_tratamiento_pasos')
          .update({ fecha_ejecutada: hoy })
          .eq('id', efecto.paso_id)
          .is('fecha_ejecutada', null);
        if (errorPaso) throw errorPaso;
      }
    },
    [],
  );

  /**
   * Parity with Telegram `hato_alerta:{id}:{si|no|otro}`. Claims the row
   * only while it is still open (pendiente/enviada/escalada). A second
   * click after someone else answered throws instead of repeating the
   * domain write.
   */
  const responderAlerta = useCallback(
    async (id: string, respuesta: RespuestaAlertaHato, respondidaPor: string | null) => {
      const supabase = getSupabase() as any;
      const { data: actualizada, error: updateError } = await supabase
        .from('hato_alertas')
        .update({
          estado: estadoTrasRespuestaAlerta(respuesta),
          respuesta,
          respondida_por: respondidaPor,
        })
        .eq('id', id)
        .in('estado', [...ESTADOS_ALERTA_RESPONSIBLES])
        .select('id, tipo, animal_id, paso_id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!actualizada) {
        throw new Error('Esa alerta ya no está abierta. Recarga la cola.');
      }
      await aplicarEfectoDominio(actualizada as HatoAlertaRow, respuesta);
      await reload();
    },
    [aplicarEfectoDominio, reload],
  );

  /** Weekly-review Confirmar: Sí domain effect on a row that was already
   * answered or expired. Does not re-open a claimed Telegram race. */
  const confirmarRevisionAlerta = useCallback(
    async (id: string, respondidaPor: string | null) => {
      const supabase = getSupabase() as any;
      const { data: actualizada, error: updateError } = await supabase
        .from('hato_alertas')
        .update({
          estado: 'confirmada',
          respuesta: 'si',
          respondida_por: respondidaPor,
        })
        .eq('id', id)
        .in('estado', ['respondida', 'expirada'])
        .select('id, tipo, animal_id, paso_id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!actualizada) {
        throw new Error('Esa alerta ya no espera revisión. Recarga la cola.');
      }
      await aplicarEfectoDominio(actualizada as HatoAlertaRow, 'si');
      await reload();
    },
    [aplicarEfectoDominio, reload],
  );

  const editarAlerta = useCallback(
    async (alerta: HatoAlertaRow, input: InputEditarAlerta) => {
      const validacion = validarEdicionAlerta(input);
      if (!validacion.ok) throw new Error(validacion.error);
      const supabase = getSupabase() as any;
      const { error: updateError } = await supabase
        .from('hato_alertas')
        .update({
          fecha_programada: validacion.fecha_programada,
          datos: datosConNotaGestor(alerta.datos, validacion.nota),
        })
        .eq('id', alerta.id);
      if (updateError) throw updateError;
      await reload();
    },
    [reload],
  );

  const crearAlertaManual = useCallback(
    async (input: Omit<InputAlertaManual, 'idUnico'>, createdBy: string | null) => {
      const validacion = validarAlertaManual({
        ...input,
        idUnico: crypto.randomUUID(),
      });
      if (!validacion.ok) throw new Error(validacion.error);
      const supabase = getSupabase() as any;
      const { error: insertError } = await supabase.from('hato_alertas').insert({
        ...validacion.fila,
        created_by: createdBy,
      });
      if (insertError) throw insertError;
      await reload();
    },
    [reload],
  );

  return {
    alertas,
    loading,
    error,
    reload,
    actualizarEstadoAlerta,
    actualizarEstadoAlertas,
    responderAlerta,
    confirmarRevisionAlerta,
    editarAlerta,
    crearAlertaManual,
  };
}
