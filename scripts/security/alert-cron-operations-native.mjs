// Actual operator browser and edge execution, installed SDK, synthetic Auth/HTTP/private socket only.
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import {createRequire} from 'node:module';import {webcrypto} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
const input=JSON.parse(fs.readFileSync(0,'utf8'));if(!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(input.socket)||!input.client.startsWith('/tmp/'))throw Error('Local private transport required');
const {Client}=createRequire(import.meta.url)(input.client),pg=new Client({host:input.socket,port:55439,user:'postgres',database:'postgres',password:'',ssl:false,connectionTimeoutMillis:5000,query_timeout:10000});
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_k,_o,fn)=>fn()}}});
const token=id=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString('base64url')+'.c3ludGhldGlj';const headers={'Content-Type':'application/json'};
let active=input.owner,losePost=true,sends=0;
const checks=[];const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
async function transport(url,options={}){
 const u=new URL(String(url));if(u.origin!=='https://operator.invalid')throw Error('Hosted transport forbidden');
 const authorization=new Headers(options.headers).get('Authorization')??'',bearer=authorization.replace(/^Bearer /,'');
 const uid=bearer.endsWith('.c3ludGhldGlj')?JSON.parse(Buffer.from(bearer.split('.')[1],'base64url').toString()).sub:null;
 if(u.pathname==='/auth/v1/user')return new Response(JSON.stringify({id:uid??active}),{headers});
 if(u.pathname==='/rest/v1/telegram_mensajes')return new Response(null,{status:201});
 if(!u.pathname.startsWith('/rest/v1/rpc/'))throw Error('Unexpected local endpoint');
 const name=u.pathname.slice('/rest/v1/rpc/'.length),a=JSON.parse(String(options.body));let result;
 try{
  await pg.query('BEGIN');const human=['fn_alert_cron_monitor','fn_alert_cron_operator'].includes(name);
  if(human&&!uid)throw Error('Original JWT missing');if(!human&&bearer!=='synthetic-service')throw Error('Service principal missing');
  await pg.query('SET LOCAL ROLE '+(human?'authenticated':'service_role'));if(human)await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[uid]);
  if(name==='fn_alert_cron_monitor')result=await pg.query('SELECT public.fn_alert_cron_monitor($1::uuid,$2::jsonb,$3::uuid) value',[a.p_owner,a.p_before,a.p_run]);
  else if(name==='fn_alert_cron_operator')result=await pg.query('SELECT public.fn_alert_cron_operator($1,$2::uuid,$3::jsonb,$4::uuid) value',[a.p_action,a.p_request_key,a.p_intent,a.p_expected_owner]);
  else if(name==='fn_alert_cron_service')result=await pg.query('SELECT public.fn_alert_cron_service($1,$2::uuid,$3::jsonb) value',[a.p_action,a.p_key,a.p_payload]);
  else if(name==='fn_alert_cron_record_metrics')result=await pg.query('SELECT public.fn_alert_cron_record_metrics($1::uuid,$2::jsonb,$3::jsonb) value',[a.p_run,a.p_source,a.p_coverage]);
  else throw Error('Unexpected native function');
  await pg.query('COMMIT');
 }catch(error){await pg.query('ROLLBACK');process.stderr.write(name+': '+error.message+'\n');return new Response(JSON.stringify({message:error.message,code:error.code??'P0001'}),{status:400,headers});}
 if(name==='fn_alert_cron_operator'&&a.p_action==='post'&&losePost){losePost=false;throw Error('Synthetic lost native operator commit response');}
 return new Response(JSON.stringify(result.rows[0].value),{headers});
}
const cache=new Map();function load(name){let file=path.resolve(name);if(!path.extname(file))file+='.ts';if(!['src/utils/hato','src/supabase/functions/server'].some(p=>file.startsWith(path.resolve(p)+path.sep)))throw Error('Unexpected local source');if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,n=>{if(n==='jsr:@supabase/supabase-js@2')return {createClient:(url,key,options={})=>createClient(url,key,{...options,global:{...options.global,fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})};if(!n.startsWith('.'))throw Error('Unexpected edge package');return load(path.resolve(path.dirname(file),n));});return exports;}
globalThis.Deno={env:{get:k=>({SUPABASE_URL:'https://operator.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',TELEGRAM_BOT_TOKEN:'synthetic-token'})[k]}};
globalThis.fetch=async(url,options)=>{if(String(url)!=='https://api.telegram.org/botsynthetic-token/sendMessage')throw Error('Actual HTTP forbidden');sends++;const body=JSON.parse(options.body);return new Response(JSON.stringify({ok:true,result:{message_id:900+sends,chat:{id:Number(body.chat_id)}}}),{headers});};
try{
 await pg.connect();const sdk=createClient('https://operator.invalid','synthetic-key',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});await sdk.auth.setSession({access_token:token(active),refresh_token:'synthetic'});
 const protocol=load('src/utils/hato/alertCronOperationsProtocol.ts'),browser=load('src/utils/hato/alertCronOperationsBrowser.ts');
 const monitor=await protocol.readOpsMonitor(sdk,active,input.target);check(monitor.runs.length===1&&monitor.runs[0].sourceChanged,'installed SDK reads protected stale replacement summary without domain/body disclosure');
 const intent={kind:'replan_run',targetId:input.target,observed:monitor.runs[0],reason:'Synthetic current-source operator review'};
 const prepared=await browser.runOps(sdk,active,'prepare',intent,()=>true);check(prepared.result.state==='pending','actual browser durably reserves original operator key before review without allocation');
 let lost=false;try{await browser.runOps(sdk,active,'post',null,()=>true,prepared);}catch{lost=true;}
 check(lost&&browser.pendingOps(active).key===prepared.key,'lost native replan commit preserves the original browser owner/key');
 const recovered=await browser.runOps(sdk,active,'status',null,()=>true);check(recovered.result.state==='committed','same original SDK status verifies complete cancellation/replacement receipt');
 const audit=(await pg.query('SELECT receipt FROM alert_cron.operator_audit WHERE request_key=$1',[prepared.key])).rows;
 check(audit.length===1&&protocol.opsSame(audit[0].receipt,recovered.result.receipt),'independent immutable native operator audit equals strict browser receipt');
 const endpoint=load('src/supabase/functions/server/alertCronOperatorExecution.ts');
 const request=()=>({req:{header:n=>({'Authorization':'Bearer '+token(active),'Idempotency-Key':prepared.key})[n]},json:(body,status=200)=>new Response(JSON.stringify(body),{status,headers})});
 const response=await endpoint.handleAlertCronOperatorExecution(request()),body=await response.json();if(response.status!==200)throw Error('Actual operator execution refused '+JSON.stringify(body));
 check(body.runId===recovered.result.receipt.replacement.id&&body.coverageRecorded,'actual operator edge execution uses only the original linked reservation and records source-bound coverage');
 check(sends>=1,'actual executor obtains one native permission and invokes the synthetic sender for a real queued notification');
 const before=sends,retry=await endpoint.handleAlertCronOperatorExecution(request());check(retry.status===200&&sends===before,'uncertain/repeated operator execution recovers original job and never resends a physical notification');
 const detail=await protocol.readOpsMonitor(sdk,active,body.runId);check(detail.metrics.length===1&&detail.deliveries.some(d=>d.state==='sent'&&d.evidence?.kind==='accepted_api'),'protected monitoring reports accepted original delivery evidence and durable rule coverage');
 const cov=(await pg.query('SELECT coverage FROM alert_cron.run_metrics WHERE run_id=$1',[body.runId])).rows[0].coverage;
 check(protocol.opsSame(cov,detail.metrics[0].coverage),'displayed source-bound coverage equals independent immutable native metrics');
 await browser.runOps(sdk,active,'clear',null,()=>true,recovered);check(browser.pendingOps(active)===null,'verified terminal operator proof can be cleared without deleting server evidence');
 const saved=detail.operations.find(o=>o.requestKey===prepared.key);check(!!saved,'monitor retains the original operator replan key after browser clear');
 const restored=await browser.restoreRecordedOps(sdk,active,saved,()=>true);check(restored.key===prepared.key,'recorded operation restores the same durable owner/key through fresh server status');
 active=input.other;await sdk.auth.setSession({access_token:token(active),refresh_token:'synthetic'});let refused=false;try{await browser.runOps(sdk,input.owner,'status',null,()=>true);}catch{refused=true;}check(refused&&browser.pendingOps(input.owner).key===prepared.key,'account switch refuses original recovery without replacing stored ownership');
 const switched=await endpoint.handleAlertCronOperatorExecution(request());check(switched.status===503&&sends===before,'actual endpoint rejects another operator JWT for the original key before sending');
 process.stdout.write(JSON.stringify({assertions:checks.length,checks,sends})+'\n');
}finally{await pg.end();}
