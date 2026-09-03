/** Tipos del módulo de informes de visita agronómica (issue #189). */

export const TIPOS_OBSERVACION_AGRONOMICA = [
  'monitoreo',
  'rec_edafica',
  'rec_foliar',
  'rec_drench',
  'observacion',
  'labor',
] as const;

export type TipoObservacionAgronomica = (typeof TIPOS_OBSERVACION_AGRONOMICA)[number];

export const ETIQUETAS_TIPO_OBSERVACION: Record<TipoObservacionAgronomica, string> = {
  monitoreo: 'Monitoreo',
  rec_edafica: 'Fertilización edáfica',
  rec_foliar: 'Foliar',
  rec_drench: 'Drench',
  observacion: 'Observación',
  labor: 'Labor',
};

export interface InformeVisitaCabecera {
  fecha_visita: string;
  agronoma: string | null;
  finca: string | null;
  especie: string | null;
  fenologia: string | null;
  materia_seca: string | null;
  proyeccion_cosecha: string | null;
}

export interface FotoExtraida {
  /** Nombre dentro del docx, p.ej. word/media/image1.jpeg */
  nombre: string;
  mime: string;
  bytes: Uint8Array;
  pieDeFoto: string | null;
  orden: number;
}

export interface FilaPropuesta {
  /** Clave local de la propuesta. Nunca se persiste. */
  clave: string;
  fecha: string;
  fecha_contexto: string | null;
  tipo: TipoObservacionAgronomica;
  lote: string | null;
  lote_id: string | null;
  plaga_enfermedad: string | null;
  accion: string | null;
  insumo: string | null;
  dosis: number | null;
  unidad: string | null;
  periodo_carencia_dias: number | null;
  via: string | null;
  incidencia: string | null;
  severidad: string | null;
  notas: string | null;
  /** Índice en el arreglo de fotos extraídas, no un id de base. */
  foto_indice: number | null;
}

export type AccionDecision = 'confirmar' | 'descartar';

export interface DecisionFila {
  clave: string;
  accion: AccionDecision;
  edicion?: Partial<Omit<FilaPropuesta, 'clave'>>;
}

export interface ExtraccionDocx {
  texto: string;
  sinTexto: boolean;
  fotos: FotoExtraida[];
}

export interface PropuestaInforme {
  cabecera: InformeVisitaCabecera;
  filas: FilaPropuesta[];
  texto: string;
  sinTexto: boolean;
  fotos: FotoExtraida[];
}

export interface InformeVisitaRow {
  id: string;
  fecha_visita: string;
  agronoma: string | null;
  finca: string | null;
  especie: string | null;
  fenologia: string | null;
  materia_seca: string | null;
  proyeccion_cosecha: string | null;
  archivo_path: string;
  archivo_nombre: string;
  texto_extraido: string | null;
  sin_texto: boolean;
  created_at: string;
}

export interface InformeVisitaFotoRow {
  id: string;
  informe_id: string;
  storage_path: string;
  pie_de_foto: string | null;
  orden: number;
  nombre_original: string | null;
}

export interface ObservacionAgronomicaRow {
  id: string;
  informe_id: string;
  fecha: string;
  fecha_contexto: string | null;
  tipo: TipoObservacionAgronomica;
  lote: string | null;
  lote_id: string | null;
  plaga_enfermedad: string | null;
  accion: string | null;
  insumo: string | null;
  dosis: number | null;
  unidad: string | null;
  periodo_carencia_dias: number | null;
  via: string | null;
  incidencia: string | null;
  severidad: string | null;
  notas: string | null;
  foto_id: string | null;
}

export const MENSAJE_SIN_TEXTO = 'sin texto para extraer';

export const BUCKET_INFORMES_VISITA = 'informes-visita';
