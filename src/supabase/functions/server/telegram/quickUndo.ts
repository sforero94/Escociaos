import {quickAction,type QuickAction,type QuickClient} from './quickCreationProtocol.ts';
import {quickUndoTelegram,type QuickUndoResult} from './quickUndoProtocol.ts';
type Message={message_id:number;chat:{id:number;type:string};text?:string;forward_origin?:unknown;forward_date?:unknown;is_automatic_forward?:boolean};
type Native={from?:{id:number};chat?:{id:number;type:string};callbackQuery?:{data?:string;message?:Message}};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function quickUndoOpenCallback(eventId:string){if(!UUID.test(eventId))throw Error('Evento inválido.');return 'hqu:begin:'+eventId;}
export function privateQuickUndoAction(ctx:Native):QuickAction{
 const m=ctx.callbackQuery?.message;
 if(ctx.chat?.type!=='private'||m?.chat.type!=='private'||ctx.from?.id!==ctx.chat.id||m.chat.id!==ctx.chat.id||m.forward_origin!==undefined||m.forward_date!==undefined||m.is_automatic_forward)throw Error('Use el mensaje privado original, sin reenviarlo.');
 return quickAction({sender:ctx.from.id,chatId:m.chat.id,messageId:m.message_id});
}
const recovery={inline_keyboard:[[{text:'🔎 Verificar deshacer',callback_data:'hqu:status'},{text:'❌ Cancelar intento',callback_data:'hqu:resolve'}]]};
const review={inline_keyboard:[[{text:'Confirmar deshacer evento y uso',callback_data:'hqu:post'}],...recovery.inline_keyboard]};
export function quickUndoPreview(r:QuickUndoResult){
 if(r.state!=='pending'||!r.original)throw Error('Revisión original pendiente requerida.');const b=r.original,s=b.snapshot,e=b.event,u=b.usage,animal=s.graph.animal,bull=s.toros.find(t=>t.id===e.toro_id),stock=s.stock.find(l=>l.pajilla_id===u.pajilla_id),short=(v:unknown)=>String(v??'Sin dato').slice(0,500);
 if(!bull||!stock)throw Error('No pude verificar las referencias originales.');
 const text=`Revisar deshacer inseminación y uso de pajilla\n🐄 ${short(animal.nombre)} (#${animal.numero??'sin chapeta'})\nAnimal: ${e.animal_id}\nEvento: ${e.id}\nFecha: ${e.fecha} (${e.fecha_confianza})\nToro: ${short(bull.nombre)}\nToro ID: ${e.toro_id}\nLote: ${u.pajilla_id}\nUso: ${u.id} · ${u.fecha_uso}\nStock observado: ${stock.cantidad_actual} → ${Number(stock.cantidad_actual)+1} al retirar este uso\nRegistró: ${short(b.creation.actor.displayName)} (Telegram)\nRegistro original: ${e.created_at}\nRevisión válida para: ${r.effectiveDate}\n\nSe eliminarán juntos únicamente este evento y su uso protegido. Se conserva la traza de corrección y los demás registros. Requiere Gerencia vigente.\nConfirme solo si corresponde deshacer exactamente este registro.`;
 if(text.length>3500)throw Error('La revisión completa no cabe en este mensaje. Verifique o cancele.');return text;
}
export async function renderQuickUndo(ctx:any,action:QuickAction,r:QuickUndoResult,selector:string|null=null){
 let keyboard=recovery,text:string;
 if(r.state==='pending'){try{text=quickUndoPreview(r);keyboard=review;}catch{text='No pude mostrar la revisión completa. No se permite confirmar; verifique o cancele el intento original.';}}
 else if(r.state==='committed'){text='↩️ Deshacer verificado: el evento y su uso de pajilla se retiraron juntos. La traza y la evidencia originales se conservan.';keyboard={inline_keyboard:[]};}
 else if(r.state==='canceled'){text='Intento cancelado. No se deshizo el par. Una nueva revisión requiere una acción explícita.';const target=r.eventId??selector;keyboard=target?{inline_keyboard:[[{text:'Solicitar nueva revisión',callback_data:r.eventId?'hqu:new':'hqu:new:'+target}]]}:{inline_keyboard:[]};}
 else text='No hay un deshacer verificable para este mensaje. Verifique o cancele; no cree un reemplazo tras un resultado desconocido.';
 await ctx.api.editMessageText(action.chatId,action.messageId,text,{reply_markup:keyboard});
}
/** Native message identity, without conversation/session state, recovers the original. */
export async function handleQuickUndoRecovery(ctx:any,next:()=>Promise<void>,client:QuickClient){
 const data=ctx.callbackQuery?.data;if(typeof data!=='string'||!data.startsWith('hqu:'))return next();await ctx.answerCallbackQuery();
 try{
  const action=privateQuickUndoAction(ctx);let result:QuickUndoResult;let selector:string|null=null;
  if(data.startsWith('hqu:begin:')){const target=data.slice(10);if(!UUID.test(target)||new TextEncoder().encode(data).length>64)throw Error('Solicitud inválida.');selector=target;result=await quickUndoTelegram(client,action,'prepare',target);}
  else if(data==='hqu:new'||data.startsWith('hqu:new:')){
   const selected=data==='hqu:new'?null:data.slice(8);if(selected!==null&&!UUID.test(selected))throw Error('Solicitud inválida.');
   const original=await quickUndoTelegram(client,action,'status');const target=original.eventId??selected;if(original.state!=='canceled'||!target||(original.eventId&&selected&&original.eventId!==selected))throw Error('Cancele y verifique el intento original primero.');
   const message=await ctx.reply('Solicitando una nueva revisión del par. Conserve este mensaje.',{reply_markup:{inline_keyboard:[[{text:'Preparar esta revisión',callback_data:quickUndoOpenCallback(target)}],...recovery.inline_keyboard]}});
   const fresh=privateQuickUndoAction({...ctx,callbackQuery:{message}});if(fresh.messageId===action.messageId)throw Error('Falta el nuevo mensaje privado.');
   result=await quickUndoTelegram(client,fresh,'prepare',target);await renderQuickUndo(ctx,fresh,result);return;
  }else{
   const mode=data.slice(4);if(!['post','status','resolve'].includes(mode))throw Error('Acción inválida.');
   if(mode==='post'){
    const original=await quickUndoTelegram(client,action,'status');
    result=original.state==='pending'&&ctx.callbackQuery.message.text===quickUndoPreview(original)?await quickUndoTelegram(client,action,'post',null,original):original;
   }else result=await quickUndoTelegram(client,action,mode as 'status'|'resolve');
  }
  await renderQuickUndo(ctx,action,result,selector);
 }catch{await ctx.reply('No pude verificar el deshacer original. Conserve su mensaje y use Verificar deshacer; no cree un reemplazo tras un resultado desconocido.').catch(()=>{});}
}
