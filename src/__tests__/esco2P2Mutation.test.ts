// Independent answer-oracle sensitivity is distinct from runtime publication protection.
// These copied response mutations are NOT inputs accepted by the HTTP handler.
import type {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {manejar} from '../../supabase/functions/esco-consultas/manejador.ts';
import {ID,dependencies,forbidNetwork,overlayClient,p2Db,p2Seed,plan,request,run} from './esco2P2Harness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await p2Db();},30000);
beforeEach(async()=>p2Seed(db));
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});

type Payload={respuesta:string;resultados:Array<{total:{jornales:number;costo:number};alcance:{desde:string;hasta:string};semantica:{base_fecha:string;calificadores:string[]};filas:Array<{grupo_ids:{tarea:string};asociaciones:{estado:string;aplicaciones:{id:string}[]}}>}>};
function independentOracle(b:Payload,association:'conocido'|'no_disponible'='conocido'){
  expect(b.resultados).toHaveLength(1);const p=b.resultados[0];
  expect(p.total).toMatchObject({jornales:1.25,costo:100});expect(p.alcance).toMatchObject({desde:'2026-10-26',hasta:'2026-11-01'});
  expect(p.semantica.base_fecha).toBe('fecha_trabajo');expect(p.semantica.calificadores).toContain('alcance_visible');expect(b.respuesta).toMatch(/Se consultaron las labores que puedes ver/i);
  expect(p.filas).toHaveLength(1);expect(p.filas[0].grupo_ids.tarea).toBe(ID.t1);expect(p.filas[0].asociaciones.estado).toBe(association);
  if(association==='conocido')expect(p.filas[0].asociaciones.aplicaciones.map(a=>a.id)).toEqual([ID.a1,ID.a2]);
  else expect(p.filas[0].asociaciones.aplicaciones).toEqual([]);
  expect(b.respuesta).toMatch(/jornales registrados/);expect(b.respuesta).not.toContain('777');
}
const canonical=()=>plan({tarea_ids:[ID.t1],agrupar_por:['tarea'],incluir_estado_tarea:true});
const mutations:[string,(b:Payload)=>void][]=[
 ['wrong entity ID',b=>{b.resultados[0].filas[0].grupo_ids.tarea=ID.t2;}],
 ['wrong unit in factual prose',b=>{b.respuesta=b.respuesta.split('jornales').join('kilogramos');}],
 ['wrong date basis',b=>{b.resultados[0].semantica.base_fecha='fecha_estimada_inicio';}],
 ['wrong exact association set member',b=>{b.resultados[0].filas[0].asociaciones.aplicaciones[1].id='e1000000-0000-4000-8000-000000000099';}],
 ['removed mandatory qualifier',b=>{b.resultados[0].semantica.calificadores=b.resultados[0].semantica.calificadores.filter(x=>x!=='alcance_visible');b.respuesta=b.respuesta.replace('Se consultaron las labores que puedes ver.','');}],
 ['question-only number',b=>{b.respuesta+=' Total adicional 777.';}],
 ['skipped obligation',b=>{b.resultados=[];}],
];
describe('P2-v1 independent oracle sensitivity (NOT runtime result-mutation validation)',()=>{
  for(const [name,mutate] of mutations)it(`accepts positive control and detects ${name}`,async()=>{
    const r=await run(db,canonical(),{pregunta:'¿y 777?'});independentOracle(r.body);
    const changed=structuredClone(r.body) as Payload;mutate(changed);expect(()=>independentOracle(changed)).toThrow();
  });
  it('accepts unknown association and detects unknown converted to verified-empty',async()=>{
    const r=await run(db,canonical(),{pregunta:'consulta'},{crearClienteUsuario:jwt=>overlayClient(db,jwt,(table,row)=>{if(table==='aplicaciones')delete row.nombre_aplicacion;return row;})});
    independentOracle(r.body,'no_disponible');const changed=structuredClone(r.body) as Payload;changed.resultados[0].filas[0].asociaciones.estado='vacio_verificado';
    expect(()=>independentOracle(changed,'no_disponible')).toThrow();
  });
});

describe('P2-v1 actual runtime planner/source publication attacks',()=>{
  it('ignores arbitrary planner factual heading and question-only number with zero composer calls',async()=>{
    const r=await run(db,plan({proposito:'Se gastaron 777 millones y no hubo labores'}),{pregunta:'777'});
    expect(r.body.resultados[0].total.jornales).toBe(2.5);expect(r.body.respuesta).not.toContain('777');expect(r.body.respuesta).not.toContain('no hubo labores');expect(r.solicitudes).toHaveLength(1);
  });
  it.each([
    {sql:'select * from usuarios'},
    {base_fecha:'fecha_estimada_inicio'},
    {cohorte:'tarea_programada',base_fecha:'fecha_trabajo'},
    {ranking:{metrica:'costo',direccion:'sideways',n:1,empates:'incluir'}},
    {ranking:{metrica:'costo',direccion:'desc',n:0,empates:'incluir'}},
    {ranking:{metrica:'costo',direccion:'desc',n:1,empates:'silencioso'}},
  ])('rejects malformed closed plan %j before factual output',async extra=>{
    const r=await run(db,plan(extra));expect(r.body.origen).toBe('error_plan');expect(r.body.resultados).toEqual([]);
    expect(r.traza.consultas.filter(q=>q.tabla==='registros_trabajo')).toEqual([]);
  });
  it('rejects fifth obligation instead of silently dropping coverage',async()=>{
    const r=await run(db,[plan(),plan(),plan(),plan(),plan()]);expect(r.body.origen).toBe('error_plan');expect(r.body.resultados).toEqual([]);
  });
  it.each([
    [{nombre:'pedir_aclaracion',argumentos:JSON.stringify({pregunta:'¿cuál?',motivo:'ambiguo',sql:'select *'})}],
    [{nombre:'fuera_de_alcance',argumentos:JSON.stringify({motivo:'fuera',owner:'otro'})}],
    [{nombre:'pedir_aclaracion',argumentos:JSON.stringify({pregunta:'¿cuál?',motivo:'ambiguo'})},{nombre:'consultar_labores',argumentos:JSON.stringify(plan())}],
    Array.from({length:5},()=>({nombre:'pedir_aclaracion',argumentos:JSON.stringify({pregunta:'¿cuál?',motivo:'ambiguo'})})),
  ])('rejects non-closed special-tool combination %# before factual execution',async (...calls)=>{
    const h=dependencies(db,calls);const response=await manejar(request({pregunta:'consulta'}),h.deps);const b=await response.json();expect(b.origen).toBe('error_plan');expect(b.resultados).toEqual([]);
  });
  it('arbitrary clarification and rejection tool strings never become factual output',async()=>{
    for(const nombre of ['pedir_aclaracion','fuera_de_alcance']){
      const h=dependencies(db,[{nombre,argumentos:JSON.stringify({pregunta:'Se gastaron 777 millones',motivo:'Todos los registros son cero:777'})}]);
      const response=await manejar(request({pregunta:'consulta'}),h.deps);const b=await response.json();expect(b.respuesta).not.toContain('777');expect(b.resultados).toEqual([]);
    }
  });
});
