// Actual browser durable adapter and installed strict SDK -> synthetic local Auth/private PG socket only.
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
const input=JSON.parse(fs.readFileSync(0,'utf8'));if(!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(input.socket)||!input.client.startsWith('/tmp/'))throw Error('Private local transport required');
const {Client}=createRequire(import.meta.url)(input.client),pg=new Client({host:input.socket,port:55439,user:'postgres',database:'postgres',password:'',ssl:false,connectionTimeoutMillis:5000,query_timeout:10000});
const token=id=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString('base64url')+'.c3ludGhldGlj',headers={'Content-Type':'application/json'};let active=input.owner,lose=true,posts=0;const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
async function transport(url,options={}){const u=new URL(String(url));if(u.origin!=='https://event-correction.invalid')throw Error('Hosted transport forbidden');const bearer=(new Headers(options.headers).get('Authorization')??'').replace(/^Bearer /,''),uid=bearer.endsWith('.c3ludGhldGlj')?JSON.parse(Buffer.from(bearer.split('.')[1],'base64url').toString()).sub:null;
 if(u.pathname==='/auth/v1/user')return new Response(JSON.stringify({id:uid??active}),{headers});if(!['/rest/v1/rpc/fn_hato_event_correction_web','/rest/v1/rpc/fn_hato_cycle_web'].includes(u.pathname)||!uid||options.method!=='POST')throw Error('Unexpected request');const a=JSON.parse(String(options.body));let result;
 try{await pg.query('BEGIN');await pg.query('SET LOCAL ROLE authenticated');await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[uid]);result=(await pg.query(u.pathname.endsWith('/fn_hato_cycle_web')?'SELECT fn_hato_cycle_web($1,$2::uuid,$3::jsonb,$4::uuid) value':'SELECT fn_hato_event_correction_web($1,$2::uuid,$3::jsonb,$4::uuid) value',[a.p_action,a.p_request_key,a.p_intent,a.p_expected_owner])).rows[0].value;await pg.query('COMMIT');}catch(error){await pg.query('ROLLBACK');return new Response(JSON.stringify({message:error.message,code:error.code??'P0001'}),{status:400,headers});}
 if(u.pathname.endsWith('/fn_hato_event_correction_web')&&a.p_action==='post'){posts++;if(lose){lose=false;throw Error('Synthetic lost committed correction response');}}return new Response(JSON.stringify(result),{headers});}
const cache=new Map();function load(name){let file=path.resolve(name);if(!path.extname(file))file+='.ts';if(!file.startsWith(path.resolve('src/utils')+path.sep))throw Error('Unexpected source');if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,n=>{if(n==='@/utils/calculosHato')return load('src/utils/calculosHato.ts');if(!n.startsWith('.'))throw Error('Unexpected package');return load(path.resolve(path.dirname(file),n));});return exports;}
try{await pg.connect();const sdk=createClient('https://event-correction.invalid','synthetic',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});await sdk.auth.setSession({access_token:token(active),refresh_token:'synthetic'});
 const protocol=load('src/utils/hato/hatoEventCorrectionProtocol.ts'),cycle=load('src/utils/hato/hatoCycleProtocol.ts'),browser=load('src/utils/hato/hatoEventCorrectionBrowserAttempt.ts'),same=protocol.sameEventCorrection;
 const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_k,_o,fn)=>fn()}}});
 for(const marca of ['preñada','confirmada'])for(const modo of ['fecha_conocida','meses_prenez']){
  const animalId=randomUUID(),creationKey=randomUUID();await pg.query("INSERT INTO hato_animales(id,nombre,etapa,estado) VALUES($1,'Synthetic browser cycle','vaca','activa')",[animalId]);
  const observedAnimal=(await pg.query('SELECT to_jsonb(x) value FROM hato_animales x WHERE id=$1',[animalId])).rows[0].value;
  const intent={version:1,animalId,observedAnimal,input:{marca,fecha:'2026-08-15',fechaConfianza:'exacta',criaDestino:null,nota:'Browser original cycle',ancla:{modo,fechaServicio:modo==='fecha_conocida'?'2026-01-15':null,mesesPrenez:modo==='meses_prenez'?3:null}}};
  await cycle.cycleWeb(sdk,active,creationKey,'prepare',intent);const creation=await cycle.cycleWeb(sdk,active,creationKey,'post');
  for(const [member,mode] of [['servicio','edit'],['confirmacion_prenez','delete']]){
   const target=(await pg.query('SELECT to_jsonb(x) value FROM hato_eventos x WHERE animal_id=$1 AND tipo=$2',[animalId,member])).rows[0].value;
   const partner=(await pg.query('SELECT to_jsonb(x) value FROM hato_eventos x WHERE animal_id=$1 AND id<>$2',[animalId,target.id])).rows[0].value;
   const day=(await pg.query('SELECT ($1::date+1)::text value',[target.fecha])).rows[0].value;
   const p=protocol.eventCorrectionIntent({version:1,eventId:target.id,mode,observedEvent:target,changes:mode==='edit'?{fecha:day,fecha_confianza:'aproximada',tipo_servicio:target.tipo_servicio,toro_id:target.toro_id,cria_destino:target.cria_destino,nota:'Explicit member correction',motivo:'Reviewed observation'}:null});
   const beforePosts=posts;let attempt=await browser.runEventCorrectionBrowser(sdk,active,p,'prepare',()=>true);
   check(attempt.result.state==='pending'&&posts===beforePosts,'actual member editor adapter prepares without post');
   check(attempt.result.original.graph.events.length===2&&same(browser.pendingEventCorrectionBrowser(active),attempt),'complete paired graph and owner original UUID survive durable readback');
   const before=(await pg.query(input.stateQuery)).rows[0].jsonb_object_agg,original=structuredClone(attempt);lose=true;let refused=false;
   try{await browser.runEventCorrectionBrowser(sdk,active,null,'post',()=>true,attempt);}catch{refused=true;}
   check(refused&&posts===beforePosts+1&&same(browser.pendingEventCorrectionBrowser(active),original),'lost committed response preserves original prepared UUID without replacement');
   attempt=await browser.runEventCorrectionBrowser(sdk,active,null,'status',()=>true);
   check(attempt.result.state==='committed'&&attempt.key===original.key,'remounted original status recovers selected member correction');
   const audit=(await pg.query('SELECT receipt FROM hato_event_correction.audit WHERE request_key=$1',[attempt.key])).rows[0].receipt;
   check(same(audit,attempt.result.receipt),'strict original recovery equals independent native immutable audit');
   const graph=(await pg.query('SELECT hato_event_correction.snapshot($1::jsonb) value',[p])).rows[0].value,trace=(await pg.query('SELECT to_jsonb(x) value FROM hato_correcciones x WHERE id=$1',[audit.correction.id])).rows[0].value;
   check(same(graph,audit.after)&&same(trace,audit.correction)&&trace.corregido_por===active,'complete native graph and real current actor trace equal strict proof');
   const currentPartner=(await pg.query('SELECT to_jsonb(x) value FROM hato_eventos x WHERE id=$1',[partner.id])).rows[0].value;
   check(same(currentPartner,partner)&&same(audit.after.event,original.result.plan.event),'selected edit/delete preserves counterpart exactly without recalculation');
   const after=(await pg.query(input.stateQuery)).rows[0].jsonb_object_agg,allowed=new Set(['public.hato_eventos','public.hato_correcciones','hato_event_correction.requests','hato_event_correction.audit']);
   check(Object.entries(before).every(([k,v])=>allowed.has(k)||same(v,after[k])),'all unrelated domain/backup/finance/creation-proof rows unchanged');
   check(same(await cycle.cycleWeb(sdk,active,creationKey,'status'),creation)&&same(await cycle.cycleWeb(sdk,active,creationKey,'post'),creation),'original cycle recovery retains immutable creation proof without recreation');
   const frozen=(await pg.query(input.stateQuery)).rows[0].jsonb_object_agg;
   check(await browser.runEventCorrectionBrowser(sdk,active,null,'new',()=>true,attempt)===null&&browser.pendingEventCorrectionBrowser(active)===null,'verified terminal finish clears only original owner attempt');
   check(posts===beforePosts+1&&same(frozen,(await pg.query(input.stateQuery)).rows[0].jsonb_object_agg),'finish and original creation retry never resend or mutate domain/private rows');
  }
 }
 process.stdout.write(JSON.stringify({assertions:checks.length,checks})+'\n');
}finally{await pg.end();}
