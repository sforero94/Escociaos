// Actual browser durable adapter and installed strict SDK -> synthetic local Auth/private PG socket only.
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
const input=JSON.parse(fs.readFileSync(0,'utf8'));if(!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(input.socket)||!input.client.startsWith('/tmp/'))throw Error('Private local transport required');
const {Client}=createRequire(import.meta.url)(input.client),pg=new Client({host:input.socket,port:55439,user:'postgres',database:'postgres',password:'',ssl:false,connectionTimeoutMillis:5000,query_timeout:10000});
const token=id=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString('base64url')+'.c3ludGhldGlj',headers={'Content-Type':'application/json'};let active=input.owner,lose=true,posts=0;const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
async function transport(url,options={}){const u=new URL(String(url));if(u.origin!=='https://event-correction.invalid')throw Error('Hosted transport forbidden');const bearer=(new Headers(options.headers).get('Authorization')??'').replace(/^Bearer /,''),uid=bearer.endsWith('.c3ludGhldGlj')?JSON.parse(Buffer.from(bearer.split('.')[1],'base64url').toString()).sub:null;
 if(u.pathname==='/auth/v1/user')return new Response(JSON.stringify({id:uid??active}),{headers});if(u.pathname!=='/rest/v1/rpc/fn_hato_event_correction_web'||!uid||options.method!=='POST')throw Error('Unexpected request');const a=JSON.parse(String(options.body));let result;
 try{await pg.query('BEGIN');await pg.query('SET LOCAL ROLE authenticated');await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[uid]);result=(await pg.query('SELECT fn_hato_event_correction_web($1,$2::uuid,$3::jsonb,$4::uuid) value',[a.p_action,a.p_request_key,a.p_intent,a.p_expected_owner])).rows[0].value;await pg.query('COMMIT');}catch(error){await pg.query('ROLLBACK');return new Response(JSON.stringify({message:error.message,code:error.code??'P0001'}),{status:400,headers});}
 if(a.p_action==='post'){posts++;if(lose){lose=false;throw Error('Synthetic lost committed correction response');}}return new Response(JSON.stringify(result),{headers});}
const cache=new Map();function load(name){let file=path.resolve(name);if(!path.extname(file))file+='.ts';if(!file.startsWith(path.resolve('src/utils/hato')+path.sep))throw Error('Unexpected source');if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,n=>{if(!n.startsWith('.'))throw Error('Unexpected package');return load(path.resolve(path.dirname(file),n));});return exports;}
try{await pg.connect();const sdk=createClient('https://event-correction.invalid','synthetic',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});await sdk.auth.setSession({access_token:token(active),refresh_token:'synthetic'});const protocol=load('src/utils/hato/hatoEventCorrectionProtocol.ts');
 const event=(await pg.query('SELECT to_jsonb(x) value FROM hato_eventos x WHERE id=$1',[input.event])).rows[0].value,p=protocol.eventCorrectionIntent({version:1,eventId:input.event,mode:'edit',observedEvent:event,changes:{fecha:'2026-08-05',fecha_confianza:'exacta',tipo_servicio:event.tipo_servicio,toro_id:event.toro_id,cria_destino:event.cria_destino,nota:'SDK reviewed note',motivo:'SDK observed fact'}}),key=randomUUID();
 const prepared=await protocol.eventCorrectionWeb(sdk,active,key,'prepare',p);check(prepared.state==='pending'&&posts===0,'strict installed SDK prepare captures exact source without mutation');check(protocol.sameEventCorrection(prepared.plan,protocol.expectedEventCorrection(p)),'native SQL and strict TS reconstruct the same complete edit plan');
 let refused=false;try{await protocol.eventCorrectionWeb(sdk,active,key,'post',null,prepared);}catch{refused=true;}check(refused&&posts===1,'response loss follows exactly one committed native edit');
 const recovered=await protocol.eventCorrectionWeb(sdk,active,key,'status',null,prepared);check(recovered.state==='committed'&&recovered.requestKey===key,'original key recovers verified committed correction');
 const audit=(await pg.query('SELECT receipt FROM hato_event_correction.audit WHERE request_key=$1',[key])).rows[0].receipt;check(protocol.sameEventCorrection(audit,recovered.receipt),'strict recovered proof equals independent immutable operation audit');
 const graph=(await pg.query('SELECT hato_event_correction.snapshot($1::jsonb) value',[p])).rows[0].value,trace=(await pg.query('SELECT to_jsonb(x) value FROM hato_correcciones x WHERE id=$1',[audit.correction.id])).rows[0].value;check(protocol.sameEventCorrection(graph,audit.after)&&protocol.sameEventCorrection(trace,audit.correction),'independent target graph/human correction equals SDK proof');
 const before=(await pg.query(input.stateQuery)).rows[0].jsonb_object_agg;check(protocol.sameEventCorrection(await protocol.eventCorrectionWeb(sdk,active,key,'post',null,recovered),recovered),'same-key retry returns original correction instead of another edit');check(protocol.sameEventCorrection(before,(await pg.query(input.stateQuery)).rows[0].jsonb_object_agg),'repeated post leaves every domain/private row unchanged');
 active=input.other;await sdk.auth.setSession({access_token:token(active),refresh_token:'synthetic'});refused=false;try{await protocol.eventCorrectionWeb(sdk,active,key,'status');}catch{refused=true;}check(refused,'fresh other owner cannot disclose original correction');

 // Actual browser durable-attempt adapter, installed SDK and independent native rows.
 const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_k,_o,fn)=>fn()}}});
 const browser=load('src/utils/hato/hatoEventCorrectionBrowserAttempt.ts');active=input.owner;await sdk.auth.setSession({access_token:token(active),refresh_token:'synthetic'});
 const current=(await pg.query('SELECT to_jsonb(x) value FROM hato_eventos x WHERE id=$1',[input.event])).rows[0].value;
 const bp=protocol.eventCorrectionIntent({...p,observedEvent:current,changes:{...p.changes,nota:'Actual browser reviewed note'}}),beforePosts=posts;
 let attempt=await browser.runEventCorrectionBrowser(sdk,active,bp,'prepare',()=>true);
 check(attempt.result.state==='pending'&&posts===beforePosts,'actual browser adapter preparation does not post');
 check(protocol.sameEventCorrection(browser.pendingEventCorrectionBrowser(active),attempt),'owner-bound original UUID/intent/complete plan read back from durable storage');
 const originalAttempt=structuredClone(attempt);lose=true;refused=false;
 try{await browser.runEventCorrectionBrowser(sdk,active,null,'post',()=>true,attempt);}catch{refused=true;}
 check(refused&&posts===beforePosts+1,'browser unknown response follows exactly one native committed edit');
 check(protocol.sameEventCorrection(browser.pendingEventCorrectionBrowser(active),originalAttempt),'lost response preserves original browser UUID and prepared review');
 attempt=await browser.runEventCorrectionBrowser(sdk,active,null,'status',()=>true);
 check(attempt.result.state==='committed'&&attempt.key===originalAttempt.key,'remounted browser recovers committed original without another reservation');
 const browserAudit=(await pg.query('SELECT receipt FROM hato_event_correction.audit WHERE request_key=$1',[attempt.key])).rows[0].receipt;
 check(protocol.sameEventCorrection(attempt.result.receipt,browserAudit),'actual browser recovered proof equals independent immutable native audit');
 const browserGraph=(await pg.query('SELECT hato_event_correction.snapshot($1::jsonb) value',[bp])).rows[0].value;
 check(protocol.sameEventCorrection(browserGraph,browserAudit.after),'browser committed target and entire graph equal independent native snapshot');
 const frozen=(await pg.query(input.stateQuery)).rows[0].jsonb_object_agg;
 const result=await browser.runEventCorrectionBrowser(sdk,active,null,'new',()=>true,attempt);
 check(result===null&&browser.pendingEventCorrectionBrowser(active)===null,'verified terminal finish removes only original browser attempt');
 check(posts===beforePosts+1&&protocol.sameEventCorrection(frozen,(await pg.query(input.stateQuery)).rows[0].jsonb_object_agg),'finish/status never resend edit or mutate native domain/private rows');
 // Fresh Gerencia deletion and recovery after the public target is gone.
 active=input.other;await sdk.auth.setSession({access_token:token(active),refresh_token:'synthetic'});
 const dp=protocol.eventCorrectionIntent({version:1,eventId:input.event,mode:'delete',observedEvent:browserAudit.after.event,changes:null});
 let deleting=await browser.runEventCorrectionBrowser(sdk,active,dp,'prepare',()=>true);lose=true;refused=false;
 try{await browser.runEventCorrectionBrowser(sdk,active,null,'post',()=>true,deleting);}catch{refused=true;}
 deleting=await browser.runEventCorrectionBrowser(sdk,active,null,'status',()=>true);
 check(refused&&deleting.result.state==='committed'&&deleting.result.receipt.after.event===null,'original browser deletion recovers strict proof after lost response and absent target');
 check((await pg.query('SELECT count(*)::int n FROM hato_eventos WHERE id=$1',[input.event])).rows[0].n===0,'independent native read confirms exact browser deletion');
 const traceDelete=(await pg.query('SELECT to_jsonb(x) value FROM hato_correcciones x WHERE id=$1',[deleting.result.receipt.correction.id])).rows[0].value;
 check(protocol.sameEventCorrection(traceDelete,deleting.result.receipt.correction),'browser deletion retains independently verified trusted before-row/current-actor human trace');
 await browser.runEventCorrectionBrowser(sdk,active,null,'new',()=>true,deleting);
 check(browser.pendingEventCorrectionBrowser(active)===null,'Gerencia verified deletion completion clears durable original');
 const cancelIntent={...bp,observedEvent:browserAudit.after.event};let canceling=await browser.runEventCorrectionBrowser(sdk,active,cancelIntent,'prepare',()=>true).catch(()=>null);
 // A stale absent target must fail preparation but preserve the allocated original for a cancellation fence.
 check(canceling===null&&browser.pendingEventCorrectionBrowser(active)?.result===null,'known stale-source refusal keeps allocated UUID without a replacement');
 canceling=browser.pendingEventCorrectionBrowser(active);canceling=await browser.runEventCorrectionBrowser(sdk,active,null,'resolve',()=>true,canceling);
 check(canceling.result.state==='canceled','same original unknown key can be canceled without inventing a domain result');
 await browser.runEventCorrectionBrowser(sdk,active,null,'new',()=>true,canceling);
 process.stdout.write(JSON.stringify({assertions:checks.length,checks})+'\n');
}finally{await pg.end();}
