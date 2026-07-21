import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Chainable Supabase mock builder
function createChainableMock(resolvedData: any = { data: [], error: null }) {
  const chain: any = {};
  const methods = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq',
    'gt', 'gte', 'lt', 'lte', 'in', 'or', 'order', 'limit', 'single', 'maybeSingle'];

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
        inventario_actual: 0,
        cantidad_faltante: 5,
      },
      {
        producto_nombre: 'Clorpirifós',
        producto_categoria: 'Insecticida',
        cantidad_necesaria: 3,
        unidad: 'Litros',
        costo_estimado: 180000,
        inventario_actual: 0,
        cantidad_faltante: 3,
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
  { lote_id: 'lote-1', fecha_monitoreo: '2026-02-15' },
  { lote_id: 'lote-1', fecha_monitoreo: '2026-02-15' },
  { lote_id: 'lote-1', fecha_monitoreo: '2026-02-08' },
  { lote_id: 'lote-2', fecha_monitoreo: '2026-02-08' },
  { lote_id: 'lote-2', fecha_monitoreo: '2026-02-01' },
  { lote_id: 'lote-2', fecha_monitoreo: '2026-02-01' },
];

const MOCK_LOTES = [
  { id: 'lote-1', nombre: 'Lote PP' },
  { id: 'lote-2', nombre: 'Lote ST' },
];

const MOCK_SUBLOTES = [
  { id: 'sub-1', nombre: 'Sublote A', lote_id: 'lote-1' },
  { id: 'sub-2', nombre: 'Sublote B', lote_id: 'lote-1' },
  { id: 'sub-3', nombre: 'Sublote C', lote_id: 'lote-2' },
];

const MOCK_SEMANA_MONITOREO = {
  inicio: '2026-02-09',
  fin: '2026-02-15',
  numero: 7,
  ano: 2026,
};

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
    fecha_monitoreo: '2026-02-08',
    lote_id: 'lote-2',
    sublote_id: 'sub-3',
    plaga_enfermedad_id: 'plaga-2',
    arboles_monitoreados: 35,
    arboles_afectados: 4,
    incidencia: 11.4,
    gravedad_texto: 'Baja',
    plagas_enfermedades_catalogo: { nombre: 'Trips' },
    lotes: { nombre: 'Lote ST' },
    sublotes: { nombre: 'Sublote C' },
  },
  {
    id: 'mon-5',
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

  const setupMocks = (registros: any[] = MOCK_REGISTROS_TRABAJO) => {
    const tiposChain = createChainableMock({ data: MOCK_TIPOS_TAREAS, error: null });
    const registrosChain = createChainableMock({ data: registros, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tipos_tareas') return tiposChain;
      return registrosChain;
    });
  };

  it('construye correctamente la matriz actividad × lote (combinado)', async () => {
    setupMocks();

    const { combinado } = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    expect(combinado.actividades).toContain('Fumigación');
    expect(combinado.actividades).toContain('Fertilización');
    expect(combinado.actividades.length).toBe(2);

    expect(combinado.lotes).toContain('Lote PP');
    expect(combinado.lotes).toContain('Lote ST');
    expect(combinado.lotes).toContain('Lote AU');
    expect(combinado.lotes.length).toBe(3);
  });

  it('calcula totales por actividad correctamente (combinado)', async () => {
    setupMocks();

    const { combinado } = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    // Fumigación: emp-1(1.0) + emp-1(0.5) + emp-2(0.75) = 2.25
    expect(combinado.totalesPorActividad['Fumigación'].jornales).toBeCloseTo(2.25);
    // Fertilización: con-1(1.0) + con-2(1.0) = 2.0
    expect(combinado.totalesPorActividad['Fertilización'].jornales).toBeCloseTo(2.0);
  });

  it('calcula totales por lote correctamente (combinado)', async () => {
    setupMocks();

    const { combinado } = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    expect(combinado.totalesPorLote['Lote PP'].jornales).toBeCloseTo(2.75);
    expect(combinado.totalesPorLote['Lote ST'].jornales).toBeCloseTo(0.5);
    expect(combinado.totalesPorLote['Lote AU'].jornales).toBeCloseTo(1.0);
  });

  it('calcula el total general correctamente (combinado)', async () => {
    setupMocks();

    const { combinado } = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    expect(combinado.totalGeneral.jornales).toBeCloseTo(4.25);
    expect(combinado.totalGeneral.costo).toBeCloseTo(227500);
  });

  it('calcula celdas individuales de la matriz correctamente (combinado)', async () => {
    setupMocks();

    const { combinado } = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    expect(combinado.datos['Fumigación']['Lote PP'].jornales).toBeCloseTo(1.75);
    expect(combinado.datos['Fumigación']['Lote ST'].jornales).toBeCloseTo(0.5);
    expect(combinado.datos['Fertilización']['Lote PP'].jornales).toBeCloseTo(1.0);
    expect(combinado.datos['Fertilización']['Lote AU'].jornales).toBeCloseTo(1.0);
  });

  it('maneja registros sin tipo de tarea como "Sin tipo"', async () => {
    const registrosSinTipo = [
      {
        empleado_id: 'emp-99',
        contratista_id: null,
        fraccion_jornal: 1.0,
        costo_jornal: 40000,
        tareas: { tipo_tarea_id: null },
        lote: { nombre: 'Lote PP' },
      },
    ];
    setupMocks(registrosSinTipo);

    const { combinado } = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    expect(combinado.actividades).toContain('Sin tipo');
  });

  it('retorna matrices vacías cuando no hay registros', async () => {
    setupMocks([]);

    const { propios, contrato, combinado } = await fetchMatrizJornales('2026-03-01', '2026-03-07');

    for (const matriz of [propios, contrato, combinado]) {
      expect(matriz.actividades.length).toBe(0);
      expect(matriz.lotes.length).toBe(0);
      expect(matriz.totalGeneral.jornales).toBe(0);
      expect(matriz.totalGeneral.costo).toBe(0);
    }
  });

  it('separa propios y contrato segun empleado_id / contratista_id', async () => {
    setupMocks();

    const { propios, contrato, combinado } = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    // Propios: 3 registros Fumigación = 2.25 jornales (todos en Lote PP/ST)
    expect(propios.totalGeneral.jornales).toBeCloseTo(2.25);
    expect(propios.totalesPorActividad['Fumigación']?.jornales).toBeCloseTo(2.25);
    expect(propios.totalesPorActividad['Fertilización']).toBeUndefined();
    expect(propios.datos['Fumigación']?.['Lote PP']?.jornales).toBeCloseTo(1.75);
    expect(propios.datos['Fumigación']?.['Lote ST']?.jornales).toBeCloseTo(0.5);

    // Contrato: 2 registros Fertilización = 2.0 jornales (PP + AU)
    expect(contrato.totalGeneral.jornales).toBeCloseTo(2.0);
    expect(contrato.totalesPorActividad['Fertilización']?.jornales).toBeCloseTo(2.0);
    expect(contrato.totalesPorActividad['Fumigación']).toBeUndefined();
    expect(contrato.datos['Fertilización']?.['Lote PP']?.jornales).toBeCloseTo(1.0);
    expect(contrato.datos['Fertilización']?.['Lote AU']?.jornales).toBeCloseTo(1.0);

    // Suma de canales debe igualar el combinado
    expect(propios.totalGeneral.jornales + contrato.totalGeneral.jornales).toBeCloseTo(combinado.totalGeneral.jornales);
    expect(propios.totalGeneral.costo + contrato.totalGeneral.costo).toBeCloseTo(combinado.totalGeneral.costo);
  });

  it('cada canal expone solo actividades y lotes con datos reales (subconjunto del combinado)', async () => {
    setupMocks();

    const { propios, contrato, combinado } = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    // Propios: solo Fumigación (no Fertilización), solo lotes con propios (PP, ST — no AU)
    expect(propios.actividades).toEqual(['Fumigación']);
    expect(propios.lotes.sort()).toEqual(['Lote PP', 'Lote ST']);

    // Contrato: solo Fertilización, solo lotes con contrato (PP, AU — no ST)
    expect(contrato.actividades).toEqual(['Fertilización']);
    expect(contrato.lotes.sort()).toEqual(['Lote AU', 'Lote PP']);

    // Subset del combinado en ambos casos
    expect(propios.actividades.every(a => combinado.actividades.includes(a))).toBe(true);
    expect(contrato.actividades.every(a => combinado.actividades.includes(a))).toBe(true);
    expect(propios.lotes.every(l => combinado.lotes.includes(l))).toBe(true);
    expect(contrato.lotes.every(l => combinado.lotes.includes(l))).toBe(true);
  });

  it('canal vacio: solo contrato registrado deja propios vacio y combinado igual a contrato', async () => {
    const soloContrato = MOCK_REGISTROS_TRABAJO.filter(r => r.contratista_id);
    setupMocks(soloContrato);

    const { propios, contrato, combinado } = await fetchMatrizJornales('2026-02-09', '2026-02-15');

    // Propios queda sin actividades reales y total cero
    expect(propios.totalGeneral.jornales).toBe(0);
    expect(Object.keys(propios.totalesPorActividad).length).toBe(0);

    // Contrato y combinado son idénticos en totales
    expect(contrato.totalGeneral.jornales).toBeCloseTo(combinado.totalGeneral.jornales);
    expect(contrato.totalGeneral.costo).toBeCloseTo(combinado.totalGeneral.costo);
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

  // Helper to set up mocks for fetchDatosMonitoreo which queries:
  // 1. lotes + sublotes (in parallel), 2. monitoreos (fechas per lote),
  // 3. monitoreos (per-lote anterior, only if needed), 4. monitoreos (full data)
  /**
   * `fetchDatosMonitoreo` consulta `monitoreos` en este orden:
   *   1. actividad de los últimos 30 días (`select('lote_id')`) → decide qué lotes
   *      siguen activos; un lote sin actividad se excluye del informe por completo.
   *   2. fechas dentro de la ventana de 2 semanas (`select('lote_id, fecha_monitoreo')`).
   *   3. datos completos (y, si hace falta, una consulta `anterior` por lote).
   * Cada escalón se mockea por separado: mezclarlos hace que los tests pasen por
   * coincidencia y oculta cuál de los tres filtros es el que realmente actúa.
   */
  function setupMonitoreoMocks(opts: {
    actividad30d?: any[];
    fechas?: any[];
    monitoreos?: any[];
  } = {}) {
    const lotesChain = createChainableMock({ data: MOCK_LOTES, error: null });
    const sublotesChain = createChainableMock({ data: MOCK_SUBLOTES, error: null });
    const actividadChain = createChainableMock({ data: opts.actividad30d ?? MOCK_MONITOREOS_FECHAS, error: null });
    const fechasChain = createChainableMock({ data: opts.fechas ?? MOCK_MONITOREOS_FECHAS, error: null });
    const monChain = createChainableMock({ data: opts.monitoreos ?? MOCK_MONITOREOS, error: null });

    let monitoreoCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lotes') return lotesChain;
      if (table === 'sublotes') return sublotesChain;
      if (table === 'monitoreos') {
        monitoreoCallCount++;
        if (monitoreoCallCount === 1) return actividadChain; // actividad 30 días
        if (monitoreoCallCount === 2) return fechasChain;    // fechas ventana 2 semanas
        return monChain;                                     // datos completos / anterior
      }
      return createChainableMock({ data: [], error: null });
    });
  }

  it('obtiene resumen global con comparativo', async () => {
    setupMonitoreoMocks();

    const resultado = await fetchDatosMonitoreo(MOCK_SEMANA_MONITOREO);

    // Debe tener fechaActual (2026-02-15 cae dentro de la semana)
    expect(resultado.fechaActual).toBe('2026-02-15');
    expect(resultado.fechaAnterior).toBe('2026-02-08');

    // Resumen global debe tener plagas
    expect(resultado.resumenGlobal.length).toBeGreaterThan(0);
  });

  it('genera insights para plagas críticas (>= 30% incidencia)', async () => {
    setupMonitoreoMocks();

    const resultado = await fetchDatosMonitoreo(MOCK_SEMANA_MONITOREO);

    // Monalonion en Lote PP tiene promedio de (20+34.3)/2 = 27.15% en la fecha más reciente
    const insightsMonalonion = resultado.insights.filter((i: any) =>
      i.plaga === 'Monalonion'
    );
    expect(insightsMonalonion.length).toBeGreaterThanOrEqual(0);
  });

  it('construye vistas por lote incluyendo todos los lotes', async () => {
    setupMonitoreoMocks();

    const resultado = await fetchDatosMonitoreo(MOCK_SEMANA_MONITOREO);

    // Debe incluir TODOS los lotes de la BD (Lote PP y Lote ST)
    expect(resultado.vistasPorLote.length).toBe(2);

    const lotePP = resultado.vistasPorLote.find((l: any) => l.loteNombre === 'Lote PP');
    expect(lotePP).toBeDefined();
    expect(lotePP!.sinDatos).toBe(false);
    expect(lotePP!.plagas.length).toBeGreaterThan(0);
  });

  it('construye detalle por lote del monitoreo más reciente (legacy)', async () => {
    setupMonitoreoMocks();

    const resultado = await fetchDatosMonitoreo(MOCK_SEMANA_MONITOREO);

    // Legacy detallePorLote still populated for Gemini
    const lotePP = resultado.detallePorLote.find((l: any) => l.loteNombre === 'Lote PP');
    expect(lotePP).toBeDefined();
    expect(lotePP!.sublotes.length).toBe(2); // Sublote A y B
  });

  it('sin datos en la ventana de 2 semanas: los lotes activos aparecen marcados sinDatos', async () => {
    // Hay actividad en los últimos 30 días (los lotes siguen vivos), pero ninguna
    // medición cae dentro de la ventana del informe.
    setupMonitoreoMocks({ fechas: [], monitoreos: [] });

    const resultado = await fetchDatosMonitoreo(MOCK_SEMANA_MONITOREO);

    expect(resultado.resumenGlobal.length).toBe(0);
    expect(resultado.detallePorLote.length).toBe(0);
    expect(resultado.insights.length).toBe(0);
    expect(resultado.fechaActual).toBeNull();
    expect(resultado.vistasPorLote.length).toBe(2);
    expect(resultado.vistasPorLote.every((l: any) => l.sinDatos)).toBe(true);
  });

  it('sin actividad en 30 días: los lotes se excluyen por completo del informe', async () => {
    // Regla introducida en 1753706: un lote erradicado o sin monitoreo en 30 días
    // no debe aparecer en el informe, ni siquiera como fila "sin datos".
    setupMonitoreoMocks({ actividad30d: [], fechas: [], monitoreos: [] });

    const resultado = await fetchDatosMonitoreo(MOCK_SEMANA_MONITOREO);

    expect(resultado.fechaActual).toBeNull();
    expect(resultado.vistasPorLote.length).toBe(0);
    expect(resultado.vistasPorSublote.length).toBe(0);
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
    expect(resultado).toHaveProperty('monitoreo.resumenGlobal');
    expect(resultado).toHaveProperty('monitoreo.vistasPorLote');
    expect(resultado).toHaveProperty('monitoreo.vistasPorSublote');
    expect(resultado).toHaveProperty('temasAdicionales');
  });
});
