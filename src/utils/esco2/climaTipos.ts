// Historia diaria: NULL registrado es distinto de una relación no leída.
export const VARIABLES_CLIMA = ['temp_c_min', 'temp_c_max', 'temp_c_avg', 'humedad_pct_min', 'humedad_pct_max', 'humedad_pct_avg', 'viento_kmh_avg', 'rafaga_kmh_max', 'viento_dir_predominante', 'lluvia_total_mm', 'radiacion_wm2_avg', 'radiacion_wm2_max', 'uv_index_max', 'horas_sol_duracion', 'energia_kwh_m2'] as const;
export type VariableClima = typeof VARIABLES_CLIMA[number];
export const VARIABLES_CLIMA_DEFAULT: VariableClima[] = ['lluvia_total_mm', 'temp_c_avg', 'humedad_pct_avg', 'viento_kmh_avg', 'horas_sol_duracion', 'radiacion_wm2_avg'];
export interface ConsultaClima { desde: string; hasta: string; variables: VariableClima[]; station_id?: string }
export type ResumenDiarioClima = { fecha: string; station_id: string; lluvia_confianza: string; lecturas_count: number; cobertura_hueco_max_min: number | null; lluvia_mm_evento: number | null } & Record<Exclude<VariableClima, 'energia_kwh_m2'>, number | null>;
export interface FuenteClima { leerResumen(consulta: ConsultaClima): Promise<ResumenDiarioClima[]> }
export interface FilaClima {
  fecha: string; station_id: string; lluvia_confianza: string;
  cobertura_temporal: 'completa' | 'parcial' | 'desconocida';
  valores: Partial<Record<VariableClima, number | null>>;
  estados: Partial<Record<VariableClima, 'usable' | 'null_registrado' | 'no_usable'>>;
  contradicciones: string[]; raw: ResumenDiarioClima;
}
export interface VariableResumenClima {
  promedio: number | null; min: number | null; max: number | null;
  cobertura: { solicitados: number; usables: number; nulos_no_usables: number; sin_fila: number; calidad_desconocida: number };
}
export interface ResumenClima {
  station_id: string | null; cobertura_temporal: { completa: number; parcial: number; desconocida: number; hueco_max_min: number | null }; variables: Partial<Record<VariableClima, VariableResumenClima>>;
  lluvia: { subtotal_dias_completos: number | null; cota_inferior_medida: number | null; dias_completos: number; dias_cota_inferior: number; dias_sin_dato: number; dias_calidad_desconocida: number; subtotal_observado_calidad_desconocida: number | null; dias_temporales_parciales: number; subtotal_observado_temporal_parcial: number | null };
}
export interface ResultadoClima {
  tipo: 'clima'; id: string; consulta: ConsultaClima;
  estado: 'ok' | 'parcial' | 'no_disponible' | 'aclaracion' | 'vacio_verificado';
  alcance: { desde: string; hasta: string; hasta_recortado_a_hoy: boolean };
  filas: FilaClima[]; resumen: ResumenClima[]; estaciones: string[]; avisos: string[]; motivo?: string;
  fuente: 'clima_resumen_diario';
}
