import { getSupabase } from './supabase/client';
import { projectId, publicAnonKey } from './supabase/info';

export const ENDPOINT_PRUEBA_ESCO2 = `https://${projectId}.supabase.co/functions/v1/esco-consultas`;

/** Keep account switching on this test screen from revoking other device sessions. */
export async function cerrarSesionPruebaEsco2(): Promise<void> {
  try {
    const { error } = await getSupabase().auth.signOut({ scope: 'local' });
    if (error) throw new Error('sesión');
  } catch {
    throw new Error('No se pudo cerrar la sesión local.');
  }
}

export interface ResultadoPruebaEsco2 {
  http: number;
  valida: boolean;
  respuesta?: string;
  error?: string;
  origen?: string;
  ruta?: string;
  ms?: number;
}

const ORIGENES = new Set(['compositor', 'recomposicion', 'determinista', 'aclaracion', 'fuera_de_alcance', 'error_plan', 'error_llm', 'error_datos']);

/** Use only the session that owns the visible screen; no role substitution or fallback. */
export async function ejecutarPruebaEsco2(pregunta: string, usuarioId: string, signal?: AbortSignal): Promise<ResultadoPruebaEsco2> {
  const texto = pregunta.trim();
  if (!texto || texto.length > 1000) throw new Error('La pregunta debe tener entre 1 y 1000 caracteres.');
  let sesion;
  try {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw new Error('sesión');
    sesion = data.session;
  } catch {
    throw new Error('No se pudo comprobar la sesión.');
  }
  if (!sesion?.access_token || !usuarioId || sesion.user.id !== usuarioId) throw new Error('La sesión cambió o ya no está activa.');
  if (signal?.aborted) throw new Error('Prueba cancelada.');

  let respuesta: Response;
  try {
    respuesta = await fetch(ENDPOINT_PRUEBA_ESCO2, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.access_token}`, apikey: publicAnonKey },
      body: JSON.stringify({ pregunta: texto, historial: [] }),
      signal,
    });
  } catch {
    throw new Error(signal?.aborted ? 'Prueba cancelada.' : 'No se pudo contactar con Esco 2.0.');
  }

  let cuerpo: unknown;
  try { cuerpo = await respuesta.json(); } catch {
    return { http: respuesta.status, valida: false, error: 'El servidor no devolvió JSON válido.' };
  }
  const datos = typeof cuerpo === 'object' && cuerpo !== null && !Array.isArray(cuerpo) ? cuerpo as Record<string, unknown> : {};
  // Never copy credentials into diagnostic messages, even if an upstream error echoes them.
  const limpiar = (mensaje: string) => mensaje.split(sesion.access_token).join('[oculto]').split(publicAnonKey).join('[oculto]');
  if (!respuesta.ok) return {
    http: respuesta.status,
    valida: false,
    error: typeof datos.error === 'string' ? limpiar(datos.error).slice(0, 500) : 'El servidor rechazó la solicitud.',
  };

  const formaValida = respuesta.status === 200
    && typeof datos.respuesta === 'string' && datos.respuesta.trim().length > 0
    && typeof datos.origen === 'string' && ORIGENES.has(datos.origen)
    && typeof datos.hoy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(datos.hoy)
    && (datos.ruta === null || datos.ruta === 'habitual' || datos.ruta === 'reforzada')
    && typeof datos.ms === 'number' && Number.isFinite(datos.ms) && datos.ms >= 0
    && Array.isArray(datos.ajustes) && Array.isArray(datos.resultados) && Array.isArray(datos.llamadas)
    && (datos.plan === null || (typeof datos.plan === 'object' && !Array.isArray(datos.plan)));
  if (!formaValida) return { http: respuesta.status, valida: false, error: 'La respuesta no cumple el contrato de Esco 2.0.' };
  const origen = datos.origen as string;
  return {
    http: respuesta.status,
    valida: !origen.startsWith('error_'),
    respuesta: limpiar(datos.respuesta as string),
    origen,
    ruta: typeof datos.ruta === 'string' ? datos.ruta : undefined,
    ms: datos.ms as number,
    ...(origen.startsWith('error_') ? { error: 'El servidor respondió, pero el turno terminó con un error.' } : {}),
  };
}
