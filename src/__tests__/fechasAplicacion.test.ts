import { afterEach, describe, expect, it, vi } from 'vitest';
import { validarFechasAplicacion, validarInicioEjecucion } from '@/utils/fechasAplicacion';
import { baseFechaAplicacion, requiereConsultaAplicaciones, pideFechasPlaneadas, respuestaSeguraAplicaciones } from '@/utils/escoConsultas';

describe('application date-only pairs', () => {
  it.each([
    {}, { fecha_inicio_ejecucion: '2031-05-01', fecha_fin_ejecucion: null },
    { fecha_inicio_planeada: null, fecha_fin_planeada: null },
    { fecha_inicio_ejecucion: '2031-05-01', fecha_fin_ejecucion: '2031-05-01' },
    { fecha_inicio_planeada: '2032-02-29', fecha_fin_planeada: '2032-03-01' },
    // Corresponding pairs are independent; this is not a cross-pair comparison.
    { fecha_inicio_planeada: '2032-05-01', fecha_fin_planeada: '2032-05-02', fecha_inicio_ejecucion: '2031-05-01', fecha_fin_ejecucion: '2031-05-02' },
  ])('accepts same-day, leap, null/ongoing and independent pairs: %j', value => {
    expect(() => validarFechasAplicacion(value)).not.toThrow();
  });
  it.each([
    { fecha_inicio_planeada: '2031-05-02', fecha_fin_planeada: '2031-05-01' },
    { fecha_inicio_ejecucion: '2031-05-02', fecha_fin_ejecucion: '2031-05-01' },
    { fecha_inicio_ejecucion: '2031-02-29' }, { fecha_inicio_planeada: '2031-04-31' },
    { fecha_inicio_ejecucion: '2031-05-01T00:00:00Z' }, { fecha_fin_planeada: '2031-05-01T23:00:00-05:00' },
  ])('rejects reversed pairs and malformed/instant inputs: %j', value => {
    expect(() => validarFechasAplicacion(value)).toThrow();
  });
});
describe('local date-only execution start', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it.each(['America/New_York', 'Asia/Kolkata', 'Pacific/Kiritimati'])('accepts local today and rejects tomorrow in %s', timezone => {
    vi.stubEnv('TZ', timezone); vi.useFakeTimers();
    vi.setSystemTime(new Date('2031-05-01T10:00:00Z'));
    const today = timezone === 'Pacific/Kiritimati' ? '2031-05-02' : '2031-05-01';
    const tomorrow = timezone === 'Pacific/Kiritimati' ? '2031-05-03' : '2031-05-02';
    expect(() => validarInicioEjecucion(today)).not.toThrow();
    expect(() => validarInicioEjecucion(tomorrow)).toThrow('futura');
    expect(() => validarInicioEjecucion('2031-04-30')).not.toThrow();
  });
});
describe('application date basis and evidence', () => {
  it('defaults to actual; planned requires an explicit valid argument', () => {
    expect(baseFechaAplicacion({})).toBe('actual');
    expect(baseFechaAplicacion({ date_basis: 'planned' })).toBe('planned');
    expect(() => baseFechaAplicacion({ date_basis: 'other' })).toThrow();
  });
  it.each(['Cómo va la aplicación', 'No uses fechas planeadas', 'Aplicaciones sin fechas planeadas'])('does not infer planned dates from %s', q => expect(pideFechasPlaneadas(q)).toBe(false));
  it.each(['Aplicaciones por fechas planeadas', 'Muéstrame las fechas planificadas', '¿Cuál es la fecha planeada de la aplicación X?', 'La fecha real estaba mal; usa la fecha planeada'])('recognizes explicit planned intent in %s', q => expect(pideFechasPlaneadas(q)).toBe(true));
  it.each(['¿Cuál es el estado actual de la aplicación X?', '¿En qué estado está la aplicación X?'])('routes ordinary state questions: %s', q => expect(requiereConsultaAplicaciones(q)).toBe(true));
  it.each([
    '¿Cómo va la aplicación del producto Z? La fecha planeada estaba mal, usa la real.',
    'La fecha planeada estaba equivocada. ¿Cómo va la aplicación?',
    'No uses la fecha planeada; consulta por fecha real.',
    'Muéstrame fechas planeadas y reales de la aplicación', 'Muéstrame las fechas planificadas y reales de la aplicación X',
    '¿Cómo va la aplicación? Antes se usaban fechas planeadas.',
    'Dame el estado de la aplicación cuya fecha planeada estaba mal',
    'Muestra el estado de la aplicación cuya fecha planificada se corrigió',
    'Aplicaciones planificadas', 'Muéstrame la aplicación planeada X',
  ])('a planned mention or contrasting actual instruction is not consent: %s', q => expect(pideFechasPlaneadas(q)).toBe(false));
  it.each(['¿Hay alguna aplicación de acaricida?', '¿Cómo va la fumigación de plaga Z?', '¿Cómo va la fumigación que registramos en la app?', 'En la app, ¿cómo va la aplicación de acaricida?', '¿Existe una aplicación de fertilizante?', 'Avance de la fertilización del lote Z'])('routes farm existence/progress: %s', q => expect(requiereConsultaAplicaciones(q)).toBe(true));
  it.each(['¿Cómo va la aplicación móvil?', '¿Hay alguna aplicación para editar fotos?', 'Estado de la aplicación de empleo', '¿Cómo va mi solicitud?'])('does not route unrelated application meanings: %s', q => expect(requiereConsultaAplicaciones(q)).toBe(false));
  it.each([
    ['No uses fechas reales; usa las planeadas', true],
    ['No uses fechas planeadas; usa las reales', false],
    ['Usa las fechas planeadas; pero usa las reales', false],
    ['Usa fechas planeadas; consulta fechas de ejecución', false],
    ['No uses fechas de ejecución; usa fechas planeadas', true],
    ['Usa las fechas reales; en cambio usa las planeadas', true],
    ['Usa fechas planeadas; no uses las planeadas', false],
    ['Usa fechas planeadas; por favor no uses fechas planeadas', false],
    ['Usa fechas planeadas; no consultes fechas planeadas', false],
    ['No consultes fechas reales; por favor usa fechas planificadas', true],
    ['No uses las fechas reales, utiliza las fechas planificadas', true],
    ['Muéstrame las fechas planeadas y reales', false],
    ['Dame el estado de la aplicación. La fecha planeada estaba mal', false],
  ])('resolves direct clause-local intent %s', (q, planned) => expect(pideFechasPlaneadas(q as string)).toBe(planned));
  const run = (data: unknown) => [{ tool: 'get_aplicaciones_ejecucion', result_summary: JSON.stringify(data) }];
  const complete = { _evidencia: { herramienta: 'get_aplicaciones_ejecucion', consulta_completa: true, detalle_completo: true }, resumen: {}, detalle: [{ id: 'fixture', nombre_aplicacion: 'Fixture' }] };
  it('accepts complete unique evidence but rejects malformed, incomplete and context-lost results', () => {
    expect(respuestaSeguraAplicaciones(run(complete))).toBeNull();
    for (const patch of [{ error: false }, { contexto_recortado: true }, { contexto_recortado: 'false' }, { detalle: [null] }, { detalle: [{}] }, { _evidencia: { ...complete._evidencia, consulta_completa: false } }]) {
      expect(respuestaSeguraAplicaciones(run({ ...complete, ...patch }))).toContain('No pude verificar');
    }
    expect(respuestaSeguraAplicaciones([{ tool: 'get_aplicaciones_ejecucion', result_summary: '{malformed' }])).toContain('No pude verificar');
  });
  it('preserves explicitly requested planned evidence when actual date is absent', () => {
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [{ ...complete.detalle[0], base_fecha_consultada: 'planned', fecha_real_ausente: true, fecha_inicio_planeada: '2031-05-04' }] }))).toBeNull();
  });
  it('retains collection evidence but still refuses malformed or date-limited collections', () => {
    const detail = [...complete.detalle, { id: 'other', nombre_aplicacion: 'Other' }];
    const q = 'Dame el estado de las aplicaciones de mayo de 2031';
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: detail }), q)).toBeNull();
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [...detail, null] }), q)).toContain('No pude verificar');
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [detail[0], { ...detail[1], fecha_real_ausente: true }] }), q)).toContain('fechas reales ausentes');
  });
  it('keeps empty scope, unknown dates, conflicts and ambiguity explicit', () => {
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [{ ...complete.detalle[0], fecha_real_ausente: true }] }))).toContain('No tiene fecha de inicio real');
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [] }))).toContain('filtros');
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [], resumen: { fechas_reales_ausentes: 1 } }))).toContain('sin fechas reales');
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [{ ...complete.detalle[0], fechas_inconsistentes: ['fixture'] }] }))).toContain('inconsistentes');
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [...complete.detalle, { id: 'other', nombre_aplicacion: 'Other' }] }))).toContain('varias');
  });
});
