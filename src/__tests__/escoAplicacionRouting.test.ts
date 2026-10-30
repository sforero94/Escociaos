import { describe, expect, it } from 'vitest';
import { aclaracionPlanAplicacion, argumentosRespuestaAplicacion, planRespuestaAplicacion } from '../utils/escoConsultas';
const today='2032-05-18';
describe('application routing domain and actual cohort boundaries',()=>{
  it.each([
    '¿Cuántas jornadas y qué costo laboral hubo por lote la semana pasada, sin detalle individual?',
    'Solo lectura: ¿Cuántas jornadas y qué costo laboral hubo por lote la semana pasada, sin detalle individual?',
    'Lluvia registrada, por día; incluye faltantes.',
    'Estado de la aplicación de software, sin datos personales.',
    '¿Cuánto se vendió en abril y mayo?',
  ])('does not capture punctuation or periods in another domain: %s',question=>{
    const p=planRespuestaAplicacion(question,today);
    expect(p).toEqual({tipo:'fuera',motivo:'otro_dominio'});
    expect(aclaracionPlanAplicacion(p)).toBeNull();
  });
  it.each(['¿Qué aplicaciones realizamos en mayo?','Consulta de solo lectura: ¿Qué aplicaciones realizamos en mayo?','¿Cuáles aplicaciones ejecutamos durante mayo?','¿Qué aplicaciones se hicieron en mayo de 2032?'])('binds ordinary execution listings to explicit actual scope: %s',question=>{
    const p=planRespuestaAplicacion(question,today);
    expect(p).toMatchObject({tipo:'aplicacion',plural:true,base:'actual',rango:{desde:'2032-05-01',hasta:'2032-05-31'},estado:true,fechas:true,consumos:false,trabajo:false});
    expect(argumentosRespuestaAplicacion(p,{application_id:'model-wrong',estado:'Cerrada',date_basis:'planned'})).toEqual({date_basis:'actual',alcance:'periodo',date_from:'2032-05-01',date_to:'2032-05-31'});
    expect(aclaracionPlanAplicacion(p)).toBeNull();
  });
  it.each(['¿Qué aplicaciones hicimos en diciembre?', '¿Qué aplicaciones realizamos en mayo de 32?', '¿Qué aplicaciones realizamos en mayo de 20320?', '¿Qué aplicaciones realizamos en mayo con producto sintético?', '¿Qué fumigaciones realizamos en mayo?', '¿Qué fertilizaciones se hicieron en mayo de 2032?','¿Qué aplicaciones hicimos?','¿Qué aplicaciones hicimos en mayo y abril?','¿Qué aplicaciones hicimos contra plaga sintética en mayo?','Estado de la aplicación; compara con enero','Estado de las aplicaciones en mayo de 2032 y junio de 2032'])('clarifies unresolved application scope rather than widening or falling back: %s',question=>{
    expect(aclaracionPlanAplicacion(planRespuestaAplicacion(question,today))).toBeTruthy();
  });
  it('does not infer a preceding year across January for an omitted-year December',()=>{
    expect(aclaracionPlanAplicacion(planRespuestaAplicacion('¿Qué aplicaciones realizamos en diciembre?','2033-01-02'))).toBeTruthy();
    expect(planRespuestaAplicacion('¿Qué aplicaciones realizamos en diciembre de 2032?','2033-01-02')).toMatchObject({tipo:'aplicacion',rango:{desde:'2032-12-01',hasta:'2032-12-31'}});
  });
});
