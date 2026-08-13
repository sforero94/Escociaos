// ARCHIVO: utils/hato/listaHato.ts
// DESCRIPCIÓN: Lógica pura de las columnas nuevas de la lista del hato
// (N17/N18/N19 del plan docs/plan_hato_telegram_estados_agosto_2026.md).
// Pedido del dueño tras la visita de campo del 2026-08-13: "mostrar edad en
// años y números de partos a primera vista, fecha de última cría y próximo
// evento".
//
// Vive fuera de `calculosHato.ts` a propósito (mismo criterio que
// `hatoCategorias.ts` y `hatoCicloManual.ts`): es composición de producto
// sobre lo que el motor YA calculó, no una regla nueva del ciclo. Nada de
// esto necesita entrar al trío protegido por paridad byte-idéntica con el
// servidor.
//
// Cero imports de Supabase o React. Toda función que dependa de "hoy" lo
// recibe como parámetro (`hoyISO`), nunca lo lee del reloj -- misma regla
// que el motor.

import type { EstadoReproductivoDerivado } from '@/utils/calculosHato';

// ============================================================================
// Aritmética de fecha local, CON SIGNO.
//
// `diferenciaEnDias` (utils/fechas.ts) devuelve el valor ABSOLUTO
// (`Math.abs` + `Math.ceil`), así que no sirve para ninguno de los dos usos
// de este archivo: no distingue una fecha de nacimiento futura (dato mal
// digitado) de una pasada, ni un hito vencido de uno por venir. Se duplica
// la FÓRMULA, nunca la responsabilidad -- mismo criterio que ya aplican
// `hatoUi.ts::diasHastaFecha` y `hatoCicloManual.ts::diferenciaDiasIso`.
// ============================================================================

/** `hasta - desde` en días enteros. Negativo = `hasta` quedó en el pasado. */
function diasEntre(desdeISO: string, hastaISO: string): number {
  const [a1, m1, d1] = desdeISO.split('-').map(Number);
  const [a2, m2, d2] = hastaISO.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

// ============================================================================
// N18 -- Edad
// ============================================================================

/** Días de un año medio, incluyendo bisiestos. La misma convención de
 * "año calendario promedio" que ya usa el módulo con los 30.44 días/mes. */
const DIAS_POR_ANIO = 365.25;

/**
 * Edad en años con un decimal, o `null` cuando no se puede afirmar.
 *
 * `null` en dos casos, y ninguno se rellena con un valor por defecto:
 * - **Sin `fecha_nacimiento`** -- son 20 de los 65 animales activos del hato
 *   real (verificado 2026-08-13). La columna muestra "—", nunca 0: una edad
 *   inventada es peor que una edad ausente, porque se ve igual de creíble.
 * - **Fecha de nacimiento futura** -- dato mal digitado. Se reporta como
 *   ausente en vez de una edad negativa.
 */
export function edadEnAnios(fechaNacimiento: string | null, hoyISO: string): number | null {
  if (!fechaNacimiento) return null;
  const dias = diasEntre(fechaNacimiento, hoyISO);
  if (dias < 0) return null;
  return Math.round((dias / DIAS_POR_ANIO) * 10) / 10;
}

/**
 * Edad lista para pintar. Bajo el año se expresa en MESES: "0,4 años" no es
 * una edad con la que nadie razone sobre una ternera, y el hato tiene
 * terneras justamente por eso (la categoría existe). A partir del año, años
 * con un decimal y coma decimal (estándar colombiano, igual que el resto de
 * la app).
 */
export function formatearEdadHato(fechaNacimiento: string | null, hoyISO: string): string {
  const anios = edadEnAnios(fechaNacimiento, hoyISO);
  if (anios === null) return '—';
  if (anios < 1) {
    const meses = Math.max(0, Math.round((diasEntre(fechaNacimiento as string, hoyISO) / DIAS_POR_ANIO) * 12));
    return meses === 1 ? '1 mes' : `${meses} meses`;
  }
  return `${anios.toFixed(1).replace('.', ',')} años`;
}

// ============================================================================
// N19 -- Próximo evento
// ============================================================================

export type TipoProximoEvento = 'secado' | 'parto' | 'rechequeo' | 'servir';

export interface ProximoEventoHato {
  tipo: TipoProximoEvento;
  /** Etiqueta corta para la celda ("Secar", "Parto", "Rechequeo", "Servir"). */
  etiqueta: string;
  /** Fecha objetivo real, o `null` cuando el evento no tiene una fecha
   * honesta que mostrar (rechequeo y servir -- ver abajo). */
  fecha: string | null;
  /** Días desde hoy hasta `fecha`. Negativo = vencido. `null` cuando no hay
   * fecha. */
  dias: number | null;
}

const ETIQUETA_PROXIMO_EVENTO: Record<TipoProximoEvento, string> = {
  secado: 'Secar',
  parto: 'Parto',
  rechequeo: 'Rechequeo',
  servir: 'Servir',
};

/** Entrada mínima: lo que la lista ya tiene por fila, sin consultas nuevas. */
export interface EntradaProximoEvento {
  derivado: EstadoReproductivoDerivado;
}

/**
 * El siguiente hito de la vaca, para la columna "Próximo evento".
 *
 * **Solo dos de los cuatro hitos tienen una fecha real**: `fecha_secar` y
 * `fecha_probable_parto`, ambas proyectadas por el motor desde el último
 * servicio. "Rechequeo" y "servir" NO tienen fecha objetivo en ninguna parte
 * del sistema -- el motor solo sabe si están vencidos (`alertas.rechequeo_due`)
 * o si la vaca está vacía. Inventarles una fecha sería exactamente lo que
 * `PILL_ALERTA_TABLERO` ya se negó a hacer para el Dashboard, así que aquí
 * tampoco: entran como hito SIN fecha, y solo cuando no hay ninguno con
 * fecha que mostrar.
 *
 * Elección entre los hitos con fecha: gana el **más próximo que todavía no
 * pasó**; si todos ya pasaron, gana el **más reciente**, que es la
 * obligación vigente (una vaca con el secado vencido hace un mes y el parto
 * vencido ayer necesita que se le hable del parto). El secado se descarta
 * en cuanto la vaca ya está seca -- ese hito ya se cumplió.
 */
export function proximoEventoHato(entrada: EntradaProximoEvento, hoyISO: string): ProximoEventoHato | null {
  const { derivado } = entrada;

  const candidatos: Array<{ tipo: TipoProximoEvento; fecha: string }> = [];
  if (derivado.fecha_secar && derivado.estado !== 'seca') {
    candidatos.push({ tipo: 'secado', fecha: derivado.fecha_secar });
  }
  if (derivado.fecha_probable_parto) {
    candidatos.push({ tipo: 'parto', fecha: derivado.fecha_probable_parto });
  }

  if (candidatos.length > 0) {
    const futuros = candidatos.filter((c) => c.fecha >= hoyISO).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const pasados = candidatos.filter((c) => c.fecha < hoyISO).sort((a, b) => (a.fecha > b.fecha ? -1 : 1));
    const elegido = futuros[0] ?? pasados[0];
    return {
      tipo: elegido.tipo,
      etiqueta: ETIQUETA_PROXIMO_EVENTO[elegido.tipo],
      fecha: elegido.fecha,
      dias: diasEntre(hoyISO, elegido.fecha),
    };
  }

  if (derivado.alertas.rechequeo_due) {
    return { tipo: 'rechequeo', etiqueta: ETIQUETA_PROXIMO_EVENTO.rechequeo, fecha: null, dias: null };
  }

  // "Por servir" solo se afirma de una vaca efectivamente vacía. El motor ya
  // marcó cuáles lo están con `vacia_es_problema !== null` (V14): ese campo
  // es `null` en todo estado donde la pregunta no aplica (preñez activa,
  // seca, cría, terminal), así que sirve de discriminador sin repetir aquí
  // la lista de estados.
  if (derivado.vacia_es_problema !== null) {
    return { tipo: 'servir', etiqueta: ETIQUETA_PROXIMO_EVENTO.servir, fecha: null, dias: null };
  }

  return null;
}
