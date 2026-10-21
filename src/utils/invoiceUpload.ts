import { getSupabaseConfig } from './supabase/config';
import { validateInvoiceBytes,INVOICE_VERSION,type InvoiceBytes } from '../supabase/functions/server/invoice-file-validation';
export interface InvoiceClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>;getSession():PromiseLike<{data:{session:{user:{id:string};access_token:string}|null};error:unknown}>}}
export interface InvoiceIdentity extends InvoiceBytes {requestKey:string;protocolVersion:number;targetKey:string;generation:string;tipo:'compra'|'venta'}
export interface InvoiceReceipt {actor:string;identity:InvoiceIdentity;receiptId:string;path:string;state:'committed';cleanupPending:false}
interface Attempt {owner:string;scope:string;identity:InvoiceIdentity}
const targetTokens=new Map<string,string>(); // Memory only; never persist human JWTs.
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const slot=(owner:string,scope:string)=>`invoice_upload_v1:${owner}:${scope}`;
const completedSlot=(owner:string,scope:string)=>`${slot(owner,scope)}:completed`;
const base=()=>`${getSupabaseConfig().url}/functions/v1/make-server-1ccce916/facturas/upload`;
const fail=():never=>{throw new Error('Factura pendiente no verificable. Conserve el archivo y el intento.');};
async function token(client:InvoiceClient,owner:string,current:()=>boolean){
 const u=await client.auth.getUser();const s=await client.auth.getSession();
 if(!uuid(owner)||u.error||s.error||u.data.user?.id!==owner||s.data.session?.user.id!==owner||!s.data.session.access_token||!current())throw new Error('La cuenta o el destino cambió');
 return s.data.session.access_token;
}
async function jsonRequest(client:InvoiceClient,owner:string,current:()=>boolean,path:string,body:unknown){
 const jwt=await token(client,owner,current);
 if(path==='/target'&&body&&typeof body==='object'&&'targetKey'in body&&'action'in body&&body.action==='activate')targetTokens.set(`${owner}:${body.targetKey}`,jwt);
 const r=await fetch(base()+path,{method:'POST',headers:{Authorization:`Bearer ${jwt}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data:unknown=await r.json();if(!r.ok)throw new Error(data&&typeof data==='object'&&'error'in data?String(data.error):'Error de factura');return data;
}
function same(a:unknown,b:InvoiceIdentity){return !!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===Object.keys(b).length&&Object.entries(b).every(([k,v])=>(a as Record<string,unknown>)[k]===v);}
function verify(data:unknown,owner:string,id:InvoiceIdentity):InvoiceReceipt|null{
 if(!data||typeof data!=='object'||Array.isArray(data))return fail();const r=data as Omit<InvoiceReceipt,'state'> & {state:string};
 if(r.actor!==owner||!same(r.identity,id))return fail();
 if(r.state==='unknown'){if(Object.keys(r).length!==3)return fail();return null;}
 if(!['pending','uploaded','quarantined','committed'].includes(r.state)||Object.keys(r).length!==6||!uuid(r.receiptId)||r.path!==`verified/${r.receiptId}.${id.extension}`)return fail();
 if(r.state!=='committed')return null;
 if(!uuid(r.receiptId)||r.path!==`verified/${r.receiptId}.${id.extension}`||r.cleanupPending!==false)return fail();return r as InvoiceReceipt;
}
export function pendingInvoice(owner:string,scope:string):Attempt|null{
 const raw=localStorage.getItem(slot(owner,scope));if(raw===null)return null;
 const a=JSON.parse(raw) as Attempt;
 if(!a||Object.keys(a).length!==3||a.owner!==owner||a.scope!==scope||!a.identity||Object.keys(a.identity).length!==10||!['compra','venta'].includes(a.identity.tipo)||!['image/jpeg','image/png','image/gif','application/pdf'].includes(a.identity.mime)||a.identity.protocolVersion!==INVOICE_VERSION||!uuid(a.identity.requestKey)||!uuid(a.identity.targetKey)||!uuid(a.identity.generation)||!Number.isInteger(a.identity.size)||a.identity.size<1||a.identity.size>5242880||!/^[0-9a-f]{64}$/.test(a.identity.sha256))return fail();return a;
}
export async function invalidateInvoiceTarget(_client:InvoiceClient,owner:string,targetKey:string){
 const key=`${owner}:${targetKey}`;const jwt=targetTokens.get(key);if(!jwt)return;
 // The originally verified human token lets a departing account close its own
 // request, even after the current SDK account changes. Server rechecks it.
 const r=await fetch(base()+'/target',{method:'POST',headers:{Authorization:`Bearer ${jwt}`,'Content-Type':'application/json'},body:JSON.stringify({targetKey,action:'invalidate'})});
 const data=await r.json();if(!r.ok||data.actor!==owner||data.targetKey!==targetKey||data.active!==false)throw new Error('Cierre de destino pendiente');
 targetTokens.delete(key);
}
export async function validateInvoiceSelection(file:File){
 if(!Number.isFinite(file.size)||file.size<1||file.size>5242880)throw new Error('Archivo de máximo 5 MiB requerido');
 return validateInvoiceBytes(new Uint8Array(await file.arrayBuffer()),file.type,file.name);
}
export async function uploadInvoice(client:InvoiceClient,owner:string,scope:string,targetKey:string,tipo:'compra'|'venta',file:File,current:()=>boolean):Promise<InvoiceReceipt>{
 const meta=await validateInvoiceSelection(file);
 await token(client,owner,current);
 const cached=localStorage.getItem(completedSlot(owner,scope));
 if(cached){const r=JSON.parse(cached) as InvoiceReceipt;
   if(r.actor===owner&&r.identity.targetKey===targetKey&&r.identity.tipo===tipo&&Object.entries(meta).every(([k,v])=>r.identity[k as keyof InvoiceIdentity]===v)){
     const proof=await jsonRequest(client,owner,current,'/status',r.identity);const receipt=verify(proof,owner,r.identity);if(receipt){await token(client,owner,current);return receipt;}return fail();
   }
 }
 const locks=navigator.locks;if(!locks)throw new Error('Use un navegador actualizado con HTTPS');
 const attempt=await locks.request(slot(owner,scope),{mode:'exclusive'},async()=>{
  await token(client,owner,current);let a=pendingInvoice(owner,scope);
  if(a){if(a.identity.targetKey!==targetKey||a.identity.tipo!==tipo||Object.entries(meta).some(([k,v])=>a!.identity[k as keyof InvoiceIdentity]!==v))throw new Error('Hay otra factura pendiente. Verifique su resultado antes de cambiarla.');return a;}
  const t=await jsonRequest(client,owner,current,'/target',{targetKey,action:'activate'}) as {actor:string;targetKey:string;generation:string;active:boolean};
  if(t.actor!==owner||t.targetKey!==targetKey||!uuid(t.generation)||t.active!==true)return fail();
  a={owner,scope,identity:{...meta,requestKey:crypto.randomUUID(),protocolVersion:INVOICE_VERSION,targetKey,generation:t.generation,tipo}};
  if(!current())return fail();localStorage.setItem(slot(owner,scope),JSON.stringify(a));return a;
 });
 const id=attempt.identity;let result:unknown;
 try{
  const jwt=await token(client,owner,current);const form=new FormData();
  for(const k of ['requestKey','protocolVersion','targetKey','generation','tipo'] as const)form.set(k,String(id[k]));form.set('file',file);
  const r=await fetch(base(),{method:'POST',headers:{Authorization:`Bearer ${jwt}`},body:form});result=await r.json();
  if(!r.ok)throw new Error('Resultado de subida desconocido');
 }catch{result=await jsonRequest(client,owner,current,'/status',id);}
 const receipt=verify(result,owner,id);if(!receipt)throw new Error('Factura pendiente o en cuarentena. Conserve el intento.');
 await token(client,owner,current);await locks.request(slot(owner,scope),{mode:'exclusive'},()=>{if(!current()||pendingInvoice(owner,scope)?.identity.requestKey!==id.requestKey)return fail();localStorage.setItem(completedSlot(owner,scope),JSON.stringify(receipt));localStorage.removeItem(slot(owner,scope));});return receipt;
}
export async function resolveInvoice(client:InvoiceClient,owner:string,scope:string,current:()=>boolean):Promise<InvoiceReceipt|null>{
 const a=pendingInvoice(owner,scope);if(!a)return null;const result=await jsonRequest(client,owner,current,'/status',a.identity);const receipt=verify(result,owner,a.identity);
 // Completed receipt or immutable quarantine can release the client attempt.
 // Quarantine proves no future publication; it does not prove Storage absence.
 const quarantined=!!result&&typeof result==='object'&&'state'in result&&result.state==='quarantined'&&'cleanupPending'in result&&result.cleanupPending===true;
 if(receipt||quarantined){await token(client,owner,current);await navigator.locks.request(slot(owner,scope),{mode:'exclusive'},()=>{if(!current()||pendingInvoice(owner,scope)?.identity.requestKey!==a.identity.requestKey)return fail();if(receipt)localStorage.setItem(completedSlot(owner,scope),JSON.stringify(receipt));localStorage.removeItem(slot(owner,scope));});}
 return receipt;
}
export async function verifyInvoiceOwner(client:InvoiceClient,owner:string,current:()=>boolean){await token(client,owner,current);}

/** Status-only recovery also covers the crash gap after the shared completed envelope was saved. */
export async function recoverCompletedInvoice(client:InvoiceClient,owner:string,scope:string,targetKey:string,current:()=>boolean):Promise<InvoiceReceipt|null>{
 const pending=pendingInvoice(owner,scope);
 if(pending){if(pending.identity.targetKey!==targetKey)return fail();return resolveInvoice(client,owner,scope,current);}
 const raw=localStorage.getItem(completedSlot(owner,scope));if(raw===null)return null;
 const r=JSON.parse(raw) as InvoiceReceipt;
 if(!r?.identity||r.identity.targetKey!==targetKey||r.identity.tipo!=='venta')return fail();
 const result=await jsonRequest(client,owner,current,'/status',r.identity);const receipt=verify(result,owner,r.identity);await token(client,owner,current);return receipt;
}

/** Irreversible target closure proves no future publication; it never proves byte absence. */
export async function closeInvoiceTarget(client:InvoiceClient,owner:string,scope:string,targetKey:string,current:()=>boolean){
 const r=await jsonRequest(client,owner,current,'/target',{targetKey,action:'invalidate'}) as {actor:string;targetKey:string;generation:string;active:boolean};
 if(!r||Object.keys(r).length!==4||r.actor!==owner||r.targetKey!==targetKey||!uuid(r.generation)||r.active!==false)return fail();
 await token(client,owner,current);
 await navigator.locks.request(slot(owner,scope),{mode:'exclusive'},()=>{const a=pendingInvoice(owner,scope);if(a&&(a.identity.targetKey!==targetKey||a.identity.generation!==r.generation))return fail();if(a)localStorage.removeItem(slot(owner,scope));if(pendingInvoice(owner,scope)!==null)return fail();});
 return r;
}

/** A server-reserved original is sent once; recovery never calls this function. */
export async function uploadReservedInvoice(client:InvoiceClient,owner:string,scope:string,identity:InvoiceIdentity,file:File,current:()=>boolean):Promise<InvoiceReceipt>{
 const meta=await validateInvoiceSelection(file);await token(client,owner,current);
 if(Object.entries(meta).some(([k,v])=>identity[k as keyof InvoiceIdentity]!==v))return fail();
 const locks=navigator.locks;if(!locks)return fail();
 await locks.request(slot(owner,scope),{mode:'exclusive'},async()=>{
  await token(client,owner,current);if(pendingInvoice(owner,scope))return fail();
  const a={owner,scope,identity};localStorage.setItem(slot(owner,scope),JSON.stringify(a));
  if(JSON.stringify(pendingInvoice(owner,scope))!==JSON.stringify(a))return fail();
 });
 let result:unknown;
 try{const jwt=await token(client,owner,current),form=new FormData();for(const k of ['requestKey','protocolVersion','targetKey','generation','tipo'] as const)form.set(k,String(identity[k]));form.set('file',file);
  const r=await fetch(base(),{method:'POST',headers:{Authorization:`Bearer ${jwt}`},body:form});result=await r.json();if(!r.ok)throw Error('Resultado de subida desconocido');
 }catch{result=await jsonRequest(client,owner,current,'/status',identity);}
 const receipt=verify(result,owner,identity);if(!receipt)throw Error('Consulta la factura original; no vuelvas a enviarla.');
 await token(client,owner,current);await locks.request(slot(owner,scope),{mode:'exclusive'},()=>{if(!current()||!same(pendingInvoice(owner,scope)?.identity,identity))return fail();localStorage.setItem(completedSlot(owner,scope),JSON.stringify(receipt));localStorage.removeItem(slot(owner,scope));});return receipt;
}

/** Called only after a trusted terminal receipt; never removes another original. */
export async function clearReleasedInvoiceEvidence(client:InvoiceClient,owner:string,scope:string,identity:InvoiceIdentity,current:()=>boolean){
 await navigator.locks.request(slot(owner,scope),{mode:'exclusive'},async()=>{
  await token(client,owner,current);const a=pendingInvoice(owner,scope),raw=localStorage.getItem(completedSlot(owner,scope));
  let completed:InvoiceReceipt|null=null;if(raw!==null){const parsed=JSON.parse(raw);if(!parsed?.identity||parsed.actor!==owner)return fail();completed=verify(parsed,owner,parsed.identity);if(!completed)return fail();}
  if(a&&same(a.identity,identity)){localStorage.removeItem(slot(owner,scope));if(localStorage.getItem(slot(owner,scope))!==null)return fail();}
  if(completed&&same(completed.identity,identity)){localStorage.removeItem(completedSlot(owner,scope));if(localStorage.getItem(completedSlot(owner,scope))!==null)return fail();}
 });
}
