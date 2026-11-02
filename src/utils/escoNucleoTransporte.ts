/** Closed read-only transport for the selected adapters. No environment or fetch here. */
import {auditarPaginas,type PaginaObservada} from './escoCobertura';
import type {ContextoNucleo,LecturaNucleo,PuertoNucleo} from './escoNucleoComun';
export interface BackendPaginaNucleo {page(table:string,query:string):Promise<{rows:Record<string,unknown>[];total:number|null}>;now():string}
const tablas=new Set(['gan_ubicaciones','gan_fincas','gan_lotes','gan_potreros','gan_inventario','gan_pesos_historico','gan_movimientos','produccion','monitoreos','cosechas','despachos','lotes','sublotes','plagas_enfermedades_catalogo','clientes','compras','productos','fin_proveedores','movimientos_inventario','tareas','tipos_tareas','clima_resumen_diario','mon_conductividad']);
const prohibidos=new Set(['observaciones','observaciones_generales','descripcion','responsable','monitor','usuario_verificador','created_by','updated_by','user_id','usuario_id','empleado_id','contratista_id','empleados','contratistas','salario','tarifa_jornal','notas','nota','factura','numero_factura','url_factura','url_storage']);
export function crearPuertoNucleo(ctx:ContextoNucleo,backend:BackendPaginaNucleo):PuertoNucleo {
 return {now:backend.now,read:async(table,queryBase,identityKeys=['id']):Promise<LecturaNucleo>=>{
  const params=new URLSearchParams(queryBase),select=params.get('select')??'';
  const tokens=select.split(/[^a-zA-Z0-9_]+/).filter(Boolean);
  const fieldTokens=[...tokens,...[...params.keys()].flatMap(k=>k==='order'?(params.get(k)??'').split(',').map(x=>x.split('.')[0]):k.split('.'))];
  if(!tablas.has(table)||!select||select.includes('*')||params.has('limit')||params.has('offset')||fieldTokens.some(t=>prohibidos.has(t))||identityKeys.length===0||identityKeys.some(k=>!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(k)))throw Error('outside_scope');
  const clientTokens=fieldTokens.some(t=>['cliente','clientes','cliente_id'].includes(t));
  const supplierTokens=fieldTokens.some(t=>['proveedor','proveedores','proveedor_id','fin_proveedores'].includes(t));
  if((table==='clientes'||clientTokens)&&!ctx.identities.client||(table==='fin_proveedores'||supplierTokens)&&!ctx.identities.supplier)throw Error('outside_scope');
  const clientNames=table==='clientes'&&tokens.includes('nombre')||/clientes\s*\([^)]*\bnombre\b/.test(select);
  const supplierNames=tokens.includes('proveedor')||table==='fin_proveedores'&&tokens.includes('nombre')||/fin_proveedores\s*\([^)]*\bnombre\b/.test(select);
  if(clientNames&&!(ctx.identityLabels?.client??ctx.identities.client)||supplierNames&&!(ctx.identityLabels?.supplier??ctx.identities.supplier))throw Error('outside_scope');
  const ordering=(params.get('order')??'').split(',').filter(Boolean);for(const key of identityKeys)if(!ordering.some(x=>x.split('.')[0]===key))ordering.push(key+'.asc');params.set('order',ordering.join(','));
  const rows:Record<string,unknown>[]=[],pages:PaginaObservada[]=[];
  for(let offset=0;offset<20000;offset+=200){
   params.set('limit','200');params.set('offset',String(offset));
   const page=await backend.page(table,params.toString());
   const ids=page.rows.map(row=>{const values=identityKeys.map(k=>row[k]);if(values.some(v=>!(typeof v==='string'&&v.length>0||typeof v==='number'&&Number.isFinite(v))))throw Error('source_error');return JSON.stringify(values);});
   pages.push({offset,requested:200,identities:ids,count:page.total});rows.push(...page.rows);
   if(page.rows.length<200||page.total!==null&&rows.length===page.total)break;
  }
  const audit=auditarPaginas(pages);if(!audit.complete)throw Error(rows.length>=20000?'budget_exceeded':'source_error');
  return {rows,total:rows.length,capturedAt:backend.now(),identityKeys,complete:true,identityUnique:true,consistency:'stable_count_pages'};
 }};
}
