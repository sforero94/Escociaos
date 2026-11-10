import { normalizarHistorialEfectivoSql } from "@esco-sql/historial.ts";
import { hashHistorialSql } from "@esco-sql/turno.ts";
import {
  ErrorRespuestaEscoSql,
  type HistorialTelegramSql,
  leerObservabilidadTelegramSql,
  leerRespuestaEscoSql,
  type RespuestaTelegramSql,
} from "./escoSqlContrato.ts";
export const seleccionarMotorTelegram = (valor: unknown): boolean =>
  valor === "sql";
export { construirHistorialSql as historialEscoSql } from "@esco-sql/historial.ts";
export async function idTurnoTelegramSql(
  usuarioId: string,
  chatId: string,
  origen: string,
): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify(["esco-sql-telegram-v1", usuarioId, chatId, origen]),
      ),
    ),
  );
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(
    bytes.slice(0, 16),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${
    hex.slice(16, 20)
  }-${hex.slice(20)}`;
}
export interface ConfiguracionClienteEscoSql {
  url?: string;
  credencialServicio?: string;
  secreto?: string;
}
export function exigirConfiguracionEscoSql(
  config: ConfiguracionClienteEscoSql,
): asserts config is Required<ConfiguracionClienteEscoSql> {
  if (!config.url || !config.credencialServicio || !config.secreto) {
    throw Error("La puerta SQL de Telegram no está configurada.");
  }
  let url: URL;
  try {
    url = new URL(config.url);
  } catch {
    throw Error("La puerta SQL de Telegram no está configurada.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) || url.username || url.password
  ) {
    throw Error("La puerta SQL de Telegram no está configurada.");
  }
}
/** Límite de transporte, no truncado silencioso del bloque ni de su CSV. */
async function leerCuerpoAcotado(response: Response): Promise<string> {
  const max = 4 * 1024 * 1024;
  if (Number(response.headers.get("Content-Length")) > max) {
    await response.body?.cancel();
    throw Error("La respuesta SQL supera el tamaño admitido.");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw Error("La respuesta SQL no es válida.");
  }
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw Error("La respuesta SQL supera el tamaño admitido.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export async function solicitarEscoSql(
  entrada: ConfiguracionClienteEscoSql & {
    usuarioId: string;
    pregunta: string;
    historial: HistorialTelegramSql[];
    fetcher?: typeof fetch;
  },
): Promise<RespuestaTelegramSql> {
  exigirConfiguracionEscoSql(entrada);
  if (
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      entrada.usuarioId,
    ) || !entrada.pregunta.trim() || entrada.pregunta.length > 1000
  ) {
    throw Error("Escribe una pregunta de hasta 1000 caracteres.");
  }
  const historial = normalizarHistorialEfectivoSql(entrada.historial);
  const historialSha256 = await hashHistorialSql(historial);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await (entrada.fetcher ?? fetch)(
      new URL("/functions/v1/esco-consultas", entrada.url).href,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${entrada.credencialServicio}`,
          "x-esco-telegram-secret": entrada.secreto,
        },
        body: JSON.stringify({
          motor: "sql",
          usuario_id: entrada.usuarioId,
          pregunta: entrada.pregunta,
          historial,
        }),
        signal: controller.signal,
        redirect: "error",
      },
    );
    const raw = await leerCuerpoAcotado(response);
    if (!response.ok) {
      let observacion = { recibo: null, uso: null } as ReturnType<
        typeof leerObservabilidadTelegramSql
      >;
      try {
        observacion = leerObservabilidadTelegramSql(JSON.parse(raw));
      } catch { /* El transporte no inventa un recibo no verificable. */ }
      if (
        observacion.recibo &&
        observacion.recibo.historial_sha256 !== historialSha256
      ) {
        throw new ErrorRespuestaEscoSql(
          "La respuesta de la consulta SQL no corresponde al historial enviado.",
        );
      }
      throw new ErrorRespuestaEscoSql(
        response.status === 403
          ? "Esco está disponible solo para Gerencia activa."
          : "El motor SQL no está disponible. Intenta de nuevo más tarde.",
        observacion.recibo,
        observacion.uso,
      );
    }
    const resultado = leerRespuestaEscoSql(JSON.parse(raw));
    if (
      resultado.recibo && resultado.recibo.historial_sha256 !== historialSha256
    ) {
      throw new ErrorRespuestaEscoSql(
        "La respuesta de la consulta SQL no corresponde al historial enviado.",
      );
    }
    return resultado;
  } catch (error) {
    if (error instanceof ErrorRespuestaEscoSql) throw error;
    if (
      error instanceof Error &&
      ["La respuesta", "El motor SQL", "Esco está"].some((p) =>
        error.message.startsWith(p)
      )
    ) {
      throw error;
    }
    throw new ErrorRespuestaEscoSql(
      "No se pudo completar la consulta SQL. Intenta de nuevo más tarde.",
    );
  } finally {
    clearTimeout(timer);
  }
}
