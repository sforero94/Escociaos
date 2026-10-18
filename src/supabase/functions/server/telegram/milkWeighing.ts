import {milkWeighingIntent,validateMilkWeighingResult,validateMilkWeighingSnapshot,sameMilkWeighing,type MilkWeighingActor,type MilkWeighingClient,type MilkWeighingIntent,type MilkWeighingResult} from './hatoMilkWeighingProtocol.ts';
export type MilkAction={sender:number;chatId:number;messageId:number};
type TelegramActor=Extract<MilkWeighingActor,{origin:'telegram'}>;
export type NativeMilk={version:1;actor:TelegramActor;action:MilkAction;result:MilkWeighingResult|null};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:unknown,k:string[])=>object(v)&&Object.keys(v).sort().join('|')===[...k].sort().join('|');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function fail():never{throw Error('Conserve el mensaje privado original; verifique o cancele antes de otro intento.');}
export function milkAction(ctx:any):MilkAction{const m=ctx.callbackQuery?ctx.callbackQuery.message:ctx.message;if(ctx.chat?.type!=='private'||m?.chat?.type!=='private'||ctx.from?.id!==ctx.chat.id||m.chat.id!==ctx.chat.id||![ctx.from.id,m.message_id].every(n=>Number.isSafeInteger(n)&&n>0))return fail();return {sender:ctx.from.id,chatId:m.chat.id,messageId:m.message_id};}
function validAction(a:MilkAction){if(!keys(a,['sender','chatId','messageId'])||a.sender!==a.chatId||![a.sender,a.messageId].every(n=>Number.isSafeInteger(n)&&n>0))return fail();}
export async function nativeMilk(c:MilkWeighingClient,a:MilkAction,mode:'prepare'|'status'|'post'|'resolve'|'acknowledge',intent:MilkWeighingIntent|null=null,expected?:NativeMilk):Promise<NativeMilk>{
 validAction(a);if(mode==='prepare'){if(!intent)return fail();milkWeighingIntent(intent);}else if(intent!==null)return fail();
 const r=await c.rpc('fn_hato_milk_weighing_telegram',{p_action:mode,p_sender:a.sender,p_chat_id:a.chatId,p_message_id:a.messageId,p_intent:intent});if(r.error)return fail();const x=r.data;
 if(!object(x)||!keys(x,['version','actor','action','result'])||x.version!==1||!sameMilkWeighing(x.action,a)||!object(x.actor)||!keys(x.actor,['origin','registrationId','profileId','sender','displayName'])||x.actor.origin!=='telegram'||x.actor.sender!==a.sender||!uuid(x.actor.registrationId)||!uuid(x.actor.profileId)||(x.actor.displayName!==null&&typeof x.actor.displayName!=='string'))return fail();
 const actor=x.actor as TelegramActor;if(expected&&!sameMilkWeighing(actor,expected.actor))return fail();
 let result:MilkWeighingResult|null=null;
 if(x.result!==null){if(!object(x.result)||!uuid(x.result.requestKey))return fail();result=validateMilkWeighingResult(x.result,actor.profileId,String(x.result.requestKey),expected?.result?.intent??intent??undefined,actor);}
 if(mode!=='status'&&result===null)return fail();
 const prior=expected?.result;if(prior){if(!result||result.requestKey!==prior.requestKey||!sameMilkWeighing(result.intent,prior.intent)||!sameMilkWeighing(result.original,prior.original)||!sameMilkWeighing(result.plan,prior.plan)||result.effectiveDate!==prior.effectiveDate||(['committed','canceled'].includes(prior.state)&&!sameMilkWeighing({...result,acknowledged:prior.acknowledged},prior))||(prior.acknowledged&&!result.acknowledged))return fail();}
 return {version:1,actor,action:a,result};
}
export async function nativeMilkSource(c:MilkWeighingClient,a:MilkAction){validAction(a);const r=await c.rpc('fn_hato_milk_weighing_telegram',{p_action:'source',p_sender:a.sender,p_chat_id:a.chatId,p_message_id:a.messageId,p_intent:null});if(r.error)return fail();return validateMilkWeighingSnapshot(r.data);}
const recovery={inline_keyboard:[[{text:'🔎 Verificar original',callback_data:'hmw:status'},{text:'❌ Cancelar original',callback_data:'hmw:resolve'}]]};
const retry={inline_keyboard:[[{text:'Preparar original',callback_data:'hmw:prepare'}],...recovery.inline_keyboard]};
const canonical=(x:unknown):string=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':object(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
export async function milkPreview(n:NativeMilk){const r=n.result;if(r?.state!=='pending'||!r.intent||!r.original||!r.plan)return fail();const short=(s:unknown)=>String(s??'sin nombre').replace(/[\r\n\t]/g,' ').slice(0,80),reading=(v:unknown)=>v===null?'sin dato':String(v);
 const lines=[`Pesaje ${r.intent.month}/${r.intent.year} · día ISO ${r.plan.weekday} · revisión ${r.effectiveDate}`,`Foto: ${r.intent.captureId??'sin foto'}`,...r.plan.accepted.map(e=>{const a=r.original!.animals.find(a=>a.id===e.cell.animalId);return `${short(a?.nombre)} (#${short(a?.numero)}) · ${e.cell.date}\nAM ${reading(e.before?.litros_am??null)} → ${reading(e.after.litros_am)}; PM ${reading(e.before?.litros_pm??null)} → ${reading(e.after.litros_pm)}; total ${reading(e.before?.litros_total??null)} → ${reading(e.after.litros_total)}`;}),...r.plan.rejected.map(e=>`EXCLUIDA: ${short(r.original!.animals.find(a=>a.id===e.cell.animalId)?.nombre)} · ${e.cell.date} · animal o día no vigente`)];
 const pages:string[]=[];let page='';for(const line of lines){if(page.length+line.length>3400){pages.push(page);page='';}page+=(page?'\n\n':'')+line;}if(page)pages.push(page);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(n))))).map(n=>n.toString(16).padStart(2,'0')).join('');
 return {pages,anchor:`Revisión preparada del pesaje ${r.intent.month}/${r.intent.year}\n${r.plan.accepted.length} celdas; ${r.plan.rejected.length} excluidas; ${pages.length} página(s).\nRevise los valores anteriores/nuevos arriba antes de confirmar.\nOriginal: ${r.requestKey}\nRevisión: ${digest}`};
}
export async function renderMilk(ctx:any,n:NativeMilk){const r=n.result,a=n.action;
 if(r?.state==='pending'){const p=await milkPreview(n);for(let i=0;i<p.pages.length;i++)await ctx.api.sendMessage(a.chatId,`Revisión ${r.requestKey} · ${i+1}/${p.pages.length}\n${p.pages[i]}`);await ctx.api.editMessageText(a.chatId,a.messageId,p.anchor,{reply_markup:{inline_keyboard:[[{text:'✅ Confirmar pesaje revisado',callback_data:'hmw:post'}],...recovery.inline_keyboard]}});return;}
 const terminal=r&&['committed','canceled'].includes(r.state),text=r?.state==='committed'?'✅ Pesaje original registrado y verificado.':r?.state==='canceled'?'Intento original cancelado.':'Resultado sin reserva verificable. Conserve este mensaje; no cree un reemplazo.';
 await ctx.api.editMessageText(a.chatId,a.messageId,text,{reply_markup:terminal?{inline_keyboard:r.acknowledged?[]:[[{text:'Aceptar resultado y liberar intento',callback_data:'hmw:acknowledge'},{text:'Verificar',callback_data:'hmw:status'}]]}:retry});
 if(r?.acknowledged&&sameMilkWeighing(ctx.session.pendientePesaje?.action,a))ctx.session.pendientePesaje=null;
}
/** Outside conversation context: the one native anchor survives session/conversation loss. */
export async function beginMilk(ctx:any,c:MilkWeighingClient,intent:MilkWeighingIntent){milkAction(ctx);milkWeighingIntent(intent);if(ctx.session.pendientePesaje)return fail();
 const message=await ctx.reply('Preparando revisión del pesaje. Conserve este mensaje original.',{reply_markup:retry}),action=milkAction({...ctx,callbackQuery:{message}});ctx.session.pendientePesaje={action,intent};
 try{await renderMilk(ctx,await nativeMilk(c,action,'prepare',intent));}catch{await ctx.reply('Preparación no verificada. Conserve el mensaje original para verificar o cancelar; no repita la carga.');}
 return 'prepared' as const;
}
export async function handleMilkRecovery(ctx:any,next:()=>Promise<void>,c:MilkWeighingClient){if(!ctx.callbackQuery?.data?.startsWith('hmw:'))return next();await ctx.answerCallbackQuery();
 try{const a=milkAction(ctx),mode=ctx.callbackQuery.data.slice(4);let result:NativeMilk;
  if(mode==='prepare'){const pending=ctx.session.pendientePesaje;if(!pending||!sameMilkWeighing(pending.action,a))return fail();result=await nativeMilk(c,a,'prepare',pending.intent);}
  else if(mode==='post'||mode==='acknowledge'){const original=await nativeMilk(c,a,'status');result=mode==='post'&&original.result?.state==='pending'&&ctx.callbackQuery.message.text===(await milkPreview(original)).anchor?await nativeMilk(c,a,'post',null,original):mode==='acknowledge'&&original.result&&['committed','canceled'].includes(original.result.state)?await nativeMilk(c,a,'acknowledge',null,original):original;}
  else if(mode==='status'||mode==='resolve')result=await nativeMilk(c,a,mode);else return fail();
  try{await renderMilk(ctx,result);}catch{await ctx.reply('Resultado verificado. Conserve el mensaje original para consultarlo.');}
 }catch{await ctx.reply('No pude verificar el pesaje original. Conserve su mensaje; no cree un reemplazo.');}
}
