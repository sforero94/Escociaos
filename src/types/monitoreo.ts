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
  fecha_monitoreo: Date;
  lote_id: string;
  sublote_id: string;
  plaga_enfermedad_id: string;
  arboles_monitoreados: number;
  arboles_afectados: number;
  individuos_encontrados: number;
  incidencia: number;
  severidad: number;
  gravedad_texto: 'Baja' | 'Media' | 'Alta';
  gravedad_numerica: 1 | 2 | 3;
  observaciones?: string;
  monitor?: string;
  // Campos calculados que NO existen en la tabla pero se pueden unir desde otras tablas
  // lote_nombre, sublote_nombre, plaga_nombre se obtienen con joins en las queries
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