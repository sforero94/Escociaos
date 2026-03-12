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
  type: 'text_delta' | 'done' | 'error';
  content?: string;
  conversation_id?: string;
  title?: string;
  message?: string;
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
