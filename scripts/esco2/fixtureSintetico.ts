// Datos 100 % sintéticos de la familia de labores (M4). Los usan las pruebas de Vitest y el
// script `m4-sintetico.ts`. No hay ningún dato real aquí.

import type { DatosLabores } from '../../src/utils/esco2/tipos.ts';

export const datos: DatosLabores = {
  lotes: [
    { id: 'L1', nombre: '1. Norte', activo: true, total_arboles: 100, area_hectareas: 4 },
    { id: 'L2', nombre: '2. Sur', activo: true, total_arboles: null, area_hectareas: 2.5 },
    { id: 'L3', nombre: '3. Loma', activo: true, total_arboles: 50, area_hectareas: null },
  ],
  tiposTareas: [
    { id: 'T1', nombre: 'Cosecha', categoria: 'Cosecha' },
    { id: 'T2', nombre: 'Proyecto', categoria: 'Proyectos Especiales' },
    { id: 'T3', nombre: 'Guadaña', categoria: 'Mantenimiento del cultivo' },
  ],
  tareas: [
    { id: 'a', nombre: 'Cosecha temprana', estado: 'En Proceso', tipo_tarea_id: 'T1', jornales_estimados: 30, fecha_estimada_inicio: '2026-05-01', fecha_estimada_fin: '2026-05-31', fecha_inicio_real: '2026-05-02', fecha_fin_real: null },
    { id: 'b', nombre: 'Clasificación cosecha', estado: 'En Proceso', tipo_tarea_id: 'T1', jornales_estimados: 10, fecha_estimada_inicio: null, fecha_estimada_fin: null, fecha_inicio_real: null, fecha_fin_real: null },
    { id: 'c', nombre: 'Compostaje', estado: 'Completada', tipo_tarea_id: 'T2', jornales_estimados: 50, fecha_estimada_inicio: '2026-05-07', fecha_estimada_fin: '2026-05-09', fecha_inicio_real: '2026-05-08', fecha_fin_real: '2026-05-08' },
    { id: 'd', nombre: 'Guadaña general', estado: 'En Proceso', tipo_tarea_id: 'T3', jornales_estimados: null, fecha_estimada_inicio: null, fecha_estimada_fin: null, fecha_inicio_real: null, fecha_fin_real: null },
    { id: 'e', nombre: 'Mezcla', estado: 'Programada', tipo_tarea_id: 'T2', jornales_estimados: null, fecha_estimada_inicio: null, fecha_estimada_fin: null, fecha_inicio_real: null, fecha_fin_real: null },
  ],
  aplicaciones: [{ id: 'AP1', tarea_id: 'c', codigo_aplicacion: 'APL-1', nombre_aplicacion: 'Compostaje de mayo', estado: 'Cerrada' }],
  registros: [
    { id: 'r1', tarea_id: 'a', lote_id: 'L1', fecha_trabajo: '2026-05-04', fraccion_jornal: 1, costo_jornal: 100000 },
    { id: 'r2', tarea_id: 'a', lote_id: 'L1', fecha_trabajo: '2026-05-05', fraccion_jornal: 0.5, costo_jornal: 50000 },
    { id: 'r3', tarea_id: 'a', lote_id: 'L2', fecha_trabajo: '2026-05-06', fraccion_jornal: 0.75, costo_jornal: 75000 },
    { id: 'r4', tarea_id: 'b', lote_id: null, fecha_trabajo: '2026-05-06', fraccion_jornal: 0.25, costo_jornal: 25000 },
    { id: 'r5', tarea_id: 'd', lote_id: 'L3', fecha_trabajo: '2026-05-07', fraccion_jornal: 1, costo_jornal: null },
    { id: 'r6', tarea_id: 'c', lote_id: 'L1', fecha_trabajo: '2026-05-08', fraccion_jornal: 0.5, costo_jornal: 40000 },
    { id: 'r7', tarea_id: 'e', lote_id: 'L3', fecha_trabajo: '2026-05-08', fraccion_jornal: 0.25, costo_jornal: 20000 },
  ],
};
