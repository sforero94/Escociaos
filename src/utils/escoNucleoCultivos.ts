import { DEFINITIONS, fechaValida, validarEvidencia, type Evidence, type Fact, type Metric, type Scope, type Entity, type PopulationProof } from './escoEvidencia';
import { coberturaNucleo, nucleoVacio, parteNoVerificable, periodoNucleo, pruebaDerivadaNucleo, pruebaNucleo, textoNucleo, unirNucleo, validarLecturaNucleo, type ContextoNucleo, type PuertoNucleo, type LecturaNucleo, type ResultadoNucleo } from './escoNucleoComun';

/** Source-minimized crop operations; shared contract and transport stay integrator-owned. */
export const PROYECCIONES_CULTIVOS = {
  produccion: 'id,lote_id,sublote_id,ano,cosecha_tipo,kg_totales,arboles_registrados,kg_por_arbol',
  calidad: 'id,lote_id,sublote_id,ano,cosecha_tipo,kg_totales,kg_exportacion,kg_nacional,arboles_registrados',
  monitoreos: 'id,fecha_monitoreo,lote_id,sublote_id,plaga_enfermedad_id,ronda_id,arboles_monitoreados,arboles_afectados,incidencia,severidad,gravedad_texto,individuos_encontrados,floracion_sin_flor,floracion_brotes,floracion_flor_madura,floracion_cuaje',
  cosechas: 'id,fecha_cosecha,lote_id,sublote_id,kilos_cosechados,numero_canastillas',
  despachos: 'id,fecha_despacho,kilos_despachados,precio_por_kilo,valor_total',
} as const;

type FilaCultivo = Record<string, unknown>;
type DecimalCultivo = { n: bigint; scale: number };
const uuidCultivo = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const textoCultivo = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 128 && [...v].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127);
const normalizarCultivo = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
function decimalCultivo(v: unknown): DecimalCultivo | null {
  if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER)) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const value = String(v), m = /^(-?)(\d{1,24})(?:\.(\d{1,18}))?(?:[eE]([+-]?\d{1,2}))?$/.exec(value);
  if(!m)return null;
  const exponent=Number(m[4]??0);if(Math.abs(exponent)>18)return null;
  let n=BigInt(m[2]+(m[3]??''))*(m[1]?-1n:1n),scale=(m[3]??'').length-exponent;
  if(scale<0){n*=10n**BigInt(-scale);scale=0;}
  if(scale>18)return null;
  const formatted=formatearCultivo({n,scale});return decimalLiteral(formatted)?{n,scale}:null;
}
function sumarCultivo(a: DecimalCultivo, b: DecimalCultivo): DecimalCultivo {
  const scale = Math.max(a.scale, b.scale);
  return { n: a.n * 10n ** BigInt(scale - a.scale) + b.n * 10n ** BigInt(scale - b.scale), scale };
}
function formatearCultivo(d: DecimalCultivo): string {
  const sign = d.n < 0n ? '-' : '', digits = (d.n < 0n ? -d.n : d.n).toString().padStart(d.scale + 1, '0');
  return d.scale ? (sign + digits.slice(0, -d.scale) + '.' + digits.slice(-d.scale)).replace(/\.?0+$/, '') : sign + digits;
}
function cocienteCultivo(a: DecimalCultivo, b: DecimalCultivo, scale: number, percent = false): string | null {
  if (b.n <= 0n || a.n < 0n) return null;
  const numerator = a.n * 10n ** BigInt(b.scale + scale) * (percent ? 100n : 1n), denominator = b.n * 10n ** BigInt(a.scale);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  return formatearCultivo({ n: rounded, scale });
}
function cantidadCultivo(row: FilaCultivo, field: string, integer = false, signed = false): DecimalCultivo | null {
  const d = decimalCultivo(row[field]);
  if (!d || (!signed && d.n < 0n) || (integer && d.n % 10n ** BigInt(d.scale) !== 0n)) return null;
  return d;
}


const LIMITES_CULTIVOS = { facts: 200, details: 30, monitoringDetails: 20, groups: 100 } as const;
const produccionMetricas: Metric[] = ['production.count','production.kg','production.trees','production.kg_per_tree','production.mean_recorded_kg_per_tree'];
const calidadMetricas: Metric[] = ['production.count','production.kg','production.export_kg','production.national_kg','production.export_pct','production.national_pct'];
const monitoreoMetricas: Metric[] = ['monitoring.count','monitoring.observed','monitoring.affected','monitoring.individuals','monitoring.incidence','monitoring.gravity','monitoring.flowering_sin_flor','monitoring.flowering_brotes','monitoring.flowering_flor_madura','monitoring.flowering_cuaje','monitoring.flowering_observed'];
const cosechaMetricas: Metric[] = ['harvest.count','harvest.kg','harvest.baskets','harvest.date'];
const despachoMetricas: Metric[] = ['shipment.count','shipment.kg','shipment.price','shipment.value','shipment.date'];
const decimalLiteral = (v: string) => /^-?\d{1,24}(?:\.\d{1,18})?$/.test(v);
const entities = (scope: Scope) => scope.entities.map(({kind,id}) => ({kind,id}));
const unknown = (reason = 'missing_value'): Fact['value'] => ({kind:'unknown',reason});
function metricas(tool: string): Metric[] { return tool==='get_monitoring_data'?monitoreoMetricas:tool==='get_harvest_shipments'?[...cosechaMetricas,...despachoMetricas]:tool==='get_produccion_calidad'?calidadMetricas:produccionMetricas; }
function operation(tool: string): Scope['operation'] { return tool==='get_monitoring_data'?'monitoring.observations':tool==='get_harvest_shipments'?'harvest.records':'production.records'; }
function tiempo(ctx: ContextoNucleo): {from?:string;to?:string} {
  if (!fechaValida(ctx.referenceDay) || !['resolved','absent','open'].includes(ctx.dateState)) throw Error('scope_ambiguous');
  if(ctx.dateState==='absent') { if(ctx.period || ctx.bounds?.from || ctx.bounds?.to)throw Error('scope_ambiguous'); return {}; }
  if(ctx.dateState==='open'&&ctx.period)throw Error('scope_ambiguous');
  if(ctx.dateState==='resolved'&&ctx.period&&ctx.bounds&&(ctx.bounds.from&&ctx.bounds.from!==ctx.period.from||ctx.bounds.to&&ctx.bounds.to!==ctx.period.to))throw Error('scope_ambiguous');
  const bounds=ctx.dateState==='resolved'?ctx.period:ctx.bounds;
  if(!bounds || (!bounds.from&&!bounds.to) || bounds.from&&!fechaValida(bounds.from) || bounds.to&&!fechaValida(bounds.to) || bounds.from&&bounds.to&&bounds.from>bounds.to)throw Error('scope_ambiguous');
  return bounds;
}
function fechasConsulta(bounds:{from?:string;to?:string}, field:string):string {
  return (bounds.from?'&'+field+'=gte.'+encodeURIComponent(bounds.from):'')+(bounds.to?'&'+field+'=lte.'+encodeURIComponent(bounds.to):'');
}
function validarFechas(rows:readonly FilaCultivo[],bounds:{from?:string;to?:string},field:string) {
  if(!bounds.from&&!bounds.to)return;
  if(rows.some(r=>!fechaValida(r[field]) || bounds.from&&String(r[field])<bounds.from || bounds.to&&String(r[field])>bounds.to))throw Error('outside_scope');
}
function mencionCultivo(question:string,selector:string):'positive'|'negative'|'absent' {
  const text=' '+textoNucleo(question)+' ',term=' '+textoNucleo(selector)+' ';
  if(!term.trim())return 'absent';
  let at=text.indexOf(term),positive=false,negative=false;
  while(at>=0){
    const prefix=text.slice(0,at+1);
    const negated=/(?:\b(?:sin|excepto|excluye|excluir|menos)|\bno(?: incluir| muestres| mostrar)?)(?: (?:la|el|las|los|del|de|lote|lotes|plaga|plagas|cliente|clientes|ano|cosecha))* $/.test(prefix);
    if(negated)negative=true;else positive=true;
    at=text.indexOf(term,at+term.length-1);
  }
  return negative?'negative':positive?'positive':'absent';
}
function filtroNombre(args: FilaCultivo,key:string,ctx:ContextoNucleo):string|undefined {
  if(args[key]===undefined)return;
  if(!textoCultivo(args[key]) || mencionCultivo(ctx.currentUserText,String(args[key]))!=='positive')throw Error('outside_scope');
  return String(args[key]);
}
function seleccionCultivo(map:Map<string,FilaCultivo>,proposed:string|undefined,ctx:ContextoNucleo,key:string):{ids:Set<string>|null;filters:Scope['filters']} {
  const mentioned=[...map].map(([id,row])=>({id,state:mencionCultivo(ctx.currentUserText,nombre(row,id))}));
  if(mentioned.some(x=>x.state==='negative'))throw Error('scope_ambiguous');
  const positive=mentioned.filter(x=>x.state==='positive').map(x=>x.id),ids=proposed===undefined?(positive.length?new Set(positive):null):idsNombre(map,proposed);
  if(positive.some(id=>!ids?.has(id)))throw Error('scope_ambiguous');
  return {ids,filters:ids===null?{}:{[key]:[...ids]}};
}
async function leerCultivo(port:PuertoNucleo,table:string,projection:string,suffix=''):Promise<LecturaNucleo> {
  const r=await port.read(table,'select='+projection+suffix,['id']);
  if(!validarLecturaNucleo(r)||r.rows.some(row=>!uuidCultivo(row.id)))throw Error('source_error');
  if(new Set(r.rows.map(row=>String(row.id).toLowerCase())).size!==r.rows.length)throw Error('duplicate_identity');
  return r;
}
function catalogo(read:LecturaNucleo):Map<string,FilaCultivo> {
  return new Map(read.rows.map(r=>[String(r.id).toLowerCase(),r]));
}
function nombre(row:FilaCultivo|undefined,id:string):string {return row&&textoCultivo(row.nombre)?row.nombre:id;}
function nombreCatalogo(map:Map<string,FilaCultivo>,id:string):string {
  const label=nombre(map.get(id.toLowerCase()),id);
  const duplicates=[...map.values()].filter(r=>textoCultivo(r.nombre)&&normalizarCultivo(r.nombre)===normalizarCultivo(label)).length;
  return duplicates>1?id+' '+(label.length>80?label.slice(0,79)+'…':label):label;
}
function rotuloCultivo(scope:Scope,label:string):string {
  const captions:Record<string,string>={ano:'año',cosecha_tipo:'cosecha',lote_name:'lote',pest_name:'plaga',client_name:'cliente',date_from:'desde',date_to:'hasta',mes:'mes'};
  const pieces=Object.entries(captions).flatMap(([field,caption])=>typeof scope.filters[field]==='string'?[caption+' '+scope.filters[field]]:[]);
  return pieces.length?pieces.join('; ')+' — '+label:label;
}
function idsNombre(map:Map<string,FilaCultivo>,query:string|undefined):Set<string>|null {
  if(query===undefined)return null;
  if([...map.values()].some(r=>!textoCultivo(r.nombre)))throw Error('scope_ambiguous');
  return new Set([...map].filter(([,r])=>normalizarCultivo(String(r.nombre)).includes(normalizarCultivo(query))).map(([id])=>id));
}
function validarLugar(rows:readonly FilaCultivo[],lots:Map<string,FilaCultivo>,subs:Map<string,FilaCultivo>) {
  for(const r of rows){
    if(!uuidCultivo(r.lote_id)||!lots.has(r.lote_id.toLowerCase()))throw Error('source_error');
    if(r.sublote_id===undefined)throw Error('source_error');
    if(r.sublote_id!==null){
      if(!uuidCultivo(r.sublote_id))throw Error('source_error');
      const sub=subs.get(r.sublote_id.toLowerCase());if(!sub||String(sub.lote_id).toLowerCase()!==r.lote_id.toLowerCase())throw Error('source_error');
    }
  }
}
function grupos(rows:readonly FilaCultivo[],key:(r:FilaCultivo)=>string):Map<string,FilaCultivo[]> {
  const map=new Map<string,FilaCultivo[]>();for(const r of rows){const k=key(r);if(!map.has(k))map.set(k,[]);map.get(k)!.push(r);}return map;
}
interface ResumenCultivo {sum:DecimalCultivo;missing:number;valid:number}
function resumir(rows:readonly FilaCultivo[],field:string,integer=false,signed=false,valid:(r:FilaCultivo)=>boolean=()=>true):ResumenCultivo {
  const out:ResumenCultivo={sum:{n:0n,scale:0},missing:0,valid:0};
  for(const r of rows){const d=valid(r)?cantidadCultivo(r,field,integer,signed):null;if(d===null)out.missing++;else{out.valid++;out.sum=sumarCultivo(out.sum,d);}}
  return out;
}
class ConstructorCultivos {
  result:ResultadoNucleo=nucleoVacio(); count=0; facts=0; auxReads:LecturaNucleo[]=[]; sourceFields?:readonly string[];
  constructor(readonly ctx:ContextoNucleo,readonly budget:number=LIMITES_CULTIVOS.facts){}
  scope(op:Scope['operation'],filters:Scope['filters']={},es:Entity[]=[]):Scope {
    const field=op==='monitoring.observations'?'fecha_monitoreo':op==='harvest.records'?'fecha_cosecha':'fecha_despacho';
    const basis=op==='monitoring.observations'?'observation':op==='harvest.records'?'actual':'recorded_at';
    const bounds=op==='production.records'?{}:tiempo(this.ctx);
    return {id:'crops:'+op+':'+this.count++,operation:op,entities:es,period:op==='production.records'?null:periodoNucleo(this.ctx,field,basis),filters:{...(bounds.from&&!this.ctx.period?{date_from:bounds.from}:{}),...(bounds.to&&!this.ctx.period?{date_to:bounds.to}:{}),...filters}};
  }
  add(scope:Scope,read:LecturaNucleo,rows:readonly FilaCultivo[],label:string,build:(p:PopulationProof)=>Fact[],extraIssues:string[]=[]):void {
    const fields=this.sourceFields?[...this.sourceFields]:scope.operation==='production.records'?PROYECCIONES_CULTIVOS.produccion.split(','):scope.operation==='monitoring.observations'?PROYECCIONES_CULTIVOS.monitoreos.split(','):scope.operation==='harvest.records'?PROYECCIONES_CULTIVOS.cosechas.split(','):PROYECCIONES_CULTIVOS.despachos.split(',');
    if(scope.operation==='shipment.records'&&this.ctx.identities.client&&!fields.includes('cliente_id'))fields.push('cliente_id');
    const tool=DEFINITIONS[metricasPorOperacion(scope.operation)[0]].tool;
    const sourceProof=pruebaNucleo(read,scope,tool,fields,rows);
    const p=this.auxReads.length?pruebaDerivadaNucleo([read,...this.auxReads],scope,tool,fields,rows.length):sourceProof;
    const full=build(p),remaining=Math.max(0,this.budget-this.facts),facts=full.slice(0,remaining);
    const codes=[...new Set([...extraIssues,...(facts.length<full.length?['budget_exceeded']:[]),...facts.filter(f=>f.value.kind==='unknown'||f.coverage.values!=='complete').map(f=>f.value.kind==='unknown'?f.value.reason:'missing_value')])];
    this.facts+=facts.length;
    const e:Evidence={version:1,state:codes.length?'partial':'ok',scopes:[scope],facts,issues:codes.map(code=>({partId:scope.id,code}))};
    if(!validarEvidencia(e,[scope],[p]))throw Error('source_error');
    this.result.scopes.push(scope);this.result.populations.push(p);this.result.evidence.push(e);
    this.result.parts.push({id:scope.id,operation:scope.operation,scopeIds:[scope.id],metrics:[...new Set(full.map(f=>f.metric))],label:rotuloCultivo(scope,label)});
  }
  base(scope:Scope,p:PopulationProof,metric:Metric,es=entities(scope)):Fact {
    const d=DEFINITIONS[metric];return {id:scope.id+':f'+this.count++,scopeId:scope.id,metric,definitionId:metric+'.v1',entities:es,value:unknown(),origin:'recorded',coverage:coberturaNucleo(p),source:{tool:d.tool,field:d.field,capturedAt:p.capturedAt},assertion:'record_value'};
  }
  total(scope:Scope,p:PopulationProof,rows:readonly FilaCultivo[],metric:Metric,integer=false,signed=false,valid:(r:FilaCultivo)=>boolean=()=>true):Fact {
    const d=DEFINITIONS[metric],r=resumir(rows,d.field,integer,signed,valid),value=formatearCultivo(r.sum);
    return {...this.base(scope,p,metric),origin:'derived',assertion:r.missing?'verified_subtotal':'scoped_total',value:r.valid||!rows.length?decimalLiteral(value)?{kind:'decimal',value,unit:d.unit}:unknown('invalid_value'):unknown(),coverage:coberturaNucleo(p,r.missing,r.missing?['missing_value']:[]),derivation:{operation:'sum',inputs:[{populationId:p.populationId,field:d.field}]}};
  }
  countFact(scope:Scope,p:PopulationProof,metric:Metric):Fact {
    return {...this.base(scope,p,metric),origin:'derived',assertion:p.rowsRead?'record_count':'bounded_empty',value:{kind:'decimal',value:String(p.rowsRead),unit:'registro'},derivation:{operation:'count',inputs:[{populationId:p.populationId,field:'id'}]}};
  }
  ratio(scope:Scope,p:PopulationProof,metric:Metric,a:Fact,b:Fact,scale:number,percent=false):Fact {
    const f=this.base(scope,p,metric);const valid=a.value.kind==='decimal'&&b.value.kind==='decimal'&&a.coverage.values==='complete'&&b.coverage.values==='complete';
    const value=valid?cocienteCultivo(decimalCultivo(a.value.kind==='decimal'?a.value.value:null)!,decimalCultivo(b.value.kind==='decimal'?b.value.value:null)!,scale,percent):null;
    return {...f,origin:value===null?'recorded':'derived',assertion:value===null?'record_value':'derived_measure',value:value===null?unknown('no_direct_evidence'):{kind:'decimal',value,unit:DEFINITIONS[metric].unit},...(value===null?{}:{derivation:{operation:'ratio' as const,inputs:[{factId:a.id},{factId:b.id}]}})};
  }
  record(scope:Scope,p:PopulationProof,row:FilaCultivo,metric:Metric,es:Fact['entities'],valid=true):Fact {
    const d=DEFINITIONS[metric],raw=row[d.field],n=decimalCultivo(raw),okay=valid&&(d.unit==='date'?fechaValida(raw):d.unit==='status'?['Baja','Media','Alta'].includes(String(raw)):n!==null);
    const value:Fact['value']=!okay?unknown(raw===null||raw===undefined?'missing_value':'invalid_value'):d.unit==='date'?{kind:'date',value:String(raw)}:d.unit==='status'?{kind:'status',value:String(raw)}:{kind:'decimal',value:formatearCultivo(n!),unit:d.unit};
    return {...this.base(scope,p,metric,es),value,coverage:coberturaNucleo(p,okay?0:Math.min(1,p.rowsRead),okay?[]:[value.kind==='unknown'?value.reason:'invalid_value'])};
  }
  label(kind:Entity['kind'],id:string,label:string):Entity {this.result.labels[kind+':'+id]=label;return {kind,id,label};}
  omitted():void {for(const e of this.result.evidence){if(!e.issues.some(i=>i.code==='budget_exceeded'))e.issues.push({partId:e.scopes[0].id,code:'budget_exceeded'});if(e.state==='ok')e.state='partial';}}
}
function metricasPorOperacion(op:Scope['operation']):Metric[] {return op==='production.records'?produccionMetricas:op==='monitoring.observations'?monitoreoMetricas:op==='harvest.records'?cosechaMetricas:despachoMetricas;}
function referenciasFila(b:ConstructorCultivos,row:FilaCultivo,lots:Map<string,FilaCultivo>,subs:Map<string,FilaCultivo>,kind:Entity['kind']='record'):Fact['entities'] {
  const lot=String(row.lote_id),es:Entity[]=[b.label('lot',lot,nombreCatalogo(lots,lot))];
  if(uuidCultivo(row.sublote_id))es.push(b.label('sublot',row.sublote_id,nombreCatalogo(subs,row.sublote_id)));
  es.push(b.label(kind,String(row.id),row.ano!==undefined?'Registro '+String(row.ano)+' '+String(row.cosecha_tipo)+' '+String(row.id):String(row.id)));return es.map(({kind,id})=>({kind,id}));
}
function baseFiltros(args:FilaCultivo):Scope['filters'] {return {...(args.year===undefined?{}:{ano:String(args.year)}),...(args.cosecha_tipo===undefined?{}:{cosecha_tipo:String(args.cosecha_tipo)}),...(args.lote_name===undefined?{}:{lote_name:String(args.lote_name)}),...(args.pest_name===undefined?{}:{pest_name:String(args.pest_name)}),...(args.client_name===undefined?{}:{client_name:String(args.client_name)})};}
function consolidarProduccion(rows:readonly FilaCultivo[]):FilaCultivo[] {
  const output:FilaCultivo[]=[];
  for(const group of grupos(rows,r=>[r.lote_id,r.ano,r.cosecha_tipo].join('|')).values()){
    const whole=group.filter(r=>r.sublote_id===null||r.sublote_id===undefined);
    if(whole.length>1)throw Error('duplicate_identity');
    const seen=new Set<string>();for(const r of group){const key=String(r.sublote_id??'whole');if(seen.has(key))throw Error('duplicate_identity');seen.add(key);}
    output.push(...(whole.length?whole:group));
  }
  return output;
}

function calidadValida(row:FilaCultivo,field:string):boolean {
  const total=cantidadCultivo(row,'kg_totales'),value=cantidadCultivo(row,field);
  if(!total||!value)return false;
  const aligned=sumarCultivo(total,{n:0n,scale:value.scale}),v=sumarCultivo(value,{n:0n,scale:total.scale});
  if(v.n>aligned.n)return false;
  const a=cantidadCultivo(row,'kg_exportacion'),b=cantidadCultivo(row,'kg_nacional');
  if(a&&b){const sum=sumarCultivo(a,b),x=sumarCultivo(sum,{n:0n,scale:total.scale}),y=sumarCultivo(total,{n:0n,scale:sum.scale});if(x.n!==y.n)return false;}
  return true;
}
async function produccionCultivos(tool:string,args:FilaCultivo,ctx:ContextoNucleo,port:PuertoNucleo):Promise<ResultadoNucleo> {
  const b=new ConstructorCultivos(ctx),lotFilter=filtroNombre(args,'lote_name',ctx),quality=tool==='get_produccion_calidad';
  const bounds=tiempo(ctx);
  const completeYear=bounds.from&&bounds.to&&bounds.from.endsWith('-01-01')&&bounds.to===bounds.from.slice(0,4)+'-12-31';
  // An annual source cannot answer a month/semester. The current-year selector
  // retains the source's annual axis, not an assertion about a daily interval.
  const currentYear=mencionCultivo(ctx.currentUserText,'este año')==='positive'&&bounds.from===ctx.referenceDay.slice(0,4)+'-01-01'&&bounds.to===ctx.referenceDay;
  if((bounds.from||bounds.to)&&!completeYear&&!currentYear)throw Error('unsupported_operation');
  const literalYears=[...new Set(ctx.currentUserText.match(/\b20\d{2}\b/g)??[])];
  if(literalYears.some(y=>mencionCultivo(ctx.currentUserText,y)!=='positive')||literalYears.length>1)throw Error('scope_ambiguous');
  let year:number|undefined;
  if(args.year!==undefined&&(!Number.isInteger(args.year)||Number(args.year)<2020||Number(args.year)>2050))throw Error('invalid_value');
  const contextYear=bounds.from?Number(bounds.from.slice(0,4)):undefined;
  if(contextYear!==undefined){
    if(literalYears.length&&Number(literalYears[0])!==contextYear)throw Error('outside_scope');
    if(args.year!==undefined&&Number(args.year)!==contextYear&&!currentYear)throw Error('outside_scope');
    year=contextYear;
  }else{
    if(args.year!==undefined&&(!literalYears.length||Number(args.year)!==Number(literalYears[0])))throw Error('outside_scope');
    year=literalYears.length?Number(literalYears[0]):undefined;
  }
  const seasons=['Principal','Traviesa'].map(name=>({name,state:mencionCultivo(ctx.currentUserText,name)}));
  if(seasons.some(s=>s.state==='negative'))throw Error('scope_ambiguous');
  const positiveSeasons=seasons.filter(s=>s.state==='positive').map(s=>s.name);
  let season=positiveSeasons.length===1?positiveSeasons[0]:undefined;
  if(args.cosecha_tipo!==undefined){
    if(typeof args.cosecha_tipo!=='string')throw Error('invalid_value');
    const proposed=seasons.find(s=>normalizarCultivo(s.name)===normalizarCultivo(String(args.cosecha_tipo)))?.name;
    if(!proposed||positiveSeasons.length!==1||proposed!==season)throw Error('outside_scope');
    season=proposed;
  }
  const projection=quality?PROYECCIONES_CULTIVOS.calidad:PROYECCIONES_CULTIVOS.produccion;b.sourceFields=projection.split(',');
  const [read,lotRead,subRead]=await Promise.all([leerCultivo(port,'produccion',projection,(year===undefined?'':'&ano=eq.'+year)+(season?'&cosecha_tipo=eq.'+season:'')),leerCultivo(port,'lotes','id,nombre'),leerCultivo(port,'sublotes','id,nombre,lote_id')]);
  b.auxReads=[lotRead,subRead];
  const lots=catalogo(lotRead),subs=catalogo(subRead);validarLugar(read.rows,lots,subs);
  if(read.rows.some(r=>!Number.isInteger(r.ano)||Number(r.ano)<2020||Number(r.ano)>2050||!['Principal','Traviesa'].includes(String(r.cosecha_tipo))||year!==undefined&&r.ano!==year||season&&r.cosecha_tipo!==season))throw Error('outside_scope');
  const selection=seleccionCultivo(lots,lotFilter,ctx,'lote_id'),selected=selection.ids,rows=read.rows.filter(r=>selected===null||selected.has(String(r.lote_id).toLowerCase()));
  const filters={...baseFiltros({...args,...(year===undefined?{}:{year}),...(season?{cosecha_tipo:season}:{})}),...selection.filters};
  const rawScope=b.scope('production.records',{...filters,grain:'registros'});
  b.add(rawScope,read,rows,'Registros de producción por año/cosecha',p=>{
    const facts=[b.countFact(rawScope,p,'production.count')];
    if(!quality){const r=resumir(rows,'kg_por_arbol',false,false,r=>!!cantidadCultivo(r,'arboles_registrados',true)&&cantidadCultivo(r,'arboles_registrados',true)!.n>0n);const value=r.valid?cocienteCultivo(r.sum,{n:BigInt(r.valid),scale:0},1):null;
      facts.push({...b.base(rawScope,p,'production.mean_recorded_kg_per_tree'),origin:'derived',assertion:'derived_measure',coverage:coberturaNucleo(p,r.missing,r.missing?['missing_value']:[]),value:value===null?unknown('not_observed'):{kind:'decimal',value,unit:'kg/arbol_registrado'},derivation:{operation:'mean',inputs:[{populationId:p.populationId,field:'kg_por_arbol'}]}});
    }
    const offset=Number(args.detalle_offset??0),details=rows.slice(offset,offset+LIMITES_CULTIVOS.details);
    for(const row of details){const es=referenciasFila(b,row,lots,subs);
      const metrics:Metric[]=quality?['production.kg','production.export_kg','production.national_kg']:['production.kg','production.trees','production.recorded_kg_per_tree'];
      for(const metric of metrics){const d=DEFINITIONS[metric],valid=metric==='production.recorded_kg_per_tree'?!!cantidadCultivo(row,'arboles_registrados',true)&&cantidadCultivo(row,'arboles_registrados',true)!.n>0n:metric==='production.export_kg'||metric==='production.national_kg'?calidadValida(row,d.field):cantidadCultivo(row,d.field,metric==='production.trees')!==null;facts.push(b.record(rawScope,p,row,metric,es,valid));}
    }
    return facts;
  },rows.length>LIMITES_CULTIVOS.details+Number(args.detalle_offset??0)||Number(args.detalle_offset??0)>0?['budget_exceeded']:[]);
  if(!quality&&year===undefined)for(const[ano,rs]of grupos(rows,r=>String(r.ano))){
    const scope=b.scope('production.records',{...filters,ano,grain:'registros'});
    b.add(scope,read,rs,'Media no ponderada de registros del año '+ano,p=>{
      const r=resumir(rs,'kg_por_arbol',false,false,r=>!!cantidadCultivo(r,'arboles_registrados',true)&&cantidadCultivo(r,'arboles_registrados',true)!.n>0n),value=r.valid?cocienteCultivo(r.sum,{n:BigInt(r.valid),scale:0},1):null;
      return [b.countFact(scope,p,'production.count'),{...b.base(scope,p,'production.mean_recorded_kg_per_tree'),origin:'derived',assertion:'derived_measure',coverage:coberturaNucleo(p,r.missing,r.missing?['missing_value']:[]),value:value===null?unknown('not_observed'):{kind:'decimal',value,unit:'kg/arbol_registrado'},derivation:{operation:'mean',inputs:[{populationId:p.populationId,field:'kg_por_arbol'}]}}];
    });
  }
  const effective=consolidarProduccion(rows);
  const frames:Array<{rows:FilaCultivo[];filters:Scope['filters'];entities:Entity[];label:string}>=[{rows:effective,filters:{...filters,grain:'lote_preferente'},entities:[],label:'Producción consolidada (lote preferente, sin doble conteo de sublotes)'}];
  for(const [lot,rs]of grupos(effective,r=>String(r.lote_id)))frames.push({rows:rs,filters:{...filters,lote_id:lot,grain:'lote_preferente'},entities:[b.label('lot',lot,nombreCatalogo(lots,lot))],label:'Producción registrada por lote'});
  for(const [ano,rs]of grupos(effective,r=>String(r.ano)))if(year===undefined)frames.push({rows:rs,filters:{...filters,ano,grain:'lote_preferente'},entities:[],label:'Producción registrada del año '+ano});
  for(const frame of frames.slice(0,LIMITES_CULTIVOS.groups)){
    const scope=b.scope('production.records',frame.filters,frame.entities);
    b.add(scope,read,frame.rows,frame.label,p=>{
      const kg=b.total(scope,p,frame.rows,'production.kg'),trees=b.total(scope,p,frame.rows,'production.trees',true);
      const facts=[kg,trees,b.ratio(scope,p,'production.kg_per_tree',kg,trees,4)];
      if(quality){const exp=b.total(scope,p,frame.rows,'production.export_kg',false,false,r=>calidadValida(r,'kg_exportacion')),nat=b.total(scope,p,frame.rows,'production.national_kg',false,false,r=>calidadValida(r,'kg_nacional'));facts.push(exp,nat,b.ratio(scope,p,'production.export_pct',exp,kg,2,true),b.ratio(scope,p,'production.national_pct',nat,kg,2,true));}
      return facts;
    });
  }
  if(frames.length>LIMITES_CULTIVOS.groups)b.omitted();return b.result;
}
function validezMonitoreo(row:FilaCultivo,field:string):boolean {
  const observed=cantidadCultivo(row,'arboles_monitoreados',true),affected=cantidadCultivo(row,'arboles_afectados',true);
  if(field==='arboles_afectados')return !!observed&&!!affected&&sumarCultivo(affected,{n:0n,scale:observed.scale}).n<=sumarCultivo(observed,{n:0n,scale:affected.scale}).n;
  if(field==='incidencia'){const d=cantidadCultivo(row,field);return !!d&&sumarCultivo(d,{n:0n,scale:0}).n<=100n*10n**BigInt(d.scale)&&!!observed&&observed.n>0n;}
  if(field==='severidad')return cantidadCultivo(row,field)!==null&&!!affected&&affected.n>0n;
  return cantidadCultivo(row,field,true)!==null;
}
async function monitoreoCultivos(args:FilaCultivo,ctx:ContextoNucleo,port:PuertoNucleo):Promise<ResultadoNucleo> {
  const bounds=tiempo(ctx),lotFilter=filtroNombre(args,'lote_name',ctx),pestFilter=filtroNombre(args,'pest_name',ctx),b=new ConstructorCultivos(ctx);
  const [read,lotRead,subRead,pestRead]=await Promise.all([leerCultivo(port,'monitoreos',PROYECCIONES_CULTIVOS.monitoreos,fechasConsulta(bounds,'fecha_monitoreo')),leerCultivo(port,'lotes','id,nombre'),leerCultivo(port,'sublotes','id,nombre,lote_id'),leerCultivo(port,'plagas_enfermedades_catalogo','id,nombre')]);
  b.auxReads=[lotRead,subRead,pestRead];
  const lots=catalogo(lotRead),subs=catalogo(subRead),pests=catalogo(pestRead);validarLugar(read.rows,lots,subs);validarFechas(read.rows,bounds,'fecha_monitoreo');
  if(read.rows.some(r=>!uuidCultivo(r.plaga_enfermedad_id)||!pests.has(r.plaga_enfermedad_id.toLowerCase())||r.ronda_id!=null&&!uuidCultivo(r.ronda_id)))throw Error('source_error');
  const lotSelection=seleccionCultivo(lots,lotFilter,ctx,'lote_id'),pestSelection=seleccionCultivo(pests,pestFilter,ctx,'plaga_enfermedad_id'),lotIds=lotSelection.ids,pestIds=pestSelection.ids;
  const rows=read.rows.filter(r=>(lotIds===null||lotIds.has(String(r.lote_id).toLowerCase()))&&(pestIds===null||pestIds.has(String(r.plaga_enfermedad_id).toLowerCase()))),filters={...baseFiltros(args),...lotSelection.filters,...pestSelection.filters};
  const frames:Array<{rows:FilaCultivo[];filters:Scope['filters'];entities:Entity[];label:string;details?:boolean;countOnly?:boolean}>=[{rows,filters,entities:[],label:'Monitoreo registrado (observaciones, no árboles físicos únicos)',details:true}];
  for(const[pest,rs]of grupos(rows,r=>String(r.plaga_enfermedad_id)))frames.push({rows:rs,filters:{...filters,plaga_enfermedad_id:pest},entities:[b.label('pest',pest,nombreCatalogo(pests,pest))],label:'Monitoreo por plaga registrada'});
  for(const[sub,rs]of grupos(rows.filter(r=>uuidCultivo(r.sublote_id)),r=>String(r.sublote_id)))frames.push({rows:rs,filters:{...filters,sublote_id:sub},entities:[b.label('sublot',sub,nombreCatalogo(subs,sub))],label:'Monitoreo por sublote registrado'});
  for(const[month,rs]of grupos(rows.filter(r=>fechaValida(r.fecha_monitoreo)),r=>String(r.fecha_monitoreo).slice(0,7)))frames.push({rows:rs,filters:{...filters,mes:month},entities:[],label:'Monitoreo registrado del mes '+month});
  for(const[compound,rs]of grupos(rows.filter(r=>fechaValida(r.fecha_monitoreo)),r=>String(r.fecha_monitoreo).slice(0,7)+'|'+r.plaga_enfermedad_id)){
    const [mes,pest]=compound.split('|');frames.push({rows:rs,filters:{...filters,mes,plaga_enfermedad_id:pest},entities:[b.label('pest',pest,nombreCatalogo(pests,pest))],label:'Registros de cada plaga por mes',countOnly:true});
  }
  for(const[compound,rs]of grupos(rows.filter(r=>fechaValida(r.fecha_monitoreo)),r=>String(r.fecha_monitoreo).slice(0,7)+'|'+r.lote_id)){
    const [mes,lot]=compound.split('|');frames.push({rows:rs,filters:{...filters,mes,lote_id:lot},entities:[b.label('lot',lot,nombreCatalogo(lots,lot))],label:'Lotes con monitoreo registrado por mes',countOnly:true});
  }
  for(const[compound,rs]of grupos(rows.filter(r=>uuidCultivo(r.sublote_id)),r=>String(r.sublote_id)+'|'+r.plaga_enfermedad_id)){
    const [sub,pest]=compound.split('|');frames.push({rows:rs,filters:{...filters,sublote_id:sub,plaga_enfermedad_id:pest},entities:[b.label('sublot',sub,nombreCatalogo(subs,sub)),b.label('pest',pest,nombreCatalogo(pests,pest))],label:'Plagas registradas por sublote',countOnly:true});
  }
  for(const frame of frames.slice(0,LIMITES_CULTIVOS.groups)){
    const scope=b.scope('monitoring.observations',frame.filters,frame.entities);
    b.add(scope,read,frame.rows,frame.label,p=>{
      if(frame.countOnly)return [b.countFact(scope,p,'monitoring.count')];
      const observed=b.total(scope,p,frame.rows,'monitoring.observed',true),affected=b.total(scope,p,frame.rows,'monitoring.affected',true,false,r=>validezMonitoreo(r,'arboles_afectados'));
      const facts=[b.countFact(scope,p,'monitoring.count'),observed,affected,b.total(scope,p,frame.rows,'monitoring.individuals',true),b.ratio(scope,p,'monitoring.incidence',affected,observed,2,true)];
      const gravityValues=frame.rows.map(r=>['Baja','Media','Alta'].indexOf(String(r.gravedad_texto))),missing=gravityValues.filter(v=>v<0).length,max=Math.max(-1,...gravityValues);
      facts.push({...b.base(scope,p,'monitoring.gravity'),origin:'derived',assertion:'derived_measure',coverage:coberturaNucleo(p,missing,missing?['missing_value']:[]),value:max<0||missing?unknown(max<0?'not_observed':'missing_value'):{kind:'status',value:['Baja','Media','Alta'][max]},derivation:{operation:'max',inputs:[{populationId:p.populationId,field:'gravedad_texto'}]}});
      for(const metric of ['monitoring.flowering_sin_flor','monitoring.flowering_brotes','monitoring.flowering_flor_madura','monitoring.flowering_cuaje','monitoring.flowering_observed'] as const){
        const field=DEFINITIONS[metric].field,events=new Map<string,DecimalCultivo>();let missing=0;
        for(const r of frame.rows){const d=fechaValida(r.fecha_monitoreo)?cantidadCultivo(r,field,true):null;if(!d){missing++;continue;}
          const key=[r.lote_id,r.sublote_id??'lot',r.fecha_monitoreo].join('|'),prior=events.get(key);if(!prior||sumarCultivo(d,{n:0n,scale:prior.scale}).n>sumarCultivo(prior,{n:0n,scale:d.scale}).n)events.set(key,d);
        }
        const value=formatearCultivo([...events.values()].reduce(sumarCultivo,{n:0n,scale:0}));
        facts.push({...b.base(scope,p,metric),origin:'derived',assertion:missing?'verified_subtotal':'scoped_total',coverage:coberturaNucleo(p,missing,missing?['missing_value']:[]),value:events.size||!frame.rows.length?{kind:'decimal',value,unit:'arbol_observado'}:unknown(),derivation:{operation:'dedupe_max_sum',inputs:[{populationId:p.populationId,field}]}});
      }
      if(frame.details)for(const row of frame.rows.slice(0,LIMITES_CULTIVOS.monitoringDetails)){
        const es=[...referenciasFila(b,row,lots,subs),{kind:'pest' as const,id:String(row.plaga_enfermedad_id)}];b.label('pest',String(row.plaga_enfermedad_id),nombreCatalogo(pests,String(row.plaga_enfermedad_id)));
        for(const metric of ['monitoring.date','monitoring.observed','monitoring.affected','monitoring.individuals','monitoring.recorded_incidence','monitoring.severity','monitoring.gravity','monitoring.flowering_sin_flor','monitoring.flowering_brotes','monitoring.flowering_flor_madura','monitoring.flowering_cuaje'] as const){
          const field=DEFINITIONS[metric].field,valid=metric==='monitoring.date'||metric==='monitoring.gravity'?true:metric==='monitoring.recorded_incidence'?validezMonitoreo(row,'incidencia'):metric==='monitoring.severity'?validezMonitoreo(row,'severidad'):metric==='monitoring.affected'?validezMonitoreo(row,'arboles_afectados'):cantidadCultivo(row,field,true)!==null;
          facts.push(b.record(scope,p,row,metric,es,valid));
        }
      }
      return facts;
    },frame.details&&rows.length>LIMITES_CULTIVOS.monitoringDetails?['budget_exceeded']:[]);
  }
  if(frames.length>LIMITES_CULTIVOS.groups)b.omitted();return b.result;
}

async function cosechaCultivos(args:FilaCultivo,ctx:ContextoNucleo,port:PuertoNucleo):Promise<ResultadoNucleo> {
  const bounds=tiempo(ctx),b=new ConstructorCultivos(ctx,100);
  const [read,lotRead,subRead]=await Promise.all([leerCultivo(port,'cosechas',PROYECCIONES_CULTIVOS.cosechas,fechasConsulta(bounds,'fecha_cosecha')),leerCultivo(port,'lotes','id,nombre'),leerCultivo(port,'sublotes','id,nombre,lote_id')]);
  b.auxReads=[lotRead,subRead];const lots=catalogo(lotRead),subs=catalogo(subRead);validarLugar(read.rows,lots,subs);validarFechas(read.rows,bounds,'fecha_cosecha');
  const selection=seleccionCultivo(lots,undefined,ctx,'lote_id'),rows=read.rows.filter(r=>selection.ids===null||selection.ids.has(String(r.lote_id).toLowerCase()));
  // client_name intentionally does not filter the independent harvest population.
  const frames:Array<{rows:FilaCultivo[];filters:Scope['filters'];entities:Entity[];label:string;details?:boolean}>=[{rows,filters:selection.filters,entities:[],label:'Cosechas registradas (independientes del filtro de cliente)',details:true}];
  for(const[lot,rs]of grupos(rows,r=>String(r.lote_id)))frames.push({rows:rs,filters:{...selection.filters,lote_id:lot},entities:[b.label('lot',lot,nombreCatalogo(lots,lot))],label:'Kilos cosechados por lote'});
  for(const[mes,rs]of grupos(rows.filter(r=>fechaValida(r.fecha_cosecha)),r=>String(r.fecha_cosecha).slice(0,7)))frames.push({rows:rs,filters:{...selection.filters,mes},entities:[],label:'Cosechas del mes '+mes});
  for(const frame of frames.slice(0,LIMITES_CULTIVOS.groups)){
    const scope=b.scope('harvest.records',frame.filters,frame.entities);
    b.add(scope,read,frame.rows,frame.label,p=>{
      const facts=[b.countFact(scope,p,'harvest.count'),b.total(scope,p,frame.rows,'harvest.kg'),b.total(scope,p,frame.rows,'harvest.baskets',true)];
      if(frame.details)for(const row of frame.rows.slice(0,LIMITES_CULTIVOS.details)){const es=referenciasFila(b,row,lots,subs,'harvest');facts.push(b.record(scope,p,row,'harvest.date',es),b.record(scope,p,row,'harvest.kg',es,cantidadCultivo(row,'kilos_cosechados')!==null),b.record(scope,p,row,'harvest.baskets',es,cantidadCultivo(row,'numero_canastillas',true)!==null));}
      return facts;
    },frame.details&&rows.length>LIMITES_CULTIVOS.details?['budget_exceeded']:[]);
  }
  if(frames.length>LIMITES_CULTIVOS.groups)b.omitted();return b.result;
}
async function despachoCultivos(args:FilaCultivo,ctx:ContextoNucleo,port:PuertoNucleo):Promise<ResultadoNucleo> {
  const bounds=tiempo(ctx),clientFilter=filtroNombre(args,'client_name',ctx),b=new ConstructorCultivos(ctx,100);
  if(clientFilter!==undefined&&!ctx.identities.client)throw Error('outside_scope');
  const labelsAllowed=(ctx as ContextoNucleo&{identityLabels?:{client?:boolean}}).identityLabels?.client??ctx.identities.client;
  if(clientFilter!==undefined&&!labelsAllowed)throw Error('scope_ambiguous');
  const projection=PROYECCIONES_CULTIVOS.despachos+(ctx.identities.client?',cliente_id':'');
  b.sourceFields=projection.split(',');
  const read=await leerCultivo(port,'despachos',projection,fechasConsulta(bounds,'fecha_despacho'));validarFechas(read.rows,bounds,'fecha_despacho');
  const clients:Map<string,FilaCultivo>=new Map();
  if(ctx.identities.client){
    if(read.rows.some(r=>!uuidCultivo(r.cliente_id)))throw Error('source_error');
    // A client name is a requested business dimension, never an incidental person field.
    if(labelsAllowed||clientFilter!==undefined){
      const ids=[...new Set(read.rows.map(r=>String(r.cliente_id).toLowerCase()))];
      for(let offset=0;offset<ids.length;offset+=100){
        const batch=ids.slice(offset,offset+100),clientsRead=await leerCultivo(port,'clientes','id,nombre','&id=in.('+batch.join(',')+')');
        if(clientsRead.rows.some(r=>!batch.includes(String(r.id).toLowerCase())))throw Error('outside_scope');
        b.auxReads.push(clientsRead);for(const[id,row]of catalogo(clientsRead))clients.set(id,row);
      }
      if(read.rows.some(r=>!clients.has(String(r.cliente_id).toLowerCase())))throw Error('source_error');
    }
  }
  // Without names permission a text name filter cannot be resolved by reading names.
  if(clientFilter!==undefined&&!labelsAllowed)throw Error('scope_ambiguous');
  const selection=seleccionCultivo(clients,clientFilter,ctx,'cliente_id'),clientIds=selection.ids,rows=read.rows.filter(r=>clientIds===null||clientIds.has(String(r.cliente_id).toLowerCase()));
  const filters={...baseFiltros(args),...selection.filters},frames:Array<{rows:FilaCultivo[];filters:Scope['filters'];entities:Entity[];label:string;details?:boolean}>=[{rows,filters,entities:[],label:'Despachos registrados (no recepción ni cobro)',details:true}];
  if(ctx.identities.client)for(const[client,rs]of grupos(rows,r=>String(r.cliente_id)))frames.push({rows:rs,filters:{...filters,cliente_id:client},entities:[b.label('client',client,labelsAllowed?nombreCatalogo(clients,client):client)],label:'Despachos por cliente registrado'});
  for(const[mes,rs]of grupos(rows.filter(r=>fechaValida(r.fecha_despacho)),r=>String(r.fecha_despacho).slice(0,7)))frames.push({rows:rs,filters:{...filters,mes},entities:[],label:'Despachos del mes '+mes});
  for(const frame of frames.slice(0,LIMITES_CULTIVOS.groups)){
    const scope=b.scope('shipment.records',frame.filters,frame.entities);
    b.add(scope,read,frame.rows,frame.label,p=>{
      const facts=[b.countFact(scope,p,'shipment.count'),b.total(scope,p,frame.rows,'shipment.kg'),b.total(scope,p,frame.rows,'shipment.value',false,true)];
      if(frame.details)for(const row of frame.rows.slice(0,LIMITES_CULTIVOS.details)){
        const es:Fact['entities']=[{kind:'shipment',id:String(row.id)}];b.label('shipment',String(row.id),String(row.id));
        if(ctx.identities.client)es.push({kind:'client',id:String(row.cliente_id)});
        for(const metric of ['shipment.date','shipment.kg','shipment.price','shipment.value'] as const)facts.push(b.record(scope,p,row,metric,es,metric==='shipment.kg'?cantidadCultivo(row,'kilos_despachados')!==null:true));
      }
      return facts;
    },frame.details&&rows.length>LIMITES_CULTIVOS.details?['budget_exceeded']:[]);
  }
  if(frames.length>LIMITES_CULTIVOS.groups)b.omitted();return b.result;
}
function falloCultivo(op:Scope['operation'],metrics:Metric[],label:string,error:unknown):ResultadoNucleo {
  const code=error instanceof Error&&['invalid_value','outside_scope','scope_ambiguous','unsupported_operation','duplicate_identity','budget_exceeded'].includes(error.message)?error.message:'source_error';
  return parteNoVerificable({id:'crops:unavailable:'+op,operation:op,entities:[],period:null,filters:{}},metrics,label,code);
}
/** Existing four operations only. Gates, user intent and both channel loops stay outside.
 * The injected port attests complete reads; every exact partition is checked against
 * those unchanged source rows before creating its population proof. No environment,
 * personnel read, observations, document field, provider call or write exists here.
 */
export async function ejecutarNucleoCultivos(tool:string,args:FilaCultivo,ctx:ContextoNucleo,port:PuertoNucleo):Promise<ResultadoNucleo> {
  if(!['get_produccion_calidad','get_production_data','get_monitoring_data','get_harvest_shipments'].includes(tool))throw Error('unsupported_operation');
  if(ctx.referencePending)return falloCultivo(operation(tool),metricas(tool),'Referencia anterior no vinculada; repite el selector y período',Error('scope_ambiguous'));
  const allowed=tool==='get_production_data'?['year','cosecha_tipo','lote_name']:tool==='get_produccion_calidad'?['year','cosecha_tipo','lote_name','detalle_offset']:tool==='get_monitoring_data'?['date_from','date_to','lote_name','pest_name']:['date_from','date_to','client_name'];
  try {
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed.includes(k)))throw Error('outside_scope');
    if(typeof ctx.currentUserText!=='string'||!ctx.currentUserText.trim()||ctx.currentUserText.length>16000||!fechaValida(ctx.referenceDay))throw Error('scope_ambiguous');
    if(args.detalle_offset!==undefined&&(!Number.isSafeInteger(args.detalle_offset)||Number(args.detalle_offset)<0))throw Error('invalid_value');
    for(const key of ['date_from','date_to'])if(args[key]!==undefined&&typeof args[key]!=='string')throw Error('invalid_value');
    if(['get_monitoring_data','get_harvest_shipments'].includes(tool)&&ctx.dateState==='absent'&&(args.date_from!==undefined||args.date_to!==undefined))throw Error('scope_ambiguous');
    if(['get_production_data','get_produccion_calidad'].includes(tool))return await produccionCultivos(tool,args,ctx,port);
    if(tool==='get_monitoring_data')return await monitoreoCultivos(args,ctx,port);
    // Independent source failures must not erase the other supported part.
    const reads=await Promise.allSettled([cosechaCultivos(args,ctx,port),despachoCultivos(args,ctx,port)]);
    return unirNucleo(reads.map((r,i)=>r.status==='fulfilled'?r.value:falloCultivo(i?'shipment.records':'harvest.records',i?despachoMetricas:cosechaMetricas,i?'Despachos no verificables':'Cosechas no verificables',r.reason)));
  } catch(error){return tool==='get_harvest_shipments'?unirNucleo([falloCultivo('harvest.records',cosechaMetricas,'Cosechas no verificables',error),falloCultivo('shipment.records',despachoMetricas,'Despachos no verificables',error)]):falloCultivo(operation(tool),metricas(tool),tool==='get_monitoring_data'?'Monitoreo no verificable':'Producción no verificable',error);}
}
