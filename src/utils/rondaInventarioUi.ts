// ARCHIVO: utils/rondaInventarioUi.ts
// DESCRIPCIÓN: Piezas PURAS del historial web de la ronda de inventario
// (Fase 6, docs/brief_tecnico_verificacion_inventario.md §9, D-T10). Todo lo
// que decide CÓMO se ve un estado vive acá, no repetido inline en
// RondasList.tsx/RondaDetalle.tsx -- el mismo criterio que
// calculosMonitoreo.ts (`clasificarGravedad`) o calculosGanado.ts.
//
// EL CONTRATO QUE NO ES NEGOCIABLE (CA-10, docs/plan_verificacion_inventario.md §7):
// los tres desenlaces terminales de una excepción --
//   1. `cerrada_sin_ajuste`  ("no pasó nada")
//   2. `resuelta_con_captura` ("pasó algo y ya se sabe qué fue")
//   3. el trío `ajuste_aprobado` / `ajuste_aplicado` / `ajuste_desestimado`
//      ("pasó algo que nadie puede explicar y Gerencia lo asumió, o lo
//      desestimó")
// tienen que renderizarse visualmente distintos y NUNCA fundirse en ningún
// resumen ni agrupación. `GRUPO_DESENLACE_POR_ESTADO` es la única fuente de
// verdad de a qué familia pertenece cada uno de los 9 valores del enum
// `estado_excepcion_inventario`; `calcularResumenDesenlaces` agrega sin
// fundir; `ESTADO_EXCEPCION_INFO` le da a cada estado su propia etiqueta y
// clase de color, y ninguna de las tres familias terminales comparte ninguna
// de las dos (verificado por src/__tests__/rondaInventarioUi.test.ts).
//
// Segundo contrato, transversal al proyecto (R-2/R-3, CA-15/CA-16): un
// producto FUERA del alcance declarado de una ronda se muestra como
// "—"/"no verificado", nunca como conforme ni como 0; uno DENTRO del
// alcance sin excepción es "conforme dentro del alcance declarado", no
// "contado" -- nadie capturó una cifra física para ese producto.

import type { EstadoExcepcionInventario } from '@/types/rondaInventario';

// ---------------------------------------------------------------------------
// Período de la ronda
// ---------------------------------------------------------------------------

/**
 * Formatea `periodo` ('YYYY-MM-DD', siempre el primer día del mes) como
 * "Agosto 2026". Parsea a mano en hora LOCAL en vez de `new Date(string)` --
 * ese constructor interpreta un `YYYY-MM-DD` puro como UTC medianoche, que en
 * Bogotá (UTC-5) puede leerse un día antes y mover el mes/año en el borde
 * (mismo bug documentado en `src/utils/format.ts::parsearFecha`).
 */
export function formatearPeriodoRonda(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  const fecha = new Date(anio, (mes || 1) - 1, 1);
  // Sólo el nombre del mes -- `{month:'long', year:'numeric'}` en es-CO
  // devuelve "agosto de 2026" (con "de"), y el formato pedido es "Agosto 2026".
  const nombreMes = new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(fecha);
  const mesCapitalizado = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
  return `${mesCapitalizado} ${fecha.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Estado de la ronda
// ---------------------------------------------------------------------------

export const ESTADO_RONDA_LABELS = {
  programada: 'Programada',
  en_curso: 'En curso',
  cerrada: 'Cerrada',
  omitida: 'Omitida',
} as const;

export const ESTADO_RONDA_BADGE_CLASS = {
  programada: 'bg-gray-100 text-gray-700 border-gray-200',
  en_curso: 'bg-blue-100 text-blue-700 border-blue-200',
  cerrada: 'bg-muted text-primary border-primary/20',
  omitida: 'bg-red-100 text-red-700 border-red-200',
} as const;

// ---------------------------------------------------------------------------
// Desenlace de una excepción (CA-10)
// ---------------------------------------------------------------------------

/**
 * Las CUATRO familias visuales. `sin_ajuste`/`captura`/`ajuste` son los tres
 * desenlaces TERMINALES de CA-10 -- nunca se funden entre sí. `en_curso`
 * agrupa todo lo que todavía no llegó a un desenlace (no es un cuarto
 * desenlace, es "sin desenlace todavía").
 */
export type GrupoDesenlaceExcepcion = 'sin_ajuste' | 'captura' | 'ajuste' | 'en_curso';

export const GRUPO_DESENLACE_POR_ESTADO: Record<EstadoExcepcionInventario, GrupoDesenlaceExcepcion> = {
  reportada: 'en_curso',
  explicacion_precargada: 'en_curso',
  explicada: 'en_curso',
  cerrada_sin_ajuste: 'sin_ajuste',
  resuelta_con_captura: 'captura',
  ajuste_propuesto: 'en_curso',
  ajuste_aprobado: 'ajuste',
  ajuste_desestimado: 'ajuste',
  ajuste_aplicado: 'ajuste',
};

export interface InfoEstadoExcepcion {
  /** Lo que ve el humano en el badge. */
  etiqueta: string;
  /** Una línea explicando qué significa este estado -- para tooltip/detalle. */
  descripcion: string;
  /** Clases Tailwind del badge. Nunca compartidas entre las tres familias terminales. */
  badgeClassName: string;
  grupo: GrupoDesenlaceExcepcion;
  /** true sólo para los 4 estados que CA-10 llama "desenlaces terminales". */
  esTerminal: boolean;
}

export const ESTADO_EXCEPCION_INFO: Record<EstadoExcepcionInventario, InfoEstadoExcepcion> = {
  reportada: {
    etiqueta: 'Reportada',
    descripcion: 'Uriel la reportó. Todavía no pasó por David (R-6).',
    badgeClassName: 'bg-gray-100 text-gray-600 border-gray-200',
    grupo: 'en_curso',
    esTerminal: false,
  },
  explicacion_precargada: {
    etiqueta: 'Cita de Uriel, sin confirmar',
    descripcion:
      'Precargada del audio de Uriel. No es la palabra de David hasta que la confirme o la corrija (R-6/CA-38).',
    badgeClassName: 'bg-amber-50 text-amber-700 border-amber-200',
    grupo: 'en_curso',
    esTerminal: false,
  },
  explicada: {
    etiqueta: 'Explicada por David',
    descripcion: 'David ya tocó. A la espera de vía: captura directa o aprobación de Santiago.',
    badgeClassName: 'bg-blue-50 text-blue-700 border-blue-200',
    grupo: 'en_curso',
    esTerminal: false,
  },
  cerrada_sin_ajuste: {
    etiqueta: 'Cerrada sin ajuste',
    descripcion: 'El sistema estaba bien: no pasó nada. No mueve inventario.',
    badgeClassName: 'bg-gray-100 text-gray-700 border-gray-300',
    grupo: 'sin_ajuste',
    esTerminal: true,
  },
  ajuste_propuesto: {
    etiqueta: 'Ajuste propuesto',
    descripcion: 'Sin respaldo identificable. A la espera de causa raíz y decisión de Santiago.',
    badgeClassName: 'bg-amber-50 text-amber-700 border-amber-300',
    grupo: 'en_curso',
    esTerminal: false,
  },
  resuelta_con_captura: {
    etiqueta: 'Resuelta con captura',
    descripcion: 'David capturó el movimiento real (vía a, CA-8): pasó algo y ya se sabe qué fue. No pasa por Santiago.',
    badgeClassName: 'bg-sky-100 text-sky-800 border-sky-300',
    grupo: 'captura',
    esTerminal: true,
  },
  ajuste_aprobado: {
    etiqueta: 'Ajuste aprobado — pendiente de aplicar',
    descripcion: 'Santiago aprobó el ajuste (vía b, CA-9) pero todavía no se aplicó al inventario.',
    badgeClassName: 'bg-orange-100 text-orange-800 border-orange-300',
    grupo: 'ajuste',
    esTerminal: false,
  },
  ajuste_desestimado: {
    etiqueta: 'Ajuste desestimado',
    descripcion: 'Santiago revisó la propuesta y la desestimó. No se movió inventario.',
    badgeClassName: 'bg-rose-50 text-rose-700 border-rose-300',
    grupo: 'ajuste',
    esTerminal: true,
  },
  ajuste_aplicado: {
    etiqueta: 'Ajuste aplicado',
    descripcion: 'Pasó algo que nadie puede explicar y Gerencia lo asumió (vía b, CA-9/CA-12).',
    badgeClassName: 'bg-red-100 text-red-800 border-red-300',
    grupo: 'ajuste',
    esTerminal: true,
  },
};

export interface ResumenDesenlaces {
  /** Familia 1 de CA-10: cerrada_sin_ajuste. */
  sinAjuste: number;
  /** Familia 2 de CA-10: resuelta_con_captura. */
  captura: number;
  /** Familia 3 de CA-10, sub-estado: ajuste_aprobado (todavía no aplicado). */
  ajustePendiente: number;
  /** Familia 3 de CA-10, sub-estado: ajuste_aplicado. */
  ajusteAplicado: number;
  /** Familia 3 de CA-10, sub-estado: ajuste_desestimado. */
  ajusteDesestimado: number;
  /** Todo lo que no llegó a un desenlace todavía (reportada/explicacion_precargada/explicada/ajuste_propuesto). */
  enCurso: number;
  total: number;
}

/**
 * Agrega excepciones por desenlace SIN fundir las tres familias de CA-10.
 * `ajustePendiente`/`ajusteAplicado`/`ajusteDesestimado` se devuelven por
 * separado a propósito -- un consumidor que sólo quiera "cuántos ajustes"
 * puede sumarlos, pero nunca al revés: si esta función devolviera un único
 * `ajuste: number`, ya no habría forma de distinguir "Santiago aprobó y
 * quedó pendiente" de "Santiago desestimó", que es justamente la señal que
 * CA-10 protege.
 */
export function calcularResumenDesenlaces(
  excepciones: ReadonlyArray<{ estado: EstadoExcepcionInventario }>,
): ResumenDesenlaces {
  const resumen: ResumenDesenlaces = {
    sinAjuste: 0,
    captura: 0,
    ajustePendiente: 0,
    ajusteAplicado: 0,
    ajusteDesestimado: 0,
    enCurso: 0,
    total: 0,
  };

  for (const { estado } of excepciones) {
    resumen.total += 1;
    switch (estado) {
      case 'cerrada_sin_ajuste':
        resumen.sinAjuste += 1;
        break;
      case 'resuelta_con_captura':
        resumen.captura += 1;
        break;
      case 'ajuste_aprobado':
        resumen.ajustePendiente += 1;
        break;
      case 'ajuste_aplicado':
        resumen.ajusteAplicado += 1;
        break;
      case 'ajuste_desestimado':
        resumen.ajusteDesestimado += 1;
        break;
      default:
        resumen.enCurso += 1;
    }
  }

  return resumen;
}

// ---------------------------------------------------------------------------
// Estado de un producto frente al alcance de la ronda (R-2/R-3, CA-15/CA-16)
// ---------------------------------------------------------------------------

export type EstadoProductoEnRonda = 'conforme' | 'con_excepcion' | 'fuera_de_alcance';

export interface EtiquetaEstadoProducto {
  texto: string;
  className: string;
}

/**
 * R-2/CA-15: un producto dentro del alcance sin excepción es "conforme
 * dentro del alcance declarado" -- nunca "contado", porque nadie capturó una
 * cifra física para él.
 *
 * R-3/CA-16: un producto fuera del alcance declarado se muestra "—"/"no
 * verificado" -- nunca conforme, nunca 0. Es la misma regla que gobierna
 * "sin dato" en monitoreo/hato/clima, aplicada acá.
 */
export function etiquetaEstadoProductoRonda(estado: EstadoProductoEnRonda): EtiquetaEstadoProducto {
  switch (estado) {
    case 'conforme':
      return {
        texto: 'Conforme dentro del alcance declarado',
        className: 'text-primary',
      };
    case 'con_excepcion':
      return {
        texto: 'Con excepción reportada',
        className: 'text-amber-700',
      };
    case 'fuera_de_alcance':
      return {
        texto: '— no verificado (fuera del alcance declarado)',
        className: 'text-gray-400 italic',
      };
  }
}

// ---------------------------------------------------------------------------
// Actor (R-8/CA-12): quién hizo cada paso, resuelto por usuario web o Telegram
// ---------------------------------------------------------------------------

export interface ActorResuelto {
  nombre: string;
  canal: 'web' | 'telegram';
}

/**
 * D-T4/D-T5 del brief técnico: el actor de cada paso viaja como
 * `*_usuario`(uuid pelado a `usuarios`) O `*_telegram`(uuid a
 * `telegram_usuarios`) -- nunca ambos con sentido a la vez, y Uriel no tiene
 * fila en `usuarios`. Esta función sólo RESUELVE el nombre a partir de los
 * mapas ya cargados por el hook -- no hace I/O.
 */
export function resolverActor(
  usuarioId: string | null,
  telegramId: string | null,
  usuariosPorId: ReadonlyMap<string, string>,
  telegramPorId: ReadonlyMap<string, string>,
): ActorResuelto | null {
  if (usuarioId) {
    return { nombre: usuariosPorId.get(usuarioId) ?? 'Usuario desconocido', canal: 'web' };
  }
  if (telegramId) {
    return { nombre: telegramPorId.get(telegramId) ?? 'Usuario de Telegram desconocido', canal: 'telegram' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Observaciones libres (R-16/CA-14) -- forma del JSONB no está fijada por
// ningún RPC todavía (Fase 3, en paralelo). Defensivo por diseño.
// ---------------------------------------------------------------------------

/**
 * `rondas_inventario.observaciones_libres` es `JSONB NOT NULL DEFAULT '[]'`
 * sin esquema fijado -- lo escribe un RPC de una fase que corre en paralelo
 * a ésta. Cada elemento puede ser un string plano o un objeto con `texto`/
 * `observacion`; cualquier otra forma se muestra igual, nunca como
 * `[object Object]` ni hace explotar la pantalla.
 */
export function textoObservacionLibre(item: unknown): string {
  if (item == null) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    if (typeof obj.texto === 'string') return obj.texto;
    if (typeof obj.observacion === 'string') return obj.observacion;
    try {
      return JSON.stringify(item);
    } catch {
      return String(item);
    }
  }
  return String(item);
}
