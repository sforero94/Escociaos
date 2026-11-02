import { afterEach, describe, expect, it, vi } from 'vitest';
import { ejecutarNucleoCultivos, PROYECCIONES_CULTIVOS } from '../utils/escoNucleoCultivos';
import { componerRespuestaVerificada } from '../utils/escoRespuesta';
import { validarEvidencia, type Fact, type Metric } from '../utils/escoEvidencia';
import { type ContextoNucleo, type LecturaNucleo, type PuertoNucleo, type ResultadoNucleo } from '../utils/escoNucleoComun';
const id = (n:number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const NOW='2034-05-08T12:00:00Z';
const context=(question='Producción registrada'):ContextoNucleo=>({currentUserText:question,referenceDay:'2034-05-08',startedAt:NOW,period:null,dateState:'absent',identities:{client:false,supplier:false}});
const period=(question='Monitoreo del 2034-05-01 al 2034-05-07'):ContextoNucleo=>({...context(question),period:{from:'2034-05-01',to:'2034-05-07'},dateState:'resolved'});
type Row=Record<string,unknown>;
function fixtures():Record<string,Row[]> {
  const prod=(n:number,lot:number,sub:number|null,year:number,kg:string,trees:number,ratio:string,exp:string|null,nat:string|null)=>({id:id(n),lote_id:id(lot),sublote_id:sub===null?null:id(sub),ano:year,cosecha_tipo:year===2034?'Principal':'Traviesa',kg_totales:kg,arboles_registrados:trees,kg_por_arbol:ratio,kg_exportacion:exp,kg_nacional:nat});
  const monitor=(n:number,lot:number,sub:number,pest:number,when:string,observed:number,affected:number,individuals:number,incidence:string,severity:string,flowers:number[])=>({id:id(n),lote_id:id(lot),sublote_id:id(sub),plaga_enfermedad_id:id(pest),ronda_id:id(900),fecha_monitoreo:when,arboles_monitoreados:observed,arboles_afectados:affected,individuos_encontrados:individuals,incidencia:incidence,severidad:severity,gravedad_texto:affected/observed>=0.3?'Alta':'Media',floracion_sin_flor:flowers[0],floracion_brotes:flowers[1],floracion_flor_madura:flowers[2],floracion_cuaje:flowers[3]});
  return {
    lotes:[{id:id(1),nombre:'Lote Claro'},{id:id(2),nombre:'Lote Sur'}],
    sublotes:[{id:id(11),nombre:'Sublote Claro',lote_id:id(1)},{id:id(22),nombre:'Sublote Sur',lote_id:id(2)}],
    plagas_enfermedades_catalogo:[{id:id(71),nombre:'Plaga Alfa'},{id:id(72),nombre:'Plaga Beta'}],
    clientes:[{id:id(81),nombre:'Exportador Uno'},{id:id(82),nombre:'Exportador Dos'}],
    produccion:[prod(101,1,null,2034,'100',10,'10','70','30'),prod(102,1,11,2034,'60',6,'10',null,null),prod(103,2,22,2034,'30',30,'1','0','30'),prod(104,2,22,2033,'45',15,'3',null,null)],
    monitoreos:[monitor(201,1,11,71,'2034-05-01',10,1,2,'10','2',[3,2,4,1]),monitor(202,1,11,72,'2034-05-01',10,4,12,'40','3',[3,2,4,1]),monitor(203,2,22,71,'2034-05-02',100,10,5,'10','0.5',[50,10,30,10])],
    cosechas:[{id:id(301),lote_id:id(1),sublote_id:id(11),fecha_cosecha:'2034-05-01',kilos_cosechados:'10.1',numero_canastillas:2},{id:id(302),lote_id:id(2),sublote_id:null,fecha_cosecha:'2034-05-02',kilos_cosechados:'20.2',numero_canastillas:null}],
    despachos:[{id:id(401),cliente_id:id(81),fecha_despacho:'2034-05-02',kilos_despachados:'8.1',precio_por_kilo:'100',valor_total:'810'},{id:id(402),cliente_id:id(82),fecha_despacho:'2034-05-04',kilos_despachados:'12.2',precio_por_kilo:'200',valor_total:'2440'}],
  };
}
interface Options {fail?:string;incomplete?:string;stale?:string;extras?:boolean;ignoreFilters?:boolean}
function source(db=fixtures(),options:Options={}) {
  const calls:Array<{table:string;query:string}>=[];
  const port:PuertoNucleo={now:()=>NOW,read:async(table,query,identityKeys=['id'])=>{
    calls.push({table,query});
    if(!(table in db))throw Error('Unlisted synthetic table');
    if(options.fail===table)throw Error('PRIVATE_SOURCE_ERROR');
    const p=new URLSearchParams(query),columns=(p.get('select')??'').split(',');
    if(columns.some(c=>!/^[_a-z]+$/.test(c)))throw Error('Unlisted synthetic projection');
    let rows=db[table];
    if(!options.ignoreFilters)for(const[key,filter]of p){if(key==='select')continue;const dot=filter.indexOf('.'),op=filter.slice(0,dot),value=filter.slice(dot+1);if(!['eq','gte','lte','in'].includes(op))throw Error('Unlisted synthetic filter');rows=rows.filter(r=>r[key]!=null&&(op==='eq'?String(r[key])===value:op==='in'?value.slice(1,-1).split(',').includes(String(r[key])):op==='gte'?String(r[key])>=value:String(r[key])<=value));}
    const projected=rows.map(r=>({...Object.fromEntries(columns.map(c=>[c,r[c]])),...(options.extras?{monitor:'PRIVATE_NAME',responsables:'PRIVATE_WORKER',observaciones:'PRIVATE_NOTE',salario:'PRIVATE_SALARY',numero_factura:'PRIVATE_DOC',cliente:{nombre:'PRIVATE_CLIENT'}}:{})}));
    return {rows:projected,total:projected.length,capturedAt:options.stale===table?'2034-05-08T11:59:59Z':NOW,identityKeys,complete:options.incomplete!==table,identityUnique:true,consistency:'stable_count_pages'} as LecturaNucleo;
  }};
  return {port,calls};
}
const facts=(r:ResultadoNucleo)=>r.evidence.flatMap(e=>e.facts);
const totals=(r:ResultadoNucleo,m:Metric)=>facts(r).filter(f=>f.metric===m&&f.entities.length===0);
const decimal=(f:Fact|undefined)=>f?.value.kind==='decimal'?f.value.value:null;
function checked(r:ResultadoNucleo){expect(r.evidence.every(e=>validarEvidencia(e,r.scopes,r.populations))).toBe(true);return r;}
function answer(r:ResultadoNucleo){return componerRespuestaVerificada({...r,turnStartedAt:NOW,modelText:'PRIVATE_MODEL_FALSE_FACT'});}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('registered crop production and quality',()=>{
  it.each(['get_production_data','get_produccion_calidad'])('keeps the production alias canonical and whole-lot preference for %s',async tool=>{
    const s=source(),r=checked(await ejecutarNucleoCultivos(tool,{year:2034},context('Producción y calidad de 2034'),s.port));
    expect(decimal(totals(r,'production.count')[0])).toBe('3');expect(decimal(totals(r,'production.kg')[0])).toBe('130');
    expect(r.populations.every(p=>p.tool==='get_production_data')).toBe(true);
    expect(r.scopes.every(s=>s.period===null)).toBe(true);expect(answer(r).text).not.toContain('PRIVATE_MODEL_FALSE_FACT');
  });
  it('keeps registered tree denominators and unweighted means distinct from consolidated yield',async()=>{
    const r=checked(await ejecutarNucleoCultivos('get_production_data',{year:2034},context('Producción de 2034'),source().port));
    expect(decimal(totals(r,'production.trees')[0])).toBe('40');expect(decimal(totals(r,'production.kg_per_tree')[0])).toBe('3.25');
    expect(decimal(totals(r,'production.mean_recorded_kg_per_tree')[0])).toBe('7');
    expect(facts(r).some(f=>f.metric==='production.recorded_kg_per_tree'&&decimal(f)==='1')).toBe(true);
  });
  it('retains the unweighted annual means when no year filter is requested',async()=>{
    const r=checked(await ejecutarNucleoCultivos('get_production_data',{},context(),source().port));
    expect(r.scopes.filter(s=>s.filters.grain==='registros'&&s.filters.ano).map(s=>s.filters.ano).sort()).toEqual(['2033','2034']);
    expect(decimal(totals(r,'production.kg')[0])).toBe('175');
  });
  it('keeps export zero known, missing breakdown unknown, never fills national from total',async()=>{
    const db=fixtures();db.produccion[0].kg_exportacion=null;
    const r=checked(await ejecutarNucleoCultivos('get_produccion_calidad',{year:2034},context('Calidad de 2034'),source(db).port));
    const exp=totals(r,'production.export_kg')[0];expect(exp.assertion).toBe('verified_subtotal');expect(decimal(exp)).toBe('0');
    expect(totals(r,'production.export_pct')[0].value.kind).toBe('unknown');expect(decimal(totals(r,'production.kg')[0])).toBe('130');
    expect(facts(r).some(f=>f.metric==='production.export_kg'&&f.value.kind==='unknown')).toBe(true);
  });
  it('keeps source total while rejecting inconsistent recorded breakdown',async()=>{
    const db=fixtures();db.produccion[0].kg_exportacion='95';
    const r=checked(await ejecutarNucleoCultivos('get_produccion_calidad',{year:2034},context('Calidad de 2034'),source(db).port));
    expect(decimal(totals(r,'production.kg')[0])).toBe('130');expect(totals(r,'production.export_pct')[0].value.kind).toBe('unknown');
  });
  it.each([null,0,'0',-1,'2.5'])('does not invent a yield with invalid registered trees %s',async trees=>{
    const db=fixtures();db.produccion=[{...db.produccion[0],arboles_registrados:trees}];
    const r=checked(await ejecutarNucleoCultivos('get_production_data',{year:2034},context('Producción de 2034'),source(db).port));
    expect(totals(r,'production.kg_per_tree')[0].value.kind).toBe('unknown');expect(decimal(totals(r,'production.kg')[0])).toBe('100');
  });
  it.each([2034,2030])('binds relative annual source scope from the server year, not model year %s',async modelYear=>{
    const ctx:ContextoNucleo={...context('Producción de este año'),period:{from:'2034-01-01',to:'2034-05-08'},dateState:'resolved'};const s=source();
    const r=checked(await ejecutarNucleoCultivos('get_production_data',{year:modelYear},ctx,s.port));expect(decimal(totals(r,'production.kg')[0])).toBe('130');
    expect(s.calls.find(c=>c.table==='produccion')!.query).toContain('ano=eq.2034');expect(r.parts.some(p=>p.label.includes('año 2034'))).toBe(true);
  });
  it('filters by the current literal lot/year/season and ignores homonymous labels as identity keys',async()=>{
    const db=fixtures();db.lotes[1].nombre='Lote Claro';const s=source(db);
    const r=checked(await ejecutarNucleoCultivos('get_production_data',{year:2034,cosecha_tipo:'principal',lote_name:'Claro'},context('Producción Principal 2034 del lote Claro'),s.port));
    expect(decimal(totals(r,'production.kg')[0])).toBe('130');
    expect(facts(r).filter(f=>f.metric==='production.kg'&&f.entities.length===1).map(f=>f.entities[0].id).sort()).toEqual([id(1),id(2)]);
    expect(s.calls.find(c=>c.table==='produccion')!.query).toContain('cosecha_tipo=eq.Principal');
  });
  it.each([{year:2035},{year:'2034'},{year:1900},{cosecha_tipo:'Otra'},{lote_name:'Inventado'},{date_from:'2034-01-01'}])('rejects invented/malformed production filters before source: %j',async args=>{
    const s=source(),r=await ejecutarNucleoCultivos('get_production_data',args,context('Producción de 2034'),s.port);expect(s.calls).toEqual([]);expect(facts(r)).toEqual([]);
  });
  it('rejects daily windows on annual production instead of silently substituting the year',async()=>{
    const s=source();const r=await ejecutarNucleoCultivos('get_production_data',{},period('Producción de mayo de 2034'),s.port);expect(s.calls).toEqual([]);expect(r.evidence[0].issues[0].code).toBe('unsupported_operation');
  });
  it('preserves exact decimal totals and true empty population zero, with unknown ratios',async()=>{
    const db=fixtures();db.produccion=[{...db.produccion[0],kg_totales:'9007199254740993.25',kg_exportacion:null,kg_nacional:null},{...db.produccion[2],kg_totales:'0.75',kg_exportacion:null,kg_nacional:null}];
    const r=checked(await ejecutarNucleoCultivos('get_production_data',{year:2034},context('Producción de 2034'),source(db).port));expect(decimal(totals(r,'production.kg')[0])).toBe('9007199254740994');
    const empty=fixtures();empty.produccion=[];const e=checked(await ejecutarNucleoCultivos('get_production_data',{},context(),source(empty).port));expect(decimal(totals(e,'production.count')[0])).toBe('0');expect(decimal(totals(e,'production.kg')[0])).toBe('0');expect(totals(e,'production.kg_per_tree')[0].value.kind).toBe('unknown');
  });
  it('does not choose duplicate business grain or a conflicting source identity',async()=>{
    for(const duplicate of [{...fixtures().produccion[0],id:id(999)},{...fixtures().produccion[0]}]){const db=fixtures();db.produccion.push(duplicate);const r=await ejecutarNucleoCultivos('get_production_data',{},context(),source(db).port);expect(facts(r)).toEqual([]);}
  });
});
describe('recorded monitoring, weighted samples and flowering',()=>{
  it('uses weighted incidence and source severity units, never a mean of percentages',async()=>{
    const r=checked(await ejecutarNucleoCultivos('get_monitoring_data',{},period(),source().port));
    expect(decimal(totals(r,'monitoring.observed')[0])).toBe('120');expect(decimal(totals(r,'monitoring.affected')[0])).toBe('15');expect(decimal(totals(r,'monitoring.incidence')[0])).toBe('12.5');
    expect(facts(r).filter(f=>f.metric==='monitoring.severity'&&f.value.kind==='decimal').map(f=>f.value.kind==='decimal'?f.value.unit:'')).toEqual(['individuo/arbol_afectado','individuo/arbol_afectado','individuo/arbol_afectado']);
    expect(totals(r,'monitoring.gravity')[0].value).toEqual({kind:'status',value:'Alta'});
  });
  it('preserves finite scientific-notation source densities as canonical decimals',async()=>{
    const db=fixtures();db.monitoreos=[{...db.monitoreos[0],arboles_monitoreados:100000000,arboles_afectados:10000000,individuos_encontrados:1,severidad:1e-7}];
    const r=checked(await ejecutarNucleoCultivos('get_monitoring_data',{},period(),source(db).port));expect(facts(r).find(f=>f.metric==='monitoring.severity')?.value).toEqual({kind:'decimal',value:'0.0000001',unit:'individuo/arbol_afectado'});
  });
  it('deduplicates pest rows per flowering event, without merging different lot identities',async()=>{
    const r=checked(await ejecutarNucleoCultivos('get_monitoring_data',{},period(),source().port));
    expect(decimal(totals(r,'monitoring.flowering_observed')[0])).toBe('110');expect(decimal(totals(r,'monitoring.flowering_sin_flor')[0])).toBe('53');
    expect(decimal(totals(r,'monitoring.flowering_cuaje')[0])).toBe('11');
  });
  it('keeps observed incidence useful when flowering or severity is unavailable',async()=>{
    const db=fixtures();db.monitoreos[0].floracion_brotes=null;db.monitoreos[2].severidad=null;
    const r=checked(await ejecutarNucleoCultivos('get_monitoring_data',{},period(),source(db).port));
    expect(decimal(totals(r,'monitoring.incidence')[0])).toBe('12.5');expect(totals(r,'monitoring.flowering_brotes')[0].assertion).toBe('verified_subtotal');
    expect(facts(r).some(f=>f.metric==='monitoring.severity'&&f.value.kind==='unknown')).toBe(true);
  });
  it('does not certify a maximum gravity when one source observation has no gravity',async()=>{
    const db=fixtures();db.monitoreos[0].gravedad_texto=null;const r=checked(await ejecutarNucleoCultivos('get_monitoring_data',{},period(),source(db).port));
    expect(totals(r,'monitoring.gravity')[0].value.kind).toBe('unknown');expect(decimal(totals(r,'monitoring.incidence')[0])).toBe('12.5');
  });
  it('retains compound month/pest and month/lot membership without merging dimensions',async()=>{
    const r=checked(await ejecutarNucleoCultivos('get_monitoring_data',{},period(),source().port));
    const scope=r.scopes.find(s=>s.filters.mes==='2034-05'&&s.filters.plaga_enfermedad_id===id(71));expect(scope).toBeDefined();
    expect(decimal(facts(r).find(f=>f.scopeId===scope!.id&&f.metric==='monitoring.count'))).toBe('2');
    expect(r.scopes.filter(s=>s.filters.mes==='2034-05'&&s.filters.lote_id).map(s=>s.filters.lote_id).sort()).toEqual([id(1),id(2)]);
  });
  it('binds lot/pest filters to user literals and canonical source IDs',async()=>{
    const s=source(),r=checked(await ejecutarNucleoCultivos('get_monitoring_data',{lote_name:'Claro',pest_name:'Alfa'},period('Monitoreo de Alfa del lote Claro del 2034-05-01 al 2034-05-07'),s.port));
    expect(decimal(totals(r,'monitoring.count')[0])).toBe('1');expect(decimal(totals(r,'monitoring.incidence')[0])).toBe('10');
    expect(facts(r).filter(f=>f.entities.some(e=>e.kind==='pest')).every(f=>f.entities.find(e=>e.kind==='pest')!.id===id(71))).toBe(true);
  });
  it.each([null,0,-1])('does not invent zero incidence for an invalid denominator %s',async denominator=>{
    const db=fixtures();db.monitoreos=[{...db.monitoreos[0],arboles_monitoreados:denominator}];
    const r=checked(await ejecutarNucleoCultivos('get_monitoring_data',{},period(),source(db).port));expect(totals(r,'monitoring.incidence')[0].value.kind).toBe('unknown');
  });
  it('retains dated record details and a complete count independent of missing numbers',async()=>{
    const db=fixtures();db.monitoreos[0].arboles_afectados=null;const r=checked(await ejecutarNucleoCultivos('get_monitoring_data',{},period(),source(db).port));
    expect(decimal(totals(r,'monitoring.count')[0])).toBe('3');expect(facts(r).filter(f=>f.metric==='monitoring.date'&&f.value.kind==='date')).toHaveLength(3);
    expect(totals(r,'monitoring.incidence')[0].value.kind).toBe('unknown');
  });
});
describe('independent harvest/shipment populations and requested business clients',()=>{
  it('keeps harvest, shipment, baskets and registered money separate',async()=>{
    const r=checked(await ejecutarNucleoCultivos('get_harvest_shipments',{},period('Cosechas y despachos del 2034-05-01 al 2034-05-07'),source().port));
    expect(decimal(totals(r,'harvest.kg')[0])).toBe('30.3');expect(decimal(totals(r,'shipment.kg')[0])).toBe('20.3');expect(decimal(totals(r,'shipment.value')[0])).toBe('3250');
    expect(totals(r,'harvest.baskets')[0]).toMatchObject({assertion:'verified_subtotal',value:{value:'2'}});
    expect(r.scopes.some(s=>s.period?.basis==='actual'&&s.period.fieldMeaning==='fecha_cosecha')).toBe(true);expect(r.scopes.some(s=>s.period?.basis==='recorded_at'&&s.period.fieldMeaning==='fecha_despacho')).toBe(true);
  });
  it('applies a client filter only to shipments and preserves client identity when explicitly asked',async()=>{
    const ctx=period('Cosechas y despachos a Exportador Uno del 2034-05-01 al 2034-05-07');ctx.identities.client=true;const s=source(),r=checked(await ejecutarNucleoCultivos('get_harvest_shipments',{client_name:'Exportador Uno'},ctx,s.port));
    expect(decimal(totals(r,'harvest.kg')[0])).toBe('30.3');expect(decimal(totals(r,'shipment.kg')[0])).toBe('8.1');expect(JSON.stringify(r)).toContain('Exportador Uno');expect(JSON.stringify(r)).not.toContain('Exportador Dos');
    const lookup=new URLSearchParams(s.calls.find(c=>c.table==='clientes')!.query);expect(lookup.get('select')).toBe('id,nombre');expect(lookup.get('id')).toBe('in.('+[id(81),id(82)].join(',')+')');
  });
  it('groups by client IDs without querying or retaining names when labels are excluded',async()=>{
    const ctx:ContextoNucleo&{identityLabels?:{client:boolean}}=period('Despachos por cliente sin nombres');ctx.identities.client=true;ctx.identityLabels={client:false,supplier:false};const s=source(),r=checked(await ejecutarNucleoCultivos('get_harvest_shipments',{},ctx,s.port));
    expect(s.calls.some(c=>c.table==='clientes')).toBe(false);expect(r.scopes.some(s=>s.entities.some(e=>e.kind==='client'&&e.id===id(81)))).toBe(true);expect(JSON.stringify(r)).not.toContain('Exportador');
  });
  it('never resolves a text client filter by reading names when names are explicitly excluded',async()=>{
    const ctx:ContextoNucleo&{identityLabels?:{client:boolean}}=period('Despachos a Exportador Uno sin nombres');ctx.identities.client=true;ctx.identityLabels={client:false,supplier:false};const s=source();
    const r=await ejecutarNucleoCultivos('get_harvest_shipments',{client_name:'Exportador Uno'},ctx,s.port);expect(s.calls.some(c=>c.table==='clientes'||c.table==='despachos')).toBe(false);expect(decimal(totals(r,'harvest.kg')[0])).toBe('30.3');
  });
  it('reads names only for clients referenced by the requested shipment period, not the full roster',async()=>{
    const db=fixtures();db.clientes.push({id:id(899),nombre:'PRIVATE_UNUSED_CLIENT'});const ctx=period('Despachos por cliente');ctx.identities.client=true;const s=source(db);
    const r=checked(await ejecutarNucleoCultivos('get_harvest_shipments',{},ctx,s.port));expect(s.calls.filter(c=>c.table==='clientes').every(c=>c.query.includes('id=in.(')&&!c.query.includes(id(899)))).toBe(true);expect(JSON.stringify(r)).not.toContain('PRIVATE_UNUSED_CLIENT');
  });
  it('keeps homonymous client groups separate and visibly namespaced by canonical ID',async()=>{
    const db=fixtures();db.clientes[1].nombre=db.clientes[0].nombre;const ctx=period('Despachos por cliente');ctx.identities.client=true;
    const r=checked(await ejecutarNucleoCultivos('get_harvest_shipments',{},ctx,source(db).port));
    expect(r.labels['client:'+id(81)]).toContain(id(81));expect(r.labels['client:'+id(82)]).toContain(id(82));
  });
  it('does not convert foreign units or fractional basket counts into canonical totals',async()=>{
    const db=fixtures();db.cosechas[0].numero_canastillas='2.5';db.despachos[0].kilos_despachados='1 lb';const r=checked(await ejecutarNucleoCultivos('get_harvest_shipments',{},period(),source(db).port));
    expect(totals(r,'harvest.baskets')[0].value.kind).toBe('unknown');expect(totals(r,'shipment.kg')[0]).toMatchObject({assertion:'verified_subtotal',value:{value:'12.2',unit:'kg'}});
  });
  it('does not query clients at all when the purpose does not request their identities',async()=>{
    const s=source(),r=checked(await ejecutarNucleoCultivos('get_harvest_shipments',{},period(),s.port));expect(s.calls.some(c=>c.table==='clientes')).toBe(false);expect(s.calls.find(c=>c.table==='despachos')!.query).not.toContain('cliente_id');expect(JSON.stringify(r)).not.toContain('Exportador');
  });
  it('never recalculates missing shipment value from kilos times price or claims receipt/payment',async()=>{
    const db=fixtures();db.despachos[0].valor_total=null;const r=checked(await ejecutarNucleoCultivos('get_harvest_shipments',{},period(),source(db).port));
    expect(totals(r,'shipment.value')[0]).toMatchObject({assertion:'verified_subtotal',value:{value:'2440'}});expect(facts(r).some(f=>f.metric==='shipment.price'&&decimal(f)==='100')).toBe(true);
    expect(answer(r).text).not.toMatch(/cobrado|recibido por el cliente|conciliaci[oó]n completa/);
  });
  it.each(['cosechas','despachos'])('preserves the independent useful part after a source failure: %s',async fail=>{
    const r=await ejecutarNucleoCultivos('get_harvest_shipments',{},period(),source(fixtures(),{fail}).port);expect(facts(r).some(f=>f.metric===(fail==='cosechas'?'shipment.kg':'harvest.kg')&&f.value.kind==='decimal')).toBe(true);expect(r.evidence.some(e=>e.state==='error')).toBe(true);expect(JSON.stringify(r)).not.toContain('PRIVATE_SOURCE_ERROR');
  });
  it('does not let a forged client filter remove the supported independent harvest totals',async()=>{
    const s=source(),r=await ejecutarNucleoCultivos('get_harvest_shipments',{client_name:'Invented Client'},period('Cosechas y despachos'),s.port);expect(decimal(totals(r,'harvest.kg')[0])).toBe('30.3');expect(s.calls.some(c=>c.table==='clientes')).toBe(false);expect(facts(r).some(f=>f.metric==='shipment.kg')).toBe(false);
  });
});
describe('source, scope and minimized output invariants for all selected crop paths',()=>{
  it.each(['get_monitoring_data','get_harvest_shipments'])('binds dates to current server scope, not model dates: %s',async tool=>{
    const s=source();const r=checked(await ejecutarNucleoCultivos(tool,{date_from:'2030-01-01',date_to:'2030-01-02'},period(),s.port));expect(facts(r).length).toBeGreaterThan(0);const timed=s.calls.filter(c=>['monitoreos','cosechas','despachos'].includes(c.table));expect(timed.every(c=>c.query.includes('gte.2034-05-01')&&c.query.includes('lte.2034-05-07')&&!c.query.includes('2030'))).toBe(true);
  });
  it.each(['get_monitoring_data','get_harvest_shipments'])('does not accept invented model dates when current scope is all history: %s',async tool=>{
    const s=source(),r=await ejecutarNucleoCultivos(tool,{date_from:'2030-01-01'},context('Registros sin filtro temporal'),s.port);expect(s.calls).toEqual([]);expect(facts(r)).toEqual([]);
  });
  it('rejects inconsistent period/open-bound metadata instead of broadening it',async()=>{
    const s=source();const ctx={...period(),dateState:'open' as const,bounds:{from:'2034-05-01'}};expect(facts(await ejecutarNucleoCultivos('get_monitoring_data',{},ctx,s.port))).toEqual([]);expect(s.calls).toEqual([]);
  });
  it.each(['get_monitoring_data','get_harvest_shipments'])('keeps one-sided/open filters without inventing a closed period: %s',async tool=>{
    const ctx={...context('Registros desde 2034-05-02'),dateState:'open' as const,bounds:{from:'2034-05-02'}};const s=source(),r=checked(await ejecutarNucleoCultivos(tool,{},ctx,s.port));expect(r.scopes.every(s=>s.period===null&&s.filters.date_from==='2034-05-02')).toBe(true);expect(s.calls.filter(c=>['monitoreos','cosechas','despachos'].includes(c.table)).every(c=>c.query.includes('gte.2034-05-02')&&!c.query.includes('=lte.'))).toBe(true);
  });
  it.each(['ambiguous','invalid'] as const)('does not read business data for an unresolved requested period %s',async dateState=>{
    for(const tool of ['get_monitoring_data','get_harvest_shipments']){const s=source(),r=await ejecutarNucleoCultivos(tool,{}, {...period(),dateState},s.port);expect(s.calls).toEqual([]);expect(facts(r)).toEqual([]);}
  });
  it.each(['get_production_data','get_produccion_calidad','get_monitoring_data','get_harvest_shipments'])('does not leak extra response fields into direct or fallback evidence: %s',async tool=>{
    const s=source(fixtures(),{extras:true}),r=checked(await ejecutarNucleoCultivos(tool,{},tool.includes('production')||tool==='get_produccion_calidad'?context():period(),s.port));
    expect(JSON.stringify([r,answer(r)])).not.toContain('PRIVATE_');
    expect(JSON.stringify(r)).not.toMatch(/"(?:observaciones|salario|numero_factura|responsables|foto_url)"\s*:/);
    expect(s.calls.every(c=>!/[,*](?:observaciones|monitor|responsables?|salario|numero_factura|foto_url|user_id)/.test(c.query))).toBe(true);
    expect(Object.values(PROYECCIONES_CULTIVOS).every(p=>!p.includes('*'))).toBe(true);
  });
  it.each(['produccion','monitoreos','cosechas','despachos'])('rejects incomplete full-read metadata instead of faking completeness: %s',async table=>{
    const r=await ejecutarNucleoCultivos(table==='produccion'?'get_production_data':table==='monitoreos'?'get_monitoring_data':'get_harvest_shipments',{},table==='produccion'?context():period(),source(fixtures(),{incomplete:table}).port);expect(facts(r).some(f=>f.metric.startsWith(table==='produccion'?'production.':table==='monitoreos'?'monitoring.':table==='cosechas'?'harvest.':'shipment.'))).toBe(false);
  });
  it('never masks an older joined identity read with a fresh business read',async()=>{
    const r=checked(await ejecutarNucleoCultivos('get_production_data',{},context(),source(fixtures(),{stale:'lotes'}).port));expect(r.populations.every(p=>p.capturedAt==='2034-05-08T11:59:59Z')).toBe(true);expect(answer(r).parts.every(p=>p.state==='unavailable')).toBe(true);
  });
  it.each(['produccion','monitoreos','cosechas','despachos'])('fails closed for malformed row UUID identity in %s',async table=>{
    const db=fixtures();db[table][0].id='not-a-uuid';const r=await ejecutarNucleoCultivos(table==='produccion'?'get_production_data':table==='monitoreos'?'get_monitoring_data':'get_harvest_shipments',{},table==='produccion'?context():period(),source(db).port);expect(r.evidence.some(e=>e.state==='error')).toBe(true);
  });
  it('does not let read-port rows widen the requested date filter or cross canonical lot/sublot links',async()=>{
    const db=fixtures();db.monitoreos[0].fecha_monitoreo='2030-01-01';expect(facts(await ejecutarNucleoCultivos('get_monitoring_data',{},period(),source(db,{ignoreFilters:true}).port))).toEqual([]);
    const db2=fixtures();db2.produccion[0].sublote_id=id(22);expect(facts(await ejecutarNucleoCultivos('get_production_data',{},context(),source(db2).port))).toEqual([]);
  });
  it('computes late-page source rows before the explicit output budget, without calling providers/env',async()=>{
    vi.stubGlobal('fetch',()=>{throw Error('No HTTP permitted');});vi.stubGlobal('Deno',{env:{get:()=>{throw Error('No environment permitted');}}});
    const db=fixtures();db.produccion=Array.from({length:250},(_,i)=>({...db.produccion[0],id:id(2000+i),lote_id:id(3000+i),kg_totales:i===249?'0.2':'0.1',arboles_registrados:1,kg_por_arbol:i===249?'0.2':'0.1'}));db.lotes=db.produccion.map(r=>({id:r.lote_id,nombre:'Lote sintético '+r.lote_id}));
    const r=checked(await ejecutarNucleoCultivos('get_production_data',{},context(),source(db).port));expect(decimal(totals(r,'production.kg')[0])).toBe('25.1');expect(r.evidence.some(e=>e.issues.some(i=>i.code==='budget_exceeded'))).toBe(true);expect(facts(r).length).toBeLessThanOrEqual(200);
  });
  it('rejects unselected tools and arbitrary source/model/script payloads',async()=>{
    const s=source();await expect(ejecutarNucleoCultivos('get_cosecha_trazabilidad',{},context(),s.port)).rejects.toThrow('unsupported_operation');
    for(const args of [{source:'empleados'},{query:'select * from empleados'},{script:'PRIVATE_SCRIPT'},{employee_name:'PRIVATE_NAME'}])expect(facts(await ejecutarNucleoCultivos('get_production_data',args,context(),s.port))).toEqual([]);expect(s.calls).toEqual([]);
  });
});


describe('current selector and annual-axis regressions',()=>{
  it.each(['get_production_data','get_produccion_calidad'])('retains literal lot/year/season when model omits filters: %s',async tool=>{
    const s=source(),r=checked(await ejecutarNucleoCultivos(tool,{},context('Producción Principal de 2034 del Lote Claro'),s.port));
    expect(decimal(totals(r,'production.kg')[0])).toBe('100');
    expect(s.calls.find(c=>c.table==='produccion')!.query).toContain('ano=eq.2034&cosecha_tipo=eq.Principal');
    expect(r.scopes.every(scope=>JSON.stringify(scope.filters.lote_id).includes(id(1)))).toBe(true);
    expect(JSON.stringify(r)).not.toContain('Lote Sur');
  });
  it.each(['excepto el lote Claro','sin el lote Claro','no incluir el lote Claro'])('does not select a negated proposal: %s',async exclusion=>{
    for(const tool of ['get_production_data','get_produccion_calidad','get_monitoring_data']){
      const s=source(),ctx=tool==='get_monitoring_data'?period('Monitoreo '+exclusion):context('Producción 2034 '+exclusion);
      const r=await ejecutarNucleoCultivos(tool,{lote_name:'Claro'},ctx,s.port);
      expect(facts(r)).toEqual([]);expect(s.calls).toEqual([]);
    }
  });
  it('does not broaden a negated catalog selector when the model omits it',async()=>{
    const r=await ejecutarNucleoCultivos('get_production_data',{},context('Producción 2034 sin Lote Claro'),source().port);
    expect(facts(r)).toEqual([]);expect(r.evidence[0].issues[0].code).toBe('scope_ambiguous');
  });
  it('binds omitted monitoring lot and pest to canonical source identities',async()=>{
    const r=checked(await ejecutarNucleoCultivos('get_monitoring_data',{},period('Monitoreo de Plaga Alfa del Lote Claro del 2034-05-01 al 2034-05-07'),source().port));
    expect(decimal(totals(r,'monitoring.observed')[0])).toBe('10');
    expect(r.scopes[0].filters).toMatchObject({lote_id:[id(1)],plaga_enfermedad_id:[id(71)]});
    expect(JSON.stringify(r)).not.toMatch(/Lote Sur|Plaga Beta/);
  });
  it('binds omitted client filter without retaining another client and preserves independent harvests',async()=>{
    const ctx={...period('Cosechas y despachos a Exportador Uno del 2034-05-01 al 2034-05-07'),identities:{client:true,supplier:false}};
    const r=checked(await ejecutarNucleoCultivos('get_harvest_shipments',{},ctx,source().port));
    expect(decimal(totals(r,'shipment.kg')[0])).toBe('8.1');expect(decimal(totals(r,'harvest.kg')[0])).toBe('30.3');
    expect(JSON.stringify(r)).not.toContain('Exportador Dos');
  });
  it.each([{from:'2034-01-01',to:'2034-01-31'},{from:'2034-01-01',to:'2034-06-30'},{from:'2033-01-01',to:'2034-12-31'}])('rejects nonannual source windows before reading: %j',async window=>{
    for(const tool of ['get_production_data','get_produccion_calidad']){
      const s=source(),r=await ejecutarNucleoCultivos(tool,{year:2034},{...context('Producción de enero a junio de 2034'),period:window,dateState:'resolved'},s.port);
      expect(s.calls).toEqual([]);expect(facts(r)).toEqual([]);expect(r.evidence[0].issues[0].code).toBe('unsupported_operation');
    }
  });
  it('keeps a full annual scope and rejects a model year that contradicts it',async()=>{
    const ctx={...context('Producción de 2034'),period:{from:'2034-01-01',to:'2034-12-31'},dateState:'resolved' as const};
    expect(decimal(totals(checked(await ejecutarNucleoCultivos('get_production_data',{},ctx,source().port)),'production.kg')[0])).toBe('130');
    const s=source();expect(facts(await ejecutarNucleoCultivos('get_production_data',{year:2033},ctx,s.port))).toEqual([]);expect(s.calls).toEqual([]);
  });
  it('rejects annual negations and a model season that omits another explicitly requested season',async()=>{
    for(const [text,args]of [['Producción excepto 2034',{year:2034}],['Producción 2034 sin Principal',{cosecha_tipo:'Principal'}],['Producción Principal y Traviesa 2034',{cosecha_tipo:'Principal'}]] as const){
      const s=source();expect(facts(await ejecutarNucleoCultivos('get_production_data',args,context(text),s.port))).toEqual([]);expect(s.calls).toEqual([]);
    }
  });
});

 it('binds literal harvest lot while keeping shipment scope independent',async()=>{
  const r=checked(await ejecutarNucleoCultivos('get_harvest_shipments',{},period('Cosechas del Lote Claro y despachos del 2034-05-01 al 2034-05-07'),source().port));
  expect(decimal(totals(r,'harvest.kg')[0])).toBe('10.1');expect(decimal(totals(r,'shipment.kg')[0])).toBe('20.3');
  expect(r.scopes.find(s=>s.operation==='harvest.records')?.filters.lote_id).toEqual([id(1)]);
 });
