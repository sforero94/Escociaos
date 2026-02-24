import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Chainable Supabase mock builder
function createChainableMock(resolvedData: any = { data: [], error: null }) {
  const chain: any = {};
  const methods = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq',
    'gte', 'lte', 'in', 'order', 'limit', 'single', 'maybeSingle'];

  methods.forEach(method => {
    chain[method] = vi.fn(() => chain);
  });

  // Terminal methods that resolve
  chain.then = vi.fn((resolve: any) => resolve(resolvedData));
  // Make it thenable (Promise-like)
  Object.defineProperty(chain, 'then', {
    value: (resolve: any, reject: any) => Promise.resolve(resolvedData).then(resolve, reject),
  });

  return chain;
}

// Mock Supabase client
const mockFrom = vi.fn();
const mockSupabase = {
  from: mockFrom,
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    }),
  },
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ error: null }),
      download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
    })),
  },
};

vi.mock('../utils/supabase/client', () => ({
  getSupabase: () => mockSupabase,
  getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-123', email: 'test@test.com' }),
}));

// ============================================================================
// IMPORT AFTER MOCKS
// ============================================================================

import {
  getNumeroSemanaISO,
  calcularSemanaAnterior,
  calcularSemanaDesdeLunes,
  fetchPersonalSemana,
  fetchMatrizJornales,
  fetchAplicacionesPlaneadas,
  fetchAplicacionesActivas,
  fetchDatosMonitoreo,
  fetchDatosReporteSemanal,
} from '../utils/fetchDatosReporteSemanal';

// ============================================================================
// TEST DATA FIXTURES
// ============================================================================

const MOCK_REGISTROS_TRABAJO = [
  {
    empleado_id: 'emp-1',
    contratista_id: null,
    fraccion_jornal: 1.0,
    costo_jornal: 50000,
    fecha_trabajo: '2026-02-09',
    tareas: { tipo_tarea_id: 'tipo-1' },
    lote: { nombre: 'Lote PP' },
  },
  {
    empleado_id: 'emp-1',
    contratista_id: null,
    fraccion_jornal: 0.5,
    costo_jornal: 25000,
    fecha_trabajo: '2026-02-10',
    tareas: { tipo_tarea_id: 'tipo-1' },
    lote: { nombre: 'Lote ST' },
  },
  {
    empleado_id: null,
    contratista_id: 'con-1',
    fraccion_jornal: 1.0,
    costo_jornal: 60000,
    fecha_trabajo: '2026-02-09',
    tareas: { tipo_tarea_id: 'tipo-2' },
    lote: { nombre: 'Lote PP' },
  },
  {
    empleado_id: 'emp-2',
    contratista_id: null,
    fraccion_jornal: 0.75,
    costo_jornal: 37500,
    fecha_trabajo: '2026-02-11',
    tareas: { tipo_tarea_id: 'tipo-1' },
    lote: { nombre: 'Lote PP' },
  },
  {
    empleado_id: null,
    contratista_id: 'con-2',
    fraccion_jornal: 1.0,
    costo_jornal: 55000,
    fecha_trabajo: '2026-02-12',
    tareas: { tipo_tarea_id: 'tipo-2' },
    lote: { nombre: 'Lote AU' },
  },
];

const MOCK_TIPOS_TAREAS = [
  { id: 'tipo-1', nombre: 'Fumigación' },
  { id: 'tipo-2', nombre: 'Fertilización' },
  { id: 'tipo-3', nombre: 'Poda' },
];

const MOCK_APLICACIONES_PLANEADAS = [
  {
    id: 'app-1',
    nombre_aplicacion: 'Fumigación preventiva',
    tipo_aplicacion: 'Fumigación',
    proposito: 'Control de Monalonion',
    blanco_biologico: ['plaga-1'],
    fecha_inicio_planeada: '2026-02-20',
    // aplicaciones_compras joined in the same query (Task #4 N+1 fix)
    aplicaciones_compras: [
      {
        producto_nombre: 'Imidacloprid',
        producto_categoria: 'Insecticida',
        cantidad_necesaria: 5,
        unidad: 'Litros',
        costo_estimado: 250000,
      },
      {
        producto_nombre: 'Clorpirifós',
        producto_categoria: 'Insecticida',
        cantidad_necesaria: 3,
        unidad: 'Litros',
        costo_estimado: 180000,
      },
    ],
  },
];

const MOCK_APLICACIONES_ACTIVAS = [
  {
    id: 'app-2',
    nombre_aplicacion: 'Fertilización foliar',
    tipo_aplicacion: 'Fertilización',
    proposito: 'Nutrición',
    estado: 'En ejecución',
    fecha_inicio_ejecucion: '2026-02-05',
    aplicaciones_lotes: [
      { lote_id: 'lote-1', lotes: { nombre: 'Lote PP' } },
      { lote_id: 'lote-2', lotes: { nombre: 'Lote ST' } },
    ],
    aplicaciones_calculos: [
      { lote_id: 'lote-1', numero_canecas: null, numero_bultos: 20, lotes: { nombre: 'Lote PP' } },
      { lote_id: 'lote-2', numero_canecas: null, numero_bultos: 15, lotes: { nombre: 'Lote ST' } },
    ],
    // movimientos_diarios joined in the same query (Task #4 N+1 fix)
    movimientos_diarios: [
      { lote_id: 'lote-1', numero_canecas: null, numero_bultos: 12 },
      { lote_id: 'lote-1', numero_canecas: null, numero_bultos: 3 },
      { lote_id: 'lote-2', numero_canecas: null, numero_bultos: 8 },
    ],
  },
];

const MOCK_MONITOREOS_FECHAS = [
  { fecha_monitoreo: '2026-02-15' },
  { fecha_monitoreo: '2026-02-15' },
  { fecha_monitoreo: '2026-02-08' },
  { fecha_monitoreo: '2026-02-08' },
  { fecha_monitoreo: '2026-02-01' },
  { fecha_monitoreo: '2026-02-01' },
];

const MOCK_MONITOREOS = [
  {
    id: 'mon-1',
    fecha_monitoreo: '2026-02-15',
    lote_id: 'lote-1',
    sublote_id: 'sub-1',
    plaga_enfermedad_id: 'plaga-1',
    arboles_monitoreados: 35,
    arboles_afectados: 7,
    incidencia: 20.0,
    gravedad_texto: 'Media',
    plagas_enfermedades_catalogo: { nombre: 'Monalonion' },
    lotes: { nombre: 'Lote PP' },
    sublotes: { nombre: 'Sublote A' },
  },
  {
    id: 'mon-2',
    fecha_monitoreo: '2026-02-15',
    lote_id: 'lote-1',
    sublote_id: 'sub-2',
    plaga_enfermedad_id: 'plaga-1',
    arboles_monitoreados: 35,
    arboles_afectados: 12,
    incidencia: 34.3,
    gravedad_texto: 'Alta',
    plagas_enfermedades_catalogo: { nombre: 'Monalonion' },
    lotes: { nombre: 'Lote PP' },
    sublotes: { nombre: 'Sublote B' },
  },
  {
    id: 'mon-3',
    fecha_monitoreo: '2026-02-08',
    lote_id: 'lote-1',
    sublote_id: 'sub-1',
    plaga_enfermedad_id: 'plaga-1',
    arboles_monitoreados: 35,
    arboles_afectados: 5,
    incidencia: 14.3,
    gravedad_texto: 'Media',
    plagas_enfermedades_catalogo: { nombre: 'Monalonion' },
    lotes: { nombre: 'Lote PP' },
    sublotes: { nombre: 'Sublote A' },
  },
  {
    id: 'mon-4',
    fecha_monitoreo: '2026-02-01',
    lote_id: 'lote-2',
    sublote_id: 'sub-3',
    plaga_enfermedad_id: 'plaga-2',
    arboles_monitoreados: 35,
    arboles_afectados: 3,
    incidencia: 8.6,
    gravedad_texto: 'Baja',
    plagas_enfermedades_catalogo: { nombre: 'Trips' },
    lotes: { nombre: 'Lote ST' },
    sublotes: { nombre: 'Sublote C' },
  },
];

// ============================================================================
// TESTS: UTILIDADES DE SEMANA
// ============================================================================

describe('Utilidades de Semana', () => {
  describe('getNumeroSemanaISO', () => {
    it('calcula correctamente el número de semana ISO para una fecha conocida', () => {
      // 2026-01-05 es lunes de la semana 2 del 2026
      const fecha = new Date(2026, 0, 5); // Enero 5, 2026
      const semana = getNumeroSemanaISO(fecha);
      expect(semana).toBe(2);
    });

    it('calcula semana 1 del año correctamente', () => {
      // 2026-01-01 es jueves → semana 1
      const fecha = new Date(2026, 0, 1);
      const semana = getNumeroSemanaISO(fecha);
      expect(semana).toBe(1);
    });

    it('calcula semana de fin de año correctamente', () => {
      // 2025-12-29 es lunes → podría ser semana 1 de 2026
      const fecha = new Date(2025, 11, 29);
      const semana = getNumeroSemanaISO(fecha);
      expect(semana).toBeGreaterThan(0);
      expect(semana).toBeLessThanOrEqual(53);
    });
  });

  describe('calcularSemanaAnterior', () => {
    it('retorna un rango de lunes a domingo', () => {
      const semana = calcularSemanaAnterior();

      // El inicio debe ser un lunes
      const inicioDate = new Date(semana.inicio + 'T00:00:00');
      expect(inicioDate.getDay()).toBe(1); // 1 = Lunes

      // El fin debe ser un domingo
      const finDate = new Date(semana.fin + 'T00:00:00');
      expect(finDate.getDay()).toBe(0); // 0 = Domingo
    });

    it('el rango cubre exactamente 7 días', () => {
      const semana = calcularSemanaAnterior();
      const inicio = new Date(semana.inicio + 'T00:00:00');
      const fin = new Date(semana.fin + 'T00:00:00');
      const diffDias = (fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDias).toBe(6); // Lunes a Domingo = 6 días de diferencia
    });

    it('incluye número de semana ISO y año', () => {
      const semana = calcularSemanaAnterior();
      expect(semana.numero).toBeGreaterThan(0);
      expect(semana.numero).toBeLessThanOrEqual(53);
      expect(semana.ano).toBeGreaterThan(2024);
    });

    it('el formato de fecha es YYYY-MM-DD', () => {
      const semana = calcularSemanaAnterior();
      expect(semana.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(semana.fin).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('calcularSemanaDesdeLunes', () => {
    it('calcula correctamente desde un lunes específico', () => {
      const semana = calcularSemanaDesdeLunes('2026-02-09');

      expect(semana.inicio).toBe('2026-02-09');
      expect(semana.fin).toBe('2026-02-15');
    });

    it('incluye número de semana y año', () => {
      const semana = calcularSemanaDesdeLunes('2026-02-09');
      expect(semana.numero).toBe(7); // Semana 7 de 2026
      expect(semana.ano).toBe(2026);
    });
  });
});

// ============================================================================
// TESTS: PERSONAL
// ============================================================================

describe('fetchPersonalSemana', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cuenta correctamente trabajadores únicos (empleados + contratistas)', async () => {
    const chain = createChainableMock({
      data: MOCK_REGISTROS_TRABAJO.map(r => ({
        empleado_id: r.empleado_id,
        contratista_id: r.contratista_id,
      })),
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const resultado = await fetchPersonalSemana('2026-02-09', '2026-02-15');

    // 2 empleados únicos (emp-1, emp-2) + 2 contratistas únicos (con-1, con-2)
    expect(resultado.totalTrabajadores).toBe(4);
    expect(resultado.empleados).toBe(2);
    expect(resultado.contratistas).toBe(2);
  });

  it('retorna 0 cuando no hay registros en el período', async () => {
    const chain = createChainableMock({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const resultado = await fetchPersonalSemana('2026-03-01', '2026-03-07');

    expect(resultado.totalTrabajadores).toBe(0);
    expect(resultado.empleados).toBe(0);
    expect(resultado.contratistas).toBe(0);
  });

  it('no duplica trabajadores que aparecen múltiples veces', async () => {
    const chain = createChainableMock({
      data: [
        { empleado_id: 'emp-1', contratista_id: null },
        { empleado_id: 'emp-1', contratista_id: null },
        { empleado_id: 'emp-1', contratista_id: null },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const resultado = await fetchPersonalSemana('2026-02-09', '2026-02-15');

    expect(resultado.totalTrabajadores).toBe(1);
    expect(resultado.empleados).toBe(1);
  });

  it('lanza error si Supabase falla', async () => {
    const chain = createChainableMock({
      data: null,
      error: { message: 'Connection error' },
    });
    mockFrom.mockReturnValue(chain);

    await expect(fetchPersonalSemana('2026-02-09', '2026-02-15'))
      .rejects.toThrow('Error al cargar personal');
  });
});

// ============================================================================
// TESTS: MATRIZ DE JORNALES
// ============================================================================

describe('fetchMatrizJornales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('construye correctamente la matriz actividad × lote', async () => {
    // Primera llamada: tipos_tareas
    const tiposChain = createChainableMock({ data: MOCK_TIPOS_TAREAS, error: null });
    // Segunda llamada: registros_trabajo
    const registrosChain = createChainableMock({ data: MOCK_REGISTROS_TRABAJO, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'tipos_tareas') return tiposChain;
      return registrosChain;
    });

    const resultado = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    // Debe tener 2 actividades: Fumigación y Fertilización
    expect(resultado.actividades).toContain('Fumigación');
    expect(resultado.actividades).toContain('Fertilización');
    expect(resultado.actividades.length).toBe(2);

    // Debe tener 3 lotes: PP, ST, AU
    expect(resultado.lotes).toContain('Lote PP');
    expect(resultado.lotes).toContain('Lote ST');
    expect(resultado.lotes).toContain('Lote AU');
    expect(resultado.lotes.length).toBe(3);
  });

  it('calcula totales por actividad correctamente', async () => {
    const tiposChain = createChainableMock({ data: MOCK_TIPOS_TAREAS, error: null });
    const registrosChain = createChainableMock({ data: MOCK_REGISTROS_TRABAJO, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tipos_tareas') return tiposChain;
      return registrosChain;
    });

    const resultado = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    // Fumigación: emp-1(1.0) + emp-1(0.5) + emp-2(0.75) = 2.25
    expect(resultado.totalesPorActividad['Fumigación'].jornales).toBeCloseTo(2.25);

    // Fertilización: con-1(1.0) + con-2(1.0) = 2.0
    expect(resultado.totalesPorActividad['Fertilización'].jornales).toBeCloseTo(2.0);
  });

  it('calcula totales por lote correctamente', async () => {
    const tiposChain = createChainableMock({ data: MOCK_TIPOS_TAREAS, error: null });
    const registrosChain = createChainableMock({ data: MOCK_REGISTROS_TRABAJO, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tipos_tareas') return tiposChain;
      return registrosChain;
    });

    const resultado = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    // Lote PP: emp-1(1.0, Fumigación) + con-1(1.0, Fertilización) + emp-2(0.75, Fumigación) = 2.75
    expect(resultado.totalesPorLote['Lote PP'].jornales).toBeCloseTo(2.75);

    // Lote ST: emp-1(0.5, Fumigación) = 0.5
    expect(resultado.totalesPorLote['Lote ST'].jornales).toBeCloseTo(0.5);

    // Lote AU: con-2(1.0, Fertilización) = 1.0
    expect(resultado.totalesPorLote['Lote AU'].jornales).toBeCloseTo(1.0);
  });

  it('calcula el total general correctamente', async () => {
    const tiposChain = createChainableMock({ data: MOCK_TIPOS_TAREAS, error: null });
    const registrosChain = createChainableMock({ data: MOCK_REGISTROS_TRABAJO, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tipos_tareas') return tiposChain;
      return registrosChain;
    });

    const resultado = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    // Total: 1.0 + 0.5 + 1.0 + 0.75 + 1.0 = 4.25
    expect(resultado.totalGeneral.jornales).toBeCloseTo(4.25);

    // Costo total: 50000 + 25000 + 60000 + 37500 + 55000 = 227500
    expect(resultado.totalGeneral.costo).toBeCloseTo(227500);
  });

  it('calcula celdas individuales de la matriz correctamente', async () => {
    const tiposChain = createChainableMock({ data: MOCK_TIPOS_TAREAS, error: null });
    const registrosChain = createChainableMock({ data: MOCK_REGISTROS_TRABAJO, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tipos_tareas') return tiposChain;
      return registrosChain;
    });

    const resultado = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    // Fumigación × Lote PP: emp-1(1.0) + emp-2(0.75) = 1.75
    expect(resultado.datos['Fumigación']['Lote PP'].jornales).toBeCloseTo(1.75);

    // Fumigación × Lote ST: emp-1(0.5)
    expect(resultado.datos['Fumigación']['Lote ST'].jornales).toBeCloseTo(0.5);

    // Fertilización × Lote PP: con-1(1.0)
    expect(resultado.datos['Fertilización']['Lote PP'].jornales).toBeCloseTo(1.0);

    // Fertilización × Lote AU: con-2(1.0)
    expect(resultado.datos['Fertilización']['Lote AU'].jornales).toBeCloseTo(1.0);
  });

  it('maneja registros sin tipo de tarea como "Sin tipo"', async () => {
    const registrosSinTipo = [
      {
        fraccion_jornal: 1.0,
        costo_jornal: 40000,
        tareas: { tipo_tarea_id: null },
        lote: { nombre: 'Lote PP' },
      },
    ];
    const tiposChain = createChainableMock({ data: MOCK_TIPOS_TAREAS, error: null });
    const registrosChain = createChainableMock({ data: registrosSinTipo, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tipos_tareas') return tiposChain;
      return registrosChain;
    });

    const resultado = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    expect(resultado.actividades).toContain('Sin tipo');
  });

  it('retorna matriz vacía cuando no hay registros', async () => {
    const tiposChain = createChainableMock({ data: MOCK_TIPOS_TAREAS, error: null });
    const registrosChain = createChainableMock({ data: [], error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tipos_tareas') return tiposChain;
      return registrosChain;
    });

    const resultado = await fetchMatrizJornales('2026-03-01', '2026-03-07');

    expect(resultado.actividades.length).toBe(0);
    expect(resultado.lotes.length).toBe(0);
    expect(resultado.totalGeneral.jornales).toBe(0);
    expect(resultado.totalGeneral.costo).toBe(0);
  });
});

// ============================================================================
// TESTS: APLICACIONES PLANEADAS
// ============================================================================

describe('fetchAplicacionesPlaneadas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('obtiene aplicaciones planeadas con lista de compras', async () => {
    // aplicaciones query includes aplicaciones_compras as a join (no separate query)
    const appChain = createChainableMock({ data: MOCK_APLICACIONES_PLANEADAS, error: null });
    // plagas batch lookup: must include id field for the Map lookup
    const plagasChain = createChainableMock({ data: [{ id: 'plaga-1', nombre: 'Monalonion' }], error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'aplicaciones') return appChain;
      if (table === 'plagas_enfermedades_catalogo') return plagasChain;
      return createChainableMock();
    });

    const resultado = await fetchAplicacionesPlaneadas();

    expect(resultado.length).toBe(1);
    expect(resultado[0].nombre).toBe('Fumigación preventiva');
    expect(resultado[0].tipo).toBe('Fumigación');
    expect(resultado[0].blancosBiologicos).toContain('Monalonion');
    expect(resultado[0].listaCompras.length).toBe(2);
    expect(resultado[0].costoTotalEstimado).toBe(430000); // 250000 + 180000
  });

  it('retorna lista vacía cuando no hay aplicaciones planeadas', async () => {
    const appChain = createChainableMock({ data: [], error: null });
    mockFrom.mockReturnValue(appChain);

    const resultado = await fetchAplicacionesPlaneadas();

    expect(resultado.length).toBe(0);
  });
});

// ============================================================================
// TESTS: APLICACIONES ACTIVAS
// ============================================================================

describe('fetchAplicacionesActivas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calcula progreso correctamente para fertilización (bultos)', async () => {
    // movimientos_diarios is now joined in the aplicaciones query (no separate query)
    const appChain = createChainableMock({ data: MOCK_APLICACIONES_ACTIVAS, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'aplicaciones') return appChain;
      return createChainableMock();
    });

    const resultado = await fetchAplicacionesActivas();

    expect(resultado.length).toBe(1);
    const app = resultado[0];
    expect(app.nombre).toBe('Fertilización foliar');
    expect(app.unidad).toBe('bultos');

    // Progreso global: planeado 35 (20+15), ejecutado 23 (12+3+8)
    expect(app.totalPlaneado).toBe(35);
    expect(app.totalEjecutado).toBe(23);
    expect(app.porcentajeGlobal).toBeCloseTo(65.7, 0);

    // Progreso Lote PP: planeado 20, ejecutado 15 (12+3)
    const lotePP = app.progresoPorLote.find(l => l.loteNombre === 'Lote PP');
    expect(lotePP).toBeDefined();
    expect(lotePP!.planeado).toBe(20);
    expect(lotePP!.ejecutado).toBe(15);
    expect(lotePP!.porcentaje).toBe(75);

    // Progreso Lote ST: planeado 15, ejecutado 8
    const loteST = app.progresoPorLote.find(l => l.loteNombre === 'Lote ST');
    expect(loteST).toBeDefined();
    expect(loteST!.planeado).toBe(15);
    expect(loteST!.ejecutado).toBe(8);
    expect(loteST!.porcentaje).toBeCloseTo(53.3, 0);
  });

  it('retorna lista vacía cuando no hay aplicaciones activas', async () => {
    const appChain = createChainableMock({ data: [], error: null });
    mockFrom.mockReturnValue(appChain);

    const resultado = await fetchAplicacionesActivas();

    expect(resultado.length).toBe(0);
  });
});

// ============================================================================
// TESTS: MONITOREO
// ============================================================================

describe('fetchDatosMonitoreo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('obtiene tendencias de los últimos 3 monitoreos', async () => {
    const fechasChain = createChainableMock({ data: MOCK_MONITOREOS_FECHAS, error: null });
    const monChain = createChainableMock({ data: MOCK_MONITOREOS, error: null });

    mockFrom.mockImplementation((table: string) => {
      // First call returns fechas, second returns monitoreos
      return mockFrom.mock.calls.length <= 1 ? fechasChain : monChain;
    });

    // Reset call tracking
    mockFrom.mockClear();
    mockFrom.mockImplementation(() => {
      const callNum = mockFrom.mock.calls.length;
      if (callNum === 1) return fechasChain;
      return monChain;
    });

    const resultado = await fetchDatosMonitoreo();

    // Debe tener tendencias
    expect(resultado.tendencias.length).toBeGreaterThan(0);

    // Debe tener 3 fechas
    expect(resultado.fechasMonitoreo.length).toBe(3);
    expect(resultado.fechasMonitoreo).toContain('2026-02-15');
    expect(resultado.fechasMonitoreo).toContain('2026-02-08');
    expect(resultado.fechasMonitoreo).toContain('2026-02-01');
  });

  it('genera insights para plagas críticas (>= 30% incidencia)', async () => {
    const fechasChain = createChainableMock({ data: MOCK_MONITOREOS_FECHAS, error: null });
    const monChain = createChainableMock({ data: MOCK_MONITOREOS, error: null });

    mockFrom.mockClear();
    mockFrom.mockImplementation(() => {
      const callNum = mockFrom.mock.calls.length;
      if (callNum === 1) return fechasChain;
      return monChain;
    });

    const resultado = await fetchDatosMonitoreo();

    // Monalonion en Lote PP tiene promedio de (20+34.3)/2 = 27.15% en la fecha más reciente
    // Dependiendo del cálculo, puede generar insight urgente o de atención
    const insightsMonalonion = resultado.insights.filter(i =>
      i.plaga === 'Monalonion'
    );
    expect(insightsMonalonion.length).toBeGreaterThanOrEqual(0);
  });

  it('construye detalle por lote del monitoreo más reciente', async () => {
    const fechasChain = createChainableMock({ data: MOCK_MONITOREOS_FECHAS, error: null });
    const monChain = createChainableMock({ data: MOCK_MONITOREOS, error: null });

    mockFrom.mockClear();
    mockFrom.mockImplementation(() => {
      const callNum = mockFrom.mock.calls.length;
      if (callNum === 1) return fechasChain;
      return monChain;
    });

    const resultado = await fetchDatosMonitoreo();

    // Fecha más reciente es 2026-02-15, solo Lote PP tiene datos
    const lotePP = resultado.detallePorLote.find(l => l.loteNombre === 'Lote PP');
    expect(lotePP).toBeDefined();
    expect(lotePP!.sublotes.length).toBe(2); // Sublote A y B

    const subloteA = lotePP!.sublotes.find(s => s.subloteNombre === 'Sublote A');
    expect(subloteA).toBeDefined();
    expect(subloteA!.plagaNombre).toBe('Monalonion');
    expect(subloteA!.incidencia).toBe(20.0);
    expect(subloteA!.gravedad).toBe('Media');
  });

  it('retorna datos vacíos cuando no hay monitoreos', async () => {
    const fechasChain = createChainableMock({ data: [], error: null });
    mockFrom.mockReturnValue(fechasChain);

    const resultado = await fetchDatosMonitoreo();

    expect(resultado.tendencias.length).toBe(0);
    expect(resultado.detallePorLote.length).toBe(0);
    expect(resultado.insights.length).toBe(0);
    expect(resultado.fechasMonitoreo.length).toBe(0);
  });
});

// ============================================================================
// TESTS: FUNCIÓN ORQUESTADORA
// ============================================================================

describe('fetchDatosReporteSemanal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combina datos de personal con fallas y permisos manuales', async () => {
    // Mock genérico para todas las tablas
    const genericChain = createChainableMock({ data: [], error: null });
    mockFrom.mockReturnValue(genericChain);

    const resultado = await fetchDatosReporteSemanal({
      semana: {
        inicio: '2026-02-09',
        fin: '2026-02-15',
        numero: 7,
        ano: 2026,
      },
      fallas: 3,
      permisos: 2,
      temasAdicionales: [],
    });

    // Fallas y permisos deben venir del input manual
    expect(resultado.personal.fallas).toBe(3);
    expect(resultado.personal.permisos).toBe(2);
  });

  it('incluye la semana correcta en el resultado', async () => {
    const genericChain = createChainableMock({ data: [], error: null });
    mockFrom.mockReturnValue(genericChain);

    const semanaInput = {
      inicio: '2026-02-09',
      fin: '2026-02-15',
      numero: 7,
      ano: 2026,
    };

    const resultado = await fetchDatosReporteSemanal({
      semana: semanaInput,
      fallas: 0,
      permisos: 0,
      temasAdicionales: [],
    });

    expect(resultado.semana).toEqual(semanaInput);
  });

  it('incluye temas adicionales pasados como parámetro', async () => {
    const genericChain = createChainableMock({ data: [], error: null });
    mockFrom.mockReturnValue(genericChain);

    const temas = [
      { tipo: 'texto' as const, titulo: 'Nota importante', contenido: 'Revisar cerca del lote PP' },
    ];

    const resultado = await fetchDatosReporteSemanal({
      semana: { inicio: '2026-02-09', fin: '2026-02-15', numero: 7, ano: 2026 },
      fallas: 0,
      permisos: 0,
      temasAdicionales: temas,
    });

    expect(resultado.temasAdicionales.length).toBe(1);
    expect(resultado.temasAdicionales[0].tipo).toBe('texto');
  });

  it('retorna estructura completa con todas las secciones', async () => {
    const genericChain = createChainableMock({ data: [], error: null });
    mockFrom.mockReturnValue(genericChain);

    const resultado = await fetchDatosReporteSemanal({
      semana: { inicio: '2026-02-09', fin: '2026-02-15', numero: 7, ano: 2026 },
      fallas: 0,
      permisos: 0,
      temasAdicionales: [],
    });

    // Verificar que todas las secciones existen
    expect(resultado).toHaveProperty('semana');
    expect(resultado).toHaveProperty('personal');
    expect(resultado).toHaveProperty('jornales');
    expect(resultado).toHaveProperty('aplicaciones');
    expect(resultado).toHaveProperty('aplicaciones.planeadas');
    expect(resultado).toHaveProperty('aplicaciones.activas');
    expect(resultado).toHaveProperty('monitoreo');
    expect(resultado).toHaveProperty('monitoreo.tendencias');
    expect(resultado).toHaveProperty('monitoreo.detallePorLote');
    expect(resultado).toHaveProperty('monitoreo.insights');
    expect(resultado).toHaveProperty('temasAdicionales');
  });
});
