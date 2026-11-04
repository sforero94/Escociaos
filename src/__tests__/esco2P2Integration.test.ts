// Independent P2-v1 handler integration: real reader, SQL/RLS, scripted planner.
import type {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import type {FilaResultado} from '../utils/esco2/tipos.ts';
type HttpRow=FilaResultado & {grupo_ids:NonNullable<FilaResultado['grupo_ids']>};
import {ID,forbidNetwork,p2Db,p2Seed,plan,run} from './esco2P2Harness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await p2Db();},30000);
beforeEach(async()=>p2Seed(db));
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});

describe('P2-v1 actual handler / independent synthetic SQL',()=>{
  it('publishes exact totals, Monday calendar and requested date metrics with one planner and no composer',async()=>{
    const r=await run(db,plan({agrupar_por:['semana'],metricas:['jornales','costo','dias_con_registro','primer_registro','ultimo_registro']}));
    const oracle=await db.query<{j:number,c:number,n:number}>(`select sum(fraccion_jornal::text::numeric)::float8 j,sum(costo_jornal)::float8 c,count(distinct fecha_trabajo)::int n from registros_trabajo`);
    expect(oracle.rows[0]).toEqual({j:2.5,c:250,n:2});
    expect(r.response.status).toBe(200);expect(r.body.origen).toBe('determinista');expect(r.body.hoy).toBe('2026-11-04');
    expect(r.body.resultados[0].total).toMatchObject({jornales:2.5,costo:250,dias_con_registro:2,primer_registro:'2026-10-26',ultimo_registro:'2026-11-01'});
    expect(r.body.resultados[0].filas).toHaveLength(1);expect(r.body.respuesta).toContain('26 de octubre de 2026');expect(r.body.respuesta).toContain('1 de noviembre de 2026');
    expect(r.solicitudes).toHaveLength(1);expect(r.solicitudes[0].modelo).toBe('openai/gpt-6-luna');expect(r.traza.consultas.every(q=>q.rol==='authenticated')).toBe(true);
  });
  it('keeps duplicate lot labels as distinct ID groups and sin-lote as its own partition',async()=>{
    const r=await run(db,plan({agrupar_por:['lote']}));const p=r.body.resultados[0];
    expect(p.total).toMatchObject({jornales:2.5,costo:250});expect(p.filas).toHaveLength(4);
    const byId=new Map(p.filas.map((f:HttpRow)=>[f.grupo_ids.lote,f]));
    expect(byId.get(ID.l1)).toMatchObject({jornales:1,costo:100});expect(byId.get(ID.l2)).toMatchObject({jornales:.5,costo:100});
    expect(p.cobertura.registros_sin_lote).toBe(1);expect(p.filas.reduce((s:number,f:HttpRow)=>s+(f.jornales??0),0)).toBe(2.5);
    expect(r.body.respuesta).not.toContain(ID.l1);expect(r.body.respuesta).not.toContain(ID.l2);expect(r.body.respuesta).toContain('Lote repetido');expect(r.body.respuesta).toContain('1 jornal registrado');expect(r.body.respuesta).toContain('0,5 jornales registrados');
  });
  it('cost ranking includes ties and preserves the full scope total and population',async()=>{
    const r=await run(db,plan({agrupar_por:['lote'],ranking:{metrica:'costo',direccion:'desc',n:1,empates:'incluir'}}));const p=r.body.resultados[0];
    expect(p.total.costo).toBe(250);expect(p.filas.map((f:HttpRow)=>f.grupo_ids.lote)).toEqual([ID.l1,ID.l2]);
    expect(p.cobertura).toMatchObject({grupos_totales:4,grupos_mostrados:2});
    expect(r.body.respuesta).toMatch(/4/);expect(r.body.respuesta).toMatch(/2/);
  });
  it('exact N ties resolve by ascending stable ID and asc direction actually reverses metric order',async()=>{
    const exact=await run(db,plan({agrupar_por:['lote'],ranking:{metrica:'costo',direccion:'desc',n:1,empates:'exactamente_n_por_id'}}));
    expect(exact.body.resultados[0].filas.map((f:HttpRow)=>f.grupo_ids.lote)).toEqual([ID.l1]);
    const asc=await run(db,plan({agrupar_por:['lote'],sin_lote:'excluir',ranking:{metrica:'costo',direccion:'asc',n:1,empates:'incluir'}}));
    expect(asc.body.resultados[0].filas.map((f:HttpRow)=>f.grupo_ids.lote)).toEqual([ID.l3]);
    expect(asc.body.resultados[0].total).toMatchObject({jornales:2.25,costo:250});
  });
  it('preserves all three supported ratios from existing calculators with an explicit lot base',async()=>{
    const r=await run(db,plan({lote_ids:[ID.l1],metricas:['jornales','costo','jornales_por_arbol','jornales_por_hectarea','costo_por_jornal']}));
    expect(r.body.resultados[0].total).toMatchObject({jornales:1,costo:100,jornales_por_arbol:.01,jornales_por_hectarea:.5,costo_por_jornal:100});
    expect(r.body.respuesta).toMatch(/árbol/);expect(r.body.respuesta).toMatch(/hectárea/);expect(r.body.respuesta).toMatch(/por jornal/);
  });
  it('future scheduling follows direct task lot assignment instead of recorded lot and never emits recorded zero facts',async()=>{
    const r=await run(db,plan({cohorte:'tarea_programada',base_fecha:'fecha_estimada_inicio',desde:'2026-11-10',hasta:'2026-11-10',lote_ids:[ID.l2],agrupar_por:['tarea'],metricas:[],incluir_estado_tarea:true}));const p=r.body.resultados[0];
    expect(p.estado).toBe('ok');expect(p.semantica.miembros).toEqual([ID.t1]);expect(p.alcance.hasta).toBe('2026-11-10');expect(p.alcance.hasta_recortado_a_hoy).toBe(false);
    expect(p.total.jornales).toBeUndefined();expect(r.body.respuesta).not.toMatch(/0 jornales registrados/);expect(r.body.respuesta).toContain('Labor igual');expect(r.body.respuesta).not.toContain(ID.t1);expect(r.body.respuesta).not.toContain(ID.t2);
  });
  it('scheduled category D30 estimates use selected planned-start tasks and disclose whole-task coverage',async()=>{
    const r=await run(db,plan({cohorte:'tarea_programada',base_fecha:'fecha_estimada_inicio',desde:'2026-11-10',hasta:'2026-11-12',categorias:['Mantenimiento del cultivo'],metricas:[],agrupar_por:['tarea']}));const p=r.body.resultados[0];
    expect(p.semantica.miembros).toEqual([ID.t1,ID.t2]);expect(p.estimados).toMatchObject({jornales_estimados:5,tareas_en_alcance:2,tareas_sin_estimado:1});expect(r.body.respuesta).toMatch(/plan completo/);expect(r.body.respuesta).toMatch(/1 tarea/);
  });
  it('D30 estimates are whole-task subtotal with missing count and zero estimate retained separately',async()=>{
    const r=await run(db,plan({categorias:['Mantenimiento del cultivo']}));const p=r.body.resultados[0];
    expect(p.total.jornales).toBe(2.5);expect(p.estimados).toMatchObject({jornales_estimados:5,tareas_en_alcance:3,tareas_sin_estimado:1,base:'toda_la_categoria'});
    expect(r.body.respuesta).toMatch(/plan completo/);expect(r.body.respuesta).toMatch(/1 tarea/);
  });
  it('null cost is unknown while explicit zero cost and complete no-work scope remain exact zero',async()=>{
    await db.query('update registros_trabajo set costo_jornal=null where id=$1',[ID.r1]);
    const unknown=await run(db,plan());expect(unknown.body.resultados[0].total).toMatchObject({jornales:2.5,costo:null});
    const zero=await run(db,plan({sin_lote:'solo'}));expect(zero.body.resultados[0].total).toMatchObject({jornales:.25,costo:0});
    const empty=await run(db,plan({desde:'2026-10-01',hasta:'2026-10-02'}));expect(empty.body.resultados[0].total).toMatchObject({jornales:0,costo:0});expect(empty.body.resultados[0].estado).toBe('sin_registros');
  });
  it('recorded future dates are clipped to Bogotá today with an explicit qualifier',async()=>{
    await db.query(`insert into registros_trabajo values('d1000000-0000-4000-8000-000000000099',$1,$2,'2026-11-05','1.0',999)`,[ID.t1,ID.l1]);
    const r=await run(db,plan({hasta:'2026-11-10'}));const p=r.body.resultados[0];
    expect(p.total).toMatchObject({jornales:2.5,costo:250});expect(p.alcance.hasta).toBe('2026-11-04');expect(p.alcance.hasta_recortado_a_hoy).toBe(true);expect(r.body.respuesta).toMatch(/se cuenta solo hasta hoy/);
  });
  it('an explicit task without records still has current metadata and verified-empty association',async()=>{
    const r=await run(db,plan({tarea_ids:[ID.t3],agrupar_por:['tarea'],incluir_estado_tarea:true}));const p=r.body.resultados[0];
    expect(p.filas).toHaveLength(1);expect(p.filas[0].grupo_ids.tarea).toBe(ID.t3);expect(p.filas[0].estado_tarea).toBe('Banco');expect(p.filas[0].jornales_estimados).toBe(0);expect(p.filas[0].asociaciones).toEqual({estado:'vacio_verificado',aplicaciones:[]});
  });
  it('application association is exact ID set despite equal names and verified-empty remains a separate task result',async()=>{
    const r=await run(db,plan({agrupar_por:['tarea'],incluir_estado_tarea:true}));const rows=r.body.resultados[0].filas;
    const t1=rows.find((f:HttpRow)=>f.grupo_ids.tarea===ID.t1);const t2=rows.find((f:HttpRow)=>f.grupo_ids.tarea===ID.t2);
    expect(t1.asociaciones.aplicaciones.map((a:{id:string})=>a.id).sort()).toEqual([ID.a1,ID.a2]);expect(t2.asociaciones).toEqual({estado:'vacio_verificado',aplicaciones:[]});
    expect(r.body.respuesta).not.toContain(ID.a1);expect(r.body.respuesta).not.toContain(ID.a2);expect(r.body.respuesta).toContain('Aplicación igual y Aplicación igual');
  });
});
