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

describe('shared application grammar boundaries',()=>{
  it.each(['¿Cuánto se ha usado de cada producto en la aplicación control plaga Z de mayo de 2032?','¿Cuánto se ha utilizado de cada producto en la aplicación control plaga Z de mayo de 2032?'])('selects registered consumption rather than unguarded prose: %s',q=>{
    expect(planRespuestaAplicacion(q,today)).toMatchObject({tipo:'aplicacion',base:'actual',consumos:true,rango:{desde:'2032-05-01',hasta:'2032-05-31'}});
  });
  it.each(['¿Y cuántos jornales llevamos en esa aplicación?','Consulta de solo lectura: ¿Y cuántos jornales llevamos en esa aplicación?'])('treats initial discourse conjunction as one work request: %s',q=>{
    expect(planRespuestaAplicacion(q,today)).toMatchObject({tipo:'aplicacion',trabajo:true,consumos:false,rango:null});
  });
  it('keeps a bare month in a singular literal name rather than inventing a date range',()=>{
    expect(planRespuestaAplicacion('¿Cómo va la aplicación Fumigación control plaga Z mayo?',today)).toMatchObject({tipo:'aplicacion',rango:null,estado:true,consumos:true});
  });
  it.each([
    ['¿Qué aplicaciones tuvieron ejecución del 12/05/2032 al 14/05/2032?','2032-05-12','2032-05-14'],
    ['¿Qué aplicaciones tuvieron ejecución del 3 al 5 de mayo de 2032?','2032-05-03','2032-05-05'],
    ['¿Qué aplicaciones ejecutamos del 2032-05-12 al 2032-05-14?','2032-05-12','2032-05-14'],
    ['¿Qué aplicaciones realizamos ayer?','2032-05-17','2032-05-17'],
  ])('binds the whole execution-cohort period: %s',(q,desde,hasta)=>{
    expect(planRespuestaAplicacion(q,today)).toMatchObject({tipo:'aplicacion',base:'actual',plural:true,rango:{desde,hasta}});
  });
  it.each(['¿Qué aplicaciones tuvieron ejecución del 14/05/2032 al 12/05/2032?','¿Qué aplicaciones tuvieron ejecución del 3 al 5 de mayo de 2032 y abril?','¿Qué aplicaciones tuvieron ejecución del 12/05/2032 al 14/05/2032 con producto inventado?','Consumo real frente a dosis planeadas de la aplicación control plaga Z'])('keeps conflicting or unsupported scope explicit: %s',q=>{
    expect(aclaracionPlanAplicacion(planRespuestaAplicacion(q,today))).toBeTruthy();
  });
});

it('does not turn a mixed labor/weather follow-up into a generic application report',()=>{
  expect(planRespuestaAplicacion('¿Y cuántos jornales y cómo estará la lluvia en esa aplicación?',today)).toEqual({tipo:'fuera',motivo:'consulta_mixta'});
});
