import { describe, expect, it } from "vitest";
import {
  renderizarGraficaPng,
  renderizarGraficaSvg,
} from "../supabase/functions/server/telegram/escoSqlPng.ts";
import type { Bloque } from "../utils/escoSql/bloques.ts";
type Grafica = Extract<Bloque, { tipo: "grafica" }>;
const bloque = (
  forma: Grafica["forma"] = "bar",
  datos: Grafica["datos"] = [{ nombre: "Categoría sintética", valor: 125.5 }],
): Grafica => ({
  tipo: "grafica",
  consulta: 0,
  truncado: false,
  titulo: "Gráfica sintética ñ",
  forma,
  x: "nombre",
  y: ["valor"],
  formato: "numero",
  datos,
});
const dimension = (b: Uint8Array, i: number): number =>
  new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(i);

describe("P5 PNG local", () => {
  it("escapa títulos/labels y no permite recursos externos en el SVG generado", () => {
    const b = bloque("bar", [{
      nombre: '<image href="https://invalid.example">&',
      valor: 2,
    }]);
    b.titulo = "<script>alert(1)</script>";
    const svg = renderizarGraficaSvg(b, 'Fuente" onload="x');
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&lt;image");
    expect(svg).not.toMatch(
      /<script|<image|<foreignObject|<use\b|\shref="|\sonload="/,
    );
  });
  it("line/area cortan la trayectoria en NULL y conservan cero", () => {
    for (const forma of ["line", "area"] as const) {
      const svg = renderizarGraficaSvg(
        bloque(forma, [
          { nombre: "A", valor: 1 },
          { nombre: "B", valor: null },
          { nombre: "C", valor: 0 },
        ]),
      );
      expect((svg.match(/<circle /g) ?? []).length).toBe(2);
      expect(svg).toContain("Los datos nulos");
      expect(svg).not.toContain("NaN");
    }
  });
  it("bar mantiene como máximo siete ticks y su última etiqueta dentro de la imagen", () => {
    const b = bloque(
      "bar",
      Array.from(
        { length: 60 },
        (_, i) => ({ nombre: `Categoría ${i + 1}`, valor: i + 1 }),
      ),
    );
    const svg = renderizarGraficaSvg(b);
    const ticks = [
      ...svg.matchAll(/<text x="([\d.]+)" y="344"[^>]*>Categoría/g),
    ];
    expect(ticks).toHaveLength(7);
    expect(ticks.every((t) => Number(t[1]) >= 45 && Number(t[1]) <= 675)).toBe(
      true,
    );
    expect(svg).toContain("Categoría 60</text>");
  });
  it("pie muestra todas las leyendas y advierte truncado sin agrupar datos", () => {
    const b = bloque(
      "pie",
      Array.from(
        { length: 60 },
        (_, i) => ({ nombre: `Categoría ${i}`, valor: i + 1 }),
      ),
    );
    b.truncado = true;
    const svg = renderizarGraficaSvg(b);
    expect(svg).toContain("Categoría 59");
    expect(svg).toContain("Consulta truncada");
    expect((svg.match(/<path /g) ?? []).length).toBe(60);
  });
  it("pie conserva la misma paleta RGB entre cada sector y su leyenda", () => {
    const svg = renderizarGraficaSvg(
      bloque(
        "pie",
        Array.from(
          { length: 60 },
          (_, i) => ({ nombre: `Categoría ${i}`, valor: i + 1 }),
        ),
      ),
    );
    const sectores = [...svg.matchAll(/<path[^>]*fill="([^"]+)"/g)].map((m) =>
      m[1]
    );
    const leyendas = [
      ...svg.matchAll(/<rect[^>]*width="9" height="9" fill="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(sectores).toHaveLength(60);
    expect(leyendas).toEqual(sectores);
    expect(new Set(sectores).size).toBe(60);
    expect(sectores.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
  });
  it("rechaza pies negativos/multiserie, valores no finitos y más de60puntos", () => {
    expect(() =>
      renderizarGraficaSvg(bloque("pie", [{ nombre: "A", valor: -1 }]))
    ).toThrow();
    expect(() =>
      renderizarGraficaSvg({ ...bloque("pie"), y: ["valor", "otro"] })
    ).toThrow();
    expect(() =>
      renderizarGraficaSvg(bloque("bar", [{ nombre: "A", valor: Infinity }]))
    ).toThrow();
    expect(() =>
      renderizarGraficaSvg(
        bloque(
          "bar",
          Array.from({ length: 61 }, () => ({ nombre: "A", valor: 1 })),
        ),
      )
    ).toThrow();
  });
  it("rechaza glifos no incluidos para conservar su etiqueta en el CSV de fallback", () => {
    expect(() =>
      renderizarGraficaSvg(bloque("bar", [{ nombre: "山", valor: 1 }]))
    ).toThrow("ESCO_PNG_FUENTE_NO_DISPONIBLE");
  });
  it("distingue ausencia, NULL y total cero y normaliza ñ descompuesta", () => {
    expect(renderizarGraficaSvg(bloque("bar", []))).toContain("Sin filas");
    expect(renderizarGraficaSvg(bloque("pie", [{ nombre: "A", valor: null }])))
      .toContain("Sin dato");
    expect(renderizarGraficaSvg(bloque("pie", [{ nombre: "A", valor: 0 }])))
      .toContain("Total: 0");
    expect(
      renderizarGraficaSvg(bloque("bar", [{ nombre: "nin\u0303o", valor: 1 }])),
    ).toContain("niño");
  });
  it("renderiza las cuatro formas a PNG reales de720px sin fetch", async () => {
    const anterior = globalThis.fetch;
    let solicitudes = 0;
    globalThis.fetch = (() => {
      solicitudes++;
      throw new Error("Red cerrada en PNG local");
    }) as typeof fetch;
    try {
      for (const forma of ["bar", "line", "area", "pie"] as const) {
        const png = await renderizarGraficaPng(bloque(forma));
        expect(Array.from(png.slice(0, 8))).toEqual([
          137,
          80,
          78,
          71,
          13,
          10,
          26,
          10,
        ]);
        expect(dimension(png, 16)).toBe(720);
        expect(dimension(png, 20)).toBeGreaterThanOrEqual(480);
        expect(png.byteLength).toBeLessThan(5_000_000);
      }
      expect(solicitudes).toBe(0);
    } finally {
      globalThis.fetch = anterior;
    }
  });
});
