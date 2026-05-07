import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read chat.tsx source for structural assertions
const chatSource = readFileSync(
  resolve(__dirname, '../supabase/functions/server/chat.tsx'),
  'utf-8'
);

// ============================================================================
// FASE 0: Cambio de Modelo
// ============================================================================

describe('Fase 0: Modelo', () => {
  it('debe usar google/gemini-3-flash-preview como modelo', () => {
    expect(chatSource).toContain("const MODEL = 'google/gemini-3-flash-preview'");
    expect(chatSource).not.toContain("const MODEL = 'google/gemini-2.5-flash'");
  });
});

// ============================================================================
// FASE 1.1: Memoria de Tool Calls
// ============================================================================

describe('Fase 1.1: Memoria de Tool Calls', () => {
  it('llmToolLoop debe retornar objeto con text y toolInteractions', () => {
    // The function signature should return { text, toolInteractions }.
    // Use [\s\S] so the regex tolerates a multi-line signature (e.g. when
    // optional params like userId are added on their own lines).
    expect(chatSource).toMatch(/async function llmToolLoop[\s\S]*?Promise<\{/);
    expect(chatSource).toMatch(/text:\s*string/);
    expect(chatSource).toMatch(/toolInteractions:\s*ToolInteraction\[\]/);
  });

  it('debe definir interface ToolInteraction', () => {
    expect(chatSource).toContain('interface ToolInteraction');
    expect(chatSource).toMatch(/tool:\s*string/);
    expect(chatSource).toMatch(/args:\s*Record<string,\s*unknown>/);
    expect(chatSource).toMatch(/result_summary:\s*string/);
  });

  it('debe guardar toolInteractions en metadata al insertar mensaje assistant', () => {
    // The insert call should include metadata with tool_interactions
    expect(chatSource).toContain('tool_interactions');
    expect(chatSource).toMatch(/metadata.*tool_interactions/s);
  });

  it('debe cargar metadata en el query de historial', () => {
    expect(chatSource).toMatch(/select=role,content,metadata/);
  });

  it('debe inyectar contexto de tools previos como mensajes del sistema', () => {
    expect(chatSource).toContain('Datos consultados en la respuesta anterior');
  });
});

// ============================================================================
// FASE 1.2: System Prompt para Fechas
// ============================================================================

describe('Fase 1.2: System Prompt de Fechas', () => {
  it('debe incluir día de la semana en el system prompt', () => {
    // Should calculate and include day of week
    expect(chatSource).toMatch(/diasSemana|dias.*domingo.*lunes/s);
    expect(chatSource).toMatch(/diaSemana/);
  });

  it('debe contener reglas de inferencia de fechas', () => {
    expect(chatSource).toContain('MANEJO DE FECHAS');
    expect(chatSource).toContain('este mes');
    expect(chatSource).toContain('el mes pasado');
    expect(chatSource).toContain('este trimestre');
    expect(chatSource).toContain('NUNCA pidas confirmacion de año');
  });

  it('NO debe contener la instrucción de pedir aclaración agresiva', () => {
    expect(chatSource).not.toContain('Si la pregunta es ambigua, pide aclaracion');
  });
});

// ============================================================================
// FASE 1.3: Validación de Fechas
// ============================================================================

// Pure function extracted for testing — same logic that will be in chat.tsx
function validateDates(args: Record<string, unknown>): { date_from?: string; date_to?: string } {
  let { date_from, date_to } = args as { date_from?: string; date_to?: string };

  const clampDate = (d: string): string => {
    const parts = d.split('-').map(Number);
    const [y, m, day] = parts;
    if (!y || !m || !day) return d;
    const lastDay = new Date(y, m, 0).getDate();
    if (day > lastDay) {
      return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
    return d;
  };

  if (date_from) date_from = clampDate(date_from);
  if (date_to) date_to = clampDate(date_to);
  if (date_from && date_to && date_from > date_to) {
    [date_from, date_to] = [date_to, date_from];
  }

  return { date_from, date_to };
}

describe('Fase 1.3: validateDates', () => {
  it('clamps 2026-02-29 a 2026-02-28 (año no bisiesto)', () => {
    const result = validateDates({ date_from: '2026-01-01', date_to: '2026-02-29' });
    expect(result.date_to).toBe('2026-02-28');
  });

  it('clamps 2025-02-29 a 2025-02-28 (año no bisiesto)', () => {
    const result = validateDates({ date_from: '2025-02-01', date_to: '2025-02-29' });
    expect(result.date_to).toBe('2025-02-28');
  });

  it('acepta 2024-02-29 sin cambios (año bisiesto)', () => {
    const result = validateDates({ date_from: '2024-02-01', date_to: '2024-02-29' });
    expect(result.date_to).toBe('2024-02-29');
  });

  it('intercambia date_from > date_to', () => {
    const result = validateDates({ date_from: '2026-03-31', date_to: '2026-01-01' });
    expect(result.date_from).toBe('2026-01-01');
    expect(result.date_to).toBe('2026-03-31');
  });

  it('maneja fechas undefined', () => {
    const result = validateDates({});
    expect(result.date_from).toBeUndefined();
    expect(result.date_to).toBeUndefined();
  });

  it('no modifica fechas válidas', () => {
    const result = validateDates({ date_from: '2026-01-01', date_to: '2026-03-15' });
    expect(result.date_from).toBe('2026-01-01');
    expect(result.date_to).toBe('2026-03-15');
  });

  it('clamps 2026-04-31 a 2026-04-30', () => {
    const result = validateDates({ date_to: '2026-04-31' });
    expect(result.date_to).toBe('2026-04-30');
  });
});

describe('Fase 1.3: validateDates en chat.tsx', () => {
  it('chat.tsx debe contener función validateDates', () => {
    expect(chatSource).toContain('function validateDates');
  });

  it('debe agregar _parametros_usados cuando total_registros === 0', () => {
    expect(chatSource).toContain('_parametros_usados');
    expect(chatSource).toContain('_sugerencia');
  });
});

// ============================================================================
// FASE 2: Gráficos
// ============================================================================

describe('Fase 2: Instrucciones de Gráficos', () => {
  it('debe contener instrucción de incluir gráficos siempre', () => {
    expect(chatSource).toMatch(/SIEMPRE inclu(ye|ir) gráficos/i);
  });

  it('instrucciones de chart deben aparecer antes de DOMINIOS DE DATOS', () => {
    const chartPos = chatSource.indexOf('COMO CREAR GRAFICOS');
    const dominiosPos = chatSource.indexOf('DOMINIOS DE DATOS');
    // Chart instructions should come before data domains section
    expect(chartPos).toBeLessThan(dominiosPos);
    expect(chartPos).toBeGreaterThan(0);
  });
});

// ============================================================================
// FASE 3: Token Limits y Warnings
// ============================================================================

describe('Fase 3: Token Limits', () => {
  it('max_tokens en rondas de tool-calling debe ser 10000', () => {
    // In the llmToolLoop function, the tool-calling rounds should use 10000
    const loopSection = chatSource.slice(
      chatSource.indexOf('async function llmToolLoop'),
      chatSource.indexOf('// Auto-generate title') || chatSource.indexOf('async function generateTitle')
    );
    expect(loopSection).toContain('max_tokens: 10000');
    expect(loopSection).not.toContain('max_tokens: 4096');
  });
});

describe('Fase 3: Warning de límite de filas', () => {
  it('labor summary debe advertir cuando alcanza el límite de 2000 registros', () => {
    const laborSection = chatSource.slice(
      chatSource.indexOf('async function execLaborSummary'),
      chatSource.indexOf('async function execEmployeeActivity')
    );
    expect(laborSection).toContain('2000');
    expect(laborSection).toMatch(/advertencia|warning/i);
  });
});

// ============================================================================
// FASE 4: Monitoreo V2 + Clima
// ============================================================================

describe('Nuevos tools de monitoreo', () => {
  it('TOOLS array debe incluir get_conductivity_data', () => {
    expect(chatSource).toContain("name: 'get_conductivity_data'");
  });

  it('TOOLS array debe incluir get_beehive_data', () => {
    expect(chatSource).toContain("name: 'get_beehive_data'");
  });

  it('executeTool switch debe manejar get_conductivity_data', () => {
    expect(chatSource).toContain("case 'get_conductivity_data': result = await execConductivityData(args); break;");
  });

  it('executeTool switch debe manejar get_beehive_data', () => {
    expect(chatSource).toContain("case 'get_beehive_data': result = await execBeehiveData(args); break;");
  });

  it('execConductivityData debe existir como función', () => {
    expect(chatSource).toContain('async function execConductivityData(');
  });

  it('execBeehiveData debe existir como función', () => {
    expect(chatSource).toContain('async function execBeehiveData(');
  });

  it('get_conductivity_data debe describir umbrales semáforo', () => {
    const toolDefMatch = chatSource.match(/name: 'get_conductivity_data'[\s\S]*?description: '([^']*)'/);
    expect(toolDefMatch).toBeTruthy();
    expect(toolDefMatch![1]).toContain('semáforo');
  });

  it('get_beehive_data debe describir salud de colmenas', () => {
    const toolDefMatch = chatSource.match(/name: 'get_beehive_data'[\s\S]*?description: '([^']*)'/);
    expect(toolDefMatch).toBeTruthy();
    expect(toolDefMatch![1]).toContain('colmenas');
  });
});

describe('Monitoring data actualizado con floración', () => {
  it('execMonitoringData SELECT debe incluir floracion_brotes', () => {
    const monitoringQuery = chatSource.match(/async function execMonitoringData[\s\S]*?let query = `select=([^`]*)`/);
    expect(monitoringQuery).toBeTruthy();
    expect(monitoringQuery![1]).toContain('floracion_brotes');
  });

  it('execMonitoringData SELECT debe incluir floracion_flor_madura y floracion_cuaje', () => {
    const monitoringQuery = chatSource.match(/async function execMonitoringData[\s\S]*?let query = `select=([^`]*)`/);
    expect(monitoringQuery).toBeTruthy();
    expect(monitoringQuery![1]).toContain('floracion_flor_madura');
    expect(monitoringQuery![1]).toContain('floracion_cuaje');
  });

  it('execMonitoringData SELECT debe incluir ronda_id', () => {
    const monitoringQuery = chatSource.match(/async function execMonitoringData[\s\S]*?let query = `select=([^`]*)`/);
    expect(monitoringQuery).toBeTruthy();
    expect(monitoringQuery![1]).toContain('ronda_id');
  });

  it('resultado debe incluir resumen_floracion', () => {
    expect(chatSource).toContain('resumen_floracion');
    expect(chatSource).toContain('floracionTotal');
  });
});

describe('System prompt actualizado con nuevos dominios', () => {
  it('system prompt debe mencionar Conductividad', () => {
    const systemPrompt = chatSource.match(/export function getSystemPrompt[\s\S]*?return `([\s\S]*?)`;/);
    expect(systemPrompt).toBeTruthy();
    expect(systemPrompt![1]).toContain('Conductividad');
  });

  it('system prompt debe mencionar Colmenas', () => {
    const systemPrompt = chatSource.match(/export function getSystemPrompt[\s\S]*?return `([\s\S]*?)`;/);
    expect(systemPrompt).toBeTruthy();
    expect(systemPrompt![1]).toContain('Colmenas');
  });

  it('system prompt debe mencionar floración en monitoreo', () => {
    const systemPrompt = chatSource.match(/export function getSystemPrompt[\s\S]*?return `([\s\S]*?)`;/);
    expect(systemPrompt).toBeTruthy();
    expect(systemPrompt![1]).toContain('floración');
  });
});

describe('Climate data actualizado con radiación diaria', () => {
  it('daily breakdown debe incluir radiacion en el tipo', () => {
    expect(chatSource).toContain('radiacion: number[]');
  });

  it('daily breakdown debe incluir radiacion_avg y radiacion_max', () => {
    expect(chatSource).toContain('radiacion_avg');
    expect(chatSource).toContain('radiacion_max');
  });
});
