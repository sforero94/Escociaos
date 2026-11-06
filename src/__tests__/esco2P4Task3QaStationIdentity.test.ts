// Independent station-boundary QA, added after the original 37 tests were frozen.
// Final rule agreed before repair: case-sensitive trim lookup; every normalized
// collision asks for clarification, including a raw exact match. Preserve raw IDs.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { USUARIOS } from './esco2ArnesRls.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { climaQaDb,climaQaSeed } from './esco2P4Task3QaHarness.ts';

let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await climaQaDb();},30000);
beforeEach(async()=>{await climaQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
interface ClimateResult {
  tipo:'clima';estado:string;estaciones:string[];
  filas:Array<{fecha:string;station_id:string;valores:{temp_c_avg:number|null};raw:{station_id:string}}>;
  resumen:Array<{station_id:string;variables:{temp_c_avg:{promedio:number|null;cobertura:{solicitados:number;usables:number;nulos_no_usables:number;sin_fila:number}}}}>;
}
async function query(station_id:string,desde='2026-10-01',hasta='2026-10-10') {
  const pregunta='Temperatura media histórica y cobertura de la estación solicitada';
  const h=dependencies(db,[{nombre:'consultar_clima',argumentos:JSON.stringify({desde,hasta,station_id,variables:['temp_c_avg'],parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:'clima',disposicion:'consultar'}]}})}],{modoCobertura:'obligatoria'});
  const response=await manejar(request({pregunta},USUARIOS.gerencia),h.deps);const body=await response.json();
  const result=(body.resultados as ClimateResult[]|undefined)?.find(r=>r.tipo==='clima');expect(result).toBeDefined();
  return {response,body,result:result!};
}
async function rawIds() {
  const {rows}=await db.query<{station_id:string;n:number}>('select station_id,count(*)::int n from clima_resumen_diario group by station_id order by station_id');
  return rows;
}

describe('P4-3 QA station identity boundary: padded IDs and normalization collisions',()=>{
  it('validates the literal padded raw ID and sensor mean through independent SQL',async()=>{
    await db.exec("update clima_resumen_diario set station_id='QA-A '");
    const result=await db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:USUARIOS.gerencia,role:'authenticated'})]);
      await tx.exec('set local role authenticated');
      return tx.query("select station_id,length(station_id)::int longitud,avg(temp_c_avg)::float8 promedio,count(temp_c_avg)::int usables from clima_resumen_diario where trim(station_id)='QA-A' group by station_id");
    });
    expect(result.rows).toEqual([{station_id:'QA-A ',longitud:5,promedio:45,usables:8}]);
  });

  it.each(['QA-A',' QA-A '])('resolves clean or padded user selector %j to the unique raw padded station',async(selector)=>{
    await db.exec("update clima_resumen_diario set station_id='QA-A '");
    const before=await rawIds();const h=await query(selector);
    expect(h.response.status).toBe(200);expect(h.result.estado).toBe('parcial');
    expect(h.result.filas).toHaveLength(9);
    expect(h.result.filas.every(f=>f.station_id==='QA-A '&&f.raw.station_id==='QA-A ')).toBe(true);
    expect(h.result.resumen).toHaveLength(1);
    expect(h.result.resumen[0]).toMatchObject({station_id:'QA-A ',variables:{temp_c_avg:{promedio:45,cobertura:{solicitados:10,usables:8,nulos_no_usables:1,sin_fila:1}}}});
    expect(h.body.cobertura.partes[0].disposicion).toBe('respondida');
    expect(await rawIds()).toEqual(before);
  });

  it('preserves leading as well as trailing source whitespace when the trimmed identity is unique',async()=>{
    await db.exec("update clima_resumen_diario set station_id='  QA-A  '");
    const h=await query('QA-A','2026-10-01','2026-10-01');
    expect(h.result.estado).toBe('ok');
    expect(h.result.filas[0].station_id).toBe('  QA-A  ');
    expect(h.result.resumen[0].station_id).toBe('  QA-A  ');
    expect(h.result.filas[0].valores.temp_c_avg).toBe(10);
    expect(await rawIds()).toEqual([{station_id:'  QA-A  ',n:9}]);
  });

  it.each(['QA-A',' QA-A '])('asks on a normalized collision for selector %j even when an exact raw ID exists',async(selector)=>{
    await db.exec("insert into clima_resumen_diario(fecha,station_id,temp_c_avg,lluvia_confianza,lecturas_count,cobertura_hueco_max_min) values('2026-10-01','QA-A ',999,'ok',48,30)");
    const before=await rawIds();const h=await query(selector,'2026-10-01','2026-10-01');
    expect(h.result.estado).toBe('aclaracion');expect(h.result.filas).toHaveLength(0);expect(h.result.resumen).toHaveLength(0);
    expect([...h.result.estaciones].sort()).toEqual(['QA-A','QA-A ']);
    expect(h.body.cobertura.partes[0].disposicion).toBe('aclarar');
    expect(h.body.respuesta).toMatch(/estaci[oó]n|identidad/i);
    expect(h.body.respuesta).not.toMatch(/999|promedio de 1 d[ií]a/i);
    expect(await rawIds()).toEqual(before);
  });

  it('asks on normalized collision even when the raw histories do not overlap in calendar date',async()=>{
    await db.exec("update clima_resumen_diario set station_id='QA-A ' where fecha='2026-10-02'");
    const h=await query('QA-A','2026-10-01','2026-10-02');
    expect(h.result.estado).toBe('aclaracion');expect(h.result.filas).toHaveLength(0);expect(h.result.resumen).toHaveLength(0);
    expect([...h.result.estaciones].sort()).toEqual(['QA-A','QA-A ']);
  });

  it('keeps station ID matching case sensitive and returns verified empty for a different case',async()=>{
    await db.exec("update clima_resumen_diario set station_id='qa-a '");
    const h=await query('QA-A','2026-10-01','2026-10-01');
    expect(h.result.estado).toBe('vacio_verificado');expect(h.result.filas).toHaveLength(0);
    expect(h.result.resumen[0].variables.temp_c_avg).toMatchObject({promedio:null,cobertura:{solicitados:1,usables:0,nulos_no_usables:0,sin_fila:1}});
    expect(await rawIds()).toEqual([{station_id:'qa-a ',n:9}]);
  });

  it('keeps an unrelated station separate after resolving the unique trimmed station identity',async()=>{
    await db.exec("update clima_resumen_diario set station_id='QA-A '");
    await db.exec("insert into clima_resumen_diario(fecha,station_id,temp_c_avg,lluvia_confianza,lecturas_count,cobertura_hueco_max_min) values('2026-10-01','QA-B',999,'ok',48,30)");
    const h=await query('QA-A','2026-10-01','2026-10-01');
    expect(h.result.estado).toBe('ok');expect(h.result.filas).toHaveLength(1);
    expect(h.result.filas[0]).toMatchObject({station_id:'QA-A ',valores:{temp_c_avg:10}});
    expect(h.result.resumen).toHaveLength(1);
  });
});
