import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read bot.ts source for structural assertions
const botSource = readFileSync(
  resolve(__dirname, '../supabase/functions/server/telegram/bot.ts'),
  'utf-8'
);

// ============================================================================
// Telegram Chat Persistence
// ============================================================================

describe('Telegram Chat Persistence', () => {
  it('bot.ts debe contener función getOrCreateTelegramConversation', () => {
    expect(botSource).toContain('async function getOrCreateTelegramConversation');
  });

  it('getOrCreateTelegramConversation debe buscar conversación reciente (< 4h)', () => {
    expect(botSource).toMatch(/4\s*\*\s*60\s*\*\s*60\s*\*\s*1000|fourHoursAgo|4.*hours/);
  });

  it('getOrCreateTelegramConversation debe crear conversación nueva si no hay reciente', () => {
    // Should insert into chat_conversations when no recent one found
    expect(botSource).toMatch(/chat_conversations/);
  });

  it('debe tener función saveTelegramMessage para guardar mensajes', () => {
    expect(botSource).toContain('async function saveTelegramMessage');
  });

  it('saveTelegramMessage debe guardar en chat_messages con metadata', () => {
    expect(botSource).toMatch(/chat_messages/);
    expect(botSource).toMatch(/metadata/);
  });
});

// ============================================================================
// Telegram Message History
// ============================================================================

describe('Telegram Message History', () => {
  it('bot.ts debe contener función buildTelegramLlmMessages', () => {
    expect(botSource).toContain('async function buildTelegramLlmMessages');
  });

  it('buildTelegramLlmMessages debe cargar historial con metadata', () => {
    // Supabase client uses .select("role,content,metadata")
    expect(botSource).toMatch(/\.select\(["']role,content,metadata["']\)/);
  });

  it('buildTelegramLlmMessages debe inyectar contexto de tool_interactions previas', () => {
    expect(botSource).toContain('Datos consultados en la respuesta anterior');
  });

  it('buildTelegramLlmMessages debe incluir tweaks de Telegram en system prompt', () => {
    expect(botSource).toContain('Telegram');
    expect(botSource).toMatch(/No uses tablas markdown/);
  });
});

// ============================================================================
// Handler Integration
// ============================================================================

describe('Handler de texto libre con persistencia', () => {
  it('handler debe obtener userId del telegramUser', () => {
    // The handler should access telegramUser.usuario_id for conversation management
    expect(botSource).toMatch(/ctx\.telegramUser.*usuario_id|telegramUser.*\.usuario_id/s);
  });

  it('handler debe llamar getOrCreateTelegramConversation', () => {
    expect(botSource).toContain('getOrCreateTelegramConversation');
  });

  it('handler debe guardar mensaje del usuario antes de llamar al LLM', () => {
    // saveTelegramMessage should be called before llmToolLoop
    const handlerSection = botSource.slice(
      botSource.indexOf('bot.on("message:text"'),
      botSource.indexOf('bot.api.setMyCommands') || botSource.length
    );
    const saveUserPos = handlerSection.indexOf('saveTelegramMessage');
    const llmPos = handlerSection.indexOf('llmToolLoop');
    expect(saveUserPos).toBeGreaterThan(0);
    expect(llmPos).toBeGreaterThan(saveUserPos);
  });

  it('handler debe guardar respuesta del assistant con toolInteractions en metadata', () => {
    const handlerSection = botSource.slice(
      botSource.indexOf('bot.on("message:text"'),
      botSource.indexOf('bot.api.setMyCommands') || botSource.length
    );
    // Should save assistant message after llmToolLoop
    expect(handlerSection).toMatch(/saveTelegramMessage.*assistant.*tool_interactions/s);
  });

  it('handler debe usar buildTelegramLlmMessages en lugar de construir mensajes inline', () => {
    const handlerSection = botSource.slice(
      botSource.indexOf('bot.on("message:text"'),
      botSource.indexOf('bot.api.setMyCommands') || botSource.length
    );
    expect(handlerSection).toContain('buildTelegramLlmMessages');
  });
});

// ============================================================================
// Chart to QuickChart conversion
// ============================================================================

// Pure function extracted for testing — same logic that will be in bot.ts
function extractChartsAndText(responseText: string): {
  textParts: string[];
  charts: Array<{ type: string; title: string; data: Array<Record<string, string | number>>; xKey: string; yKey: string | string[]; yFormat?: string; colors?: string[] }>;
} {
  const chartPattern = /```(?:chart|json)?\s*\n?([\s\S]*?)```/g;
  const textParts: string[] = [];
  const charts: Array<Record<string, unknown>> = [];

  let lastIndex = 0;
  let match;
  while ((match = chartPattern.exec(responseText)) !== null) {
    const before = responseText.slice(lastIndex, match.index).trim();
    if (before) textParts.push(before);
    lastIndex = match.index + match[0].length;

    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.type && parsed.data && parsed.xKey && parsed.yKey) {
        charts.push(parsed);
      }
    } catch { /* skip invalid JSON */ }
  }

  const after = responseText.slice(lastIndex).trim();
  if (after) textParts.push(after);

  if (charts.length === 0 && textParts.length === 0) {
    textParts.push(responseText);
  }

  return { textParts, charts: charts as ReturnType<typeof extractChartsAndText>['charts'] };
}

function buildQuickChartUrl(chart: { type: string; title: string; data: Array<Record<string, string | number>>; xKey: string; yKey: string | string[]; yFormat?: string; colors?: string[] }): string {
  const labels = chart.data.map(d => String(d[chart.xKey]));
  const keys = Array.isArray(chart.yKey) ? chart.yKey : [chart.yKey];
  const palette = chart.colors || ['#73991C', '#E74C3C', '#3498DB', '#F39C12', '#9B59B6', '#1ABC9C'];

  const datasets = keys.map((key, i) => ({
    label: key,
    data: chart.data.map(d => d[key]),
    backgroundColor: palette[i % palette.length],
    borderColor: palette[i % palette.length],
    fill: chart.type === 'area',
  }));

  const chartType = chart.type === 'area' ? 'line' : chart.type;

  const config = {
    type: chartType,
    data: { labels, datasets },
    options: {
      title: { display: true, text: chart.title },
      plugins: { datalabels: { display: false } },
    },
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=600&h=400&bkg=white`;
}

describe('Telegram Chart Extraction', () => {
  it('extractChartsAndText extrae chart JSON de bloques', () => {
    const text = 'Aquí va el análisis:\n\n```chart\n{"type":"bar","title":"Test","data":[{"name":"A","value":10}],"xKey":"name","yKey":"value"}\n```\n\nConclusiones importantes.';
    const result = extractChartsAndText(text);
    expect(result.charts).toHaveLength(1);
    expect(result.charts[0].type).toBe('bar');
    expect(result.textParts).toHaveLength(2);
    expect(result.textParts[0]).toContain('análisis');
    expect(result.textParts[1]).toContain('Conclusiones');
  });

  it('extractChartsAndText retorna texto original si no hay charts', () => {
    const text = 'Solo texto sin gráficos.';
    const result = extractChartsAndText(text);
    expect(result.charts).toHaveLength(0);
    expect(result.textParts).toHaveLength(1);
    expect(result.textParts[0]).toBe(text);
  });

  it('extractChartsAndText maneja JSON inválido sin crashear', () => {
    const text = '```chart\n{invalid json}\n```';
    const result = extractChartsAndText(text);
    expect(result.charts).toHaveLength(0);
  });
});

describe('Telegram QuickChart URL Generation', () => {
  it('buildQuickChartUrl genera URL válida para bar chart', () => {
    const chart = {
      type: 'bar' as const,
      title: 'Gastos por Mes',
      data: [{ name: 'Enero', value: 100 }, { name: 'Febrero', value: 200 }],
      xKey: 'name',
      yKey: 'value',
    };
    const url = buildQuickChartUrl(chart);
    expect(url).toContain('quickchart.io/chart');
    expect(url).toContain('bar');
    expect(url).toContain('Gastos');
  });

  it('buildQuickChartUrl convierte area a line con fill', () => {
    const chart = {
      type: 'area' as const,
      title: 'Tendencia',
      data: [{ mes: 'Ene', val: 50 }],
      xKey: 'mes',
      yKey: 'val',
    };
    const url = buildQuickChartUrl(chart);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('"type":"line"');
    expect(decoded).toContain('"fill":true');
  });

  it('buildQuickChartUrl soporta múltiples series', () => {
    const chart = {
      type: 'bar' as const,
      title: 'Multi',
      data: [{ x: 'A', s1: 10, s2: 20 }],
      xKey: 'x',
      yKey: ['s1', 's2'],
    };
    const url = buildQuickChartUrl(chart);
    expect(url).toContain('s1');
    expect(url).toContain('s2');
  });
});

describe('Bot.ts tiene funciones de chart', () => {
  it('bot.ts debe contener función extractChartsAndText', () => {
    expect(botSource).toContain('function extractChartsAndText');
  });

  it('bot.ts debe contener función buildQuickChartUrl', () => {
    expect(botSource).toContain('function buildQuickChartUrl');
  });

  it('handler debe usar replyWithPhoto para enviar charts', () => {
    expect(botSource).toContain('replyWithPhoto');
  });
});
