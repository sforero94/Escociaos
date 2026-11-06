// Additional adversarial obligations. Original pre-runtime QA files stay frozen.
// These tests are frozen against the first implementation, before its repair.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { USUARIOS,type Traza } from './esco2ArnesRls.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { qaFaultClient,type QaProjection } from './esco2P3Task2QaHarness.ts';
import { climaQaDb,climaQaSeed } from './esco2P4Task3QaHarness.ts';

let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await climaQaDb();},30000);
beforeEach(async()=>{await climaQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
interface Result {tipo:'clima';estado:string;filas:Array<{fecha:string;station_id:string;contradicciones:string[];valores:Record<string,number|null>}>;resumen:Array<{station_id:string;lluvia:Record<string,number|null>;variables:Record<string,{promedio:number|null;cobertura:{solicitados:number;usables:number;nulos_no_usables:number;sin_fila:number}}>}>}
const base=()=>({desde:'2026-10-03',hasta:'2026-10-03',station_id:'QA-A',variables:['temp_c_avg']});
async function query(args:Record<string,unknown>=base(),fault?:(t:string,r:RespuestaPostgrest)=>RespuestaPostgrest) {
  const pregunta='Historia climática registrada y cobertura del período solicitado';
  const traza:Traza={consultas:[]};const projections:QaProjection[]=[];
  const h=dependencies(db,[{nombre:'consultar_clima',argumentos:JSON.stringify({...args,parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:'clima',disposicion:'consultar'}]}})}],{modoCobertura:'obligatoria',crearClienteUsuario:jwt=>qaFaultClient(db,jwt,traza,projections,fault)});
  const response=await manejar(request({pregunta},USUARIOS.gerencia),h.deps);const body=await response.json();
  const result=(body.resultados as Result[]|undefined)?.find(r=>r.tipo==='clima');expect(result).toBeDefined();
  return {body,result:result!,response,traza};
}

describe('P4-3 QA adversarial supplemental: known causes, literal rain buckets, independent availability',()=>{
  it('declares known truncated temporal coverage even when only a usable temperature is requested',async()=>{
    const h=await query();
    expect(h.result.resumen[0].variables.temp_c_avg).toMatchObject({promedio:20,cobertura:{usables:1,nulos_no_usables:0,sin_fila:0}});
    expect(h.body.respuesta).toMatch(/cobertura temporal parcial|hueco[^\n]*(?:45|120)|d[ií]a[s]?[^\n]*truncad/i);
  });

  it('accounts for usable rain with temporal truncation outside the complete and confidence-partial buckets',async()=>{
    await db.exec("update clima_resumen_diario set lluvia_confianza='ok' where fecha='2026-10-03'");
    const h=await query({...base(),variables:['lluvia_total_mm']});const l=h.result.resumen[0].lluvia;
    expect(h.result.filas[0].valores.lluvia_total_mm).toBe(5);
    expect(l).toMatchObject({dias_completos:0,dias_cota_inferior:0,dias_sin_dato:0,dias_temporales_parciales:1,subtotal_observado_temporal_parcial:5});
    expect(h.result.filas[0].contradicciones).toContain('lluvia_con_cobertura_temporal_parcial');
    expect(h.body.respuesta).toMatch(/parcial|truncad/i);
  });

  it('labels rain as separated measured subtotals rather than printing a mean mixing lower bounds and daily totals',async()=>{
    const h=await query({desde:'2026-10-01',hasta:'2026-10-10',station_id:'QA-A',variables:['lluvia_total_mm']});
    expect(h.body.respuesta).not.toMatch(/Lluvia \(mm\): promedio/i);
    expect(h.body.respuesta).toMatch(/subtotal/i);expect(h.body.respuesta).toMatch(/cota inferior/i);
  });

  it('keeps a verified missing day separate from an explicit zero and does not fabricate a station observation',async()=>{
    const h=await query({...base(),desde:'2026-10-07',hasta:'2026-10-07'});
    expect(h.result.estado).toBe('vacio_verificado');expect(h.result.filas).toHaveLength(0);
    expect(h.result.resumen[0].variables.temp_c_avg).toMatchObject({promedio:null,cobertura:{solicitados:1,usables:0,nulos_no_usables:0,sin_fila:1}});
    expect(h.body.cobertura.partes[0].disposicion).toBe('respondida');
  });

  it('keeps nonoverlapping stations as separate observations without asking for an unneeded station choice',async()=>{
    await db.exec("update clima_resumen_diario set station_id='QA-B' where fecha='2026-10-02'");
    const h=await query({desde:'2026-10-01',hasta:'2026-10-02',variables:['humedad_pct_avg']});
    expect(h.result.estado).not.toBe('aclaracion');expect(h.result.resumen).toHaveLength(2);
    expect(h.result.resumen.find(s=>s.station_id==='QA-A')?.variables.humedad_pct_avg).toMatchObject({promedio:50,cobertura:{solicitados:2,usables:1,sin_fila:1}});
    expect(h.result.resumen.find(s=>s.station_id==='QA-B')?.variables.humedad_pct_avg).toMatchObject({promedio:60,cobertura:{solicitados:2,usables:1,sin_fila:1}});
  });

  it('does not make overlap outside the requested interval invalidate the requested observation',async()=>{
    await db.exec("insert into clima_resumen_diario(fecha,station_id,temp_c_avg,lluvia_confianza,lecturas_count) values('2026-10-01','QA-B',999,'ok',1)");
    const h=await query({desde:'2026-10-06',hasta:'2026-10-06',variables:['temp_c_avg']});
    expect(h.result.estado).toBe('ok');expect(h.result.filas).toHaveLength(1);
    expect(h.result.filas[0].valores.temp_c_avg).toBe(50);
  });

  it('answers a readable daily source despite independently failed unrelated domain catalogs',async()=>{
    const h=await query({...base(),desde:'2026-10-01',hasta:'2026-10-01'},(t,r)=>t==='usuarios'||t==='clima_resumen_diario'?r:{data:null,count:null,error:{message:'QA_UNRELATED_ERROR'}});
    expect(h.response.status).toBe(200);expect(h.result.resumen[0].variables.temp_c_avg.promedio).toBe(10);
    expect(h.body.respuesta).not.toContain('QA_UNRELATED_ERROR');
  });
});
