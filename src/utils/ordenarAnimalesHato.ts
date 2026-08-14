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
import { proximoEventoHato } from '@/utils/hato/listaHato';

export type ColumnaOrdenableAnimales = 'numero' | 'nombre' | 'edad' | 'partos' | 'ultimaCria' | 'estado' | 'pl' | 'proximo';
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
 * cronológicamente.
 *
 * Sale del MISMO `proximoEventoHato` que pinta la celda (N19): si el orden
 * usara su propio criterio, la tabla mostraría un hito y ordenaría por otro.
 * Un hito sin fecha (rechequeo, servir) ordena como ausente -- al final en
 * ambas direcciones, igual que cualquier otro `null`. */
function proximoEventoFecha(animal: AnimalHatoDerivado, hoyISO: string): string | null {
  return proximoEventoHato({ derivado: animal.derivado }, hoyISO)?.fecha ?? null;
}

const EXTRACTORES: Record<
  ColumnaOrdenableAnimales,
  (a: AnimalHatoDerivado, hoyISO: string) => string | number | null
> = {
  numero: (a) => a.numero,
  nombre: (a) => a.nombre,
  // Se ordena por FECHA DE NACIMIENTO, no por la edad calculada: son
  // monótonas inversas la una de la otra, y la fecha no arrastra el
  // redondeo a un decimal (dos animales nacidos con días de diferencia
  // empatarían en 3,4 años y se ordenarían por azar). El signo se invierte
  // para que "asc" signifique lo que el usuario espera al pulsar "Edad":
  // de la más joven a la más vieja.
  edad: (a) => (a.fechaNacimiento ? -Date.parse(`${a.fechaNacimiento}T00:00:00Z`) : null),
  partos: (a) => a.numPartos,
  ultimaCria: (a) => a.ultimoPartoFecha,
  estado: (a) => chipEstadoReproductivo(a.derivado.estado).label,
  pl: (a) => a.pl,
  proximo: (a, hoyISO) => proximoEventoFecha(a, hoyISO),
};

export function ordenarAnimalesHato(
  animales: AnimalHatoDerivado[],
  columna: ColumnaOrdenableAnimales,
  direccion: DireccionOrdenAnimales,
  hoyISO: string,
): AnimalHatoDerivado[] {
  const extractor = EXTRACTORES[columna];
  return ordenarPorValor(animales, (a) => extractor(a, hoyISO), direccion);
}
