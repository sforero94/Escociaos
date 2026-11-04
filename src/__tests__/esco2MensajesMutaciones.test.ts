// Unlike P2's QA-only result mutations, these attack the runtime FINAL-TEXT validator.
import {describe,expect,it} from 'vitest';
import {renderMensaje,validarMensajeFinal} from '../utils/esco2/mensajes.ts';
import {ALCANCE_VISIBLE,PERIODO_NOV,asociaciones,asociacionDesconocida,conocido,cruzado,otroPeriodo} from './esco2MensajesFixtures.ts';

describe('Mensajes-v1: ocho mutaciones del texto final, con controles positivos',()=>{
  const cases=[
    {name:'entidad equivocada aunque las mismas cifras estén presentes',results:[cruzado],mutate:(t:string)=>t.replace('- Cosecha:','- TEMP:').replace('- Poda:','- Cosecha:').replace('- TEMP:','- Poda:')},
    {name:'unidad equivocada',results:[conocido],mutate:(t:string)=>t.replace('4,5 jornales','4,5 hectáreas')},
    {name:'base de fecha equivocada',results:[conocido],mutate:(t:string)=>t.replace('ambas fechas incluidas','según inicio planeado, ambas fechas incluidas')},
    {name:'miembro equivocado del conjunto de aplicaciones',results:[asociaciones],mutate:(t:string)=>t.replace('Abono','Herbicida')},
    {name:'calificador obligatorio omitido',results:[conocido],mutate:(t:string)=>t.replace(ALCANCE_VISIBLE,'')},
    {name:'número solo en la pregunta',results:[conocido],mutate:(t:string)=>t+'\nEl total adicional es 777.'},
    {name:'parte multipartes omitida',results:[conocido,otroPeriodo],mutate:(t:string)=>t.slice(0,t.indexOf('Se registraron 4,5 jornales; costo de mano de obra: $2M.')).trim()},
    {name:'asociación desconocida convertida en vacío',results:[asociacionDesconocida],mutate:(t:string)=>t.replace('No pude comprobar las aplicaciones asociadas a Cosecha porque esos datos no están disponibles.','Cosecha no tiene aplicaciones asociadas entre las que puedes ver.')},
  ];
  for(const c of cases)it(c.name,()=>{
    const legitimate=renderMensaje(c.results);expect(validarMensajeFinal(legitimate,c.results)).toBe(true);
    const changed=c.mutate(legitimate);expect(changed).not.toBe(legitimate);expect(validarMensajeFinal(changed,c.results)).toBe(false);
  });
  it('rechaza un costo copiado de otro período aunque ambos costos existan en los resultados',()=>{
    const results=[conocido,otroPeriodo];const text=renderMensaje(results);expect(validarMensajeFinal(text,results)).toBe(true);
    const changed=text.replace('Se registraron 4,5 jornales; costo de mano de obra: $95M.','Se registraron 4,5 jornales; costo de mano de obra: $2M.');expect(validarMensajeFinal(changed,results)).toBe(false);
  });
  it('rechaza fecha de otro período aunque esté presente en la segunda parte',()=>{
    const results=[conocido,otroPeriodo];const text=renderMensaje(results);const changed=text.replace('Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.',PERIODO_NOV);
    expect(changed).not.toBe(text);expect(validarMensajeFinal(changed,results)).toBe(false);
  });
});

describe('Mensajes-v1.3: no acepta contexto arbitrario como fuente factual',()=>{
 it('un argumento legado con prosa libre no se publica ni vuelve válida esa prosa',()=>{
  const legacy=renderMensaje as unknown as (r:typeof conocido[],contexto:unknown)=>string;
  expect(()=>legacy([conocido],{aclaracion:'Se gastaron 777 millones.'})).toThrow();
  const legitimate=renderMensaje([conocido]);expect(validarMensajeFinal(legitimate+'\nSe gastaron 777 millones.',[conocido])).toBe(false);
 });
});


describe('Mensajes-v1.3: avisos cerrados tampoco aceptan prosa ni objetos libres',()=>{
 it.each(['Se gastaron 777 millones.',{aclaracion:'Se gastaron 777 millones.'},{aviso:'contexto_no_disponible'}])('rechaza aviso no registrado %j',invalid=>{
  const unsafeRender=renderMensaje as unknown as (r:typeof conocido[],aviso:unknown)=>string;
  const unsafeValidate=validarMensajeFinal as unknown as (text:string,r:typeof conocido[],aviso:unknown)=>boolean;
  expect(()=>unsafeRender([conocido],invalid)).toThrow();expect(unsafeValidate(renderMensaje([conocido]),[conocido],invalid)).toBe(false);
 });
});
