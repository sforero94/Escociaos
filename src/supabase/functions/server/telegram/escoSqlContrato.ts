// Contrato de canal: usa solo los constructores puros comunes, nunca el motor.
import {
  type Bloque,
  construirBloque,
  type FuenteVisual,
} from "@esco-sql/bloques.ts";
import { leerRespuestaFinal } from "@esco-sql/respuesta.ts";
export type { Bloque };
export interface ConsultaTelegramSql {
  sql: string;
  proposito: string;
  n_filas: number | null;
  truncado: boolean;
  error: string | null;
  ms: number;
}
export interface RespuestaTelegramSql {
  texto: string;
  bloques: Bloque[];
  sugerencias: string[];
  aclaracion?: {
    pregunta: string;
    opciones: string[];
  };
  consultas: ConsultaTelegramSql[];
  ms: number;
}
export interface HistorialTelegramSql {
  rol: "user" | "assistant";
  texto: string;
}
export const esObjetoSql = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export function sanearConsultasSql(valor: unknown): ConsultaTelegramSql[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.slice(0, 4).filter(esObjetoSql).map((c) => ({
    sql: typeof c.sql === "string" ? c.sql.slice(0, 12000) : "",
    proposito: typeof c.proposito === "string" ? c.proposito.slice(0, 500) : "",
    n_filas: typeof c.n_filas === "number" && Number.isInteger(c.n_filas) &&
        c.n_filas >= 0
      ? c.n_filas
      : null,
    truncado: c.truncado === true,
    error: typeof c.error === "string" ? c.error.slice(0, 500) : null,
    ms: typeof c.ms === "number" && Number.isFinite(c.ms) ? c.ms : 0,
  }));
}
function validarBloque(valor: unknown): Bloque | null {
  if (
    !esObjetoSql(valor) || !Number.isInteger(valor.consulta) ||
    Number(valor.consulta) < 1 || Number(valor.consulta) > 4
  ) {
    return null;
  }
  const { tipo, consulta, titulo, columnas, forma, x, y, formato, items } =
    valor;
  const filas = tipo === "tabla"
    ? valor.filas
    : tipo === "grafica"
    ? valor.datos
    : tipo === "tarjeta" && Array.isArray(items)
    ? [
      Object.fromEntries(
        items.filter(esObjetoSql).map((i) => [i.columna, i.valor]),
      ),
    ]
    : null;
  if (!Array.isArray(filas) || filas.some((f) => !esObjetoSql(f))) {
    return null;
  }
  const spec = tipo === "tabla"
    ? { tipo, consulta, titulo, columnas }
    : tipo === "grafica"
    ? { tipo, consulta, titulo, forma, x, y, formato }
    : {
      tipo,
      consulta,
      items: Array.isArray(items)
        ? items.filter(esObjetoSql).map(({ columna, etiqueta, formato }) => ({
          columna,
          etiqueta,
          formato,
        }))
        : items,
    };
  const fuentes: FuenteVisual[] = Array.from(
    { length: Number(consulta) },
    () => ({ filas: [], n_filas: null, truncado: false }),
  );
  fuentes[Number(consulta) - 1] = {
    filas,
    n_filas: typeof valor.total_filas === "number"
      ? valor.total_filas
      : filas.length,
    truncado: valor.truncado === true,
  };
  const r = construirBloque(spec, fuentes);
  return "bloque" in r ? r.bloque : null;
}
export function leerRespuestaEscoSql(valor: unknown): RespuestaTelegramSql {
  if (
    !esObjetoSql(valor) || valor.motor !== "sql" ||
    typeof valor.texto !== "string" || valor.texto.length > 64000 ||
    !Array.isArray(valor.bloques) || valor.bloques.length > 4 ||
    !Array.isArray(valor.consultas) || valor.consultas.length > 4
  ) {
    throw Error("La respuesta del motor SQL no es válida.");
  }
  const bloques = valor.bloques.map(validarBloque);
  if (bloques.some((b) => !b)) {
    throw Error("La respuesta visual del motor SQL no es válida.");
  }
  const final = leerRespuestaFinal(
    JSON.stringify({
      texto: valor.texto,
      sugerencias: valor.sugerencias,
      aclaracion: valor.aclaracion,
    }),
  );
  return {
    ...final,
    bloques: bloques as Bloque[],
    consultas: sanearConsultasSql(valor.consultas),
    ms: typeof valor.ms === "number" && Number.isFinite(valor.ms)
      ? valor.ms
      : 0,
  };
}
