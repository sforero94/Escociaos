import { describe, expect, it } from 'vitest';
import { buildProduccionSummary, type HatoPesajeRow, type HatoProduccionQuincenalDbRow } from '../supabase/functions/server/hato-aggregation';
import { serializarEvidenciaLeche } from '../supabase/functions/server/hato-produccion-evidencia';
const periodo = { desde: '2030-01-01', hasta: '2036-12-31' };
const row = (id: string, value: number, day = 0): HatoPesajeRow => ({ animal_id: id,
  fecha: new Date(Date.UTC(2030, 0, 1 + day)).toISOString().slice(0, 10),
  litros_am: null, litros_pm: null, litros_total: value, animal: { numero: 87, nombre: 'SYNTHETIC' } });
function encode(rows: HatoPesajeRow[], quincenas: HatoProduccionQuincenalDbRow[] = [], ids: string[] = []) {
  const full = buildProduccionSummary({ periodo, pesajes: rows, produccionQuincenal: quincenas });
  const json = serializarEvidenciaLeche(full, { identidadesParaNumero: ids, maximoQuincenas: 100 });
  expect(Buffer.byteLength(json)).toBeLessThanOrEqual(20000);
  expect(Buffer.byteLength(JSON.stringify(json))).toBeLessThanOrEqual(20000);
  return { full, json, result: JSON.parse(json) };
}
describe('bounded provider evidence for milk only', () => {
  it('keeps duplicate display labels attached to exact UUIDs, values and periods', () => {
    const { result: r } = encode([row('synthetic-a', 28), row('synthetic-a', 30, 7), row('synthetic-b', 12)]);
    expect(r.pesajes_semanales.por_vaca.map((v: { animal_id: string; promedio_litros: number }) => [v.animal_id, v.promedio_litros])).toEqual([
      ['synthetic-a', 29], ['synthetic-b', 12],
    ]);
    expect(r.resumen.mayores_promedios[0]).toMatchObject({ animal_id: 'synthetic-a', puesto: 1, primera_fecha: '2030-01-01', ultima_fecha: '2030-01-08' });
    expect(r._evidencia).toMatchObject({ consulta_completa: true, agregados_completos: true, detalle_completo: true, rango: periodo });
  });
  it('retains a late leader and complete aggregates while clearly limiting raw observations', () => {
    const rows = [...Array.from({ length: 2000 }, (_, i) => row('synthetic-a', 10, i)), row('synthetic-b', 90, 2000)];
    const { result: r, full } = encode(rows);
    expect(r.resumen.mayores_promedios[0]).toMatchObject({ animal_id: 'synthetic-b', promedio_litros: 90 });
    expect(r.resumen.total_registros).toBe(2001);
    expect(r.resumen.promedio_litros_por_pesaje).toBe(full.resumen.promedio_litros_por_pesaje);
    expect(r.pesajes_semanales.muestras_recientes).toHaveLength(20);
    expect(r.pesajes_semanales.muestras_completas).toBe(false);
    expect(r._evidencia.recortes.pesajes_omitidos).toBe(1981);
    expect(r._evidencia.detalle_completo).toBe(false);
    expect(r.pesajes_semanales.por_vaca[0].registros).toBeUndefined();
    expect(full.pesajes_semanales.por_vaca[0].registros).toHaveLength(2000);
  });
  it('preserves AM/PM and canonical totals independently in complete small samples', () => {
    const { result: r } = encode([{ ...row('synthetic-a', 30), litros_am: 12, litros_pm: 16 }, row('synthetic-b', 0)]);
    expect(r.pesajes_semanales.muestras_recientes.find((v: { animal_id: string }) => v.animal_id === 'synthetic-a')).toMatchObject({ litros_am: 12, litros_pm: 16, litros_total: 30 });
    expect(r.pesajes_semanales.muestras_recientes.find((v: { animal_id: string }) => v.animal_id === 'synthetic-b')).toMatchObject({ litros_am: null, litros_pm: null, litros_total: 0 });
    expect(r.pesajes_semanales.muestras_completas).toBe(true);
  });
  it('keeps an empty measured universe unknown rather than inventing zero production', () => {
    const { result: r } = encode([]);
    expect(r.resumen).toMatchObject({ total_registros: 0, animales_con_pesaje: 0, promedio_litros_por_pesaje: null, mayores_promedios: [] });
    expect(r.pesajes_semanales.muestras_recientes).toEqual([]);
    expect(r._evidencia.detalle_completo).toBe(true);
  });
  it('bounds high-cardinality, long Unicode labels, notes and identity lists without changing global counts', () => {
    const long = 'Á🌱'.repeat(1000);
    const rows = Array.from({ length: 20000 }, (_, i) => ({ ...row('synthetic-' + String(i).padStart(5, '0'), 10), animal: { numero: 87, nombre: long } }));
    const quincenas = Array.from({ length: 12 }, (_, i): HatoProduccionQuincenalDbRow => ({ anio: 2030, mes: i + 1, quincena: 1,
      fecha_inicio: `2030-${String(i + 1).padStart(2, '0')}-01`, fecha_fin: `2030-${String(i + 1).padStart(2, '0')}-15`,
      litros_total: null, origen_dato: 'medido', litros_pomar_confirmado: null, num_vacas_ordeno: null, notas: long, fin_ingreso: { cantidad: 1000 } }));
    const { result: r } = encode(rows, quincenas, rows.map(v => v.animal_id));
    expect(r.resumen).toMatchObject({ total_registros: 20000, animales_con_pesaje: 20000, promedio_litros_por_pesaje: 10 });
    expect(r.resumen.mayores_promedios.every((v: { puesto: number }) => v.puesto === 1)).toBe(true);
    expect(r.pesajes_semanales.por_vaca.length).toBeLessThanOrEqual(50);
    expect(r.pesajes_semanales.muestras_recientes.length).toBeLessThanOrEqual(20);
    expect(r.produccion_quincenal.length).toBeLessThanOrEqual(6);
    expect(r._evidencia.recortes).toMatchObject({ etiquetas_recortadas: true, notas_recortadas: true });
    expect(r._evidencia.recortes.perfiles_omitidos).toBe(20000 - r.pesajes_semanales.por_vaca.length);
    expect(r._evidencia.recortes.pesajes_omitidos).toBe(20000 - r.pesajes_semanales.muestras_recientes.length);
    expect(r._evidencia.recortes.quincenas_omitidas).toBe(12 - r.produccion_quincenal.length);
    expect(r._evidencia.recortes.identidades_omitidas).toBe(20000 - r._evidencia.identidades_para_numero.length);
    expect(r._evidencia).toMatchObject({ consulta_completa: true, agregados_completos: true, detalle_completo: false, numero_ambiguo: true });
    expect(r.produccion_quincenal[0]).toMatchObject({ litros_total: 1000, litros_por_vaca: null, notas_recortadas: true });
    expect(Buffer.byteLength(r.resumen.mayores_promedios[0].nombre)).toBeLessThanOrEqual(64);
  });
  it('never truncates an oversized permanent identity into another identity', () => {
    expect(() => encode([row('x'.repeat(129), 10)])).toThrow(/Identidad/);
  });
  it('rejects source measurements above the existing 20000-observation budget', () => {
    expect(() => encode(Array.from({ length: 20001 }, (_, i) => row('synthetic-a', 10, i)))).toThrow(/límite/);
  });
  it('does not turn missing canonical measurements into zero while bounding output', () => {
    expect(() => encode([{ ...row('synthetic-a', 10), litros_total: null } as unknown as HatoPesajeRow])).toThrow();
  });
});
