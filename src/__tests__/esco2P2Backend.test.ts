import { describe, it, expect } from 'vitest';
import { ejecutarConsulta } from '../utils/esco2/ejecutor';
import { aRegistro, fuenteEnMemoria } from '../utils/esco2/fuente';
import { responderTurno, type ConfigModelos } from '../utils/esco2/nucleo';
import { validarPlan } from '../utils/esco2/registro';
import type { ConsultaLabores, DatosLabores } from '../utils/esco2/tipos';
const c = (p: Partial<ConsultaLabores> = {}): ConsultaLabores => ({ proposito: 'Invented 777', desde: '2026-11-01', hasta: '2026-11-30', lotes: [], tareas: [], categorias: [], sin_lote: 'incluir', agrupar_por: ['lote'], metricas: ['jornales', 'costo'], incluir_estado_tarea: false, limite: null, ...p });
const datos = (): DatosLabores => ({ lotes: [{ id: 'l1', nombre: 'Igual', activo: true, total_arboles: 100, area_hectareas: 2 }, { id: 'l2', nombre: 'Igual', activo: true, total_arboles: 200, area_hectareas: 4 }], tiposTareas: [{ id: 'ty', nombre: 'Tipo', categoria: 'Especial' }], tareas: [{ id: 't1', nombre: 'Tarea', estado: 'Programada', tipo_tarea_id: 'ty', jornales_estimados: 0, fecha_estimada_inicio: '2026-11-20', lote_ids: ['l1'] }, { id: 't2', nombre: 'Tarea', estado: null, tipo_tarea_id: 'ty', jornales_estimados: null, fecha_estimada_inicio: '2026-11-21', lote_ids: ['l2'] }], registros: [{ id: 'r1', tarea_id: 't1', lote_id: 'l1', fecha_trabajo: '2026-11-01', fraccion_jornal: 1, costo_jornal: 10 }, { id: 'r2', tarea_id: 't2', lote_id: 'l2', fecha_trabajo: '2026-11-02', fraccion_jornal: .5, costo_jornal: 30 }] });
const config: ConfigModelos = { nombre: 'test', planificador: { modelo: 'script', esfuerzo: 'none' }, compositor: { modelo: 'never', esfuerzo: 'none' } };
describe('P2 backend unit contract', () => {
    it('preserves unread applications', async () => expect((await fuenteEnMemoria(datos()).catalogo()).aplicaciones).toBeUndefined());
    it('groups duplicate lot labels by ID', () => { const r = ejecutarConsulta(c(), datos(), '2026-11-04', 'p1'); expect(r.filas).toHaveLength(2); expect(r.filas.map(f => f.grupo_ids?.lote).sort()).toEqual(['l1', 'l2']); });
    it('supports explicit cost rank with tie policy', () => { const r = ejecutarConsulta(c({ ranking: { metrica: 'costo', direccion: 'desc', n: 1, empates: 'incluir' } }), datos(), '2026-11-04', 'p1'); expect(r.filas[0].grupo_ids?.lote).toBe('l2'); expect(r.cobertura.grupos_totales).toBe(2); });
    it('rejects dangling category before filtering', () => { const d = datos(); d.tareas[1].tipo_tarea_id = 'missing'; expect(ejecutarConsulta(c({ categorias: ['Especial'] }), d, '2026-11-04', 'p1').estado).toBe('no_disponible'); });
    it('does not turn missing date into verified empty', () => { const d = datos(); delete (d.registros[0] as Partial<typeof d.registros[0]>).fecha_trabajo; expect(ejecutarConsulta(c(), d, '2026-11-04', 'p1').estado).toBe('no_disponible'); });
    it('selects future scheduled tasks by direct assignment', () => { const r = ejecutarConsulta(c({ cohorte: 'tarea_programada', base_fecha: 'fecha_estimada_inicio', lote_ids: ['l2'], agrupar_por: ['tarea'], metricas: [], incluir_estado_tarea: true }), datos(), '2026-11-04', 'p1'); expect(r.semantica?.miembros).toEqual(['t2']); expect(r.total.jornales).toBeUndefined(); expect(r.alcance.hasta).toBe('2026-11-30'); });
    it('scheduled null assignment is unknown', () => { const d = datos(); d.tareas[0].lote_ids = null; expect(ejecutarConsulta(c({ cohorte: 'tarea_programada', lote_ids: ['l2'], metricas: [], agrupar_por: ['tarea'] }), d, '2026-11-04', 'p1').estado).toBe('no_disponible'); });
    it('keeps zero estimate and missing count separate', () => { const r = ejecutarConsulta(c({ categorias: ['Especial'] }), datos(), '2026-11-04', 'p1'); expect(r.estimados).toMatchObject({ jornales_estimados: 0, tareas_en_alcance: 2, tareas_sin_estimado: 1 }); });
    it('retains ratios and date metrics', () => { const r = ejecutarConsulta(c({ lote_ids: ['l1'], metricas: ['jornales', 'costo', 'jornales_por_arbol', 'jornales_por_hectarea', 'costo_por_jornal', 'dias_con_registro', 'primer_registro', 'ultimo_registro'] }), datos(), '2026-11-04', 'p1'); expect(r.total).toMatchObject({ jornales: 1, costo: 10, jornales_por_arbol: .01, jornales_por_hectarea: .5, costo_por_jornal: 10, dias_con_registro: 1, primer_registro: '2026-11-01', ultimo_registro: '2026-11-01' }); });
    it('publishes deterministic factual text with one planner only', async () => {
        let calls = 0;
        const t = await responderTurno({ pregunta: '777', historial: [], hoy: '2026-11-04', datos: datos(), config, llm: { async completar() {
                    calls++;
                    if (calls > 1)
                        throw Error('composer must not run');
                    return { modelo: 'script', texto: '', llamadas: [{ nombre: 'consultar_labores', argumentos: JSON.stringify(c()) }], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 1, finishReason: 'stop' };
                } } });
        expect(calls).toBe(1);
        expect(t.respuesta).not.toContain('Invented 777');
        expect(t.origen).toBe('determinista');
    });
    it('binds verified-empty evidence to source scope', () => { const d = datos(); d.registros = []; expect(ejecutarConsulta(c(), d, '2026-11-04', 'p1').semantica?.fuentes.length).toBeGreaterThan(0); });
    it('keeps sin-lote and assigned partitions separate', () => { const d = datos(); d.registros[1].lote_id = null; const r = ejecutarConsulta(c({ agrupar_por: [] }), d, '2026-11-04', 'p1'); expect(r.particiones?.con_lote.jornales).toBe(1); expect(r.particiones?.sin_lote.jornales).toBe(.5); });
    it('retains each readable task date while marking unread dates unavailable', () => { const r = ejecutarConsulta(c({ agrupar_por: ['tarea'], incluir_estado_tarea: true }), datos(), '2026-11-04', 'p1'); expect(r.filas[0].fechas_tarea?.estimada_inicio).toBe('2026-11-20'); expect(r.filas[0].fechas_tarea?.real_inicio).toBeUndefined(); });
    it('reader does not normalize malformed calendar evidence into a valid date', () => expect(() => aRegistro({ ...datos().registros[0], fecha_trabajo: '2026-11-01garbage' })).toThrow());
    it('rejects incompatible cohort and date basis', () => expect(() => validarPlan([{ nombre: 'consultar_labores', argumentos: JSON.stringify(c({ cohorte: 'tarea_programada', base_fecha: 'fecha_trabajo' })) }])).toThrow());
});
