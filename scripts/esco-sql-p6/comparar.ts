// Offline evidence analysis only. No services, bank, environment or model access.
import { createHash } from 'node:crypto';
import { construirBloque, type FuenteVisual } from '../../src/utils/escoSql/bloques.ts';
import { formatearValor, type Formato, type Valor } from '../../src/utils/escoSql/formato.ts';
import { leerRespuestaFinal } from '../../src/utils/escoSql/respuesta.ts';
import { leerReciboTurnoSql } from '../../src/utils/escoSql/turno.ts';

type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const iso = (v: unknown): v is string => {
  if (typeof v!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)) return false;
  const canonical=v.replace(/(?:\.(\d{1,3}))?Z$/, (_match,fraction: string|undefined) => '.'+(fraction??'').padEnd(3,'0')+'Z');
  const date=new Date(v);
  return Number.isFinite(date.getTime()) && date.toISOString()===canonical;
};
const keys = (v: Obj, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (obj(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
export const huella = (v: unknown): string => createHash('sha256').update(stable(v)).digest('hex');
const semantic = (r: Obj) => ({ texto: r.texto, bloques: r.bloques, sugerencias: r.sugerencias, ...(Object.hasOwn(r, 'aclaracion') ? { aclaracion: r.aclaracion } : {}) });
function validResponse(v: unknown): v is Obj {
  if (!obj(v) || v.motor !== 'sql' || typeof v.texto !== 'string' || v.texto.length > 64000 || !Array.isArray(v.bloques) || v.bloques.length > 4 || !Array.isArray(v.consultas) || v.consultas.length > 4 || !finite(v.ms)) return false;
  const final = leerRespuestaFinal(JSON.stringify(v));
  if (!same({ texto: v.texto, sugerencias: v.sugerencias, ...(Object.hasOwn(v, 'aclaracion') ? { aclaracion: v.aclaracion } : {}) }, final)) return false;
  for (const c of v.consultas) if (!obj(c) || !keys(c, ['sql','proposito','n_filas','truncado','error','ms']) || typeof c.sql !== 'string' || typeof c.proposito !== 'string' || !(c.n_filas === null || (finite(c.n_filas) && Number.isInteger(c.n_filas))) || typeof c.truncado !== 'boolean' || !(c.error === null || typeof c.error === 'string') || !finite(c.ms)) return false;
  for (const b of v.bloques) {
    if (!obj(b) || !Number.isInteger(b.consulta) || Number(b.consulta) < 1 || Number(b.consulta) > 4 || typeof b.truncado !== 'boolean') return false;
    const n = Number(b.consulta), query = v.consultas[n - 1];
    if (!obj(query) || query.error !== null || query.truncado !== b.truncado) return false;
    const rows = b.tipo === 'tabla' ? b.filas : b.tipo === 'grafica' ? b.datos : b.tipo === 'tarjeta' && Array.isArray(b.items) && b.items.every(obj) ? [Object.fromEntries(b.items.map(i => [String(i.columna), i.valor]))] : null;
    if (!Array.isArray(rows) || !rows.every(obj) || rows.length!==query.n_filas) return false;
    const spec = b.tipo === 'tabla' ? { tipo:b.tipo,consulta:n,titulo:b.titulo,columnas:b.columnas } : b.tipo === 'grafica' ? { tipo:b.tipo,consulta:n,titulo:b.titulo,forma:b.forma,x:b.x,y:b.y,formato:b.formato } : { tipo:b.tipo,consulta:n,items:Array.isArray(b.items) ? b.items.filter(obj).map(({columna,etiqueta,formato}) => ({columna,etiqueta,formato})) : null };
    if (b.tipo === 'tabla' && (!Number.isInteger(b.total_filas) || !finite(b.total_filas) || b.total_filas < rows.length || b.total_filas !== query.n_filas)) return false;
    const fuentes: FuenteVisual[] = Array.from({length:n}, () => ({filas:[],n_filas:null,truncado:false}));
    fuentes[n-1] = {filas:rows,n_filas:query.n_filas as number|null,truncado:b.truncado};
    const result = construirBloque(spec, fuentes);
    if (!('bloque' in result) || !same(b,result.bloque)) return false;
  }
  return true;
}
function snapshotOK(r: Obj, s: unknown): boolean {
  if (!obj(s) || s.motor !== 'sql' || !iso(s.snapshot_at) || !validResponse(s) || !same(semantic(r),semantic(s))) return false;
  const traces = (v: Obj) => (v.consultas as Obj[]).map(({ms: _ms,...rest}) => rest);
  return same(traces(r),traces(s));
}
function formatOK(r: Obj, observation: unknown): boolean {
  if (!obj(observation) || !keys(observation,['block','row','column','display']) || !Number.isInteger(observation.block) || typeof observation.column !== 'string' || typeof observation.display !== 'string') return false;
  const b = (r.bloques as unknown[])[Number(observation.block)];
  if (!obj(b)) return false;
  let raw: unknown, format: unknown;
  if (b.tipo === 'tarjeta') {
    const item = (b.items as Obj[]).find(i => i.columna === observation.column);
    if (!item || observation.row !== null) return false;
    raw = item.valor; format = item.formato;
  } else {
    if (!Number.isInteger(observation.row) || Number(observation.row)<0) return false;
    const row = ((b.tipo === 'tabla' ? b.filas : b.datos) as Obj[])[Number(observation.row)];
    if (!row || !Object.hasOwn(row, observation.column)) return false;
    raw = row[observation.column];
    format = b.tipo === 'tabla' ? (b.columnas as Obj[]).find(c => c.columna === observation.column)?.formato : observation.column === b.x ? 'texto' : (b.y as string[]).includes(observation.column) ? b.formato : null;
  }
  return typeof format === 'string' && observation.display === formatearValor(raw as Valor,format as Formato);
}
/** v2 links operational evidence by opaque ID, never by clock proximity. */
function receiptEvidence(c: Obj, metrics: Obj, ids: Set<string>, issue: (code: string) => void) {
  const response = obj(c.response) ? c.response : {};
  const receipt = leerReciboTurnoSql(response.recibo);
  if (!receipt) { issue('receipt_missing_or_invalid'); return { linked:false, costKnown:false, partialCost:null as number|null }; }
  let identity=true;
  if (ids.has(receipt.turno_id)) { issue('receipt_id_reused'); identity=false; } else ids.add(receipt.turno_id);
  if (c.generation_id!==receipt.turno_id || c.channel!==receipt.canal || !obj(c.context) || c.context.history_sha256!==receipt.historial_sha256) { issue('receipt_identity_mismatch'); identity=false; }
  if (!Object.hasOwn(response,'uso') || !same(response.uso,receipt.uso) || !same(response.recibo,receipt)) { issue('receipt_response_mismatch'); identity=false; }
  if (c.outcome==='success' && receipt.estado!=='completado') issue('receipt_state_mismatch');
  const snapshot=obj(c.snapshot)?c.snapshot:{};
  const snapshotMatch=Object.hasOwn(snapshot,'uso') && same(snapshot.uso,receipt.uso) && same(snapshot.recibo,receipt);
  if (!snapshotMatch) issue('receipt_snapshot_mismatch');
  const log=obj(c.execution_log)?c.execution_log:{};
  const logMatch=keys(log,['funcion','evento','turno_id','canal','estado','uso','coste','consultas','errores','ms','llamadas','costoUsd']) && log.funcion==='esco-consultas' && log.evento==='turno_sql' && log.turno_id===receipt.turno_id && log.canal===receipt.canal && log.estado===receipt.estado && Object.hasOwn(log,'uso') && same(log.uso,receipt.uso) && same(log.coste,receipt.coste) && log.costoUsd===(receipt.uso?.costoUsd??null) && log.llamadas===(receipt.uso?.llamadas??null);
  if (!logMatch) issue('receipt_log_mismatch');
  const known=receipt.coste.estado==='completo' && receipt.uso!==null && finite(receipt.uso.costoUsd);
  const metricMatch=known ? metrics.cost_source==='observed' && metrics.cost_usd===receipt.uso?.costoUsd : metrics.cost_source==='unknown' && metrics.cost_usd===null;
  if (!metricMatch) issue('receipt_metric_mismatch');
  return { linked:identity&&snapshotMatch&&logMatch&&metricMatch&&(c.outcome!=='success'||receipt.estado==='completado'), costKnown:identity&&logMatch&&metricMatch&&known, partialCost:identity&&logMatch&&receipt.coste.estado==='parcial'?receipt.coste.observadoUsd:null };
}
const CONTEXT = ['actor_sha256','question_sha256','history_sha256','scope_sha256','data_cut_sha256','engine_sha256','config_sha256'];
const contextOK = (v: unknown): v is Obj => obj(v) && keys(v,CONTEXT) && CONTEXT.every(k => typeof v[k] === 'string' && /^[a-f0-9]{64}$/.test(v[k] as string));
const percentile = (values: number[]) => values.length ? [...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1] : null;
/** The report contains a fixed schema with aggregates only. Never echo input values. */
export function analizarCapturas(input: unknown, now: Date = new Date()) {
  const issues: Record<string,number> = {};
  const issue = (code: string) => { issues[code]=(issues[code]??0)+1; };
  const root = obj(input) ? input : {};
  if (![1,2].includes(Number(root.schema_version)) || (root.schema_version!==1 && root.schema_version!==2) || (typeof root.mode!=='string' || !['paired_live','shared_response_replay'].includes(root.mode)) || !Array.isArray(root.captures)) issue('input_schema');
  const captures: unknown[] = Array.isArray(root.captures) ? root.captures : [];
  const period = obj(root.period) ? root.period : {};
  const live = root.mode === 'paired_live';
  const receiptVersion=root.schema_version===2;
  if(receiptVersion&&!live) issue('receipt_schema_requires_independent_generations');
  const receiptIds=new Set<string>();
  let linkedReceipts=0;const partialCosts:number[]=[];
  if (!iso(period.started_at) || !iso(period.ended_at) || Date.parse(String(period.ended_at))-Date.parse(String(period.started_at)) < 14*86400000 || Date.parse(String(period.ended_at)) > now.getTime()) issue('period_incomplete');
  const pairs = new Map<string,Partial<Record<'web'|'telegram',Obj>>>();
  const byWeek = [new Set<string>(),new Set<string>()];
  const questions = new Map<string,unknown>();
  let frozenContext: Pick<Obj,'engine_sha256'|'config_sha256'> | null = null;
  const latencies: Record<string,number[]> = {web:[],telegram:[]};
  const costs: number[] = [];
  let success=0,errors=0,unknown=0,valid=0,formatChecks=0,formatCaptures=0;
  let sqlTraceCaptures=0,sqlQueryAttempts=0,sqlQueryErrors=0,formatNotApplicable=0;
  let fullPairs=0,comparablePairs=0,parityPairs=0,shared=0,independent=0;
  for (const value of captures) {
    if (!obj(value)) { issue('capture_schema'); continue; }
    const c=value, week=Number(c.week), channel=c.channel;
    if (![1,2].includes(c.week as number) || typeof c.case_id!=='string' || !c.case_id || (typeof channel!=='string' || !['web','telegram'].includes(channel))) {issue('capture_schema');continue;}
    byWeek[week-1].add(c.case_id);
    const key = stable([week,c.case_id]);
    const pair = pairs.get(key)??{};
    if (pair[channel as 'web'|'telegram']) issue('duplicate_capture');
    else pair[channel as 'web'|'telegram']=c;
    pairs.set(key,pair);
    if (contextOK(c.context)) {
      if (frozenContext===null) frozenContext={engine_sha256:c.context.engine_sha256,config_sha256:c.context.config_sha256};
      else {
        if(c.context.engine_sha256!==frozenContext.engine_sha256) issue('engine_changed');
        if(c.context.config_sha256!==frozenContext.config_sha256) issue('config_changed');
      }
      if (questions.has(c.case_id) && questions.get(c.case_id)!==c.context.question_sha256) issue('case_question_changed');
      else questions.set(c.case_id,c.context.question_sha256);
    }
    if (!contextOK(c.context) || typeof c.generation_id!=='string' || !c.generation_id) issue('context_unverified');
    if (!iso(c.observed_at) || !iso(period.started_at) || !iso(period.ended_at) || Date.parse(String(c.observed_at)) < Date.parse(String(period.started_at))+(week-1)*7*86400000 || Date.parse(String(c.observed_at)) >= Date.parse(String(period.started_at))+week*7*86400000 || Date.parse(String(c.observed_at)) > now.getTime()) issue('capture_time');
    const metrics = obj(c.metrics)?c.metrics:{};
    const receipt=receiptVersion?receiptEvidence(c,metrics,receiptIds,issue):null;
    if(receipt?.linked) linkedReceipts++;
    if(receipt?.partialCost!==null && receipt?.partialCost!==undefined) partialCosts.push(receipt.partialCost);
    if (metrics.latency_scope!=='end_to_end' || (typeof metrics.cost_source!=='string' || !['observed','unknown'].includes(metrics.cost_source)) || (metrics.cost_source==='unknown' && metrics.cost_usd!==null) || (metrics.cost_source==='observed' && !finite(metrics.cost_usd))) issue('metrics_provenance');
    if (!(metrics.latency_ms===null || finite(metrics.latency_ms)) || !(metrics.cost_usd===null || finite(metrics.cost_usd))) issue('metrics_schema');
    if (finite(metrics.latency_ms)) latencies[String(channel)].push(metrics.latency_ms); else issue('latency_unobserved');
    if (metrics.cost_source==='observed' && finite(metrics.cost_usd) && (!receiptVersion||receipt?.costKnown)) costs.push(metrics.cost_usd); else issue('cost_unobserved');
    if (c.outcome==='error') {errors++;issue('turn_error');continue;}
    if (c.outcome!=='success') {unknown++;issue('turn_unknown');continue;}
    success++;
    if (!validResponse(c.response)) {issue('response_contract');continue;}
    sqlTraceCaptures++;
    sqlQueryAttempts+=(c.response.consultas as Obj[]).length;
    sqlQueryErrors+=(c.response.consultas as Obj[]).filter(q=>q.error!==null).length;
    if (!snapshotOK(c.response,c.snapshot)) {issue('snapshot_mismatch');continue;}
    valid++;
    if ((c.response.bloques as unknown[]).length===0 && Array.isArray(c.format_observations) && c.format_observations.length===0) formatNotApplicable++;
    else if (!Array.isArray(c.format_observations) || !c.format_observations.length) issue('format_unobserved');
    else {formatCaptures++;for(const observation of c.format_observations) {if(!formatOK(c.response,observation)) issue('format_mismatch');else formatChecks++;}}
  }
  if (captures.length!==80 || byWeek.some(s=>s.size!==20) || !same([...byWeek[0]].sort(),[...byWeek[1]].sort())) issue('coverage_incomplete');
  for (const p of pairs.values()) {
    const a=p.web,b=p.telegram;
    if (!a||!b) {issue('pair_missing');continue;}
    fullPairs++;
    if (!contextOK(a.context)||!contextOK(b.context)||!same(a.context,b.context)) {issue('pair_context_mismatch');continue;}
    comparablePairs++;
    if(a.generation_id===b.generation_id) shared++;else independent++;
    if(root.mode==='paired_live' && a.generation_id===b.generation_id) issue('live_generation_reused');
    if(root.mode==='shared_response_replay' && a.generation_id!==b.generation_id) issue('replay_generation_mismatch');
    if (!validResponse(a.response)||!validResponse(b.response)||!same(semantic(a.response),semantic(b.response))) issue('parity_mismatch'); else parityPairs++;
  }
  const subtotal=costs.reduce((a,b)=>a+b,0);
  if(!Number.isFinite(subtotal)) issue('cost_aggregate_nonfinite');
  const partialSubtotal=partialCosts.reduce((a,b)=>a+b,0);
  if(!Number.isFinite(partialSubtotal)) issue('receipt_cost_aggregate_nonfinite');
  const p95={web:percentile(latencies.web),telegram:percentile(latencies.telegram)};
  for(const channel of ['web','telegram']) if(p95[channel as 'web'|'telegram']!==null && Number(p95[channel as 'web'|'telegram'])>=25000) issue('latency_threshold');
  return {
    schema_version:2, evidence_schema_version:root.schema_version===1?1:root.schema_version===2?2:null, scope:'offline_capture_analysis', live_observation:live, receipts_required_for_live:true,
    counts:{captures:captures.length,expected_captures:80,complete_pairs:fullPairs,comparable_pairs:comparablePairs,parity_pairs:parityPairs,shared_generation_pairs:shared,independent_generation_pairs:independent,success,errors,unknown,sql_trace_captures:sqlTraceCaptures,sql_query_attempts:sqlQueryAttempts,sql_query_errors:sqlQueryErrors,valid_contract_and_snapshot:valid,format_observed_captures:formatCaptures,format_not_applicable_captures:formatNotApplicable,format_checks:formatChecks,receipt_linked_captures:linkedReceipts},
    latency:{p95_ms:p95,observed:{web:latencies.web.length,telegram:latencies.telegram.length},method:'nearest_rank',threshold_ms:25000},
    cost:{currency:'USD',partial_receipt_count:partialCosts.length,partial_observed_subtotal:partialCosts.length&&Number.isFinite(partialSubtotal)?partialSubtotal:null,observed_count:costs.length,unknown_count:captures.length-costs.length,observed_subtotal:costs.length&&Number.isFinite(subtotal)?subtotal:null,total:costs.length===captures.length&&captures.length>0&&Number.isFinite(subtotal)?subtotal:null},
    issues,
    protocol_pass:Object.keys(issues).length===0,
    p6_live_protocol_pass:live&&receiptVersion&&linkedReceipts===captures.length&&Object.keys(issues).length===0,
    d6_accepted:false, visual_manual_review_required:true, activation_authorized:false,
  };
}
