// One read-only diagnosis. No release driver, deployment or rollback operation.
import {execFileSync} from 'node:child_process';
import {cp,mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PROJECT,TARGET,DEPLOY_CONFIG,normalized,fingerprint,diagnosticInventory} from './release-faithfulness-proof.mjs';
import {reconstructCapture} from './release-application-date-cohort-capture.mjs';
import {inspectRawCapture} from './diagnose-application-consumption-classifier.mjs';
export const SOURCE=Object.freeze({sha:'48a925cca797ac470832f07f6b1c6f7addc61a4b',tree:'1bc6254f47858acc63a3329ec219df296dddf6b4',hash:'d611ff0a8864b05a0e960e21edb242219dfa07e2e64c11c8d8ada9d2cec2d4f5'});
export const RECOVERY=Object.freeze({sha:'bf6a8a30dadcafdc9e27b3b9514d1b77f8d4ad58',tree:'14b02e7c564c8a05d6d26939f008111e759c1c65',hash:'a8ad35ddfb11af95909791ad96a08e9a90bde9c61bd2efde7bffdc54d44d6a02',native:'6e0027496d63d6b8c603e5590d0e4a4cd22a30df54173351ce2f4f797956bee4'});
export const BASELINE=Object.freeze({version:288,status:'ACTIVE',verifyJwt:false,hash:'7c2583626cc7e7ecac531ef62a71e6d3581a4426be05bfd58df9b6218d978beb',updatedAt:1793554013172});
const stages=new Set(['mismatch','tooling','invocation','setup','metadata','source','first_download','first_proof','metadata_after','cleanup','complete']);
const codes=new Set(['CLI_SETUP_FAILED','TS_SETUP_FAILED','INVOCATION_REJECTED','SETUP_REJECTED','HTTP_STATUS','TRANSPORT_UNCERTAIN','BODY_LIMIT','METADATA_INVALID','BASELINE_REJECTED','SOURCE_REJECTED','PROOF_REJECTED','CLI_EXIT','CLI_TIMEOUT']);
const guards=new Map([
 ['Invalid deployment metadata','METADATA_INVALID'],['Raw download differs from exact observed source/cache layout','RAW_LAYOUT_REJECTED'],
 ['Wrong TypeScript proof version','TYPE_PROOF_REJECTED'],['Unsafe Git source','TYPE_PROOF_REJECTED'],['Unparseable Git source','TYPE_PROOF_REJECTED'],
 ['Omitted module hash changed','TYPE_PROOF_REJECTED'],['Omitted module has runtime statements','TYPE_PROOF_REJECTED'],['Omitted module emits runtime content','TYPE_PROOF_REJECTED'],
 ['Runtime reference to omitted module','TYPE_PROOF_REJECTED'],['Unexpected type-only reference inventory','TYPE_PROOF_REJECTED'],
 ['Reconstructed source differs from complete pinned Git source','PROOF_REJECTED'],['Unexpected download wrapper','WRAPPER_LAYOUT_REJECTED'],['Seeded deployment config changed','SOURCE_REJECTED'],
]);
const own=(e,k)=>{try{return Object.getOwnPropertyDescriptor(e,k)?.value;}catch{return undefined;}};
const fail=(code,extra={})=>Object.assign(new Error(),{diagnosticCode:code,...extra});
const must=(ok,code)=>{if(!ok)throw fail(code);};
export function safeFailure(stage,error){
 const code=own(error,'diagnosticCode'),status=own(error,'httpStatus'),exit=own(error,'exitCode');
 const out={stage:stages.has(stage)?stage:'unknown',event:'failed',code:codes.has(code)?code:guards.get(own(error,'message'))??'UNCLASSIFIED'};
 if(out.code==='HTTP_STATUS' && Number.isInteger(status) && status>=100 && status<=599)out.httpStatus=status;
 if(out.code==='CLI_EXIT' && Number.isInteger(exit) && exit>=0 && exit<=255)out.exitCode=exit;
 return out;
}
export async function observed(stage,operation,emit){
 const name=stages.has(stage)?stage:'unknown';emit({stage:name,event:'start'});
 try{const value=await operation();emit({stage:name,event:'ok'});return value;}
 catch(error){emit(safeFailure(name,error));throw error;}
}
export function invocation(env,args=[]){
 must(args.length===0 || (args.length===1 && args[0]==='--check-invocation'),'INVOCATION_REJECTED');
 must(env.GITHUB_REPOSITORY==='sforero94/Escociaos' && env.GITHUB_REF==='refs/heads/main' && env.GITHUB_EVENT_NAME==='workflow_dispatch' && env.GITHUB_RUN_ATTEMPT==='1' && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'') && /^[1-9]\d*$/.test(env.GITHUB_RUN_ID??'') && env.DIAGNOSE_CONFIRMATION==='DIAGNOSE_APPLICATION_CONSUMPTION_V288_CLASSIFY_ONLY','INVOCATION_REJECTED');
}
const stable=(a,b)=>['version','status','verifyJwt','hash','updatedAt'].every(k=>a[k]===b[k]);
function stamp(meta){const value=normalized(meta);must(Number.isSafeInteger(meta.updated_at) && meta.updated_at>0,'METADATA_INVALID');return {...value,updatedAt:meta.updated_at};}
export function requireProof(p){
 must(p?.fingerprint?.count===85 && p.fingerprint.hash===RECOVERY.hash && p.evidence?.native?.count===83 && p.evidence.native.hash===RECOVERY.native && p.evidence.reconstructed?.count===85 && p.evidence.reconstructed.hash===RECOVERY.hash && JSON.stringify(p.evidence.reconstructed.restoredFromGit)===JSON.stringify(['importHato/tipos.ts','telegram/types.ts']) && p.evidence.typeProof?.emitsOnlyEmptyModules===true && p.evidence.typeProof.typeScriptVersion==='5.9.3','PROOF_REJECTED');
}
export async function diagnose(ops,emit){
 let error,failed=false;
 try{
  await observed('setup',()=>ops.setup(),emit);
  const before=await observed('metadata',async()=>{const m=stamp(await ops.metadata());must(stable(m,BASELINE),'BASELINE_REJECTED');return m;},emit);
  await observed('source',()=>ops.verifySource(),emit);
  await observed('first_download',()=>ops.download(),emit);
  await observed('first_proof',async()=>requireProof(await ops.prove()),emit);
  await observed('metadata_after',async()=>must(stable(stamp(await ops.metadata()),before),'BASELINE_REJECTED'),emit);
 }catch(e){error=e;failed=true;}
 finally{
  let cleanupError,cleanupFailed=false;
  try{emit({stage:'cleanup',event:'start'});}catch(e){cleanupError=e;cleanupFailed=true;}
  try{await ops.cleanup();}catch(e){cleanupError=e;cleanupFailed=true;}
  try{emit(cleanupFailed?safeFailure('cleanup',cleanupError):{stage:'cleanup',event:'ok'});}catch(e){cleanupError=e;cleanupFailed=true;}
  if(cleanupFailed && !failed){error=cleanupError;failed=true;}
 }
 if(failed)throw error;
 emit({stage:'complete',event:'ok'});return {state:'diagnosed'};
}
export async function metadata(request,token){
 let response;
 try{response=await request(`https://api.supabase.com/v1/projects/${PROJECT}/functions/${TARGET}`,{method:'GET',headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw fail('TRANSPORT_UNCERTAIN');}
 if(!response.ok)throw fail('HTTP_STATUS',{httpStatus:response.status});
 must(Number(response.headers.get('content-length')||0)<=65536,'BODY_LIMIT');
 let length=0;const chunks=[];
 try{for await(const chunk of response.body){length+=chunk.length;must(length<=65536,'BODY_LIMIT');chunks.push(chunk);}}
 catch(e){if(own(e,'diagnosticCode')==='BODY_LIMIT')throw e;throw fail('TRANSPORT_UNCERTAIN');}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('METADATA_INVALID');}
}
export const downloadArgs=cache=>['--offline','--cache',cache,'--yes','--package','supabase@2.122.0','--','supabase','functions','download',TARGET,'--project-ref',PROJECT,'--use-api'];
export function downloadOnly(execute,cwd,env){
 try{execute('npx',downloadArgs(env.CLI_CACHE),{cwd,stdio:'ignore',timeout:180000,env:{PATH:env.PATH,HOME:env.HOME,CI:'true',SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN}});}
 catch(e){throw fail(own(e,'code')==='ETIMEDOUT'?'CLI_TIMEOUT':'CLI_EXIT',{exitCode:own(e,'status')});}
}
export async function verifyCheckouts(source,recovery,controlsSha,git,read=readFile,fp=fingerprint){
  must(git(resolve('.'),['rev-parse','HEAD'])===controlsSha && git(resolve('.'),['rev-parse',`HEAD:supabase/functions/${TARGET}`])===SOURCE.tree,'SOURCE_REJECTED');
  for(const [dir,pin]of [[source,SOURCE],[recovery,RECOVERY]]){
   must(git(dir,['rev-parse','HEAD'])===pin.sha && git(dir,['rev-parse',`HEAD:supabase/functions/${TARGET}`])===pin.tree && git(dir,['status','--porcelain','--untracked-files=all'])==='','SOURCE_REJECTED');
   must(await read(join(dir,'supabase/config.toml'),'utf8')===DEPLOY_CONFIG,'SOURCE_REJECTED');
   const f=await fp(join(dir,'supabase/functions',TARGET));must(f.count===85 && f.hash===pin.hash,'SOURCE_REJECTED');
  }
}
export async function main(env=process.env,args=process.argv.slice(2)){
 const emit=event=>console.log(JSON.stringify(event));
 await observed('invocation',async()=>invocation(env,args),emit);
 if(args[0]==='--check-invocation')return;
 let root=null,raw,ts;const source=resolve('release-source'),recovery=resolve('rollback-source');
 const git=(dir,args)=>{try{return execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','ignore'],env:{PATH:env.PATH,HOME:env.HOME}}).trim();}catch(e){throw fail('CLI_EXIT',{exitCode:own(e,'status')});}};

 await diagnose({
  setup:async()=>{
   must(typeof env.SUPABASE_ACCESS_TOKEN==='string' && env.SUPABASE_ACCESS_TOKEN.length>0 && typeof env.RUNNER_TEMP==='string' && env.CLI_CACHE===join(env.RUNNER_TEMP,'faithfulness-cli-cache') && env.PROOF_TYPESCRIPT===join(env.RUNNER_TEMP,'faithfulness-proof/node_modules/typescript/lib/typescript.js'),'SETUP_REJECTED');
   root=await mkdtemp(join(env.RUNNER_TEMP,'faithfulness-diagnose-'));raw=join(root,'first');
   ts=(await import(pathToFileURL(env.PROOF_TYPESCRIPT).href)).default;
  },
  metadata:()=>metadata(fetch,env.SUPABASE_ACCESS_TOKEN),verifySource:()=>verifyCheckouts(source,recovery,env.GITHUB_SHA,git),
  download:async()=>{await verifyCheckouts(source,recovery,env.GITHUB_SHA,git);await mkdir(join(raw,'supabase'),{recursive:true});await cp(join(recovery,'supabase/config.toml'),join(raw,'supabase/config.toml'));downloadOnly(execFileSync,raw,env);},
  prove:async()=>{
   const rawInventory=await diagnosticInventory(raw),gitInventory=await diagnosticInventory(join(recovery,'supabase/functions',TARGET));
   const config=await readFile(join(recovery,'supabase/config.toml'));
   inspectRawCapture(rawInventory,gitInventory,config,emit);
   return reconstructCapture(raw,recovery,join(root,'first-clean'),ts);
  },
  cleanup:async()=>{if(root){await rm(root,{recursive:true,force:true});root=null;}},
 },emit);
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{process.exitCode=1;});
