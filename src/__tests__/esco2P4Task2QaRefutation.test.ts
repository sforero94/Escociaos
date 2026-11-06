// Independent adversarial counterexample, after the initial contract freeze.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies,forbidNetwork,ID,request } from './esco2P2Harness.ts';
import { CE_QA,ceQaDb,ceQaSeed } from './esco2P4Task2QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await ceQaDb();},30000);
beforeEach(async()=>{await ceQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
interface Result {tipo:string;estado:string;filas:Array<{valor_ce:number|null;distribucion:unknown;estado:string}>}
describe('P4-2 QA refutation: finite raw values must not publish a nonfinite distribution',()=>{
  it.each([
    [{arbol:1,alta:1e308,baja:1e308}],
    [{arbol:1,alta:1e308,baja:null},{arbol:2,alta:1e308,baja:null}],
  ].map(value=>[value]))('withholds derived overflow %# while preserving the independent saved CE',async lecturas=>{
    await db.query('update mon_conductividad set lecturas=$1::jsonb where id=$2',[JSON.stringify(lecturas),CE_QA.first]);
    const h=dependencies(db,[{nombre:'consultar_conductividad',argumentos:JSON.stringify({desde:'2026-10-02',hasta:'2026-10-02',lote_ids:[ID.l1]})}]);
    const response=await manejar(request({pregunta:'Conductividad del suelo registrada en QA CE Norte el 2 de octubre'}),h.deps);
    const body=await response.json();const r=(body.resultados as Result[])?.find(r=>r.tipo==='conductividad');expect(r).toBeDefined();
    expect(r!.filas[0].valor_ce).toBe(7.25);expect(r!.filas[0].distribucion).toBeNull();expect(r!.filas[0].estado).not.toBe('ok');expect(r!.estado).not.toBe('ok');
    expect(body.respuesta).not.toMatch(/NaN|Infinity|∞/);
  });
});
