/** Tipos del módulo de informes de visita agronómica (issue #189, pivot snippets). */

export const TIPOS_SNIPPET = [
  'monitoreo',
  'rec_edafica',
  'rec_foliar',
  'rec_drench',
  'observacion',
  'labor',
] as const;

export type TipoSnippet = (typeof TIPOS_SNIPPET)[number];

export const ETIQUETAS_TIPO_SNIPPET: Record<TipoSnippet, string> = {
  monitoreo: 'Monitoreo',
  rec_edafica: 'Fertilización edáfica',
  rec_foliar: 'Foliar',
  rec_drench: 'Drench',
  observacion: 'Observación',
  labor: 'Labor',
};

export const ORIGENES_SNIPPET = ['informe', 'conversacion'] as const;
export type OrigenSnippet = (typeof ORIGENES_SNIPPET)[number];

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
  nombre: string;
  mime: string;
  bytes: Uint8Array;
  pieDeFoto: string | null;
  orden: number;
}

/** Una idea propuesta. Nunca se persiste hasta confirmar o añadir a mano. */
export interface SnippetPropuesto {
  clave: string;
  texto: string;
  cita_word: string | null;
  origen: OrigenSnippet;
  tipo: string | null;
  insumo: string | null;
  plaga: string | null;
  foto_indice: number | null;
}

export type AccionDecision = 'confirmar' | 'descartar';

export interface DecisionSnippet {
  clave: string;
  accion: AccionDecision;
  edicion?: Partial<Omit<SnippetPropuesto, 'clave' | 'origen'>>;
}

export interface ExtraccionDocx {
  texto: string;
  sinTexto: boolean;
  fotos: FotoExtraida[];
}

export interface PropuestaInforme {
  cabecera: InformeVisitaCabecera;
  snippets: SnippetPropuesto[];
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

export interface InformeVisitaSnippetRow {
  id: string;
  informe_id: string;
  texto: string;
  cita_word: string | null;
  origen: OrigenSnippet;
  tipo: string | null;
  insumo: string | null;
  plaga: string | null;
  foto_id: string | null;
  created_at: string;
}

export const MENSAJE_SIN_TEXTO = 'sin texto para extraer';

export const BUCKET_INFORMES_VISITA = 'informes-visita';
