// D3: draw only validated block data. No remote fonts, images or chart service.
import type { Bloque } from "@esco-sql/bloques.ts";
import { formatearValor, FORMATOS } from "@esco-sql/formato.ts";
import { FONT_CODEPOINTS } from "./vendor/escoSqlFontCoverage.ts";
const GLIFOS = new Set(FONT_CODEPOINTS);
function exigirGlifos(valor: unknown): void {
  for (const c of String(valor).normalize("NFC").replace(/\p{Cc}/gu, " ")) {
    if (!GLIFOS.has(c.codePointAt(0)!)) {
      throw new Error("ESCO_PNG_FUENTE_NO_DISPONIBLE");
    }
  }
}

type Grafica = Extract<Bloque, { tipo: "grafica" }>;
const COLORES = [
  "#28624b",
  "#287fa0",
  "#d3972e",
  "#9a537d",
  "#526cb0",
  "#ac6042",
];
const ANCHO = 720;
const ALTO = 480;
const xml = (valor: unknown): string =>
  String(valor).normalize("NFC").replace(/\p{Cc}/gu, " ").replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const corto = (valor: unknown, max: number): string => {
  const chars = Array.from(String(valor).normalize("NFC"));
  return chars.length > max
    ? chars.slice(0, max - 1).join("") + "…"
    : chars.join("");
};
const texto = (
  x: number,
  y: number,
  valor: unknown,
  size = 12,
  extra = "",
): string =>
  `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${xml(valor)}</text>`;
const numero = (n: number): string =>
  Number.isFinite(n) ? n.toFixed(3) : (() => {
    throw new Error("ESCO_PNG_DATO_INVALIDO");
  })();

function validar(b: Grafica): void {
  if (
    !b || b.tipo !== "grafica" ||
    !["bar", "line", "area", "pie"].includes(b.forma) ||
    !Array.isArray(b.datos) || b.datos.length > 60 || !Array.isArray(b.y) ||
    b.y.length < 1 || b.y.length > 6 || typeof b.x !== "string" ||
    typeof b.titulo !== "string" || b.titulo.length > 120
  ) throw new Error("ESCO_PNG_BLOQUE_INVALIDO");
  if (
    !FORMATOS.includes(b.formato) ||
    b.y.some((s) => typeof s !== "string" || s.length > 120)
  ) throw new Error("ESCO_PNG_BLOQUE_INVALIDO");
  exigirGlifos(b.titulo);
  for (const serie of b.y) exigirGlifos(serie);
  for (const fila of b.datos) {
    if (
      !fila || typeof fila !== "object" || Array.isArray(fila) ||
      !Object.prototype.hasOwnProperty.call(fila, b.x)
    ) throw new Error("ESCO_PNG_DATO_INVALIDO");
    const etiqueta = fila[b.x];
    exigirGlifos(etiqueta === null ? "Sin dato" : etiqueta);
    if (
      etiqueta !== null &&
      !["string", "number", "boolean"].includes(typeof etiqueta)
    ) throw new Error("ESCO_PNG_DATO_INVALIDO");
    if (typeof etiqueta === "number" && !Number.isFinite(etiqueta)) {
      throw new Error("ESCO_PNG_DATO_INVALIDO");
    }
    for (const serie of b.y) {
      if (
        !Object.prototype.hasOwnProperty.call(fila, serie) ||
        (fila[serie] !== null &&
          (typeof fila[serie] !== "number" || !Number.isFinite(fila[serie])))
      ) throw new Error("ESCO_PNG_DATO_INVALIDO");
    }
  }
  if (
    b.forma === "pie" &&
    (b.y.length !== 1 ||
      b.datos.some((r) => r[b.y[0]] !== null && Number(r[b.y[0]]) < 0))
  ) throw new Error("ESCO_PNG_PIE_NO_REPRESENTABLE");
}

function cartesianas(b: Grafica): string {
  const left = 102, right = 698, top = 72, bottom = 322;
  const w = right - left, h = bottom - top;
  const valores = b.datos.flatMap((r) => b.y.map((s) => r[s])).filter((
    v,
  ): v is number => typeof v === "number");
  if (valores.length === 0) {
    return texto(
      ANCHO / 2,
      210,
      b.datos.length ? "Sin dato numérico" : "Sin filas",
      17,
      'text-anchor="middle"',
    );
  }
  const min = Math.min(0, ...valores), max = Math.max(0, ...valores);
  const span = max - min || 1;
  const y = (v: number): number => bottom - (v - min) / span * h;
  const n = b.datos.length;
  const x = (i: number): number => left + (i + 0.5) * w / Math.max(n, 1);
  let svg = "";
  for (let i = 0; i <= 4; i++) {
    const val = min + span * i / 4, yy = y(val);
    svg += `<line x1="${left}" y1="${numero(yy)}" x2="${right}" y2="${
      numero(yy)
    }" stroke="#e0e6e3"/>`;
    svg += texto(
      left - 10,
      yy + 4,
      corto(formatearValor(val, b.formato), 19),
      11,
      'text-anchor="end"',
    );
  }
  svg += `<line x1="${left}" y1="${numero(y(0))}" x2="${right}" y2="${
    numero(y(0))
  }" stroke="#56665d"/>`;
  b.y.forEach((serie, si) => {
    const color = COLORES[si % COLORES.length];
    if (b.forma === "bar") {
      const bw = w / Math.max(n, 1) * 0.8 / b.y.length;
      b.datos.forEach((r, i) => {
        const v = r[serie];
        if (v === null) return;
        const yy = y(v as number),
          base = y(0),
          xx = x(i) - w / Math.max(n, 1) * 0.4 + si * bw;
        svg += `<rect x="${numero(xx)}" y="${
          numero(Math.min(yy, base))
        }" width="${numero(bw * 0.9)}" height="${
          numero(Math.abs(base - yy))
        }" fill="${color}"/>`;
      });
    } else {
      // NULL cuts a line/area. It never becomes a zero or bridges an unknown value.
      let segment: Array<[number, number]> = [];
      const flush = () => {
        if (!segment.length) return;
        const path = segment.map(([xx, yy], i) =>
          `${i ? "L" : "M"}${numero(xx)},${numero(yy)}`
        ).join(" ");
        if (b.forma === "area") {
          svg += `<path d="${path} L${numero(segment[segment.length - 1][0])},${
            numero(y(0))
          } L${numero(segment[0][0])},${
            numero(y(0))
          } Z" fill="${color}" fill-opacity="0.18"/>`;
        }
        svg +=
          `<path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>`;
        for (const [xx, yy] of segment) {
          svg += `<circle cx="${numero(xx)}" cy="${
            numero(yy)
          }" r="2.5" fill="${color}"/>`;
        }
        segment = [];
      };
      b.datos.forEach((r, i) => {
        if (r[serie] === null) flush();
        else segment.push([x(i), y(r[serie] as number)]);
      });
      flush();
    }
  });
  const tickCount = Math.min(n, 7);
  const ticks = new Set(
    Array.from(
      { length: tickCount },
      (_, i) => Math.round(i * (n - 1) / Math.max(1, tickCount - 1)),
    ),
  );
  b.datos.forEach((r, i) => {
    if (ticks.has(i)) {
      const labelX = Math.min(ANCHO - 45, Math.max(45, x(i)));
      svg += texto(
        labelX,
        bottom + 22,
        corto(r[b.x] === null ? "Sin dato" : r[b.x], 13),
        10,
        'text-anchor="middle"',
      );
    }
  });
  b.y.forEach((s, i) => {
    const xx = 104 + (i % 3) * 200, yy = 381 + Math.floor(i / 3) * 23;
    svg +=
      `<rect x="${xx}" y="${yy - 10}" width="11" height="11" fill="${
        COLORES[i % COLORES.length]
      }"/>` + texto(xx + 18, yy, corto(s, 23), 11);
  });
  if (b.datos.some((r) => b.y.some((s) => r[s] === null))) {
    svg += texto(left, 435, "Los datos nulos se muestran como huecos.", 11);
  }
  return svg;
}

const colorCategoria = (i: number): string => {
  // Emit RGB hex: resvg does not consistently accept CSS hsl() fills.
  const h = ((i * 137.508) % 360) / 60, c = 0.72 * 0.6;
  const x = c * (1 - Math.abs(h % 2 - 1)), m = 0.72 - c;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [
    c,
    0,
    x,
  ]][Math.floor(h)];
  return "#" +
    rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
      .join("");
};

function sectores(b: Grafica): { contenido: string; alto: number } {
  const valores = b.datos.map((r) => r[b.y[0]] as number | null);
  const total = valores.reduce<number>((a, v) => a + (v ?? 0), 0);
  if (!Number.isFinite(total)) throw new Error("ESCO_PNG_DATO_INVALIDO");
  const cx = 360, cy = 204, radio = 122;
  let svg = "", theta = -Math.PI / 2;
  if (!total) {
    svg +=
      `<circle cx="${cx}" cy="${cy}" r="${radio}" fill="#f0f4f1" stroke="#c4d0c8"/>` +
      texto(
        cx,
        cy,
        valores.every((v) => v === null) ? "Sin dato" : "Total: 0",
        16,
        'text-anchor="middle"',
      );
  }
  valores.forEach((v, i) => {
    if (v === null || v === 0 || !total) return;
    const angle = v / total * 2 * Math.PI, color = colorCategoria(i);
    if (angle >= 2 * Math.PI - 1e-9) {
      svg += `<circle cx="${cx}" cy="${cy}" r="${radio}" fill="${color}"/>`;
    } else {
      const x1 = cx + radio * Math.cos(theta),
        y1 = cy + radio * Math.sin(theta),
        end = theta + angle;
      const x2 = cx + radio * Math.cos(end), y2 = cy + radio * Math.sin(end);
      svg += `<path d="M${cx},${cy} L${numero(x1)},${
        numero(y1)
      } A${radio},${radio} 0 ${angle > Math.PI ? 1 : 0},1 ${numero(x2)},${
        numero(y2)
      } Z" fill="${color}" stroke="white" stroke-width="0.7"/>`;
    }
    theta += angle;
  });
  const rows = Math.ceil(b.datos.length / 2),
    alto = Math.max(ALTO, 392 + rows * 19 + 35);
  b.datos.forEach((r, i) => {
    const xx = 22 + (i % 2) * 350, yy = 370 + Math.floor(i / 2) * 19;
    svg += `<rect x="${xx}" y="${yy - 9}" width="9" height="9" fill="${
      colorCategoria(i)
    }"/>`;
    const label = `${corto(r[b.x] === null ? "Sin dato" : r[b.x], 23)}: ${
      formatearValor(valores[i], b.formato)
    }`;
    svg += texto(xx + 15, yy, corto(label, 47), 10);
  });
  return { contenido: svg, alto };
}

export function renderizarGraficaSvg(
  bloque: Grafica,
  familia = "Esco Sans",
): string {
  validar(bloque);
  const dibujo = bloque.forma === "pie"
    ? sectores(bloque)
    : { contenido: cartesianas(bloque), alto: ALTO };
  const titulo = texto(22, 31, corto(bloque.titulo, 77), 18);
  const nota = bloque.truncado
    ? "Consulta truncada: la gráfica no representa el conjunto completo."
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${dibujo.alto}" viewBox="0 0 ${ANCHO} ${dibujo.alto}"><rect width="100%" height="100%" fill="white"/><g font-family="${
    xml(familia)
  }" font-weight="400" fill="#25382e">${titulo}${dibujo.contenido}${
    texto(22, dibujo.alto - 12, nota, 10)
  }</g></svg>`;
}

function bytesBase64(valor: string): Uint8Array {
  const raw = atob(valor), bytes = new Uint8Array(raw.length);
  // Avoid Array.from(atob(...), callback): its intermediate array inflates peak memory.
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

let motor:
  | Promise<
    {
      Resvg: typeof import("@resvg/resvg-wasm").Resvg;
      font: Uint8Array;
      familia: string;
    }
  >
  | undefined;
function prepararMotor() {
  return motor ??= (async () => {
    const [{ Resvg, initWasm }, wasm, fuente] = await Promise.all([
      import("@resvg/resvg-wasm"),
      import("./vendor/escoSqlWasm.ts"),
      import("./vendor/escoSqlFont.ts"),
    ]);
    await initWasm(bytesBase64(wasm.RESVG_WASM_BASE64));
    return {
      Resvg,
      font: bytesBase64(fuente.FONT_BASE64),
      familia: fuente.FONT_FAMILY,
    };
  })();
}
let cola: Promise<void> = Promise.resolve();
export async function renderizarGraficaPng(
  bloque: Grafica,
): Promise<Uint8Array> {
  validar(bloque);
  // Only one rasterization per isolate at a time, including concurrent chat requests.
  const anterior = cola;
  let liberar!: () => void;
  cola = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  await anterior;
  try {
    const { Resvg, font, familia } = await prepararMotor();
    const renderer = new Resvg(renderizarGraficaSvg(bloque, familia), {
      font: { fontBuffers: [font], defaultFontFamily: familia },
    });
    try {
      const imagen = renderer.render();
      try {
        const png = imagen.asPng();
        if (png.byteLength > 5_000_000) {
          throw new Error("ESCO_PNG_LIMITE_EXCEDIDO");
        }
        return png;
      } finally {
        imagen.free();
      }
    } finally {
      renderer.free();
    }
  } finally {
    liberar();
  }
}
