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
  radiacion_wm2: number | null;
  uv_index: number | null;
  created_at: string;
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
