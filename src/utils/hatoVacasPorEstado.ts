// ARCHIVO: utils/hatoVacasPorEstado.ts
// DESCRIPCIÓN: Aritmética pura de proporciones para la card "Vacas por
// estado" del Tablero (E3.3, `VacasPorEstadoCard.tsx` --
// docs/hato/sesiones-b5-d7-e3.md). Recibe conteos YA derivados de
// `categoria`/`derivado.estado` en `HatoDashboard.tsx` -- no clasifica ni
// filtra ningún animal, solo calcula el porcentaje que cada valor ocupa en
// una barra (2 o N segmentos), con guarda de división por cero (total 0 ->
// todos los porcentajes en 0, nunca NaN/Infinity).

/** Porcentaje (0-100) de cada lado de una barra de dos valores (ej. Ordeño
 * vs. Horro). `a + b === 0` -> ambos 0 (barra vacía, sin animales que
 * clasificar todavía). */
export function calcularProporcionesDosValores(a: number, b: number): { pctA: number; pctB: number } {
  const total = a + b;
  if (total <= 0) return { pctA: 0, pctB: 0 };
  const pctA = (a / total) * 100;
  return { pctA, pctB: 100 - pctA };
}

/** Porcentaje (0-100) de cada valor de una lista sobre su suma (ej. la
 * barra "Etapa" de 3 segmentos: Vacas/Novillas/Terneras). Preserva el orden
 * de entrada; total 0 -> todos 0. */
export function calcularProporcionesN(valores: number[]): number[] {
  const total = valores.reduce((s, v) => s + v, 0);
  if (total <= 0) return valores.map(() => 0);
  return valores.map((v) => (v / total) * 100);
}
