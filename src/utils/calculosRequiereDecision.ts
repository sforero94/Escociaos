// Lógica pura del bloque "Requiere tu decisión" del Tablero General
// (`docs/plan_dashboard_centro_control.md` §4 Bloque 1 / §9.2).
//
// Regla de admisión del bloque: sólo entra lo que tiene dueño = quien lee el
// tablero y un botón que lo resuelve. Este módulo NO decide esa admisión por
// negocio (eso ya lo fija el plan: ganado pendiente, aplicaciones colgadas o
// que arrancan ya, gastos pendientes) -- sólo construye el título y el
// contexto de cada fila a partir de datos YA calculados, sin tocar Supabase
// ni `new Date()` (todas las funciones reciben "hoy" como parámetro, mismo
// criterio que `accionesOrden.ts`/`accionesHechos.ts`/`hatoUi.ts`).
//
// "Sin dato es sin dato": ninguna función de este módulo devuelve un `0`
// fabricado. Con cero filas de entrada, el constructor devuelve `null` (no
// hay fila que mostrar) y el llamador nunca lo confunde con un error de
// consulta -- ese caso se maneja aparte, en el hook, con un mensaje de error
// explícito.

import { formatCompact, formatNumber } from './format';
import { formatearFechaLarga } from './fechas';

// ============================================================================
// Utilidades de fecha (duplicadas a propósito -- mismo patrón que
// `accionesOrden.ts`/`accionesHechos.ts`/`hatoUi.ts`: este módulo no exporta
// su `diasEntre` interno, así que cada consumidor puro repite la FÓRMULA,
// nunca el criterio, en vez de importar una función no exportada).
// ============================================================================

/** Diferencia con signo en días de calendario (`hasta` - `desde`), sobre
 *  fechas `AAAA-MM-DD` ya conocidas. Positivo = `hasta` es futura. */
function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

/** `AAAA-MM-DD` local a partir de un timestamp completo (`created_at`,
 *  timestamptz). Deliberadamente NO usa `fechaAISODate` de `fechas.ts`
 *  directamente sobre el string: esa función le anexa `T00:00:00` a
 *  cualquier string de entrada, lo que rompe un timestamp que YA trae hora
 *  ("...T10:23:45.678Z" + "T00:00:00" no parsea). Construir el `Date` aquí
 *  primero y formatear sus componentes LOCALES evita ese choque sin
 *  reimplementar el formateo. */
function fechaLocalDeTimestamp(iso: string): string {
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function pluralDias(n: number): string {
  return `${n} día${n === 1 ? '' : 's'}`;
}

/** "A" / "A y B" / "A, B y C" -- unión en español. `Intl.ListFormat` haría
 *  esto nativo, pero el `lib` de TypeScript del proyecto es `ES2020` (no
 *  incluye sus tipos) y tocar `tsconfig.json` para una sola función de este
 *  módulo no es una decisión de este cambio. */
function formatearListaConY(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

// ============================================================================
// 1.1 · Movimientos de ganado pendientes de confirmar
// ============================================================================

export interface GanadoPendienteParaDecision {
  id: string;
  /** `AAAA-MM-DD` -- `gan_movimientos.fecha` es tipo `date`. */
  fecha: string;
}

export interface FilaGanadoPendienteTexto {
  titulo: string;
  contexto: string;
  /** El pendiente más antiguo -- "Confirmar aquí"/"Descartar" resuelven ESTE
   *  primero (§ anatomía de la fila: un botón, no un picker). Al resolverlo,
   *  la fila se recalcula y, si queda otro, muestra el siguiente. */
  idMasViejo: string;
}

/** `totalCabezas` es el inventario TOTAL confirmado hoy (`gan_inventario`),
 *  no las cabezas de los pendientes -- es lo que explica la consecuencia de
 *  no confirmar ("el inventario de N cabezas no se mueve"). `null` cuando esa
 *  consulta adicional falló: la fila se sigue mostrando (los pendientes SÍ
 *  se pudieron leer), sólo se omite la cifra que no se pudo obtener -- nunca
 *  se rellena con 0. */
export function construirFilaGanadoPendiente(
  pendientes: readonly GanadoPendienteParaDecision[],
  hoy: string,
  totalCabezas: number | null,
): FilaGanadoPendienteTexto | null {
  if (pendientes.length === 0) return null;

  const ordenados = [...pendientes].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const masViejo = ordenados[0];
  const diasMasViejo = Math.max(diasEntre(masViejo.fecha, hoy), 0);

  const titulo =
    pendientes.length === 1
      ? '1 movimiento de ganado pendiente de confirmar'
      : `${pendientes.length} movimientos de ganado pendientes de confirmar`;

  const contexto = [
    `El más viejo lleva ${pluralDias(diasMasViejo)}.`,
    totalCabezas != null
      ? `Sin confirmar, el inventario de ${formatNumber(totalCabezas)} cabezas no se mueve.`
      : 'Sin confirmar, el inventario no se mueve.',
  ].join(' ');

  return { titulo, contexto, idMasViejo: masViejo.id };
}

// ============================================================================
// 1.3 · Aplicaciones colgadas o que arrancan ya
// ============================================================================

export interface AplicacionParaDecision {
  id: string;
  nombre: string;
  /** Sólo `'Calculada'` y `'En ejecución'` producen fila -- `'Cerrada'` nunca
   *  llega aquí (el llamador ya filtra por `estado` en la consulta). */
  estado: 'Calculada' | 'En ejecución';
  /** timestamptz -- referencia para "colgada" cuando `estado='Calculada'`. */
  created_at: string | null;
  /** `date` (`AAAA-MM-DD`) -- referencia para "colgada" cuando
   *  `estado='En ejecución'`, y para "arranca pronto" cuando `Calculada`. */
  fecha_inicio_planeada: string | null;
}

interface ItemAplicacionColgada {
  id: string;
  nombre: string;
  dias: number;
  estadoTexto: 'en ejecución' | 'en estado Calculada';
  /** `AAAA-MM-DD` desde la que corre el conteo de `dias`. */
  fechaReferencia: string;
}

interface ItemAplicacionArrancaPronto {
  id: string;
  nombre: string;
  dias: number;
  fechaInicio: string;
}

/** Mismos umbrales que ya usa el tablero actual para "aplicación atascada"
 *  (`Dashboard.tsx`, sección de alertas cross-módulo) -- no son nuevos, se
 *  reutilizan literalmente. Ninguno es configurable todavía: es la Ola 3 del
 *  plan (§10, "los umbrales... son decisiones del dueño, no del código") la
 *  que los mueve a una tabla de configuración. */
const UMBRAL_COLGADA_CALCULADA_DIAS = 7;
const UMBRAL_COLGADA_EJECUCION_DIAS = 14;

/** Ventana hacia adelante para "arranca pronto". Reutiliza el mismo
 *  horizonte de una semana que `UMBRAL_COLGADA_CALCULADA_DIAS` -- no es un
 *  umbral nuevo inventado para este caso, es el único que el tablero ya
 *  reconoce para aplicaciones `Calculada`. Pendiente de confirmación
 *  explícita del dueño en la Ola 3, igual que los otros dos. */
const VENTANA_ARRANCA_PRONTO_DIAS = 7;

/** Separa las aplicaciones en "colgadas" (ya cruzaron el umbral de espera) y
 *  "arrancan pronto" (`Calculada`, con inicio planeado dentro de la ventana).
 *  Una aplicación colgada NUNCA aparece también como "arranca pronto": si ya
 *  se pasó del umbral es que debió arrancar y no lo hizo, avisar que
 *  "arranca en N días" sería literalmente falso. */
export function derivarAplicacionesParaDecision(
  aplicaciones: readonly AplicacionParaDecision[],
  hoy: string,
): { colgadas: readonly ItemAplicacionColgada[]; arrancanPronto: readonly ItemAplicacionArrancaPronto[] } {
  const colgadas: ItemAplicacionColgada[] = [];
  const arrancanPronto: ItemAplicacionArrancaPronto[] = [];

  for (const a of aplicaciones) {
    if (a.estado === 'En ejecución') {
      if (!a.fecha_inicio_planeada) continue;
      const dias = diasEntre(a.fecha_inicio_planeada, hoy);
      if (dias > UMBRAL_COLGADA_EJECUCION_DIAS) {
        colgadas.push({
          id: a.id,
          nombre: a.nombre,
          dias,
          estadoTexto: 'en ejecución',
          fechaReferencia: a.fecha_inicio_planeada,
        });
      }
      continue;
    }

    // estado === 'Calculada'
    let yaColgada = false;
    if (a.created_at) {
      const creadaLocal = fechaLocalDeTimestamp(a.created_at);
      const diasCreada = diasEntre(creadaLocal, hoy);
      if (diasCreada > UMBRAL_COLGADA_CALCULADA_DIAS) {
        colgadas.push({
          id: a.id,
          nombre: a.nombre,
          dias: diasCreada,
          estadoTexto: 'en estado Calculada',
          fechaReferencia: creadaLocal,
        });
        yaColgada = true;
      }
    }

    if (!yaColgada && a.fecha_inicio_planeada) {
      const diasHasta = diasEntre(hoy, a.fecha_inicio_planeada);
      if (diasHasta >= 0 && diasHasta <= VENTANA_ARRANCA_PRONTO_DIAS) {
        arrancanPronto.push({ id: a.id, nombre: a.nombre, dias: diasHasta, fechaInicio: a.fecha_inicio_planeada });
      }
    }
  }

  return { colgadas, arrancanPronto };
}

export interface FilaAplicacionTexto {
  titulo: string;
  contexto: string;
  /** `null` cuando la fila agrupa más de una aplicación: no hay un único
   *  destino "Ir al cierre" que sea correcto para las dos, así que el botón
   *  navega a la lista general en vez de inventar cuál elegir. */
  aplicacionId: string | null;
}

export function construirFilaAplicacionesColgadas(items: readonly ItemAplicacionColgada[]): FilaAplicacionTexto | null {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const it = items[0];
    return {
      titulo: `'${it.nombre}' lleva ${pluralDias(it.dias)} ${it.estadoTexto}`,
      contexto: `Desde el ${formatearFechaLarga(it.fechaReferencia)}.`,
      aplicacionId: it.id,
    };
  }

  const mismoDias = items.every((it) => it.dias === items[0].dias);
  const mismoEstado = items.every((it) => it.estadoTexto === items[0].estadoTexto);
  const nombres = formatearListaConY(items.map((it) => it.nombre));

  if (mismoDias && mismoEstado) {
    return {
      titulo: `${items.length} aplicaciones llevan ${pluralDias(items[0].dias)} ${items[0].estadoTexto}`,
      contexto: `${nombres}, ${items.length === 2 ? 'ambas' : 'todas'} desde el ${formatearFechaLarga(items[0].fechaReferencia)}.`,
      aplicacionId: null,
    };
  }

  return {
    titulo: `${items.length} aplicaciones sin cerrar`,
    contexto: items.map((it) => `${it.nombre} (${pluralDias(it.dias)})`).join(' · '),
    aplicacionId: null,
  };
}

export function construirFilaAplicacionesArrancanPronto(
  items: readonly ItemAplicacionArrancaPronto[],
): FilaAplicacionTexto | null {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const it = items[0];
    return {
      titulo: it.dias === 0 ? `'${it.nombre}' arranca hoy` : `'${it.nombre}' arranca en ${pluralDias(it.dias)}`,
      contexto: `Calculada · inicio planeado el ${formatearFechaLarga(it.fechaInicio)}.`,
      aplicacionId: it.id,
    };
  }

  const mismoDias = items.every((it) => it.dias === items[0].dias);
  const nombres = formatearListaConY(items.map((it) => it.nombre));

  if (mismoDias) {
    return {
      titulo:
        items[0].dias === 0
          ? `${items.length} aplicaciones arrancan hoy`
          : `${items.length} aplicaciones arrancan en ${pluralDias(items[0].dias)}`,
      contexto: `${nombres}.`,
      aplicacionId: null,
    };
  }

  return {
    titulo: `${items.length} aplicaciones arrancan pronto`,
    contexto: items.map((it) => `${it.nombre} (${formatearFechaLarga(it.fechaInicio)})`).join(' · '),
    aplicacionId: null,
  };
}

// ============================================================================
// 1.4 · Gastos pendientes de confirmar
// ============================================================================

export interface GastoPendienteParaDecision {
  valor: number;
}

export interface FilaGastosTexto {
  titulo: string;
  contexto: string;
}

/** Cero gastos pendientes es el caso REAL de hoy (2026-08-17) -- no es "sin
 *  dato", es un cero genuino, y por eso el resultado es `null` (la fila
 *  simplemente no aparece) igual que cualquier otro cero real en este
 *  módulo. Distinto de "la consulta falló", que el hook maneja aparte. */
export function construirFilaGastosPendientes(gastos: readonly GastoPendienteParaDecision[]): FilaGastosTexto | null {
  if (gastos.length === 0) return null;

  const total = gastos.reduce((acc, g) => acc + (Number(g.valor) || 0), 0);
  const titulo = gastos.length === 1 ? '1 gasto pendiente de confirmar' : `${gastos.length} gastos pendientes de confirmar`;

  return {
    titulo,
    contexto: `$${formatCompact(total)} registrados y todavía sin confirmar.`,
  };
}
