import { describe, expect, it, vi } from "vitest";
import {
  csvTablaSql,
  enviarHtmlSql,
  planRespuestaSql,
  textoHtmlSql,
} from "../supabase/functions/server/telegram/escoSqlRender.ts";
import { leerRespuestaEscoSql } from "../supabase/functions/server/telegram/escoSqlContrato.ts";
const tabla = {
  tipo: "tabla" as const,
  titulo: "Tabla <sintética>",
  consulta: 1,
  truncado: true,
  aviso: "Consulta truncada: estos datos no son el conjunto completo.",
  total_filas: 90,
  columnas: Array.from(
    { length: 5 },
    (_, i) => ({
      columna: "c" + i,
      etiqueta: "Col " + i,
      formato: "texto" as const,
    }),
  ),
  filas: Array.from(
    { length: 20 },
    (_, i) =>
      Object.fromEntries(
        Array.from(
          { length: 5 },
          (_, j) => ["c" + j, `fila ${i} & valor ${j}`],
        ),
      ),
  ),
};
describe("P5 render unitario", () => {
  it("texto HTML escapado y trozos autónomos Unicode <=4096", () => {
    const texto = "**Título <seguro>**\n" + "😀 & <script> ".repeat(1500);
    const r = textoHtmlSql(texto);
    expect(r.length).toBeGreaterThan(1);
    expect(r.every((x) => x.html.length <= 4096)).toBe(true);
    expect(r.map((x) => x.html).join("")).not.toContain("<script>");
    expect(r.map((x) => x.texto).join("")).toContain("😀 & <script>");
    expect(r[0].html).toContain("<b>Título &lt;seguro&gt;</b>");
  });
  it("tabla limita dibujo a15x4, avisa truncado y adjunta todaslasfilas/columnas CSV", () => {
    const ops = planRespuestaSql({
      texto: "Control",
      bloques: [tabla],
      sugerencias: [],
      consultas: [],
      ms: 0,
    });
    const msg = ops.filter((o) => o.tipo === "mensaje").map((o) => o.html).join(
      "",
    );
    expect(msg).not.toContain("fila 15");
    expect(msg).not.toContain("Col 4");
    expect(msg).toContain("Consulta truncada");
    const csv = ops.find((o) => o.tipo === "documento");
    expect(csv?.tipo).toBe("documento");
    if (csv?.tipo !== "documento") {
      throw Error("Fixture");
    }
    const txt = new TextDecoder().decode(csv.bytes);
    expect(txt).toContain("Col 4");
    expect(txt).toContain("fila 19 & valor 4");
  });
  it("CSV preserva NULL/0 y neutraliza fórmulas solo en cadenas", () => {
    const csv = new TextDecoder().decode(
      csvTablaSql({
        ...tabla,
        columnas: [{ columna: "n", etiqueta: "dato", formato: "texto" }],
        filas: [{ n: null }, { n: 0 }, { n: -2 }, { n: "=1+1" }],
      }),
    );
    expect(csv).toContain('"0"');
    expect(csv).toContain('"-2"');
    expect(csv).toContain('"\'=1+1"');
  });
  it("CSV neutraliza prefijos de fórmula tras espacios en datos y cabeceras", () => {
    const csv = new TextDecoder().decode(
      csvTablaSql({
        ...tabla,
        columnas: [{
          columna: "s",
          etiqueta: "  =SYN_HEADER",
          formato: "texto",
        }],
        filas: [{ s: "  =SYN_LITERAL" }, { s: "  texto literal" }],
      }),
    );
    expect(csv).toContain('"\'  =SYN_HEADER"');
    expect(csv).toContain('"\'  =SYN_LITERAL"');
    expect(csv).toContain('"  texto literal"');
  });
  it("HTML rechazado por parseo usa plain; red/errores ajenos no duplican envío", async () => {
    const reply = vi.fn().mockRejectedValueOnce({
      error_code: 400,
      description: "Bad Request: can't parse entities",
    }).mockResolvedValue({ message_id: 1 });
    await enviarHtmlSql({ reply }, {
      html: "<b>Control</b>",
      texto: "Control",
    });
    expect(reply).toHaveBeenNthCalledWith(2, "Control");
    const fail = vi.fn().mockRejectedValue(new Error("network"));
    await expect(
      enviarHtmlSql({ reply: fail }, { html: "Control", texto: "Control" }),
    ).rejects.toThrow("network");
    expect(fail).toHaveBeenCalledOnce();
  });
  it("contrato valida visuales y conserva solo traces saneadas", () => {
    const r = leerRespuestaEscoSql({
      motor: "sql",
      texto: "Control",
      bloques: [],
      sugerencias: [],
      consultas: [{
        sql: "SELECT 1",
        n_filas: 1,
        filas_muestra: [{ dato: "NO" }],
      }],
      ms: 0,
    });
    expect(JSON.stringify(r)).not.toContain("NO");
    expect(() =>
      leerRespuestaEscoSql({
        motor: "sql",
        texto: "Control",
        bloques: [{ tipo: "inventado" }],
        consultas: [],
      })
    ).toThrow("visual");
  });
});
