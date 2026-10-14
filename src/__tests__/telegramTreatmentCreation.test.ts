import {afterEach,describe,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {confirmTreatment,handleTreatmentRecovery,privateTreatmentAction,readOriginalTreatmentAnimal} from '../supabase/functions/server/telegram/treatmentCreation';
import {recoverTelegramTreatment,type TreatmentProposal} from '../utils/hato/hatoTreatmentCreation';
const animal='22222222-2222-4222-8222-222222222222',key='33333333-3333-4333-8333-333333333333',header='44444444-4444-4444-8444-444444444444';
const proposal:TreatmentProposal={version:1,animalId:animal,nombre:'Tratamiento original',fechaInicio:'2026-10-13',nota:'Nota original',fechaProximoPaso:null,descripcionPaso:null,observedAnimal:{id:animal,nombre:'Original'}};
const action={sender:123,chatId:123,messageId:77};
const actor={origin:'telegram',profileId:null,registrationId:animal,sender:123,displayName:'Campo'};
function result(state='pending',payload:TreatmentProposal|null=proposal){
 const r:any={version:1,requestKey:state==='unknown'?null:key,actor,payload,action,state,receipt:null};
 if(state==='committed')r.receipt={version:1,requestKey:key,actor,payload,action,before:{animal:proposal.observedAnimal},after:{header:{id:header,animal_id:animal,chequeo_id:null,protocolo_id:null,nombre:proposal.nombre,fecha_inicio:proposal.fechaInicio,estado:'completado',nota:proposal.nota,created_at:'2026-10-13T12:00:00Z',created_by:null,fuente:'telegram'},steps:[]}};
 return r;
}
function client(handler:(body:Record<string,unknown>)=>unknown){
 const calls:Record<string,unknown>[]=[];
 const sdk=createClient('https://treatment.synthetic.invalid','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(_url,init)=>{const body=JSON.parse(String(init?.body));calls.push(body);return new Response(JSON.stringify(handler(body)),{headers:{'Content-Type':'application/json'}});}}});
 return {sdk,calls};
}
function context(data='htc:post'){
 return {from:{id:123},chat:{id:123,type:'private'},callbackQuery:{data,message:{message_id:77,chat:{id:123,type:'private'}}},
  session:{pendienteTratamiento:action as typeof action|null},answerCallbackQuery:vi.fn(async()=>{}),reply:vi.fn(async()=>({message_id:77,chat:{id:123,type:'private'}})),
  api:{editMessageText:vi.fn(async(..._args:unknown[])=>{})},conversation:{active:()=>({}),exit:vi.fn(async()=>{})}};
}
afterEach(()=>vi.restoreAllMocks());
describe('native Telegram treatment creation and durable recovery',()=>{
 it.each(['post','status','resolve'] as const)('actual SDK %s sends only native slot and operation',async mode=>{
  const h=client(()=>result('committed'));
  expect((await recoverTelegramTreatment(h.sdk,action,mode)).state).toBe('committed');
  expect(h.calls).toEqual([{p_action:mode,p_sender:123,p_chat_id:123,p_message_id:77}]);
 });
 it.each([
  {from:{id:456}}, {chat:{id:123,type:'group'}}, {chat:{id:456,type:'private'}},
  {callbackQuery:{data:'htc:post'}}, {callbackQuery:{message:{message_id:0,chat:{id:123,type:'private'}}}},
  {callbackQuery:{message:{message_id:77,chat:{id:456,type:'private'}}}},
  {callbackQuery:{message:{message_id:77,chat:{id:123,type:'group'}}}},
 ])('rejects untrusted native context before any RPC',async patch=>{
  const h=client(()=>result('committed')),ctx={...context(),...patch};
  expect(()=>privateTreatmentAction(ctx)).toThrow();
  await handleTreatmentRecovery(ctx,vi.fn(),h.sdk);expect(h.calls).toEqual([]);
 });
 it('requires exact original native message for the waiting workflow',()=>{
  expect(()=>privateTreatmentAction(context(),{...action,messageId:88})).toThrow();
 });
 it('recovers a committed receipt after session/conversation loss without caller proposal/key',async()=>{
  const h=client(()=>result('committed')),ctx=context();ctx.session.pendienteTratamiento=null;
  await handleTreatmentRecovery(ctx,vi.fn(),h.sdk);
  expect(ctx.api.editMessageText).toHaveBeenCalledWith(123,77,expect.stringContaining('✅ Tratamiento registrado.'),expect.objectContaining({reply_markup:expect.anything()}));
  expect(ctx.conversation.exit).not.toHaveBeenCalled();
  expect(h.calls[0]).not.toHaveProperty('p_payload');expect(h.calls[0]).not.toHaveProperty('p_request_key');
 });
 it('does not clear another later pending lane when an older message is recovered',async()=>{
  const h=client(()=>result('committed')),ctx=context();ctx.session.pendienteTratamiento={...action,messageId:88};
  await handleTreatmentRecovery(ctx,vi.fn(),h.sdk);
  expect(ctx.session.pendienteTratamiento.messageId).toBe(88);expect(ctx.conversation.exit).not.toHaveBeenCalled();
 });
 it('unknown post resumes only the matching persisted original proposal',async()=>{
  const h=client(()=>result('unknown',null)),ctx=context(),next=vi.fn(async()=>{});
  ctx.conversation.active=()=>({eventoHato:1});
  await handleTreatmentRecovery(ctx,next,h.sdk);expect(next).toHaveBeenCalledOnce();expect(ctx.session.pendienteTratamiento).toEqual(action);
 });
 it('status of unknown slot creates no retry and remains on the original message',async()=>{
  const h=client(()=>result('unknown',null)),ctx=context('htc:status'),next=vi.fn(async()=>{});
  await handleTreatmentRecovery(ctx,next,h.sdk);expect(next).not.toHaveBeenCalled();expect(h.calls).toHaveLength(1);
  expect(ctx.api.editMessageText.mock.calls[0][0]).toBe(123);expect(ctx.api.editMessageText.mock.calls[0][1]).toBe(77);
 });
 it('a lost post response retains the original lane until verified by a later status',async()=>{
  let lost=true;const h=client(()=>{if(lost)throw Error('lost response');return result('committed');}),ctx=context();
  await handleTreatmentRecovery(ctx,vi.fn(),h.sdk);expect(ctx.session.pendienteTratamiento).toEqual(action);expect(ctx.conversation.exit).not.toHaveBeenCalled();
  lost=false;ctx.callbackQuery.data='htc:status';await handleTreatmentRecovery(ctx,vi.fn(),h.sdk);
  expect(ctx.session.pendienteTratamiento).toBeNull();expect(h.calls.map(c=>c.p_action)).toEqual(['post','status']);
 });
 it('a malformed creation receipt never reports success or clears evidence',async()=>{
  const bad=result('committed');bad.receipt.after.header.created_by=animal;
  const h=client(()=>bad),ctx=context();await handleTreatmentRecovery(ctx,vi.fn(),h.sdk);
  expect(ctx.session.pendienteTratamiento).toEqual(action);expect(ctx.api.editMessageText).not.toHaveBeenCalled();
 });
 it('native cancellation before first prepare is validated without claiming a creation',async()=>{
  const h=client(()=>result('canceled',null)),ctx=context('htc:resolve');await handleTreatmentRecovery(ctx,vi.fn(),h.sdk);
  expect(ctx.api.editMessageText).toHaveBeenCalledWith(123,77,expect.stringContaining('cancelado'),expect.anything());expect(ctx.session.pendienteTratamiento).toBeNull();
 });
 it('actual confirmation workflow retries lost first preparation with the same original proposal/slot',async()=>{
  let preparations=0;const h=client(body=>{if(body.p_action==='prepare'){if(++preparations===1)throw Error('first reply lost');return result();}return result('committed');});
  const ctx=context(),outside=context();outside.session.pendienteTratamiento=null;
  const externalResults:unknown[]=[];
  const conversation={external:async(fn:any)=>{const value=await fn(outside);externalResults.push(value);return value;},waitForCallbackQuery:vi.fn(async()=>context()),halt:vi.fn()};
  await confirmTreatment(conversation,ctx,()=>h.sdk,proposal,'Original review');
  expect(h.calls.map(c=>c.p_action)).toEqual(['prepare','prepare','post']);expect(h.calls[0]).toEqual(h.calls[1]);
  expect(h.calls[2]).toMatchObject({p_request_key:key,p_payload:proposal});
  expect(ctx.reply).toHaveBeenCalledOnce();expect(conversation.halt).toHaveBeenCalledOnce();expect(outside.session.pendienteTratamiento).toBeNull();
  expect(externalResults.some((r:any)=>r?.result?.requestKey===key)).toBe(true);
 });
 it('a pending earlier action prevents replacing its confirmation slot',async()=>{
  const h=client(()=>result()),ctx=context(),outside=context();
  const conversation={external:(fn:any)=>fn(outside)};
  await expect(confirmTreatment(conversation,ctx,()=>h.sdk,proposal,'Review')).rejects.toThrow('intento anterior');expect(ctx.reply).not.toHaveBeenCalled();expect(h.calls).toEqual([]);
 });
 it('actual bot cancellation verifies the fence before exiting and keeps unknown evidence',async()=>{
  const source=readFileSync('src/supabase/functions/server/telegram/bot.ts','utf8');
  const sf=ts.createSourceFile('bot.ts',source,ts.ScriptTarget.Latest,true);let handler='';
  const visit=(n:ts.Node)=>{if(ts.isCallExpression(n)&&n.expression.getText(sf)==='bot.command'&&n.arguments[0]?.getText(sf)==='"cancelar"')handler=n.arguments[1].getText(sf);ts.forEachChild(n,visit);};visit(sf);
  const compiled=ts.transpileModule(`const handler=${handler};`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
  const recovery=vi.fn(async()=>{throw Error('uncertain');});
  const run=new Function('recoverTelegramTreatment','getSupabaseAdmin','renderTreatment','sendMainMenu',compiled+';return handler;')(recovery,()=>({}),vi.fn(),vi.fn());
  const ctx=context();ctx.conversation={...ctx.conversation,exitAll:vi.fn()} as any;
  await run(ctx);expect((ctx.conversation as any).exitAll).not.toHaveBeenCalled();expect(ctx.session.pendienteTratamiento).toEqual(action);
 });
 it('reads the original full animal row through fresh server authority using native command identity',async()=>{
  const h=client(()=>({actor,animal:proposal.observedAnimal}));
  expect(await readOriginalTreatmentAnimal(h.sdk,{from:{id:123},chat:{id:123,type:'private'},message:{message_id:77,chat:{id:123,type:'private'}}},animal)).toEqual(proposal.observedAnimal);
  expect(h.calls).toEqual([{p_sender:123,p_chat_id:123,p_message_id:77,p_animal_id:animal}]);
 });
 it('keeps both mirrors exact and snapshots the raw animal before the clinical review',()=>{
  for(const name of ['telegram/treatmentCreation.ts','telegram/treatmentCreationProtocol.ts','telegram/conversations/eventoHato.ts','telegram/bot.ts','telegram/types.ts'])expect(readFileSync('src/supabase/functions/server/'+name,'utf8')).toBe(readFileSync('supabase/functions/make-server-1ccce916/'+name,'utf8'));
  const source=readFileSync('src/supabase/functions/server/telegram/conversations/eventoHato.ts','utf8');
  expect(source.indexOf("readOriginalTreatmentAnimal(getSupabaseAdmin(),ctx,vaca!.animal_id)")).toBeLessThan(source.indexOf('const resumen = ['));expect(source).not.toContain('fn_hato_registrar_tratamiento');
  const bot=readFileSync('src/supabase/functions/server/telegram/bot.ts','utf8');expect(bot.indexOf('await handleTreatmentRecovery')).toBeLessThan(bot.indexOf('bot.use(createConversation('));
 });
});
