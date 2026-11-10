import {
  esObjetoSql,
  type HistorialTelegramSql,
  leerRespuestaEscoSql,
  type RespuestaTelegramSql,
} from "./escoSqlContrato.ts";
export const seleccionarMotorTelegram = (valor: unknown): boolean =>
  valor === "sql";
/** Igual que MAX_HISTORIAL_SQL y MAX_TEXTO_HISTORIAL de src/utils/escoSql/loop.ts. */
const MAX_MENSAJES_HISTORIAL_SQL = 10;
const MAX_TEXTO_HISTORIAL_SQL = 4000;

/**
 * Copia literal de `textoHistorialSql` (src/utils/escoSql/loop.ts): el texto de la
 * respuesta más el SQL que la produjo, para que un seguimiento («¿y el año pasado?»)
 * llegue con el mismo contexto que en la web. La paridad la fija
 * escoSqlTelegramHistorial.test.ts.
 */
export function textoHistorialTelegramSql(
  respuesta: string,
  consultas: { sql: string }[],
): string {
  if (!consultas.length) return respuesta.slice(0, MAX_TEXTO_HISTORIAL_SQL);
  const bloque = `\n\n[Consultas SQL que usé en este turno]\n${
    consultas.map((c) => c.sql).join("\n---\n")
  }`;
  const sobra = MAX_TEXTO_HISTORIAL_SQL - bloque.length;
  if (sobra < 200) {
    return `${respuesta.slice(0, MAX_TEXTO_HISTORIAL_SQL - 200)}${
      bloque.slice(0, 200)
    }`;
  }
  return `${respuesta.slice(0, sobra)}${bloque}`;
}

function consultasDeMetadata(metadata: Record<string, unknown>): { sql: string }[] {
  if (!Array.isArray(metadata.consultas)) return [];
  return metadata.consultas.filter((c): c is { sql: string } =>
    esObjetoSql(c) && typeof c.sql === "string" && c.sql.length > 0
  ).map((c) => ({ sql: c.sql }));
}

/**
 * Historial que se manda al motor SQL: solo pares pregunta → respuesta SQL completos.
 * Quedan fuera los mensajes de Esco 1.0 (una pregunta vieja sin su respuesta confunde
 * al modelo) y la pregunta de un turno que falló y no guardó respuesta.
 */
export function historialEscoSql(filas: unknown[]): HistorialTelegramSql[] {
  const sql = filas.filter(esObjetoSql).filter((f) =>
    typeof f.content === "string" &&
    (f.role === "user" || f.role === "assistant") &&
    esObjetoSql(f.metadata) && f.metadata.motor === "sql"
  );
  const pares: HistorialTelegramSql[] = [];
  for (let i = 0; i < sql.length - 1; i++) {
    const pregunta = sql[i];
    const respuesta = sql[i + 1];
    if (pregunta.role !== "user" || respuesta.role !== "assistant") continue;
    pares.push(
      {
        rol: "user",
        texto: (pregunta.content as string).slice(0, MAX_TEXTO_HISTORIAL_SQL),
      },
      {
        rol: "assistant",
        texto: textoHistorialTelegramSql(
          respuesta.content as string,
          consultasDeMetadata(respuesta.metadata as Record<string, unknown>),
        ),
      },
    );
    i++;
  }
  return pares.slice(-MAX_MENSAJES_HISTORIAL_SQL);
}
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
          historial: entrada.historial,
        }),
        signal: controller.signal,
        redirect: "error",
      },
    );
    if (!response.ok) {
      throw Error(
        response.status === 403
          ? "Esco está disponible solo para Gerencia activa."
          : "El motor SQL no está disponible. Intenta de nuevo más tarde.",
      );
    }
    const raw = await leerCuerpoAcotado(response);
    return leerRespuestaEscoSql(JSON.parse(raw));
  } catch (error) {
    if (
      error instanceof Error &&
      ["La respuesta", "El motor SQL", "Esco está"].some((p) =>
        error.message.startsWith(p)
      )
    ) {
      throw error;
    }
    throw Error(
      "No se pudo completar la consulta SQL. Intenta de nuevo más tarde.",
    );
  } finally {
    clearTimeout(timer);
  }
}
