import {HERRAMIENTAS_NUCLEO,type ContextoNucleo,type PuertoNucleo} from './escoNucleoComun';
import {ejecutarNucleoGanado} from './escoNucleoGanado';
import {ejecutarNucleoCultivos} from './escoNucleoCultivos';
import {ejecutarNucleoComercio} from './escoNucleoComercio';
import {ejecutarNucleoOperaciones} from './escoNucleoOperaciones';
/** Integrator-owned source bridge. Ports run behind existing channel gates. */
import {evidenciaTrabajoRegistrado,PROYECCION_HECHOS_TRABAJO,type FilaHechosTrabajo} from './escoHechosTrabajo';
import {construirHechosInventario,INVENTARIO_PROYECCION,coincidenciaNombreProducto} from './escoHechosInventario';
import {hechosLluvia,type ObservacionLluvia} from './escoHechosClima';
import {evidenciaFechasAplicacion,PROYECCION_FECHAS_APLICACION} from './escoAplicacionHechos';
import {auditarPaginas,type PaginaObservada} from './escoCobertura';
import {CLOCK_ESCO,validarScope,type Scope,type Evidence,type PopulationProof,type Metric} from './escoEvidencia';
import {construirHechosRegistros} from './escoHechosRegistros';
import type {ParteSolicitada} from './escoRespuesta';
export type TablaFuente='registros_trabajo'|'productos'|'clima_resumen_diario'|'hato_pesajes_leche'|'hato_animales'|'fin_gastos'|'fin_ingresos'|'fin_negocios'|'lotes';
export interface PaginaFuente {rows:Record<string,unknown>[];total:number|null}
export interface PuertoFuente {
 /** Original current user text supplied by the server, never model arguments. */
 currentUserText?:string;
 selected?:{context:ContextoNucleo;port:PuertoNucleo};
 read(table:TablaFuente,query:string):Promise<PaginaFuente>;
 applications?(args:Record<string,unknown>):Promise<{rows:Record<string,unknown>[];complete:boolean}>;
 now():string;
}
export interface ResultadoFuente {evidence:Evidence[];scopes:Scope[];populations:PopulationProof[];parts:ParteSolicitada[];labels:Record<string,string>}
const enc=encodeURIComponent;
const normalized=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const positiveTerm=(text:string,word:RegExp)=>[...text.matchAll(new RegExp(word.source,'g'))].some(m=>!/(?:\bno|\bsin|\bexcepto|\bexcluye)(?: (?:los|las|incluyas|incluir|muestres|mostrar))* $/.test(text.slice(0,m.index)));
const excluded=(question:string,label:string)=>new RegExp('(?:sin|excepto|excluye|excluir|no incluir|no incluyas|no muestres|anterior|ejemplo) (?:el |la |el producto |producto )?'+normalized(label)+'(?: |$)').test(normalized(question));
const mentioned=(question:string,label:string)=>(' '+normalized(question)+' ').includes(' '+normalized(label)+' ');
function dateRange(args:Record<string,unknown>):Scope['period'] {
 if(typeof args.date_from!=='string'||typeof args.date_to!=='string'||typeof args.reference_day!=='string')return null;
 return {from:args.date_from,to:args.date_to,referenceDay:args.reference_day,clock:CLOCK_ESCO,basis:'actual',fieldMeaning:'fecha_trabajo'};
}
export async function leerFuenteCompleta(port:PuertoFuente,table:TablaFuente,base:string){
 const rows:Record<string,unknown>[]=[],pages:PaginaObservada[]=[];
 for(let offset=0;offset<20000;offset+=200){
  const page=await port.read(table,`${base}&order=${table==='clima_resumen_diario'?'station_id.asc,fecha.asc':table==='hato_pesajes_leche'?'animal_id.asc,fecha.asc':'id.asc'}&limit=200&offset=${offset}`);
  if(table==='clima_resumen_diario')page.rows=page.rows.map(r=>({...r,id:typeof r.station_id==='string'&&typeof r.fecha==='string'?r.station_id+':'+r.fecha:null}));
  if(table==='hato_pesajes_leche')page.rows=page.rows.map(r=>({...r,id:typeof r.animal_id==='string'&&typeof r.fecha==='string'?JSON.stringify([r.animal_id,r.fecha]):null}));
  pages.push({offset,requested:200,identities:page.rows.map(r=>r?.id as string),count:page.total});rows.push(...page.rows);
  if(page.rows.length<200||page.total!==null&&rows.length===page.total)break;
 }
 const audit=auditarPaginas(pages);if(!audit.complete)throw Error('source_error');
 return {rows,audit,capturedAt:port.now()};
}
/** Known aliases select a registered operation, not a wording-based coverage list. */
export async function ejecutarFuenteVerificada(tool:string,args:Record<string,unknown>,port:PuertoFuente):Promise<ResultadoFuente|null>{
 if((HERRAMIENTAS_NUCLEO as readonly string[]).includes(tool)){
  if(!port.selected)throw Error('source_error');
  let {context}=port.selected;const read=port.selected.port;
  // Dates alone never bind a previous named population. A current explicit label
  // may restart selection, but the adapter must still resolve it in a fresh catalog.
  if(context.referencePending){
   const q=normalized(context.currentUserText);
   const selectors:Record<string,string[]>={lote_name:['lote'],product_name:['producto'],finca_name:['finca'],ubicacion_name:['ubicacion'],client_name:['cliente'],proveedor:['proveedor']};
   const unsafe=/\b(?:no|sin|excepto|antes|anterior|ejemplo|mismo|misma|esos|esas)\b/.test(q);
   const current=!unsafe&&Object.entries(selectors).some(([key,nouns])=>typeof args[key]==='string'&&normalized(String(args[key])).length>0&&nouns.some(noun=>(' '+q+' ').includes(' '+noun+' '+normalized(String(args[key]))+' ')));
   const global=!unsafe&&/\b(?:todos los|todas las) (?:lotes|productos|fincas|ubicaciones|clientes|proveedores|estaciones|tareas|registros)\b/.test(q);
   if(!current&&!global)throw Error('scope_ambiguous');
   context={...context,referencePending:false};
  }
  const selectedArgs=Object.fromEntries(Object.entries(args).filter(([key])=>key!=='reference_day'));
  if(['get_ganado_inventory','get_ganado_movimientos_detalle'].includes(tool))return ejecutarNucleoGanado(tool,selectedArgs,context,read);
  if(['get_produccion_calidad','get_monitoring_data','get_production_data','get_harvest_shipments'].includes(tool))return ejecutarNucleoCultivos(tool,selectedArgs,context,read);
  if(['get_purchase_history','get_inventory_movements'].includes(tool))return ejecutarNucleoComercio(tool,selectedArgs,context,read);
  return ejecutarNucleoOperaciones(tool,selectedArgs,context,read);
 }
 if(!['get_labor_summary','get_inventory_status','get_climate_data','get_aplicaciones_ejecucion','get_application_summary','get_hato_produccion','get_financial_summary'].includes(tool))return null;

 if(tool==='get_hato_produccion'||tool==='get_financial_summary'){
  const milk=tool==='get_hato_produccion';
  args={...args};
  if(!milk&&port.currentUserText){const text=normalized(port.currentUserText);const expense=positiveTerm(text,/\b(?:gastos?|egresos?)\b/),income=positiveTerm(text,/\bingresos?\b/);if(!expense&&!income)throw Error('scope_ambiguous');args.type=expense&&income?undefined:expense?'gastos':'ingresos';}
  const allowed=milk?['date_from','date_to','reference_day','animal_numero','num_quincenas','metric']:['date_from','date_to','reference_day','type','negocio_name','search_term','metric'];
  if(Object.keys(args).some(k=>!allowed.includes(k))||args.search_term||!milk&&args.type&&!['gastos','ingresos'].includes(String(args.type)))throw Error('unsupported_operation');
  const p=dateRange(args);if(!p)throw Error('scope_ambiguous');
  const period={...p,basis:milk?'observation' as const:'recorded_at' as const,fieldMeaning:'fecha'};
  const operation=milk?'milk.production' as const:'finance.records' as const;
  const out:ResultadoFuente={scopes:[],populations:[],evidence:[],parts:[],labels:{}};
  let identity:string|undefined;
  if(milk&&port.currentUserText){const ids=[...normalized(port.currentUserText).matchAll(/\b(?:vaca|animal|chapeta|numero) (?:numero )?(\d+)\b/g)].map(m=>Number(m[1]));if(new Set(ids).size>1)throw Error('scope_ambiguous');if(ids.length){if(/(?:sin|excepto|no incluyas) (?:la )?(?:vaca|animal|chapeta|numero)\b/.test(normalized(port.currentUserText)))throw Error('scope_ambiguous');args.animal_numero=ids[0];}}
  if(milk&&args.animal_numero!==undefined){
   if(!Number.isSafeInteger(Number(args.animal_numero))||port.currentUserText&&!new RegExp('(?:vaca|animal|chapeta|numero) (?:numero )?'+String(args.animal_numero)+'(?: |$)').test(normalized(port.currentUserText)))throw Error('scope_ambiguous');
   const catalog=await leerFuenteCompleta(port,'hato_animales',`select=id,numero&numero=eq.${enc(String(args.animal_numero))}`);
   if(catalog.rows.length!==1)throw Error('scope_ambiguous');identity=String(catalog.rows[0].id);
  }
  if(!milk){
   const catalog=await leerFuenteCompleta(port,'fin_negocios','select=id,nombre');
   const mentionedBusinesses=port.currentUserText?catalog.rows.filter(r=>typeof r.nombre==='string'&&mentioned(port.currentUserText!,r.nombre)):[];
   if(mentionedBusinesses.some(r=>excluded(port.currentUserText!,String(r.nombre))))throw Error('scope_ambiguous');
   if(mentionedBusinesses.length>1)throw Error('scope_ambiguous');
   if(mentionedBusinesses.length===1)identity=String(mentionedBusinesses[0].id);
   else if(args.negocio_name){
    if(port.currentUserText&&!mentioned(port.currentUserText,String(args.negocio_name)))throw Error('scope_ambiguous');
    const matches=catalog.rows.filter(r=>coincidenciaNombreProducto(r.nombre,String(args.negocio_name)));
    if(matches.length!==1)throw Error('scope_ambiguous');identity=String(matches[0].id);
   }else if(port.currentUserText&&/\b(?:negocio|negocios)\b/.test(normalized(port.currentUserText))&&!/\b(?:todos los negocios|todos nuestros negocios)\b/.test(normalized(port.currentUserText)))throw Error('scope_ambiguous');
  }
  const ledgers=milk?['pesajes']:args.type==='gastos'?['gasto']:args.type==='ingresos'?['ingreso']:['gasto','ingreso'];
  for(const ledger of ledgers){
   const table=milk?'hato_pesajes_leche':ledger==='gasto'?'fin_gastos':'fin_ingresos';
   const fields=milk?['animal_id','fecha','litros_total','animal:hato_animales(numero,nombre)']:['id','fecha','valor',...(ledger==='gasto'?['estado']:[]),...(identity?['negocio_id']:[])];
   const filters:Scope['filters']=milk?(identity?{animal_id:identity}:{}):{ledger,...(ledger==='gasto'?{estado:'Confirmado'}:{}),...(identity?{negocio_id:identity}:{})};
   const scope:Scope={id:(milk?'milk:':'finance:')+ledger,operation,period,entities:milk&&identity?[{kind:'animal',id:identity,label:'Animal '+String(args.animal_numero)}]:[],filters};
   const query=`select=${fields.join(',')}&fecha=gte.${enc(p.from)}&fecha=lte.${enc(p.to)}`+(milk&&identity?`&animal_id=eq.${enc(identity)}`:!milk&&identity?`&negocio_id=eq.${enc(identity)}`:'')+(!milk&&ledger==='gasto'?'&estado=eq.Confirmado':'');
   out.scopes.push(scope);out.parts.push({id:scope.id,operation,scopeIds:[scope.id],metrics:milk?['milk.count','milk.volume','milk.mean']:['finance.recorded'],label:milk?'Pesajes observados (no producción quincenal vendida)':ledger==='gasto'?'Gastos registrados Confirmados (no acredita pago)':'Ingresos registrados (no acredita cobro)'});
   try{
   const read=await leerFuenteCompleta(port,table,query);
   const proof:PopulationProof={populationId:scope.id+':records',scopeId:scope.id,tool,fields:[...fields,...(milk?['num_pesajes','promedio_litros']:[])],capturedAt:read.capturedAt,population:'complete',rowsRead:read.rows.length,expectedRows:read.rows.length,identityUnique:true,consistency:read.audit.consistency};
   const envelope=construirHechosRegistros(scope,read.rows,proof);
   if(milk&&args.num_quincenas){envelope.state='partial';envelope.issues.push({partId:'records',code:'unsupported_operation'});}
   out.populations.push(proof);out.evidence.push(envelope);
   if(milk&&!identity){
    const animals=[...new Set(read.rows.map(r=>String(r.animal_id)))];
    const exactMean=(id:string)=>{const rows=read.rows.filter(r=>r.animal_id===id),sc:Scope={...scope,entities:[{kind:'animal',id,label:id}],filters:{animal_id:id}},pr:PopulationProof={...proof,rowsRead:rows.length,expectedRows:rows.length};const f=construirHechosRegistros(sc,rows,pr).facts.find(f=>f.metric==='milk.mean');if(f?.value.kind!=='decimal')return null;const [a,b='']=f.value.value.split('.');return BigInt(a)*10n**18n+BigInt(b.padEnd(18,'0'));};
    const means=new Map(animals.map(id=>[id,exactMean(id)]));animals.sort((a,b)=>{const x=means.get(a),y=means.get(b);return x==null?y==null?a.localeCompare(b):1:y==null?-1:x>y?-1:x<y?1:a.localeCompare(b);});
    if(animals.length>4){envelope.state='partial';envelope.issues.push({partId:'records',code:'budget_exceeded'});}
    for(const id of animals.slice(0,4)){
     const rows=read.rows.filter(r=>r.animal_id===id),animal=rows[0]?.animal as Record<string,unknown>|undefined;
     const label=animal&&typeof animal.numero==='number'?'Animal '+String(animal.numero)+' · '+id:id;
     const child:Scope={...scope,id:scope.id+':'+id,entities:[{kind:'animal',id,label}],filters:{animal_id:id}};
     const childProof:PopulationProof={...proof,populationId:child.id+':records',scopeId:child.id,rowsRead:rows.length,expectedRows:rows.length};
     out.scopes.push(child);out.populations.push(childProof);out.evidence.push(construirHechosRegistros(child,rows,childProof));
     out.parts.push({id:child.id,operation,scopeIds:[child.id],metrics:['milk.count','milk.volume','milk.mean'],label:'Perfil observado '+label+' (detalle limitado; no todos los empates)'});
    }
   }

   }catch{out.evidence.push({version:1,state:'error',scopes:[scope],facts:[],issues:[{partId:scope.id,code:'not_observed'}]});}
  }
  return out;
 }
 const scopes:Scope[]=[],populations:PopulationProof[]=[],evidence:Evidence[]=[],labels:Record<string,string>={};
 const apps=['get_aplicaciones_ejecucion','get_application_summary'].includes(tool),climate=tool==='get_climate_data';
 const allowed=tool==='get_labor_summary'?['date_from','date_to','reference_day','lote_name','metric']:tool==='get_inventory_status'?['reference_day','product_name','category','metric']:climate?['date_from','date_to','reference_day','metric']:['date_from','date_to','reference_day','date_basis','metric','application_name','application_id','estado','lote_name','alcance','type'];
 if(Object.keys(args).some(k=>!allowed.includes(k)))throw Error('outside_scope');
 if(apps&&args.metric&&!['status','dates','date_comparison'].includes(String(args.metric)))throw Error('unsupported_operation');
 if(climate&&args.metric&&!['rain','lluvia','precipitation','rainfall','all'].includes(String(args.metric)))throw Error('unsupported_operation');
 const partId=apps?'application':climate?'climate':tool==='get_labor_summary'?'labor':'inventory';
 const operation=apps?'application.execution':climate?'climate.rainfall':tool==='get_labor_summary'?'labor.by_lot':'inventory.status';
 const requested:Metric[]=apps?args.metric==='status'?['application.status']:args.metric==='date_comparison'?['application.actual_start','application.actual_end','application.planned_start','application.planned_end','application.start_comparison','application.end_comparison']:['application.status','application.actual_start','application.actual_end','application.planned_start','application.planned_end']:climate?['climate.rain','climate.missing_days']:tool==='get_labor_summary'?['labor.journals','labor.cost']:['inventory.count','inventory.stock','inventory.minimum'];
 const result:ResultadoFuente={scopes,populations,evidence,parts:[{id:partId,operation,scopeIds:[],metrics:requested,label:apps?'Aplicaciones registradas':climate?'Lluvia observada por estación':tool==='get_labor_summary'?'Mano de obra registrada por lote':'Inventario registrado'}],labels};
 if(tool==='get_labor_summary'){
  // No employee filters, compensation, names or observations are requested by this aggregate port.
  if(args.employee_name||args.worker_name)throw Error('scope_ambiguous');
  const period=dateRange(args);const baseScope:Scope={id:'labor:all',operation:'labor.by_lot',entities:[],period,filters:{}};
  if(!period||!validarScope(baseScope))throw Error('scope_ambiguous');
  let chosenLots:Array<{id:string;nombre:string}>|null=null;
  const question=port.currentUserText?normalized(port.currentUserText):'';
  const explicitLot=/\blotes? (?!del?\b|desde\b|entre\b|en\b|esta\b|este\b|la semana\b|semana\b|hoy\b|ayer\b|anteayer\b|hace\b|mes\b|por\b|sin\b|con\b|y\b|\d)[a-z]/.test(question);
  if(args.lote_name||explicitLot){
   const catalog=await leerFuenteCompleta(port,'lotes','select=id,nombre');
   if(catalog.rows.some(r=>typeof r.id!=='string'||typeof r.nombre!=='string'))throw Error('scope_ambiguous');
   const all=catalog.rows as Array<{id:string;nombre:string}>;
   chosenLots=port.currentUserText?all.filter(l=>mentioned(port.currentUserText!,l.nombre)):[];
   if(!chosenLots.length&&args.lote_name){
    if(port.currentUserText&&!mentioned(port.currentUserText,String(args.lote_name)))throw Error('scope_ambiguous');
    chosenLots=all.filter(l=>normalized(l.nombre)===normalized(String(args.lote_name)));
   }
   if(!chosenLots.length||new Set(chosenLots.map(l=>normalized(l.nombre))).size!==chosenLots.length||chosenLots.some(l=>excluded(port.currentUserText??'',l.nombre)))throw Error('scope_ambiguous');
  }
  const lotClause=chosenLots?.length===1?'&lote_id=eq.'+enc(chosenLots[0].id):chosenLots?.length?'&lote_id=in.('+chosenLots.map(l=>enc(l.id)).join(',')+')':'';
  const read=await leerFuenteCompleta(port,'registros_trabajo',`select=${PROYECCION_HECHOS_TRABAJO}&fecha_trabajo=gte.${enc(period.from)}&fecha_trabajo=lte.${enc(period.to)}`+lotClause);
  const lotNames=new Map<string,string>(chosenLots?.map(l=>[l.id,l.nombre])??[]);
  for(const r of read.rows){if(typeof r.lote_id!=='string'||!r.lote_id||chosenLots&&!chosenLots.some(l=>l.id===r.lote_id))throw Error('source_error');const lot=r.lote as Record<string,unknown>|null;const label=typeof lot?.nombre==='string'?lot.nombre:r.lote_id;if(lotNames.has(r.lote_id)&&lotNames.get(r.lote_id)!==label)throw Error('source_error');lotNames.set(r.lote_id,label);}
  let groups=[...lotNames.keys()];
  if(groups.length>100)throw Error('budget_exceeded');
  if(!groups.length)groups=[''];
  for(const id of groups){const scope:Scope={...baseScope,id:id?'labor:'+id:baseScope.id,entities:id?[{kind:'lot',id,label:lotNames.get(id)!}]:[],filters:id?{lote_id:id}:{}};
   const rows=id?read.rows.filter(r=>r.lote_id===id):read.rows;
   // This is an exact partition of a complete unique read, not a new DB snapshot.
   const proof:PopulationProof={populationId:scope.id+':records',scopeId:scope.id,tool,fields:['id','fraccion_jornal','costo_jornal'],capturedAt:read.capturedAt,population:'complete',rowsRead:rows.length,expectedRows:rows.length,identityUnique:true,consistency:read.audit.consistency};
   scopes.push(scope);populations.push(proof);result.parts[0].scopeIds=[...result.parts[0].scopeIds,scope.id];
   if(id)labels['lot:'+id]=lotNames.get(id)!;
   evidence.push(evidenciaTrabajoRegistrado(scope,{rows:rows as unknown as FilaHechosTrabajo[],proof}));
  }
 }else if(tool==='get_inventory_status'){
  const filters:Scope['filters']={activo:'true'};let query=`select=${[...INVENTARIO_PROYECCION,'categoria','grupo'].join(',')}&activo=eq.true`;
  if(args.category){filters.categoria=String(args.category);query+=`&categoria=eq.${enc(String(args.category))}`;}
  if(args.product_name)filters.nombre_contiene=String(args.product_name).trim();
  const scope:Scope={id:'inventory:active',operation:'inventory.status',entities:[],period:null,filters};
  const read=await leerFuenteCompleta(port,'productos',query);
  if(args.product_name&&read.rows.some(r=>!coincidenciaNombreProducto(r.nombre,r.nombre)))throw Error('scope_ambiguous');
  const userMatches=port.currentUserText?read.rows.filter(r=>typeof r.nombre==='string'&&mentioned(port.currentUserText!,r.nombre)):[];
  if(userMatches.some(r=>excluded(port.currentUserText!,String(r.nombre))))throw Error('scope_ambiguous');
  if(userMatches.length){if(userMatches.length!==1)throw Error('scope_ambiguous');delete filters.nombre_contiene;scope.entities=[{kind:'product',id:String(userMatches[0].id),label:String(userMatches[0].nombre)}];}
  else if(args.product_name&&port.currentUserText&&!mentioned(port.currentUserText,String(args.product_name)))throw Error('scope_ambiguous');
  const rows=scope.entities.length?read.rows.filter(r=>scope.entities.some(e=>e.id===r.id)):filters.nombre_contiene?read.rows.filter(r=>coincidenciaNombreProducto(r.nombre,filters.nombre_contiene)):read.rows;
  const proof:PopulationProof={populationId:'inventory:active:rows',scopeId:scope.id,tool,fields:[...INVENTARIO_PROYECCION,'categoria','grupo'],capturedAt:read.capturedAt,population:'complete',rowsRead:rows.length,expectedRows:rows.length,identityUnique:true,consistency:read.audit.consistency};
  scopes.push(scope);populations.push(proof);result.parts[0].scopeIds=[scope.id];
  const facts=construirHechosInventario({scope,rows,populations:[proof],populationId:proof.populationId});
  for(const p of facts.productos)if(p.nombre)labels['product:'+p.id]=p.nombre;
  evidence.push(facts);
 }else if(climate){
  const p=dateRange(args);if(!p)throw Error('scope_ambiguous');
  const period={...p,basis:'observation' as const,fieldMeaning:'fecha'};
  const read=await leerFuenteCompleta(port,'clima_resumen_diario',`select=station_id,fecha,lluvia_total_mm,lluvia_confianza&fecha=gte.${enc(p.from)}&fecha=lte.${enc(p.to)}`);
  const stations=[...new Set(read.rows.map(r=>r.station_id))];if(stations.some(s=>typeof s!=='string')||stations.length>10||!stations.length)throw Error('scope_ambiguous');
  for(const station of stations){const id=String(station);const scope:Scope={id:'climate:'+id,operation:'climate.rainfall',entities:[{kind:'station',id,label:id}],period,filters:{station_id:id}};
   const rows=read.rows.filter(r=>r.station_id===station);const proof:PopulationProof={populationId:scope.id+':days',scopeId:scope.id,tool,fields:['fecha','lluvia_total_mm','lluvia_confianza'],capturedAt:read.capturedAt,population:'complete',rowsRead:rows.length,expectedRows:rows.length,identityUnique:true,consistency:read.audit.consistency};
   const observations=rows.map(r=>({id:r.id,stationId:id,fecha:r.fecha,lluvia_total_mm:r.lluvia_total_mm,lluvia_confianza:r.lluvia_confianza})) as ObservacionLluvia[];
   scopes.push(scope);populations.push(proof);result.parts[0].scopeIds=[...result.parts[0].scopeIds,scope.id];evidence.push(hechosLluvia(scope,observations,proof));
  }
 }else if(apps){
  if(!port.applications)throw Error('unsupported_operation');
  const read=await port.applications(args);if(!read.complete)throw Error('incomplete_population');
  if(new Set(read.rows.map(r=>r.id)).size!==read.rows.length||read.rows.length>100)throw Error('source_error');
  if(!read.rows.length){
   const scope:Scope={id:'application:empty',operation:'application.execution',entities:[],period:args.date_from&&args.date_to?{...dateRange(args)!,basis:args.date_basis==='planned'?'planned':'actual',fieldMeaning:args.date_basis==='planned'?'fecha_inicio_planeada':'fecha_inicio_ejecucion'}:null,filters:args.type?{tipo_aplicacion:String(args.type)}:{}};
   const proof:PopulationProof={populationId:'application:empty:records',scopeId:scope.id,tool:'get_aplicaciones_ejecucion',fields:['id'],capturedAt:port.now(),population:'complete',rowsRead:0,expectedRows:0,identityUnique:true,consistency:'single_read'};
   scopes.push(scope);populations.push(proof);result.parts[0].scopeIds=[scope.id];result.parts[0].metrics=args.application_name||args.application_id?['application.count','application.status']:['application.count'];
   evidence.push({version:1,state:'ok',scopes:[scope],issues:[],facts:[{id:scope.id+':count',scopeId:scope.id,metric:'application.count',definitionId:'application.count.v1',entities:[],origin:'derived',value:{kind:'decimal',value:'0',unit:'registro'},assertion:'bounded_empty',source:{tool:proof.tool,field:'id',capturedAt:proof.capturedAt},coverage:{...proof,values:'complete',missingValues:0,reasons:[]},derivation:{operation:'count',inputs:[{populationId:proof.populationId,field:'id'}]}}]});
  }
  for(const row of read.rows){if(typeof row.id!=='string')throw Error('source_error');
   const period=args.date_from&&args.date_to?{...dateRange(args)!,basis:args.date_basis==='planned'?'planned' as const:'actual' as const,fieldMeaning:args.date_basis==='planned'?'fecha_inicio_planeada':'fecha_inicio_ejecucion'}:null;
   const scope:Scope={id:'application:'+row.id,operation:'application.execution',entities:[{kind:'application',id:row.id,label:typeof row.nombre_aplicacion==='string'?row.nombre_aplicacion:row.id}],period,filters:{}};
   const proof:PopulationProof={populationId:scope.id+':record',scopeId:scope.id,tool:'get_aplicaciones_ejecucion',fields:PROYECCION_FECHAS_APLICACION.split(','),capturedAt:port.now(),population:'complete',rowsRead:1,expectedRows:1,identityUnique:true,consistency:'single_read'};
   scopes.push(scope);populations.push(proof);result.parts[0].scopeIds=[...result.parts[0].scopeIds,scope.id];evidence.push(evidenciaFechasAplicacion(scope,{rows:[row] as Parameters<typeof evidenciaFechasAplicacion>[1]['rows'],proof}));
  }
 }
 return result;
}
