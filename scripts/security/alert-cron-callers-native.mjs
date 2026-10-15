// Installed SDK/actual edge caller -> synthetic HTTP -> isolated private Unix socket only.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
import {webcrypto} from 'node:crypto';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
if(!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(input.socket)||!input.client.startsWith('/tmp/'))throw Error('Private local transport required');
const require=createRequire(import.meta.url),{Client}=require(input.client);
const pg=new Client({host:input.socket,port:55439,user:'postgres',database:'postgres',password:'',ssl:false,connectionTimeoutMillis:5000,query_timeout:10000});
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const checks=[];function check(ok,label){if(!ok)throw Error(label);checks.push(label);}
let losePost=true,sends=0,claimCalls=0;
const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:input.owner,exp:4102444800})).toString('base64url')+'.c3ludGhldGlj';
const headers={'Content-Type':'application/json'};
const transport=async(url,options)=>{
 const target=new URL(String(url));if(target.origin!=='https://cron.invalid')throw Error('Hosted transport forbidden');
 if(target.pathname==='/auth/v1/user')return new Response(JSON.stringify({id:input.owner}),{status:200,headers});
 if(target.pathname==='/rest/v1/usuarios')return new Response(JSON.stringify({id:input.owner,rol:'Gerencia',activo:true}),{status:200,headers});
 if(target.pathname==='/rest/v1/telegram_mensajes')return new Response(null,{status:201});
 const name=target.pathname.slice('/rest/v1/rpc/'.length),args=JSON.parse(String(options?.body??'{}'));
 if(!target.pathname.startsWith('/rest/v1/rpc/')||!['fn_alert_cron_service','fn_alert_cron_web','fn_alert_cron_private_callback','fn_alert_response_telegram','fn_clinical_step_telegram'].includes(name))throw Error('Unexpected local SDK endpoint');
 let value;
 try{
  await pg.query('BEGIN');const user=name==='fn_alert_cron_web';const authorization=new Headers(options.headers).get('Authorization');
  if(user&&authorization!=='Bearer '+jwt)throw Error('Actual initiating JWT missing');
  await pg.query('SET LOCAL ROLE '+(user?'authenticated':'service_role'));
  if(user)await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[input.owner]);
  let result;
  if(user)result=await pg.query('SELECT public.fn_alert_cron_web($1,$2::uuid,$3::uuid) result',[args.p_action,args.p_request_key,args.p_expected_owner]);
  else if(name==='fn_alert_cron_service')result=await pg.query('SELECT public.fn_alert_cron_service($1,$2::uuid,$3::jsonb) result',[args.p_action,args.p_key,args.p_payload]);
  else if(['fn_alert_response_telegram','fn_clinical_step_telegram'].includes(name))result=await pg.query('SELECT public.'+name+'($1,$2::bigint,$3::bigint,$4::bigint,$5::jsonb) result',[args.p_action,args.p_sender,args.p_chat_id,args.p_message_id,args.p_intent]);
  else result=await pg.query('SELECT public.fn_alert_cron_private_callback($1::uuid,$2::bigint,$3::bigint,$4::bigint,$5) result',[args.p_delivery,args.p_sender,args.p_chat_id,args.p_message_id,args.p_text]);
  value=result.rows[0].result;await pg.query('COMMIT');
 }catch(error){process.stderr.write('Native RPC '+name+' '+args.p_action+': '+error.message+'\n');await pg.query('ROLLBACK');return new Response(JSON.stringify({message:error.message,code:error.code??'P0001'}),{status:400,headers});}
 if(args.p_action==='claim')claimCalls++;
 if(args.p_action==='post'&&losePost){losePost=false;throw Error('Synthetic lost native commit response');}
 return new Response(JSON.stringify(value),{status:200,headers});
};
const cache=new Map();
function load(name){
 const file=path.resolve(name);if(!file.startsWith(path.resolve('src/supabase/functions/server')+path.sep))throw Error('Unexpected edge dependency');
 if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','require',code)(exports,n=>{
  if(n==='jsr:@supabase/supabase-js@2')return {createClient:(url,key,options={})=>createClient(url,key,{...options,global:{...options.global,fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})};
  if(!n.startsWith('.'))throw Error('Unexpected edge package');return load(path.resolve(path.dirname(file),n));
 });if(file.endsWith('/alertCronJob.ts')){for(const n of ['postReservedAlertCron','verifyCronRun']){const fn=exports[n];exports[n]=(...args)=>{try{const value=fn(...args);return value?.catch?value.catch(error=>{process.stderr.write(n+': '+error.message+'\n');throw error;}):value;}catch(error){process.stderr.write(n+': '+error.message+'\n');throw error;}};}}return exports;
}
globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://cron.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',HATO_ALERTAS_TICK_SECRET:'synthetic-secret',TELEGRAM_BOT_TOKEN:'synthetic-token'})[name]}};
globalThis.fetch=async(url,options)=>{
 if(String(url)!=='https://api.telegram.org/botsynthetic-token/sendMessage')throw Error('Real external transport forbidden');
 sends++;const body=JSON.parse(options.body);return new Response(JSON.stringify({ok:true,result:{message_id:100+sends,chat:{id:Number(body.chat_id)}}}),{status:200,headers});
};
try{
 await pg.connect();
 const {handleHatoAlertasTick}=load('src/supabase/functions/server/hato-alertas-tick.ts');
 const request=(manual=false,key=input.key)=>({req:{header:name=>manual?({Authorization:'Bearer '+jwt,'Idempotency-Key':key})[name]:name==='x-hato-tick-secret'?'synthetic-secret':undefined},json:(value,status=200)=>new Response(JSON.stringify(value),{status,headers})});
 const response=await handleHatoAlertasTick(request()),body=await response.json();
 if(response.status!==200)throw Error('Actual native tick refused: '+JSON.stringify(body));
 check(body.success&&body.state==='committed','actual scheduled handler recovers lost native post and verifies original receipt');
 check(sends>0&&claimCalls===sends,'actual handler sends frozen messages using one native permission per synthetic HTTP request');
 const before=sends,again=await handleHatoAlertasTick(request());check(again.status===200&&sends===before,'same scheduled slot recovers original job/outcomes without another physical send');
 const observed=await pg.query("SELECT count(*)::int n FROM alert_cron.delivery_evidence WHERE kind='accepted_api'");
 check(observed.rows[0].n===sends,'independent native immutable accepted-message evidence matches actual sender count');
 const mappings=await pg.query('SELECT count(*)::int n FROM hato_alertas_envios');check(mappings.rows[0].n>0,'accepted sends persist legacy per-recipient message metadata transactionally');
 const client=createClient('https://cron.invalid','synthetic-service',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false}});
 const delivered=(await pg.query("SELECT d.*,e.message_id FROM alert_cron.deliveries d JOIN alert_cron.delivery_evidence e ON e.delivery_id=d.id WHERE d.alert_id=$1",[input.alert])).rows[0];
 let preview=null;const nativeMessage={message_id:Number(delivered.message_id),chat:{id:789,type:'private'},text:delivered.body.text};
 const ctx={from:{id:789},chat:{id:789,type:'private'},session:{},callbackQuery:{data:`hjd:${delivered.id}:no`,message:nativeMessage},reply:async(text)=>({message_id:501,chat:{id:789,type:'private'},text}),api:{editMessageText:async(_chat,_id,text)=>{preview=text;}},answerCallbackQuery:async()=>{}};
 const callback=load('src/supabase/functions/server/telegram/alertCronCallback.ts');
 let forwarded=false;try{await callback.handleAlertCronCallback({...ctx,callbackQuery:{...ctx.callbackQuery,message:{...nativeMessage,forward_origin:{type:'user'}}}},client,()=> '2026-10-15');}catch{forwarded=true;}
 check(forwarded,'actual native handler refuses forwarded notification controls before RPC/preparation');
 await callback.handleAlertCronCallback(ctx,client,()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 check(typeof preview==='string'&&preview.startsWith('Revisar respuesta de alerta')&&preview.includes('Programada:'),'actual frozen private callback prepares and renders a captured target/date response review');
 const pending=(await pg.query('SELECT * FROM alert_response.requests WHERE sender=789 AND message_id=501')).rows;
 check(pending.length===1&&pending[0].state==='pending','notification callback itself never posts an alert response or clinical execution');
 ctx.session={};ctx.callbackQuery={data:'har:post',message:{message_id:501,chat:{id:789,type:'private'},text:preview}};
 await load('src/supabase/functions/server/telegram/alertResponse.ts').handleAlertResponseRecovery(ctx,async()=>{throw Error('Unexpected callback fallthrough');},client);
 const resolved=(await pg.query('SELECT state FROM alert_response.requests WHERE sender=789 AND message_id=501')).rows;
 check(resolved[0].state==='committed','original private prepared action posts with no surviving session or conversation');
 const lifecycle=(await pg.query('SELECT id,estado,datos FROM hato_alertas WHERE id=ANY($1::uuid[])',[[input.legacy,input.expired,input.escalated,input.fact]])).rows;
 check(lifecycle.find(a=>a.id===input.legacy)?.estado==='descartada'&&lifecycle.find(a=>a.id===input.legacy)?.datos.motivo_descarte==='regla_superada','actual tick atomically retires a superseded rule from its reserved source');
 check(lifecycle.find(a=>a.id===input.fact)?.estado==='descartada'&&lifecycle.find(a=>a.id===input.fact)?.datos.motivo_descarte==='hecho_registrado','actual tick retires an alert already answered by a captured domain fact');
 check(lifecycle.find(a=>a.id===input.expired)?.estado==='expirada'&&lifecycle.find(a=>a.id===input.escalated)?.estado==='escalada','actual tick applies expiration and escalation before compatible outbox dispatch');
 const clinical=(await pg.query("SELECT d.*,e.message_id FROM alert_cron.deliveries d JOIN alert_cron.delivery_evidence e ON e.delivery_id=d.id JOIN hato_alertas a ON a.id=d.alert_id WHERE a.paso_id=$1",[input.step])).rows[0];
 check(!!clinical,'actual tick generates a linked pending clinical alert and dispatches its frozen notification');
 const clinicalCtx={...ctx,session:{},callbackQuery:{data:`hjd:${clinical.id}:si`,message:{message_id:Number(clinical.message_id),chat:{id:789,type:'private'},text:clinical.body.text}},reply:async(text)=>({message_id:601,chat:{id:789,type:'private'},text})};
 await callback.handleAlertCronCallback(clinicalCtx,client,()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 check(preview.startsWith('Revisar aplicación de tratamiento')&&(await pg.query('SELECT fecha_ejecutada FROM hato_tratamiento_pasos WHERE id=$1',[input.step])).rows[0].fecha_ejecutada===null,'actual clinical Sí prepares the exact existing step/date review without execution');
 const manual=await handleHatoAlertasTick(request(true));check(manual.status===200,'actual manual handler reserves using original JWT and current Gerencia before trusted execution');
 const principal=await pg.query("SELECT actor FROM alert_cron.runs WHERE slot=$1",['manual:'+input.owner+':'+input.key]);
 check(principal.rows.length===1&&principal.rows[0].actor.profileId===input.owner,'native manual job preserves real initiating JWT profile');
 const missing=await handleHatoAlertasTick(request(true,'bad'));check(missing.status===400,'manual tick refuses missing stable original UUID before reservation');
 process.stdout.write(JSON.stringify({assertions:checks.length,checks,sends})+'\n');
}finally{await pg.end();}
