// ARCHIVO: utils/hatoCorrecciones.ts
// DESCRIPCIÓN: T4b (S3, docs/plan_hato_ciclo_manual_override.md §4-§5) --
// lógica pura para MOSTRAR la traza de `hato_correcciones` (migración 084).
// Esta app nunca ESCRIBE en esa tabla (la escribe solo el trigger
// `fn_hato_registrar_correccion`) -- este archivo solo resume lo que ya se
// leyó, para `HistorialCorreccionesCard.tsx`. Cero imports de Supabase ni
// de React.

import type { HatoCorreccionRow } from '@/types/hato';

/** Etiqueta legible por tabla -- las 5 que cubre el trigger de 084. */
export const LABEL_TABLA_CORRECCION: Record<HatoCorreccionRow['tabla'], string> = {
  hato_eventos: 'Evento reproductivo',
  hato_pesajes_leche: 'Pesaje semanal',
  hato_produccion_quincenal: 'Producción quincenal',
  hato_animales: 'Ficha del animal',
  hato_chequeo_vacas: 'Fila de chequeo',
};

/** Columnas de sistema/auditoría que nunca aportan nada a un resumen de
 * "qué cambió" -- se excluyen del diff en las 5 tablas por igual. */
const CAMPOS_IGNORADOS_DIFF = new Set(['id', 'created_at', 'updated_at', 'updated_by']);

function formatearValorDiff(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

/**
 * Resume qué cambió entre `datos_anteriores` y `datos_nuevos` como una
 * lista de líneas `"campo: anterior → nuevo"`. En `operacion === 'delete'`
 * no hay `datos_nuevos` que comparar -- se devuelve una única línea fija.
 * Genérico a propósito: las 5 tablas fuente tienen formas completamente
 * distintas y este resumen no debe conocerlas (mismo criterio que llevó al
 * trigger de la migración 084 a usar `to_jsonb(OLD)`/`to_jsonb(NEW)` en vez
 * de listar columnas).
 */
export function resumirCambiosCorreccion(
  correccion: Pick<HatoCorreccionRow, 'operacion' | 'datos_anteriores' | 'datos_nuevos'>,
): string[] {
  if (correccion.operacion === 'delete') {
    return ['Fila eliminada'];
  }

  const anterior = correccion.datos_anteriores ?? {};
  const nuevo = correccion.datos_nuevos ?? {};
  const claves = new Set([...Object.keys(anterior), ...Object.keys(nuevo)]);

  const cambios: string[] = [];
  for (const clave of claves) {
    if (CAMPOS_IGNORADOS_DIFF.has(clave)) continue;
    const valorAnterior = anterior[clave];
    const valorNuevo = nuevo[clave];
    if (JSON.stringify(valorAnterior) === JSON.stringify(valorNuevo)) continue;
    cambios.push(`${clave}: ${formatearValorDiff(valorAnterior)} → ${formatearValorDiff(valorNuevo)}`);
  }

  return cambios.length > 0 ? cambios : ['Sin cambios detectables en los campos capturados'];
}
