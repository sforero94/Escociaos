import type { Agrupacion, Metrica } from './tipos.ts';
export const AGRUPACIONES: readonly Agrupacion[] = ['lote', 'tarea', 'categoria', 'tipo_tarea', 'dia', 'mes', 'semana'];
export const METRICAS: readonly Metrica[] = [
    'jornales',
    'costo',
    'dias_con_registro',
    'primer_registro',
    'ultimo_registro',
    'jornales_por_arbol',
    'jornales_por_hectarea',
    'costo_por_jornal',
];
export const METRICAS_RANKING: readonly Metrica[] = METRICAS.filter(m => m !== 'primer_registro' && m !== 'ultimo_registro');
