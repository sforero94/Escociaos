import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as source from '../supabase/functions/server/ronda-adjustment-confirmation';
import * as deployed from '../../supabase/functions/make-server-1ccce916/ronda-adjustment-confirmation';
const token='22222222-2222-4222-8222-222222222222';
const warning={excepcion_id:token,aplicado:false,motivo:'teorico_cambio',propuesta_id:token,teorico_al_conteo:10,teorico_hoy:15,delta:2,producto_nombre:'SKU <A>&"\'',unidad:'Kilos',fecha_movimiento:'2026-10-10',cantidad_fisica:12.345678};
const transport={sender:123,chat:{id:123,type:'private'},message:456};
let reviewResponse: Record<string,unknown>;
let calls: Array<{name:string;body:Record<string,unknown>}>;let fail:string|undefined;let reviewed:boolean;let completed:boolean;
const client=()=>createClient('https://supabase.invalid','synthetic-service',{auth:{persistSession:false,autoRefreshToken:false}});
beforeEach(()=>{reviewResponse={...warning};calls=[];fail=undefined;reviewed=false;completed=false;vi.stubGlobal('fetch',vi.fn(async (input:unknown,options:RequestInit)=>{
 const name=new URL(String(input)).pathname.split('/').pop()!;const body=JSON.parse(options.body as string);calls.push({name,body});
 if(name==='fn_ronda_telegram_registrar_revision') expect(reviewed).toBe(true);
 const data=(name==='fn_ronda_telegram_ajuste'||(name==='fn_ronda_telegram_revisar_ajuste'&&!completed))?reviewResponse:name==='fn_ronda_telegram_registrar_revision'?{proposal_id:token,sender:123,chat:123,message:body.p_message}:{aplicado:true,excepcion_id:token,movimiento_id:token,delta:2,saldo_anterior:15,saldo_nuevo:17};
 return new Response(JSON.stringify(name===fail?{message:'denied'}:data),{status:name===fail?403:200,headers:{'Content-Type':'application/json'}});
}));});afterEach(()=>vi.unstubAllGlobals());
for(const [label,helper] of [['source',source],['deployed',deployed]] as const) describe(label,()=>{
 it('actual SDK sends full original review then registers exact delivered message',async()=>{
  const r=await helper.beginTelegramAdjustment(client(),transport,token,'2026-10-10',async(review,callback)=>{expect(review).toEqual(warning);expect(callback).toBe(`rda_force:${token}`);expect(new TextEncoder().encode(callback).length).toBeLessThanOrEqual(64);reviewed=true;return{message_id:456,chat:transport.chat};});
  expect(r).toEqual(warning);expect(calls).toEqual([{name:'fn_ronda_telegram_ajuste',body:{p_sender:123,p_chat:123,p_excepcion:token,p_fecha:'2026-10-10'}},{name:'fn_ronda_telegram_registrar_revision',body:{p_sender:123,p_chat:123,p_message:456,p_propuesta:token}}]);
 });
 it('delivery failure never registers a force control',async()=>{await expect(helper.beginTelegramAdjustment(client(),transport,token,'2026-10-10',async()=>{throw Error('lost delivery');})).rejects.toThrow();expect(calls).toHaveLength(1);});
 it('wrong delivery chat never registers',async()=>{await expect(helper.beginTelegramAdjustment(client(),transport,token,'2026-10-10',async()=>({message_id:456,chat:{id:999,type:'private'}}))).rejects.toThrow();expect(calls).toHaveLength(1);});
 it.each([{...transport,sender:124},{...transport,chat:{id:123,type:'group'}},{...transport,message:undefined}])('rejects invalid transport before RPC %j',async(t)=>{await expect(helper.confirmTelegramAdjustment(client(),t,`rda_force:${token}`)).rejects.toThrow();expect(calls).toHaveLength(0);});
 it('force selects original proposal and message only, including identical retry',async()=>{await helper.confirmTelegramAdjustment(client(),transport,`rda_force:${token}`);await helper.confirmTelegramAdjustment(client(),transport,`rda_force:${token}`);expect(calls[0]).toEqual(calls[1]);expect(calls[0].body).toEqual({p_sender:123,p_chat:123,p_message:456,p_propuesta:token});});
 it('unknown confirmation outcome does not rebase or request replacement',async()=>{fail='fn_ronda_telegram_confirmar_ajuste';await expect(helper.confirmTelegramAdjustment(client(),transport,`rda_force:${token}`)).rejects.toThrow('Conserva el botón original');expect(calls).toHaveLength(1);});
 it.each(['lost-send','register-absent','register-commit-unknown'])('explicit same-proposal recovery after %s never posts',async(mode)=>{
  if(mode!=='lost-send') fail='fn_ronda_telegram_registrar_revision';
  const deliver=async()=>{if(mode==='lost-send')throw Error('unknown delivery');reviewed=true;return{message_id:456,chat:transport.chat};};
  const failure=await helper.beginTelegramAdjustment(client(),transport,token,'2026-10-10',deliver).catch(e=>e);
  expect(failure).toBeInstanceOf(helper.PendingRondaReview);expect(failure.proposal).toBe(token);
  calls=[];fail=undefined;reviewed=false;
  const recovery=await helper.recoverTelegramAdjustment(client(),transport,`rda_review:${failure.proposal}`,async(review,callback)=>{expect(review).toEqual(warning);expect(callback).toBe(`rda_force:${token}`);reviewed=true;return{message_id:789,chat:transport.chat};});
  expect(recovery).toEqual(warning);expect(calls.map(c=>c.name)).toEqual(['fn_ronda_telegram_revisar_ajuste','fn_ronda_telegram_registrar_revision']);expect(calls[0].body).toEqual({p_sender:123,p_chat:123,p_propuesta:token});expect(calls[1].body.p_message).toBe(789);
 });
 it('stale original source prevents recovery display and control registration',async()=>{fail='fn_ronda_telegram_revisar_ajuste';const deliver=vi.fn();await expect(helper.recoverTelegramAdjustment(client(),transport,`rda_review:${token}`,deliver)).rejects.toThrow();expect(deliver).not.toHaveBeenCalled();expect(calls).toHaveLength(1);});
 it('completed recovery returns original receipt without delivery or posting',async()=>{completed=true;const deliver=vi.fn();expect((await helper.recoverTelegramAdjustment(client(),transport,`rda_review:${token}`,deliver)).aplicado).toBe(true);expect(deliver).not.toHaveBeenCalled();expect(calls.map(c=>c.name)).toEqual(['fn_ronda_telegram_revisar_ajuste']);});

 it.each([
  {producto_nombre:undefined},{producto_nombre:''},{producto_nombre:42},{producto_nombre:'SKU\nOtro'},
  {unidad:undefined},{unidad:' '},{unidad:[]},{unidad:'Kilos\u202e'},
  {fecha_movimiento:undefined},{fecha_movimiento:'2026-02-30'},{fecha_movimiento:42},
  {cantidad_fisica:undefined},{cantidad_fisica:'12'},{cantidad_fisica:-1},{cantidad_fisica:1e12},
 ])('refuses malformed saved identity before initial or recovery delivery %j',async(bad)=>{
  reviewResponse={...warning,...bad};const deliver=vi.fn();
  await expect(helper.beginTelegramAdjustment(client(),transport,token,'2026-10-10',deliver)).rejects.toThrow();
  await expect(helper.recoverTelegramAdjustment(client(),transport,`rda_review:${token}`,deliver)).rejects.toThrow();
  expect(deliver).not.toHaveBeenCalled();expect(calls.map(c=>c.name)).toEqual(['fn_ronda_telegram_ajuste','fn_ronda_telegram_revisar_ajuste']);
 });
 it('refuses a different original movement date at initial review',async()=>{
  reviewResponse={...warning,fecha_movimiento:'2026-10-09'};const deliver=vi.fn();
  await expect(helper.beginTelegramAdjustment(client(),transport,token,'2026-10-10',deliver)).rejects.toThrow('fecha original');expect(deliver).not.toHaveBeenCalled();
 });
 it('recovery preserves saved date and distinguishes identical-number SKU identity',async()=>{
  const received:unknown[]=[];
  for(const producto_nombre of ['SKU A','SKU B']) {
   reviewResponse={...warning,producto_nombre,fecha_movimiento:'2026-10-01'};
   await helper.recoverTelegramAdjustment(client(),transport,`rda_review:${token}`,async(review)=>{received.push(review);reviewed=true;return{message_id:789,chat:transport.chat};});
  }
  expect(received).toEqual(['SKU A','SKU B'].map(producto_nombre=>({...warning,producto_nombre,fecha_movimiento:'2026-10-01'})));
  expect(calls.every(c=>!('p_fecha' in c.body)&&!('p_excepcion' in c.body))).toBe(true);
 });
 it('old exception force refuses before any RPC',async()=>{await expect(helper.confirmTelegramAdjustment(client(),transport,`rda:${token}:forzar`)).rejects.toThrow();expect(calls).toHaveLength(0);});
});
for(const root of ['src/supabase/functions/server','supabase/functions/make-server-1ccce916']) it(`actual registered force callback passes actual transport in ${root}`,async()=>{
 const text=readFileSync(`${root}/telegram/bot.ts`,'utf8');const sf=ts.createSourceFile('bot.ts',text,ts.ScriptTarget.Latest,true);let node:ts.CallExpression|undefined;
 function visit(n:ts.Node){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='bot.callbackQuery'&&n.arguments[0]?.getText(sf)==='RONDA_FORCE')node=n;ts.forEachChild(n,visit);}visit(sf);expect(node).toBeDefined();
 const callbacks:unknown[]=[];const confirm=vi.fn(async()=>({aplicado:true}));const ctx={from:{id:123},chat:transport.chat,callbackQuery:{data:`rda_force:${token}`,message:{message_id:456}},answerCallbackQuery:vi.fn(),reply:vi.fn()};
 const code=ts.transpileModule(node!.getText(sf),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('bot','RONDA_FORCE','tieneAccesoAprobacionGerencia','confirmTelegramAdjustment','getSupabaseAdmin',code)({callbackQuery:(_pattern:unknown,cb:unknown)=>callbacks.push(cb)},source.RONDA_FORCE,async()=>true,confirm,()=>client());
 await (callbacks[0] as (c:unknown)=>Promise<void>)(ctx);expect(confirm.mock.calls[0].slice(1)).toEqual([transport,`rda_force:${token}`]);
});
for(const root of ['src/supabase/functions/server','supabase/functions/make-server-1ccce916']) it(`actual adjustment handler renders observed numbers and registers delivered control in ${root}`,async()=>{
 const text=readFileSync(`${root}/telegram/bot.ts`,'utf8');const sf=ts.createSourceFile('bot.ts',text,ts.ScriptTarget.Latest,true);let node:ts.FunctionDeclaration|undefined;
 function visit(n:ts.Node){if(ts.isFunctionDeclaration(n)&&n.name?.text==='aplicarAjusteRondaYResponder')node=n;ts.forEachChild(n,visit);}visit(sf);expect(node).toBeDefined();
 const code=ts.transpileModule(node!.getText(sf)+'\nreturn aplicarAjusteRondaYResponder;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 class Keyboard { callback?:string; text(_label:string,callback:string){this.callback=callback;return this;} }
 const handler=new Function('beginTelegramAdjustment','hoyBogota','formatearCantidad','InlineKeyboard','escapeRondaReviewText',code)(source.beginTelegramAdjustment,()=> '2026-10-10',String,Keyboard,source.escapeRondaReviewText);
 const ctx={from:{id:123},chat:transport.chat,telegramUser:{id:'registered-actor'},reply:vi.fn(async(text:string,options?:{reply_markup:Keyboard})=>{
  expect(text).toContain(reviewResponse.producto_nombre === 'Otro SKU' ? 'Producto: Otro SKU' : 'Producto: SKU &lt;A&gt;&amp;&quot;&#39;');expect(text).toContain('Unidad: Kilos');expect(text).toContain('Cantidad física contada: 12.345678');expect(text).toContain('Fecha del movimiento: 2026-10-10');expect(options).toMatchObject({parse_mode:'HTML'});expect(text).toContain('Teórico al contar: 10');expect(text).toContain('Teórico revisado: 15');expect(text).toContain('delta 2');expect(options?.reply_markup.callback).toBe(`rda_force:${token}`);reviewed=true;return{message_id:456,chat:transport.chat};
 })};
 await handler(ctx,client(),token,false);expect(ctx.reply).toHaveBeenCalledOnce();expect(calls[1].name).toBe('fn_ronda_telegram_registrar_revision');
 reviewResponse={...warning,producto_nombre:'Otro SKU'};await handler(ctx,client(),token,false);expect(ctx.reply.mock.calls[0][0]).not.toBe(ctx.reply.mock.calls[1][0]);expect(ctx.reply.mock.calls[1][0]).toContain('Producto: Otro SKU');
});
for(const root of ['src/supabase/functions/server','supabase/functions/make-server-1ccce916']) it(`actual handler exposes SAME-proposal recovery after unknown delivery in ${root}`,async()=>{
 const text=readFileSync(`${root}/telegram/bot.ts`,'utf8');const sf=ts.createSourceFile('bot.ts',text,ts.ScriptTarget.Latest,true);let node:ts.FunctionDeclaration|undefined;
 function visit(n:ts.Node){if(ts.isFunctionDeclaration(n)&&n.name?.text==='aplicarAjusteRondaYResponder')node=n;ts.forEachChild(n,visit);}visit(sf);
 const code=ts.transpileModule(node!.getText(sf)+'\nreturn aplicarAjusteRondaYResponder;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 class Keyboard { callback?:string; text(_label:string,callback:string){this.callback=callback;return this;} }
 const handler=new Function('beginTelegramAdjustment','hoyBogota','formatearCantidad','InlineKeyboard','PendingRondaReview','escapeRondaReviewText',code)(source.beginTelegramAdjustment,()=> '2026-10-10',String,Keyboard,source.PendingRondaReview,source.escapeRondaReviewText);
 const reply=vi.fn().mockRejectedValueOnce(Error('delivery unknown')).mockResolvedValueOnce({message_id:789,chat:transport.chat});
 await handler({from:{id:123},chat:transport.chat,telegramUser:{id:'registered'},reply},client(),token,false);
 expect(reply.mock.calls[1][1].reply_markup.callback).toBe(`rda_review:${token}`);expect(new TextEncoder().encode(reply.mock.calls[1][1].reply_markup.callback).length).toBeLessThanOrEqual(64);expect(calls.map(c=>c.name)).toEqual(['fn_ronda_telegram_ajuste']);
});
for(const root of ['src/supabase/functions/server','supabase/functions/make-server-1ccce916']) it(`actual recovery callback displays saved review before registering a new control in ${root}`,async()=>{
 const sf=ts.createSourceFile('bot.ts',readFileSync(`${root}/telegram/bot.ts`,'utf8'),ts.ScriptTarget.Latest,true);let node:ts.CallExpression|undefined;
 function visit(n:ts.Node){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='bot.callbackQuery'&&n.arguments[0]?.getText(sf)==='RONDA_REVIEW')node=n;ts.forEachChild(n,visit);}visit(sf);expect(node).toBeDefined();
 const callbacks:Array<(ctx:unknown)=>Promise<void>>=[];class Keyboard { callback?:string;text(_label:string,callback:string){this.callback=callback;return this;} }
 const code=ts.transpileModule(node!.getText(sf),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('bot','RONDA_REVIEW','tieneAccesoAprobacionGerencia','recoverTelegramAdjustment','getSupabaseAdmin','InlineKeyboard','formatearCantidad','escapeRondaReviewText',code)({callbackQuery:(_p:unknown,cb:(ctx:unknown)=>Promise<void>)=>callbacks.push(cb)},source.RONDA_REVIEW,async()=>true,source.recoverTelegramAdjustment,client,Keyboard,String,source.escapeRondaReviewText);
 const reply=vi.fn(async(text:string,options:{reply_markup:Keyboard})=>{expect(text).toContain(reviewResponse.producto_nombre === 'Otro SKU' ? 'Producto: Otro SKU' : 'Producto: SKU &lt;A&gt;&amp;&quot;&#39;');expect(text).toContain('Fecha del movimiento: 2026-10-10');expect(text).toContain('Cantidad física contada: 12.345678');expect(options).toMatchObject({parse_mode:'HTML'});expect(text).toContain('Teórico revisado: 15');expect(options.reply_markup.callback).toBe(`rda_force:${token}`);reviewed=true;return{message_id:789,chat:transport.chat};});
 await callbacks[0]({from:{id:123},chat:transport.chat,match:[`rda_review:${token}`,token],callbackQuery:{data:`rda_review:${token}`},answerCallbackQuery:vi.fn(),reply});
 expect(reply).toHaveBeenCalledOnce();expect(calls.map(c=>c.name)).toEqual(['fn_ronda_telegram_revisar_ajuste','fn_ronda_telegram_registrar_revision']);expect(calls[1].body).toEqual({p_sender:123,p_chat:123,p_message:789,p_propuesta:token});
 reviewResponse={...warning,producto_nombre:'Otro SKU'};await callbacks[0]({from:{id:123},chat:transport.chat,callbackQuery:{data:`rda_review:${token}`},answerCallbackQuery:vi.fn(),reply});expect(reply.mock.calls[0][0]).not.toBe(reply.mock.calls[1][0]);expect(reply.mock.calls[1][0]).toContain('Producto: Otro SKU');
});
