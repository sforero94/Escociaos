// P4-5 additional adversarial controls. Original 39 oracles remain frozen.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { USUARIOS,type Traza } from './esco2ArnesRls.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { qaFaultClient,type QaProjection } from './esco2P3Task2QaHarness.ts';
import { HATO_QA,MILK,milkQaDb,milkQaSeed } from './esco2P4Task5QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await milkQaDb();},30000);
beforeEach(async()=>{await milkQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
const first={id:'s1',texto:'Pesajes de leche de los animales solicitados del 2026-10-01 al 2026-10-05',capacidad:'pesajes_leche',disposicion:'consultar'};
const second={id:'s2',texto:'Litros quincenales de enero y febrero de 2026',capacidad:'litros_quincenales',disposicion:'consultar'};
async function execute(pesoArgs:Record<string,unknown>={desde:'2026-10-01',hasta:'2026-10-05',animal_ids:[HATO_QA.main]},both=false,fault?:(t:string,r:RespuestaPostgrest)=>RespuestaPostgrest,qArgs={desde:'2026-01-01',hasta:'2026-02-28'}) {
  const parts=both?[first,second]:[first];const pregunta=parts.map(p=>p.texto).join(' y ');
  const tools=[{nombre:'consultar_pesajes_leche',argumentos:JSON.stringify({...pesoArgs,parte_ids:['s1'],cobertura:{version:1,partes:parts}})},...(both?[{nombre:'consultar_litros_quincenales',argumentos:JSON.stringify({...qArgs,parte_ids:['s2']})}]:[])];
  const trace:Traza={consultas:[]};const projections:QaProjection[]=[];
  const h=dependencies(db,tools,{modoCobertura:'obligatoria',ahora:()=>new Date('2026-11-06T04:30:00Z'),crearClienteUsuario:jwt=>qaFaultClient(db,jwt,trace,projections,fault)});
  const response=await manejar(request({pregunta},USUARIOS.gerencia),h.deps);const body=await response.json();expect(response.status).toBe(200);
  expect(body.resultados.some((r:{tipo:string})=>r.tipo==='pesajes_leche')).toBe(true);return {body,h};
}

describe('P4-5 QA supplemental: observation binding and no cross-source totals',()=>{
  it('binds every same-date AM/PM detail row to its requested animal instead of leaving two anonymous daily quantities',async()=>{
    const {body}=await execute({desde:'2026-10-01',hasta:'2026-10-01',animal_ids:[HATO_QA.main,HATO_QA.twinActive]});
    const p=body.resultados[0];expect(p.filas).toHaveLength(2);
    expect(p.resumen.find((s:{animal_id:string})=>s.animal_id===HATO_QA.main).suma_muestras).toBe(12);
    expect(p.resumen.find((s:{animal_id:string})=>s.animal_id===HATO_QA.twinActive).suma_muestras).toBe(40);
    const details=body.respuesta.split('\n').filter((line:string)=>line.includes('2026-10-01')&&line.includes('AM'));
    expect(details.some((line:string)=>line.includes('QA Lira')&&line.includes('AM 5 L')&&line.includes('PM 7 L'))).toBe(true);
    expect(details.some((line:string)=>line.includes('QA Homónima')&&line.includes('AM 20 L')&&line.includes('PM 20 L'))).toBe(true);
    expect(body.respuesta).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4000-8000-[0-9a-f]{12}/i);
  });

  it('keeps sample sums and fortnight source subtotals separate in a mandatory multipart HTTP answer',async()=>{
    const {body,h}=await execute(undefined,true);
    expect(body.resultados).toHaveLength(2);
    expect(body.resultados[0].resumen[0].suma_muestras).toBe(20);
    expect(body.resultados[1].subtotales).toEqual({medido:{litros:100,quincenas:2},derivado_mensual:{litros:100,quincenas:2}});
    expect(body.respuesta).not.toMatch(/220\s*L|total conjunto|total combinado/i);
    expect(body.respuesta).toMatch(/muestras|pesajes/i);expect(body.respuesta).toMatch(/medid/i);expect(body.respuesta).toMatch(/derivad/i);
    expect(body.cobertura.partes.map((p:{resultado_ids:string[]})=>p.resultado_ids)).toEqual([['p1'],['p2']]);
    expect(h.solicitudes).toHaveLength(1);
  });

  it('keeps the provisional-number qualifier when a historical sample belongs to a provisionally numbered animal',async()=>{
    await db.query('update hato_pesajes_leche set animal_id=$1 where id=$2',[HATO_QA.provisional,MILK.p1]);
    const {body}=await execute({desde:'2026-10-01',hasta:'2026-10-01',animal_ids:[HATO_QA.provisional]});
    expect(body.resultados[0].resumen[0]).toMatchObject({animal_id:HATO_QA.provisional,suma_muestras:12});
    expect(body.respuesta).toMatch(/QA Aura/);expect(body.respuesta).toMatch(/provisional/i);
  });

  it('an unread linked income source preserves independent weights and valid derived partitions',async()=>{
    const control=(await execute(undefined,true)).body;
    const broken=(await execute(undefined,true,(t,r)=>t==='fin_ingresos'?{data:null,count:null,error:{message:'QA_PRIVATE_OPTIONAL_FAILURE'}}:r)).body;
    expect(broken.resultados[0]).toEqual(control.resultados[0]);
    expect(broken.resultados[1].subtotales.medido.litros).toBeNull();expect(broken.resultados[1].subtotales.derivado_mensual).toEqual({litros:100,quincenas:2});
    expect(broken.respuesta).not.toContain('QA_PRIVATE_OPTIONAL_FAILURE');
  });

  it('retains incompatible AM+PM versus total as no_calculable without adding it to samples',async()=>{
    await db.query('update hato_pesajes_leche set litros_total=11 where id=$1',[MILK.p1]);
    const {body}=await execute({desde:'2026-10-01',hasta:'2026-10-01',animal_ids:[HATO_QA.main]});const p=body.resultados[0];
    expect(p.filas[0]).toMatchObject({estado:'no_calculable',litros_total:11,litros_am:5,litros_pm:7,litros_usable:null});
    expect(p.resumen[0]).toMatchObject({suma_muestras:null,promedio_dias_pesados:null,cobertura:{no_calculables:1}});
  });

  it('uses canonical fortnight boundaries when optional recorded dates are NULL, keeping NULL provenance',async()=>{
    await db.query('update hato_produccion_quincenal set fecha_inicio=null,fecha_fin=null where id=$1',[MILK.q1]);
    const {body}=await execute(undefined,true,undefined,{desde:'2026-01-01',hasta:'2026-01-15'});const q=body.resultados[1];
    expect(q.filas[0]).toMatchObject({fecha_inicio:'2026-01-01',fecha_fin:'2026-01-15',fecha_inicio_registrada:null,fecha_fin_registrada:null,litros:100,estado:'usable'});
    expect(q.subtotales.medido).toEqual({litros:100,quincenas:1});
  });

  it('does not treat duplicated logical fortnight transport rows as distinct periods or duplicated income',async()=>{
    const {body}=await execute(undefined,true,(t,r)=>t!=='hato_produccion_quincenal'||!r.data?.length?r:{...r,data:[...r.data,{...(r.data[0] as Record<string,unknown>),id:'b5500000-0000-4000-8000-000000000099'}],count:(r.count??0)+1});
    expect(body.resultados[1].estado).toBe('no_disponible');expect(body.resultados[1].subtotales.medido.litros).toBeNull();
    expect(body.resultados[0].resumen[0].suma_muestras).toBe(20);
  });
});
