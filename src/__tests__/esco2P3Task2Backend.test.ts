import { describe, expect, it } from 'vitest';
import { ejecutarInventarioAplicaciones, renderAplicaciones } from '@/utils/esco2/aplicaciones';
import type { ConsultaAplicaciones, DatosInventarioAplicaciones } from '@/utils/esco2/aplicacionesTipos';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const C = '00000000-0000-4000-8000-000000000003';
const M1 = '00000000-0000-4000-8000-000000000011';
const M2 = '00000000-0000-4000-8000-000000000012';
const q = (extra: Partial<ConsultaAplicaciones> = {}): ConsultaAplicaciones => ({ desde: '2026-11-01', hasta: '2026-11-04', base_fecha: 'fecha_inicio_planeada', estados: [], aplicacion_ids: [], aplicaciones: [], ...extra });
const datos = (): DatosInventarioAplicaciones => ({
  aplicaciones: [
    { id: A, nombre_aplicacion: 'Igual', codigo_aplicacion: null, estado: 'Calculada', tipo_aplicacion: 'Fumigación', tarea_id: null, fecha_inicio_planeada: '2026-11-01' },
    { id: B, nombre_aplicacion: 'Igual', codigo_aplicacion: null, estado: null, tipo_aplicacion: null, fecha_inicio_planeada: '2026-11-03' },
    { id: C, nombre_aplicacion: null, codigo_aplicacion: null, estado: 'Cerrada', tipo_aplicacion: 'Drench', tarea_id: null, fecha_inicio_planeada: null },
  ],
  movimientos: [{ id: M1, aplicacion_id: A, lote_id: null, fecha_movimiento: '2026-11-02' }, { id: M2, aplicacion_id: A, lote_id: null, fecha_movimiento: '2026-11-03' }],
  cierres: [{ id: M1, aplicacion_id: C, fecha_cierre: '2026-11-02' }],
});
describe('P3 Task 2 inventory units', () => {
  it('keeps duplicate names, unlinked rows and distinct metadata states', () => {
    const r = ejecutarInventarioAplicaciones(q(), datos(), 'p1');
    expect(r.conteo).toBe(2);
    expect(r.filas.map(a => a.id)).toEqual([A, B]);
    expect(r.filas[0].tarea_id).toBeNull();
    expect(r.filas[1].tarea_id).toBeUndefined();
    const text = renderAplicaciones(r);
    expect(text).toContain('Planificada');
    expect(text).toContain('sin estado registrado');
    expect(text).toContain('estado actual');
    expect(text).toContain('nombres repetidos');
    expect(text).not.toContain('0 jornales');
  });
  it('deduplicates applications selected by multiple movement IDs', () => {
    const r = ejecutarInventarioAplicaciones(q({ base_fecha: 'fecha_movimiento' }), datos(), 'p1');
    expect(r.conteo).toBe(1);
    expect(r.filas.map(a => a.id)).toEqual([A]);
    expect(renderAplicaciones(r)).toContain('fecha de los movimientos');
  });
  it('uses the operational closure date, not stored execution metadata', () => {
    const d = datos();
    d.aplicaciones![0].fecha_fin_ejecucion = '2026-11-02';
    const r = ejecutarInventarioAplicaciones(q({ base_fecha: 'fecha_cierre_operativo' }), d, 'p1');
    expect(r.filas.map(a => a.id)).toEqual([C]);
    expect(renderAplicaciones(r)).toContain('cierre operativo registrado');
    expect(renderAplicaciones(r)).toContain('trámite administrativo');
  });
  it('keeps future planned starts instead of clipping to today', () => {
    const d = datos(); d.aplicaciones![0].fecha_inicio_planeada = '2027-01-01';
    expect(ejecutarInventarioAplicaciones(q({ desde: '2027-01-01', hasta: '2027-01-01' }), d, 'p1').filas.map(a => a.id)).toEqual([A]);
  });
  it('separates NULL selection dates from unread selection dates', () => {
    const d = datos();
    expect(ejecutarInventarioAplicaciones(q(), d, 'p1').excluidos.sin_fecha).toBe(1);
    delete d.aplicaciones![0].fecha_inicio_planeada;
    const r = ejecutarInventarioAplicaciones(q(), d, 'p1');
    expect(r.estado).toBe('no_disponible'); expect(r.conteo).toBeNull();
  });
  it('does not convert unread app parents or unread child relations into empty', () => {
    expect(ejecutarInventarioAplicaciones(q(), {}, 'p1').estado).toBe('no_disponible');
    const d = datos(); delete d.movimientos;
    expect(ejecutarInventarioAplicaciones(q({ base_fecha: 'fecha_movimiento' }), d, 'p1').estado).toBe('no_disponible');
  });
  it('counts zero only for verified empty reads', () => {
    const r = ejecutarInventarioAplicaciones(q(), { aplicaciones: [] }, 'p1');
    expect(r.estado).toBe('vacio_verificado'); expect(r.conteo).toBe(0);
    expect(renderAplicaciones(r)).toContain('No hay aplicaciones');
  });
  it('rejects duplicate source IDs instead of counting them twice', () => {
    const d = datos(); d.movimientos!.push({ ...d.movimientos![0] });
    expect(ejecutarInventarioAplicaciones(q({ base_fecha: 'fecha_movimiento' }), d, 'p1').estado).toBe('no_disponible');
  });
  it('filters child references to visible parent IDs', () => {
    const d = datos(); d.aplicaciones = [d.aplicaciones![1]];
    const r = ejecutarInventarioAplicaciones(q({ base_fecha: 'fecha_movimiento' }), d, 'p1');
    expect(r.estado).toBe('vacio_verificado'); expect(r.filas).toEqual([]);
  });
  it('does not infer a date basis when it is ambiguous', () => {
    const r = ejecutarInventarioAplicaciones(q({ base_fecha: 'sin_precisar' }), datos(), 'p1');
    expect(r.estado).toBe('aclaracion'); expect(r.conteo).toBeNull();
    expect(renderAplicaciones(r)).toContain('¿');
  });
  it('declares administrative closing evidence unavailable', () => {
    const r = ejecutarInventarioAplicaciones(q({ base_fecha: 'cierre_administrativo' }), datos(), 'p1');
    expect(r.estado).toBe('no_soportada'); expect(r.conteo).toBeNull();
    expect(renderAplicaciones(r)).toContain('No tengo evidencia');
  });
  it('keeps a duplicated selector ambiguous while explicit IDs remain distinct', () => {
    expect(ejecutarInventarioAplicaciones(q({ aplicaciones: ['igual'] }), datos(), 'p1').estado).toBe('no_resuelto');
    expect(ejecutarInventarioAplicaciones(q({ aplicacion_ids: [M1] }), datos(), 'p1').estado).toBe('no_resuelto');
  });
  it('prefers an exact label over a longer partial match and never broadens an ambiguous fragment', () => {
    const d = datos();
    d.aplicaciones![0].nombre_aplicacion = 'Fumigación Alfa';
    d.aplicaciones![1].nombre_aplicacion = 'Fumigación Alfa adicional';
    expect(ejecutarInventarioAplicaciones(q({ aplicaciones: ['fumigación alfa'] }), d, 'p1').filas.map(a => a.id)).toEqual([A]);
    expect(ejecutarInventarioAplicaciones(q({ aplicaciones: ['adicional'] }), d, 'p1').filas.map(a => a.id)).toEqual([B]);
    expect(ejecutarInventarioAplicaciones(q({ aplicaciones: ['fumigación'] }), d, 'p1').estado).toBe('no_resuelto');
  });
  it('preserves the numeric prefix of application codes during identity resolution', () => {
    const d = datos();
    d.aplicaciones![0].codigo_aplicacion = '2025-004';
    d.aplicaciones![1].codigo_aplicacion = '2026-004';
    expect(ejecutarInventarioAplicaciones(q({ aplicaciones: ['2026-004'] }), d, 'p1').filas.map(a => a.id)).toEqual([B]);
  });
  it('does not certify a text-selected population while other unread labels could match', () => {
    const d = datos(); delete d.aplicaciones![2].nombre_aplicacion;
    expect(ejecutarInventarioAplicaciones(q({ aplicaciones: ['igual'] }), d, 'p1').estado).toBe('no_disponible');
    expect(ejecutarInventarioAplicaciones(q({ aplicaciones: ['igual'], aplicacion_ids: [A] }), d, 'p1').filas.map(a => a.id)).toEqual([A]);
  });
  it('renders unread labels differently from explicitly NULL labels without losing membership', () => {
    const d = datos();
    d.aplicaciones = [d.aplicaciones![0]];
    delete d.aplicaciones[0].nombre_aplicacion;
    delete d.aplicaciones[0].codigo_aplicacion;
    const unread = renderAplicaciones(ejecutarInventarioAplicaciones(q(), d, 'p1'));
    expect(unread).toContain('Aplicación con nombre o código no leído');
    expect(unread).not.toContain('Aplicación sin nombre registrado');
    d.aplicaciones[0].nombre_aplicacion = null;
    d.aplicaciones[0].codigo_aplicacion = null;
    const nulo = renderAplicaciones(ejecutarInventarioAplicaciones(q(), d, 'p1'));
    expect(nulo).toContain('Aplicación sin nombre registrado');
    expect(nulo).not.toContain('nombre o código no leído');
  });
  it('distinguishes IDs when both display name and code collide', () => {
    const d = datos();
    d.aplicaciones![0].codigo_aplicacion = 'COD-IGUAL';
    d.aplicaciones![1].codigo_aplicacion = 'COD-IGUAL';
    const texto = renderAplicaciones(ejecutarInventarioAplicaciones(q(), d, 'p1'));
    expect(texto).toContain(`ID ${A}`);
    expect(texto).toContain(`ID ${B}`);
  });
});
