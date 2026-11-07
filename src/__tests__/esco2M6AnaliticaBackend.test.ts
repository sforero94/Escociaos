import { describe, expect, it } from 'vitest';
import { ejecutarAnalisis, claveAnalisis } from '../utils/esco2/analitica.ts';
import { ejecutarConsulta } from '../utils/esco2/ejecutor.ts';
import { ejecutarClima } from '../utils/esco2/clima.ts';
import { ejecutarConductividad } from '../utils/esco2/conductividad.ts';
import { ejecutarPesajesLeche } from '../utils/esco2/leche.ts';
import type { ResumenDiarioClima } from '../utils/esco2/climaTipos.ts';
import type { ConsultaLabores } from '../utils/esco2/tipos.ts';
const ident = (s: string) => `aa000000-0000-4000-8000-${String([...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 0)).padStart(12, '0')}`;
const c: ConsultaLabores = { proposito: 'sintético', desde: '2026-10-01', hasta: '2026-10-31', lotes: [], tareas: [], categorias: [], sin_lote: 'incluir', agrupar_por: ['lote'], metricas: ['jornales', 'costo'], incluir_estado_tarea: false, limite: null };
const lab = () => ejecutarConsulta(c, { lotes: [{ id: ident('L1'), nombre: 'Uno', activo: true }, { id: ident('L2'), nombre: 'Dos', activo: true }], tareas: [{ id: ident('T1'), nombre: 'T', estado: 'En Proceso', tipo_tarea_id: null, jornales_estimados: null }], tiposTareas: [], registros: [{ id: ident('R1'), tarea_id: ident('T1'), lote_id: ident('L1'), fecha_trabajo: '2026-10-10', fraccion_jornal: 1, costo_jornal: 20 }, { id: ident('R2'), tarea_id: ident('T1'), lote_id: ident('L2'), fecha_trabajo: '2026-10-10', fraccion_jornal: 1, costo_jornal: null }, { id: ident('R3'), tarea_id: ident('T1'), lote_id: ident('L2'), fecha_trabajo: '2026-10-11', fraccion_jornal: 1, costo_jornal: null }] }, '2026-11-06', 'p1');
const dia = (fecha: string, valor: number | null): ResumenDiarioClima => ({ fecha, station_id: 'S', temp_c_min: null, temp_c_max: null, temp_c_avg: null, humedad_pct_min: null, humedad_pct_max: null, humedad_pct_avg: null, viento_kmh_avg: null, rafaga_kmh_max: null, viento_dir_predominante: null, lluvia_total_mm: valor, lluvia_confianza: 'ok', lluvia_mm_evento: null, radiacion_wm2_avg: null, radiacion_wm2_max: null, uv_index_max: null, horas_sol_duracion: null, lecturas_count: 288, cobertura_hueco_max_min: 5 });
describe('M6 álgebra sobre evidencia tipada', () => {
    it('umbral mantiene NULL indeterminado, no lo excluye como cero', () => {
        const r = ejecutarAnalisis({ condiciones: [{ metrica: 'costo', operador: 'gt', valor: 10, unidad: 'pesos' }] }, lab());
        expect(r.filas.find(f => f.etiqueta === 'Uno')?.seleccion).toBe('seleccionado');
        expect(r.filas.find(f => f.etiqueta === 'Dos')?.seleccion).toBe('indeterminado');
        expect(r.estado).toBe('parcial');
    });
    it('delta usa claves estables y no compara un costo NULL', () => {
        const base = lab(), a = claveAnalisis('labores', { lote: ident('L1') }, base.alcance.desde, base.alcance.hasta), b = claveAnalisis('labores', { lote: ident('L2') }, base.alcance.desde, base.alcance.hasta);
        expect(ejecutarAnalisis({ comparacion: { metrica: 'jornales', izquierda: a, derecha: b } }, base).comparacion).toMatchObject({ delta: 1, porcentaje: 100 });
        expect(ejecutarAnalisis({ comparacion: { metrica: 'costo', izquierda: a, derecha: b } }, base).comparacion?.delta).toBeNull();
    });
    it('una unidad falsa no aplica un umbral', () => { expect(ejecutarAnalisis({ condiciones: [{ metrica: 'costo', operador: 'gt', valor: 1, unidad: 'L' }] }, lab()).estado).toBe('no_soportado'); });
    it('calendario mensual cuenta días sin fila sin convertirlos en lluvia cero', () => {
        const base = ejecutarClima({ desde: '2026-10-01', hasta: '2026-10-03', variables: ['lluvia_total_mm'] }, [dia('2026-10-01', 2), dia('2026-10-03', 4)], 'p1', '2026-11-06');
        const r = ejecutarAnalisis({ agrupar_por: ['mes'] }, base);
        expect(r.filas).toHaveLength(1);
        expect(r.filas[0].metricas.lluvia_total_mm).toMatchObject({ valor: null, observado: 6, esperados: 3, usables: 2, estado: 'parcial' });
    });
    it('lluvia de cobertura desconocida permanece subtotal', () => {
        const d = dia('2026-10-01', 5);
        d.cobertura_hueco_max_min = null;
        const base = ejecutarClima({ desde: d.fecha, hasta: d.fecha, variables: ['lluvia_total_mm'] }, [d], 'p1', '2026-11-06');
        expect(ejecutarAnalisis({ agrupar_por: ['mes'] }, base).filas[0].metricas.lluvia_total_mm).toMatchObject({ valor: null, observado: 5, estado: 'parcial' });
    });
    it('última CE es por lote; conserva empates sin promedio de promedios', () => {
        const registros = [[ident('a'), ident('L1'), '2026-10-01', 1], [ident('b'), ident('L1'), '2026-10-02', 2], [ident('c'), ident('L2'), '2026-10-01', 3], [ident('d'), ident('L1'), '2026-10-02', 4]].map(([id, lote_id, fecha_monitoreo, valor_ce]) => ({ id: String(id), lote_id: String(lote_id), fecha_monitoreo: String(fecha_monitoreo), valor_ce: Number(valor_ce), lecturas: [{ arbol: 1, alta: Number(valor_ce), baja: Number(valor_ce) }], num_arboles: 1, ph: null, ronda_id: null }));
        const base = ejecutarConductividad({ lote_ids: [], lotes: [], desde: '2026-10-01', hasta: '2026-10-31' }, { lotes: [{ id: ident('L1'), nombre: 'Uno' }, { id: ident('L2'), nombre: 'Dos' }], rondas: [], registros }, 'p1', '2026-11-06');
        const r = ejecutarAnalisis({ ultima_por_entidad: true }, base);
        expect(r.filas.flatMap(f => f.miembros).sort()).toEqual([ident('b'), ident('c'), ident('d')]);
    });
    it('último pesaje conserva identidad aunque dos animales compartan nombre', () => {
        const animales = [{ id: ident('A'), nombre: 'Igual', numero: 1 }, { id: ident('B'), nombre: 'Igual', numero: 2 }];
        const pesajes = [[ident('r1'), ident('A'), '2026-10-01', 2], [ident('r2'), ident('A'), '2026-10-02', 4], [ident('r3'), ident('B'), '2026-10-01', 6]].map(([id, animal_id, fecha, litros]) => ({ id: String(id), animal_id: String(animal_id), fecha: String(fecha), litros_total: Number(litros), litros_am: Number(litros) / 2, litros_pm: Number(litros) / 2, fuente: null }));
        const base = ejecutarPesajesLeche({ animal_ids: [ident('A'), ident('B')], nombres: [], chapetas: [], desde: '2026-10-01', hasta: '2026-10-03' }, { animales, pesajes }, 'p1', '2026-11-06');
        expect(ejecutarAnalisis({ ultima_por_entidad: true }, base).filas.flatMap(f => f.miembros).sort()).toEqual([ident('r2'), ident('r3')]);
    });
});
