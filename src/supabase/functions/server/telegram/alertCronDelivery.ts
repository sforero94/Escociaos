import type {TelegramSendOutcome} from './sendOutcome.ts';
type Row=Record<string,unknown>;
export interface CronRpc {rpc(name:string,args:Row):PromiseLike<{data:unknown;error:unknown}>}
export interface FrozenSend {telegramId:string;texto:string;tipoMensaje:string;flujo:string;telegramUsuarioId:string;botones:Array<{texto:string;callbackData:string}>}
const record=(x:unknown):x is Row=>!!x&&typeof x==='object'&&!Array.isArray(x);
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
function envelope(x:unknown,id:string):{sendPermission:boolean;delivery:Row}{
 if(!record(x)||Object.keys(x).sort().join('|')!=='delivery|sendPermission|version'||x.version!==1||typeof x.sendPermission!=='boolean'||!record(x.delivery)||x.delivery.id!==id||!uuid(x.delivery.run_id)||!uuid(x.delivery.registration_id)||!uuid(x.delivery.alert_id)||!['queued','sending','sent','rejected','unknown','not_attempted','canceled'].includes(String(x.delivery.state)))throw Error('Original delivery proof could not be verified.');
 return x as {sendPermission:boolean;delivery:Row};
}
function frozen(d:Row,claimKey:string):FrozenSend{
 if(d.state!=='sending'||d.claim_key!==claimKey||typeof d.claimed_at!=='string'||!Number.isFinite(Date.parse(d.claimed_at))||!Number.isSafeInteger(d.recipient)||Number(d.recipient)<=0||!Number.isInteger(d.round)||Number(d.round)<1||Number(d.round)>3||!['delivery','escalation'].includes(String(d.phase))||!record(d.body)||Object.keys(d.body).sort().join('|')!=='callbackToken|text'||d.body.callbackToken!==d.id||typeof d.body.text!=='string'||d.body.text.length<1||d.body.text.length>3500||!record(d.context)||!record(d.context.recipient)||d.context.recipient.id!==d.registration_id||d.context.recipient.telegramId!==d.recipient||!record(d.context.alert)||d.context.alert.id!==d.alert_id||typeof d.context.alert.tipo!=='string')throw Error('Original frozen send permission could not be verified.');
 return {telegramId:String(d.recipient),telegramUsuarioId:String(d.registration_id),texto:d.body.text,tipoMensaje:d.phase==='delivery'?'alerta_hato':'alerta_hato_escalamiento',flujo:d.context.alert.tipo,botones:d.phase==='delivery'?[{texto:'Sí',callbackData:`hjd:${d.id}:si`},{texto:'Todavía no',callbackData:`hjd:${d.id}:no`},{texto:'Otra cosa',callbackData:`hjd:${d.id}:otro`}]:[]};
}
function outcome(x:unknown):TelegramSendOutcome{
 if(record(x)&&x.ok===true&&x.outcome==='sent'&&Number.isSafeInteger(x.telegramMessageId)&&Number(x.telegramMessageId)>0)return {outcome:'sent',ok:true,telegramMessageId:Number(x.telegramMessageId)};
 if(record(x)&&x.ok===false&&x.outcome==='rejected'&&Number.isInteger(x.errorCode)&&Number(x.errorCode)>=400&&Number(x.errorCode)<500&&typeof x.error==='string')return {outcome:'rejected',ok:false,error:x.error.slice(0,1000),errorCode:Number(x.errorCode)};
 if(record(x)&&x.ok===false&&x.outcome==='not_attempted'&&typeof x.error==='string')return {outcome:'not_attempted',ok:false,error:x.error.slice(0,1000)};
 return {outcome:'unknown',ok:false,error:'Original external send outcome is unknown; do not resend.'};
}
async function rpc(c:CronRpc,action:string,id:string,payload:Row|null){const r=await c.rpc('fn_alert_cron_service',{p_action:action,p_key:id,p_payload:payload});if(r.error)throw Error('Original delivery result unknown.');return envelope(r.data,id);}
function canonical(x:unknown):string{if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(record(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
function settledProof(x:{sendPermission:boolean;delivery:Row},original:Row,result:TelegramSendOutcome,allowSending=false){
 const expected={...original,state:result.outcome,result};
 if(x.sendPermission||!(canonical(x.delivery)===canonical(expected)||(allowSending&&canonical(x.delivery)===canonical(original))))throw Error('Original settlement proof could not be verified.');
 return x;
}
/** One physical send at most. A repeated/lost claim never grants another send. */
export async function dispatchCronDelivery(c:CronRpc,id:string,send:(options:FrozenSend)=>Promise<unknown>,expected?:Row){
 if(!uuid(id))throw Error('Original delivery ID required.');const claimKey=crypto.randomUUID();
 const claimed=await rpc(c,'claim',id,{claimKey});
 if(expected){const semantic=(d:Row)=>{const copy={...d};for(const k of ['state','claim_key','claimed_at','result'])delete copy[k];return copy;};if(canonical(semantic(claimed.delivery))!==canonical(semantic(expected)))throw Error('Original queued delivery changed.');}
 if(!claimed.sendPermission){
  const d=claimed.delivery,r=d.result;
  if(['sent','rejected','unknown','not_attempted'].includes(String(d.state))&&(!record(r)||r.outcome!==d.state||(d.state==='sent'?(r.ok!==true||!Number.isSafeInteger(r.telegramMessageId)||Number(r.telegramMessageId)<1):r.ok!==false||typeof r.error!=='string')))throw Error('Original terminal delivery proof required.');
  return claimed;
 }
 const options=frozen(claimed.delivery,claimKey);
 let result:TelegramSendOutcome;try{result=outcome(await send(options));}catch{result=outcome(null);}
 const payload={claimKey,outcome:result};
 try{return settledProof(await rpc(c,'settle',id,payload),claimed.delivery,result);}catch{
  // Recovery is database-only: never call send again after acquiring permission.
  const status=settledProof(await rpc(c,'delivery_status',id,null),claimed.delivery,result,true);
  if(status.delivery.state!=='sending')return status;
  return settledProof(await rpc(c,'settle',id,payload),claimed.delivery,result);
 }
}
