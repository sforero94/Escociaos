// Actual invoice handler + installed SDK on contained synthetic PostgreSQL only.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {randomUUID, webcrypto} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
if(!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(input.socket)||!input.client.startsWith('/tmp/'))throw Error('Contained socket required');
const {Client}=createRequire(import.meta.url)(input.client),pg=new Client({host:input.socket,port:55439,user:'postgres',database:'postgres',password:'',ssl:false,connectionTimeoutMillis:5000,query_timeout:10000});
let loseRelease=false;let releaseCalls=0;let handlerRef;let loseMetadataPost=true;let blockUpload=false;let uploadCalls=0;let originReserves=0;let delayedRequest=null;
const checks=[],objects=new Map(),headers={'Content-Type':'application/json'};let uploads=0,loseFinal=false,actor=input.owner;
const check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
async function serviceQuery(sql,args){await pg.query('BEGIN');try{await pg.query('SET LOCAL ROLE service_role');const result=await pg.query(sql,args);await pg.query('COMMIT');return result;}catch(e){await pg.query('ROLLBACK');throw e;}}
async function transport(url,options={}){
 const u=new URL(String(url));if(u.origin!=='https://invoice.invalid')throw Error('Hosted request forbidden');
 if(u.pathname.startsWith('/functions/v1/make-server-1ccce916/facturas/upload')){const action=u.pathname.endsWith('/status')?'status':u.pathname.endsWith('/target')?'target':'upload';if(action==='upload'){uploadCalls++;if(blockUpload){delayedRequest=new Request(u,options);return new Response(JSON.stringify({error:'Synthetic unknown dispatch'}),{status:500,headers});}}const req=new Request(u,options);return handlerRef({req:{raw:req,header:n=>req.headers.get(n)},json:(v,status=200)=>new Response(JSON.stringify(v),{status,headers})},action);}
 if(u.pathname==='/auth/v1/user')return new Response(JSON.stringify({id:actor}),{headers});
 if(u.pathname==='/rest/v1/usuarios'){
  const id=u.searchParams.get('id')?.replace(/^eq\./,'');if(!/^[0-9a-f-]{36}$/.test(id??''))throw Error('Unexpected profile request');
  return new Response(JSON.stringify((await serviceQuery('SELECT id,rol,activo FROM usuarios WHERE id=$1',[id])).rows),{headers});
 }
 if(u.pathname.startsWith('/rest/v1/rpc/')){
  const name=u.pathname.split('/').pop(),a=JSON.parse(String(options.body));let data;
  try{
   await pg.query('BEGIN');await pg.query((name.startsWith('fn_hato_income_metadata_')||name==='fn_hato_income_invoice_origin_web'||name==='fn_hato_income_invoice_release_web')?'SET LOCAL ROLE authenticated':'SET LOCAL ROLE service_role');
   if(name==='fn_hato_income_invoice_release_web'){await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);if(a.p_action==='release')releaseCalls++;data=(await pg.query('SELECT fn_hato_income_invoice_release_web($1,$2::uuid,$3::uuid,$4::jsonb,$5::uuid) v',[a.p_action,a.p_origin_key,a.p_income_id,a.p_preview,a.p_expected_owner])).rows[0].v;}else if(name==='fn_hato_income_invoice_origin_web'){await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);if(a.p_action==='reserve')originReserves++;data=(await pg.query('SELECT fn_hato_income_invoice_origin_web($1,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb,$6::uuid) v',[a.p_action,a.p_request_key,a.p_income_id,a.p_observed,a.p_file,a.p_expected_owner])).rows[0].v;}else if(name.startsWith('fn_hato_income_metadata_')){await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);if(name==='fn_hato_income_metadata_classify_web')data=(await pg.query('SELECT fn_hato_income_metadata_classify_web($1::uuid,$2::uuid) v',[a.p_income_id,a.p_expected_owner])).rows[0].v;else if(name==='fn_hato_income_metadata_source_web')data=(await pg.query('SELECT fn_hato_income_metadata_source_web($1::jsonb,$2::uuid) v',[a.p_draft,a.p_expected_owner])).rows[0].v;else if(name==='fn_hato_income_metadata_recover_web')data=(await pg.query('SELECT fn_hato_income_metadata_recover_web($1::uuid) v',[a.p_expected_owner])).rows[0].v;else if(name==='fn_hato_income_metadata_web')data=(await pg.query('SELECT fn_hato_income_metadata_web($1,$2::uuid,$3::jsonb,$4::uuid) v',[a.p_action,a.p_request_key,a.p_intent,a.p_expected_owner])).rows[0].v;else throw Error('Unexpected metadata RPC');}
   else if(name==='fn_invoice_upload_target')data=(await pg.query('SELECT fn_invoice_upload_target($1::uuid,$2::uuid,$3) v',[a.p_actor,a.p_target_key,a.p_action])).rows[0].v;
   else if(name==='fn_invoice_upload_step')data=(await pg.query('SELECT fn_invoice_upload_step($1::uuid,$2,$3::jsonb,$4) v',[a.p_actor,a.p_action,a.p_identity,a.p_observed_sha])).rows[0].v;
   else throw Error('Unexpected RPC');
   await pg.query('COMMIT');
   if(name==='fn_hato_income_invoice_release_web'&&a.p_action==='release'&&loseRelease){loseRelease=false;throw Error('Synthetic lost terminal reply');}
   if(name==='fn_hato_income_metadata_web'&&a.p_action==='post'&&loseMetadataPost){loseMetadataPost=false;throw Error('Synthetic lost metadata commit reply');}
   if(loseFinal&&a.p_action==='finalize'){loseFinal=false;throw Error('Synthetic lost committed finalization reply');}
   return new Response(JSON.stringify(data),{headers});
  }catch(e){await pg.query('ROLLBACK');return new Response(JSON.stringify({message:e.message,code:e.code??'P0001'}),{status:400,headers});}
 }
 const prefix=['/storage/v1/object/facturas/','/storage/v1/object/authenticated/facturas/'].find(v=>u.pathname.startsWith(v));
 if(prefix){
  const key=decodeURIComponent(u.pathname.slice(prefix.length));
  if(options.method==='POST'){
   check(new Headers(options.headers).get('x-upsert')==='false','actual SDK uses immutable object creation');
   if(objects.has(key))return new Response(JSON.stringify({statusCode:'409',error:'Duplicate',message:'exists'}),{status:409,headers});
   const bytes=new Uint8Array(await new Response(options.body).arrayBuffer());objects.set(key,bytes);uploads++;
   const row=(await serviceQuery("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('facturas',$1,$2) RETURNING id",[key,{size:bytes.length,mimetype:'image/png'}])).rows[0];
   return new Response(JSON.stringify({Key:'facturas/'+key,Id:row.id}),{headers});
  }
  if(!options.method||options.method==='GET')return objects.has(key)?new Response(objects.get(key),{headers:{'Content-Type':'image/png'}}):new Response('{}',{status:404,headers});
 }
 throw Error('Unexpected synthetic request '+u.pathname);
}
const cache=new Map();function load(file){file=path.resolve(file);if(!file.endsWith('.ts'))file+='.ts';if(file.endsWith('/utils/supabase/config.ts'))return {getSupabaseConfig:()=>({url:'https://invoice.invalid'})};if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('exports','require',source)(exports,name=>{
 if(name==='npm:@supabase/supabase-js@2.39.3')return {createClient:(url,key,options)=>createClient(url,key,{...options,global:{fetch:transport}})};
 if(!name.startsWith('.'))throw Error('Unexpected module');return load(path.resolve(path.dirname(file),name));
});return exports;}
try{
 await pg.connect();globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://invoice.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'})[name]}};if(!globalThis.crypto)globalThis.crypto=webcrypto;
 handlerRef=load('src/supabase/functions/server/invoice-upload.ts').handleInvoiceUpload;globalThis.fetch=transport;
 const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_k,_o,fn)=>fn()}}});
 async function client(){const c=createClient('https://invoice.invalid','synthetic-human',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}),jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:actor,exp:4102444800})).toString('base64url')+'.c3ludGhldGlj';await c.auth.setSession({access_token:jwt,refresh_token:'synthetic'});return c;}
 const origin=load('src/utils/hato/hatoIncomeInvoiceOriginBrowserAttempt.ts'),op=load('src/utils/hato/hatoIncomeInvoiceOriginProtocol.ts'),adapter=load('src/utils/hato/hatoIncomeInvoiceReleaseBrowserAttempt.ts'),protocol=load('src/utils/hato/hatoIncomeInvoiceReleaseProtocol.ts'),{png}=load('src/__tests__/invoiceUploadFixtures.ts');
 let c=await client();const file=new File([png],'terminal.png',{type:'image/png'}),uploaded=await origin.runOriginInvoice(c,actor,input.income,'upload',file,()=>true);
 check(uploaded.receipt&&uploads===1&&uploadCalls===1,'actual upload commits original bytes once before terminal review');
 const preview=await adapter.runInvoiceRelease(c,actor,input.income,'preview',()=>true);
 check(preview.disposition==='committed_settled'&&preview.executions.every(e=>e.settled)&&preview.object?.name===uploaded.receipt.path,'installed SDK strict preview captures exact settled permissions and retained object');
 const domain=(await pg.query('SELECT hato_birth_undo.capture_domain() v')).rows[0].v,object=(await pg.query('SELECT to_jsonb(x) v FROM storage.objects x WHERE bucket_id=\'facturas\' AND name=$1',[uploaded.receipt.path])).rows[0].v;
 loseRelease=true;let denied=false;try{await adapter.runInvoiceRelease(c,actor,input.income,'release',()=>true,preview);}catch{denied=true;}
 check(denied&&adapter.pendingInvoiceRelease(actor,input.income)?.receipt===null&&releaseCalls===1,'lost terminal reply leaves durable original preview without clearing local evidence');
 denied=false;try{await origin.runOriginInvoice(c,actor,input.income,'upload',file,()=>true);}catch{denied=true;}
 check(denied&&uploads===1&&originReserves===1,'unacknowledged original terminal action prevents automatic replacement or byte resend');
 storage.clear();const recovered=await adapter.runInvoiceRelease(c,actor,input.income,'recover',()=>true);
 check(recovered.receipt&&recovered.preview.originKey===uploaded.requestKey&&releaseCalls===1,'independent owner-income installed SDK recovery restores original terminal receipt after all browser loss');
 check(JSON.stringify((await pg.query('SELECT hato_birth_undo.capture_domain() v')).rows[0].v)===JSON.stringify(domain)&&JSON.stringify((await pg.query('SELECT to_jsonb(x) v FROM storage.objects x WHERE bucket_id=\'facturas\' AND name=$1',[uploaded.receipt.path])).rows[0].v)===JSON.stringify(object),'terminal review/release/recovery retain exact domain and raw Storage history');
 for(const change of [x=>{x.actor.profileId=randomUUID();},x=>{x.afterTarget.active=true;},x=>{x.beforeDomainSha256='bad';},x=>{x.preview.executions[0].settled=false;},x=>{x.preview.origin.identity.requestKey=randomUUID();},x=>{x.extra=true;}]){const x=structuredClone(recovered.receipt);change(x);let refused=false;try{protocol.releaseReceipt(x,actor,input.income,preview);}catch{refused=true;}check(refused,'strict installed-SDK receipt refuses contradictory actor/fence/hash/permission/identity/shape');}
 await adapter.runInvoiceRelease(c,actor,input.income,'acknowledge',()=>true,recovered.preview);
 check(adapter.pendingInvoiceRelease(actor,input.income)===null&&!origin.pendingOriginInvoice(actor,input.income)&&uploads===1&&releaseCalls===1,'explicit acknowledgment clears only trusted matching browser evidence and never sends bytes');
 const replacement=await origin.runOriginInvoice(c,actor,input.income,'upload',file,()=>true);const before=[...storage];
 const historic=await adapter.runInvoiceRelease(c,actor,input.income,'recover',()=>true);await adapter.runInvoiceRelease(c,actor,input.income,'acknowledge',()=>true,historic.preview);
 check(replacement.requestKey!==uploaded.requestKey&&JSON.stringify([...storage])===JSON.stringify(before)&&uploads===2&&originReserves===2,'historical release recovery preserves a later explicit original and its completed envelope exactly');
 actor=input.other;storage.clear();c=await client();const source=await op.invoiceOriginSource(c,actor,input.income),claims=await load('src/utils/invoiceUpload.ts').validateInvoiceSelection(file),reserved=await op.reserveInvoiceOrigin(c,actor,input.income,randomUUID(),source,claims);
 const unused=await adapter.runInvoiceRelease(c,actor,input.income,'preview',()=>true);check(unused.disposition==='unused_fenced'&&unused.executions.length===0,'unused original preview proves no ever-issued permissions before release');
 await adapter.runInvoiceRelease(c,actor,input.income,'release',()=>true,unused);await adapter.runInvoiceRelease(c,actor,input.income,'acknowledge',()=>true,unused);
 const next=await op.reserveInvoiceOrigin(c,actor,input.income,randomUUID(),source,claims);
 await serviceQuery('SELECT fn_invoice_upload_step($1::uuid,$2,$3::jsonb,$4)',[actor,'write-claim',next.original.identity,randomUUID()]);
 const held=await adapter.runInvoiceRelease(c,actor,input.income,'preview',()=>true);check(held.disposition==='held'&&held.executions.some(e=>!e.settled),'actual strict protocol keeps unknown issued permission held despite absent bytes');
 const calls=releaseCalls;denied=false;try{await adapter.runInvoiceRelease(c,actor,input.income,'release',()=>true,held);}catch{denied=true;}check(denied&&releaseCalls===calls&&adapter.pendingInvoiceRelease(actor,input.income)===null,'held preview cannot dispatch release or allocate a terminal replacement');
 process.stdout.write(JSON.stringify({assertions:checks.length,checks})+'\n');
}finally{await pg.end();}
