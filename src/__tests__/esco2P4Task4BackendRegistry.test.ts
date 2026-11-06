import { describe, expect, it } from 'vitest';
import { herramientasPlanificador, validarPlan } from '../utils/esco2/registro.ts';
import { validarEstado } from '../utils/esco2/estado.ts';
const call=(args:object)=>({nombre:'consultar_hato',argumentos:JSON.stringify(args)});
describe('P4-4 herramienta cerrada de ficha actual',()=>{
 it('registra hato con cobertura y estado persistible',()=>{
  expect(JSON.stringify(herramientasPlanificador())).toContain('consultar_hato');const pregunta='Ficha de la vaca sintética';
  const p=validarPlan([call({nombres:['Sintética'],parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:'hato',disposicion:'consultar'}]}})],{pregunta,exigirCobertura:true});
  expect(p.tipo).toBe('operaciones');if(p.tipo!=='operaciones')throw Error('plan esperado');expect(validarEstado({version:1,plan:p})).toBe(true);
 });
 it.each([{animal_ids:['bad']},{nombres:['A'],chapetas:[1]},{chapetas:[1,1]},{chapetas:['1']},{chapetas:[null]},{nombres:['']},{desde:'2026-01-01',hasta:'2026-01-02'},{sql:'select 1'},{notas:true}])('rechaza selecciones o capacidades ajenas %#',args=>expect(()=>validarPlan([call(args)])).toThrow());
});
