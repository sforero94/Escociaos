import { describe, expect, it } from 'vitest';
import { ejecutarClima } from '../utils/esco2/clima.ts';
import { fuenteClimaSupabase } from '../utils/esco2/climaFuente.ts';
import type { ConsultaClima, ResumenDiarioClima } from '../utils/esco2/climaTipos.ts';
import { clientePostgrestFalso } from './esco2PostgrestFalso.ts';
const consulta: ConsultaClima = { desde: '2026-10-01', hasta: '2026-10-03', variables: ['lluvia_total_mm', 'temp_c_avg', 'horas_sol_duracion', 'energia_kwh_m2'] };
const dia = (fecha: string, cambios: Partial<ResumenDiarioClima> = {}): ResumenDiarioClima => ({ fecha, station_id: 'SINTETICA', temp_c_min: 10, temp_c_max: 25, temp_c_avg: 18, humedad_pct_min: 30, humedad_pct_max: 90, humedad_pct_avg: 60, viento_kmh_avg: 4, rafaga_kmh_max: 10, viento_dir_predominante: 90, lluvia_total_mm: 2, lluvia_confianza: 'ok', lluvia_mm_evento: null, radiacion_wm2_avg: 100, radiacion_wm2_max: 600, uv_index_max: 5, horas_sol_duracion: 4, lecturas_count: 48, cobertura_hueco_max_min: 30, ...cambios });
describe('P4-3 backend: identidad y datos observados', () => {
  it('mantiene denominadores por variable y calidad desconocida superpuesta', () => {
    const r = ejecutarClima(consulta, [dia('2026-10-01'), dia('2026-10-03', { temp_c_avg: null, cobertura_hueco_max_min: null })], 'p1', '2026-11-06');
    expect(r.resumen[0].variables.temp_c_avg).toMatchObject({ promedio: 18, cobertura: { solicitados: 3, usables: 1, nulos_no_usables: 1, sin_fila: 1, calidad_desconocida: 1 } });
  });
  it('rechaza PK repetidas, campo omitido y transporte no leído', () => {
    const f = dia('2026-10-01');
    expect(ejecutarClima(consulta, [f, { ...f }], 'p1', '2026-11-06').estado).toBe('no_disponible');
    expect(ejecutarClima(consulta, undefined, 'p1', '2026-11-06').estado).toBe('no_disponible');
    expect(ejecutarClima(consulta, [{ ...f, temp_c_avg: undefined } as unknown as ResumenDiarioClima], 'p1', '2026-11-06').estado).toBe('no_disponible');
  });
  it('no fusiona estaciones aunque no haya solapamiento', () => {
    const r = ejecutarClima(consulta, [dia('2026-10-01'), dia('2026-10-02', { station_id: 'OTRA' })], 'p1', '2026-11-06');
    expect(r.resumen).toHaveLength(2);
    expect(r.resumen.map(x => x.lluvia.subtotal_dias_completos)).toEqual([2, 2]);
  });
  it('no consulta otras fuentes y pagina por clave compuesta sin id ficticio', async () => {
    const cliente = clientePostgrestFalso({ clima_resumen_diario: [dia('2026-10-01'), dia('2026-10-02')] }, { maxFilas: 1 });
    const orden: string[] = [];
    const original = cliente.from.bind(cliente);
    cliente.from = tabla => ({      
select(columnas, opciones) {
        const q = original(tabla).select(columnas, opciones), order = q.order.bind(q);
        q.order = (columna, op) => { orden.push(columna); return order(columna, op); };
        return q;
      }    
});
    const filas = await fuenteClimaSupabase(cliente).leerResumen(consulta);
    expect(orden).toEqual(['fecha', 'station_id', 'fecha', 'station_id']);
    expect(filas).toHaveLength(2);
    expect(new Set(cliente.llamadas.map(x => x.tabla))).toEqual(new Set(['clima_resumen_diario']));
  });
  it('no promedia linealmente direcciones angulares', () => {
    const r = ejecutarClima({ ...consulta, variables: ['viento_dir_predominante'] }, [dia('2026-10-01', { viento_dir_predominante: 350 }), dia('2026-10-02', { viento_dir_predominante: 10 })], 'p1', '2026-11-06');
    expect(r.resumen[0].variables.viento_dir_predominante).toMatchObject({ promedio: null, min: null, max: null, cobertura: { usables: 2 } });
    expect(r.filas.map(f => f.valores.viento_dir_predominante)).toEqual([350, 10]);
  });
  it('cota cero no es día seco y congelado no participa en suma', () => {
    const r = ejecutarClima(consulta, [dia('2026-10-01', { lluvia_total_mm: 0, lluvia_confianza: 'cobertura_parcial' }), dia('2026-10-02', { lluvia_total_mm: 87, lluvia_confianza: 'contador_congelado' })], 'p1', '2026-11-06');
    expect(r.resumen[0].variables.lluvia_total_mm).toMatchObject({ promedio: null, min: null, max: null });
    // CLAUDE.md 122: una cota inferior de 0 mm no informa nada; es sin dato, nunca día seco.
    expect(r.resumen[0].lluvia).toMatchObject({ subtotal_dias_completos: null, cota_inferior_medida: null, dias_completos: 0, dias_cota_inferior: 0, dias_sin_dato: 3 });
  });
});
