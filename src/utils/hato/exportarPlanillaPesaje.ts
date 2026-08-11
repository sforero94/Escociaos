// ARCHIVO: utils/hato/exportarPlanillaPesaje.ts
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md`, punto 1 -- el PDF
// de la planilla MENSUAL de pesaje en blanco. Es lo de mayor valor de la
// sesión: evita que la planilla se desactualice (la de junio traía CHISPA y
// DACOTA -- vendidas hace rato -- y le faltaba VICTORIA, escrita a mano al
// final por Martha) porque se genera a demanda desde el roster VIGENTE.
//
// Contrato del roster: lo decide `esCandidataRosterPesaje`
// (`utils/importHato/ocrPesaje.ts`) -- todas las vacas activas + las novillas
// activas con servicio registrado (decisión del dueño, 2026-08-11). Ese
// predicado vive allá, y no acá, porque es el único módulo que se espeja a
// los dos árboles de servidor: el PDF, el roster del OCR y la revalidación
// del commit TIENEN que coincidir, y con tres copias del criterio no
// coincidirían por mucho tiempo. Orden ALFABÉTICO (T2/S2, `ordenarPorValor`
// de `utils/ordenarAnimalesHato.ts` -- Martha ubica por nombre, no por
// número; un segundo comparador NO se escribe acá).
//
// D-9 (decisión del dueño): SIEMPRE 5 columnas de semana, cada una con
// sub-columnas AM y PM. La de junio traía 4 y los meses de 5 miércoles (ej.
// julio 2026) se desbordaban. Las fechas de cada semana salen de
// `fechasPesajeMensuales` (`calculosHato.ts`) sobre
// `hato_config.dia_pesaje_semanal` -- nunca un miércoles hardcodeado; un mes
// con solo 4 ocurrencias imprime la 5ª columna vacía/sin fecha, nunca una
// fecha inventada.
//
// La tercera sub-columna `Total` de REFERENCIA que traía la primera versión
// se RETIRÓ el 2026-08-11 a pedido del dueño: nunca se leyó del papel
// (`litros_total` siempre se deriva de AM+PM) y solo ocupaba ancho.
//
// Este archivo es PURO -- prepara título y filas. La construcción real del
// documento (jsPDF + autoTable, inyectadas) vive en el archivo hermano
// `exportarPlanillaPesajePDF.ts`, mismo split que
// `exportarPlanillaChequeo(PDF).ts`.

import { fechasPesajeMensuales } from '@/utils/calculosHato';
import { ordenarPorValor } from '@/utils/ordenarAnimalesHato';
import { SEMANAS_PESAJE, type SemanaPesaje } from '@/utils/importHato/ocrPesaje';

// ----------------------------------------------------------------------------
// 1. Roster -- vaca en ordeño vigente, orden alfabético.
// ----------------------------------------------------------------------------

/** Lo mínimo que necesita la planilla: nombre (ancla única, D-1 -- esta
 * planilla nunca llevó chapeta) y el `id` para que el flujo de foto (S5,
 * punto 2) pueda enlazar cada fila impresa a su animal desde el momento en
 * que se genera el roster de ida y vuelta. */
export interface AnimalPlanillaPesaje {
  id: string;
  nombre: string;
}

/** Orden alfabético de la planilla -- reusa el comparador genérico de S2
 * (`ordenarPorValor`), nunca un segundo `localeCompare` inline. */
export function ordenarRosterPesaje(animales: readonly AnimalPlanillaPesaje[]): AnimalPlanillaPesaje[] {
  return ordenarPorValor(animales, (a) => a.nombre, 'asc');
}

// ----------------------------------------------------------------------------
// 2. Título + fechas de cada columna de semana.
// ----------------------------------------------------------------------------

const MESES_TITULO = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const;

/** `"PLANILLA DE PESAJE <MES> <AÑO>"` -- mismo criterio de mayúsculas que
 * `construirTituloHojaChequeo` (`exportarPlanillaChequeo.ts`), sin acoplarse
 * a ese archivo (cada flujo de foto del módulo mantiene su propio
 * formateador de título, mismo precedente que `hato-liquidacion-pomar.ts`
 * frente a `ocrChequeo.ts`). */
export function construirTituloPlanillaPesaje(anio: number, mes: number): string {
  return `PLANILLA DE PESAJE ${MESES_TITULO[mes - 1]} ${anio}`;
}

/** Fecha ISO `AAAA-MM-DD` -> `D/M` corto, para el sub-encabezado de cada
 * columna de semana (ej. "5/7"). `null` cuando esa semana no tiene una
 * ocurrencia real ese mes -- nunca una fecha inventada. */
export function fechaCortaColumna(fechaIso: string | null): string | null {
  if (!fechaIso) return null;
  const [, mm, dd] = fechaIso.split('-');
  return `${parseInt(dd, 10)}/${parseInt(mm, 10)}`;
}

/** Las 5 fechas de pesaje del mes, indexadas 1..5 -- `null` en la posición
 * que ese mes no tiene (mes de 4 miércoles). Envuelve
 * `fechasPesajeMensuales` (`calculosHato.ts`) para devolver la forma
 * indexada por semana que consume el resto de este módulo. */
export function fechasPorSemanaDelMes(anio: number, mes: number, diaPesajeIso: number): Record<SemanaPesaje, string | null> {
  const fechas = fechasPesajeMensuales(anio, mes, diaPesajeIso);
  const salida = {} as Record<SemanaPesaje, string | null>;
  for (const semana of SEMANAS_PESAJE) {
    salida[semana] = fechas[semana - 1] ?? null;
  }
  return salida;
}
