// ARCHIVO: utils/hatoUi.ts
// DESCRIPCIÓN: Fuente única de la paleta de chips semánticos del módulo
// Hato Lechero (plan docs/plan_hato_lechero_module.md §7.6, "Chips/badges de
// estado semánticos" -- precedente `clasificarGravedad` en
// calculosMonitoreo.ts). Traduce los estados YA calculados por el motor
// puro (`EstadoReproductivo` de calculosHato.ts, `ClasificacionFilaDiff` de
// importHato/diffChequeo.ts) a `{ label, className }` -- nunca al revés:
// este archivo no decide NINGÚN umbral ni fecha, solo colorea lo que el
// motor ya decidió.
//
// Paleta fija (plan §7.6): verde = saludable/confirmado/en leche, ámbar =
// requiere atención pronto, azul = en progreso, gris = neutro/inactivo,
// rojo = vencido/urgente/destructivo.
//
// Scoped al módulo hato: envuelve `src/components/ui/badge.tsx` sin
// alterarlo (V1 del plan -- los componentes nuevos del mock no tocan
// definiciones globales del sistema de diseño).

import type { EstadoReproductivo, SenalRevisionHato, TipoEstado } from '@/utils/calculosHato';
import type { ClasificacionFilaDiff } from '@/utils/importHato/diffChequeo';
import type { CategoriaHato, SubetapaTernera } from '@/utils/hatoCategorias';
import type { EstadoAlertaHato } from '@/utils/hatoAlertas';
import type { VejezPesajes } from '@/utils/hatoProduccion';
import { formatShortDate } from '@/utils/format';

export interface ChipEstilo {
  label: string;
  className: string;
  /** Tooltip opcional (`title` nativo) -- solo para chips cuya etiqueta
   * corta necesita una aclaración (ej. "N.º provisional" no es
   * autoexplicativo). La mayoría de los chips no lo necesitan. */
  title?: string;
}

const VERDE = 'bg-green-50 text-green-700 border-green-200';
const AMBAR = 'bg-amber-50 text-amber-700 border-amber-200';
const AZUL = 'bg-blue-50 text-blue-700 border-blue-200';
const GRIS = 'bg-gray-100 text-gray-600 border-gray-200';
const ROJO = 'bg-red-50 text-red-700 border-red-200';

/**
 * Chip para `EstadoReproductivo` (lista del hato, hoja de vida).
 *
 * **D-D (dueño, 2026-08-13): el vocabulario visible es de CINCO estados** --
 * Vacía · Servida · Confirmada · Por secar · Seca -- y esta función es
 * donde los 13 estados internos del motor se traducen a esos cinco. Las
 * equivalencias que no son 1:1, y por qué:
 *
 * - `parida_reciente` -> **Vacía**. Parió y todavía no la sirven: está
 *   vacía. La fecha del parto se muestra en su propia columna, así que no
 *   se pierde nada al no repetirla en el estado.
 * - `novilla` -> **Vacía**. Nunca entró al ciclo; "vacía" es exactamente su
 *   situación. La pestaña Novillas ya la separa por etapa.
 * - `preñada` -> **Confirmada**. El motor solo devuelve `preñada` cuando la
 *   confirmación vino de una palpación (`estadoDeConfirmacion`); una
 *   presunción ya sale de ahí como `servida`.
 * - `cria` -> **Cría**, y NO uno de los cinco: una ternera no tiene estado
 *   reproductivo, y rotularla "Vacía" sería absurdo. El vocabulario de D-D
 *   aplica a novillas y vacas.
 * - `indeterminado` -> **guion**, no un estado inventado. Hay un evento que
 *   el motor no puede clasificar, así que el estado es genuinamente
 *   desconocido; el porqué viaja en `chipSenalRevision`, que se muestra en
 *   la columna de alertas. Misma regla que rige todo el módulo: sin dato se
 *   escribe "—", nunca un valor por defecto.
 */
export function chipEstadoReproductivo(estado: EstadoReproductivo): ChipEstilo {
  switch (estado) {
    case 'preñada':
      return { label: 'Confirmada', className: VERDE, title: 'Preñez confirmada por palpación' };
    case 'parida_reciente':
      return { label: 'Vacía', className: AMBAR, title: 'Parió y todavía no ha sido servida' };
    case 'servida':
      return { label: 'Servida', className: AZUL, title: 'Montada o inseminada, preñez sin confirmar por palpación' };
    case 'proxima_a_secar':
      return { label: 'Por secar', className: AMBAR };
    case 'seca':
      return { label: 'Seca', className: GRIS };
    case 'vacia_por_servir':
      return { label: 'Vacía', className: AMBAR };
    case 'novilla':
      return { label: 'Vacía', className: AMBAR, title: 'Novilla: todavía no ha entrado al ciclo reproductivo' };
    case 'cria':
      return { label: 'Cría', className: GRIS };
    case 'indeterminado':
      return { label: '—', className: GRIS, title: 'Sin dato: hay un evento posterior sin clasificar — ver la señal de revisión' };
    case 'vendida':
      return { label: 'Vendida', className: GRIS };
    case 'muerta':
      return { label: 'Muerta', className: GRIS };
    case 'descartada':
      return { label: 'Descartada', className: GRIS };
    default: {
      const _exhaustivo: never = estado;
      return { label: String(_exhaustivo), className: GRIS };
    }
  }
}

/**
 * Chip de la **columna de señales** de la lista del hato (D-D, 2026-08-13:
 * "5 estados + columna de alertas que digan cuál — si es aborto o algo
 * diferente"). `null` = nada que revisar, la celda queda vacía.
 *
 * Deliberadamente separado de `chipEstadoReproductivo`: el estado dice en
 * qué punto del ciclo está la vaca, la señal dice por qué ese dato puede no
 * ser confiable. Meter las dos cosas en una sola etiqueta obligaría a
 * mentir en uno de los dos ejes.
 */
export function chipSenalRevision(senal: SenalRevisionHato | null): ChipEstilo | null {
  if (!senal) return null;
  if (senal.tipo === 'aborto') {
    return {
      label: `Aborto ${formatShortDate(senal.fecha)}`,
      className: ROJO,
      title: 'El último evento registrado es un aborto: la vaca quedó vacía',
    };
  }
  return {
    label: 'Revisar',
    className: AMBAR,
    title: `Hay un evento del ${formatShortDate(senal.fecha)} que el sistema no puede clasificar. Registra qué pasó para que el estado vuelva a ser confiable.`,
  };
}

/** Chip para "¿esta vacía es normal o un problema?" (D-2/V14). `null` =
 * sin señal disponible (no aplica o no hay dato) -- nunca se colorea como
 * si fuera un hecho. */
export function chipVaciaEsProblema(vaciaEsProblema: boolean | null): ChipEstilo | null {
  if (vaciaEsProblema === null) return null;
  return vaciaEsProblema
    ? { label: 'Requiere rechequeo', className: ROJO }
    : { label: 'Vacía normal', className: VERDE };
}

/** Chip para "próxima a reemplazo" (A7/V9). */
export function chipProximaAReemplazo(): ChipEstilo {
  return { label: 'Próxima a reemplazo', className: AMBAR };
}

/** Chip para una chapeta provisional (900-999, `esNumeroProvisional`). Migración
 * 066 (`numero` es atributo mutable, no identidad): el tooltip aclara que no
 * es una caravana física para que nadie salga a buscarla en el potrero. */
export function chipNumeroProvisional(): ChipEstilo {
  return {
    label: 'provisional',
    className: AMBAR,
    title: 'Número de trabajo, pendiente de retag — no es la caravana física',
  };
}

/** Chip para la clasificación de una fila del diff de chequeo (B0/V10). */
export function chipClasificacionDiff(clasificacion: ClasificacionFilaDiff): ChipEstilo {
  switch (clasificacion) {
    case 'nuevo':
      return { label: 'Nuevo', className: AZUL };
    case 'cambio':
      return { label: 'Cambio', className: AMBAR };
    case 'sin_cambio':
      return { label: 'Sin cambio', className: GRIS };
    case 'no_reconocido':
      return { label: 'No reconocido', className: ROJO };
    default: {
      const _exhaustivo: never = clasificacion;
      return { label: String(_exhaustivo), className: GRIS };
    }
  }
}

/** `fechaISO - hoyISO` en días enteros, matemática de día simple en UTC
 * (mismo criterio que la `diferenciaDias` interna de calculosHato.ts -- no
 * se puede importar esa función porque no está exportada, así que se
 * duplica la FÓRMULA, nunca el criterio: comparar por componentes de fecha,
 * no por `Date` con huso horario). Positivo = `fechaISO` es futura;
 * negativo = ya pasó. */
function diasHastaFecha(fechaISO: string, hoyISO: string): number {
  const [ah, mh, dh] = hoyISO.split('-').map(Number);
  const [af, mf, df] = fechaISO.split('-').map(Number);
  const hoy = Date.UTC(ah, mh - 1, dh);
  const fecha = Date.UTC(af, mf - 1, df);
  return Math.round((fecha - hoy) / 86400000);
}

/** Pill de urgencia por días restantes hasta `fechaISO` (p. ej. SECAR o PP),
 * comparado contra `hoyISO` (ambos `YYYY-MM-DD`). Solo colorea una
 * diferencia de días ya calculada -- NO decide ningún umbral de negocio
 * (esos viven en `calculosHato.ts`/`hato_config`); `umbralUrgenteDias` es un
 * corte puramente visual (ámbar vs. gris), no un parámetro del motor.
 * Vencido (rojo) si `fechaISO` ya pasó; "Hoy" (ámbar) si es hoy; ámbar si
 * faltan <= `umbralUrgenteDias` días; gris si falta más. */
export function chipDiasRestantes(fechaISO: string, hoyISO: string, umbralUrgenteDias = 7): ChipEstilo {
  const dias = diasHastaFecha(fechaISO, hoyISO);
  if (dias < 0) return { label: 'Vencido', className: ROJO };
  if (dias === 0) return { label: 'Hoy', className: AMBAR };
  if (dias <= umbralUrgenteDias) return { label: `${dias} d`, className: AMBAR };
  return { label: `${dias} d`, className: GRIS };
}

/** Pill para un signal que el caller YA sabe que está vencido (p. ej.
 * "rechequeo pendiente": la vista no expone una fecha de vencimiento, solo
 * `ultimo_chequeo_fecha` en el pasado -- el motor ya decidió que el umbral
 * se cumplió). Siempre rojo; `diasTranscurridos` es solo informativo
 * (`null` cuando no hay fecha ancla, nunca se inventa un número). */
export function chipVencimiento(diasTranscurridos: number | null): ChipEstilo {
  return {
    label: diasTranscurridos != null ? `Vencido (${diasTranscurridos} d)` : 'Vencido',
    className: ROJO,
  };
}

/** Chip para `hato_chequeo_vacas.estado` (`parseEstado`, migración 062) --
 * columna ESTADO/OBS normalizada del detalle de chequeo (§5 del Figma
 * spec). `'vacio'` no debería llegar a la BD (el import escribe `NULL`
 * cuando la celda está vacía, ver migración 062) pero se cubre para que el
 * switch siga exhaustivo. */
export function chipTipoEstado(estado: TipoEstado): ChipEstilo {
  switch (estado) {
    case 'vacia_apta':
      return { label: 'Vacía apta', className: VERDE };
    case 'vacia_problema':
      return { label: 'Vacía problema', className: ROJO };
    case 'fecha_heredada':
      return {
        label: 'Fecha heredada',
        className: GRIS,
        title: 'La celda ESTADO/OBS trae una fecha de un ciclo reproductivo anterior, no un código',
      };
    case 'desconocido':
      return { label: 'Desconocido', className: AMBAR, title: 'Código no reconocido en la planilla' };
    case 'vacio':
      return { label: 'Sin dato', className: GRIS };
    default: {
      const _exhaustivo: never = estado;
      return { label: String(_exhaustivo), className: GRIS };
    }
  }
}

/** Chip para `hato_tratamientos.estado` (migración 055). */
export function chipEstadoTratamiento(estado: 'activo' | 'completado' | 'cancelado'): ChipEstilo {
  switch (estado) {
    case 'activo':
      return { label: 'Activo', className: AZUL };
    case 'completado':
      return { label: 'Completado', className: VERDE };
    case 'cancelado':
      return { label: 'Cancelado', className: GRIS };
    default: {
      const _exhaustivo: never = estado;
      return { label: String(_exhaustivo), className: GRIS };
    }
  }
}

/** Chip para el estado de una fila de `hato_alertas` (S6/V11, cola de
 * alertas -- `AlertasView.tsx`). Verde = ya resuelta a favor (confirmada),
 * ámbar = en curso normal (pendiente/enviada), azul = requiere lectura de
 * Martha (respondida), rojo = requiere decisión urgente (escalada), gris =
 * cerrada sin acción positiva (descartada/expirada). */
export function chipEstadoAlerta(estado: EstadoAlertaHato): ChipEstilo {
  switch (estado) {
    case 'pendiente':
      return { label: 'Pendiente', className: AMBAR };
    case 'enviada':
      return { label: 'Enviada', className: AMBAR };
    case 'respondida':
      return { label: 'Respondida', className: AZUL };
    case 'confirmada':
      return { label: 'Confirmada', className: VERDE };
    case 'descartada':
      return { label: 'Descartada', className: GRIS };
    case 'escalada':
      return { label: 'Escalada', className: ROJO };
    case 'expirada':
      return { label: 'Expirada', className: GRIS };
    default: {
      const _exhaustivo: never = estado;
      return { label: String(_exhaustivo), className: GRIS };
    }
  }
}

/** Chip de advertencia para el stock de un lote de pajillas (G3, S10). `null`
 * = stock positivo, no se muestra ningún chip. Nunca bloquea registrar un
 * uso nuevo cuando llega a 0 o negativo (Épica G, "es más importante que
 * quede el evento reproductivo que la exactitud del conteo") -- este chip
 * solo informa. */
export function chipStockPajillas(cantidadActual: number): ChipEstilo | null {
  if (cantidadActual > 0) return null;
  return {
    label: cantidadActual < 0 ? `Stock negativo (${cantidadActual})` : 'Sin stock',
    className: AMBAR,
    title: 'El conteo no bloquea registrar un uso nuevo — prioriza que quede el evento reproductivo.',
  };
}

/** Chip PERMANENTE de vejez del pesaje semanal (decisión 17 del dueño, plan
 * `docs/plan_hato_produccion_rework.md` §4.2d/§4.3/§6 SOW 5) -- se muestra
 * SIEMPRE en el tablero de Producción, no solo cuando hay backlog. Solo
 * colorea/formatea el nivel que YA decidió `vejezPesajes` (`hatoProduccion.ts`,
 * `ok` <= 1 semana · `atrasado` 2-3 · `critico` >= 4); riesgo R-7. */
export function chipVejezPesajes(vejez: VejezPesajes): ChipEstilo {
  if (vejez.ultimaFecha === null || vejez.semanas === null) {
    return {
      label: 'Sin pesajes registrados',
      className: ROJO,
      title: 'Nunca se ha registrado un pesaje semanal para el hato.',
    };
  }
  const clase = vejez.nivel === 'ok' ? VERDE : vejez.nivel === 'atrasado' ? AMBAR : ROJO;
  const relativo = vejez.semanas <= 0 ? 'esta semana' : `hace ${vejez.semanas} semana${vejez.semanas === 1 ? '' : 's'}`;
  return {
    label: `Último pesaje: ${relativo} (${formatShortDate(vejez.ultimaFecha)})`,
    className: clase,
  };
}

/** Chip para el subgrupo contable de una ternera (D-13, S6, ronda agosto
 * 2026): leche (0-3 meses) / concentrado (3-12 meses) -- Santiago los quiere
 * poder contar por separado para proyectar consumo de concentrado más
 * adelante. `null` = la edad no se pudo calcular (`fecha_nacimiento`
 * ausente o mala): NUNCA se muestra como "leche" ni se omite -- es su
 * propio balde ("sin dato de edad"), misma regla de "ausencia de dato ≠ 0"
 * del módulo. Solo tiene sentido para animales cuya `categoria` YA es
 * `'ternera'` (mismo `subetapaTernera` que decidió esa categoría, nunca un
 * segundo cálculo -- así el chip nunca puede contradecir la pestaña). */
export function chipSubetapaTernera(subetapa: SubetapaTernera | null): ChipEstilo {
  if (subetapa === null) {
    return {
      label: 'Sin dato de edad',
      className: AMBAR,
      title: 'No se pudo calcular la edad (falta fecha de nacimiento o no es válida) -- no se asume leche ni concentrado.',
    };
  }
  return subetapa === 'leche'
    ? { label: 'Leche (0-3 m)', className: AZUL }
    : { label: 'Concentrado (3-12 m)', className: GRIS };
}

/** Chip para las 4 categorías de inventario (terneras/novillas/hato/horro). */
export function chipCategoriaHato(categoria: CategoriaHato): ChipEstilo {
  switch (categoria) {
    case 'ternera':
      return { label: 'Ternera', className: AZUL };
    case 'novilla':
      return { label: 'Novilla', className: AMBAR };
    case 'hato':
      return { label: 'En ordeño', className: VERDE };
    case 'horro':
      return { label: 'Horro (seca)', className: GRIS };
    default: {
      const _exhaustivo: never = categoria;
      return { label: String(_exhaustivo), className: GRIS };
    }
  }
}
