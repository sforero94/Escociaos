/** A missing response cannot establish that sendMessage was rejected. */
export type TelegramSendOutcome=
 |{outcome:'sent';ok:true;telegramMessageId:number}
 |{outcome:'rejected';ok:false;error:string;errorCode:number}
 |{outcome:'unknown';ok:false;error:string}
 |{outcome:'not_attempted';ok:false;error:string};
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export function classifyTelegramSend(status:number,body:unknown,expectedChat:string):TelegramSendOutcome{
 if(status>=200&&status<300&&record(body)&&body.ok===true&&record(body.result)&&Number.isSafeInteger(body.result.message_id)&&Number(body.result.message_id)>0&&record(body.result.chat)&&Number.isSafeInteger(body.result.chat.id)&&String(body.result.chat.id)===expectedChat){
  return {outcome:'sent',ok:true,telegramMessageId:Number(body.result.message_id)};
 }
 if(status>=400&&status<500&&record(body)&&body.ok===false&&body.error_code===status){
  return {outcome:'rejected',ok:false,error:typeof body.description==='string'?body.description.slice(0,1000):'Telegram rechazó el envío.',errorCode:status};
 }
 return {outcome:'unknown',ok:false,error:'No se pudo verificar el resultado original del envío. No lo repita automáticamente.'};
}
