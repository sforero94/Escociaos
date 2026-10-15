import { alertResponseAction, alertResponseIntent, prepareAlertResponseTelegram, queryAlertResponseTelegram, sameAlertResponse, type AlertResponseAction, type AlertResponseClient, type AlertResponseIntent, type AlertResponseResult } from './alertResponseProtocol.ts';

type Message={message_id:number;chat:{id:number;type:string};text?:string};
type Native={from?:{id:number};chat?:{id:number;type:string};message?:Message;callbackQuery?:{data?:string;message?:Message}};
export function privateAlertResponseAction(ctx:Native):AlertResponseAction{
 const m=ctx.callbackQuery?.message??ctx.message;
 if(ctx.chat?.type!=='private'||m?.chat.type!=='private'||ctx.from?.id!==ctx.chat.id||m.chat.id!==ctx.chat.id)throw Error('Use el mensaje privado original.');
 return alertResponseAction({sender:ctx.from.id,chatId:m.chat.id,messageId:m.message_id});
}
const recovery={inline_keyboard:[[{text:'🔎 Verificar',callback_data:'har:status'},{text:'❌ Cancelar intento',callback_data:'har:resolve'}]]};
const retry={inline_keyboard:[[{text:'Preparar revisión original',callback_data:'har:prepare'}],...recovery.inline_keyboard]};
const review={inline_keyboard:[[{text:'✅ Confirmar respuesta',callback_data:'har:post'}],...recovery.inline_keyboard]};
export function alertResponsePreview(result:AlertResponseResult){
 if(result.state!=='pending'||!result.original||!result.intent)throw Error('Revisión pendiente requerida.');
 const o=result.original,c=o.clinical,step=c?.steps.find(s=>s.id===o.alert.paso_id);
 const labels:Record<string,string>={secado_due:'Secado pendiente',tratamiento_paso:'Paso de tratamiento',rechequeo_due:'Rechequeo pendiente',servicio_sin_confirmacion:'Servicio sin confirmar',parto_proximo:'Parto próximo'};
 const short=(x:unknown)=>String(x??'').slice(0,500);
 return `Revisar respuesta de alerta\n🐄 ${short(o.animal?.nombre??'Sin animal')} (#${o.animal?.numero??'sin chapeta'})\nAlerta: ${labels[String(o.alert.tipo)]}\nProgramada: ${o.alert.fecha_programada}${c?`\nTratamiento: ${short(c.header.nombre)}\nPaso ${step?.paso_num}: ${short(step?.descripcion)}\nProgramado: ${step?.fecha_programada}`:''}\nRespuesta: ${result.intent.respuesta}\nFecha: ${result.intent.fecha}\n${o.alert.tipo==='secado_due'&&result.intent.respuesta==='si'?'Se registrará un evento de secado para este animal y fecha.':'Se registrará la respuesta sin crear un evento.'}\n\nConfirme únicamente si coincide con lo realizado.`;
}
export async function renderAlertResponse(ctx:any,action:AlertResponseAction,result:AlertResponseResult){
 const pending=result.state==='pending';
 const text=pending?alertResponsePreview(result):result.state==='committed'?`✅ Respuesta registrada el ${result.intent!.fecha}. La evidencia original está verificada.`:result.state==='canceled'?'El intento original está cancelado.':'No hay una reserva verificable. Conserve este mensaje para verificar o cancelar.';
 await ctx.api.editMessageText(action.chatId,action.messageId,text,{reply_markup:pending?review:result.state==='unknown'?retry:{inline_keyboard:[]}});
}
function finishSession(ctx:any,action:AlertResponseAction,result:AlertResponseResult){
 if(['committed','canceled'].includes(result.state)&&sameAlertResponse(ctx.session.pendienteRespuestaAlerta?.action,action))ctx.session.pendienteRespuestaAlerta=null;
}
/** Creates one durable private anchor. Preparation and rendering never post. */
export async function beginAlertResponse(ctx:any,client:AlertResponseClient,intent:AlertResponseIntent){
 const original=ctx.callbackQuery?.message??ctx.message;
 privateAlertResponseAction({...ctx,callbackQuery:{message:original}});
 const p=alertResponseIntent(intent);
 if(ctx.session.pendienteRespuestaAlerta)throw Error('Verifique o cancele el intento anterior desde su mensaje original.');
 const message=await ctx.reply('Preparando la revisión. Conserve este mensaje para verificar o cancelar el intento original.',{reply_markup:retry});
 const action=privateAlertResponseAction({...ctx,callbackQuery:{message}});
 ctx.session.pendienteRespuestaAlerta={action,intent:p};
 try{
  const result=await prepareAlertResponseTelegram(client,action,p);
  await renderAlertResponse(ctx,action,result);finishSession(ctx,action,result);
 }catch{await ctx.reply('No pude verificar la preparación. Conserve el mensaje original y sus botones; no cree un reemplazo.');}
 return 'prepared' as const;
}
/** Independent of conversation/session survival; native action is the durable key. */
export async function handleAlertResponseRecovery(ctx:any,next:()=>Promise<void>,client:AlertResponseClient,afterCommit?:(r:AlertResponseResult)=>Promise<void>){
 if(!ctx.callbackQuery?.data?.startsWith('har:'))return next();
 await ctx.answerCallbackQuery();
 try{
  const action=privateAlertResponseAction(ctx),mode=ctx.callbackQuery.data.slice(4);
  if(!['prepare','post','status','resolve'].includes(mode))throw Error('Operación inválida.');
  let result:AlertResponseResult;
  if(mode==='prepare'){
   const pending=ctx.session.pendienteRespuestaAlerta;
   if(!pending||!sameAlertResponse(pending.action,action))throw Error('Conserve el intento original; verifique o cancele.');
   result=await prepareAlertResponseTelegram(client,action,pending.intent);
  }else if(mode==='post'){
   const original=await queryAlertResponseTelegram(client,action,'status');
   // Telegram supplies the actual original message text. A callback cannot
   // post until that exact prepared target/date preview was delivered.
   result=original.state==='pending'&&ctx.callbackQuery.message.text===alertResponsePreview(original)
    ?await queryAlertResponseTelegram(client,action,'post',original):original;
  }else result=await queryAlertResponseTelegram(client,action,mode);
  finishSession(ctx,action,result);
  // Notification failure must never be described as a failed database write.
  if(result.state==='committed'&&afterCommit){try{await afterCommit(result);}catch{/* The same private action still recovers durable proof. */}}
  try{await renderAlertResponse(ctx,action,result);}catch{await ctx.reply('El resultado fue verificado. Conserve el mensaje original para consultarlo.');}
 }catch{await ctx.reply('No pude verificar el intento original. Conserve su mensaje; no cree un reemplazo.');}
}
