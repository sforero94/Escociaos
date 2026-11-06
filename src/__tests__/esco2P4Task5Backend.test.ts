import { describe, expect, it } from 'vitest';
import { ejecutarPesajesLeche, ejecutarLitrosQuincenales, renderPesajesLeche } from '../utils/esco2/leche.ts';
import { resolverLitrosQuincenal as puro } from '../utils/hato/litrosQuincenalesPuro.ts';
import { resolverLitrosQuincenal as original } from '../utils/hatoProduccion.ts';
import { turnoIncompleto as turnoPuro } from '../utils/hato/turnoPesaje.ts';
import { turnoIncompleto as turnoOriginal } from '../utils/hato/litrosPesados.ts';
const a = 'e5500000-0000-4000-8000-000000000001';
const ingreso = 'e5500000-0000-4000-8000-000000000002';
const p = 'e5500000-0000-4000-8000-000000000003';
const selector = { animal_ids: [a], nombres: [], chapetas: [], desde: '2026-10-01', hasta: '2026-10-03' };
const pesaje = (id: string, fecha: string, total: number, am: number | null, pm: number | null) => ({ id, animal_id: a, fecha, litros_total: total, litros_am: am, litros_pm: pm, fuente: 'manual' });
const quincena = (id: string, mes: number, quincena: 1 | 2, origen_dato: 'medido' | 'derivado_mensual', litros_total: number | null) => ({ id, anio: 2026, mes, quincena, fecha_inicio: null, fecha_fin: null, origen_dato, litros_total, fin_ingreso_id: ingreso, num_vacas_ordeno: null, num_vacas_ordeno_origen: null });
describe('P4-5 backend muestras y orígenes literales', () => {
  it('excluye turno incompleto y mantiene el histórico total sin fabricar turnos', () => {
    const r = ejecutarPesajesLeche(selector, { animales: [{ id: a, nombre: 'Backend Leche', numero: 711 }], pesajes: [pesaje(p, '2026-10-01', 12, 5, 7), pesaje('e5500000-0000-4000-8000-000000000004', '2026-10-02', 3, 3, null), pesaje('e5500000-0000-4000-8000-000000000005', '2026-10-03', 8, null, null)] }, 'p1', '2026-11-05');
    expect(r.resumen[0]).toMatchObject({ suma_muestras: 20, promedio_dias_pesados: 10, cobertura: { completos: 1, historicos_total: 1, incompletos: 1 } });
  });
  it('no publica propiedades libres ajenas a la proyección de pesajes', () => {
    const fila = { ...pesaje(p, '2026-10-01', 12, 5, 7), nota_libre: 'NO PUBLICAR' };
    const r = ejecutarPesajesLeche(selector, { animales: [{ id: a, nombre: 'Backend Leche', numero: 711 }], pesajes: [fila] }, 'p1', '2026-11-05');
    expect(r.filas[0]).not.toHaveProperty('nota_libre');
  });
  it('mantiene el calificador de número provisional al presentar pesajes',()=>{
    const r=ejecutarPesajesLeche(selector,{animales:[{id:a,nombre:'Backend Provisional',numero:901}],pesajes:[pesaje(p,'2026-10-01',12,5,7)]},'p1','2026-11-05');
    expect(renderPesajesLeche(r)).toMatch(/número provisional 901/);
  });
  it('mantiene muestras finitas cuando la suma desborda y no fabrica promedio cero',()=>{
    const r=ejecutarPesajesLeche(selector,{animales:[{id:a,nombre:'Backend Leche',numero:711}],pesajes:[pesaje(p,'2026-10-01',1e308,null,null),pesaje('e5500000-0000-4000-8000-000000000004','2026-10-02',1e308,null,null)]},'p1','2026-11-05');
    expect(r.resumen[0]).toMatchObject({suma_muestras:null,promedio_dias_pesados:null,cobertura:{historicos_total:2}});
    expect(r.filas.every(f=>f.litros_usable===1e308)).toBe(true);expect(r.estado).toBe('parcial');expect(r.avisos.length).toBeGreaterThan(0);
  });
  it('un subtotal desbordado no borra sus filas ni otro origen válido',()=>{
    const r=ejecutarLitrosQuincenales({desde:'2026-01-01',hasta:'2026-02-15'},{quincenas:[quincena(p,1,1,'derivado_mensual',1e308),quincena('e5500000-0000-4000-8000-000000000004',1,2,'derivado_mensual',1e308),quincena('e5500000-0000-4000-8000-000000000005',2,1,'medido',null)],ingresos:[{id:ingreso,cantidad:12}]},'p1','2026-11-05');
    expect(r.subtotales.derivado_mensual).toEqual({litros:null,quincenas:2});expect(r.subtotales.medido).toEqual({litros:12,quincenas:1});
    expect(r.filas).toHaveLength(3);expect(r.estado).toBe('parcial');expect(r.avisos.length).toBeGreaterThan(0);
  });
  it('una quincena medido nunca usa el total local cuando el ingreso falla', () => {
    const r = ejecutarLitrosQuincenales({ desde: '2026-01-01', hasta: '2026-01-15' }, { quincenas: [quincena(p, 1, 1, 'medido', null)] }, 'p1', '2026-11-05');
    expect(r.filas[0]).toMatchObject({ litros: null, vinculo_estado: 'no_leido' });
  });
  it('el N a 1 derivado suma las particiones locales una vez por quincena', () => {
    const r = ejecutarLitrosQuincenales({ desde: '2026-01-01', hasta: '2026-01-31' }, { quincenas: [quincena(p, 1, 1, 'derivado_mensual', 40), quincena('e5500000-0000-4000-8000-000000000004', 1, 2, 'derivado_mensual', 60)], ingresos: [{ id: ingreso, cantidad: 1000 }] }, 'p1', '2026-11-05');
    expect(r.subtotales.derivado_mensual).toEqual({ litros: 100, quincenas: 2 });
  });
  it('reexporta el resolver mínimo original con paridad literal de NULL y cero', () => {
    expect(original).toBe(puro);
    for (const origen_dato of ['medido', 'derivado_mensual'] as const) for (const cantidad of [null, 0, 14]) for (const litros_total of [null, 0, 8]) {
      const fila = { origen_dato, litros_total, fin_ingreso: { cantidad } };
      expect(puro(fila)).toBe(origen_dato === 'medido' ? cantidad : litros_total);
    }
    expect(puro({ origen_dato: 'medido', litros_total: 99, fin_ingreso: null })).toBeNull();
  });
  it('reexporta la detección de turno sin cambiar la combinación NULL/cero', () => {
    expect(turnoOriginal).toBe(turnoPuro);
    for (const litros_am of [undefined, null, 0, 4]) for (const litros_pm of [undefined, null, 0, 3]) expect(turnoPuro({ litros_am, litros_pm })).toBe((litros_am != null) !== (litros_pm != null));
  });
});
