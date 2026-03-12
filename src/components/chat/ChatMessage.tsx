import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sprout } from 'lucide-react';
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

export function ChatMessageBubble({ role, content }: ChatMessageProps) {
  const isUser = role === 'user';
  const blocks = useMemo(() => (isUser ? null : splitChartBlocks(content)), [content, isUser]);

  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Sprout className="h-4 w-4 text-primary" />
        </div>
      )}
      <div
        className={cn(
          'rounded-2xl text-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
        style={{ maxWidth: '85%', padding: '0.75rem 1rem' }}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="chat-markdown">
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
        )}
      </div>
    </div>
  );
}
