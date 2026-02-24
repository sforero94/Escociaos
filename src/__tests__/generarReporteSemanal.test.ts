import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// TEST: Edge Function - Generación de reporte semanal con Gemini
// Nota: Este test verifica la lógica de formateo de datos, parseo de JSON
// de Gemini, y construcción determinística del HTML.
// No llama a la API real de Gemini.
// ============================================================================

// Mock global fetch para simular Gemini API
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock Deno.env para la API key
vi.stubGlobal('Deno', {
  env: {
    get: vi.fn((key: string) => {
      if (key === 'GEMINI_API_KEY') return 'test-api-key-12345';
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
    tendencias: [
      { fecha: '2026-02-01', plagaNombre: 'Monalonion', incidenciaPromedio: 12.5 },
      { fecha: '2026-02-08', plagaNombre: 'Monalonion', incidenciaPromedio: 18.3 },
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
    fechasMonitoreo: ['2026-02-15', '2026-02-08', '2026-02-01'],
  },
  temasAdicionales: [
    {
      tipo: 'texto',
      titulo: 'Notas del agrónomo',
      contenido: '- Se observaron condiciones de alta humedad\n- Revisar drenaje en Lote PP',
    },
  ],
};

// Gemini now returns full JSON analysis
const MOCK_GEMINI_ANALYSIS = {
  resumen_ejecutivo: 'Semana 7 con 10.5 jornales totales por un costo de $547,500 COP. Se registra una alerta urgente por Monalonion en Lote PP con incidencia en aumento.',
  highlights: [
    '10.5 jornales totales',
    'Monalonion en aumento',
    'Fertilización foliar al 65.7%',
  ],
  alertas: [
    {
      nivel: 'urgente',
      titulo: 'Monalonion crítica en Lote PP',
      descripcion: 'Incidencia promedio de 27.1% y en ascenso sostenido',
      accion: 'Evaluar aplicación de tratamiento urgente',
    },
  ],
  conclusiones: [
    { icono: '🔴', texto: 'Priorizar tratamiento contra Monalonion en Lote PP - incidencia en 27.1% y en ascenso', prioridad: 'alta' },
    { icono: '⚠️', texto: 'Evaluar cobertura de fertilización foliar en Lote ST (53.3% de avance vs 75% en Lote PP)', prioridad: 'media' },
    { icono: '✅', texto: 'Continuar monitoreo semanal de plagas para detectar cambios tempranos', prioridad: 'baja' },
  ],
  analisis_jornales: 'Se registraron 10.5 jornales con costo total de $547,500 COP. Fumigación concentra el mayor esfuerzo con 5.5 jornales.',
  analisis_aplicaciones: 'La fertilización foliar avanza al 65.7% con buen ritmo en Lote PP (75%) pero rezago en Lote ST (53.3%).',
  analisis_monitoreo: 'Tendencia ascendente sostenida de Monalonion: 12.5% → 18.3% → 27.1% en 3 semanas.',
  interpretacion_monitoreo: 'La incidencia de Monalonion muestra una tendencia ascendente sostenida: 12.5% → 18.3% → 27.1% en las últimas 3 semanas. Se requiere intervención inmediata.',
  recomendaciones: [
    'Programar fumigación contra Monalonion en Lote PP esta semana',
    'Reforzar fertilización foliar en Lote ST para alcanzar mínimo 70%',
    'Continuar monitoreo fitosanitario semanal',
  ],
  narrativa_semana: 'La semana 7 se caracterizó por una operación de 10.5 jornales enfocada principalmente en fumigación y fertilización. El principal reto es el incremento sostenido de Monalonion en Lote PP, que requiere intervención urgente.',
};

const MOCK_GEMINI_RESPONSE = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify(MOCK_GEMINI_ANALYSIS),
          },
        ],
      },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: {
    totalTokenCount: 450,
  },
};

const MOCK_GEMINI_RESPONSE_WITH_MARKDOWN = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: '```json\n' + JSON.stringify(MOCK_GEMINI_ANALYSIS) + '\n```',
          },
        ],
      },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: { totalTokenCount: 460 },
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

  describe('Llamada a Gemini API', () => {
    it('llama a Gemini con el modelo correcto y API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      // Verifica URL con modelo y API key
      expect(url).toContain('gemini-2.5-flash-preview-05-20');
      expect(url).toContain('key=test-api-key-12345');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('envía datos formateados en el body del request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      // Verifica estructura del request a Gemini
      expect(body.contents).toBeDefined();
      expect(body.contents[0].role).toBe('user');
      expect(body.contents[0].parts.length).toBe(2);

      // El primer part debe ser el system prompt
      const systemPrompt = body.contents[0].parts[0].text;
      expect(systemPrompt).toContain('Escocia Hass');
      expect(systemPrompt).toContain('JSON');

      // El segundo part debe contener los datos formateados
      const datosFormateados = body.contents[0].parts[1].text;
      expect(datosFormateados).toContain('Semana 7');
      expect(datosFormateados).toContain('Fumigación');
      expect(datosFormateados).toContain('Monalonion');
      expect(datosFormateados).toContain('Lote PP');
    });

    it('incluye instrucciones adicionales si se proporcionan', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      await generarReporteSemanal({
        datos: MOCK_DATOS_COMPLETOS,
        instrucciones: 'Enfatizar los problemas con Monalonion',
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const datosFormateados = body.contents[0].parts[1].text;

      expect(datosFormateados).toContain('Enfatizar los problemas con Monalonion');
    });

    it('usa temperatura baja (0.3) para consistencia', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.generationConfig.temperature).toBe(0.3);
    });

    it('solicita respuesta en formato JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(body.generationConfig.maxOutputTokens).toBe(4096);
    });
  });

  describe('Procesamiento de respuesta — HTML determinístico', () => {
    it('retorna HTML determinístico con todas las secciones', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.success).toBe(true);
      expect(resultado.html).toContain('<!DOCTYPE html>');
      expect(resultado.html).toContain('ESCOCIA HASS');
      expect(resultado.html).toContain('Reporte Semanal');
      expect(resultado.html).toContain('Semana 7 / 2026');
    });

    it('incluye KPI cards con datos correctos', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.html).toContain('Total Jornales');
      expect(resultado.html).toContain('Costo Total');
      expect(resultado.html).toContain('Trabajadores');
      expect(resultado.html).toContain('Aplicaciones');
      expect(resultado.html).toContain('Alertas Fito');
    });

    it('incluye heatmap de jornales con actividades y lotes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.html).toContain('Distribución de Jornales');
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
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.html).toContain('Fertilización foliar');
      expect(resultado.html).toContain('65.7%');
      expect(resultado.html).toContain('23/35');
    });

    it('incluye monitoreo con badges de gravedad', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.html).toContain('Monitoreo Fitosanitario');
      expect(resultado.html).toContain('Monalonion');
      expect(resultado.html).toContain('Media');
      expect(resultado.html).toContain('Alta');
    });

    it('incluye conclusiones del análisis de Gemini', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.html).toContain('Conclusiones y Recomendaciones');
      expect(resultado.html).toContain('Priorizar tratamiento contra Monalonion');
      expect(resultado.html).toContain('incidencia de Monalonion muestra una tendencia ascendente');
    });

    it('incluye resumen ejecutivo del análisis de Gemini', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.html).toContain('RESUMEN EJECUTIVO');
      expect(resultado.html).toContain('10.5 jornales totales');
    });

    it('parsea JSON de Gemini envuelto en markdown fences', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE_WITH_MARKDOWN),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.success).toBe(true);
      expect(resultado.html).toContain('ESCOCIA HASS');
      expect(resultado.html).toContain('Priorizar tratamiento contra Monalonion');
    });

    it('usa análisis fallback cuando Gemini retorna JSON inválido', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'not valid json at all' }] }, finishReason: 'STOP' }],
          usageMetadata: { totalTokenCount: 100 },
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
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.tokens_usados).toBe(450);
    });

    it('incluye temas adicionales cuando están presentes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.html).toContain('Temas Adicionales');
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
      expect(resultado.error).toContain('Error de Gemini API');
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
      expect(resultado.error).toContain('GEMINI_API_KEY');

      // Restore
      (globalThis as any).Deno.env.get = originalGet;
    });

    it('maneja respuesta de seguridad de Gemini', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'SAFETY' }],
          usageMetadata: { totalTokenCount: 0 },
        }),
      });

      const resultado = await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      expect(resultado.success).toBe(false);
      expect(resultado.error).toContain('filtros de seguridad');
    });
  });

  describe('Formateo de datos para el prompt', () => {
    it('incluye todos los datos de personal en el prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.contents[0].parts[1].text;

      expect(texto).toContain('Total trabajadores: 8');
      expect(texto).toContain('Empleados: 5');
      expect(texto).toContain('Contratistas: 3');
      expect(texto).toContain('Fallas: 2');
      expect(texto).toContain('Permisos: 1');
    });

    it('incluye la matriz de jornales en el prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.contents[0].parts[1].text;

      expect(texto).toContain('DISTRIBUCIÓN DE JORNALES');
      expect(texto).toContain('10.50 jornales');
      expect(texto).toContain('Fumigación');
      expect(texto).toContain('Fertilización');
      expect(texto).toContain('Poda');
    });

    it('incluye aplicaciones planeadas con lista de compras', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.contents[0].parts[1].text;

      expect(texto).toContain('APLICACIONES PLANEADAS');
      expect(texto).toContain('Fumigación contra Monalonion');
      expect(texto).toContain('Imidacloprid');
    });

    it('incluye aplicaciones activas con progreso', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.contents[0].parts[1].text;

      expect(texto).toContain('APLICACIONES EN EJECUCIÓN');
      expect(texto).toContain('Fertilización foliar');
      expect(texto).toContain('23/35');
      expect(texto).toContain('65.7%');
    });

    it('incluye datos de monitoreo con tendencias e insights', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.contents[0].parts[1].text;

      expect(texto).toContain('MONITOREO FITOSANITARIO');
      expect(texto).toContain('Monalonion');
      expect(texto).toContain('Tendencias');
      expect(texto).toContain('URGENTE');
    });

    it('incluye temas adicionales', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      await generarReporteSemanal({ datos: MOCK_DATOS_COMPLETOS });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.contents[0].parts[1].text;

      expect(texto).toContain('TEMAS ADICIONALES');
      expect(texto).toContain('Notas del agrónomo');
      expect(texto).toContain('alta humedad');
    });

    it('omite secciones vacías (sin aplicaciones planeadas)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_GEMINI_RESPONSE),
      });

      const datosMinimos = {
        ...MOCK_DATOS_COMPLETOS,
        aplicaciones: { planeadas: [], activas: [] },
        temasAdicionales: [],
      };

      await generarReporteSemanal({ datos: datosMinimos });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const texto = body.contents[0].parts[1].text;

      expect(texto).not.toContain('APLICACIONES PLANEADAS');
      expect(texto).not.toContain('APLICACIONES EN EJECUCIÓN');
      expect(texto).not.toContain('TEMAS ADICIONALES');
    });
  });
});
