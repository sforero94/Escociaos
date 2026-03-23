// ARCHIVO: types/monitoreo.ts
// DESCRIPCIÓN: Interfaces y tipos TypeScript para el módulo de monitoreo
// Propósito: Definir tipos para plagas, monitoreos, validaciones, insights y vistas guardadas

export interface Plaga {
  id: string;
  nombre: string;
  tipo?: string;
  descripcion?: string;
  link_info?: string;
  activo: boolean;
}

export interface Monitoreo {
  id: string;
  fecha_monitoreo: Date | string;
  lote_id?: string;
  sublote_id?: string;
  plaga_enfermedad_id?: string;
  arboles_monitoreados: number;
  arboles_afectados: number;
  individuos_encontrados: number;
  incidencia: number;
  severidad: number;
  gravedad_texto: 'Baja' | 'Media' | 'Alta';
  gravedad_numerica: 1 | 2 | 3;
  observaciones?: string;
  monitor?: string;
  // Joined/computed fields populated from related tables or date calculations
  plaga_nombre?: string;
  lote_nombre?: string;
  sublote_nombre?: string;
  semana?: number; // ISO week number, computed from fecha_monitoreo
}

export interface CSVRowRaw {
  'Fecha de monitoreo': string;
  'Año': string;
  'Mes': string;
  'Semana': string;
  'Lote': string;
  'Sublote': string;
  'Plaga o enfermedad': string;
  'Arboles Monitoreados\nA': string;
  'Árboles Afectados\nB': string;
  'Individuos encontrados\nC': string;
  'Incidencia': string;
  'Severidad (Ind/Arbol)': string;
  'Gravedad del daño': string;
  'Gravedad': string;
  'Observaciones': string;
  'Monitor': string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalRows: number;
    lotes: number;
    sublotes: number;
    plagas: number;
    fechaInicio: Date | null;
    fechaFin: Date | null;
  };
}

export interface Insight {
  tipo: 'urgente' | 'atencion' | 'bueno';
  titulo: string;
  descripcion: string;
  plaga?: string;
  lote?: string;
  sublote?: string;
  incidenciaActual?: number;
  incidenciaAnterior?: number;
  cambio?: number;
  accion?: string;
}

export interface VistaGuardada {
  id: string;
  usuario_id: string;
  nombre: string;
  descripcion?: string;
  favorita: boolean;
  configuracion: {
    plagas: string[];
    lotes?: string[];
    sublotes?: string[];
    periodo: {
      tipo: 'ultimas_semanas' | 'rango_fechas';
      valor: number | { desde: Date; hasta: Date };
    };
    gravedad?: Array<'Alta' | 'Media' | 'Baja'>;
  };
  created_at: Date;
  updated_at: Date;
}

export interface DatoGrafico {
  semana: string;
  [plagaId: string]: number | string;
}

export interface EstadisticaRapida {
  plaga: string;
  promedio: number;
  maximo: number;
  tendencia: 'subiendo' | 'bajando' | 'estable';
  cambio: number;
  estado: 'critico' | 'alerta' | 'atencion' | 'normal';
}

// ============================================
// INTERFACES PARA MAPA DE CALOR
// ============================================

export interface MonitoreoConRelaciones {
  id: string;
  fecha_monitoreo: Date | string;
  lote_id: string;
  sublote_id: string;
  plaga_enfermedad_id: string;
  arboles_monitoreados: number;
  arboles_afectados: number;
  incidencia: number;
  gravedad_texto: 'Baja' | 'Media' | 'Alta';
  plagas_enfermedades_catalogo: { nombre: string };
  sublotes: { nombre: string; lote_id: string };
  lotes: { nombre: string };
}

export interface CeldaMapaCalor {
  plagaId: string;
  plagaNombre: string;
  loteId: string;
  loteNombre: string;
  incidenciaPromedio: number;
  numeroMonitoreos: number;
  monitoreos: MonitoreoConRelaciones[];
  // NUEVO: Para modo múltiples ocurrencias
  ocurrencias?: Array<{
    fecha: string;
    incidencia: number;
  }>;
}

export interface FilaMapaCalor {
  plagaId: string;
  plagaNombre: string;
  incidenciaPromedioTotal: number;
  celdas: Map<string, CeldaMapaCalor>;
}

export interface DatosMapaCalor {
  filas: FilaMapaCalor[];
  columnas: Array<{
    loteId: string;
    loteNombre: string;
    incidenciaPromedio: number;
  }>;
}

// ============================================
// MONITOREO 2.0: Rondas, Floración, CE, Colmenas
// ============================================

export type EstadoSemaforo = 'verde' | 'amarillo' | 'rojo' | 'sin_datos';

// Ronda de monitoreo
export interface RondaMonitoreo {
  id: string;
  nombre?: string | null;
  fecha_inicio: string;
  fecha_fin?: string | null;
  observaciones?: string | null;
  created_at?: string;
}

// Lectura individual de CE por árbol
export interface LecturaCE {
  arbol: number;
  alta: number | null;
  baja: number | null;
}

// Conductividad Eléctrica
export interface MonitoreoConductividad {
  id: string;
  fecha_monitoreo: string;
  lote_id: string;
  ronda_id?: string | null;
  valor_ce: number;
  ph?: number | null;
  lecturas?: LecturaCE[] | null;
  num_arboles?: number;
  observaciones?: string | null;
  monitor?: string | null;
  user_id?: string | null;
  created_at?: string;
  // Joined
  lote_nombre?: string;
}

// Apiarios
export interface Apiario {
  id: string;
  nombre: string;
  ubicacion: string | null;
  total_colmenas: number;
  activo: boolean | null;
  created_at: string | null;
}

// Monitoreo de colmenas (conteo por apiario)
export interface MonitoreoColmena {
  id: string;
  fecha_monitoreo: string;
  apiario_id: string;
  ronda_id?: string | null;
  colmenas_fuertes: number;
  colmenas_debiles: number;
  colmenas_muertas: number;
  colmenas_con_reina: number;
  observaciones?: string | null;
  monitor?: string | null;
  user_id?: string | null;
  created_at?: string;
  // Joined
  apiario_nombre?: string;
}

// Resultado de cálculo de floración
export interface EstadoFloracion {
  totalArboles: number;
  brotes: number;
  florMadura: number;
  cuaje: number;
  pctBrotes: number;
  pctFlorMadura: number;
  pctCuaje: number;
}

// Resultado de cálculo de CE
export interface EstadoCE {
  estado: EstadoSemaforo;
  promedio: number;
  min: number;
  max: number;
}

// Resultado de cálculo de colmenas
export interface EstadoColmenas {
  estado: EstadoSemaforo;
  totalFuertes: number;
  totalDebiles: number;
  totalMuertas: number;
  total: number;
  pctFuertes: number;
}