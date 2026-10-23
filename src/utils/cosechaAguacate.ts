// Etiqueta de cosecha de una venta de aguacate (`fin_ingresos.cosecha`).
//
// Decisión del dueño (2026-10-23, ESCO-160): la etiqueta se escoge al
// REGISTRAR la venta y es la fuente de verdad. Ya no se deriva de la fecha.
// Las ventanas de venta cambiaron en 2026 (la Principal arrancó en
// septiembre), y `fn_cosecha_aguacate()` (migración 043) sigue la regla
// vieja: sólo queda como respaldo en la base para los caminos que no mandan
// etiqueta (bot de Telegram). Las filas históricas conservan la etiqueta que
// ya tienen — esa regla de fechas fue la que las etiquetó.
//
// Lógica pura, sin Supabase. Guardada por `src/__tests__/cosechaAguacate.test.ts`.

const PATRON_ETIQUETA = /^(Principal|Traviesa) (\d{4})$/;

/** ¿El nombre del negocio es Aguacate Hass? Mismo criterio que los formularios. */
export function esNegocioAguacate(nombre: string | null | undefined): boolean {
  return (nombre ?? '').toLowerCase().includes('aguacate');
}

/** ¿Es una etiqueta canónica, p. ej. `Principal 2027` o `Traviesa 2026`? */
export function esEtiquetaCosecha(valor: unknown): valor is string {
  return typeof valor === 'string' && PATRON_ETIQUETA.test(valor);
}

/**
 * Lleva lo que alguien tecleó (carga masiva) a la forma canónica, o `null` si
 * no se reconoce. Acepta mayúsculas/minúsculas y espacios de más; nunca
 * adivina un año ni un tipo que no estén escritos.
 */
export function normalizarEtiquetaCosecha(valor: unknown): string | null {
  if (valor == null) return null;
  const limpio = String(valor).trim().replace(/\s+/g, ' ');
  const m = /^(principal|traviesa) (\d{4})$/i.exec(limpio);
  if (!m) return null;
  const tipo = m[1].toLowerCase() === 'principal' ? 'Principal' : 'Traviesa';
  return `${tipo} ${m[2]}`;
}

/**
 * Las etiquetas que tiene sentido ofrecer para una venta de esa fecha, en
 * orden cronológico: la Principal que se vende a comienzos del año, la
 * Traviesa del año, y la Principal siguiente (que ya puede empezar a
 * venderse en el segundo semestre). No hay valor por defecto: quien registra
 * escoge.
 *
 * @param fecha 'YYYY-MM-DD'. Si no es válida, se usa `anioRespaldo`.
 */
export function opcionesCosecha(fecha: string, anioRespaldo: number = new Date().getFullYear()): string[] {
  const anio = /^\d{4}-/.test(fecha) ? parseInt(fecha.substring(0, 4), 10) : anioRespaldo;
  return [`Principal ${anio}`, `Traviesa ${anio}`, `Principal ${anio + 1}`];
}

/**
 * Opciones para un selector que tiene que mostrar también la etiqueta ya
 * guardada (al editar una venta vieja), aunque no esté entre las sugeridas.
 */
export function opcionesCosechaConActual(fecha: string, actual: string | null | undefined): string[] {
  const base = opcionesCosecha(fecha);
  return esEtiquetaCosecha(actual) && !base.includes(actual) ? [actual, ...base] : base;
}
