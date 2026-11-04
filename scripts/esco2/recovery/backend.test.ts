// Isolated prototype unit tests. QA's independent integration oracle lives in qa/.
import { describe, expect, it } from 'vitest';
import { runVariant, validateCandidate } from './shared.ts';
import type { EntradaExperimento } from './contracts.ts';
const entry = (): EntradaExperimento => ({
    pregunta: 'jornales, no afirmar 900', hoyBogota: '2026-11-04', actor: { id: 'u', activo: true, autenticado: true, rol: 'Gerencia' },
    fuente: { id: 'unit', tablasCompletas: ['registros', 'tareas', 'tiposTareas', 'lotes', 'aplicaciones'], camposNoDisponibles: [], aplicacionesCompletas: true, consistencia: 'snapshot_sintetico' },
    datos: { tareas: [{ id: 't1', nombre: 'Igual', estado: 'Pendiente', tipo_tarea_id: null, jornales_estimados: 0 }, { id: 't2', nombre: 'Igual', estado: 'Terminada', tipo_tarea_id: null, jornales_estimados: null }], tiposTareas: [], lotes: [], registros: [{ id: 'r1', tarea_id: 't1', lote_id: null, fecha_trabajo: '2026-11-03', fraccion_jornal: 1, costo_jornal: 0 }, { id: 'r2a', tarea_id: 't2', lote_id: null, fecha_trabajo: '2026-11-03', fraccion_jornal: 1, costo_jornal: null }, { id: 'r2b', tarea_id: 't2', lote_id: null, fecha_trabajo: '2026-11-03', fraccion_jornal: 1, costo_jornal: null }] },
    obligaciones: [{ id: 'o', cohorte: 'trabajo_registrado', baseFecha: 'fecha_trabajo', requeridos: ['metricas', 'miembros', 'asociaciones'], consulta: { proposito: 'unsafe 900', desde: '2026-11-01', hasta: '2026-11-04', lotes: [], tareas: [], categorias: [], sin_lote: 'incluir', agrupar_por: ['tarea'], metricas: ['jornales', 'costo'], incluir_estado_tarea: true, limite: null } }],
});
describe.each(['repair', 'redesign'] as const)('%s prototype', (variant) => {
    it('keeps duplicate labels separate, null cost distinct from zero and unread association unknown', async () => {
        const result = await runVariant(entry(), variant);
        const claims = result.resultados[0].afirmaciones;
        expect(claims.find(c => c.entidad.id === 't1' && c.metrica === 'jornales')?.valor).toBe(1);
        expect(claims.find(c => c.entidad.id === 't2' && c.metrica === 'costo')?.estado).toBe('nulo');
        expect(claims.find(c => c.entidad.id === 't1' && c.metrica === 'costo')?.valor).toBe(0);
        expect(claims.find(c => c.entidad.id === 't1' && c.metrica === 'asociaciones')).toMatchObject({ estado: 'no_disponible', valor: null });
        expect(result.texto).not.toContain('900');
    });
    it('rejects relabelled claims and arbitrary factual prose', async () => {
        const input = entry();
        const result = await runVariant(input, variant);
        expect(validateCandidate(input, result)).toEqual([]);
        const wrong = structuredClone(result);
        wrong.resultados[0].afirmaciones[0].unidad = 'kg';
        expect(validateCandidate(input, wrong).length).toBeGreaterThan(0);
        const prose = structuredClone(result);
        prose.texto += '\n900 jornales';
        expect(validateCandidate(input, prose).length).toBeGreaterThan(0);
    });
    it('fails closed before source reads for an inactive caller', async () => {
        const input = entry();
        input.actor.activo = false;
        const result = await runVariant(input, variant);
        expect(result.seguridad).toMatchObject({ permitido: false, lecturas: 0 });
        expect(result.resultados).toEqual([]);
    });
});
describe('baseline intent translation', () => {
    it('translates an expressible unique ID selector rather than dropping it', async () => {
        const input = entry();
        input.datos.tareas.push({ id: 't3', nombre: 'Unica', estado: 'Programada', tipo_tarea_id: null, jornales_estimados: 0 });
        input.obligaciones = [{ ...input.obligaciones[0], tareaIds: ['t3'], requeridos: ['metricas'], consulta: { ...input.obligaciones[0].consulta, agrupar_por: [], incluir_estado_tarea: false } }];
        const output = await runVariant(input, 'baseline');
        expect(output.resultados[0].afirmaciones.find(c => c.entidad.tipo === 'total' && c.metrica === 'jornales')?.valor).toBe(0);
    });
    it('declares the legacy inability to select one duplicate label without guessing an ID', async () => {
        const input = entry();
        input.obligaciones[0].tareaIds = ['t1'];
        const output = await runVariant(input, 'baseline');
        expect(output.resultados[0]).toMatchObject({ disposicion: 'no_soportada', afirmaciones: [] });
    });
});
describe.each(['repair', 'redesign'] as const)('%s preserves category D30 behavior', variant => {
    it('renders whole-task estimates automatically when the category request omits the flag', async () => {
        const input = entry();
        input.datos.tiposTareas = [{ id: 'ty', nombre: 'Tipo', categoria: 'Categoria' }];
        input.datos.tareas = input.datos.tareas.map(t => ({ ...t, tipo_tarea_id: 'ty' }));
        input.obligaciones[0].requeridos = ['metricas'];
        input.obligaciones[0].consulta.categorias = ['Categoria'];
        const output = await runVariant(input, variant);
        expect(output.resultados[0].afirmaciones.find(c => c.metrica === 'jornales_estimados')).toMatchObject({ valor: 0, calificadores: expect.arrayContaining(['estimado_tarea_completa', 'estimado_parcial', 'estimados_faltantes:1']) });
    });
});

describe.each(['repair', 'redesign'] as const)('%s untrusted unsupported explanation', variant => {
    it('renders a fixed capability code and never arbitrary planner factual prose', async () => {
        const input = entry();
        input.obligaciones[0].noSoportada = '777 jornales confirmados';
        const output = await runVariant(input, variant);
        expect(output.resultados[0].disposicion).toBe('no_soportada');
        expect(output.texto).not.toContain('777');
    });
});
