export interface ChatConversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatStreamEvent {
  type: 'text_delta' | 'tool_start' | 'tool_done' | 'done' | 'error';
  content?: string;
  conversation_id?: string;
  title?: string;
  message?: string;
  /** `tool_start` | `tool_done` — nombre tecnico de la herramienta. */
  tool?: string;
  /** `tool_start` | `tool_done` — indice estable para parear inicio y fin. */
  index?: number;
  /** `tool_start` — argumentos con los que se llamo. */
  args?: Record<string, unknown>;
  /** `tool_done` — duracion real en ms. */
  ms?: number;
  /** `tool_done` — `false` si la herramienta devolvio error. */
  ok?: boolean;
}

/**
 * Un paso de la traza que Esco muestra mientras consulta.
 *
 * Se arma en el cliente pareando `tool_start` con su `tool_done` por `index`.
 * Un paso sin `ms` sigue corriendo.
 */
export interface PasoTraza {
  index: number;
  tool: string;
  args?: Record<string, unknown>;
  ms?: number;
  ok?: boolean;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'area';
  title: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string | string[];
  yFormat?: 'currency' | 'number' | 'percent' | 'kg';
  color?: string;
  colors?: string[];
  stacked?: boolean;
}
