// Synthetic SDK transport to the verified private-socket replay only.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
if(!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(input.socket)||!input.client.startsWith('/tmp/'))throw Error('Local transport refused');
const require=createRequire(import.meta.url),{Client}=require(input.client);
const pg=new Client({host:input.socket,port:55439,user:'postgres',database:'postgres',password:'',ssl:false,connectionTimeoutMillis:5000,query_timeout:10000});
function load(path,deps={}){const exports={};const result=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});if(result.diagnostics?.length)throw Error('Transpilation refused');new Function('exports','require',result.outputText)(exports,n=>{if(!(n in deps))throw Error('Unexpected module');return deps[n];});return exports;}
const protocol=load('src/supabase/functions/server/telegram/alertResponseProtocol.ts');
const native=load('src/supabase/functions/server/telegram/alertResponse.ts',{'./alertResponseProtocol.ts':protocol});
let losePost=true,posts=0,acknowledged=0;const calls=[],checks=[];
function check(ok,label){if(!ok)throw Error(label);checks.push(label);}
const sdk=createClient('https://clinical-telegram.invalid','synthetic-service',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{
 const target=new URL(String(url));if(target.origin!=='https://clinical-telegram.invalid'||target.pathname!=='/rest/v1/rpc/fn_alert_response_telegram'||options?.method!=='POST')throw Error('External HTTP forbidden');
 const a=JSON.parse(String(options.body));calls.push(a.p_action);if(a.p_action==='post')posts++;
 let result;try{await pg.query('BEGIN');await pg.query('SET LOCAL ROLE service_role');result=(await pg.query('SELECT public.fn_alert_response_telegram($1::text,$2::bigint,$3::bigint,$4::bigint,$5::jsonb) result',[a.p_action,a.p_sender,a.p_chat_id,a.p_message_id,a.p_intent])).rows[0].result;await pg.query('COMMIT');}catch(error){await pg.query('ROLLBACK');return new Response(JSON.stringify({message:error.message,code:error.code??'P0001'}),{status:400,headers:{'Content-Type':'application/json'}});}
 if(a.p_action==='post'&&losePost){losePost=false;throw Error('Response lost after real native COMMIT');}
 return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
}}});
const message={message_id:91,chat:{id:789,type:'private'},text:'Original command'};
const ctx={from:{id:789},chat:{id:789,type:'private'},message,session:{},callbackQuery:null,reply:async()=>message,answerCallbackQuery:async()=>{acknowledged++;},api:{editMessageText:async(chat,id,text)=>{if(chat!==789||id!==91)throw Error('Wrong private message');message.text=text;}}};
const state=async()=>(await pg.query(input.stateQuery)).rows[0].jsonb_build_object;
try{
 await pg.connect();await native.beginAlertResponse(ctx,sdk,input.intent);
 check(calls.join(',')==='prepare','actual Telegram entry prepares without a post');
 check(message.text.includes(input.intent.fecha)&&message.text.includes('Synthetic native Telegram'),'actual original message contains captured target/date preview');
 const before=await state();ctx.session={};ctx.callbackQuery={data:'har:post',message:{...message,text:'Preparing'}};
 await native.handleAlertResponseRecovery(ctx,async()=>{throw Error('Unexpected fallthrough');},sdk);
 check(posts===0&&protocol.sameAlertResponse(before,await state()),'early/undelivered preview click cannot mutate any domain or proof row');
 ctx.callbackQuery={data:'har:post',message:{...message}};
 await native.handleAlertResponseRecovery(ctx,async()=>{},sdk);
 check(posts===1,'explicit original prepared message posts exactly once even without conversation/session');
 const audit=(await pg.query("SELECT receipt FROM alert_response.audit WHERE receipt->'action'->>'messageId'='91'")).rows;
 check(audit.length===1,'native commit survives response loss with exactly one durable audit');
 const after=await state();ctx.session={};ctx.callbackQuery={data:'har:status',message:{...message}};
 await native.handleAlertResponseRecovery(ctx,async()=>{},sdk);
 check(message.text.includes('registrada')&&posts===1,'independent native original-message status recovers committed proof without reposting');
 check(protocol.sameAlertResponse(after,await state()),'status recovery preserves full domain/control/audit state');
 const proof=await protocol.queryAlertResponseTelegram(sdk,{sender:789,chatId:789,messageId:91},'status');
 check(proof.actor.origin==='telegram'&&proof.actor.profileId===null,'current authorized unlinked worker lane is preserved without invented profile');
 check(protocol.sameAlertResponse(proof.receipt,audit[0].receipt),'actual strict receiver equals independent native durable audit');
 const snapshot=(await pg.query('SELECT alert_response.snapshot($1::uuid) result',[input.intent.alertId])).rows[0].result;
 check(protocol.sameAlertResponse(snapshot,proof.receipt.after),'actual native alert response graph equals verified receipt after');
 const previousCalls=calls.length;ctx.from={id:800};await native.handleAlertResponseRecovery(ctx,async()=>{},sdk);check(calls.length===previousCalls,'forwarded private control refuses before RPC');ctx.from={id:789};
 await pg.query('UPDATE telegram_usuarios SET activo=false WHERE telegram_id=789');const revoked=await state();ctx.callbackQuery={data:'har:status',message:{...message}};message.text='Revoked placeholder';await native.handleAlertResponseRecovery(ctx,async()=>{},sdk);
 check(message.text==='Revoked placeholder'&&protocol.sameAlertResponse(revoked,await state()),'fresh revoked registration cannot disclose or mutate its committed receipt');
 check(acknowledged===5,'all independent callback attempts are acknowledged');
 process.stdout.write(JSON.stringify({assertions:checks.length,checks})+'\n');
}finally{await pg.end();}
