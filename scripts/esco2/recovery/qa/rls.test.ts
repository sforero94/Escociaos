// Stage C: real authorization + fixed reader + PGlite RLS + scripted plan + candidate.
// This local wrapper is not the production HTTP handler. The unchanged handler is also checked below.
import { createHash } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { autorizarGerencia, fechaBogota, manejar } from '../../../../supabase/functions/esco-consultas/manejador.ts';
import { fuenteSupabase } from '../../../../src/utils/esco2/fuente.ts';
import type { ClienteLLM } from '../../../../src/utils/esco2/llm.ts';
import { crearBaseRls, clienteRls, jwtSintetico, USUARIOS, type Traza } from '../../../../src/__tests__/esco2ArnesRls.ts';
import type { DatosLabores } from '../../../../src/utils/esco2/tipos.ts';
import type { EntradaExperimento, Variante } from '../contracts.ts';
import { runVariant } from '../shared.ts';
import { escenarios, controlesExtra } from './scenarios.ts';
import { juzgar } from './oracle.ts';

let db: PGlite;
const evidence: Record<string, unknown>[] = [];
const runId=new Date().toISOString().replace(/[:.]/g,'-');
const implementationHashes=()=>Object.fromEntries(['shared.ts','baseline.ts','repair.ts','redesign.ts'].map(file=>[file,createHash('sha256').update(readFileSync(`scripts/esco2/recovery/${file}`)).digest('hex')]));
let implementationBefore:Record<string,string>;
beforeAll(async () => {
  implementationBefore=implementationHashes();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('NETWORK_FORBIDDEN_IN_OFFLINE_EXPERIMENT'); }));
  db = await crearBaseRls();
  // Keep existing user UUIDs, auth functions and literal production RLS predicates.
  // Synthetic business IDs are short strings; only business-ID column types change.
  await db.exec(`truncate aplicaciones,registros_trabajo,tareas,tipos_tareas,lotes;
    alter table lotes alter column id type text using id::text;
    alter table tipos_tareas alter column id type text using id::text;
    alter table tipos_tareas alter column categoria type text using categoria::text;
    alter table tareas alter column id type text using id::text;
    alter table tareas alter column tipo_tarea_id type text using tipo_tarea_id::text;
    alter table tareas alter column lote_id type text using lote_id::text;
    alter table aplicaciones alter column id type text using id::text;
    alter table aplicaciones alter column tarea_id type text using tarea_id::text;
    alter table registros_trabajo alter column id type text using id::text;
    alter table registros_trabajo alter column tarea_id type text using tarea_id::text;
    alter table registros_trabajo alter column lote_id type text using lote_id::text;`);
}, 30_000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); const implementationAfter=implementationHashes(); expect(implementationAfter).toEqual(implementationBefore); const report = {runId,implementationBefore,implementationAfter, label: 'local candidate wrapper using actual gate, fixed reader and synthetic RLS; not deployed HTTP integration', networkCalls: 0, evidence }; mkdirSync('scripts/esco2/recovery/qa/iterations',{recursive:true}); writeFileSync(`scripts/esco2/recovery/qa/iterations/rls-${runId}.json`,JSON.stringify(report,null,2)+'\n'); writeFileSync('scripts/esco2/recovery/qa/rls-results.json',JSON.stringify(report,null,2)+'\n'); });

async function seed(datos: DatosLabores): Promise<void> {
  await db.exec('truncate aplicaciones,registros_trabajo,tareas,tipos_tareas,lotes');
  for (const l of datos.lotes) await db.query('insert into lotes(id,nombre,activo,total_arboles,area_hectareas) values($1,$2,$3,$4,$5)', [l.id,l.nombre,l.activo,l.total_arboles??null,l.area_hectareas??null]);
  for (const t of datos.tiposTareas) await db.query('insert into tipos_tareas(id,nombre,categoria,activo) values($1,$2,$3,true)', [t.id,t.nombre,t.categoria]);
  for (const t of datos.tareas) await db.query('insert into tareas(id,nombre,estado,tipo_tarea_id,jornales_estimados,fecha_estimada_inicio,fecha_estimada_fin,fecha_inicio_real,fecha_fin_real) values($1,$2,$3,$4,$5,$6,$7,$8,$9)', [t.id,t.nombre,t.estado,t.tipo_tarea_id,t.jornales_estimados,t.fecha_estimada_inicio??null,t.fecha_estimada_fin??null,t.fecha_inicio_real??null,t.fecha_fin_real??null]);
  for (const r of datos.registros) await db.query('insert into registros_trabajo values($1,$2,$3,$4,$5,$6)', [r.id,r.tarea_id,r.lote_id,r.fecha_trabajo,r.fraccion_jornal===1?'1.0':String(r.fraccion_jornal),r.costo_jornal]);
  for (const a of datos.aplicaciones??[]) await db.query('insert into aplicaciones values($1,$2,$3,$4,$5)', [a.id,a.tarea_id,a.codigo_aplicacion,a.nombre_aplicacion,a.estado]);
}

async function candidateRoute(input: EntradaExperimento, variant: Variante, userId: string, signature: 'valida'|'falsa' = 'valida') {
  const trace: Traza = { consultas: [] };
  const jwt = jwtSintetico(userId, signature);
  const client = clienteRls(db,jwt,trace);
  const auth = await autorizarGerencia(client,jwt);
  let plannerCalls = 0;
  if (!auth.ok) return { status:auth.estado, trace, plannerCalls };
  const source = fuenteSupabase(client);
  const catalog = await source.catalogo();
  const records = await source.registros('2026-10-01','2026-12-31');
  const datos = { ...catalog, registros:records };
  // Source-profile overlay represents deliberately unread snapshot fields. A SQL NULL
  // cannot recreate an absent old-snapshot property. This is an explicit synthetic shim.
  if (input.datos.aplicaciones === undefined) delete datos.aplicaciones;
  for (const task of datos.tareas) for (const date of ['fecha_estimada_inicio','fecha_estimada_fin','fecha_inicio_real','fecha_fin_real'] as const) if (input.datos.tareas.find(t => t.id === task.id)?.[date] === undefined) delete task[date];
  const scriptedPlanner = async () => { plannerCalls++; return structuredClone(input.obligaciones); };
  const plan = await scriptedPlanner();
  const output = await runVariant({ ...structuredClone(input), actor:{ id:auth.usuarioId, autenticado:true, activo:true, rol:'Gerencia' }, datos, obligaciones:plan, estado:input.estado },variant);
  return { status:200, output, trace, plannerCalls };
}

describe('stage C: identical scripted plans through local candidate gate/source/orchestration wrapper', () => {
  for (const variant of ['baseline','repair','redesign'] as const) for (const scenario of [...escenarios,...controlesExtra]) it(`${variant} ${scenario.id}`, async () => {
    const adapted = structuredClone(scenario); adapted.entrada.actor.id = USUARIOS.gerencia; if (adapted.entrada.estado) adapted.entrada.estado.propietario = USUARIOS.gerencia;
    await seed(adapted.entrada.datos);
    const response = await candidateRoute(adapted.entrada,variant,USUARIOS.gerencia);
    const judgement = juzgar(adapted,response.output!);
    evidence.push({variant,scenario:scenario.id,status:response.status,plannerCalls:response.plannerCalls,judgement,readerRoles:[...new Set(response.trace.consultas.map(q=>q.rol))],tables:[...new Set(response.trace.consultas.map(q=>q.tabla))]});
    expect(response.status).toBe(200); expect(response.plannerCalls).toBe(1);
    expect(response.trace.consultas.every(q => q.rol==='authenticated')).toBe(true);
    if (variant !== 'baseline') expect(judgement.errores).toEqual([]);
  });
});

describe('stage C: conversation owner isolation', () => {
  for (const variant of ['repair','redesign'] as const) it(`${variant}: foreign-owner state cannot select a task`, async () => {
    const input = structuredClone(escenarios.find(s=>s.id==='S15')!.entrada);
    input.estado!.propietario = 'another-caller';
    await seed(input.datos);
    const response = await candidateRoute(input,variant,USUARIOS.gerencia);
    expect(response.output!.estado!.propietario).toBe(USUARIOS.gerencia);
    expect(response.output!.estado!.pendiente).toBeUndefined();
    expect(response.output!.resultados[0].afirmaciones.find(c=>c.metrica==='jornales')!.valor).toBe(4.5);
  });
});

describe('stage C: actual production authorization and unchanged HTTP handler', () => {
  it.each([USUARIOS.administrador,USUARIOS.verificador,USUARIOS.gerenciaDesactivada,USUARIOS.sinPerfil])('denied caller %s cannot reach planning or labor tables', async id => {
    const r = await candidateRoute(escenarios[0].entrada,'repair',id);
    expect(r.status).toBe(403); expect(r.plannerCalls).toBe(0); expect(r.trace.consultas.map(q=>q.tabla)).toEqual(['usuarios']);
  });
  it('invalid synthetic signature is401 before data reads', async () => {
    const r = await candidateRoute(escenarios[0].entrada,'repair',USUARIOS.gerencia,'falsa'); expect(r.status).toBe(401); expect(r.trace.consultas).toEqual([]); expect(r.plannerCalls).toBe(0);
  });
  it('actual manejar runs scripted planner and deterministic fallback on RLS source with independent SQL total', async () => {
    const scenario = escenarios.find(s=>s.id==='S05')!; await seed(scenario.entrada.datos);
    const trace: Traza = {consultas:[]}; let plannerCalls=0; let composerCalls=0;
    const llm: ClienteLLM = { async completar(request) { if (!request.herramientas) { composerCalls++; throw new Error('deterministic offline fallback'); } plannerCalls++; return {texto:'',llamadas:[{nombre:'consultar_labores',argumentos:JSON.stringify(scenario.entrada.obligaciones[0].consulta)}],uso:{entrada:0,salida:0,razonamiento:0,costoUsd:0},ms:0,modelo:request.modelo,finishReason:'stop'}; } };
    const env: Record<string,string> = {OPENROUTER_API_KEY:'offline-placeholder',SUPABASE_URL:'http://local',SUPABASE_ANON_KEY:'offline-anon'};
    const request = new Request('http://local/esco-consultas',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${jwtSintetico(USUARIOS.gerencia)}`},body:JSON.stringify({pregunta:scenario.entrada.pregunta})});
    const response = await manejar(request,{env:n=>env[n],crearClienteUsuario:jwt=>clienteRls(db,jwt,trace),crearLLM:()=>llm,ahora:()=>new Date('2026-11-05T04:30:00Z')});
    const body=await response.json();
    const oracle=await db.query<{j:number}>('select sum(fraccion_jornal::text::numeric)::float8 j from registros_trabajo where fecha_trabajo between $1 and $2',['2026-10-26','2026-11-01']);
    expect(response.status).toBe(200); expect(body.resultados[0].total.jornales).toBe(oracle.rows[0].j); expect(oracle.rows[0].j).toBe(3); expect(body.hoy).toBe('2026-11-04'); expect(plannerCalls).toBe(1); expect(composerCalls).toBe(1);
    evidence.push({variant:'baseline-real-manejar',status:response.status,plannerCalls,composerCalls,independentSQL:oracle.rows[0].j,hoy:body.hoy});
  });
  it('Bogotá calendar near UTC midnight remains previous local date', () => { expect(fechaBogota(new Date('2026-11-05T04:30:00Z'))).toBe('2026-11-04'); });
});
