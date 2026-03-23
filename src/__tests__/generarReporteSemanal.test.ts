import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// TEST: Edge Function - Generación de reporte semanal con OpenRouter
// Nota: Este test verifica la lógica de formateo de datos, parseo de JSON
// de OpenRouter (OpenAI-compatible), y construcción determinística del HTML.
// No llama a la API real de OpenRouter.
// ============================================================================

// Mock global fetch para simular OpenRouter API + Supabase PostgREST + Notion
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock Deno.env para las env vars
vi.stubGlobal('Deno', {
  env: {
    get: vi.fn((key: string) => {
      if (key === 'OPENROUTER_API_KEY') return 'test-api-key-12345';
      // Return undefined for SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/NOTION_TOKEN
      // so fetchHistoricoSemanas and fetchResumenesNotion return '' early
      return undefined;
    }),
  },
  serve: vi.fn(),
});

// Import the module under test
import { generarReporteSemanal } from '../supabase/functions/server/generar-reporte-semanal';

// ============================================================================
// FIXTURES
// ============================================================================

const MOCK_DATOS_COMPLETOS = {
  semana: {
    inicio: '2026-02-09',
    fin: '2026-02-15',
    numero: 7,
    ano: 2026,
  },
  personal: {
    totalTrabajadores: 8,
    empleados: 5,
    contratistas: 3,
    fallas: 2,
    permisos: 1,
  },
  jornales: {
    actividades: ['Fumigación', 'Fertilización', 'Poda'],
    lotes: ['Lote PP', 'Lote ST', 'Lote AU'],
    datos: {
      'Fumigación': {
        'Lote PP': { jornales: 3.5, costo: 175000 },
        'Lote ST': { jornales: 2.0, costo: 100000 },
      },
      'Fertilización': {
        'Lote PP': { jornales: 1.0, costo: 60000 },
        'Lote AU': { jornales: 2.5, costo: 137500 },
      },
      'Poda': {
        'Lote ST': { jornales: 1.5, costo: 75000 },
      },
    },
    totalesPorActividad: {
      'Fumigación': { jornales: 5.5, costo: 275000 },
      'Fertilización': { jornales: 3.5, costo: 197500 },
      'Poda': { jornales: 1.5, costo: 75000 },
    },
    totalesPorLote: {
      'Lote PP': { jornales: 4.5, costo: 235000 },
      'Lote ST': { jornales: 3.5, costo: 175000 },
      'Lote AU': { jornales: 2.5, costo: 137500 },
    },
    totalGeneral: { jornales: 10.5, costo: 547500 },
  },
  aplicaciones: {
    planeadas: [
      {
        id: 'app-1',
        nombre: 'Fumigación contra Monalonion',
        tipo: 'Fumigación',
        proposito: 'Control de Monalonion en aumento',
        blancosBiologicos: ['Monalonion'],
        fechaInicioPlaneada: '2026-02-20',
        listaCompras: [
          { productoNombre: 'Imidacloprid', categoria: 'Insecticida', cantidadNecesaria: 5, unidad: 'Litros', costoEstimado: 250000 },
        ],
        costoTotalEstimado: 250000,
      },
    ],
    activas: [
      {
        id: 'app-2',
        nombre: 'Fertilización foliar',
        tipo: 'Fertilización',
        proposito: 'Nutrición post-cosecha',
        estado: 'En ejecución',
        fechaInicio: '2026-02-05',
        totalPlaneado: 35,
        totalEjecutado: 23,
        porcentajeGlobal: 65.7,
        unidad: 'bultos',
        progresoPorLote: [
          { loteNombre: 'Lote PP', planeado: 20, ejecutado: 15, porcentaje: 75, unidad: 'bultos' },
          { loteNombre: 'Lote ST', planeado: 15, ejecutado: 8, porcentaje: 53.3, unidad: 'bultos' },
        ],
      },
    ],
  },
  monitoreo: {
    fechaActual: '2026-02-15',
    fechaAnterior: '2026-02-08',
    avisoFechaDesactualizada: null,
    resumenGlobal: [
      {
        plagaNombre: 'Monalonion',
        esPlaga_interes: true,
        promedioActual: 27.1,
        minLote: 27.1,
        maxLote: 27.1,
        promedioAnterior: 14.3,
        tendencia: 'subiendo',
      },
    ],
    vistasPorLote: [
      {
        loteId: 'lote-1',
        loteNombre: 'Lote PP',
        sinDatos: false,
        plagas: [
          { plagaNombre: 'Monalonion', esPlaga_interes: true, actual: 27.1, anterior: 14.3, tendencia: 'subiendo' },
        ],
      },
      {
        loteId: 'lote-2',
        loteNombre: 'Lote ST',
        sinDatos: true,
        plagas: [],
      },
    ],
    vistasPorSublote: [
      {
        loteId: 'lote-1',
        loteNombre: 'Lote PP',
        sinDatos: false,
        sublotes: ['Sublote A', 'Sublote B'],
        plagas: ['Monalonion'],
        celdas: {
          'Monalonion': {
            'Sublote A': { actual: 20, anterior: 14.3, tendencia: 'subiendo' },
            'Sublote B': { actual: 34.3, anterior: null, tendencia: 'sin_referencia' },
          },
        },
      },
    ],
    tendencias: [
      { fecha: '2026-02-08', plagaNombre: 'Monalonion', incidenciaPromedio: 14.3 },
      { fecha: '2026-02-15', plagaNombre: 'Monalonion', incidenciaPromedio: 27.1 },
    ],
    detallePorLote: [
      {
        loteNombre: 'Lote PP',
        sublotes: [
          { subloteNombre: 'Sublote A', plagaNombre: 'Monalonion', incidencia: 20, gravedad: 'Media', arboresAfectados: 7, arboresMonitoreados: 35 },
          { subloteNombre: 'Sublote B', plagaNombre: 'Monalonion', incidencia: 34.3, gravedad: 'Alta', arboresAfectados: 12, arboresMonitoreados: 35 },
        ],
      },
    ],
    insights: [
      {
        tipo: 'urgente',
        titulo: 'Monalonion crítica en Lote PP',
        descripcion: 'Incidencia promedio de 27.1% - requiere atención inmediata',
        plaga: 'Monalonion',
        lote: 'Lote PP',
        incidenciaActual: 27.1,
        accion: 'Evaluar aplicación de tratamiento',
      },
    ],
    fechasMonitoreo: ['2026-02-15', '2026-02-08'],
  },
  temasAdicionales: [
    {
      tipo: 'texto',
      titulo: 'Notas del agrónomo',
      contenido: '- Se observaron condiciones de alta humedad\n- Revisar drenaje en Lote PP',
    },
  ],
};

// OpenRouter analysis JSON (same semantic content, matches updated AnalisisGemini type)
const MOCK_LLM_ANALYSIS = {
  resumen_ejecutivo: 'Semana 7 con 10.5 jornales totales por un costo de $547,500 COP. Se registra una alerta urgente por Monalonion en Lote PP con incidencia en aumento.',
  titulares: {
    personal: '8 trabajadores activos — 2 fallas y 1 permiso reducen capacidad',
    labores: 'Labores programadas para la semana',
    jornales: '10.5 jornales — Fumigación concentra 52% del esfuerzo',
    monitoreo: 'Alerta crítica: Monalonion al 27.1% en Lote PP',
    aplicaciones: 'Fertilización foliar al 65.7% — Lote ST rezagado',
  },
  conclusiones: [
    { texto: 'Priorizar tratamiento contra Monalonion en Lote PP - incidencia en 27.1% y en ascenso', prioridad: 'alta', contexto: 'Tendencia ascendente sostenida en últimas 3 semanas' },
    { texto: 'Evaluar cobertura de fertilización foliar en Lote ST (53.3% de avance vs 75% en Lote PP)', prioridad: 'media', contexto: 'Rezago significativo respecto a Lote PP' },
    { texto: 'Continuar monitoreo semanal de plagas para detectar cambios tempranos', prioridad: 'baja', contexto: 'Monitoreo regular es clave para detección temprana' },
  ],
  interpretacion_monitoreo: 'La incidencia de Monalonion muestra una tendencia ascendente sostenida: 12.5% → 18.3% → 27.1% en las últimas 3 semanas. Se requiere intervención inmediata.',
  interpretacion_tendencias_monitoreo: 'Monalonion ha duplicado su incidencia en 3 semanas, superando umbrales de acción.',
};

// OpenRouter response format (OpenAI-compatible)
const MOCK_OPENROUTER_RESPONSE = {
  choices: [
    {
      message: {
        content: JSON.stringify(MOCK_LLM_ANALYSIS),
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 300,
    completion_tokens: 150,
    total_tokens: 450,
  },
};

const MOCK_OPENROUTER_RESPONSE_WITH_MARKDOWN = {
  choices: [
    {
      message: {
        content: '```json\n' + JSON.stringify(MOCK_LLM_ANALYSIS) + '\n```',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 300,
    completion_tokens: 160,
    total_tokens: 460,
  },
};

// ============================================================================
// TESTS
// ============================================================================

describe('Edge Function: generarReporteSemanal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Validación de entrada', () => {
    it('rechaza cuando no se proporcionan datos', async () => {
      const resultado = await generarReporteSemanal({ datos: null as any });
      expect(resultado.success).toBe(false);
      expect(resultado.error).toContain('no proporcionados');
    });

    it('rechaza cuando faltan datos de semana', async () => {
      const resultado = await generarReporteSemanal({ datos: { personal: {} } as any });
      expect(resultado.success).toBe(false);
      expect(resultado.error).toContain('no proporcionados');
    });
  });

  describe('Llamada a OpenRouter API', () => {
    it('llama a OpenRouter con el modelo correcto y Authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      // Verifica URL de OpenRouter
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer test-api-key-12345');
    });

    it('envía datos formateados en el body con formato OpenAI-compatible', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      // Verifica estructura del request (OpenAI-compatible messages array)
      expect(body.messages).toBeDefined();
      expect(body.messages.length).toBe(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');

      // System message debe contener el prompt del sistema
      const systemPrompt = body.messages[0].content;
      expect(systemPrompt).toContain('Escocia Hass');
      expect(systemPrompt).toContain('JSON');

      // User message debe contener los datos formateados
      const userMessage = body.messages[1].content;
      expect(userMessage).toContain('Semana 7');
      expect(userMessage).toContain('Fumigación');
      expect(userMessage).toContain('Monalonion');
      expect(userMessage).toContain('Lote PP');
    });

    it('incluye instrucciones adicionales si se proporcionan', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      await generarReporteSemanal({
        datos: MOCK_DATOS_COMPLETOS,
        instrucciones: 'Enfatizar los problemas con Monalonion',
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const userMessage = body.messages[1].content;

      expect(userMessage).toContain('Enfatizar los problemas con Monalonion');
    });

    it('usa temperatura baja (0.3) para consistencia', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.temperature).toBe(0.3);
    });

    it('solicita respuesta en formato JSON con max_tokens correcto', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.max_tokens).toBe(4096);
      expect(body.model).toBe('google/gemini-3.1-flash-lite-preview');
    });
  });

  describe('Procesamiento de respuesta — HTML determinístico', () => {
    it('retorna HTML determinístico con todas las secciones', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.success).toBe(true);
      expect(resultado.html).toContain('<!DOCTYPE html>');
      expect(resultado.html).toContain('ESCOCIA HASS');
      expect(resultado.html).toContain('Informe Semanal');
      expect(resultado.html).toContain('S7/2026');
    });

    it('incluye KPI cards con datos correctos', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.html).toContain('Jornales');
      expect(resultado.html).toContain('Costo Total');
      expect(resultado.html).toContain('Trabajadores');
      expect(resultado.html).toContain('Aplicaciones');
      expect(resultado.html).toContain('Alertas');
    });

    it('incluye heatmap de jornales con actividades y lotes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      // Slide uses section header "LABORES" with heatmap table inside
      expect(resultado.html).toContain('LABORES');
      expect(resultado.html).toContain('Fumigación');
      expect(resultado.html).toContain('Fertilización');
      expect(resultado.html).toContain('Poda');
      expect(resultado.html).toContain('Lote PP');
      expect(resultado.html).toContain('Lote ST');
      expect(resultado.html).toContain('Lote AU');
    });

    it('incluye aplicaciones con barras de progreso', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.html).toContain('Fertilización foliar');
      expect(resultado.html).toContain('65.7%');
      // fmtN formats integers with 1 decimal: 23.0/35.0
      expect(resultado.html).toContain('23.0/35.0');
    });

    it('incluye monitoreo con badges de gravedad', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      // Slide section is "MONITOREO" with table headers for plague data
      expect(resultado.html).toContain('MONITOREO');
      expect(resultado.html).toContain('Monalonion');
      expect(resultado.html).toContain('Incidencia Promedio');
    });

    it('incluye conclusiones del análisis del LLM', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.html).toContain('Conclusiones y Recomendaciones');
      expect(resultado.html).toContain('Priorizar tratamiento contra Monalonion');
      // LLM analysis is shown in the monitoring slide's ANÁLISIS section
      expect(resultado.html).toContain('incidencia de Monalonion muestra una tendencia ascendente');
    });

    it('incluye resumen ejecutivo del análisis del LLM', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      // CSS text-transform:uppercase renders it visually as uppercase but HTML text is mixed case
      expect(resultado.html).toContain('Resumen Ejecutivo');
      expect(resultado.html).toContain('10.5 jornales totales');
    });

    it('parsea JSON del LLM envuelto en markdown fences', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE_WITH_MARKDOWN),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.success).toBe(true);
      expect(resultado.html).toContain('ESCOCIA HASS');
      expect(resultado.html).toContain('Priorizar tratamiento contra Monalonion');
    });

    it('usa análisis fallback cuando el LLM retorna JSON inválido', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'not valid json at all' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 50, completion_tokens: 50, total_tokens: 100 },
        }),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      // Should succeed with fallback analysis
      expect(resultado.success).toBe(true);
      expect(resultado.html).toContain('ESCOCIA HASS');
      expect(resultado.html).toContain('Semana operativa procesada');
    });

    it('incluye conteo de tokens usados', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.tokens_usados).toBe(450);
    });

    it('incluye temas adicionales cuando están presentes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.html).toContain('ADICIONALES');
      expect(resultado.html).toContain('Notas del agrónomo');
      expect(resultado.html).toContain('alta humedad');
    });
  });

  describe('Manejo de errores', () => {
    it('maneja error de API (HTTP no-ok)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.success).toBe(false);
      expect(resultado.error).toContain('Error de OpenRouter API');
      expect(resultado.error).toContain('429');
    });

    it('maneja error de red (fetch throw)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.success).toBe(false);
      expect(resultado.error).toContain('Network error');
    });

    it('maneja API key faltante', async () => {
      // Override Deno.env.get to return undefined for API key
      const originalGet = (globalThis as any).Deno.env.get;
      (globalThis as any).Deno.env.get = vi.fn(() => undefined);

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.success).toBe(false);
      expect(resultado.error).toContain('OPENROUTER_API_KEY');

      // Restore
      (globalThis as any).Deno.env.get = originalGet;
    });

    it('maneja respuesta de content_filter de OpenRouter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '' }, finish_reason: 'content_filter' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.success).toBe(false);
      expect(resultado.error).toContain('filtros de contenido');
    });
  });

  describe('Formateo de datos para el prompt', () => {
    it('incluye todos los datos de personal en el prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.messages[1].content;

      expect(texto).toContain('Total trabajadores: 8');
      expect(texto).toContain('Empleados: 5');
      expect(texto).toContain('Contratistas: 3');
      expect(texto).toContain('Fallas: 2');
      expect(texto).toContain('Permisos: 1');
    });

    it('incluye la matriz de jornales en el prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.messages[1].content;

      expect(texto).toContain('DISTRIBUCION DE JORNALES');
      expect(texto).toContain('10.50 jornales');
      expect(texto).toContain('Fumigación');
      expect(texto).toContain('Fertilización');
      expect(texto).toContain('Poda');
    });

    it('incluye aplicaciones planeadas con lista de compras', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.messages[1].content;

      expect(texto).toContain('APLICACIONES PLANEADAS');
      expect(texto).toContain('Fumigación contra Monalonion');
      // Individual product names are no longer in the prompt (only count), check product count
      expect(texto).toContain('Productos: 1 items');
    });

    it('incluye aplicaciones activas con progreso', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.messages[1].content;

      expect(texto).toContain('APLICACIONES EN EJECUCION');
      expect(texto).toContain('Fertilización foliar');
      expect(texto).toContain('23/35');
      expect(texto).toContain('65.7%');
    });

    it('incluye datos de monitoreo con tendencias e insights', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.messages[1].content;

      expect(texto).toContain('MONITOREO FITOSANITARIO');
      expect(texto).toContain('Monalonion');
      expect(texto).toContain('Resumen general');
      expect(texto).toContain('URGENTE');
    });

    it('incluye temas adicionales', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.messages[1].content;

      expect(texto).toContain('TEMAS ADICIONALES');
      expect(texto).toContain('Notas del agrónomo');
      expect(texto).toContain('alta humedad');
    });

    it('omite secciones vacías (sin aplicaciones planeadas)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENROUTER_RESPONSE),
      });

      const datosMinimos = {
        ...MOCK_DATOS_COMPLETOS,
        aplicaciones: { planeadas: [], activas: [] },
        temasAdicionales: [],
      };

      await generarReporteSemanal({ datos: datosMinimos });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.messages[1].content;

      expect(texto).not.toContain('APLICACIONES PLANEADAS');
      expect(texto).not.toContain('APLICACIONES EN EJECUCION');
      expect(texto).not.toContain('TEMAS ADICIONALES');
    });
  });
});
