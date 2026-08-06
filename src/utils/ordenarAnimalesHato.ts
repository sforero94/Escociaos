// ARCHIVO: utils/ordenarAnimalesHato.ts
// DESCRIPCIÓN: Ordenamiento A-Z de las columnas de la lista de Animales
// (`AnimalesList.tsx`, Figma alignment spec §4) -- extraído como lógica
// pura para poder probarlo (TDD), en vez de vivir embebido en el
// componente. Reglas: columnas numéricas comparan numéricamente, texto por
// `localeCompare('es', { sensitivity: 'base' })` (acento/mayúscula
// insensible -- hay fichas cargadas en minúscula, ver CLAUDE.md "errores de
// datos encontrados de paso"), y CUALQUIER valor ausente (`null`) va SIEMPRE
// al final, sea cual sea la dirección -- nunca se trata "sin dato" como el
// valor más chico o más grande según convenga al clic actual.
//
// `ordenarPorValor` (S2, ronda agosto 2026, T2) es la extracción GENÉRICA de
// ese mismo mecanismo -- toda tabla del módulo que muestre nombres de
// animales (ChequeoDetalle, PesajeSemanalGrid, AlertasView, PajillasView,
// RankingVacas...) la reusa con su propio extractor en vez de reimplementar
// el comparador. `ordenarAnimalesHato` (specific a `AnimalHatoDerivado`,
// preexistente) queda como un caso particular montado sobre ella -- un solo
// ordenador en el módulo, nunca un segundo.

import { chipEstadoReproductivo } from './hatoUi';
import type { AnimalHatoDerivado } from '@/components/hato/hooks/useHatoAnimales';

export type ColumnaOrdenableAnimales = 'numero' | 'nombre' | 'estado' | 'pl' | 'proximo';
export type DireccionOrdenAnimales = 'asc' | 'desc';

/** Comparador base compartido: numéricas por valor, texto por
 * `localeCompare` español case/acento-insensible, `null`/`undefined` SIEMPRE
 * al final sea cual sea la dirección. Genérico en `T` para que cualquier
 * tabla del módulo pueda ordenar su propio tipo de fila con un extractor
 * propio, sin duplicar el comparador. */
export function ordenarPorValor<T>(
  items: readonly T[],
  extractor: (item: T) => string | number | null | undefined,
  direccion: DireccionOrdenAnimales,
): T[] {
  const signo = direccion === 'asc' ? 1 : -1;
  return [...items].sort((x, y) => {
    const vx = extractor(x);
    const vy = extractor(y);
    if (vx == null && vy == null) return 0;
    if (vx == null) return 1; // null/undefined siempre al final, sea asc o desc
    if (vy == null) return -1;
    if (typeof vx === 'number' && typeof vy === 'number') return (vx - vy) * signo;
    return String(vx).localeCompare(String(vy), 'es', { sensitivity: 'base' }) * signo;
  });
}

/** Fecha objetivo cruda (ISO) del "próximo evento" -- SOLO para ordenar por
 * fecha real, nunca por el texto ya formateado ("Parto: ..."/"Secar:
 * ..."), que mezclaría los dos tipos de evento alfabéticamente en vez de
 * cronológicamente. */
function proximoEventoFecha(animal: AnimalHatoDerivado): string | null {
  return animal.derivado.fecha_probable_parto ?? animal.derivado.fecha_secar ?? null;
}

const EXTRACTORES: Record<ColumnaOrdenableAnimales, (a: AnimalHatoDerivado) => string | number | null> = {
  numero: (a) => a.numero,
  nombre: (a) => a.nombre,
  estado: (a) => chipEstadoReproductivo(a.derivado.estado).label,
  pl: (a) => a.pl,
  proximo: (a) => proximoEventoFecha(a),
};

export function ordenarAnimalesHato(
  animales: AnimalHatoDerivado[],
  columna: ColumnaOrdenableAnimales,
  direccion: DireccionOrdenAnimales,
): AnimalHatoDerivado[] {
  return ordenarPorValor(animales, EXTRACTORES[columna], direccion);
}
