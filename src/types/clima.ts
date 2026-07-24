export interface LecturaClima {
  id: number;
  timestamp: string;
  station_id: string;
  temp_c: number | null;
  humedad_pct: number | null;
  viento_kmh: number | null;
  rafaga_kmh: number | null;
  viento_dir: number | null;
  lluvia_tasa_mm_hr: number | null;
  lluvia_evento_mm: number | null;
  lluvia_diaria_mm: number | null;
  // Última actualización que Ecowitt reporta para el contador acumulado
  // diario (rain.daily.time). Null si la API no la envió. Usado para
  // detectar cuando el contador no se reinició a medianoche — ver
  // migración 068 y calculosClima.ts.
  lluvia_diaria_actualizada_en: string | null;
  radiacion_wm2: number | null;
  uv_index: number | null;
  created_at: string;
}

// 'ok' = contador de lluvia verificado fresco ese día.
// 'contador_congelado' = el contador de Ecowitt no se reinició; lluvia_total_mm
//   viene NULL (sin dato, nunca un duplicado fabricado) — ver migración 068.
// 'sin_time_piezo' = Ecowitt no envió la señal de frescura; se confía en el
//   valor crudo (comportamiento previo a la migración 068).
export type LluviaConfianza = 'ok' | 'contador_congelado' | 'sin_time_piezo';

export interface ResumenDiario {
  fecha: string;
  station_id: string;
  temp_c_min: number | null;
  temp_c_max: number | null;
  temp_c_avg: number | null;
  humedad_pct_min: number | null;
  humedad_pct_max: number | null;
  humedad_pct_avg: number | null;
  lluvia_total_mm: number | null;
  lluvia_confianza: LluviaConfianza;
  viento_kmh_avg: number | null;
  rafaga_kmh_max: number | null;
  viento_dir_predominante: number | null;
  radiacion_wm2_avg: number | null;
  radiacion_wm2_max: number | null;
  uv_index_max: number | null;
  lecturas_count: number;
}

export interface ResumenClima {
  lluvia_total_mm: number | null;
  temp_promedio_c: number | null;
  temp_max_c: number | null;
  temp_min_c: number | null;
  humedad_promedio_pct: number | null;
  viento_promedio_kmh: number | null;
  rafaga_max_kmh: number | null;
  radiacion_promedio_wm2: number | null;
}

export interface PeriodoResumen {
  label: string;
  dias: number;
  resumen: ResumenClima;
}

export interface LecturaClimaAgregada {
  fecha: string;
  temp_c_promedio: number | null;
  temp_c_max: number | null;
  temp_c_min: number | null;
  humedad_pct_promedio: number | null;
  viento_kmh_promedio: number | null;
  rafaga_kmh_max: number | null;
  lluvia_diaria_mm: number | null;
  // Solo poblado cuando el punto viene de un resumen diario persistido
  // (resumenDiarioToAgregada); ausente en agregaciones horarias/mensuales.
  lluvia_confianza?: LluviaConfianza | null;
  radiacion_wm2_promedio: number | null;
}

export interface DatoAnualOverlay {
  mes: string;
  mesNum: number;
  [key: string]: string | number | null;
}

export interface SerieAnual {
  datos: DatoAnualOverlay[];
  años: number[];
}
