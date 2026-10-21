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
const checks=[],objects=new Map(),headers={'Content-Type':'application/json'};let uploads=0,loseFinal=false,actor=input.owner;
const check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
async function serviceQuery(sql,args){await pg.query('BEGIN');try{await pg.query('SET LOCAL ROLE service_role');const result=await pg.query(sql,args);await pg.query('COMMIT');return result;}catch(e){await pg.query('ROLLBACK');throw e;}}
async function transport(url,options={}){
 const u=new URL(String(url));if(u.origin!=='https://invoice.invalid')throw Error('Hosted request forbidden');
 if(u.pathname==='/auth/v1/user')return new Response(JSON.stringify({id:actor}),{headers});
 if(u.pathname==='/rest/v1/usuarios'){
  const id=u.searchParams.get('id')?.replace(/^eq\./,'');if(!/^[0-9a-f-]{36}$/.test(id??''))throw Error('Unexpected profile request');
  return new Response(JSON.stringify((await serviceQuery('SELECT id,rol,activo FROM usuarios WHERE id=$1',[id])).rows),{headers});
 }
 if(u.pathname.startsWith('/rest/v1/rpc/')){
  const name=u.pathname.split('/').pop(),a=JSON.parse(String(options.body));let data;
  try{
   await pg.query('BEGIN');await pg.query('SET LOCAL ROLE service_role');
   if(name==='fn_invoice_upload_target')data=(await pg.query('SELECT fn_invoice_upload_target($1::uuid,$2::uuid,$3) v',[a.p_actor,a.p_target_key,a.p_action])).rows[0].v;
   else if(name==='fn_invoice_upload_step')data=(await pg.query('SELECT fn_invoice_upload_step($1::uuid,$2,$3::jsonb,$4) v',[a.p_actor,a.p_action,a.p_identity,a.p_observed_sha])).rows[0].v;
   else throw Error('Unexpected RPC');
   await pg.query('COMMIT');
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
const cache=new Map();function load(file){file=path.resolve(file);if(!file.endsWith('.ts'))file+='.ts';if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('exports','require',source)(exports,name=>{
 if(name==='npm:@supabase/supabase-js@2.39.3')return {createClient:(url,key,options)=>createClient(url,key,{...options,global:{fetch:transport}})};
 if(!name.startsWith('.'))throw Error('Unexpected module');return load(path.resolve(path.dirname(file),name));
});return exports;}
try{
 await pg.connect();globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://invoice.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'})[name]}};
 if(!globalThis.crypto)globalThis.crypto=webcrypto;
 const {handleInvoiceUpload}=load('src/supabase/functions/server/invoice-upload.ts'),{png}=load('src/__tests__/invoiceUploadFixtures.ts');
 const sdk=createClient('https://invoice.invalid','synthetic-service',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 async function invoke(action,body,multipart=false){const h={'Authorization':'Bearer synthetic-human'};if(!multipart)h['Content-Type']='application/json';const req=new Request('https://invoice.invalid/local',{method:'POST',headers:h,body:multipart?body:JSON.stringify(body)});return handleInvoiceUpload({req:{raw:req,header:name=>req.headers.get(name)},json:(v,status=200)=>new Response(JSON.stringify(v),{status,headers})},action);}
 const targetKey=randomUUID(),target=await (await invoke('target',{targetKey,action:'activate'})).json();check(target.actor===actor&&target.active===true,'actual handler prepares owner-bound current target through native RPC');
 const requestKey=randomUUID();function form(){const f=new FormData();for(const [k,v]of Object.entries({requestKey,protocolVersion:'1',targetKey,generation:target.generation,tipo:'venta'}))f.set(k,v);f.set('file',new Blob([png],{type:'image/png'}),'synthetic.png');return f;}
 const invalid=form();invalid.set('file',new Blob(['<svg/>'],{type:'image/png'}),'synthetic.png');const bad=await invoke('upload',invalid,true);check(bad.status===400&&uploads===0,'actual byte validator refuses spoof before reservation/Storage I/O');
 loseFinal=true;const lost=await invoke('upload',form(),true);check(lost.status===500&&uploads===1,'lost committed finalization returns unknown to caller without another object');
 const original=(await pg.query('SELECT identity,path,state FROM invoice_upload.requests WHERE owner=$1 AND request_key=$2',[actor,requestKey])).rows[0];
 const status=await (await invoke('status',original.identity)).json();check(status.state==='committed'&&status.path===original.path&&uploads===1,'original status independently recovers committed exact byte receipt without resend');
 const repeated=await (await invoke('upload',form(),true)).json();check(repeated.receiptId===status.receiptId&&uploads===1,'same original upload replay never allocates another object or receipt');
 const hash=Buffer.from(await crypto.subtle.digest('SHA-256',png)).toString('hex');check(status.identity.sha256===hash&&status.identity.size===png.length,'trusted receipt digest and length equal actual uploaded synthetic bytes');
 check((await sdk.rpc('fn_invoice_upload_step',{p_actor:actor,p_action:'status',p_identity:{...original.identity,sha256:'0'.repeat(64)},p_observed_sha:null})).error!==null,'changed original digest refuses through installed SDK');
 await pg.query('UPDATE usuarios SET activo=false WHERE id=$1',[actor]);check((await invoke('status',original.identity)).status===403,'actual handler refuses revoked current human even with original key');await pg.query('UPDATE usuarios SET activo=true WHERE id=$1',[actor]);
 process.stdout.write(JSON.stringify({assertions:checks.length,checks,committed:status})+'\n');
}finally{await pg.end();}
