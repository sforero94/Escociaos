import {
 canonicalTreatmentProposal, prepareTelegramTreatment, queryTelegramTreatment,
 recoverTelegramTreatment, loadTelegramTreatmentAnimal, type TreatmentProposal, type TreatmentClient,
 type TelegramTreatmentAction, type TelegramTreatmentRecovery,
} from './treatmentCreationProtocol.ts';
import { construirCallbackDeshacerTratamiento } from './eventoHatoUndo.ts';

type Native = {message?:{message_id:number;chat:{id:number;type:string}};from?:{id:number};chat?:{id:number;type:string};callbackQuery?:{data?:string;message?:{message_id:number;chat:{id:number;type:string}}}};
export const treatmentButtons = {inline_keyboard:[
 [{text:'✅ Guardar intento original',callback_data:'htc:post'}],
 [{text:'🔎 Verificar',callback_data:'htc:status'},{text:'❌ Cancelar intento',callback_data:'htc:resolve'}],
]};
export function privateTreatmentAction(ctx:Native,expected?:TelegramTreatmentAction):TelegramTreatmentAction{
 const m=ctx.callbackQuery?.message,sender=ctx.from?.id;
 if(!Number.isSafeInteger(sender)||!sender||sender<1||ctx.chat?.type!=='private'||ctx.chat.id!==sender||!m||m.chat.type!=='private'||m.chat.id!==sender||!Number.isSafeInteger(m.message_id)||m.message_id<1)throw Error('Se requiere el botón del mensaje privado original.');
 const action={sender,chatId:m.chat.id,messageId:m.message_id};
 if(expected&&!sameAction(action,expected))throw Error('Se requiere el botón del mensaje privado original.');
 return action;
}
export async function readOriginalTreatmentAnimal(client:TreatmentClient,ctx:Native,animalId:string){
 const message=ctx.message??ctx.callbackQuery?.message;
 return loadTelegramTreatmentAnimal(client,privateTreatmentAction({...ctx,callbackQuery:{message}}),animalId);
}
export function sameAction(a:TelegramTreatmentAction|null|undefined,b:TelegramTreatmentAction){return !!a&&a.sender===b.sender&&a.chatId===b.chatId&&a.messageId===b.messageId;}
export async function renderTreatment(ctx:{api:{editMessageText:(chat:number,message:number,text:string,options?:unknown)=>Promise<unknown>}},action:TelegramTreatmentAction,result:TelegramTreatmentRecovery){
 let text='El resultado sigue pendiente. Verifique, reintente o cancele el intento original.';
 let keyboard:unknown=treatmentButtons;
 if(result.state==='committed'&&result.receipt&&result.payload){
  const p=result.payload;
  text=`✅ Tratamiento registrado.\n${p.nombre}\nInicio: ${p.fechaInicio}${p.fechaProximoPaso?`\nPróximo: ${p.fechaProximoPaso}`:''}${p.nota?`\nNota: ${p.nota}`:''}`;
  keyboard={inline_keyboard:[[{text:'↩️ Deshacer',callback_data:construirCallbackDeshacerTratamiento(String(result.receipt.after.header.id))}]]};
 }else if(result.state==='canceled'){text='El intento original está cancelado; no puede registrar otro tratamiento.';keyboard={inline_keyboard:[]};}
 else if(result.state==='unknown'){text='No hay una reserva verificable todavía. Use el intento original para reintentar o cancelar.';}
 await ctx.api.editMessageText(action.chatId,action.messageId,text,{reply_markup:keyboard});
}

/** Runs before conversation replay; callback data carries only the operation. */
export async function handleTreatmentRecovery(ctx:any,next:()=>Promise<void>,client:TreatmentClient){
 if(!ctx.callbackQuery?.data?.startsWith('htc:'))return next();
 await ctx.answerCallbackQuery();
 try{
  const action=privateTreatmentAction(ctx),mode=ctx.callbackQuery.data.slice(4);
  if(!['post','status','resolve'].includes(mode))throw Error('Acción de tratamiento inválida.');
  const result=await recoverTelegramTreatment(client,action,mode);
  if(result.state==='unknown'&&mode==='post'&&sameAction(ctx.session.pendienteTratamiento,action)&&ctx.conversation.active().eventoHato){await next();return;}
  if((result.state==='committed'||result.state==='canceled')&&sameAction(ctx.session.pendienteTratamiento,action)){
   ctx.session.pendienteTratamiento=null;await ctx.conversation.exit('eventoHato');
  }
  await renderTreatment(ctx,action,result);
 }catch{
  await ctx.reply('No pude verificar el intento original. Conserve su mensaje; no cree un reemplazo.');
 }
}

/** Replay records the observed proposal, delivered message and prepare separately. */
export async function confirmTreatment(conversation:any,ctx:any,clientFactory:()=>TreatmentClient,proposal:TreatmentProposal,summary:string){
 const p=canonicalTreatmentProposal(proposal);
 if(ctx.chat?.type!=='private'||ctx.from?.id!==ctx.chat.id)throw Error('Se requiere un chat privado.');
 const prior=await conversation.external((outside:any)=>outside.session.pendienteTratamiento??null);
 if(prior)throw Error('Verifique o cancele el intento anterior desde su mensaje original.');
 const message=await ctx.reply(`${summary}\n\n¿Guardo el tratamiento?`,{reply_markup:treatmentButtons});
 const action=privateTreatmentAction({...ctx,callbackQuery:{message}});
 await conversation.external((outside:any)=>{if(outside.from?.id!==action.sender||outside.chat?.id!==action.chatId)throw Error('Identidad cambiada.');outside.session.pendienteTratamiento=action;return null;});
 const reserve=()=>conversation.external(async()=>{try{return {result:await prepareTelegramTreatment(clientFactory(),action,p),error:false};}catch{return {result:null,error:true};}});
 let prepared=await reserve();
 while(true){
  if(prepared.result&&(prepared.result.state==='committed'||prepared.result.state==='canceled')){
   await conversation.external((outside:any)=>{if(sameAction(outside.session.pendienteTratamiento,action))outside.session.pendienteTratamiento=null;return null;});
   await renderTreatment(ctx,action,prepared.result);return conversation.halt();
  }
  const callback=await conversation.waitForCallbackQuery(['htc:post','htc:status','htc:resolve']);
  await callback.answerCallbackQuery();
  try{
   privateTreatmentAction(callback,action);
   const mode=callback.callbackQuery.data.slice(4) as 'post'|'status'|'resolve';
   if(mode==='post'&&!prepared.result)prepared=await reserve();
   const result=await conversation.external(async()=>{
    try{return mode==='post'&&prepared.result?await queryTelegramTreatment(clientFactory(),prepared.result,'post'):await recoverTelegramTreatment(clientFactory(),action,mode);}
    catch{return null;}
   });
   if(!result){await ctx.api.editMessageText(action.chatId,action.messageId,'Resultado desconocido. Conserve el intento original; verifique, reintente o cancele.',{reply_markup:treatmentButtons});continue;}
   await renderTreatment(ctx,action,result);
   if(result.state==='committed'||result.state==='canceled'){
    await conversation.external((outside:any)=>{if(sameAction(outside.session.pendienteTratamiento,action))outside.session.pendienteTratamiento=null;return null;});return conversation.halt();
   }
  }catch{await ctx.reply('Use el botón del mensaje privado original.');}
 }
}
