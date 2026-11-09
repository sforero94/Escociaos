import { formatearValor } from "@esco-sql/formato.ts";
import type {
  Bloque,
  ConsultaTelegramSql,
  RespuestaTelegramSql,
} from "./escoSqlContrato.ts";
export interface MensajeHtmlSql {
  html: string;
  texto: string;
}
export type OperacionTelegramSql =
  | ({
    tipo: "mensaje";
  } & MensajeHtmlSql)
  | {
    tipo: "documento";
    bytes: Uint8Array;
    nombre: string;
  }
  | {
    tipo: "grafica";
    bloque: Extract<Bloque, {
      tipo: "grafica";
    }>;
  };
const escapar = (texto: string) =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
/** Se divide texto visible antes de escapar; cada fragmento lleva sus etiquetas cerradas. */
function partes(texto: string, tag = ""): MensajeHtmlSql[] {
  const prefijo = tag ? `<${tag}>` : "";
  const sufijo = tag ? `</${tag}>` : "";
  const max = 4096 - prefijo.length - sufijo.length;
  const out: MensajeHtmlSql[] = [];
  let raw = "", html = "";
  for (const char of texto) {
    const escaped = escapar(char);
    if (html.length + escaped.length > max && raw) {
      out.push({ html: prefijo + html + sufijo, texto: raw });
      raw = "";
      html = "";
    }
    raw += char;
    html += escaped;
  }
  if (raw) {
    out.push({ html: prefijo + html + sufijo, texto: raw });
  }
  return out;
}
export function textoHtmlSql(texto: string): MensajeHtmlSql[] {
  const pattern = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
  const segments: MensajeHtmlSql[] = [];
  let pos = 0;
  for (const m of texto.matchAll(pattern)) {
    if (m.index! > pos) {
      segments.push(...partes(texto.slice(pos, m.index)));
    }
    segments.push(...partes(m[1] ?? m[2], m[1] ? "b" : "code"));
    pos = m.index! + m[0].length;
  }
  if (pos < texto.length) {
    segments.push(...partes(texto.slice(pos)));
  }
  const out: MensajeHtmlSql[] = [];
  for (const p of segments) {
    const last = out[out.length - 1];
    if (last && last.html.length + p.html.length <= 4096) {
      last.html += p.html;
      last.texto += p.texto;
    } else {
      out.push({ ...p });
    }
  }
  return out;
}
export function preHtmlSql(texto: string): MensajeHtmlSql[] {
  return partes(texto, "pre");
}
export async function enviarHtmlSql<T>(ctx: {
  reply: (texto: string, extra?: {
    parse_mode: "HTML";
  }) => Promise<T>;
}, mensaje: MensajeHtmlSql): Promise<T> {
  try {
    return await ctx.reply(mensaje.html, { parse_mode: "HTML" });
  } catch (error) {
    const e = error as {
      error_code?: number;
      description?: string;
    };
    if (
      e?.error_code !== 400 || typeof e.description !== "string" ||
      !/can.t parse entities|unsupported start tag/i.test(e.description)
    ) {
      throw error;
    }
    return ctx.reply(mensaje.texto);
  }
}
function csvValor(valor: unknown): string {
  let s = valor === null || valor === undefined ? "" : String(valor);
  if (typeof valor === "string" && /^(?:\s*[=+\-@]|[\t\r])/.test(s)) {
    s = "'" + s;
  }
  return '"' + s.replace(/"/g, '""') + '"';
}
export function csvTablaSql(
  bloque: Extract<Bloque, {
    tipo: "tabla";
  }>,
): Uint8Array {
  return new TextEncoder().encode(
    "\uFEFF" + [
      bloque.columnas.map((c) => csvValor(c.etiqueta)).join(","),
      ...bloque.filas.map((f) =>
        bloque.columnas.map((c) => csvValor(f[c.columna])).join(",")
      ),
    ].join("\r\n"),
  );
}
const recortar = (s: string, n: number) =>
  Array.from(s).length > n ? Array.from(s).slice(0, n - 1).join("") + "…" : s;
function tablaPre(
  b: Extract<Bloque, {
    tipo: "tabla";
  }>,
): {
  texto: string;
  oculto: boolean;
} {
  const cols = b.columnas.slice(0, 4);
  const rows = b.filas.slice(0, 15).map((f) =>
    cols.map((c) => formatearValor(f[c.columna], c.formato).replace(/\n/g, " "))
  );
  const head = cols.map((c) => c.etiqueta.replace(/\n/g, " "));
  const all = [head, ...rows];
  const widths = cols.map((_, i) =>
    Math.min(24, Math.max(...all.map((r) => Array.from(r[i]).length)))
  );
  const render = (r: string[]) =>
    r.map((c, i) => {
      const x = recortar(c, widths[i]);
      return x + " ".repeat(Math.max(0, widths[i] - Array.from(x).length));
    }).join(" | ");
  return {
    texto: [render(head), ...rows.map(render)].join("\n"),
    oculto: b.filas.length > 15 || b.columnas.length > 4 ||
      all.some((r) => r.some((c, i) => Array.from(c).length > widths[i])),
  };
}
export function planRespuestaSql(
  r: RespuestaTelegramSql,
): OperacionTelegramSql[] {
  const out: OperacionTelegramSql[] = [];
  const agregar = (mensajes: MensajeHtmlSql[]) =>
    out.push(...mensajes.map((m) => ({ tipo: "mensaje" as const, ...m })));
  agregar(textoHtmlSql(r.texto));
  if (r.aclaracion?.pregunta && !r.texto.includes(r.aclaracion.pregunta)) {
    agregar(textoHtmlSql(r.aclaracion.pregunta));
  }
  for (const b of r.bloques) {
    if (b.tipo === "grafica") {
      out.push({ tipo: "grafica", bloque: b });
      continue;
    }
    if (b.tipo === "tarjeta") {
      for (const item of b.items) {
        agregar(
          [
            ...partes(item.etiqueta + ":", "b"),
            ...partes(" " + formatearValor(item.valor, item.formato)),
          ].reduce<MensajeHtmlSql[]>((a, p) => {
            const last = a[a.length - 1];
            if (last && last.html.length + p.html.length <= 4096) {
              last.html += p.html;
              last.texto += p.texto;
            } else {
              a.push({ ...p });
            }
            return a;
          }, []),
        );
      }
    } else {
      agregar(partes(b.titulo, "b"));
      const t = tablaPre(b);
      agregar(preHtmlSql(t.texto));
      if (t.oculto) {
        agregar(
          textoHtmlSql(
            "Vista de hasta 15 filas y 4 columnas. El archivo incluye todas las filas y columnas disponibles del bloque.",
          ),
        );
        out.push({
          tipo: "documento",
          bytes: csvTablaSql(b),
          nombre: `esco-tabla-${b.consulta}.csv`,
        });
      }
    }
    if (b.aviso) {
      agregar(textoHtmlSql(b.aviso));
    }
  }
  return out;
}
export function textoConsultasSql(
  consultas: ConsultaTelegramSql[],
): MensajeHtmlSql[] {
  return consultas.flatMap((
    c,
    i,
  ) => [
    ...textoHtmlSql(
      `Consulta ${i + 1}: ${c.proposito}\nFilas: ${
        c.n_filas === null ? "Sin dato" : c.n_filas
      }${c.truncado ? " · truncada" : ""}${c.error ? " · con error" : ""}`,
    ),
    ...preHtmlSql(c.sql),
  ]);
}
