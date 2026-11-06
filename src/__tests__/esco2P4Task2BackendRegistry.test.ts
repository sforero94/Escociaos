import { describe,expect,it } from 'vitest';
import { herramientasPlanificador,validarPlan } from '../utils/esco2/registro.ts';
import { validarEstado } from '../utils/esco2/estado.ts';
const call=(a:object)=>({nombre:'consultar_conductividad',argumentos:JSON.stringify(a)});
describe('P4-2 registro CE cerrado',()=>{
 it('registra fecha operativa, cobertura y estado recuperable',()=>{
   expect(JSON.stringify(herramientasPlanificador())).toContain('consultar_conductividad');
   const pregunta='CE del suelo';
   const plan=validarPlan([call({desde:'2026-10-01',hasta:'2026-10-03',parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:'conductividad',disposicion:'consultar'}]}})],{pregunta,exigirCobertura:true});
   expect(plan.tipo).toBe('operaciones');if(plan.tipo!=='operaciones')throw new Error('plan esperado');expect(validarEstado({version:1,plan})).toBe(true);
 });
 it.each([{ronda_ids:[]},{sql:'select 1'},{desde:'2026-10-01'},{desde:'2026-02-30',hasta:'2026-03-01'},{lote_ids:['bad']},{lotes:['A','A']},{agrupar_por:['ronda']}])('rechaza otra semántica %#',a=>expect(()=>validarPlan([call(a)])).toThrow());
});
