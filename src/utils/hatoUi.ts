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
// rojo = vencido/urgente/destructivo. Clases verificadas contra
// `src/index.css` (build de Tailwind congelado, CLAUDE.md "Caution Zones") --
// nunca `amber-300`/`amber-800`, que no existen en ese build.
//
// Scoped al módulo hato: envuelve `src/components/ui/badge.tsx` sin
// alterarlo (V1 del plan -- los componentes nuevos del mock no tocan
// definiciones globales del sistema de diseño).

import type { EstadoReproductivo, TipoEstado } from '@/utils/calculosHato';
import type { ClasificacionFilaDiff } from '@/utils/importHato/diffChequeo';
import type { CategoriaHato } from '@/utils/hatoCategorias';
import type { EstadoAlertaHato } from '@/utils/hatoAlertas';

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

/** Chip para `EstadoReproductivo` (lista del hato, hoja de vida). */
export function chipEstadoReproductivo(estado: EstadoReproductivo): ChipEstilo {
  switch (estado) {
    case 'preñada':
      return { label: 'Preñada', className: VERDE };
    case 'parida_reciente':
      return { label: 'Parida reciente', className: VERDE };
    case 'servida':
      return { label: 'Servida', className: AZUL };
    case 'proxima_a_secar':
      return { label: 'Próxima a secar', className: AMBAR };
    case 'seca':
      return { label: 'Seca (horro)', className: GRIS };
    case 'vacia_por_servir':
      return { label: 'Vacía por servir', className: AMBAR };
    case 'novilla':
      return { label: 'Novilla', className: AZUL };
    case 'cria':
      return { label: 'Cría', className: GRIS };
    case 'indeterminado':
      return { label: 'Indeterminado — revisar', className: AMBAR };
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
