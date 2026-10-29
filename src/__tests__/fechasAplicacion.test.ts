import { describe, expect, it } from 'vitest';
import { validarFechasAplicacion } from '@/utils/fechasAplicacion';
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
describe('application date basis and evidence', () => {
  it('defaults to actual; planned requires an explicit valid argument', () => {
    expect(baseFechaAplicacion({})).toBe('actual');
    expect(baseFechaAplicacion({ date_basis: 'planned' })).toBe('planned');
    expect(() => baseFechaAplicacion({ date_basis: 'other' })).toThrow();
  });
  it.each(['Cómo va la aplicación', 'No uses fechas planeadas', 'Aplicaciones sin fechas planeadas'])('does not infer planned dates from %s', q => expect(pideFechasPlaneadas(q)).toBe(false));
  it.each(['Aplicaciones por fechas planeadas', 'Aplicaciones planificadas', 'Muéstrame la aplicación planeada X'])('recognizes explicit planned intent in %s', q => expect(pideFechasPlaneadas(q)).toBe(true));
  it.each(['¿Cuál es el estado actual de la aplicación X?', '¿En qué estado está la aplicación X?'])('routes ordinary state questions: %s', q => expect(requiereConsultaAplicaciones(q)).toBe(true));
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
  it('keeps empty scope, unknown dates, conflicts and ambiguity explicit', () => {
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [{ ...complete.detalle[0], fecha_real_ausente: true }] }))).toContain('No tiene fecha de inicio real');
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [] }))).toContain('filtros');
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [], resumen: { fechas_reales_ausentes: 1 } }))).toContain('sin fechas reales');
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [{ ...complete.detalle[0], fechas_inconsistentes: ['fixture'] }] }))).toContain('inconsistentes');
    expect(respuestaSeguraAplicaciones(run({ ...complete, detalle: [...complete.detalle, { id: 'other', nombre_aplicacion: 'Other' }] }))).toContain('varias');
  });
});
