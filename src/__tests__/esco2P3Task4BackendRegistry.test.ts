import { describe, expect, it } from 'vitest';
import { validarPlan, herramientasPlanificador } from '@/utils/esco2/registro';
import { validarEstado } from '@/utils/esco2/estado';
const A='00000000-0000-4000-8000-000000000001';
const llamada=(args:object)=>({nombre:'consultar_costos_aplicacion',argumentos:JSON.stringify(args)});
describe('Task4 closed monetary operation',()=>{
 it('registers the monetary selector, opt-in plan and persists the exact operation',()=>{expect(JSON.stringify(herramientasPlanificador())).toContain('consultar_costos_aplicacion');const p=validarPlan([llamada({aplicacion_id:A,incluir_plan:true})]);expect(p.tipo).toBe('operaciones');if(p.tipo!=='operaciones')throw new Error('expected operations');expect(p.operaciones[0]).toEqual({tipo:'costos_aplicacion',consulta:{aplicacion_id:A,incluir_plan:true}});expect(validarEstado({version:1,plan:p})).toBe(true);});
 it.each([{}, {aplicacion_id:A,aplicacion:'Nombre'}, {aplicacion_id:'foo'}, {aplicacion:''}, {aplicacion_id:A,incluir_plan:'true'}, {aplicacion_id:A,incluir_plan:null}, {aplicacion_id:A,sql:'select 1'}, {aplicacion_id:A,desde:'2026-11-01'},{aplicacion_id:A,desde:'2026-11-02',hasta:'2026-11-01'}])('rejects unregistered argument shape %#',args=>expect(()=>validarPlan([llamada(args)])).toThrow());
 it('preserves the existing quantities operation when adding costs to a multipart plan',()=>{const p=validarPlan([{nombre:'consultar_cantidades_aplicacion',argumentos:JSON.stringify({aplicacion_id:A})},llamada({aplicacion:A,desde:'2026-11-01',hasta:'2026-11-02'})]);expect(p.tipo).toBe('operaciones');if(p.tipo==='operaciones')expect(p.operaciones.map(o=>o.tipo)).toEqual(['cantidades_aplicacion','costos_aplicacion']);});
});
