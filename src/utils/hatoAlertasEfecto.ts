// Efecto de dominio de responder una alerta (Sí / Todavía no / Otra cosa),
// compartido por el gestor web. El bot NO importa este archivo: vive del
// otro lado de la frontera de la edge function y usa el mismo payload
// desde su copia de `hato-alertas.ts`.
//
// `createdBy` es `usuarios.id` de la sesión. Null se persiste como NULL
// — nunca un uuid inventado — y el motivo queda en un aviso. La tabla de
// trazas (migración 186) la escribe solo el bot, con service role; el
// navegador no tiene INSERT ahí (mismo criterio que `hato_alertas_tick_runs`).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  efectoDominioRespuestaAlerta,
  payloadEventoSecadoDesdeAlerta,
  type RespuestaAlertaHato,
  type TipoAlertaHato,
} from '@/utils/hatoAlertas';

export async function persistirEfectoDominioAlerta(
  supabase: SupabaseClient<Database>,
  alerta: { id: string; tipo: TipoAlertaHato; animal_id: string | null; paso_id: string | null },
  respuesta: RespuestaAlertaHato,
  createdBy: string | null,
  fecha: string,
  motivoSinAutor: string | null,
): Promise<void> {
  const efecto = efectoDominioRespuestaAlerta(alerta, respuesta);
  if (efecto.kind === 'secado_real') {
    const fila = payloadEventoSecadoDesdeAlerta(efecto.animal_id, alerta.id, fecha, createdBy);
    if (fila.created_by == null) {
      console.warn(
        `[hato-alertas] secado_real sin created_by: ${motivoSinAutor ?? 'sin motivo'}`,
      );
    }
    const { error } = await supabase.from('hato_eventos').insert(fila);
    if (error) throw new Error(error.message);
    return;
  }
  if (efecto.kind === 'tratamiento_paso') {
    const { error } = await supabase
      .from('hato_tratamiento_pasos')
      .update({ fecha_ejecutada: fecha })
      .eq('id', efecto.paso_id)
      .is('fecha_ejecutada', null);
    if (error) throw new Error(error.message);
  }
}
