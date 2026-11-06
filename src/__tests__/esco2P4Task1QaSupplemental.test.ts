// Additional QA obligations found in root review. Original frozen QA stays unchanged.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { validarPlan } from '../utils/esco2/registro.ts';
import { dependencies, forbidNetwork, ID, request } from './esco2P2Harness.ts';
import { MON, monQaDb, monQaSeed } from './esco2P4Task1QaHarness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await monQaDb(); },30000);
beforeEach(async () => { await monQaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
interface QaResult { tipo: string; estado: string; filas: Array<{ estado: string; incidencia: number | null }> }
async function query(args: Record<string,unknown>) {
  const h = dependencies(db,[{nombre:'consultar_monitoreo',argumentos:JSON.stringify(args)}]);
  const response = await manejar(request({pregunta:'Consulta sintética de monitoreo con filtros explícitos'}),h.deps);
  const body = await response.json();
  const result = (body.resultados as QaResult[])?.find(r=>r.tipo==='monitoreo');
  expect(result).toBeDefined();
  return {body,result:result!};
}

describe('P4-1 QA supplemental: explicit scope survives aggregation and visible children cannot restore hidden parents',()=>{
  it('answers a supported explicit round through mandatory coverage without unrelated hidden rounds making it partial',async()=>{
    const pregunta = 'Incidencia de QA Plaga Uno en QA Norte durante QA Alfa';
    const args = {
      ronda_ids:[MON.r1],lote_ids:[ID.l1],plaga_ids:[MON.pest1],parte_ids:['s1'],
      cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:'monitoreo',disposicion:'consultar'}]},
    };
    const h = dependencies(db,[{nombre:'consultar_monitoreo',argumentos:JSON.stringify(args)}],{modoCobertura:'obligatoria'});
    const response = await manejar(request({pregunta}),h.deps);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.cobertura).toMatchObject({estado:'declarada_validada',partes:[{id:'s1',capacidad:'monitoreo',disposicion:'respondida',resultado_ids:['p1']}]});
    const result = (body.resultados as QaResult[])?.find(r=>r.tipo==='monitoreo');
    expect(result?.estado).toBe('ok');
    expect(result?.filas).toHaveLength(1);
    expect(result?.filas[0].incidencia).toBeCloseTo(100/6,10);
    expect(body.origen).toBe('determinista');
    expect(h.solicitudes).toHaveLength(1);
  });

  it.each([
    {seleccion_ronda:['ultima_global']},
    {seleccion_ronda:['todas']},
    {ronda_ids:[MON.r1],agrupar_por:['']},
    {ronda_ids:[MON.r1],agrupar_por:['lote','   ']},
  ])('rejects malformed arguments before normalization instead of broadening the population %#',args=>{
    expect(()=>validarPlan([{nombre:'consultar_monitoreo',argumentos:JSON.stringify(args)}])).toThrow();
  });

  it('rejects an array-valued last-round selector through the real handler before executing all rounds',async()=>{
    const h = dependencies(db,[{nombre:'consultar_monitoreo',argumentos:JSON.stringify({seleccion_ronda:['ultima_global'],lote_ids:[ID.l1],plaga_ids:[MON.pest1]})}]);
    const response = await manejar(request({pregunta:'La última ronda sintética'}),h.deps);
    const body = await response.json();
    expect((body.resultados as QaResult[])?.some(r=>r.tipo==='monitoreo'&&r.filas.some(f=>f.estado==='ok'))??false).toBe(false);
  });

  it('keeps requested lot and sublot names visible even when no grouping was asked',async()=>{
    const h = await query({ronda_ids:[MON.r1],lote_ids:[ID.l1],sublote_ids:[MON.s1],plaga_ids:[MON.pest1]});
    expect(h.result.filas).toHaveLength(1);
    expect(h.body.respuesta).toContain('QA Norte');
    expect(h.body.respuesta).toContain('QA Subnorte');
  });

  it('does not turn a readable selected sublot with an invisible lot parent into no_revisado',async()=>{
    const sub = '72000000-0000-4000-8000-000000000003';
    await db.query("insert into sublotes values($1,$2,'QA Sublote de padre oculto')",[sub,MON.hiddenLot]);
    const h = await query({ronda_ids:[MON.r1],sublote_ids:[sub],plaga_ids:[MON.pest1]});
    expect(h.result.estado).not.toBe('ok');
    expect(h.result.filas.some(r=>r.estado==='no_revisado'||r.estado==='ok')).toBe(false);
    expect(h.body.respuesta).not.toMatch(/NO PUBLICAR/);
  });

  it('retains an explicit lot/sublot mismatch instead of reporting the intersection as an unreviewed sample',async()=>{
    const h = await query({ronda_ids:[MON.r1],lote_ids:[ID.l1],sublote_ids:[MON.s2],plaga_ids:[MON.pest1]});
    expect(h.result.estado).not.toBe('ok');
    expect(h.result.filas.some(r=>r.estado==='no_revisado'||r.estado==='ok')).toBe(false);
    expect(h.body.respuesta).toMatch(/sublote|lote/i);
  });

  it('does not call a requested round/lot/pest unreviewed when its readable observation has a hidden sublot parent',async()=>{
    await db.exec(`create policy qa_hide_subnorte on sublotes as restrictive for select to authenticated using(id <> '${MON.s1}');`);
    try {
      const h = await query({ronda_ids:[MON.r2],lote_ids:[ID.l1],plaga_ids:[MON.pest1]});
      expect(h.result.estado).not.toBe('ok');
      expect(h.result.filas.some(r=>r.estado==='no_revisado'||r.estado==='ok')).toBe(false);
      expect(h.body.respuesta).not.toMatch(/sin observaci[oó]n registrada|no revisado/i);
    } finally {
      await db.exec('drop policy qa_hide_subnorte on sublotes;');
    }
  });
});
