// telegram/webhookRespuesta.ts — qué responde el webhook cuando un update falla.
//
// ESCO-182 (2026-11-17/18): un update de un chat no registrado hizo fallar el
// `ctx.reply` del middleware de auth, `handleWebhook` devolvió 500 y Telegram
// reenvió el MISMO update durante ~24 h (~943 × 500). Mientras un update no
// recibe 2xx, Telegram no entrega los siguientes: un solo update malo dejó
// mudo al bot para todos.
//
// Contrato: un fallo AL PROCESAR un update se registra en el log (clase,
// causa y código; nunca el mensaje, el contenido del update, el chat id ni
// el token) y se
// responde 200, así el update se da por entregado y la cola sigue. Los
// 401/503 del secreto compartido NO pasan por acá: son autenticación.
//
// Este archivo no importa Deno ni grammy a propósito: Vitest lo carga
// directo. Las dos copias del árbol de edge functions tienen que ser
// byte-idénticas.

export interface RespuestaWebhook {
  estado: 200;
  cuerpo: { ok: true };
}

function nombreDeClase(err: unknown): string {
  if (err instanceof Error) return err.name || err.constructor?.name || "Error";
  return typeof err;
}

/**
 * Lo que se puede registrar de un error sin filtrar datos: la clase, la clase
 * de la causa que envuelve (grammY envuelve todo en `BotError.error`) y un
 * código numérico si lo trae (`GrammyError.error_code`).
 *
 * El MENSAJE no se registra a propósito: la descripción de un rechazo de la
 * API de Telegram y los errores de PostgREST pueden traer datos del chat, y
 * `escoTelegramHandlerCompleto.test.ts` exige que no aparezcan en los logs.
 */
export function describirErrorWebhook(err: unknown): { clase: string; causa: string | null; codigo: number | null } {
  const interno = err instanceof Error && "error" in err ? (err as { error: unknown }).error : null;
  const conCodigo = [interno, err].find((e) =>
    e !== null && typeof e === "object" && Number.isSafeInteger((e as { error_code?: unknown }).error_code)
  ) as { error_code: number } | undefined;
  return {
    clase: nombreDeClase(err),
    causa: interno === null || interno === undefined ? null : nombreDeClase(interno),
    codigo: conCodigo ? conCodigo.error_code : null,
  };
}

/**
 * Corre el procesamiento de un update. Si lanza, lo registra y responde 200
 * igual: un update que falla nunca puede retener la cola de Telegram.
 */
export async function procesarUpdateTelegram(
  procesar: () => Promise<unknown>,
  log: (linea: string) => void,
): Promise<RespuestaWebhook> {
  try {
    await procesar();
  } catch (err) {
    const { clase, causa, codigo } = describirErrorWebhook(err);
    log(
      `[Telegram] Webhook: el update falló al procesarse y se descarta` +
        ` (clase=${clase}, causa=${causa ?? "-"}, codigo=${codigo ?? "-"})`,
    );
  }
  return { estado: 200, cuerpo: { ok: true } };
}
