// cosecha-aguacate.ts — copia Deno de `src/utils/cosechaAguacate.ts` (solo lo
// que usa el bot). El árbol de la edge function no puede importar de `src/utils`.
// Decisión del dueño (2026-10-23, ESCO-160): la cosecha de una venta de
// aguacate se escoge al registrarla; no se deduce de la fecha.
// Paridad guardada por `src/__tests__/cosechaAguacate.test.ts`. Mantener los
// dos árboles de edge function idénticos.

/** ¿El nombre del negocio es Aguacate Hass? Mismo criterio que la web. */
export function esNegocioAguacate(nombre: string | null | undefined): boolean {
  return (nombre ?? "").toLowerCase().includes("aguacate");
}

/** Etiquetas que se ofrecen para una venta de esa fecha ('YYYY-MM-DD'). */
export function opcionesCosecha(fecha: string, anioRespaldo: number = new Date().getFullYear()): string[] {
  const anio = /^\d{4}-/.test(fecha) ? parseInt(fecha.substring(0, 4), 10) : anioRespaldo;
  return [`Principal ${anio}`, `Traviesa ${anio}`, `Principal ${anio + 1}`];
}
