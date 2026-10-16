import {birthUndoOpenCallback} from './birthUndo.ts';
import {birthAction,birthIntent,birthTelegram,sameBirth,type BirthAction,type BirthClient,type BirthIntent,type BirthResult} from './birthCreationProtocol.ts';
type Message={message_id:number;chat:{id:number;type:string};text?:string};
type Native={from?:{id:number};chat?:{id:number;type:string};message?:Message;callbackQuery?:{data?:string;message?:Message}};
export function privateBirthAction(ctx:Native):BirthAction{const m=ctx.callbackQuery?ctx.callbackQuery.message:ctx.message;if(ctx.chat?.type!=='private'||m?.chat.type!=='private'||ctx.from?.id!==ctx.chat.id||m.chat.id!==ctx.chat.id)throw Error('Use el mensaje privado original.');return birthAction({sender:ctx.from.id,chatId:m.chat.id,messageId:m.message_id});}
const recovery={inline_keyboard:[[{text:'🔎 Verificar',callback_data:'hbt:status'},{text:'❌ Cancelar intento',callback_data:'hbt:resolve'}]]};
const retry={inline_keyboard:[[{text:'Preparar revisión original',callback_data:'hbt:prepare'}],...recovery.inline_keyboard]};
const review={inline_keyboard:[[{text:'✅ Confirmar parto revisado',callback_data:'hbt:post'}],...recovery.inline_keyboard]};
export function birthReviewReady(r:BirthResult){const months=r.original?.config.find(v=>v.clave==='meses_gestacion_default')?.valor;return typeof months==='number'&&Number.isFinite(months)&&months>0;}
export function birthPreview(r:BirthResult){
 if(r.state!=='pending'||!r.original||!r.intent||!r.plan)throw Error('Revisión original pendiente requerida.');const b=r.original,p=r.intent,c=r.plan.calf,short=(v:unknown)=>String(v??'').slice(0,500);
 const warnings:string[]=[];const last=b.view.ultimo_parto_fecha,latest=b.view.ultimo_evento_fecha,months=b.config.find(v=>v.clave==='meses_gestacion_default')?.valor;
 if(typeof last==='string'&&typeof months==='number'&&Math.abs(Date.parse(p.fecha+'T00:00:00Z')-Date.parse(last+'T00:00:00Z'))/86400000<Math.round(months*30.44))warnings.push(`Ya hay un parto registrado el ${last}. Dos partos en menos de ${months} meses no son biológicamente posibles; revise si es una corrección.`);
 if(typeof latest==='string'&&latest>p.fecha)warnings.push(`Hay un evento posterior (${latest}); este parto puede no cambiar el estado actual.`);
 const father=c?.padre_toro_id?b.toros.find(t=>t.id===c.padre_toro_id):null;
 return `Revisar parto\n🐄 ${short(b.graph.animal.nombre)} (#${b.graph.animal.numero??'sin chapeta'})\nAnimal: ${p.animalId}\nFecha del parto: ${p.fecha} (exacta)\nDestino: ${p.criaDestino??'Sin registrar'}\n${c?`Ternera: #${c.numero} SIN NOMBRE\nMadre: ${p.animalId}\nPadre: ${father?short(father.nombre):'Sin registrar'}\nParto y ficha se guardan juntos.`:'Este destino no crea ficha de cría.'}\nRevisión válida para: ${r.effectiveDate}${warnings.length?'\n⚠️ '+warnings.join('\n⚠️ '):''}${birthReviewReady(r)?'':'\nNo pude comprobar la configuración original. Verifique o cancele este intento.'}\n\nConfirme únicamente si coincide con el parto ocurrido.`;
}
export async function renderBirth(ctx:any,action:BirthAction,result:BirthResult){const pending=result.state==='pending';const text=pending?birthPreview(result):result.state==='committed'?`✅ Parto registrado el ${result.intent!.fecha}. ${result.receipt!.calf?`Ternera #${result.receipt!.calf.numero} SIN NOMBRE.`:'Sin ficha de cría para este destino.'} La evidencia original está verificada.`:result.state==='canceled'?'El intento original está cancelado.':'No hay una reserva verificable. Conserve el mensaje para verificar o cancelar.';await ctx.api.editMessageText(action.chatId,action.messageId,text,{reply_markup:pending?(birthReviewReady(result)?review:recovery):result.state==='unknown'?retry:result.state==='committed'?{inline_keyboard:[[{text:result.receipt!.calf?'↩️ Revisar deshacer parto y cría':'↩️ Deshacer',callback_data:result.receipt!.calf?birthUndoOpenCallback(String(result.plan!.events[0].id)):'hato_ev_undo:'+result.plan!.events[0].id}]]}:{inline_keyboard:[]}});}
function finish(ctx:any,action:BirthAction,result:BirthResult){if(['committed','canceled'].includes(result.state)&&sameBirth(ctx.session.pendienteParto?.action,action))ctx.session.pendienteParto=null;}
export async function beginBirth(ctx:any,client:BirthClient,intent:BirthIntent){
 privateBirthAction(ctx);const p=birthIntent(intent);if(ctx.session.pendienteParto)throw Error('Verifique o cancele el intento anterior desde su mensaje original.');
 const message=await ctx.reply('Preparando la revisión del parto. Conserve este mensaje para verificar o cancelar.',{reply_markup:retry});const action=privateBirthAction({...ctx,callbackQuery:{message}});ctx.session.pendienteParto={action,intent:p};
 try{const result=await birthTelegram(client,action,'prepare',p);await renderBirth(ctx,action,result);finish(ctx,action,result);}catch{await ctx.reply('No pude verificar la preparación. Conserve el mensaje original y sus botones; no cree un reemplazo.');}return action;
}
/** Outside a conversation replay: native message identity alone recovers the protected request. */
export async function handleBirthRecovery(ctx:any,next:()=>Promise<void>,client:BirthClient){
 if(!ctx.callbackQuery?.data?.startsWith('hbt:'))return next();await ctx.answerCallbackQuery();
 try{const action=privateBirthAction(ctx),mode=ctx.callbackQuery.data.slice(4);if(!['prepare','post','status','resolve'].includes(mode))throw Error('Operación inválida.');let result:BirthResult;
  if(mode==='prepare'){const p=ctx.session.pendienteParto;if(!p||!sameBirth(p.action,action))throw Error('Conserve el mensaje original; verifique o cancele.');result=await birthTelegram(client,action,'prepare',p.intent);}
  else if(mode==='post'){const original=await birthTelegram(client,action,'status');result=original.state==='pending'&&birthReviewReady(original)&&ctx.callbackQuery.message.text===birthPreview(original)?await birthTelegram(client,action,'post',null,original):original;}
  else result=await birthTelegram(client,action,mode);finish(ctx,action,result);
  try{await renderBirth(ctx,action,result);}catch{await ctx.reply('El resultado fue verificado. Conserve el mensaje original para consultarlo.');}
 }catch{await ctx.reply('No pude verificar el intento original. Conserve su mensaje; no cree un reemplazo.');}
}
export async function confirmBirth(conversation:any,ctx:any,clientFactory:()=>BirthClient,intent:BirthIntent){
 const p=birthIntent(intent);privateBirthAction(ctx);
 await conversation.external(async(outside:any)=>{if(outside.from?.id!==ctx.from?.id||outside.chat?.id!==ctx.chat?.id)throw Error('Identidad cambiada.');await beginBirth(outside,clientFactory(),p);return null;});return conversation.halt();
}
