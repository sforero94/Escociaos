import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { handleHatoUndoReview, parseHatoReviewCallback, renderHatoReview, MAX_REVIEW_BYTES, type HatoReview, type UndoReviewContext } from '../supabase/functions/server/telegram/hatoUndoReview';
import type { HatoUndoClient } from '@/utils/hato/hatoUndoProtocol';
const actor='10000000-0000-4000-8000-000000000001',target='20000000-0000-4000-8000-000000000001',key='30000000-0000-4000-8000-000000000001';
const review:HatoReview={version:1,key,state:'pending',receipt:null,animal:{numero:157,nombre:'ALINA'},payload:{actor,sender:123,operation:'event',target_id:target,
  snapshot:{target:{id:target,animal_id:actor,fuente:'telegram',tipo:'celo',fecha:'2026-10-12',tipo_servicio:null,cria_destino:null,chequeo_vaca_id:null,
    cria_id:null,alerta_id:null,transaccion_ganado_id:null,datos:{notas:'Observada en el corral'},created_by:actor},steps:[]}}};
const done:HatoReview={...review,state:'committed',receipt:{actor,sender:123,request_key:key,operation:'event',target_id:target,before:review.payload.snapshot,after:{target:null,steps:[]}}};
function harness(data=`hato_ev_undo:${target}`, handler:(name:string,args:Record<string,unknown>)=>unknown=()=>review) {
  const calls:Array<{name:string;args:Record<string,unknown>}>=[],sent:Array<{chat:number;text:string;options:unknown}>=[],answers:string[]=[],edits:string[]=[];
  let messageId=76;
  const client=createClient('https://synthetic-hato-review.invalid','synthetic-service-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    const name=new URL(String(input)).pathname.split('/').at(-1)!;const args=JSON.parse(String(init?.body));calls.push({name,args});
    const response=await handler(name,args);
    return response instanceof Response?response:new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});
  }}}) as HatoUndoClient;
  const ctx:UndoReviewContext={from:{id:123},chat:{id:123,type:'private'},callbackQuery:{data,message:{message_id:77}},api:{sendMessage:async(chat,text,options)=>{
    sent.push({chat,text,options});return {message_id:++messageId,chat:{id:chat}};
  }},answerCallbackQuery:async({text})=>{answers.push(text);},editMessageText:async text=>{edits.push(text);}};
  return {client,ctx,calls,sent,answers,edits};
}
describe('durable private Hato undo review through Supabase transport and synthetic Telegram',()=>{
  it.each(['event','treatment'] as const)('original %s callback registers original attempt then complete private review; never deletes',async operation=>{
    const r:HatoReview=operation==='event'?review:{...review,payload:{...review.payload,operation,snapshot:{target:{id:target,animal_id:actor,fuente:'telegram',estado:'activo',chequeo_id:null,nombre:'Revisión clínica',fecha_inicio:'2026-10-12'},steps:[]}}};
    const h=harness(`${operation==='event'?'hato_ev_undo:':'hato_tr_undo:'}${target}`,()=>r);
    await handleHatoUndoReview(h.ctx,h.client,operation);
    expect(h.calls.map(c=>c.name)).toEqual(['fn_hato_undo_review_begin','fn_hato_undo_review_deliver']);
    expect(h.calls[1].args).toMatchObject({p_request_key:key,p_sender:123,p_chat_id:123,p_message_id:78});
    expect(h.sent[0].text).toContain('#157 · ALINA');expect(h.sent[0].text).not.toContain(target);expect(h.sent[0].text).not.toContain(actor);
    expect(h.sent.every(s=>s.chat===123)).toBe(true);expect(h.edits).toEqual([]);
  });
  it('review shows notes and unknown clinical fields, never technical audit JSON',()=>{
    const r={...review,payload:{...review.payload,snapshot:{...review.payload.snapshot,target:{...review.payload.snapshot.target,observacion_nueva:'No omitir'}}}};
    const text=renderHatoReview(r).join('\n');
    expect(text).toContain('Observada en el corral');expect(text).toContain('Campo observacion nueva: No omitir');expect(text).not.toContain('created_by');
  });
  it('complete long review delivers every bounded chunk before control registration',async()=>{
    const r={...review,payload:{...review.payload,snapshot:{...review.payload.snapshot,target:{...review.payload.snapshot.target,datos:{notas:'a'.repeat(8000)}}}}};
    const h=harness(undefined,()=>r);await handleHatoUndoReview(h.ctx,h.client,'event');
    expect(h.sent).toHaveLength(4);expect(h.sent.slice(0,-1).every(s=>s.text.length<=3500&&!s.options)).toBe(true);
    expect(h.sent.slice(0,-1).map(s=>s.text).join('')).toContain('a'.repeat(8000));expect(h.calls.at(-1)?.name).toBe('fn_hato_undo_review_deliver');
  });
  it('oversize review refuses before partial clinical delivery and before destructive action',async()=>{
    const r={...review,payload:{...review.payload,snapshot:{...review.payload.snapshot,target:{...review.payload.snapshot.target,datos:{notas:'a'.repeat(MAX_REVIEW_BYTES)}}}}};
    const h=harness(undefined,()=>r);await handleHatoUndoReview(h.ctx,h.client,'event');
    expect(h.calls.map(c=>c.name)).toEqual(['fn_hato_undo_review_begin','fn_hato_undo_review_deliver']);expect(h.sent).toHaveLength(2);
    expect(h.sent[0].text).toContain('12 KiB');expect(h.calls[1].args.p_complete_review).toBe(false);
    expect(JSON.stringify(h.sent[1].options)).not.toContain(`${key}:c`);
  });
  it('failed cancellation-only explanation/control delivery cannot register any action',async()=>{
    const r={...review,payload:{...review.payload,snapshot:{...review.payload.snapshot,target:{...review.payload.snapshot.target,datos:{notas:'a'.repeat(MAX_REVIEW_BYTES)}}}}};
    const h=harness(undefined,()=>r);let sends=0;h.ctx.api.sendMessage=async()=>{if(++sends===2)throw new Error('control unavailable');return {message_id:77,chat:{id:123}};};
    await handleHatoUndoReview(h.ctx,h.client,'event');expect(h.calls.map(c=>c.name)).toEqual(['fn_hato_undo_review_begin']);
  });
  it('unresolved decision-relevant UUID reference refuses review instead of hiding it',()=>{
    expect(()=>renderHatoReview({...review,payload:{...review.payload,snapshot:{...review.payload.snapshot,target:{...review.payload.snapshot.target,toro_id:actor}}}})).toThrow('referencia clínica');
  });
  it.each([1,2])('private delivery failure on message %s cannot register controls or mutate',async failAt=>{
    const h=harness();let sends=0;h.ctx.api.sendMessage=async()=>{if(++sends===failAt)throw new Error('synthetic DM unavailable');return {message_id:77,chat:{id:123}};};
    await handleHatoUndoReview(h.ctx,h.client,'event');expect(h.calls.map(c=>c.name)).toEqual(['fn_hato_undo_review_begin']);
  });
  it('successful Telegram send followed by lost delivery registration remains original pending key',async()=>{
    const h=harness(undefined,name=>name==='fn_hato_undo_review_deliver'?new Response(JSON.stringify({message:'synthetic unavailable'}),{status:500}):review);
    await handleHatoUndoReview(h.ctx,h.client,'event');await handleHatoUndoReview(h.ctx,h.client,'event');
    expect(h.calls.filter(c=>c.name==='fn_hato_undo_review_deliver').map(c=>c.args.p_request_key)).toEqual([key,key]);
    expect(h.calls.some(c=>c.name==='fn_hato_undo_review_action')).toBe(false);
  });
  it('lost begin response retries only begin and recovers server original owner/key/payload',async()=>{
    let lost=true;const h=harness(undefined,()=>{if(lost){lost=false;throw new Error('lost');}return review;});
    await handleHatoUndoReview(h.ctx,h.client,'event');await handleHatoUndoReview(h.ctx,h.client,'event');
    expect(h.calls.map(c=>c.name)).toEqual(['fn_hato_undo_review_begin','fn_hato_undo_review_begin','fn_hato_undo_review_deliver']);
    expect(h.calls[0]).toEqual(h.calls[1]);expect(h.calls[2].args.p_request_key).toBe(key);
  });
  it('confirm sends only server-owned key + actual private sender/message, accepts exact committed receipt',async()=>{
    const h=harness(`hato_ev_undo:${key}:c`,()=>done);await handleHatoUndoReview(h.ctx,h.client,'event');
    expect(h.calls).toEqual([{name:'fn_hato_undo_review_action',args:{p_sender:123,p_operation:'event',p_request_key:key,p_chat_id:123,p_message_id:77,p_action:'confirm'}}]);
    expect(h.edits).toHaveLength(1);
  });
  it('failed Telegram edit after persistence can replay the same server receipt after worker restart',async()=>{
    const h=harness(`hato_ev_undo:${key}:c`,()=>done);h.ctx.editMessageText=async()=>{throw new Error('synthetic edit failed');};
    await handleHatoUndoReview(h.ctx,h.client,'event');
    const restarted=harness(`hato_ev_undo:${key}:c`,()=>done);await handleHatoUndoReview(restarted.ctx,restarted.client,'event');
    expect(restarted.calls[0]).toEqual(h.calls[0]);expect(restarted.edits).toHaveLength(1);expect(h.calls).toHaveLength(1);
  });
  it('read-only status never calls cancellation or generates new attempt',async()=>{
    const h=harness(`hato_ev_undo:${key}:s`);await handleHatoUndoReview(h.ctx,h.client,'event');
    expect(h.calls.map(c=>c.name)).toEqual(['fn_hato_undo_review_status']);expect(h.edits).toEqual([]);
  });
  it('explicit cancel winning returns cancelled; confirm-winning cancel returns original receipt',async()=>{
    const h=harness(`hato_ev_undo:${key}:x`,()=>({...review,state:'cancelled'}));await handleHatoUndoReview(h.ctx,h.client,'event');
    expect(h.calls[0].args.p_action).toBe('cancel');expect(h.edits[0]).toContain('cancelada');
    const race=harness(`hato_ev_undo:${key}:x`,()=>done);await handleHatoUndoReview(race.ctx,race.client,'event');expect(race.edits[0]).toContain('confirmado');
  });
  it('new review is possible only through explicit original cancelled-key action',async()=>{
    const newKey='40000000-0000-4000-8000-000000000001';const h=harness(`hato_ev_undo:${key}:n`,()=>({...review,key:newKey}));
    await handleHatoUndoReview(h.ctx,h.client,'event');expect(h.calls.map(c=>c.name)).toEqual(['fn_hato_undo_review_new','fn_hato_undo_review_deliver']);
    expect(h.calls[0].args.p_request_key).toBe(key);expect(h.calls[1].args.p_request_key).toBe(newKey);
  });
  it('repeated explicit new-review callback recovers its already committed newer receipt',async()=>{
    const newKey='40000000-0000-4000-8000-000000000001';
    const h=harness(`hato_ev_undo:${key}:n`,()=>({...done,key:newKey,receipt:{...done.receipt!,request_key:newKey}}));
    await handleHatoUndoReview(h.ctx,h.client,'event');expect(h.calls.map(c=>c.name)).toEqual(['fn_hato_undo_review_new']);
    expect(h.sent[0].text).toContain('confirmado');
  });
  it.each(['group','supergroup'])('group %s receives only generic ack and never clinical proof or RPC',async type=>{
    const h=harness();h.ctx.chat={id:-99,type};await handleHatoUndoReview(h.ctx,h.client,'event');expect(h.calls).toEqual([]);expect(h.sent).toEqual([]);
    expect(h.answers).toEqual(['Abre el chat privado con Esco para revisar esta operación.']);
  });
  it('forwarded private callback has actual sender/message and cannot inherit original review authority',async()=>{
    const h=harness(`hato_ev_undo:${key}:c`,()=>new Response(JSON.stringify({message:'Review owner unavailable'}),{status:403}));
    h.ctx.from={id:456};h.ctx.chat={id:456,type:'private'};await handleHatoUndoReview(h.ctx,h.client,'event');
    expect(h.calls[0].args).toMatchObject({p_sender:456,p_chat_id:456,p_message_id:77});expect(h.edits).toEqual([]);
  });
  it.each([null,{}, {...done,receipt:{...done.receipt!,request_key:actor}}, {...review,payload:{...review.payload,sender:456}}, {...review,key:actor}])('unknown/foreign/stale result never gets accepted or rebased %j',async value=>{
    const h=harness(`hato_ev_undo:${key}:c`,()=>value);await handleHatoUndoReview(h.ctx,h.client,'event');expect(h.calls).toHaveLength(1);expect(h.edits).toEqual([]);
  });
  it.each(['',`hato_ev_undo:${target}:${actor}`,`hato_ev_undo:${target}:q`,`hato_tr_undo:${target}`,`hato_ev_undo:${target}:c:extra`])('malformed/oversized/wrong prefix callback %s refuses before RPC',async data=>{
    expect(parseHatoReviewCallback(data,'event')).toBeNull();const h=harness(data);await handleHatoUndoReview(h.ctx,h.client,'event');expect(h.calls).toEqual([]);
  });
  it('all action payloads fit Telegram cap for both prefixes',()=>{
    for(const operation of ['event','treatment'] as const)for(const action of ['c','x','s','n']){
      const data=`${operation==='event'?'hato_ev_undo:':'hato_tr_undo:'}${key}:${action}`;
      expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);expect(parseHatoReviewCallback(data,operation)?.action).toBe(action);
    }
  });
  it('bot and pure helper mirrors are byte-identical and both callbacks have no direct clinical delete fallback',()=>{
    const server='src/supabase/functions/server',deployed='supabase/functions/make-server-1ccce916';
    for(const path of ['telegram/bot.ts','telegram/hatoUndoReview.ts','hato-undo-protocol.ts'])expect(readFileSync(`${server}/${path}`,'utf8')).toBe(readFileSync(`${deployed}/${path}`,'utf8'));
    expect(readFileSync(`${server}/hato-undo-protocol.ts`,'utf8')).toBe(readFileSync('src/utils/hato/hatoUndoProtocol.ts','utf8'));
    const bot=readFileSync(`${server}/telegram/bot.ts`,'utf8');const undo=bot.slice(bot.indexOf('bot.callbackQuery(/^hato_ev_undo:/'),bot.indexOf('bot.callbackQuery(/^hato_alerta:'));
    expect(undo.match(/handleHatoUndoReview\(ctx, getSupabaseAdmin\(\), '(event|treatment)'\)/g)).toHaveLength(2);
    expect(undo).not.toMatch(/\.from\(|\.delete\(|elegirUso|decidirDeshacer/);
  });
});
