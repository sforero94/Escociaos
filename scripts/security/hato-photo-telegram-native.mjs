// Actual browser -> actual Hono handler/pipeline -> installed SDK -> local PG.
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import {createRequire} from 'node:module';import {createClient} from '@supabase/supabase-js';
const input=JSON.parse(fs.readFileSync(0,'utf8'));if(!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(input.socket)||!input.client.startsWith('/tmp/'))throw Error('Local only');
const {Client}=createRequire(import.meta.url)(input.client),pg=new Client({host:input.socket,port:55439,user:'postgres',database:'postgres',ssl:false,connectionTimeoutMillis:5000,query_timeout:10000});
const owner=input.owner,token=id=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString('base64url')+'.c3ludGhldGlj';const headers={'Content-Type':'application/json'},bytes=new Map(),checks=[];let uploads=0,models=0,loseHttp=false,loseClaim=false,uncertainModel=false,loseRecord=true;const check=(v,l)=>{if(!v)throw Error(l);checks.push(l);};
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
  if(name==='fn_hato_photo_telegram'){query='SELECT fn_hato_photo_telegram($1,$2,$3::bigint,$4::bigint,$5::bigint,$6::jsonb) value';args=[a.p_channel,a.p_action,a.p_sender,a.p_chat_id,a.p_message_id,a.p_payload];}
  else if(name==='fn_hato_milk_weighing_telegram'){query='SELECT fn_hato_milk_weighing_telegram($1,$2::bigint,$3::bigint,$4::bigint,$5::jsonb) value';args=[a.p_action,a.p_sender,a.p_chat_id,a.p_message_id,a.p_intent];}
  else if(name==='fn_hato_photo_upload_service'){query='SELECT fn_hato_photo_upload_service($1,$2::uuid,$3::uuid,$4::jsonb) value';args=[a.p_action,a.p_request_key,a.p_owner,a.p_payload];}
  else if(name==='fn_hato_photo_upload_inspect_service'){query='SELECT fn_hato_photo_upload_inspect_service($1::uuid,$2::uuid) value';args=[a.p_request_key,a.p_owner];}
  else if(name==='fn_hato_photo_preview_service'){query='SELECT fn_hato_photo_preview_service($1,$2::uuid,$3::uuid,$4::jsonb) value';args=[a.p_action,a.p_request_key,a.p_owner,a.p_payload];}
  else throw Error('Unexpected RPC');let value;
  try{await pg.query('BEGIN');await pg.query('SET LOCAL ROLE service_role');await pg.query("SELECT set_config('request.jwt.claim.sub','',true)");value=(await pg.query(query,args)).rows[0].value;await pg.query('COMMIT');}catch(e){console.error('Local RPC refusal:',e.message);await pg.query('ROLLBACK');return new Response(JSON.stringify({message:e.message}),{status:400,headers});}
  if(name==='fn_hato_photo_telegram'&&a.p_channel==='preview'&&a.p_action==='record'&&loseRecord){loseRecord=false;throw Error('Lost retained native outcome reply');}
  if(name==='fn_hato_photo_telegram'&&a.p_channel==='preview'&&a.p_action==='claim'&&loseClaim){loseClaim=false;throw Error('Lost OCR claim reply');}return new Response(JSON.stringify(value),{headers});
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
 await pg.connect();service=createClient('https://photo.invalid','synthetic-service',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false}});globalThis.fetch=transport;globalThis.Deno={env:{get:n=>n==='OPENROUTER_API_KEY'?'synthetic-no-model-cost':undefined}};
 const h=load('src/supabase/functions/server/telegram/milkPhoto.ts'),pipeline=load('src/supabase/functions/server/hato-pesaje-telegram.ts'),same=load('src/supabase/functions/server/hatoPhotoUploadProtocol.ts').photoSame;
 const action={sender:input.sender,chatId:input.sender,messageId:1901},png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64')),photos={year:2026,month:10,photos:[{bytes:png,mime:'image/png'}]},ocr=v=>pipeline.nativePhotoOCR(service,v);
 const anchor={message_id:1901,chat:{id:input.sender,type:'private'},text:'Preparing'},pages=[],messages=[],ctx={from:{id:input.sender},chat:anchor.chat,message:{...anchor,message_id:1900},session:{},answerCallbackQuery:async()=>{},reply:async text=>{messages.push(text);return text.startsWith('Preparando revisión')?{...anchor,message_id:1904}:anchor;},api:{sendMessage:async(_chat,text)=>{pages.push(text);},editMessageText:async(chat,id,text)=>{check(chat===input.sender&&[1901,1904].includes(id),'render original native private message');anchor.text=text;}}};
 let failed=false;try{await h.processNativePhoto(service,action,photos,ocr);}catch{failed=true;}check(failed&&uploads===1&&models===1,'lost retained native record reply sends one upload and one model request');
 const recovered=await h.nativePhoto(service,action);check(recovered.result.preview.state==='ready'&&recovered.actor.profileId===owner&&recovered.actor.origin==='telegram','independent native status recovers original known outcome/actor');
 await h.renderNativePhoto(ctx,recovered);check(pages.some(p=>p.includes('AM 3 / PM 4'))&&anchor.text.includes(recovered.requestKey),'actual native preview captures original dates/readings and key');
 const capture=(await pg.query('SELECT to_jsonb(c) value FROM hato_capturas_foto c WHERE id=$1',[recovered.requestKey])).rows[0].value,audit=(await pg.query('SELECT receipt FROM hato_native_photo_preview.audit WHERE request_key=$1',[recovered.requestKey])).rows[0].receipt;
 check(same(capture,recovered.result.preview.capture_after)&&same(audit,recovered.result.preview.receipt)&&capture.origen==='telegram'&&capture.created_by===owner&&capture.filas_escritas===null,'independent exact native capture/audit has Telegram provenance and unknown writes');
 ctx.callbackQuery={data:'hmp:status',message:anchor};ctx.session={};await h.handlePhotoRecovery(ctx,async()=>{throw Error('Wrong middleware');},service,ocr);check(uploads===1&&models===1,'session-independent original status never resends or reprocesses');
 const latest=await h.nativePhoto(service,{...action,messageId:1999},'recover');check(latest.action.messageId===1901&&latest.requestKey===recovered.requestKey,'new conversation recovers old original message without replacement');
 ctx.callbackQuery.data='hmp:review';await h.handlePhotoRecovery(ctx,async()=>{},service,ocr);check((await pg.query('SELECT count(*)::int n FROM hato_milk_telegram.requests WHERE owner_id=$1',[owner])).rows[0].n===1&&models===1&&uploads===1,'actual recovered preview hands off to prepared native milk without post/model/upload');
 const milk=(await pg.query('SELECT state,plan FROM hato_milk_telegram.requests WHERE owner_id=$1',[owner])).rows[0];check(milk.state==='pending'&&milk.plan.capture.id===recovered.requestKey&&milk.plan.capture.origen==='telegram','separate milk review captures same exact native photo before confirmation');
 await h.nativePhoto(service,action,'acknowledge',null,recovered);check((await h.nativePhoto(service,action)).result.upload.acknowledged,'explicit terminal acknowledgment keeps original proof');
 const second={...action,messageId:1902};loseClaim=true;failed=false;try{await h.processNativePhoto(service,second,photos,ocr);}catch{failed=true;}check(failed&&uploads===2&&models===1,'lost native OCR permission reply never starts model');
 const held=await h.nativePhoto(service,second);check(held.result.preview.state==='held','original unknown native claim is held');await h.processNativePhoto(service,second,null,ocr);check(uploads===2&&models===1,'explicit held recovery cannot mint another inference permission');
 failed=false;try{await h.nativePhoto(service,second,'acknowledge',null,held);}catch{failed=true;}check(failed,'unknown held native outcome cannot be acknowledged');
 failed=false;try{await h.processNativePhoto(service,{...action,messageId:1903},photos,ocr);}catch{failed=true;}check(failed&&uploads===2&&models===1,'competing original cannot replace held native request');
 for(const [label,ddl] of [['revoked registration','UPDATE telegram_usuarios SET activo=false WHERE telegram_id='+input.sender],['revoked profile',"UPDATE usuarios SET activo=false WHERE id='"+owner+"'"],['module loss','UPDATE telegram_usuarios SET modulos_permitidos=ARRAY[]::text[] WHERE telegram_id='+input.sender],['rebound profile',"UPDATE telegram_usuarios SET usuario_id='"+input.other+"' WHERE telegram_id="+input.sender]]){
  const before=JSON.stringify((await pg.query(input.stateQuery)).rows);let refused=false;try{await pg.query('BEGIN');await pg.query(ddl);await pg.query('SET LOCAL ROLE service_role');await pg.query("SELECT fn_hato_photo_telegram('preview','status',$1::bigint,$1::bigint,1902,NULL)",[input.sender]);}catch{refused=true;}finally{await pg.query('ROLLBACK');}check(refused&&before===JSON.stringify((await pg.query(input.stateQuery)).rows),label+' refuses with whole-state rollback');
 }
 for(const altered of [{...action,chatId:input.sender+1},{...action,sender:input.sender+1}]){failed=false;try{await h.nativePhoto(service,altered);}catch{failed=true;}check(failed,'foreign/group native action refused');}
 process.stdout.write(JSON.stringify({assertions:checks.length,checks,uploads,models,hosted_certified:false})+'\n');
}finally{await pg.end();}
