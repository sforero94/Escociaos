import {birthAction,type BirthAction,type BirthClient} from './birthCreationProtocol.ts';
import {birthUndoTelegram,type BirthUndoResult} from './birthUndoProtocol.ts';
type Message={message_id:number;chat:{id:number;type:string};text?:string;forward_origin?:unknown;forward_date?:unknown;is_automatic_forward?:boolean};
type Native={from?:{id:number};chat?:{id:number;type:string};callbackQuery?:{data?:string;message?:Message}};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function birthUndoOpenCallback(eventId:string){if(!UUID.test(eventId))throw Error('Evento inválido.');return 'hbu:begin:'+eventId;}
export function privateBirthUndoAction(ctx:Native):BirthAction{
 const m=ctx.callbackQuery?.message;
 if(ctx.chat?.type!=='private'||m?.chat.type!=='private'||ctx.from?.id!==ctx.chat.id||m.chat.id!==ctx.chat.id||m.forward_origin!==undefined||m.forward_date!==undefined||m.is_automatic_forward)throw Error('Use el mensaje privado original, sin reenviarlo.');
 return birthAction({sender:ctx.from.id,chatId:m.chat.id,messageId:m.message_id});
}
const recovery={inline_keyboard:[[{text:'🔎 Verificar deshacer',callback_data:'hbu:status'},{text:'❌ Cancelar intento',callback_data:'hbu:resolve'}]]};
const review={inline_keyboard:[[{text:'Confirmar deshacer parto y ficha',callback_data:'hbu:post'}],...recovery.inline_keyboard]};
export function birthUndoPreview(r:BirthUndoResult){
 if(r.state!=='pending'||!r.original)throw Error('Revisión original pendiente requerida.');const b=r.original,e=b.event,c=b.calf,m=b.snapshot.graph.animal,father=c.padre_toro_id?b.snapshot.toros.find(t=>t.id===c.padre_toro_id):null,short=(v:unknown)=>String(v??'Sin registrar').slice(0,500);
 if(c.padre_toro_id&&!father)throw Error('No pude verificar el padre capturado.');
 const text=`Revisar deshacer parto y ficha de cría\n🐄 Madre: ${short(m.nombre)} (#${m.numero??'sin chapeta'})\nMadre ID: ${e.animal_id}\nParto: ${e.id}\nFecha: ${e.fecha} (${e.fecha_confianza})\nDestino: ${e.cria_destino}\nCría: ${short(c.nombre)} (#${c.numero??'sin chapeta'})\nCría ID: ${c.id}\nMadre de la cría: ${c.madre_id}\nNacimiento: ${c.fecha_nacimiento} (${c.fecha_nacimiento_confianza})\nSexo: ${c.sexo} · Etapa: ${c.etapa} · Estado: ${c.estado}\nFinca ID: ${c.finca_id??'Sin registrar'}\nPadre: ${father?short(father.nombre):'Sin registrar'}\nPadre ID: ${c.padre_toro_id??'Sin registrar'}\nRegistró: ${short(b.creation.actor.displayName)} (Telegram)\nRegistro original: ${e.created_at}\nRevisión válida para: ${r.effectiveDate}\n\nSe eliminarán juntos únicamente este parto y esta ficha automática intacta. Se conservarán dos trazas de corrección y la evidencia original. Cualquier cambio o referencia puede impedir la operación. Requiere Gerencia vigente.\nConfirme solo si corresponde deshacer exactamente este par.`;
 if(text.length>3500)throw Error('La revisión completa no cabe en este mensaje. Verifique o cancele.');return text;
}
export async function renderBirthUndo(ctx:any,action:BirthAction,r:BirthUndoResult,selector:string|null=null){
 let keyboard=recovery,text:string;
 if(r.state==='pending'){try{text=birthUndoPreview(r);keyboard=review;}catch{text='No pude mostrar la revisión completa. No se permite confirmar; verifique o cancele el intento original.';}}
 else if(r.state==='committed'){text='↩️ Deshacer verificado: el parto y la ficha de su cría se retiraron juntos. Las dos trazas y la evidencia originales se conservan.';keyboard={inline_keyboard:[]};}
 else if(r.state==='canceled'){text='Intento cancelado. No se deshizo el par. Una nueva revisión requiere una acción explícita.';const target=r.eventId??selector;keyboard=target?{inline_keyboard:[[{text:'Solicitar nueva revisión',callback_data:r.eventId?'hbu:new':'hbu:new:'+target}]]}:{inline_keyboard:[]};}
 else text='No hay un deshacer verificable para este mensaje. Verifique o cancele; no cree un reemplazo tras un resultado desconocido.';
 await ctx.api.editMessageText(action.chatId,action.messageId,text,{reply_markup:keyboard});
}
/** Native message identity, without conversation/session state, recovers the original. */
export async function handleBirthUndoRecovery(ctx:any,next:()=>Promise<void>,client:BirthClient){
 const data=ctx.callbackQuery?.data;if(typeof data!=='string'||!data.startsWith('hbu:'))return next();await ctx.answerCallbackQuery();
 try{
  const action=privateBirthUndoAction(ctx);let result:BirthUndoResult;let selector:string|null=null;
  if(data.startsWith('hbu:begin:')){const target=data.slice(10);if(!UUID.test(target)||new TextEncoder().encode(data).length>64)throw Error('Solicitud inválida.');selector=target;result=await birthUndoTelegram(client,action,'prepare',target);}
  else if(data==='hbu:new'||data.startsWith('hbu:new:')){
   const selected=data==='hbu:new'?null:data.slice(8);if(selected!==null&&!UUID.test(selected))throw Error('Solicitud inválida.');
   const original=await birthUndoTelegram(client,action,'status');const target=original.eventId??selected;if(original.state!=='canceled'||!target||(original.eventId&&selected&&original.eventId!==selected))throw Error('Cancele y verifique el intento original primero.');
   const message=await ctx.reply('Solicitando una nueva revisión del parto y su cría. Conserve este mensaje.',{reply_markup:{inline_keyboard:[[{text:'Preparar esta revisión',callback_data:birthUndoOpenCallback(target)}],...recovery.inline_keyboard]}});
   const fresh=privateBirthUndoAction({...ctx,callbackQuery:{message}});if(fresh.messageId===action.messageId)throw Error('Falta el nuevo mensaje privado.');
   result=await birthUndoTelegram(client,fresh,'prepare',target);await renderBirthUndo(ctx,fresh,result);return;
  }else{
   const mode=data.slice(4);if(!['post','status','resolve'].includes(mode))throw Error('Acción inválida.');
   if(mode==='post'){
    const original=await birthUndoTelegram(client,action,'status');
    result=original.state==='pending'&&ctx.callbackQuery.message.text===birthUndoPreview(original)?await birthUndoTelegram(client,action,'post',null,original):original;
   }else result=await birthUndoTelegram(client,action,mode as 'status'|'resolve');
  }
  await renderBirthUndo(ctx,action,result,selector);
 }catch{await ctx.reply('No pude verificar el deshacer original. Conserve su mensaje y vuelva a usar sus botones para verificar el intento original; no cree un reemplazo tras un resultado desconocido.').catch(()=>{});}
}
