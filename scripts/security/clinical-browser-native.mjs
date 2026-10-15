// Local-only SDK -> private Unix socket transport. Never a hosted HTTP/DB client.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
if(!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(input.socket)||!input.client.startsWith('/tmp/')||!['lost-post','owner-switch'].includes(input.mode))throw Error('Local proof transport refused');
const require=createRequire(import.meta.url),{Client}=require(input.client);
const pg=new Client({host:input.socket,port:55439,user:'postgres',database:'postgres',password:'',ssl:false,connectionTimeoutMillis:5000,query_timeout:10000});
const store=new Map();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_n,_o,fn)=>fn()}}});
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
function load(path,dependencies={}){const exports={};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});if(code.diagnostics?.length)throw Error('Protocol transpilation refused');new Function('exports','require',code.outputText)(exports,n=>{if(!(n in dependencies))throw Error('Unexpected local module dependency');return dependencies[n];});return exports;}
const protocol=load('src/utils/hato/clinicalStepConfirmationProtocol.ts');
const browser=load('src/utils/hato/clinicalStepBrowserAttempt.ts',{'./clinicalStepConfirmationProtocol':protocol});
const checks=[];function check(ok,label){if(!ok)throw Error(label);checks.push(label);}
const token=id=>'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString('base64url')+'.c3ludGhldGlj';
let active=input.owner,loseOnce=input.mode==='lost-post',flipped=false,seenOwner=null,seenExpected=null,ownerRefusal=false;
const sdk=createClient('https://clinical.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{
 const target=new URL(String(url));if(target.origin!=='https://clinical.invalid')throw Error('External HTTP forbidden');
 if(target.pathname==='/auth/v1/user')return new Response(JSON.stringify({id:active,email:'synthetic@example.invalid'}),{status:200,headers:{'Content-Type':'application/json'}});
 if(target.pathname!=='/rest/v1/rpc/fn_clinical_step_web'||options?.method!=='POST')throw Error('Unexpected SDK endpoint');
 const args=JSON.parse(String(options.body)),authorization=new Headers(options.headers).get('Authorization')??'';
 if(!authorization.endsWith('.c3ludGhldGlj'))throw Error('Only synthetic Auth permitted');
 const uid=JSON.parse(Buffer.from(authorization.split('.')[1],'base64url').toString()).sub;
 if(![input.owner,input.other].includes(uid))throw Error('Unexpected synthetic principal');
 if(args.p_action==='post'){seenOwner=uid;seenExpected=args.p_expected_owner;}
 let value;
 try{
  await pg.query('BEGIN');await pg.query('SET LOCAL ROLE authenticated');await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[uid]);
  const result=await pg.query('SELECT public.fn_clinical_step_web($1::text,$2::uuid,$3::jsonb,$4::uuid) result',[args.p_action,args.p_request_key,args.p_intent,args.p_expected_owner]);value=result.rows[0].result;await pg.query('COMMIT');
 }catch(error){await pg.query('ROLLBACK');if(error.message.includes('Original clinical owner changed'))ownerRefusal=true;return new Response(JSON.stringify({message:error.message,code:error.code??'P0001'}),{status:400,headers:{'Content-Type':'application/json'}});}
 if(args.p_action==='post'&&loseOnce){loseOnce=false;throw Error('Synthetic lost response after native commit');}
 return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
}}});
const client={auth:sdk.auth,rpc(name,args){const builder=sdk.rpc(name,args);if(input.mode==='owner-switch'&&args.p_action==='post'&&!flipped){flipped=true;return(async()=>{active=input.other;const changed=await sdk.auth.setSession({access_token:token(active),refresh_token:'synthetic'});if(changed.error)throw changed.error;return await builder;})();}return builder;}};
async function state(){return(await pg.query(input.stateQuery)).rows[0].jsonb_build_object;}
try{
 await pg.connect();const session=await sdk.auth.setSession({access_token:token(active),refresh_token:'synthetic'});if(session.error)throw session.error;
 const prepared=await browser.runClinicalBrowser(client,input.owner,input.intent,'prepare',()=>true);
 check(prepared?.result?.state==='pending','installed SDK prepares a real native clinical snapshot without posting');
 const before=await state();let refused=false;
 try{await browser.runClinicalBrowser(client,input.owner,null,'post',()=>true,prepared);}catch{refused=true;}
 check(refused,'uncertain/refused native post remains an explicit failed client result');
 check(browser.pendingClinicalBrowser(input.owner)?.key===prepared.key,'client retains original durable key after uncertainty');
 if(input.mode==='owner-switch'){
  check(seenOwner===input.other&&seenExpected===input.owner&&ownerRefusal,'lazy SDK sends new synthetic JWT with old owner guard and native SQL rejects before mutation');
  check(protocol.sameClinical(await state(),before),'owner-switch refusal preserves every domain/request/audit row exactly');
 }else{
  check(browser.pendingClinicalBrowser(input.owner)?.result?.state==='pending','committed response loss does not falsely clear the prepared client attempt');
  const recovered=await browser.runClinicalBrowser(client,input.owner,null,'status',()=>true);
  check(recovered.result.state==='committed'&&recovered.key===prepared.key,'same-key installed SDK status verifies the real native committed receipt');
  const durable=(await pg.query('SELECT receipt FROM clinical_step_confirmation.audit WHERE request_key=$1',[prepared.key])).rows;
  check(durable.length===1&&protocol.sameClinical(durable[0].receipt,recovered.result.receipt),'independent native durable audit equals client-verified receipt exactly');
  const actual=(await pg.query('SELECT clinical_step_confirmation.snapshot($1::uuid) result',[input.intent.stepId])).rows[0].result;
  check(protocol.sameClinical(actual,recovered.result.receipt.after),'client receipt matches independently read actual animal/header/steps/alerts');
 }
 process.stdout.write(JSON.stringify({assertions:checks.length,checks})+'\n');
}finally{await pg.end();}
