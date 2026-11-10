import {
  type ConsultaTelegramSql,
  sanearConsultasSql,
} from "./escoSqlContrato.ts";
export interface IdentidadBotonSql {
  usuarioId: string;
  telegramId: number;
  chatId: number;
  messageId: number;
}
interface MensajeSql extends IdentidadBotonSql {
  expiresAt: number;
  opciones: string[];
  consultas: ConsultaTelegramSql[];
  consumidos: string[];
}
export interface EstadoBotonesSql {
  version: 1;
  mensajes: Record<string, MensajeSql>;
}
export interface BotonSql {
  text: string;
  callback_data: string;
}
const TTL = 15 * 60 * 1000;
export function crearBotonesSql(
  anterior: EstadoBotonesSql | undefined,
  entrada: IdentidadBotonSql & {
    opciones: string[];
    consultas: unknown;
    ahora?: number;
    token?: string;
  },
): {
  estado: EstadoBotonesSql;
  botones: BotonSql[];
} {
  const ahora = entrada.ahora ?? Date.now();
  const token = entrada.token ?? crypto.randomUUID().replace(/-/g, "");
  if (!/^[a-f0-9]{32}$/.test(token)) {
    throw Error("Token SQL inválido");
  }
  const mensajes = Object.fromEntries(
    Object.entries(
      anterior?.version === 1 && anterior.mensajes &&
        typeof anterior.mensajes === "object"
        ? anterior.mensajes
        : {},
    ).filter(([, m]) => m && typeof m === "object" && m.expiresAt > ahora)
      .slice(-7),
  );
  const opciones = [
    ...new Set(
      entrada.opciones.filter((s) =>
        typeof s === "string" && s.length > 0 && s.length <= 100
      ),
    ),
  ].slice(0, 3);
  const consultas = sanearConsultasSql(entrada.consultas);
  mensajes[token] = {
    usuarioId: entrada.usuarioId,
    telegramId: entrada.telegramId,
    chatId: entrada.chatId,
    messageId: entrada.messageId,
    expiresAt: ahora + TTL,
    opciones,
    consultas,
    consumidos: [],
  };
  return {
    estado: { version: 1, mensajes },
    botones: [
      ...opciones.map((text, i) => ({
        text,
        callback_data: `esco_sql:${token}:${i}`,
      })),
      ...(consultas.length
        ? [{ text: "Ver consultas", callback_data: `esco_sql:${token}:q` }]
        : []),
    ],
  };
}
export function consumirBotonSql(
  estado: unknown,
  callback: string,
  identidad: IdentidadBotonSql,
  ahora = Date.now(),
): {
  tipo: "pregunta";
  texto: string;
} | {
  tipo: "consultas";
  consultas: ConsultaTelegramSql[];
} | null {
  if (
    !estado || typeof estado !== "object" ||
    (estado as EstadoBotonesSql).version !== 1
  ) {
    return null;
  }
  const s = estado as EstadoBotonesSql;
  const m = /^esco_sql:([a-f0-9]{32}):([0-2q])$/.exec(callback);
  if (!m) {
    return null;
  }
  const entry = s.mensajes?.[m[1]];
  if (
    !entry || !Array.isArray(entry.consumidos) || entry.expiresAt <= ahora ||
    ["usuarioId", "telegramId", "chatId", "messageId"].some((k) =>
      entry[k as keyof IdentidadBotonSql] !==
        identidad[k as keyof IdentidadBotonSql]
    ) || entry.consumidos.includes(m[2])
  ) {
    return null;
  }
  if (m[2] === "q") {
    if (!entry.consultas.length) {
      return null;
    }
    entry.consumidos.push("q");
    return {
      tipo: "consultas",
      consultas: sanearConsultasSql(entry.consultas),
    };
  }
  const texto = entry.opciones[Number(m[2])];
  if (typeof texto !== "string") {
    return null;
  }
  entry.consumidos.push(m[2]);
  return { tipo: "pregunta", texto };
}
