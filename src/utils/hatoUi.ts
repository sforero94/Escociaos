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

import type { EstadoReproductivo } from '@/utils/calculosHato';
import type { ClasificacionFilaDiff } from '@/utils/importHato/diffChequeo';
import type { CategoriaHato } from '@/utils/hatoCategorias';

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
