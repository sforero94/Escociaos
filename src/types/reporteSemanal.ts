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

export interface DetalleFallaPermiso {
  empleado: string;   // Nombre del trabajador
  razon?: string;     // Razón (opcional, ingreso manual)
}

export interface DatosPersonal {
  totalTrabajadores: number;    // Auto-calculado de registros_trabajo
  empleados: number;            // Empleados que trabajaron
  contratistas: number;         // Contratistas que trabajaron
  fallas: number;               // Ingreso manual
  permisos: number;             // Ingreso manual
  ingresos: number;             // Nuevos ingresos en la semana (manual)
  retiros: number;              // Retiros en la semana (manual)
  detalleFallas: DetalleFallaPermiso[];    // Detalle de fallas (manual)
  detallePermisos: DetalleFallaPermiso[];  // Detalle de permisos (manual)
  jornalesPosibles: number;     // Días hábiles × total trabajadores
  jornalesTrabajados: number;   // Total jornales registrados
  eficienciaOperativa: number;  // % = jornalesTrabajados / jornalesPosibles × 100
}

// ============================================================================
// SECCIÓN 2: LABORES
// ============================================================================

export interface LaborSemanal {
  id: string;
  codigoTarea?: string;
  nombre: string;
  tipoTarea: string;
  estado: 'Por iniciar' | 'En proceso' | 'Terminada';
  fechaInicio: string;
  fechaFin?: string;
  lotes: string[];        // Nombres de lotes asociados
}

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
  inventarioDisponible?: number;
  cantidadAComprar?: number;
}

export interface MezclaResumen {
  nombre: string;
  productos: { nombre: string; dosis: string }[];
}

export interface AplicacionPlaneada {
  id: string;
  nombre: string;
  tipo: string;
  proposito: string;
  blancosBiologicos: string[];
  fechaInicioPlaneada: string;
  fechaFinPlaneada?: string;
  mezclas: MezclaResumen[];
  listaCompras: ItemCompraResumen[];
  costoTotalEstimado: number;
  inventarioTotalDisponible: number;
  totalPedido: number;
  costoPorLitroKg?: number;
  costoPorArbol?: number;
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

// Cierre de aplicación para reporte
export interface AplicacionCierreKPILote {
  loteNombre: string;
  // Canecas/bultos
  canecasPlaneadas?: number;
  canecasReales?: number;
  canecasDesviacion?: number;  // %
  // Insumos (Kg o L)
  insumosPlaneados?: number;
  insumosReales?: number;
  insumosDesviacion?: number;  // %
  insumosUnidad?: string;
  // Jornales
  jornalesPlaneados?: number;
  jornalesReales?: number;
  jornalesAnterior?: number;
  jornalesDesviacion?: number;  // %
  jornalesVariacion?: number;   // %
  // Eficiencias
  litrosKgPorArbolPlaneado?: number;
  litrosKgPorArbol?: number; // Real
  litrosKgPorArbolDesviacion?: number;
  arbolesPorJornalPlaneado?: number;
  arbolesPorJornal?: number; // Real
  arbolesPorJornalDesviacion?: number;
  arbolesTratados?: number;
}

export interface AplicacionCierreFinancieroLote {
  loteNombre: string;
  costoTotalPlaneado: number;
  costoTotalReal: number;
  costoTotalAnterior?: number;
  costoTotalDesviacion: number;  // %
  costoTotalVariacion?: number;  // % vs anterior
  costoInsumosPlaneado: number;
  costoInsumosReal: number;
  costoInsumosDesviacion: number;  // %
  costoManoObraPlaneado: number;
  costoManoObraReal: number;
  costoManoObraDesviacion: number;  // %
}

export interface AplicacionCierreGeneral {
  // Totales operativos
  canecasBultosPlaneados: number;
  canecasBultosReales: number;
  canecasBultosDesviacion: number;  // %
  canecasAnterior?: number;
  canecasVariacion?: number; // %
  unidad: 'canecas' | 'bultos';
  // Costos totales
  costoPlaneado: number;
  costoReal: number;
  costoDesviacion: number;   // %
  costoAnterior?: number;    // Costo de aplicación anterior comparable
  costoVariacion?: number;   // % cambio vs anterior
}

export interface AplicacionCerrada {
  id: string;
  nombre: string;
  tipo: string;
  proposito: string;
  fechaInicio: string;
  fechaFin: string;
  diasEjecucion: number;
  general: AplicacionCierreGeneral;
  kpiPorLote: AplicacionCierreKPILote[];
  financieroPorLote: AplicacionCierreFinancieroLote[];
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

// Para la vista por lote con 3 observaciones
export interface ObservacionFecha {
  fecha: string;
  incidencia: number | null;
  gravedad?: 'Baja' | 'Media' | 'Alta' | null;
}

export interface VistaLotePlaga {
  plagaNombre: string;
  esPlaga_interes: boolean;
  observaciones: ObservacionFecha[]; // hasta 3 fechas
}

export interface VistaMonitoreoLote {
  loteId: string;
  loteNombre: string;
  plagasRows: VistaLotePlaga[];
}

// Para la vista por sublote (1 slide por lote)
export interface ObservacionSublotePlaga {
  fechas: ObservacionFecha[]; // hasta 3
}

export interface VistaSubLotePlagaCell {
  subloteNombre: string;
  plagaNombre: string;
  observaciones: ObservacionFecha[]; // hasta 3
}

export interface VistaMonitoreoSublote {
  loteId: string;
  loteNombre: string;
  sublotes: string[];    // nombres de sublotes (columnas)
  plagas: string[];      // nombres de plagas (filas)
  celdas: Record<string, Record<string, ObservacionFecha[]>>; // plaga → sublote → [obs]
}

export interface DatosMonitoreo {
  tendencias: TendenciaMonitoreo[];  // Últimos 3 monitoreos agrupados
  detallePorLote: MonitoreoPorLote[];
  insights: Insight[];
  fechasMonitoreo: string[];         // Las 3 fechas de monitoreo usadas
  vistasPorLote: VistaMonitoreoLote[];      // Vista tabla por lote con 3 obs.
  vistasPorSublote: VistaMonitoreoSublote[]; // Vista por sublote (1 per lote)
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
  imagenesBase64: string[];  // Array of Data URLs — hasta 2 imágenes
  descripcion: string;
  // Backwards-compat: single image via imagenBase64 still accepted
  imagenBase64?: string;
}

export type BloqueAdicional = BloqueTexto | BloqueImagenConTexto;

// ============================================================================
// DATOS COMPLETOS DEL REPORTE
// ============================================================================

export interface DatosReporteSemanal {
  semana: RangoSemana;
  personal: DatosPersonal;
  labores: {
    programadas: LaborSemanal[];
    matrizJornales: MatrizJornales;
  };
  // Legacy top-level jornales (kept for backward compatibility)
  jornales: MatrizJornales;
  aplicaciones: {
    planeadas: AplicacionPlaneada[];
    activas: AplicacionActiva[];
    cerradas: AplicacionCerrada[];
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
