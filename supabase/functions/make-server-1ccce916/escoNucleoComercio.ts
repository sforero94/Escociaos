/** Purchases and inventory movements: registered records, never physical receipt or cash proof. */
import {DEFINITIONS,decimalValido,fechaValida,validarEvidencia,type Scope,type Evidence,type Fact,type Metric,type Entity} from './escoEvidencia.ts';
import {validarLecturaNucleo,pruebaNucleo,coberturaNucleo,periodoNucleo,textoNucleo,unirNucleo,type ContextoNucleo,type PuertoNucleo,type LecturaNucleo,type ResultadoNucleo} from './escoNucleoComun.ts';
export const COMPRAS_PROYECCION='id,producto_id,fecha_compra,cantidad,unidad,costo_unitario,costo_total,producto:productos(nombre)';
export const MOVIMIENTOS_PROYECCION='id,producto_id,fecha_movimiento,tipo_movimiento,cantidad,unidad,valor_movimiento,producto:productos(nombre)';
const UNITS=['Kilos','Litros','Unidades'];
const TYPES=['Entrada','Salida por Aplicación','Salida Otros','Ajuste'];
const SCALE=10n**18n;
type Row=Record<string,unknown>;
const id=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=128&&x.trim()===x&&[...x].every(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127);
const object=(v:unknown):Row=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const literal=(v:unknown,fallback:string):string=>id(v)?v:fallback;
const mentions=(q:string,s:string)=>(' '+textoNucleo(q)+' ').includes(' '+textoNucleo(s)+' ');
const excluded=(q:string,s:string)=>new RegExp('(?:sin|excepto|no incluyas|no muestres) (?:el |la |producto |proveedor )?'+textoNucleo(s)+'(?: |$)').test(textoNucleo(q));
function numeric(v:unknown,nonnegative=false):bigint|null {
 if(typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER))return null;
 const s=typeof v==='number'?String(v):v;if(!decimalValido(s))return null;
 const neg=s.startsWith('-'),[a,b='']=(neg?s.slice(1):s).split('.');const n=BigInt(a)*SCALE+BigInt(b.padEnd(18,'0'));return nonnegative&&neg&&n!==0n?null:neg?-n:n;
}
function decimal(n:bigint):string {const neg=n<0n,a=neg?-n:n,b=String(a%SCALE).padStart(18,'0').replace(/0+$/,'');return (neg?'-':'')+String(a/SCALE)+(b?'.'+b:'');}
async function checkedRead(port:PuertoNucleo,table:string,query:string,startedAt:string):Promise<LecturaNucleo>{const read=await port.read(table,query);if(!validarLecturaNucleo(read)||!Number.isFinite(Date.parse(startedAt))||Date.parse(read.capturedAt)<Date.parse(startedAt))throw Error('source_error');return read;}
function periodFilters(ctx:ContextoNucleo,field:string):{query:string;filters:Scope['filters']} {
 if(!['resolved','absent','open'].includes(ctx.dateState)||!fechaValida(ctx.referenceDay)||!Number.isFinite(Date.parse(ctx.startedAt))||ctx.dateState==='resolved'&&!ctx.period||ctx.dateState==='absent'&&!!ctx.period||ctx.dateState==='open'&&!!ctx.period)throw Error('scope_ambiguous');
 const bounds=ctx.dateState==='absent'?{}:ctx.period??ctx.bounds??{},from=bounds.from,to=bounds.to;
 if(from&&!fechaValida(from)||to&&!fechaValida(to)||from&&to&&from>to||ctx.dateState==='open'&&!from&&!to)throw Error('scope_ambiguous');
 return {query:(from?'&'+field+'=gte.'+encodeURIComponent(from):'')+(to?'&'+field+'=lte.'+encodeURIComponent(to):''),filters:{...(from?{date_from:from}:{}),...(to?{date_to:to}:{})}};
}
function periodMembership(rows:readonly Row[],ctx:ContextoNucleo,field:string):void {
 const b=ctx.dateState==='absent'?{}:ctx.period??ctx.bounds??{};
 if(rows.some(r=>!fechaValida(r[field])||b.from&&String(r[field])<b.from||b.to&&String(r[field])>b.to))throw Error('source_error');
}
function groups(rows:readonly Row[],key:(row:Row)=>string):Row[][] {const map=new Map<string,Row[]>();for(const r of rows){const k=key(r);if(!map.has(k))map.set(k,[]);map.get(k)!.push(r);}return [...map.values()];}
function sourceQuestion(ctx:ContextoNucleo):string {
 // Prior USER scope is handled by the shared reference guard, never concatenated
 // into selectors: a fresh selector must not accidentally retain the old product.
 return ctx.currentUserText;
}
async function productSelection(args:Row,ctx:ContextoNucleo,port:PuertoNucleo):Promise<{ids:string[]|null;labels:Map<string,string>}> {
 const question=sourceQuestion(ctx),q=textoNucleo(question);
 const explicit=/\bproducto (?!del?\b|desde\b|entre\b|en\b|por\b|sin\b|y\b|\d)[a-z]/.test(q);
 if(!args.product_name&&!explicit)return {ids:null,labels:new Map()};
 const read=await checkedRead(port,'productos','select=id,nombre&order=id.asc',ctx.startedAt);
 const labels=new Map<string,string>();for(const r of read.rows){if(!id(r.id)||!id(r.nombre))throw Error('source_error');labels.set(r.id,r.nombre);}
 let found=read.rows.filter(r=>mentions(question,String(r.nombre)));
 if(!found.length&&args.product_name){if(!id(args.product_name)||!mentions(question,args.product_name)||excluded(question,args.product_name))throw Error('scope_ambiguous');found=read.rows.filter(r=>textoNucleo(r.nombre).includes(textoNucleo(args.product_name)));}
 if(!found.length||new Set(found.map(r=>textoNucleo(r.nombre))).size!==found.length||found.some(r=>excluded(question,String(r.nombre))))throw Error('scope_ambiguous');
 return {ids:found.map(r=>String(r.id)),labels};
}
function typeSelection(args:Row,ctx:ContextoNucleo):string[]|null {
 const q=textoNucleo(sourceQuestion(ctx));
 // No implicit complement: negated type selection needs explicit clarification.
 if(/\b(?:sin|excepto|excluye|excluir|omite|omitir|no(?: incluyas| incluir| muestres| mostrar| consideres| hubo| hay)?) (?:los |las |el |la )?(?:movimientos de )?(?:entradas?|salidas?|ajustes?)\b/.test(q))throw Error('scope_ambiguous');
 const requested:TYPESLike[]=[];
 if(/\bentradas?\b/.test(q)&&!/\b(?:sin|excepto) entradas?\b/.test(q))requested.push('Entrada');
 if(/\bajustes?\b/.test(q)&&!/\b(?:sin|excepto) ajustes?\b/.test(q))requested.push('Ajuste');
 if(/\bsalidas?\b/.test(q)&&!/\b(?:sin|excepto) salidas?\b/.test(q))requested.push(...(/\bsalida por aplicacion\b/.test(q)?['Salida por Aplicación' as const]:/\bsalida otros\b/.test(q)?['Salida Otros' as const]:['Salida por Aplicación' as const,'Salida Otros' as const]));
 if(requested.length)return [...new Set(requested)];
 if(args.tipo!==undefined){if(!id(args.tipo)||!mentions(sourceQuestion(ctx),args.tipo)||excluded(sourceQuestion(ctx),args.tipo))throw Error('scope_ambiguous');const target=textoNucleo(args.tipo);const matched=TYPES.filter(t=>textoNucleo(t).includes(target));if(!matched.length)throw Error('scope_ambiguous');return matched;}
 if(/\b(?:sin|excepto) (?:entradas?|salidas?|ajustes?)\b/.test(q))throw Error('scope_ambiguous');
 return null;
}
type TYPESLike='Entrada'|'Salida por Aplicación'|'Salida Otros'|'Ajuste';
function frame(read:LecturaNucleo,scope:Scope,tool:string,fields:string[],rows:readonly Row[],specs:readonly {metric:Metric;field?:string;mode:'sum'|'count'|'record'|'net';unit?:string;nonnegative?:boolean}[],label:string):ResultadoNucleo {
 const proof=pruebaNucleo(read,scope,tool,fields,rows),facts:Fact[]=[];const issues:Evidence['issues']=[];
 for(const [index,spec]of specs.entries()){
  const d=DEFINITIONS[spec.metric],field=spec.field??d.field;let missing=0,sum=0n,value:Fact['value'];
  if(spec.mode==='count')value={kind:'decimal',value:String(rows.length),unit:d.unit};
  else if(spec.mode==='record'){
   const v=rows[0]?.[field];
   if(d.unit==='date')value=fechaValida(v)?{kind:'date',value:v}:{kind:'unknown',reason:'missing_value'};
   else if(d.unit==='status')value=typeof v==='string'&&TYPES.includes(v)?{kind:'status',value:v}:{kind:'unknown',reason:'invalid_value'};
   else {const n=numeric(v,spec.nonnegative),unit=spec.unit??d.unit;value=n===null||((d.unit==='catalog'||d.unit==='catalog_price')&&!spec.unit)?{kind:'unknown',reason:spec.unit?'missing_value':'unknown_unit'}:{kind:'decimal',value:decimal(n),unit};}
   missing=value.kind==='unknown'?rows.length:0;
  }else {
   for(const row of rows){let n=numeric(row[field],spec.nonnegative);if(spec.mode==='net'){
    if(!TYPES.includes(String(row.tipo_movimiento)))n=null;
    else if(n!==null&&row.tipo_movimiento!=='Ajuste'&&n<0n)n=null;
    else if(n!==null&&String(row.tipo_movimiento).startsWith('Salida'))n=-n;
   }if(n===null)missing++;else sum+=n;}
   const unit=spec.unit??d.unit;
   value=(d.unit==='catalog'&&!spec.unit)?{kind:'unknown',reason:'unknown_unit'}:missing===rows.length&&rows.length>0?{kind:'unknown',reason:'missing_value'}:decimalValido(decimal(sum))?{kind:'decimal',value:decimal(sum),unit}:{kind:'unknown',reason:'invalid_value'};
  }
  const reason=value.kind==='unknown'?value.reason:missing?'missing_value':null;if(reason&&!issues.some(i=>i.code===reason))issues.push({partId:scope.id,code:reason});
  const derive=spec.mode==='count'?'count':spec.mode==='net'?'difference':spec.mode==='sum'?'sum':null;
  facts.push({id:'commerce:'+index,scopeId:scope.id,metric:spec.metric,definitionId:spec.metric+'.v1',entities:scope.entities.map(({kind,id})=>({kind,id})),value,origin:derive?'derived':'recorded',source:{tool,field:d.field,capturedAt:proof.capturedAt},coverage:coberturaNucleo(proof,missing,reason?[reason]:[]),assertion:spec.mode==='count'?(rows.length?'record_count':'bounded_empty'):spec.mode==='record'?'record_value':missing?'verified_subtotal':'scoped_total',...(derive?{derivation:{operation:derive,inputs:[{populationId:proof.populationId,field:d.field}]}}:{})});
 }
 const evidence:Evidence={version:1,state:issues.length?'partial':'ok',scopes:[scope],facts,issues};
 if(!validarEvidencia(evidence,[scope],[proof]))throw Error('source_error');
 return {evidence:[evidence],scopes:[scope],populations:[proof],parts:[{id:scope.id,operation:scope.operation,scopeIds:[scope.id],metrics:specs.map(s=>s.metric),label}],labels:{}};
}
/** Closed adapter; args only select existing filters, while ctx is server-bound current user scope. */
export async function ejecutarNucleoComercio(tool:string,args:Row,ctx:ContextoNucleo,port:PuertoNucleo):Promise<ResultadoNucleo> {
 if(ctx.referencePending)throw Error('scope_ambiguous');
 if(!['get_purchase_history','get_inventory_movements'].includes(tool))throw Error('unsupported_operation');
 const purchase=tool==='get_purchase_history',field=purchase?'fecha_compra':'fecha_movimiento',operation=purchase?'purchase.history':'inventory.movements';
 if(Object.keys(args).some(k=>!(purchase?['date_from','date_to','product_name','proveedor']:['date_from','date_to','product_name','tipo']).includes(k)))throw Error('unsupported_operation');
 const temporal=periodFilters(ctx,field),types=purchase?null:typeSelection(args,ctx),selected=await productSelection(args,ctx,port);
 const question=sourceQuestion(ctx);let provider=args.proveedor;
 if(provider!==undefined&&(!purchase||!ctx.identities.supplier||!id(provider)||excluded(question,provider)))throw Error('scope_ambiguous');
 const includeSupplier=purchase&&ctx.identities.supplier;
 const allowSupplierNames=(ctx as ContextoNucleo & {identityLabels?:{supplier?:boolean}}).identityLabels?.supplier??ctx.identities.supplier;
 const balances=!purchase&&/\b(?:saldos?|balance)\b/.test(textoNucleo(ctx.currentUserText));
 const productClause=selected.ids?.length?'&producto_id=in.('+selected.ids.map(v=>encodeURIComponent(JSON.stringify(v))).join(',')+')':'';
 const typeClause=types?'&tipo_movimiento=in.('+types.map(v=>encodeURIComponent(JSON.stringify(v))).join(',')+')':'';
 const projection=(purchase?COMPRAS_PROYECCION:MOVIMIENTOS_PROYECCION)+(includeSupplier?',proveedor_id'+(allowSupplierNames?',proveedor':''):'')+(balances?',saldo_anterior,saldo_nuevo':'');
 if(provider&&!allowSupplierNames&&/[\\%_*]/.test(String(provider)))throw Error('scope_ambiguous');
 if(provider&&!allowSupplierNames&&!mentions(question,String(provider)))throw Error('scope_ambiguous');
 const explicitSupplier=purchase&&/\bproveedor (?!del?\b|desde\b|entre\b|en\b|por\b|sin\b|y\b|con\b|\d)[a-z]/.test(textoNucleo(question));
 if(explicitSupplier&&!includeSupplier)throw Error('scope_ambiguous');
 if(explicitSupplier&&!allowSupplierNames&&!provider)throw Error('scope_ambiguous');
 const supplierClause=provider&&!allowSupplierNames?'&proveedor=ilike.'+encodeURIComponent('*'+String(provider).replace(/[\\%_*]/g,'\\$&')+'*'):'';
 const read=await checkedRead(port,purchase?'compras':'movimientos_inventario','select='+projection+temporal.query+productClause+typeClause+supplierClause+'&order=id.asc',ctx.startedAt);
 periodMembership(read.rows,ctx,field);
 if(read.rows.some(r=>!id(r.id)||!id(r.producto_id)||selected.ids&&!selected.ids.includes(String(r.producto_id))||types&&!types.includes(String(r.tipo_movimiento))))throw Error('source_error');
 let rows=read.rows;
 if(includeSupplier&&allowSupplierNames){const labels=[...new Set(rows.map(r=>r.proveedor).filter(id))];const actual=labels.filter(label=>mentions(question,label));if(actual.some(label=>excluded(question,label))||actual.length>1)throw Error('scope_ambiguous');if(actual.length===1)provider=actual[0];else if(explicitSupplier&&!provider)throw Error('scope_ambiguous');if(provider&&!mentions(question,String(provider)))throw Error('scope_ambiguous');}
 if(provider){
  const matches=allowSupplierNames?rows.filter(r=>textoNucleo(r.proveedor).includes(textoNucleo(provider))):rows;
  const ids=new Set(matches.filter(r=>id(r.proveedor_id)).map(r=>String(r.proveedor_id)));
  if(ids.size>1||allowSupplierNames&&matches.some(r=>!id(r.proveedor)))throw Error('scope_ambiguous');
  rows=matches;
 }
 const filters:Scope['filters']={...temporal.filters,...(selected.ids?{producto_id:selected.ids}:{}),...(provider?(allowSupplierNames?{proveedor_registrado:String(provider)}:{proveedor_filtro:'solicitado_sin_nombre'}):{}),...(types?{tipo_movimiento:types}:{})};
 const base:Scope={id:purchase?'purchases':'movements',operation,period:periodoNucleo(ctx,field,'recorded_at'),entities:[],filters};
 const fields=projection.split(',').filter(x=>!x.includes(':'));const out:ResultadoNucleo[]=[];
 const count=purchase?'purchase.count':'movement.count',money=purchase?'purchase.cost':'movement.value';
 out.push(frame(read,base,tool,fields,rows,[{metric:count,mode:'count'},{metric:money,mode:'sum'}],(purchase?'Compras y costos registrados (no acredita recepción o pago)':'Movimientos y valores registrados (no acredita recepción física)')+(ctx.dateState==='absent'?' — todo historial registrado, sin período indicado':ctx.dateState==='open'?' — límite abierto: '+(ctx.bounds?.from?'desde '+ctx.bounds.from:'')+' '+(ctx.bounds?.to?'hasta '+ctx.bounds.to:''):'')));
 const groupRows=groups(rows,r=>JSON.stringify([r.producto_id,r.unidad,...(!purchase?[r.tipo_movimiento]:[])]));
 for(const [i,subset]of groupRows.entries()){
  const first=subset[0],unit=UNITS.includes(String(first.unidad))?String(first.unidad):undefined;
  const productId=String(first.producto_id),productName=literal(object(first.producto).nombre,selected.labels.get(productId)??productId);
  const product:Entity={kind:'product',id:productId,label:productName};
  const scope:Scope={...base,id:base.id+':product:'+i,entities:[product],filters:{...filters,producto_id:productId,unidad:unit??'desconocida',...(!purchase?{tipo_movimiento:TYPES.includes(String(first.tipo_movimiento))?String(first.tipo_movimiento):'tipo_desconocido'}:{})}};
  out.push(frame(read,scope,tool,fields,subset,[{metric:count,mode:'count'},{metric:purchase?'purchase.quantity':'movement.quantity',mode:'sum',unit,nonnegative:purchase||first.tipo_movimiento!=='Ajuste'},{metric:money,mode:'sum'}],purchase?'Por producto y unidad registrados':'Por producto, unidad y tipo registrados'));
 }
 if(!purchase){for(const [i,subset]of groups(rows,r=>JSON.stringify([r.producto_id,r.unidad])).entries()){
  const first=subset[0],unit=UNITS.includes(String(first.unidad))?String(first.unidad):undefined;
  const scope:Scope={...base,id:'movements:net:'+i,entities:[{kind:'product',id:String(first.producto_id),label:literal(object(first.producto).nombre,String(first.producto_id))}],filters:{...filters,producto_id:String(first.producto_id),unidad:unit??'desconocida'}};
  out.push(frame(read,scope,tool,fields,subset,[{metric:'movement.net',mode:'net',unit}],types?'Neto solo de tipos solicitados; no saldo actual':'Neto de movimientos registrados; no saldo actual'));
 }}
 if(includeSupplier){for(const [i,subset]of groups(rows,r=>id(r.proveedor_id)?'id:'+r.proveedor_id:'purchase:'+r.id).entries()){
  const first=subset[0],linked=id(first.proveedor_id),supplierLabel=allowSupplierNames?literal(first.proveedor,linked?String(first.proveedor_id):'sin etiqueta registrada'):linked?String(first.proveedor_id):'sin identidad canónica';
  const supplier:Entity=linked?{kind:'supplier',id:String(first.proveedor_id),label:supplierLabel}:{kind:'purchase',id:String(first.id),label:('Compra '+String(first.id)+' · proveedor '+supplierLabel+' (sin vínculo canónico)').slice(0,128)};
  const scope:Scope={...base,id:'purchases:supplier:'+i,entities:[supplier],filters:{...filters,...(linked?{proveedor_id:String(first.proveedor_id)}:{purchase_id:String(first.id)})}};
  out.push(frame(read,scope,tool,fields,subset,[{metric:'purchase.count',mode:'count'},{metric:'purchase.cost',mode:'sum'}],linked?'Por proveedor vinculado':'Proveedor sin vínculo: no consolidé homónimos'));
 }}
 if(purchase){for(const [i,subset]of groups(rows,r=>String(r.fecha_compra).slice(0,7)).entries()){
  const month=String(subset[0].fecha_compra).slice(0,7),scope:Scope={...base,id:'purchases:month:'+i,filters:{...filters,mes:month}};
  out.push(frame(read,scope,tool,fields,subset,[{metric:'purchase.count',mode:'count'},{metric:'purchase.cost',mode:'sum'}],'Mes '+month+' dentro del alcance consultado'));
 }}
 const details=[...rows].sort((a,b)=>String(b[field]).localeCompare(String(a[field]))||String(a.id).localeCompare(String(b.id))).slice(0,30);
 for(const [i,row]of details.entries()){
  const unit=UNITS.includes(String(row.unidad))?String(row.unidad):undefined;
  const entity:Entity={kind:purchase?'purchase':'movement',id:String(row.id),label:(purchase?'Compra ':'Movimiento ')+String(row.id)};
  const entities:Entity[]=[entity,{kind:'product',id:String(row.producto_id),label:literal(object(row.producto).nombre,String(row.producto_id))}];
  if(includeSupplier&&id(row.proveedor_id))entities.push({kind:'supplier',id:row.proveedor_id,label:allowSupplierNames?literal(row.proveedor,row.proveedor_id):row.proveedor_id});
  else if(includeSupplier&&allowSupplierNames&&id(row.proveedor))entity.label=(entity.label+' · proveedor registrado '+row.proveedor+' (sin vínculo)').slice(0,128);
  const scope:Scope={...base,id:base.id+':detail:'+i,entities,filters:{...filters,[purchase?'purchase_id':'movement_id']:String(row.id)}};
  const specs:Array<{metric:Metric;mode:'record';unit?:string;nonnegative?:boolean}>=[{metric:purchase?'purchase.date':'movement.date',mode:'record'},{metric:purchase?'purchase.quantity':'movement.quantity',mode:'record',unit,nonnegative:purchase||row.tipo_movimiento!=='Ajuste'},{metric:money,mode:'record'}];
  if(purchase)specs.push({metric:'purchase.unit_cost',mode:'record',unit:unit?'COP/'+unit:undefined});
  else {specs.push({metric:'movement.type',mode:'record'});if(balances)specs.push({metric:'movement.balance_before',mode:'record',unit},{metric:'movement.balance_after',mode:'record',unit});}
  out.push(frame(read,scope,tool,fields,[row],specs,purchase?'Detalle registrado de compra (máximo 30)':'Detalle registrado de movimiento (máximo 30)'));
 }
 const result=unirNucleo(out);
 if(rows.length>30){result.evidence[0].state='partial';result.evidence[0].issues.push({partId:base.id,code:'budget_exceeded'});}
 if(!purchase&&/\b(?:verificaciones?|conciliacion|rondas?)\b/.test(textoNucleo(ctx.currentUserText))){result.evidence[0].state='partial';result.evidence[0].issues.push({partId:base.id,code:'unsupported_operation'});}
 return result;
}
