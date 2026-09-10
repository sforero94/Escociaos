// ARCHIVO: components/hato/hooks/useAlertasRouting.ts
// DESCRIPCIÓN: Catálogo + usuarios Telegram + suscripciones para la pestaña
// "Quién recibe" (issue #217). Escribe en `telegram_alertas_suscripciones`
// (RLS Gerencia-only, migración 096). El tick lee esas mismas filas; no hay
// un segundo canal. Una clave que el guardrail prohíbe a `campo` se persiste
// apagada aunque la casilla llegue marcada.

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import {
  construirFilasParaGuardar,
  puedeRecibirAlertaTelegram,
  type AlertaCatalogoRow,
  type AlertaSuscripcionRow,
  type SuscripcionEstado,
} from '@/utils/telegramAlertas';
import type { TelegramUsuarioRow } from '@/utils/telegramUsuarios';

export function useAlertasRouting() {
  const [catalogo, setCatalogo] = useState<AlertaCatalogoRow[]>([]);
  const [usuarios, setUsuarios] = useState<TelegramUsuarioRow[]>([]);
  const [suscripciones, setSuscripciones] = useState<AlertaSuscripcionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase() as any;
      const [cat, users, subs] = await Promise.all([
        supabase.from('alertas_catalogo').select('*').eq('activo', true).order('orden', { ascending: true }),
        supabase.from('telegram_usuarios').select('*').eq('activo', true).order('nombre_display', { ascending: true }),
        supabase.from('telegram_alertas_suscripciones').select('*'),
      ]);
      if (cat.error) throw cat.error;
      if (users.error) throw users.error;
      if (subs.error) throw subs.error;
      setCatalogo((cat.data ?? []) as AlertaCatalogoRow[]);
      setUsuarios((users.data ?? []) as TelegramUsuarioRow[]);
      setSuscripciones((subs.data ?? []) as AlertaSuscripcionRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando quién recibe las alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const guardarSuscripciones = useCallback(
    async (usuario: TelegramUsuarioRow, estado: SuscripcionEstado, updatedBy: string | null) => {
      if (catalogo.length === 0) return;
      const filas = construirFilasParaGuardar(usuario.id, estado, catalogo).map((f) => {
        const permitido = puedeRecibirAlertaTelegram(usuario.rol_bot, f.alerta_clave);
        return {
          ...f,
          recibe: permitido && f.recibe,
          escalamiento: permitido && f.escalamiento,
          updated_by: updatedBy,
        };
      });
      const supabase = getSupabase() as any;
      const { error: upsertError } = await supabase
        .from('telegram_alertas_suscripciones')
        .upsert(filas, { onConflict: 'telegram_usuario_id,alerta_clave' });
      if (upsertError) throw upsertError;
      await reload();
    },
    [catalogo, reload],
  );

  return { catalogo, usuarios, suscripciones, loading, error, reload, guardarSuscripciones };
}
