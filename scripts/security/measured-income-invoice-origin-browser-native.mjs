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
let handlerRef;let loseMetadataPost=true;let blockUpload=false;let uploadCalls=0;let originReserves=0;let delayedRequest=null;
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
   await pg.query('BEGIN');await pg.query((name.startsWith('fn_hato_income_metadata_')||name==='fn_hato_income_invoice_origin_web')?'SET LOCAL ROLE authenticated':'SET LOCAL ROLE service_role');
   if(name==='fn_hato_income_invoice_origin_web'){await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);if(a.p_action==='reserve')originReserves++;data=(await pg.query('SELECT fn_hato_income_invoice_origin_web($1,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb,$6::uuid) v',[a.p_action,a.p_request_key,a.p_income_id,a.p_observed,a.p_file,a.p_expected_owner])).rows[0].v;}else if(name.startsWith('fn_hato_income_metadata_')){await pg.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);if(name==='fn_hato_income_metadata_classify_web')data=(await pg.query('SELECT fn_hato_income_metadata_classify_web($1::uuid,$2::uuid) v',[a.p_income_id,a.p_expected_owner])).rows[0].v;else if(name==='fn_hato_income_metadata_source_web')data=(await pg.query('SELECT fn_hato_income_metadata_source_web($1::jsonb,$2::uuid) v',[a.p_draft,a.p_expected_owner])).rows[0].v;else if(name==='fn_hato_income_metadata_recover_web')data=(await pg.query('SELECT fn_hato_income_metadata_recover_web($1::uuid) v',[a.p_expected_owner])).rows[0].v;else if(name==='fn_hato_income_metadata_web')data=(await pg.query('SELECT fn_hato_income_metadata_web($1,$2::uuid,$3::jsonb,$4::uuid) v',[a.p_action,a.p_request_key,a.p_intent,a.p_expected_owner])).rows[0].v;else throw Error('Unexpected metadata RPC');}
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
 await pg.connect();globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://invoice.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'})[name]}};if(!globalThis.crypto)globalThis.crypto=webcrypto;
 handlerRef=load('src/supabase/functions/server/invoice-upload.ts').handleInvoiceUpload;globalThis.fetch=transport;
 const storage=new Map();let breakPublication=true;globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(k.startsWith('measured_income_invoice_origin_v1:')&&JSON.parse(v).origin?.invoice.state==='committed'&&breakPublication){breakPublication=false;throw Error('Synthetic lost committed local publication');}storage.set(k,v);},removeItem:k=>storage.delete(k)};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_k,_o,fn)=>fn()}}});
 async function client(){const c=createClient('https://invoice.invalid','synthetic-human',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}),jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:actor,exp:4102444800})).toString('base64url')+'.c3ludGhldGlj';await c.auth.setSession({access_token:jwt,refresh_token:'synthetic'});return c;}
 const adapter=load('src/utils/hato/hatoIncomeInvoiceOriginBrowserAttempt.ts'),protocol=load('src/utils/hato/hatoIncomeInvoiceOriginProtocol.ts'),metadata=load('src/utils/hato/hatoIncomeMetadataBrowserAttempt.ts'),{png}=load('src/__tests__/invoiceUploadFixtures.ts');
 const file=new File([png],'origin.png',{type:'image/png'});let c=await client(),refused=false;
 try{await adapter.runOriginInvoice(c,actor,input.income,'upload',file,()=>true);}catch{refused=true;}
 const local=adapter.pendingOriginInvoice(actor,input.income);
 check(refused&&local?.held&&originReserves===1&&uploads===1&&uploadCalls===1,'actual caller persists original reservation/send fence before bytes and retains unknown local publication');
 storage.clear();const recovered=await adapter.runOriginInvoice(c,actor,input.income,'status',null,()=>true);
 check(recovered.receipt&&recovered.targetKey===local.targetKey&&recovered.requestKey===local.requestKey&&uploads===1&&originReserves===1&&uploadCalls===1,'total browser loss before metadata recovers exact committed server owner/income original without File/resend/replacement');
 const original=await protocol.recoverInvoiceOrigin(c,actor,input.income);
 check(original.original.identity.sha256===Buffer.from(await crypto.subtle.digest('SHA-256',png)).toString('hex')&&original.original.identity.size===png.length,'server reservation and committed actual handler proof match uploaded actual bytes');
 const sf=ts.createSourceFile('form.tsx',fs.readFileSync('src/components/finanzas/components/IngresoForm.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='guardarIngreso')callback=n.initializer.getText(sf);ts.forEachChild(n,visit);};visit(sf);if(!callback)throw Error('Missing actual finance callback');
 let reviewed=null;const errors=[],before=(await pg.query('SELECT to_jsonb(i) value FROM fin_ingresos i WHERE id=$1',[input.income])).rows[0].value;
 const actual=new Function('getSupabase','ingreso','formData','mostrarCantidad','precioComputado','setSaving','clearFormData','onSuccess','toast','metadataRoute','metadata','selectedInvoice','invoiceHeld',ts.transpileModule('const f='+callback,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText+';return f;')(()=>c,{id:input.income},{valor:999999,cantidad:777,observaciones:'Origin review',url_factura:recovered.receipt.path},true,999,()=>{},()=>{},()=>{},{error:e=>errors.push(e)},{classifyNow:async()=>true},{prepare:async d=>{reviewed=await metadata.runMetadataBrowser(c,actor,d,'prepare',()=>true);}},recovered.receipt,false);
 await actual();check(errors.length===0&&reviewed.result.state==='pending'&&reviewed.intent.attachment.path===recovered.receipt.path,'actual IngresoForm prepares captured verified original for separate metadata confirmation');
 refused=false;try{await metadata.runMetadataBrowser(c,actor,null,'post',()=>true,reviewed);}catch{refused=true;}check(refused,'lost metadata post reply remains original unknown without another upload');
 storage.clear();reviewed=await metadata.runMetadataBrowser(c,actor,null,'status',()=>true);
 const after=(await pg.query('SELECT to_jsonb(i) value FROM fin_ingresos i WHERE id=$1',[input.income])).rows[0].value;
 check(reviewed.result.state==='committed'&&after.url_factura===recovered.receipt.path&&after.valor===before.valor&&after.cantidad===before.cantidad&&after.updated_by===actor&&uploads===1,'independent original metadata recovery commits exact invoice while retaining financial fields/current actor');
 await metadata.runMetadataBrowser(c,actor,null,'new',()=>true,reviewed);
 for(const change of [x=>{x.owner=randomUUID();},x=>{x.incomeId=randomUUID();},x=>{x.original.identity={...x.original.identity,requestKey:randomUUID()};},x=>{x.original.file={...x.original.file,size:0};},x=>{x.invoice={...x.invoice,path:'legacy.png'};}]){const x=structuredClone(original);change(x);let denied=false;try{protocol.originResult(x,actor,input.income);}catch{denied=true;}check(denied,'strict original proof refuses altered owner/income/identity/claims/path');}
 actor=input.other;storage.clear();c=await client();blockUpload=true;
 refused=false;try{await adapter.runOriginInvoice(c,actor,input.income,'upload',file,()=>true);}catch{refused=true;}const pending=adapter.pendingOriginInvoice(actor,input.income);check(refused&&pending?.held&&uploads===1&&uploadCalls===2&&originReserves===2,'unknown byte dispatch retains separate owner original without assuming absence or resending');
 const heldStorage=[...storage];storage.clear();blockUpload=false;const held=await adapter.runOriginInvoice(c,actor,input.income,'upload',new File(['changed'],'changed.png',{type:'image/png'}),()=>true);
 check(held?.held&&held.targetKey===pending.targetKey&&held.requestKey===pending.requestKey&&uploads===1&&uploadCalls===2&&originReserves===2,'storage loss and changed file selection query pending original only; no replacement UUID/target/permission or resend');
 const completed=await handlerRef({req:{raw:delayedRequest,header:n=>delayedRequest.headers.get(n)},json:(v,status=200)=>new Response(JSON.stringify(v),{status,headers})},'upload');check(completed.status===200&&uploads===2&&uploadCalls===2,'original delayed accepted dispatch completes once without another browser transport');
 storage.clear();for(const [k,v]of heldStorage)storage.set(k,v);const settled=await adapter.runOriginInvoice(c,actor,input.income,'status',null,()=>true);
 check(settled.receipt&&!settled.held&&load('src/utils/invoiceUpload.ts').pendingInvoice(actor,load('src/utils/hato/hatoIncomeInvoiceAttempt.ts').incomeInvoiceScope(input.income))===null&&uploads===2&&uploadCalls===2,'status-only committed receipt recovery clears matching shared pending envelope without resend');
 process.stdout.write(JSON.stringify({assertions:checks.length,checks})+'\n');
}finally{await pg.end();}
