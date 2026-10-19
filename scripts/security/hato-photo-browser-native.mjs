// Actual browser -> actual Hono handler/pipeline -> installed SDK -> local PG.
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import {createRequire} from 'node:module';import {createClient} from '@supabase/supabase-js';
const input=JSON.parse(fs.readFileSync(0,'utf8'));if(!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(input.socket)||!input.client.startsWith('/tmp/'))throw Error('Local only');
const {Client}=createRequire(import.meta.url)(input.client),pg=new Client({host:input.socket,port:55439,user:'postgres',database:'postgres',ssl:false,connectionTimeoutMillis:5000,query_timeout:10000});
const owner=input.owner,token=id=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString('base64url')+'.c3ludGhldGlj';const headers={'Content-Type':'application/json'},bytes=new Map(),checks=[];let uploads=0,models=0,loseHttp=true,loseClaim=false,uncertainModel=false;const check=(v,l)=>{if(!v)throw Error(l);checks.push(l);};
let service;
async function transport(url,options={}){
 const u=new URL(String(url));
 if(u.origin==='https://openrouter.ai'){
  models++;if(uncertainModel)throw Error('Synthetic unknown model transport');const celdas={};for(let s=1;s<=5;s++)for(const p of ['am','pm'])celdas[`s${s}_${p}`]={texto:s===1?(p==='am'?'3':'4'):'',confianza:'alta'};
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({filas:[{nombre_impreso:'Synthetic browser milk cow',celdas}]})}}]}),{headers});
 }
 if(u.origin!=='https://photo.invalid')throw Error('Hosted network forbidden');
 const bearer=(new Headers(options.headers).get('Authorization')??'').replace(/^Bearer /,''),uid=bearer.endsWith('.c3ludGhldGlj')?JSON.parse(Buffer.from(bearer.split('.')[1],'base64url').toString()).sub:null;
 if(u.pathname==='/auth/v1/user')return new Response(JSON.stringify({id:uid??owner}),{headers});
 if(u.pathname.startsWith('/rest/v1/rpc/')){
  const name=u.pathname.split('/').pop(),a=JSON.parse(String(options.body));let query,args;
  if(name==='fn_hato_photo_upload_service'){query='SELECT fn_hato_photo_upload_service($1,$2::uuid,$3::uuid,$4::jsonb) value';args=[a.p_action,a.p_request_key,a.p_owner,a.p_payload];}
  else if(name==='fn_hato_photo_upload_inspect_service'){query='SELECT fn_hato_photo_upload_inspect_service($1::uuid,$2::uuid) value';args=[a.p_request_key,a.p_owner];}
  else if(name==='fn_hato_photo_preview_service'){query='SELECT fn_hato_photo_preview_service($1,$2::uuid,$3::uuid,$4::jsonb) value';args=[a.p_action,a.p_request_key,a.p_owner,a.p_payload];}
  else throw Error('Unexpected RPC');let value;
  try{await pg.query('BEGIN');await pg.query('SET LOCAL ROLE service_role');await pg.query("SELECT set_config('request.jwt.claim.sub','',true)");value=(await pg.query(query,args)).rows[0].value;await pg.query('COMMIT');}catch(e){console.error('Local RPC refusal:',e.message);await pg.query('ROLLBACK');return new Response(JSON.stringify({message:e.message}),{status:400,headers});}
  if(name==='fn_hato_photo_preview_service'&&a.p_action==='claim'&&loseClaim){loseClaim=false;throw Error('Lost OCR claim reply');}return new Response(JSON.stringify(value),{headers});
 }
 if(u.pathname.startsWith('/rest/v1/')){
  const table=u.pathname.split('/').pop();let rows;
  if(table==='usuarios')rows=(await pg.query('SELECT id,rol,activo FROM usuarios WHERE id=$1',[String(u.searchParams.get('id')).replace(/^eq\./,'')])).rows;
  else if(table==='hato_config')rows=(await pg.query("SELECT valor FROM hato_config WHERE clave='dia_pesaje_semanal'")).rows;
  else if(table==='hato_animales')rows=(await pg.query("SELECT id,nombre,etapa,estado FROM hato_animales WHERE estado='activa' AND etapa IN('vaca','novilla')")).rows;
  else if(table==='hato_pesajes_leche')rows=(await pg.query('SELECT id,animal_id,fecha::text,litros_am,litros_pm,litros_total FROM hato_pesajes_leche')).rows;
  else throw Error('Legacy mutation or unexpected table');if(options.method&&options.method!=='GET')throw Error('Direct mutation forbidden');return new Response(JSON.stringify(['usuarios','hato_config'].includes(table)?rows[0]??null:rows),{headers});
 }
 const prefix='/storage/v1/object/hato-pesajes-fotos/';if(!u.pathname.startsWith(prefix))throw Error('Unexpected Storage path');const target=decodeURIComponent(u.pathname.slice(prefix.length));
 if(options.method==='POST'){uploads++;if(bytes.has(target)||new Headers(options.headers).get('x-upsert')!=='false')throw Error('Overwrite forbidden');const b=new Uint8Array(await new Response(options.body).arrayBuffer());bytes.set(target,b);await pg.query("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('hato-pesajes-fotos',$1,$2::jsonb)",[target,JSON.stringify({size:b.length,mimetype:'image/png'})]);return new Response(JSON.stringify({Key:target}),{headers});}
 if(options.method==='GET'||!options.method){const b=bytes.get(target);return b?new Response(b,{headers:{'Content-Type':'image/png'}}):new Response('{}',{status:404,headers});}throw Error('Unexpected Storage mutation');
}
const cache=new Map();function load(file){file=path.resolve(file);if(!path.extname(file))file+='.ts';if(!file.startsWith(path.resolve('src/utils/hato')+path.sep)&&!file.startsWith(path.resolve('src/supabase/functions/server')+path.sep))throw Error('Unexpected import '+file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,n=>{if(n.startsWith('jsr:'))return {createClient:()=>service};if(n==='npm:hono')return {};if(!n.startsWith('.'))throw Error('Unexpected package '+n);return load(path.resolve(path.dirname(file),n));});return exports;}
try{
 await pg.connect();service=createClient('https://photo.invalid','synthetic-service',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const user=createClient('https://photo.invalid','synthetic-human',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});await user.auth.setSession({access_token:token(owner),refresh_token:'synthetic'});
 globalThis.fetch=transport;globalThis.Deno={env:{get:n=>({SUPABASE_URL:'https://photo.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',OPENROUTER_API_KEY:'synthetic-no-model-cost'})[n]}};
 const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_k,_o,fn)=>fn()}}});
 const browser=load('src/utils/hato/hatoPhotoBrowserAttempt.ts'),protocol=load('src/utils/hato/hatoPhotoPreviewProtocol.ts'),handler=load('src/supabase/functions/server/hato-pesaje-foto.ts');
 const endpoint='https://photo.invalid/functions/v1/make-server-1ccce916/hato/pesaje/foto';
 async function http(url,options){if(String(url)!==endpoint)throw Error('Wrong endpoint');const request=new Request(url,options),ctx={req:{raw:request,header:n=>request.headers.get(n)},json:(v,status=200)=>new Response(JSON.stringify(v),{status,headers})};const response=await handler.handleHatoPesajeFoto(ctx);if(!response.ok)console.error('Local HTTP refusal:',response.status,await response.clone().text());if(loseHttp&&response.ok){const copy=await response.clone().json();if(copy?.preview?.state==='ready'){loseHttp=false;throw Error('Synthetic lost retained HTTP preview reply');}}return response;}
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64')),file=new File([png],'paper.png',{type:'image/png'}),inputFiles={files:[file],year:2026,month:10};
 let failed=false;try{await browser.runBrowserPhoto(user,endpoint,owner,'upload',()=>true,inputFiles,null,http);}catch{failed=true;}check(failed&&uploads===1&&models===1,'lost actual handler preview reply retains one upload/model send');const anchor=browser.pendingBrowserPhoto(owner);check(anchor&&anchor.intent.files.length===1,'durable original owner/key/manifest survives lost HTTP result');
 const recovered=await browser.runBrowserPhoto(user,endpoint,owner,'resume',()=>true,undefined,null,http);check(recovered.key===anchor.key&&recovered.result.preview.state==='ready'&&uploads===1&&models===1,'actual browser recovery reads stored OCR without re-upload or model');
 const q=recovered.result.preview;check(q.outcome.ok&&q.outcome.resultado.diff.some(d=>d.animalId===input.animal&&d.litrosTotal===7),'actual existing pipeline captured expected animal/AM/PM preview');
 const audit=(await pg.query('SELECT receipt FROM hato_photo_preview.audit WHERE request_key=$1',[anchor.key])).rows[0].receipt,capture=(await pg.query('SELECT to_jsonb(c) value FROM hato_capturas_foto c WHERE id=$1',[anchor.key])).rows[0].value;
 check(JSON.stringify(audit)===JSON.stringify(q.receipt)&&JSON.stringify(capture)===JSON.stringify(q.capture_after),'independent native capture/audit equals strict retained preview proof');check(capture.celdas_leidas_ocr===1&&capture.filas_escritas===null&&capture.desenlace==='pendiente','OCR audit preserves unknown writes and does not post milk');
 store.clear();const independent=await browser.runBrowserPhoto(user,endpoint,owner,'resume',()=>true,undefined,null,http);check(independent.key===anchor.key&&models===1&&uploads===1,'total local storage loss recovers original outcome independently');
 check(await browser.runBrowserPhoto(user,endpoint,owner,'new',()=>true,undefined,independent,http)===null&&browser.pendingBrowserPhoto(owner)===null,'explicit terminal acknowledgment clears only matching local anchor');
 loseClaim=true;const held=await browser.runBrowserPhoto(user,endpoint,owner,'upload',()=>true,inputFiles,null,http).catch(()=>null);check(held===null&&uploads===2&&models===1,'lost one-time OCR claim reply cannot start model');const pending=await browser.runBrowserPhoto(user,endpoint,owner,'resume',()=>true,undefined,null,http);check(pending.result.preview.state==='held'&&uploads===2&&models===1,'uncertain claim recovery never allocates or executes another model request');
 failed=false;try{await browser.runBrowserPhoto(user,endpoint,owner,'new',()=>true,undefined,pending,http);}catch{failed=true;}check(failed&&models===1&&uploads===2,'held unknown preview cannot be acknowledged or replaced');

 const heldRow=pending.result.preview,oldOutcome=structuredClone(q.outcome);oldOutcome.resultado.capturaId=pending.key;
 const recordPayload={permissionId:heldRow.permission_id,outcome:oldOutcome};const fullState=async()=>JSON.stringify((await pg.query(input.stateQuery)).rows[0]);
 for(const [label,ddl] of [
  ['changed OCR source',"UPDATE public.hato_animales SET notas='changed' WHERE id='"+input.animal+"';"],
  ['revoked actor',"UPDATE public.usuarios SET activo=false WHERE id='"+owner+"';"],
  ['suppressed capture',"CREATE FUNCTION public.synthetic_preview_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER synthetic_preview_fault BEFORE UPDATE ON public.hato_capturas_foto FOR EACH ROW EXECUTE FUNCTION public.synthetic_preview_fault();"],
  ['suppressed audit',"CREATE FUNCTION public.synthetic_preview_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER synthetic_preview_fault BEFORE INSERT ON hato_photo_preview.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_preview_fault();"],
  ['late actor revocation',"CREATE FUNCTION public.synthetic_preview_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE public.usuarios SET activo=false WHERE id='"+owner+"';RETURN NEW;END$$;CREATE TRIGGER synthetic_preview_fault AFTER INSERT ON hato_photo_preview.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_preview_fault();"]
 ]){
  const before=await fullState();let refused=false;try{await pg.query('BEGIN');await pg.query(ddl);await pg.query('SET LOCAL ROLE service_role');await pg.query("SELECT set_config('request.jwt.claim.sub','',true)");await pg.query("SELECT fn_hato_photo_preview_service('record',$1::uuid,$2::uuid,$3::jsonb)",[pending.key,owner,JSON.stringify(recordPayload)]);}catch{refused=true;}finally{await pg.query('ROLLBACK');}check(refused&&await fullState()===before,label+' refuses with complete native domain/Storage/control rollback');
 }
 for(const mutate of [r=>({...r,permit:r.preview.permission_id}),r=>({...r,preview:{...r.preview,capture_after:{...r.preview.capture_after,filas_escritas:1}}}),r=>({...r,preview:{...r.preview,owner_id:input.animal}})]){let refused=false;try{const changed=mutate(recovered.result);protocol.validatePhotoPreviewResult(changed,owner,recovered.key);}catch{refused=true;}check(refused,'strict original preview receiver refuses forged proof');}
 fs.writeFileSync('/tmp/escocia-photo-browser-fixture.json',JSON.stringify(recovered.result,null,2)+'\n',{mode:0o600});
 process.stdout.write(JSON.stringify({assertions:checks.length,checks,uploads,models,fixture:recovered.result,hosted_certified:false})+'\n');
}finally{await pg.end();}
