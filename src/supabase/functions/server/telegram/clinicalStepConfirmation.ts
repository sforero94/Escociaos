import { clinicalAction, clinicalIntent, prepareClinicalTelegram, queryClinicalTelegram, sameClinical, type ClinicalAction, type ClinicalClient, type ClinicalIntent, type ClinicalResult } from './clinicalStepConfirmationProtocol.ts';

type Message={message_id:number;chat:{id:number;type:string};text?:string};
type Native={from?:{id:number};chat?:{id:number;type:string};message?:Message;callbackQuery?:{data?:string;message?:Message}};
export function privateClinicalAction(ctx:Native):ClinicalAction{
 const m=ctx.callbackQuery?.message??ctx.message;
 if(ctx.chat?.type!=='private'||m?.chat.type!=='private'||ctx.from?.id!==ctx.chat.id||m.chat.id!==ctx.chat.id)throw Error('Use el mensaje privado original.');
 return clinicalAction({sender:ctx.from.id,chatId:m.chat.id,messageId:m.message_id});
}
const recovery={inline_keyboard:[[{text:'🔎 Verificar',callback_data:'hsc:status'},{text:'❌ Cancelar intento',callback_data:'hsc:resolve'}]]};
const retry={inline_keyboard:[[{text:'Preparar revisión original',callback_data:'hsc:prepare'}],...recovery.inline_keyboard]};
const review={inline_keyboard:[[{text:'✅ Confirmar aplicación',callback_data:'hsc:post'}],...recovery.inline_keyboard]};
export function clinicalPreview(result:ClinicalResult){
 if(result.state!=='pending'||!result.original||!result.intent)throw Error('Revisión pendiente requerida.');
 const o=result.original,s=o.steps.find(s=>s.id===result.intent!.stepId)!;
 const short=(x:unknown)=>String(x??'').slice(0,500);
 return `Revisar aplicación de tratamiento\n🐄 ${short(o.animal.nombre)} (#${o.animal.numero??'sin chapeta'})\n${short(o.header.nombre)}\nPaso ${s.paso_num}: ${short(s.descripcion)}\nProgramado: ${s.fecha_programada}\nAplicado: ${result.intent.fechaEjecutada}\n\nConfirme únicamente si coincide con lo aplicado.`;
}
export async function renderClinical(ctx:any,action:ClinicalAction,result:ClinicalResult){
 const pending=result.state==='pending';
 const text=pending?clinicalPreview(result):result.state==='committed'?`✅ Aplicación registrada el ${result.intent!.fechaEjecutada}. La evidencia original está verificada.`:result.state==='canceled'?'El intento original está cancelado.':'No hay una reserva verificable. Conserve este mensaje para verificar o cancelar.';
 await ctx.api.editMessageText(action.chatId,action.messageId,text,{reply_markup:pending?review:result.state==='unknown'?retry:{inline_keyboard:[]}});
}
function finishSession(ctx:any,action:ClinicalAction,result:ClinicalResult){
 if(['committed','canceled'].includes(result.state)&&sameClinical(ctx.session.pendientePasoClinico?.action,action))ctx.session.pendientePasoClinico=null;
}
/** Creates one durable private anchor. Preparation and rendering never post. */
export async function beginClinicalStep(ctx:any,client:ClinicalClient,intent:ClinicalIntent){
 const original=ctx.callbackQuery?.message??ctx.message;
 privateClinicalAction({...ctx,callbackQuery:{message:original}});
 const p=clinicalIntent(intent);
 if(ctx.session.pendientePasoClinico)throw Error('Verifique o cancele el intento anterior desde su mensaje original.');
 const message=await ctx.reply('Preparando la revisión. Conserve este mensaje para verificar o cancelar el intento original.',{reply_markup:retry});
 const action=privateClinicalAction({...ctx,callbackQuery:{message}});
 ctx.session.pendientePasoClinico={action,intent:p};
 try{
  const result=await prepareClinicalTelegram(client,action,p);
  await renderClinical(ctx,action,result);finishSession(ctx,action,result);
 }catch{await ctx.reply('No pude verificar la preparación. Conserve el mensaje original y sus botones; no cree un reemplazo.');}
 return 'prepared' as const;
}
/** Independent of conversation/session survival; native action is the durable key. */
export async function handleClinicalRecovery(ctx:any,next:()=>Promise<void>,client:ClinicalClient,afterCommit?:(r:ClinicalResult)=>Promise<void>){
 if(!ctx.callbackQuery?.data?.startsWith('hsc:'))return next();
 await ctx.answerCallbackQuery();
 try{
  const action=privateClinicalAction(ctx),mode=ctx.callbackQuery.data.slice(4);
  if(!['prepare','post','status','resolve'].includes(mode))throw Error('Operación inválida.');
  let result:ClinicalResult;
  if(mode==='prepare'){
   const pending=ctx.session.pendientePasoClinico;
   if(!pending||!sameClinical(pending.action,action))throw Error('Conserve el intento original; verifique o cancele.');
   result=await prepareClinicalTelegram(client,action,pending.intent);
  }else if(mode==='post'){
   const original=await queryClinicalTelegram(client,action,'status');
   // Telegram supplies the actual original message text. A callback cannot
   // post until that exact prepared target/date preview was delivered.
   result=original.state==='pending'&&ctx.callbackQuery.message.text===clinicalPreview(original)
    ?await queryClinicalTelegram(client,action,'post',original):original;
  }else result=await queryClinicalTelegram(client,action,mode);
  finishSession(ctx,action,result);
  // Notification failure must never be described as a failed database write.
  if(result.state==='committed'&&afterCommit){try{await afterCommit(result);}catch{/* The same private action still recovers durable proof. */}}
  try{await renderClinical(ctx,action,result);}catch{await ctx.reply('El resultado fue verificado. Conserve el mensaje original para consultarlo.');}
 }catch{await ctx.reply('No pude verificar el intento original. Conserve su mensaje; no cree un reemplazo.');}
}
