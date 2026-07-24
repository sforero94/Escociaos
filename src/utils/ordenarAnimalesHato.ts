// ARCHIVO: utils/ordenarAnimalesHato.ts
// DESCRIPCIÓN: Ordenamiento A-Z de las columnas de la lista de Animales
// (`AnimalesList.tsx`, Figma alignment spec §4) -- extraído como lógica
// pura para poder probarlo (TDD), en vez de vivir embebido en el
// componente. Reglas: columnas numéricas comparan numéricamente, texto por
// `localeCompare`, y CUALQUIER valor ausente (`null`) va SIEMPRE al final,
// sea cual sea la dirección -- nunca se trata "sin dato" como el valor más
// chico o más grande según convenga al clic actual.

import { chipEstadoReproductivo } from './hatoUi';
import type { AnimalHatoDerivado } from '@/components/hato/hooks/useHatoAnimales';

export type ColumnaOrdenableAnimales = 'numero' | 'nombre' | 'estado' | 'pl' | 'proximo';
export type DireccionOrdenAnimales = 'asc' | 'desc';

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
  const extractor = EXTRACTORES[columna];
  const signo = direccion === 'asc' ? 1 : -1;
  return [...animales].sort((x, y) => {
    const vx = extractor(x);
    const vy = extractor(y);
    if (vx == null && vy == null) return 0;
    if (vx == null) return 1; // null siempre al final, sea asc o desc
    if (vy == null) return -1;
    if (typeof vx === 'number' && typeof vy === 'number') return (vx - vy) * signo;
    return String(vx).localeCompare(String(vy)) * signo;
  });
}
