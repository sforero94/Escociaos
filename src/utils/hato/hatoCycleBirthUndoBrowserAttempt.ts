import {cycleBirthUndoWeb,validateCycleBirthUndoResult,type CycleBirthUndoResult} from './hatoCycleBirthUndoProtocol';
import {sameCycle as sameCycleBirthUndo} from './hatoCycleProtocol';
import {validAlertResponseEvent,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
export interface CycleBirthUndoIntent {eventId:string;observedEvent:JsonRow}
function cycleBirthUndoIntent(x:CycleBirthUndoIntent):CycleBirthUndoIntent {if(!x||Object.keys(x).sort().join('|')!=='eventId|observedEvent'||!validAlertResponseEvent(x.observedEvent)||x.eventId!==x.observedEvent.id||x.observedEvent.tipo!=='parto'||x.observedEvent.fuente!=='web'||x.observedEvent.cria_destino!=='retenida'||!x.observedEvent.cria_id)throw Error('Seleccione el parto retenido original.');return x;}

export interface CycleBirthUndoBrowserClient extends AlertResponseClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface CycleBirthUndoBrowserAttempt {owner:string;key:string;intent:CycleBirthUndoIntent;result:CycleBirthUndoResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_cycle_birth_undo_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingCycleBirthUndoBrowser(owner:string):CycleBirthUndoBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as CycleBirthUndoBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameCycleBirthUndo(a.intent,cycleBirthUndoIntent(a.intent)))return fail();
  if(a.result!==null)validateCycleBirthUndoResult(a.result,owner,a.key,a.intent.eventId);return a;
 }catch{return fail();}
}
async function authorize(c:CycleBirthUndoBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runCycleBirthUndoBrowser(c:CycleBirthUndoBrowserClient,owner:string,intent:CycleBirthUndoIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:CycleBirthUndoBrowserAttempt|null=null):Promise<CycleBirthUndoBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para revisar el parto y su cría.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingCycleBirthUndoBrowser(owner);
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameCycleBirthUndo(cycleBirthUndoIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateCycleBirthUndoResult(reviewed.result,owner,reviewed.key,reviewed.intent.eventId);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameCycleBirthUndo(pendingCycleBirthUndoBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=cycleBirthUndoIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameCycleBirthUndo(pendingCycleBirthUndoBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameCycleBirthUndo(a.intent,cycleBirthUndoIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameCycleBirthUndo(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameCycleBirthUndo(reviewed.result,a.result)||reviewed.result.eventId!==a.intent.eventId)return fail();
   validateCycleBirthUndoResult(reviewed.result,owner,a.key,a.intent.eventId);
  }
  await authorize(c,owner,current);
  let result:CycleBirthUndoResult;
  if(mode==='prepare')result=await cycleBirthUndoWeb(c,owner,a.key,'prepare',a.intent.eventId,a.result??undefined);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await cycleBirthUndoWeb(c,owner,a.key,'status',null,a.result??undefined);
   else {if(a.result?.state!=='pending'||!a.result.original)return fail();result=await cycleBirthUndoWeb(c,owner,a.key,'post',null,a.result??undefined);}
  }else result=await cycleBirthUndoWeb(c,owner,a.key,mode==='resolve'?'resolve':'status',null,a.result??undefined);
  validateCycleBirthUndoResult(result,owner,a.key,a.intent.eventId);
  if(a.result?.original&&(!sameCycleBirthUndo(result.original,a.result.original)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameCycleBirthUndo(a.result,result))return fail();
  await authorize(c,owner,current);
  if(!sameCycleBirthUndo(pendingCycleBirthUndoBrowser(owner),a))return fail();
  if(mode==='new'){
   if(result.state!=='committed'&&result.state!=='canceled')return fail();localStorage.removeItem(slot(owner));if(localStorage.getItem(slot(owner))!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!sameCycleBirthUndo(pendingCycleBirthUndoBrowser(owner),next))return fail();return next;
 });
}
