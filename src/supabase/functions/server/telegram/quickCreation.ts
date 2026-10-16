import {derivarEstadoReproductivo} from '../calculos-hato.ts';
import {construirHatoConfigDesdeFilas} from '../hato-config-desde-tabla.ts';
import {avisoFechaLejana} from './fechaDDMM.ts';
import {quickAction,quickIntent,quickTelegram,sameQuick,type QuickAction,type QuickClient,type QuickIntent,type QuickResult} from './quickCreationProtocol.ts';
type Message={message_id:number;chat:{id:number;type:string};text?:string};
type Native={from?:{id:number};chat?:{id:number;type:string};message?:Message;callbackQuery?:{data?:string;message?:Message}};
export function privateQuickAction(ctx:Native):QuickAction{const m=ctx.callbackQuery?ctx.callbackQuery.message:ctx.message;if(ctx.chat?.type!=='private'||m?.chat.type!=='private'||ctx.from?.id!==ctx.chat.id||m.chat.id!==ctx.chat.id)throw Error('Use el mensaje privado original.');return quickAction({sender:ctx.from.id,chatId:m.chat.id,messageId:m.message_id});}
const recovery={inline_keyboard:[[{text:'🔎 Verificar',callback_data:'hqt:status'},{text:'❌ Cancelar intento',callback_data:'hqt:resolve'}]]};
const retry={inline_keyboard:[[{text:'Preparar revisión original',callback_data:'hqt:prepare'}],...recovery.inline_keyboard]};
const review={inline_keyboard:[[{text:'✅ Confirmar evento revisado',callback_data:'hqt:post'}],...recovery.inline_keyboard]};
export function quickReviewReady(r:QuickResult){try{if(!r.original)return false;construirHatoConfigDesdeFilas(r.original.config as any);return true;}catch{return false;}}
export function quickPreview(r:QuickResult){
 if(r.state!=='pending'||!r.original||!r.intent||!r.plan)throw Error('Revisión original pendiente requerida.');const b=r.original,p=r.intent,short=(v:unknown)=>String(v??'').slice(0,500);
 const bull=b.toros.find(t=>t.id===p.toroId),lot=b.stock.find(t=>t.pajilla_id===p.pajillaId),warnings:string[]=[];
 const old=avisoFechaLejana(p.fecha,r.effectiveDate!);if(old)warnings.push(old);
 const state=quickReviewReady(r)?derivarEstadoReproductivo(b.view as any,construirHatoConfigDesdeFilas(b.config as any),r.effectiveDate!):null;
 if(p.kind==='secado'&&state?.fecha_secar){const days=Math.round((Date.parse(state.fecha_secar+'T00:00:00Z')-Date.parse(p.fecha+'T00:00:00Z'))/86400000);if(days>7)warnings.push(`Se está secando ${days} días antes de lo proyectado (${state.fecha_secar}).`);}
 if(['monta','inseminacion'].includes(p.kind)&&state?.estado==='preñada')warnings.push('Esta vaca figura como preñez CONFIRMADA por palpación.');
 if(lot&&Number(lot.cantidad_actual)<=0)warnings.push(`El lote está en ${lot.cantidad_actual} pajillas. No bloquea registrar el uso.`);
 return `Revisar evento: ${p.kind}\n🐄 ${short(b.graph.animal.nombre)} (#${b.graph.animal.numero??'sin chapeta'})\nAnimal: ${p.animalId}\nFecha: ${p.fecha} (exacta)\nToro: ${bull?short(bull.nombre):'No aplica'}\n${lot?`Lote: ${p.pajillaId}\nStock observado: ${lot.cantidad_actual}\nEvento y uso de pajilla se guardan juntos.`:'No se registrará uso de pajilla.'}\nRevisión válida para: ${r.effectiveDate}${warnings.length?'\n⚠️ '+warnings.join('\n⚠️ '):''}${quickReviewReady(r)?'':'\nNo pude comprobar la configuración original. Verifique o cancele este intento.'}\n\nConfirme únicamente si coincide con el evento ocurrido.`;
}
export async function renderQuick(ctx:any,action:QuickAction,result:QuickResult){const pending=result.state==='pending';const text=pending?quickPreview(result):result.state==='committed'?`✅ Evento registrado el ${result.intent!.fecha}. ${result.receipt!.usage?'Uso de pajilla registrado junto al evento.':'Sin uso de pajilla.'} La evidencia original está verificada.`:result.state==='canceled'?'El intento original está cancelado.':'No hay una reserva verificable. Conserve el mensaje para verificar o cancelar.';await ctx.api.editMessageText(action.chatId,action.messageId,text,{reply_markup:pending?(quickReviewReady(result)?review:recovery):result.state==='unknown'?retry:result.state==='committed'&&result.receipt?.usage===null&&result.intent?.kind!=='inseminacion'?{inline_keyboard:[[{text:'↩️ Deshacer',callback_data:'hato_ev_undo:'+result.plan!.events[0].id}]]}:{inline_keyboard:[]}});}

function finish(ctx:any,action:QuickAction,result:QuickResult){if(['committed','canceled'].includes(result.state)&&sameQuick(ctx.session.pendienteEventoRapido?.action,action))ctx.session.pendienteEventoRapido=null;}
export async function beginQuick(ctx:any,client:QuickClient,intent:QuickIntent){
 privateQuickAction(ctx);const p=quickIntent(intent);if(ctx.session.pendienteEventoRapido)throw Error('Verifique o cancele el intento anterior desde su mensaje original.');
 const message=await ctx.reply('Preparando la revisión del evento. Conserve este mensaje para verificar o cancelar.',{reply_markup:retry});const action=privateQuickAction({...ctx,callbackQuery:{message}});ctx.session.pendienteEventoRapido={action,intent:p};
 try{const result=await quickTelegram(client,action,'prepare',p);await renderQuick(ctx,action,result);finish(ctx,action,result);}catch{await ctx.reply('No pude verificar la preparación. Conserve el mensaje original y sus botones; no cree un reemplazo.');}return action;
}
/** Outside a conversation replay: native message identity alone recovers the protected request. */
export async function handleQuickRecovery(ctx:any,next:()=>Promise<void>,client:QuickClient){
 if(!ctx.callbackQuery?.data?.startsWith('hqt:'))return next();await ctx.answerCallbackQuery();
 try{const action=privateQuickAction(ctx),mode=ctx.callbackQuery.data.slice(4);if(!['prepare','post','status','resolve'].includes(mode))throw Error('Operación inválida.');let result:QuickResult;
  if(mode==='prepare'){const p=ctx.session.pendienteEventoRapido;if(!p||!sameQuick(p.action,action))throw Error('Conserve el mensaje original; verifique o cancele.');result=await quickTelegram(client,action,'prepare',p.intent);}
  else if(mode==='post'){const original=await quickTelegram(client,action,'status');result=original.state==='pending'&&quickReviewReady(original)&&ctx.callbackQuery.message.text===quickPreview(original)?await quickTelegram(client,action,'post',null,original):original;}
  else result=await quickTelegram(client,action,mode);finish(ctx,action,result);
  try{await renderQuick(ctx,action,result);}catch{await ctx.reply('El resultado fue verificado. Conserve el mensaje original para consultarlo.');}
 }catch{await ctx.reply('No pude verificar el intento original. Conserve su mensaje; no cree un reemplazo.');}
}
export async function confirmQuick(conversation:any,ctx:any,clientFactory:()=>QuickClient,intent:QuickIntent){
 const p=quickIntent(intent);privateQuickAction(ctx);
 await conversation.external(async(outside:any)=>{if(outside.from?.id!==ctx.from?.id||outside.chat?.id!==ctx.chat?.id)throw Error('Identidad cambiada.');await beginQuick(outside,clientFactory(),p);return null;});return conversation.halt();
}
