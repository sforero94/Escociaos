// P2-v1 source-adapter → orchestration → executor integration. Independent malformed fixtures.
import type {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {CONFIG_M3} from '../../supabase/functions/esco-consultas/manejador.ts';
import {ejecutarConsulta} from '../utils/esco2/ejecutor.ts';
import {validarPlan} from '../utils/esco2/registro.ts';
import {fuenteSupabase} from '../utils/esco2/fuente.ts';
import {responderTurno} from '../utils/esco2/nucleo.ts';
import type {DatosLabores} from '../utils/esco2/tipos.ts';
import {clienteRls,jwtSintetico,USUARIOS} from './esco2ArnesRls.ts';
import {ID,forbidNetwork,overlayClient,p2Db,p2Seed,plan,run,scripted,tool} from './esco2P2Harness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await p2Db();},30000);
beforeEach(async()=>p2Seed(db));
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
async function data(){const s=fuenteSupabase(clienteRls(db,jwtSintetico(USUARIOS.gerencia)));return {...await s.catalogo(),registros:await s.registros('2026-10-01','2026-12-01')};}
async function memory(datos:DatosLabores,args=plan()){
  const s=scripted([tool(args)]);return responderTurno({datos,pregunta:'consulta',historial:[],hoy:'2026-11-04',llm:s.llm,config:CONFIG_M3});
}
function unavailable(t:Awaited<ReturnType<typeof memory>>){
  expect(t.resultados[0].estado).toBe('no_disponible');expect(t.resultados[0].total).toEqual({});
}

describe('P2-v1 field completeness and valid references BEFORE filtering',()=>{
  it('validated plan rejects an empty record ID at the executor source boundary',async()=>{
    const d=await data();d.registros[0].id='';const parsed=validarPlan([tool(plan())]);if(parsed.tipo!=='consultas')throw new Error('expected query plan');
    const r=ejecutarConsulta(parsed.consultas[0],d,'2026-11-04','p1');expect(r.estado).toBe('no_disponible');expect(r.total).toEqual({});
  });
  it('validated plan rejects a null record row at the executor source boundary without throwing',async()=>{
    const d=await data();d.registros[0]=null as unknown as DatosLabores['registros'][number];const parsed=validarPlan([tool(plan())]);if(parsed.tipo!=='consultas')throw new Error('expected query plan');
    expect(()=>ejecutarConsulta(parsed.consultas[0],d,'2026-11-04','p1')).not.toThrow();const r=ejecutarConsulta(parsed.consultas[0],d,'2026-11-04','p1');expect(r.estado).toBe('no_disponible');expect(r.total).toEqual({});
  });
  it('missing work date cannot disappear in the memory source date filter',async()=>{
    const d=await data();delete (d.registros[0] as Partial<typeof d.registros[0]>).fecha_trabajo;
    const r=await memory(d);unavailable(r);expect(r.respuesta).not.toMatch(/no hay registros de trabajo/);
  });
  it('missing planned-start field on a task hidden by an ID filter cannot certify empty scheduling',async()=>{
    const d=await data();delete d.tareas.find(t=>t.id===ID.t2)!.fecha_estimada_inicio;
    const r=await memory(d,plan({cohorte:'tarea_programada',base_fecha:'fecha_estimada_inicio',desde:'2026-11-10',hasta:'2026-11-10',tarea_ids:[ID.t1],metricas:[],agrupar_por:['tarea']}));unavailable(r);
  });
  it('malformed date text cannot disappear before source validation',async()=>{
    const d=await data();d.registros[0].fecha_trabajo='zzz';unavailable(await memory(d));
  });
  it('undefined D30 estimate counts as unavailable instead of a zero contribution with full coverage',async()=>{
    const d=await data();delete (d.tareas[0] as Partial<typeof d.tareas[0]>).jornales_estimados;
    const r=await memory(d,plan({categorias:['Mantenimiento del cultivo']}));
    const e=r.resultados[0].estimados as {tareas_estimado_no_disponible?:number}|undefined;expect(e?.tareas_estimado_no_disponible===1||r.resultados[0].estado==='no_disponible').toBe(true);
  });
  it('unread category and dangling type relation cannot be excluded by a category filter',async()=>{
    const d=await data();delete (d.tiposTareas[0] as Partial<typeof d.tiposTareas[0]>).categoria;
    unavailable(await memory(d,plan({categorias:['Mantenimiento del cultivo']})));
    const dangling=await data();dangling.tareas.find(t=>t.id===ID.t2)!.tipo_tarea_id='b1999999-0000-4000-8000-000000000001';
    unavailable(await memory(dangling,plan({categorias:['Mantenimiento del cultivo']})));
  });
  it('dangling task and lot references cannot drop work or produce ID-as-display facts',async()=>{
    const d=await data();d.registros[0].tarea_id='c1999999-0000-4000-8000-000000000001';unavailable(await memory(d,plan({tarea_ids:[ID.t2]})));
    const lot=await data();lot.registros[0].lote_id='a1999999-0000-4000-8000-000000000001';unavailable(await memory(lot,plan({lote_ids:[ID.l2],agrupar_por:['lote']})));
  });
  it('duplicate row IDs cannot count twice',async()=>{
    const d=await data();d.registros[1].id=d.registros[0].id;unavailable(await memory(d));
  });
  it('unread cost cannot be treated as known null or zero',async()=>{
    const d=await data();delete (d.registros[0] as Partial<typeof d.registros[0]>).costo_jornal;unavailable(await memory(d));
  });
  it('unread application table keeps available labor but never renders no-association',async()=>{
    const d=await data();delete d.aplicaciones;const r=await memory(d,plan({agrupar_por:['tarea'],incluir_estado_tarea:true}));
    expect(r.resultados[0].total.jornales).toBe(2.5);expect(r.respuesta).toMatch(/No pude comprobar las aplicaciones asociadas.*no están disponibles/i);expect(r.respuesta).not.toMatch(/sin aplicación asociada/);
  });
  it.each([{value:null},{value:undefined},{value:'malformed'},{value:[ID.l1,'a1999999-0000-4000-8000-000000000001']}])('bad scheduled assignment $value cannot prove lot-scoped membership',async ({value})=>{
    const d=await data();(d.tareas[0] as unknown as Record<string,unknown>).lote_ids=value;
    unavailable(await memory(d,plan({cohorte:'tarea_programada',base_fecha:'fecha_estimada_inicio',desde:'2026-11-10',hasta:'2026-11-12',lote_ids:[ID.l2],metricas:[],agrupar_por:['tarea']})));
  });
  it('explicit empty lot assignment excludes the task without borrowing its recorded lot',async()=>{
    await db.query('update tareas set lote_ids=ARRAY[]::uuid[] where id=$1',[ID.t1]);
    const r=await run(db,plan({cohorte:'tarea_programada',base_fecha:'fecha_estimada_inicio',desde:'2026-11-10',hasta:'2026-11-10',lote_ids:[ID.l1],metricas:[],agrupar_por:['tarea']}));
    expect(r.body.resultados[0].semantica.miembros).toEqual([]);expect(r.body.resultados[0].estado).not.toBe('no_disponible');
  });
  it.each(['estado','jornales_estimados'])('actual HTTP reader keeps unrelated labor when task metadata %s is unread',async field=>{
    const r=await run(db,plan(),{pregunta:'solo jornales y costo'},{crearClienteUsuario:jwt=>overlayClient(db,jwt,(table,row)=>{if(table==='tareas')delete row[field];return row;})});
    expect(r.body.origen).toBe('determinista');expect(r.body.resultados[0].total).toMatchObject({jornales:2.5,costo:250});
  });
  it('actual HTTP reader keeps unrelated labor when application display metadata is unread',async()=>{
    const r=await run(db,plan(),{pregunta:'solo jornales y costo'},{crearClienteUsuario:jwt=>overlayClient(db,jwt,(table,row)=>{if(table==='aplicaciones')delete row.nombre_aplicacion;return row;})});
    expect(r.body.origen).toBe('determinista');expect(r.body.resultados[0].total).toMatchObject({jornales:2.5,costo:250});
  });
  it('actual HTTP multipart keeps journals while an unread cost field blocks only the cost obligation',async()=>{
    const r=await run(db,[plan({metricas:['jornales']}),plan({metricas:['costo']})],{pregunta:'jornales y costos'},{crearClienteUsuario:jwt=>overlayClient(db,jwt,(table,row)=>{if(table==='registros_trabajo')delete row.costo_jornal;return row;})});
    expect(r.body.resultados.map((p:{id:string})=>p.id)).toEqual(['p1','p2']);expect(r.body.resultados[0].total.jornales).toBe(2.5);expect(r.body.resultados[1].estado).toBe('no_disponible');expect(r.body.resultados[1].total).toEqual({});
  });
  it.each([Number.POSITIVE_INFINITY,Number.NaN,-1])('nonfinite or negative denominator %j cannot create a numeric ratio',async value=>{
    const d=await data();d.lotes.find(l=>l.id===ID.l1)!.total_arboles=value;const r=await memory(d,plan({lote_ids:[ID.l1],metricas:['jornales_por_arbol']}));
    expect(r.resultados[0].total.jornales_por_arbol).toBeNull();expect(r.resultados[0].notas.join(' ')).toMatch(/árboles/);
  });
  it('scheduled estimate source flags and invalid estimates cannot produce an authoritative known subtotal',async()=>{
    const args=plan({cohorte:'tarea_programada',base_fecha:'fecha_estimada_inicio',desde:'2026-11-10',hasta:'2026-11-12',categorias:['Mantenimiento del cultivo'],metricas:[],agrupar_por:['tarea']});
    const d=await data();d.fuente={consistencia:'lecturas_independientes',camposNoDisponibles:['tareas.jornales_estimados']};const hidden=await memory(d,args);
    const e=hidden.resultados[0].estimados as {tareas_estimado_no_disponible?:number}|undefined;expect(e?.tareas_estimado_no_disponible===2||hidden.resultados[0].estado==='no_disponible').toBe(true);
    const invalid=await data();invalid.tareas.find(t=>t.id===ID.t1)!.jornales_estimados=Number.NaN;const bad=await memory(invalid,args);
    const invalidEstimate=bad.resultados[0].estimados as {tareas_estimado_no_disponible?:number}|undefined;expect(invalidEstimate?.tareas_estimado_no_disponible===1||bad.resultados[0].estado==='no_disponible').toBe(true);
  });
  it.each(['registros.id','tareas.id','lotes.id','tiposTareas.id','tareas.nombre','lotes.nombre','tiposTareas.nombre'])('declared-unread identity %s cannot authorize supplied facts',async field=>{
    const d=await data();d.fuente={consistencia:'lecturas_independientes',camposNoDisponibles:[field]};unavailable(await memory(d));
  });
  it('invalid raw estimate in a row cannot survive omission by metadata validation',async()=>{
    const d=await data();d.tareas.find(t=>t.id===ID.t1)!.jornales_estimados=-9;
    const r=await memory(d,plan({categorias:['Mantenimiento del cultivo'],agrupar_por:['tarea'],incluir_estado_tarea:true}));
    const row=r.resultados[0].filas.find(f=>f.grupo_ids?.tarea===ID.t1);expect(row?.jornales_estimados).toBeUndefined();expect(row?.campos_no_disponibles).toContain('jornales_estimados');expect(r.respuesta).not.toContain('-9');expect(r.resultados[0].total.jornales).toBe(2.5);
  });
  it('declared-unread fields cannot authorize supplied category, status, estimate or ratio values',async()=>{
    for(const [field,args] of [
      ['tiposTareas.categoria',plan({agrupar_por:['categoria']})],
      ['lotes.total_arboles',plan({lote_ids:[ID.l1],metricas:['jornales_por_arbol']})],
      ['tareas.lote_ids',plan({cohorte:'tarea_programada',base_fecha:'fecha_estimada_inicio',desde:'2026-11-10',hasta:'2026-11-10',lote_ids:[ID.l2],metricas:[],agrupar_por:['tarea']})],
    ] as const){const d=await data();d.fuente={consistencia:'lecturas_independientes',camposNoDisponibles:[field]};unavailable(await memory(d,args));}
    const d=await data();d.fuente={consistencia:'lecturas_independientes',camposNoDisponibles:['tareas.estado','tareas.jornales_estimados']};
    const r=await memory(d,plan({agrupar_por:['tarea'],incluir_estado_tarea:true}));
    expect(r.resultados[0].filas.every(f=>f.estado_tarea===undefined&&f.jornales_estimados===undefined)).toBe(true);
  });
  it('dangling application task reference is unavailable instead of verified-empty',async()=>{
    const d=await data();d.aplicaciones![0].tarea_id='c1999999-0000-4000-8000-000000000001';
    const r=await memory(d,plan({agrupar_por:['tarea'],incluir_estado_tarea:true}));expect(r.resultados[0].total.jornales).toBe(2.5);
    expect(r.resultados[0].filas.every(f=>f.asociaciones?.estado==='no_disponible')).toBe(true);
  });
  it('independent reads never certify atomic cross-table consistency',async()=>{
    const r=await run(db,plan({agrupar_por:['lote']}));
    expect(r.body.respuesta).not.toMatch(/snapshot consistente|lectura at[oó]mica|conciliaci[oó]n estricta.*verificad/i);
    expect(JSON.stringify(r.body.resultados[0].semantica)).toMatch(/lecturas_sin_garantia_de_snapshot_conjunto/);
  });
});

describe('P2-v1 additional duplicate type and malformed catalog integration',()=>{
  it('equal type labels keep distinct ID-bound D30 estimates',async()=>{
    const d=await data();const second='b1000000-0000-4000-8000-000000000002';
    d.tiposTareas.push({id:second,nombre:'Labor',categoria:'Mantenimiento del cultivo'});
    d.tareas.find(t=>t.id===ID.t2)!.tipo_tarea_id=second;d.tareas.find(t=>t.id===ID.t2)!.jornales_estimados=7;
    const r=await memory(d,plan({categorias:['Mantenimiento del cultivo'],agrupar_por:['tipo_tarea']}));
    expect(r.resultados[0].filas).toHaveLength(2);
    const rows=new Map(r.resultados[0].filas.map(f=>[f.grupo_ids?.tipo_tarea,f]));
    expect(rows.get(ID.ty)?.jornales_estimados).toBe(5);expect(rows.get(second)?.jornales_estimados).toBe(7);
  });
  it('malformed catalog label becomes explicit unavailable instead of throwing before source validation',async()=>{
    const d=await data();delete (d.tareas[0] as Partial<typeof d.tareas[0]>).nombre;
    const r=await memory(d,plan({tareas:['Labor igual']}));expect(r.origen).toBe('error_datos');expect(r.resultados).toEqual([]);
  });
});
