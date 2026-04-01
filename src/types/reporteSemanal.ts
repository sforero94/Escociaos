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
// CONFIGURACIÓN DE SECCIONES (TOGGLES)
// ============================================================================

export interface SeccionesReporte {
  clima: boolean;
  monitoreoPlagas: boolean;
  floracion: boolean;
  conductividadElectrica: boolean;
  colmenas: boolean;
  aplicaciones: boolean;
}

export const SECCIONES_DEFAULT: SeccionesReporte = {
  clima: true,
  monitoreoPlagas: true,
  floracion: true,
  conductividadElectrica: true,
  colmenas: true,
  aplicaciones: true,
};

// ============================================================================
// SECCIÓN: CLIMA SEMANAL
// ============================================================================

export interface DiaClima {
  fecha: string;           // YYYY-MM-DD
  lluviaMm: number;
  radiacionMaxWm2: number;
  tempMax: number | null;
  tempMin: number | null;
}

export interface ClimaPromedioHistorico {
  tempPromedio: number | null;
  lluviaPromSemanal: number | null;
  humedadPromedio: number | null;
  radiacionPromedio: number | null;
  semanasAnalizadas: number;
}

export interface DatosClimaSemanal {
  tempMin: number | null;
  tempMax: number | null;
  tempPromedio: number | null;
  lluviaTotal: number | null;
  humedadPromedio: number | null;
  radiacionPromedio: number | null;
  radiacionMax: number | null;
  diario: DiaClima[];
  historico?: ClimaPromedioHistorico;
}

// ============================================================================
// SECCIÓN: FLORACIÓN SEMANAL
// ============================================================================

export interface FloracionLoteReporte {
  loteNombre: string;
  arboresMonitoreados: number;
  sinFlor: number;
  brotes: number;
  florMadura: number;
  cuaje: number;
  pctSinFlor: number;
  pctBrotes: number;
  pctFlorMadura: number;
  pctCuaje: number;
}

export interface DatosFloracionSemanal {
  porLote: FloracionLoteReporte[];
}

// ============================================================================
// SECCIÓN: CONDUCTIVIDAD ELÉCTRICA SEMANAL
// ============================================================================

export interface CELoteReporte {
  loteNombre: string;
  pctBajo: number;
  pctEnRango: number;
  pctAlto: number;
  promedio: number;
  totalLecturas: number;
}

export interface DatosCESemanal {
  porLote: CELoteReporte[];
}

// ============================================================================
// SECCIÓN: COLMENAS SEMANAL
// ============================================================================

export interface ColmenasApiarioReporte {
  apiarioNombre: string;
  fuertes: number;
  debiles: number;
  muertas: number;
  conReina: number;
  total: number;
}

export interface ColmenasHistoricoFecha {
  fecha: string;
  apiarios: ColmenasApiarioReporte[];
}

export interface DatosColmenasSemanal {
  porApiario: ColmenasApiarioReporte[];
  historico: ColmenasHistoricoFecha[];
  totales: {
    fuertes: number;
    debiles: number;
    muertas: number;
    conReina: number;
    total: number;
    pctFuertes: number;
  };
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
  jornalesPosibles: number;     // 5.5 días hábiles (L-V + sáb medio) × total trabajadores
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

export interface FilaMatrizJornales {
  nombre: string;          // Task name (row label)
  tipo: string;            // Task type category
}

export interface MatrizJornales {
  actividades: string[];   // Nombres de tareas individuales (filas)
  filas: FilaMatrizJornales[]; // Nombre + tipo por fila
  lotes: string[];         // Nombres de lotes (columnas)
  datos: Record<string, Record<string, CeldaMatrizJornales>>; // nombre → lote → celda
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
  costoInsumosAnterior?: number;
  costoInsumosVariacion?: number;  // % vs anterior
  costoManoObraPlaneado: number;
  costoManoObraReal: number;
  costoManoObraDesviacion: number;  // %
  costoManoObraAnterior?: number;
  costoManoObraVariacion?: number;  // % vs anterior
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

export interface InsumoUsado {
  nombre: string;
  categoria: string;
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
  listaInsumos?: InsumoUsado[];
}

// ============================================================================
// SECCIÓN 4: MONITOREO
// ============================================================================

// --- Legacy types (kept for backward compat, used internally) ---

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

export interface ObservacionFecha {
  fecha: string;
  incidencia: number | null;
  gravedad?: 'Baja' | 'Media' | 'Alta' | null;
}

// --- Nuevos tipos: Comparativo con tendencia ---

/** Dirección de la tendencia entre observación actual y anterior */
export type TendenciaDir = 'subiendo' | 'bajando' | 'estable' | 'sin_referencia';

/** Celda con valor actual + comparativo respecto a la observación anterior */
export interface CeldaComparativa {
  actual: number | null;       // Incidencia del monitoreo más reciente (null = sin datos)
  anterior: number | null;     // Incidencia del monitoreo de referencia (null = sin ref)
  tendencia: TendenciaDir;
}

/** Fila de la tabla resumen general: una plaga con promedio, rango entre lotes, y tendencia */
export interface ResumenPlagaGlobal {
  plagaNombre: string;
  esPlaga_interes: boolean;
  promedioActual: number | null;
  minLote: number | null;          // Mínimo entre lotes
  maxLote: number | null;          // Máximo entre lotes
  promedioAnterior: number | null; // Promedio de la observación de referencia
  tendencia: TendenciaDir;
}

/** Vista por lote: cada lote con lista de plagas comparativas */
export interface VistaLoteComparativa {
  loteId: string;
  loteNombre: string;
  sinDatos: boolean;              // true si no hay ningún dato histórico para este lote
  plagas: PlagaLoteComparativa[];
  fechaUltimaObservacion: string | null;
  nivelAlerta: 'ninguna' | 'amarilla' | 'roja';
}

export interface PlagaLoteComparativa {
  plagaNombre: string;
  esPlaga_interes: boolean;
  actual: number | null;
  anterior: number | null;
  tendencia: TendenciaDir;
}

/** Vista por sublote: una tabla por lote, cada celda = plaga × sublote con comparativo */
export interface VistaSubloteComparativa {
  loteId: string;
  loteNombre: string;
  sinDatos: boolean;
  sublotes: string[];             // Nombres de sublotes (columnas)
  plagas: string[];               // Nombres de plagas (filas)
  celdas: Record<string, Record<string, CeldaComparativa>>; // plaga → sublote → celda
  tieneDatosSemanaActual: boolean; // true si el lote fue monitoreado en la semana del reporte
}

/** Contenedor principal de datos de monitoreo para el informe */
export interface DatosMonitoreo {
  // --- Fechas de referencia ---
  fechaActual: string | null;            // Fecha del monitoreo principal
  fechaAnterior: string | null;          // Fecha del monitoreo de referencia
  avisoFechaDesactualizada: string | null; // Aviso si los datos no son de la semana del reporte

  // --- Vistas ---
  resumenGlobal: ResumenPlagaGlobal[];        // Slide 1: Resumen general
  vistasPorLote: VistaLoteComparativa[];      // Slide 2: Vista por lote
  vistasPorSublote: VistaSubloteComparativa[]; // Slide 3: Vista por sublote (1 por lote)

  // --- Análisis ---
  insights: Insight[];

  // --- Legacy (backward compat for Gemini prompt) ---
  tendencias: TendenciaMonitoreo[];
  detallePorLote: MonitoreoPorLote[];
  fechasMonitoreo: string[];
  vistasPorLote_legacy?: unknown[];
  vistasPorSublote_legacy?: unknown[];
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
  secciones: SeccionesReporte;
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
  clima?: DatosClimaSemanal;
  floracion?: DatosFloracionSemanal;
  conductividadElectrica?: DatosCESemanal;
  colmenas?: DatosColmenasSemanal;
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
