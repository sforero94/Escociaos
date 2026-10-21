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
let handlerRef;let loseMetadataPost=true;
const checks=[],objects=new Map(),headers={'Content-Type':'application/json'};let uploads=0,loseFinal=false,actor=input.owner;
const check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
async function serviceQuery(sql,args){await pg.query('BEGIN');try{await pg.query('SET LOCAL ROLE service_role');const result=await pg.query(sql,args);await pg.query('COMMIT');return result;}catch(e){await pg.query('ROLLBACK');throw e;}}
async function transport(url,options={}){
 const u=new URL(String(url));if(u.origin!=='https://invoice.invalid')throw Error('Hosted request forbidden');
 if(u.pathname.startsWith('/functions/v1/make-server-1ccce916/facturas/upload')){const action=u.pathname.endsWith('/status')?'status':u.pathname.endsWith('/target')?'target':'upload';const req=new Request(u,options);return handlerRef({req:{raw:req,header:n=>req.headers.get(n)},json:(v,status=200)=>new Response(JSON.stringify(v),{status,headers})},action);}
 if(u.pathname==='/auth/v1/user')return new Response(JSON.stringify({id:actor}),{headers});
 if(u.pathname==='/rest/v1/usuarios'){
  const id=u.searchParams.get('id')?.replace(/^eq\./,'');if(!/^[0-9a-f-]{36}$/.test(id??''))throw Error('Unexpected profile request');
  return new Response(JSON.stringify((await serviceQuery('SELECT id,rol,activo FROM usuarios WHERE id=$1',[id])).rows),{headers});
 }
 if(u.pathname.startsWith('/rest/v1/rpc/')){
  const name=u.pathname.split('/').pop(),a=JSON.parse(String(options.body));let data;
  try{
   await pg.query('BEGIN');await pg.query(name.startsWith('fn_hato_income_metadata_')?'SET LOCAL ROLE authenticated':'SET LOCAL ROLE service_role');
   if(name.startsWith('fn_hato_income_metadata_')){await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);if(name==='fn_hato_income_metadata_classify_web')data=(await pg.query('SELECT fn_hato_income_metadata_classify_web($1::uuid,$2::uuid) v',[a.p_income_id,a.p_expected_owner])).rows[0].v;else if(name==='fn_hato_income_metadata_source_web')data=(await pg.query('SELECT fn_hato_income_metadata_source_web($1::jsonb,$2::uuid) v',[a.p_draft,a.p_expected_owner])).rows[0].v;else if(name==='fn_hato_income_metadata_recover_web')data=(await pg.query('SELECT fn_hato_income_metadata_recover_web($1::uuid) v',[a.p_expected_owner])).rows[0].v;else if(name==='fn_hato_income_metadata_web')data=(await pg.query('SELECT fn_hato_income_metadata_web($1,$2::uuid,$3::jsonb,$4::uuid) v',[a.p_action,a.p_request_key,a.p_intent,a.p_expected_owner])).rows[0].v;else throw Error('Unexpected metadata RPC');}
   else if(name==='fn_invoice_upload_target')data=(await pg.query('SELECT fn_invoice_upload_target($1::uuid,$2::uuid,$3) v',[a.p_actor,a.p_target_key,a.p_action])).rows[0].v;
   else if(name==='fn_invoice_upload_step')data=(await pg.query('SELECT fn_invoice_upload_step($1::uuid,$2,$3::jsonb,$4) v',[a.p_actor,a.p_action,a.p_identity,a.p_observed_sha])).rows[0].v;
   else throw Error('Unexpected RPC');
   await pg.query('COMMIT');
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
 await pg.connect();globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://invoice.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'})[name]}};
 if(!globalThis.crypto)globalThis.crypto=webcrypto;
 const {handleInvoiceUpload}=load('src/supabase/functions/server/invoice-upload.ts'),{png}=load('src/__tests__/invoiceUploadFixtures.ts');
 handlerRef=handleInvoiceUpload;globalThis.fetch=transport;
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
 const fixture=await measured();process.stdout.write(JSON.stringify({assertions:checks.length,checks,fixture})+'\n');
}finally{await pg.end();}

async function measured(){
 const client=createClient('https://invoice.invalid','synthetic-human',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:actor,exp:4102444800})).toString('base64url')+'.c3ludGhldGlj';await client.auth.setSession({access_token:jwt,refresh_token:'synthetic'});
 const storage=new Map();let breakPublication=true;globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(k.startsWith('measured_income_invoice_v1:')&&JSON.parse(v).receipt&&breakPublication){breakPublication=false;throw Error('Synthetic lost local receipt publication');}storage.set(k,v);},removeItem:k=>storage.delete(k)};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_k,_o,fn)=>fn()}}});
 const adapter=load('src/utils/hato/hatoIncomeInvoiceAttempt.ts'),protocol=load('src/utils/hato/hatoIncomeMetadataProtocol.ts'),browser=load('src/utils/hato/hatoIncomeMetadataBrowserAttempt.ts'),{png}=load('src/__tests__/invoiceUploadFixtures.ts');
 const file=new File([png],'synthetic-measured.png',{type:'image/png'}),beforeUploads=uploads;let refused=false;
 try{await adapter.runIncomeInvoice(client,actor,input.income,'upload',file,()=>true);}catch{refused=true;}
 const anchor=adapter.pendingIncomeInvoice(actor,input.income);check(refused&&anchor.receipt===null&&uploads===beforeUploads+1,'durable original survives crash after common completed receipt and before measured publication');
 // Admission only: erase browser state before any metadata prepare. Never infer the unassociated upload from income alone.
 const savedStorage=[...storage],beforeGap=(await pg.query("SELECT jsonb_build_object('targets',(SELECT jsonb_agg(to_jsonb(t) ORDER BY target_key) FROM invoice_upload.targets t WHERE owner=$1),'requests',(SELECT jsonb_agg(to_jsonb(r) ORDER BY request_key) FROM invoice_upload.requests r WHERE owner=$1),'executions',(SELECT jsonb_agg(to_jsonb(e) ORDER BY request_key,execution_id) FROM invoice_upload.executions e WHERE owner=$1),'objects',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o WHERE bucket_id='facturas')) value",[actor])).rows[0].value;
 storage.clear();const missing=await adapter.runIncomeInvoice(client,actor,input.income,'status',null,()=>true);
 check(missing===null&&adapter.pendingIncomeInvoice(actor,input.income)===null&&uploads===beforeUploads+1,'admission: total browser loss before metadata cannot rediscover income-unbound original; status never allocates or resends');
 const afterGap=(await pg.query("SELECT jsonb_build_object('targets',(SELECT jsonb_agg(to_jsonb(t) ORDER BY target_key) FROM invoice_upload.targets t WHERE owner=$1),'requests',(SELECT jsonb_agg(to_jsonb(r) ORDER BY request_key) FROM invoice_upload.requests r WHERE owner=$1),'executions',(SELECT jsonb_agg(to_jsonb(e) ORDER BY request_key,execution_id) FROM invoice_upload.executions e WHERE owner=$1),'objects',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o WHERE bucket_id='facturas')) value",[actor])).rows[0].value;
 check(JSON.stringify(beforeGap)===JSON.stringify(afterGap),'unassociated original target/receipt/executions/Storage retained exactly; missing client state never proves absence or settlement');
 for(const [k,v]of savedStorage)storage.set(k,v);
 const recovered=await adapter.runIncomeInvoice(client,actor,input.income,'status',null,()=>true);check(recovered.targetKey===anchor.targetKey&&recovered.receipt&&uploads===beforeUploads+1,'actual measured adapter recovers same completed original without File or resend');
 const sf=ts.createSourceFile('form.tsx',fs.readFileSync('src/components/finanzas/components/IngresoForm.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='guardarIngreso')callback=n.initializer.getText(sf);ts.forEachChild(n,visit);};visit(sf);if(!callback)throw Error('Missing actual finance callback');
 let reviewed=null,errors=[];
 const actual=new Function('getSupabase','ingreso','formData','mostrarCantidad','precioComputado','setSaving','clearFormData','onSuccess','toast','metadataRoute','metadata','selectedInvoice','invoiceHeld',ts.transpileModule('const f='+callback,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText+';return f;')(()=>client,{id:input.income},{valor:999999,cantidad:777,observaciones:'Reviewed measured invoice',url_factura:recovered.receipt.path},true,999,()=>{},()=>{},()=>{},{error:e=>errors.push(e)},{classifyNow:()=>protocol.metadataClassify(client,actor,input.income)},{prepare:async d=>{reviewed=await browser.runMetadataBrowser(client,actor,d,'prepare',()=>true);}},recovered.receipt,false);
 await actual();check(errors.length===0&&reviewed.result.state==='pending'&&reviewed.intent.attachment.path===recovered.receipt.path&&reviewed.intent.observedAttachment.storageFingerprint,'actual IngresoForm captures verified receipt/object identity and explicit pending preview');
 const before=(await pg.query('SELECT to_jsonb(i) value FROM fin_ingresos i WHERE id=$1',[input.income])).rows[0].value;
 refused=false;try{await browser.runMetadataBrowser(client,actor,null,'post',()=>true,reviewed);}catch{refused=true;}check(refused,'lost actual metadata post retains unknown original instead of reporting success');
 storage.clear();reviewed=await browser.runMetadataBrowser(client,actor,null,'status',()=>true);check(reviewed.result.state==='committed'&&reviewed.intent.attachment.path===recovered.receipt.path&&uploads===beforeUploads+1,'independent metadata recovery restores complete attachment proof after all local storage loss');
 const after=(await pg.query('SELECT to_jsonb(i) value FROM fin_ingresos i WHERE id=$1',[input.income])).rows[0].value;
 check(after.url_factura===recovered.receipt.path&&after.valor===before.valor&&after.cantidad===before.cantidad&&after.updated_by===actor,'trusted metadata commit preserves exact original money/liters and binds current actor');
 for(const change of [x=>{x.intent.attachment.identity.sha256='0'.repeat(64);},x=>{x.intent.observedAttachment.storageFingerprint='0'.repeat(64);},x=>{x.intent.attachment.actor=randomUUID();},x=>{x.intent.attachment.identity.targetKey=randomUUID();}]){const x=structuredClone(reviewed.result);change(x);let denied=false;try{protocol.metadataResult(x,actor,reviewed.key);}catch{denied=true;}check(denied,'strict captured receipt proof rejects altered identity/owner/capture');}
 const fixture=reviewed.result;await browser.runMetadataBrowser(client,actor,null,'new',()=>true,reviewed);return fixture;
}
