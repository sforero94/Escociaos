import { describe, expect, it } from 'vitest';
import { validarPlan } from '../utils/esco2/registro';
import { validarEstado } from '../utils/esco2/estado';
const id='10000000-0000-0000-0000-000000000001';
describe('D36 closed operation',()=>{
 it('accepts explicit IDs and roundtrips server state',()=>{const plan=validarPlan([{nombre:'consultar_labor_aplicacion',argumentos:JSON.stringify({aplicacion_ids:[id]})}]);expect(plan.tipo).toBe('operaciones');if(plan.tipo!=='operaciones')throw Error('plan');expect(plan.operaciones[0].tipo).toBe('labor_aplicacion');expect(validarEstado({version:1,plan})).toBe(true);});
 it.each([{}, {aplicacion_ids:[]}, {aplicacion_ids:[id],aplicaciones:['Riego']}, {aplicacion_ids:[id],desde:'2026-11-01'}, {aplicacion_ids:[id],sql:'select 1'}, {aplicacion_ids:['inventado']}])('rejects unclear scope or unregistered args %j',args=>expect(()=>validarPlan([{nombre:'consultar_labor_aplicacion',argumentos:JSON.stringify(args)}])).toThrow());
});
