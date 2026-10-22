// Tipos del arnés de evaluación de Esco (conjunto dorado v2).
// Lógica pura: sin red, sin Deno, sin sistema de archivos.

export type TipoCaso = 'factual_sql' | 'behavior' | 'rubric_analysis';
export type VeredictoHumano = 'correcta' | 'incorrecta' | 'mixta' | 'parcial' | 'no_verificable';

export interface AnclaNumerica {
  claim: string;
  /** Número, o fecha ISO (AAAA-MM-DD). */
  value: number | string;
  tol?: number | null;
}

export interface HerramientaLlamada {
  tool: string;
  args?: Record<string, unknown>;
  /** Resumen guardado del resultado (máx. 500 caracteres en producción). */
  result_summary?: string;
  error?: boolean;
  ms?: number;
}

export interface CorridaOriginal {
  rn: number;
  ts_bogota: string;
  canal: string;
  question: string;
  status: string;
  tools: HerramientaLlamada[];
}

export interface CasoDorado {
  id: string;
  key: string;
  title: string;
  domain: string;
  kind: TipoCaso;
  channel: 'Web' | 'Telegram';
  channels_observed: string[];
  /** Fecha/hora de la pregunta original, en hora de Bogotá: AAAA-MM-DD HH:MM. */
  as_of_bogota: string;
  question: string;
  paraphrases: string[];
  followup_turns: { rn: number; user: string }[];
  prior_context: { rn: number; user: string; assistant_original: string }[];
  expected_behavior: {
    tools_must_include: string[];
    tools_any_of: string[];
    tools_forbidden: string[];
    max_tool_calls: number | null;
    note?: string | null;
    should_clarify?: boolean;
  };
  reference: {
    type: 'sql' | 'rubric';
    sql: string;
    frozen_result: unknown;
    frozen_on: string;
    replayable_as_of: boolean | null;
    replay_note?: string | null;
    tolerance?: string | null;
  };
  numeric_anchors: AnclaNumerica[];
  must: string[];
  must_not: string[];
  original: {
    verdict: string;
    issues: string[];
    runs: CorridaOriginal[];
    answer_primary: string;
  };
  tags: string[];
  human_review: { verdict: VeredictoHumano; verdict_raw: string; inferred?: boolean };
  include_in_golden: boolean;
  golden_status: string;
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

export interface TurnoEjecutado {
  pregunta: string;
  respuesta: string;
  herramientas: HerramientaLlamada[];
  ms?: number;
}

export interface CorridaEjecutada {
  modo: 'live' | 'originales';
  /** Fecha/hora fijada para la corrida (ISO UTC) o null si corrió con la hora real. */
  asOf: string | null;
  turnos: TurnoEjecutado[];
  tokens?: { entrada: number; salida: number };
  /** Escrituras que Esco intentó y el arnés bloqueó (método + URL). */
  escriturasBloqueadas: string[];
  /** Error de infraestructura (red, LLM); la corrida es inconclusa. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Puntaje
// ---------------------------------------------------------------------------

export interface Chequeo {
  id: string;
  /** true = cumple, false = falla, null = omitido (no aplica). */
  ok: boolean | null;
  /** Un chequeo duro que falla hace fallar el caso; uno blando solo se reporta. */
  duro: boolean;
  detalle: string;
}

export interface ResultadoDeterminista {
  chequeos: Chequeo[];
  pasa: boolean;
}

export type VeredictoCriterio = 'cumple' | 'no_cumple' | 'viola' | 'no_viola' | 'no_aplica';

export interface Criterio {
  id: string;
  tipo: 'debe' | 'no_debe';
  texto: string;
}

export interface ResultadoCriterio {
  id: string;
  veredicto: VeredictoCriterio;
  evidencia: string;
}

export interface ResultadoJuez {
  criterios: ResultadoCriterio[];
  /** true si alguna afirmación de la respuesta contradice la referencia. */
  contradice_referencia: boolean;
  /** true/false si hubo herramienta con error; null si no hubo. */
  oculto_fallo_herramienta: boolean | null;
  comentario: string;
}

export type EstadoCaso = 'pasa' | 'falla' | 'inconcluso';

export interface ResultadoCaso {
  caso_id: string;
  clave: string;
  dominio: string;
  tipo: TipoCaso;
  etiquetas: string[];
  repeticion: number;
  variante: string;
  estado: EstadoCaso;
  razones: string[];
  determinista: ResultadoDeterminista | null;
  juez: ResultadoJuez | null;
  juez_estado: 'ok' | 'omitido' | 'error';
  corrida: CorridaEjecutada;
  veredicto_humano_original: VeredictoHumano;
}
