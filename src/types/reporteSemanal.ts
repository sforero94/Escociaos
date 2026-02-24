// types/reporteSemanal.ts
// Tipos TypeScript para el módulo de Reportes Semanales

import type { Insight } from './monitoreo';

// ============================================================================
// CONFIGURACIÓN DE SEMANA
// ============================================================================

export interface RangoSemana {
  inicio: string; // ISO date (YYYY-MM-DD), siempre un lunes
  fin: string;    // ISO date (YYYY-MM-DD), siempre un domingo
  numero: number; // Número de semana del año (ISO 8601)
  ano: number;
}

// ============================================================================
// SECCIÓN 1: PERSONAL
// ============================================================================

export interface DatosPersonal {
  totalTrabajadores: number;    // Auto-calculado de registros_trabajo
  empleados: number;            // Empleados que trabajaron
  contratistas: number;         // Contratistas que trabajaron
  fallas: number;               // Ingreso manual
  permisos: number;             // Ingreso manual
}

// ============================================================================
// SECCIÓN 2: DISTRIBUCIÓN DE JORNALES
// ============================================================================

export interface CeldaMatrizJornales {
  jornales: number;  // SUM(fraccion_jornal)
  costo: number;     // SUM(costo_jornal)
}

export interface MatrizJornales {
  actividades: string[];   // Nombres de tipos de tarea (filas)
  lotes: string[];         // Nombres de lotes (columnas)
  datos: Record<string, Record<string, CeldaMatrizJornales>>; // actividad → lote → celda
  totalesPorActividad: Record<string, CeldaMatrizJornales>;
  totalesPorLote: Record<string, CeldaMatrizJornales>;
  totalGeneral: CeldaMatrizJornales;
}

// ============================================================================
// SECCIÓN 3: APLICACIONES
// ============================================================================

export interface ItemCompraResumen {
  productoNombre: string;
  categoria: string;
  cantidadNecesaria: number;
  unidad: string;
  costoEstimado: number;
}

export interface AplicacionPlaneada {
  id: string;
  nombre: string;
  tipo: string;
  proposito: string;
  blancosBiologicos: string[];
  fechaInicioPlaneada: string;
  listaCompras: ItemCompraResumen[];
  costoTotalEstimado: number;
}

export interface ProgresoLote {
  loteNombre: string;
  planeado: number;    // canecas o bultos planeados
  ejecutado: number;   // canecas o bultos realizados
  porcentaje: number;  // % de avance
  unidad: 'canecas' | 'bultos';
}

export interface AplicacionActiva {
  id: string;
  nombre: string;
  tipo: string;
  proposito: string;
  estado: string;
  fechaInicio: string;
  // Progreso global
  totalPlaneado: number;
  totalEjecutado: number;
  porcentajeGlobal: number;
  unidad: 'canecas' | 'bultos';
  // Progreso por lote
  progresoPorLote: ProgresoLote[];
}

// ============================================================================
// SECCIÓN 4: MONITOREO
// ============================================================================

export interface TendenciaMonitoreo {
  fecha: string;
  plagaNombre: string;
  incidenciaPromedio: number;
}

export interface MonitoreoSublote {
  subloteNombre: string;
  plagaNombre: string;
  incidencia: number;
  gravedad: 'Baja' | 'Media' | 'Alta';
  arboresAfectados: number;
  arboresMonitoreados: number;
}

export interface MonitoreoPorLote {
  loteNombre: string;
  sublotes: MonitoreoSublote[];
}

export interface DatosMonitoreo {
  tendencias: TendenciaMonitoreo[];  // Últimos 3 monitoreos agrupados
  detallePorLote: MonitoreoPorLote[];
  insights: Insight[];
  fechasMonitoreo: string[];         // Las 3 fechas de monitoreo usadas
}

// ============================================================================
// SECCIÓN 5: TEMAS ADICIONALES
// ============================================================================

export type BloqueAdicionalTipo = 'texto' | 'imagen_con_texto';

export interface BloqueTexto {
  tipo: 'texto';
  titulo?: string;
  contenido: string; // Markdown o bullet points
}

export interface BloqueImagenConTexto {
  tipo: 'imagen_con_texto';
  titulo?: string;
  imagenBase64: string;  // Data URL (data:image/jpeg;base64,...)
  descripcion: string;
}

export type BloqueAdicional = BloqueTexto | BloqueImagenConTexto;

// ============================================================================
// DATOS COMPLETOS DEL REPORTE
// ============================================================================

export interface DatosReporteSemanal {
  semana: RangoSemana;
  personal: DatosPersonal;
  jornales: MatrizJornales;
  aplicaciones: {
    planeadas: AplicacionPlaneada[];
    activas: AplicacionActiva[];
  };
  monitoreo: DatosMonitoreo;
  temasAdicionales: BloqueAdicional[];
}

// ============================================================================
// REPORTE GENERADO (METADATOS EN BD)
// ============================================================================

export interface ReporteSemanalMetadata {
  id: string;
  fecha_inicio: string;
  fecha_fin: string;
  numero_semana: number;
  ano?: number;
  generado_por: string;
  generado_por_nombre?: string;
  url_storage: string;
  html_storage?: string;              // Ruta del HTML para reportes de generación rápida
  generado_automaticamente?: boolean; // TRUE = creado por el botón Generar Rápido
  created_at: string;
}

// ============================================================================
// REQUEST/RESPONSE PARA EDGE FUNCTION
// ============================================================================

export interface GenerateReportRequest {
  datos: DatosReporteSemanal;
  instrucciones?: string;  // Instrucciones adicionales para Gemini
}

export interface GenerateReportResponse {
  html: string;
  tokens_usados?: number;
}
