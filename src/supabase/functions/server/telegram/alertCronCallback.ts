import { privateAlertResponseAction, beginAlertResponse } from './alertResponse.ts';
import { beginClinicalStep } from './clinicalStepConfirmation.ts';
import { cronObject, cronUuid } from '../alertCronPlan.ts';
import type { CronRpc } from './alertCronDelivery.ts';
/** Trusted webhook native action supplies sender/chat/message; no session or legacy id adoption. */
export async function handleAlertCronCallback(ctx:any,client:CronRpc,today:()=>string){
  const match=/^hjd:([0-9a-f-]{36}):(si|no|otro)$/.exec(ctx.callbackQuery?.data??'');
  if(!match||!cronUuid(match[1]))throw Error('Original frozen delivery required.');
  const action=privateAlertResponseAction(ctx),message=ctx.callbackQuery.message;
  if(['forward_origin','forward_date','forward_from','forward_from_chat','forward_sender_name'].some(k=>message[k]!==undefined)||typeof message.text!=='string')throw Error('Original private message required.');
  const {data,error}=await client.rpc('fn_alert_cron_private_callback',{p_delivery:match[1],p_sender:action.sender,p_chat_id:action.chatId,p_message_id:action.messageId,p_text:message.text});
  if(error||!cronObject(data)||Object.keys(data).sort().join('|')!=='action|alertId|deliveryId|evidence|stepId|type|version'||data.version!==1||data.deliveryId!==match[1]||!cronUuid(data.alertId)||!cronObject(data.action)||Object.keys(data.action).sort().join('|')!=='chatId|messageId|sender'||data.action.sender!==action.sender||data.action.chatId!==action.chatId||data.action.messageId!==action.messageId||!cronObject(data.evidence)||Object.keys(data.evidence).sort().join('|')!=='action|delivery_id|kind|message_id|recorded_at'||data.evidence.delivery_id!==match[1]||data.evidence.message_id!==action.messageId||!['accepted_api','original_private_callback'].includes(String(data.evidence.kind))||typeof data.evidence.recorded_at!=='string'||!Number.isFinite(Date.parse(data.evidence.recorded_at))||!['secado_due','tratamiento_paso','rechequeo_due','servicio_sin_confirmacion','parto_proximo'].includes(String(data.type)))throw Error('Original private delivery evidence could not be verified.');
  if(data.evidence.kind==='accepted_api'?data.evidence.action!==null:!cronObject(data.evidence.action)||Object.keys(data.evidence.action).sort().join('|')!=='chatId|messageId|sender'||data.evidence.action.sender!==action.sender||data.evidence.action.chatId!==action.chatId||data.evidence.action.messageId!==action.messageId)throw Error('Original independent evidence action required.');
  if(data.type==='tratamiento_paso'&&match[2]==='si'){
    if(!cronUuid(data.stepId))throw Error('Existing clinical step required.');
    await beginClinicalStep(ctx,client,{version:1,stepId:data.stepId,fechaEjecutada:today(),alertId:data.alertId});
  }else await beginAlertResponse(ctx,client,{version:1,alertId:data.alertId,respuesta:match[2] as 'si'|'no'|'otro',fecha:today()});
}
