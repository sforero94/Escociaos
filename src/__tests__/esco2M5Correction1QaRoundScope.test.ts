// Additional synthetic preservation controls frozen against the first candidate.
// Round identity and observation dates are not a round-start date filter.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies,forbidNetwork,ID,request } from './esco2P2Harness.ts';
import { MON,monQaDb,monQaSeed } from './esco2P4Task1QaHarness.ts';
import { correctionQaDb } from './esco2M5Correction1QaHarness.ts';
let rounds:PGlite;let milk:PGlite;
beforeAll(async()=>{forbidNetwork();rounds=await monQaDb();milk=await correctionQaDb();},30000);
beforeEach(async()=>{
  await monQaSeed(rounds);
  await rounds.query("update rondas_monitoreo set nombre='QA Ronda Eclipse',fecha_inicio='2025-06-01',fecha_fin='2025-06-10' where id=$1",[MON.r1]);
  await rounds.query("update lotes set nombre='QA Colina Siete' where id=$1",[ID.l1]);
  await rounds.query("update plagas_enfermedades_catalogo set nombre='QA Bicho Claro' where id=$1",[MON.pest1]);
  await rounds.query("delete from monitoreos where id=$1",[MON.o3]);
  await rounds.query("update monitoreos set fecha_monitoreo='2025-06-02',arboles_monitoreados=10,arboles_afectados=2 where id=$1",[MON.o1]);
  await rounds.query("update monitoreos set fecha_monitoreo='2025-06-09',arboles_monitoreados=30,arboles_afectados=4 where id=$1",[MON.o2]);
});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await rounds?.close();await milk?.close();});

describe('M5 correction1 QA: preserve explicit round identity and open fortnight scope',()=>{
  it.each([{ronda_ids:[MON.r1]},{rondas:['QA Ronda Eclipse']}])('does not invent a round-start filter from the two cited observation dates %#',async selector=>{
    const question='Incidencia de QA Bicho Claro en QA Colina Siete para QA Ronda Eclipse; observaciones citadas 2025-06-02 y 2025-06-09';
    const args={...selector,lote_ids:[ID.l1],plaga_ids:[MON.pest1],parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:question,capacidad:'monitoreo',disposicion:'consultar'}]}};
    const h=dependencies(rounds,[{nombre:'consultar_monitoreo',argumentos:JSON.stringify(args)}],{modoCobertura:'obligatoria'});
    const response=await manejar(request({pregunta:question}),h.deps);const body=await response.json();
    expect(response.status).toBe(200);expect(body.origen).toBe('determinista');
    expect(body.resultados).toHaveLength(1);const r=body.resultados[0];
    expect(r).toMatchObject({tipo:'monitoreo',estado:'ok',filas:[{ronda_id:MON.r1,ronda_inicio:'2025-06-01',ronda_fin:'2025-06-10',afectados:6,muestreados:40,incidencia:15,fechas:['2025-06-02','2025-06-09']}]});
    expect(r.consulta.desde).toBeUndefined();expect(r.consulta.hasta).toBeUndefined();
    expect(body.cobertura.partes[0].disposicion).toBe('respondida');
  });

  it('keeps an explicitly aligned open fortnight through its canonical future end',async()=>{
    const question='Litros quincenales desde 2026-11-01 hasta 2026-11-15, conserva lo observado aunque la quincena siga abierta';
    const args={desde:'2026-11-01',hasta:'2026-11-15',parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:question,capacidad:'litros_quincenales',disposicion:'consultar'}]}};
    const h=dependencies(milk,[{nombre:'consultar_litros_quincenales',argumentos:JSON.stringify(args)}],{modoCobertura:'obligatoria',ahora:()=>new Date('2026-11-06T04:30:00Z')});
    const response=await manejar(request({pregunta:question}),h.deps);const body=await response.json();
    expect(response.status).toBe(200);expect(body.origen).toBe('determinista');
    expect(body.resultados[0]).toMatchObject({tipo:'litros_quincenales',filas:[{fecha_inicio:'2026-11-01',fecha_fin:'2026-11-15',abierta:true,litros:11}],subtotales:{medido:{litros:null,quincenas:0}},subtotales_abiertos:{medido:{litros:11,quincenas:1}}});
    expect(body.cobertura.partes[0].disposicion).not.toBe('fuera_de_contrato');
  });
});
