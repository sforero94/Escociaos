// reintento.ts — bounded retries for 5xx and network errors.
//
// ESCO-97 / ESCO-106: the edge-runtime → PostgREST lane drops ~37% of
// writes as HTTP 504 (`Warp server error: Thread killed by timeout
// manager`). A single `fetch` with no retry turns that into a lost
// climate reading; nine sequential reads in `/hato/alertas/tick` turn
// it into a 500 with no `hato_alertas_tick_runs` row.
//
// Contract:
//   - Default: 2 attempts (1 retry) with short linear backoff.
//   - Retries 5xx and thrown network errors only. Never 4xx.
//   - The last attempt's value/throw is returned as-is — the caller
//     still decides how to fail. This helper does not invent data.
//   - Pure: no Deno, no fetch of its own. `esperar` is injectable so
//     Vitest can drive it without fake timers.
//
// Mirrored by hand into `supabase/functions/make-server-1ccce916/` —
// `arbolEdgeFunctionParidad.test.ts` covers the pair.

export const INTENTOS_POR_DEFECTO = 2;
export const BACKOFF_MS_POR_DEFECTO = 400;

export function esStatusReintentable(status: number): boolean {
  return status >= 500 && status < 600;
}

export function esErrorRed(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (!(err instanceof Error)) return false;
  return /failed to fetch|network|timeout|econnreset|econnrefused|fetcherror|connection reset|socket/i.test(
    err.message,
  );
}

/** PostgREST / supabase-js error shape. A 504 often arrives as
 * `{ message: "Gateway Timeout" }` with no numeric `status`. */
export function esErrorPostgrestReintentable(
  error: { message?: string; code?: string; status?: number } | null | undefined,
): boolean {
  if (!error) return false;
  if (typeof error.status === 'number' && esStatusReintentable(error.status)) return true;
  const texto = `${error.message ?? ''} ${error.code ?? ''}`;
  return /504|502|503|timeout|gateway timeout|thread killed|connection/i.test(texto);
}

export async function conReintento<T>(
  accion: () => T | PromiseLike<T>,
  opciones?: {
    intentos?: number;
    backoffMs?: number;
    esValorReintentable?: (valor: T) => boolean;
    esperar?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const intentos = Math.max(1, opciones?.intentos ?? INTENTOS_POR_DEFECTO);
  const backoffMs = opciones?.backoffMs ?? BACKOFF_MS_POR_DEFECTO;
  const esperar =
    opciones?.esperar ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let ultimoError: unknown = null;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const valor = await accion();
      const reintentarValor = opciones?.esValorReintentable?.(valor) === true;
      if (!reintentarValor || intento === intentos) return valor;
    } catch (err) {
      ultimoError = err;
      if (!esErrorRed(err) || intento === intentos) throw err;
    }
    await esperar(backoffMs * intento);
  }
  throw ultimoError instanceof Error ? ultimoError : new Error('conReintento: se agotaron los intentos');
}
