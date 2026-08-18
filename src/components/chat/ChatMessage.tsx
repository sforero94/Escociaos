import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, RotateCcw, Sprout } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/components/ui/utils';
import { ChatChart } from '@/components/chat/ChatChart';
import type { ChartSpec } from '@/types/chat';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
}

const CHART_SPEC_KEYS = ['type', 'title', 'data', 'xKey', 'yKey'];

function tryParseChart(text: string): ChartSpec | null {
  try {
    const obj = JSON.parse(text.trim());
    if (obj && typeof obj === 'object' && CHART_SPEC_KEYS.every((k) => k in obj)) {
      return obj as ChartSpec;
    }
  } catch { /* not valid JSON */ }
  return null;
}

export type ContentBlock =
  | { type: 'text'; value: string }
  | { type: 'chart'; spec: ChartSpec };

function splitChartBlocks(content: string): ContentBlock[] {
  const parts: ContentBlock[] = [];
  // Match chart JSON in: ```fenced blocks```, `inline code`, or bare JSON objects
  const chartPattern =
    /```(?:chart|json)?\s*\n?([\s\S]*?)```|`(\{[\s\S]*?\})`|(\{\s*"type"\s*:\s*"(?:bar|line|pie|area)"[\s\S]*?\n\})/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = chartPattern.exec(content)) !== null) {
    const jsonText = match[1] ?? match[2] ?? match[3];
    const spec = tryParseChart(jsonText);
    if (spec) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'chart', spec });
      lastIndex = chartPattern.lastIndex;
    }
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: content }];
}

export { splitChartBlocks };

function AccionesMensaje({ contenido, onReintentar }: { contenido: string; onReintentar?: () => void }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(contenido);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      toast.error('El navegador no dejó copiar al portapapeles');
    }
  };

  const claseBoton =
    'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground ' +
    'transition-colors hover:bg-muted hover:text-foreground ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

  return (
    // Las acciones quedan FUERA del nodo que exporta el informe (ver el
    // `data-role` en ChatPanel): son controles, no parte de la respuesta.
    <div className="flex items-center gap-1 pt-0.5">
      <button type="button" onClick={copiar} className={claseBoton} aria-label="Copiar la respuesta">
        {copiado ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
      {onReintentar && (
        <button type="button" onClick={onReintentar} className={claseBoton} aria-label="Volver a preguntar">
          <RotateCcw className="h-3.5 w-3.5" />
          Reintentar
        </button>
      )}
    </div>
  );
}

/**
 * Un turno de la conversación.
 *
 * La pregunta del usuario es una burbuja; la respuesta de Esco **no**. Una
 * burbuja comunica "mensaje corto de alguien", y lo que Esco entrega es un
 * informe: 1.400 caracteres, encabezados, tablas y dos gráficas. Metido en un
 * `bg-muted` redondeado al 85% del ancho, el contenido quedaba estrangulado —
 * en un teléfono de 375 px la gráfica recibía 226 px y tres de cada cuatro
 * barras eran invisibles. Ahora la respuesta ocupa el ancho del panel y las
 * gráficas respiran.
 */
export function ChatMessageView({ role, content }: ChatMessageProps) {
  const isUser = role === 'user';
  const blocks = useMemo(() => (isUser ? null : splitChartBlocks(content)), [content, isUser]);

  if (isUser) {
    return (
      <div className="flex flex-row-reverse">
        <div
          className="max-w-[85%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground"
        >
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Sprout className="h-4 w-4 text-primary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="chat-markdown min-w-0 text-foreground">
          {blocks!.map((block, i) =>
            block.type === 'chart' ? (
              <ChatChart key={i} spec={block.spec} />
            ) : (
              <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                {block.value}
              </ReactMarkdown>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** Barra de acciones de una respuesta ya terminada. Se monta aparte del nodo exportable. */
export function ChatMessageAcciones({
  contenido,
  onReintentar,
}: {
  contenido: string;
  onReintentar?: () => void;
}) {
  return (
    <div className={cn('pl-9')}>
      <AccionesMensaje contenido={contenido} onReintentar={onReintentar} />
    </div>
  );
}
