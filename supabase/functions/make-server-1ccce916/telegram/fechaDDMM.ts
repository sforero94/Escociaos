// telegram/fechaDDMM.ts — Lectura de la fecha que el usuario escribe en los
// flujos del bot. Módulo puro y SIN imports de grammy, para que se pueda
// probar desde Vitest sin cruzar la frontera de Deno (mismo criterio que
// `eventoHatoUndo.ts`).
//
// ORIGEN: incidente del 2026-09-08. Martha registró seis eventos por
// Telegram en una sola sesión y cuatro quedaron con la fecha corrida cuatro
// meses. Lo que guardó la base:
//
//   MAGNIFICA #103  monta   2026-03-09
//   ESMERALDA #5162 monta   2026-04-09
//   FUERZA    #167  monta   2026-04-09
//   FLACA     #5182 monta   2026-05-09   (dos veces, 16 minutos aparte)
//
// Las cuatro caen en el DÍA 09, sobre cuatro meses distintos, capturadas de
// corrido el 8 de septiembre. Eso no es un calendario de servicios: es el
// mismo texto leído al revés. Ella escribió mes/día — «5/9» por 5 de
// septiembre — y el paso pedía DD/MM, así que «5/9» se guardó como 9 de
// mayo. Nadie mintió y nada falló: el parser hizo exactamente lo que
// prometía. El defecto es que **una cadena ambigua se resolvió en silencio**.
//
// LA REGLA QUE ESTE MÓDULO IMPONE: cuando `a/b` se puede leer de las dos
// formas (ambos números ≤ 12 y distintos), NO se elige. Se devuelven las dos
// lecturas para que el flujo pregunte. Adivinar acá es exactamente lo que
// costó los cuatro registros — y una fecha de servicio equivocada corre el
// parto probable, el secado y las alertas del animal.
//
// Se acepta además un año explícito (`5/9/26`, `5/9/2026`). Antes eso era
// «Formato inválido», que es un callejón sin salida justo cuando el usuario
// está tratando de ser MÁS preciso. El año no desambigua por sí solo
// (`5/9/26` sigue siendo 5-sep o 9-may), pero fija el año en vez de dejarlo
// a la heurística de «futuro = año pasado».

/** Una lectura posible del texto, ya resuelta a ISO `AAAA-MM-DD`. */
export interface LecturaFecha {
  iso: string;
  /** Prosa para el botón: «5 de septiembre 2026». Nunca `5/9`, que es
   * justamente la cadena que se está desambiguando. */
  etiqueta: string;
}

export type ResultadoFecha =
  /** El texto no es una fecha. */
  | { tipo: "invalido" }
  /** Una sola lectura posible: se usa sin preguntar. */
  | { tipo: "unico"; fecha: LecturaFecha }
  /** Dos lecturas posibles. `probable` es la más cercana a hoy y va primero
   * en el teclado; `alterna` es la otra. El flujo DEBE preguntar. */
  | { tipo: "ambiguo"; probable: LecturaFecha; alterna: LecturaFecha };

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "Hoy" en Bogotá (UTC-5), NUNCA en UTC. El servidor Deno corre en UTC y
 * de las 19:00 en adelante `new Date().toISOString()` ya devuelve mañana —
 * la misma trampa que el CLAUDE.md raíz documenta para el navegador.
 * `jornal.ts` e `ingreso.ts` la tenían viva: fechaban con `new Date()` a
 * secas y además tomaban el AÑO de ahí. */
export function hoyBogota(): string {
  const bogota = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return bogota.toISOString().slice(0, 10);
}

/** `iso` menos `n` días. Puro: no mira el reloj. */
export function restarDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86400000)
    .toISOString()
    .slice(0, 10);
}

/** «2026-09-05» → «5 de septiembre 2026». */
export function fechaLegible(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} ${a}`;
}

/** Días de `iso` hacia atrás desde `hoy`. Negativo si `iso` es futuro. */
export function diasAtras(iso: string, hoy: string): number {
  return Math.round(
    (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86400000,
  );
}

/** Construye la lectura si el (día, mes) es un calendario real. Rechaza
 * 31/02 y 31/04: un día que no existe no es una lectura, es un error. */
function construir(dia: number, mes: number, anio: number, hoy: string): LecturaFecha | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  let iso = d.toISOString().slice(0, 10);
  // Sin año explícito, una fecha futura casi siempre es el año pasado mal
  // escrito («28/12» registrado en enero). Con año explícito se respeta lo
  // que el usuario escribió: si se equivocó, la advertencia del flujo lo dice.
  if (iso > hoy) {
    const previo = new Date(Date.UTC(anio - 1, mes - 1, dia));
    if (previo.getUTCMonth() === mes - 1 && previo.getUTCDate() === dia) {
      iso = previo.toISOString().slice(0, 10);
    }
  }
  return { iso, etiqueta: fechaLegible(iso) };
}

/** Lee `D/M`, `D/M/AA` o `D/M/AAAA` (también con `-` o `.`).
 * `hoy` se pasa siempre — este módulo nunca mira el reloj, para que las
 * pruebas fijen la fecha (mismo contrato que `calculosHato.ts`). */
export function leerFecha(texto: string, hoy: string): ResultadoFecha {
  const m = texto.trim().match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/);
  if (!m) return { tipo: "invalido" };

  const primero = parseInt(m[1], 10);
  const segundo = parseInt(m[2], 10);

  let anio: number;
  let anioExplicito = false;
  if (m[3]) {
    anioExplicito = true;
    anio = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
  } else {
    anio = Number(hoy.slice(0, 4));
  }
  // Con año explícito no se aplica el retroceso de año: el usuario ya dijo
  // cuál es. Se logra pasando un `hoy` que nada puede superar.
  const referencia = anioExplicito ? "9999-12-31" : hoy;

  const comoDiaMes = construir(primero, segundo, anio, referencia);
  const comoMesDia = construir(segundo, primero, anio, referencia);

  if (!comoDiaMes && !comoMesDia) return { tipo: "invalido" };
  if (!comoMesDia) return { tipo: "unico", fecha: comoDiaMes! };
  if (!comoDiaMes) return { tipo: "unico", fecha: comoMesDia };
  if (comoDiaMes.iso === comoMesDia.iso) return { tipo: "unico", fecha: comoDiaMes };

  // Ambiguo de verdad. La más cercana a hoy va primero: el bot registra lo
  // que acaba de pasar en el potrero, no historia. Es una sugerencia de
  // ORDEN, no una decisión — las dos opciones se muestran completas.
  const aDias = Math.abs(diasAtras(comoDiaMes.iso, hoy));
  const bDias = Math.abs(diasAtras(comoMesDia.iso, hoy));
  return aDias <= bDias
    ? { tipo: "ambiguo", probable: comoDiaMes, alterna: comoMesDia }
    : { tipo: "ambiguo", probable: comoMesDia, alterna: comoDiaMes };
}

/** Umbral del aviso de «esto pasó hace mucho». No bloquea (contrato 4 de
 * eventoHato.ts); solo obliga a que la antigüedad sea VISIBLE. Los cuatro
 * eventos corridos del 2026-09-08 quedaron entre 122 y 183 días atrás y el
 * flujo no dijo una palabra. */
export const DIAS_FECHA_LEJANA = 45;

/** Texto del aviso, o `null` si la fecha no está lejos. */
export function avisoFechaLejana(iso: string, hoy: string): string | null {
  const dias = diasAtras(iso, hoy);
  if (dias <= DIAS_FECHA_LEJANA) return null;
  return `Esa fecha es de hace ${dias} días (${fechaLegible(iso)}). Si querías una fecha reciente, cancela y vuelve a escribirla.`;
}
