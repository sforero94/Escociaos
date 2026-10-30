// Actual AuthProvider/Supabase JS with real local Auth/PostgREST, synthetic data.
// Ephemeral local credentials arrive on stdin, never logs or committed files.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
let input='';for await(const chunk of process.stdin) input+=chunk;
const config=JSON.parse(input);
assert.equal(new URL(config.api).hostname,'127.0.0.1');
const root=path.resolve(import.meta.dirname,'../..');
const temp=await mkdtemp(path.join(root,'node_modules/.cache-gastos-live-'));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs');
let server,browser;
async function control(action,args){
 const response=await fetch(config.api+'/__test/'+action,{method:args?'POST':'GET',headers:{'Content-Type':'application/json'},body:args?JSON.stringify(args):undefined});
 assert.equal(response.status,200);return response.json();
}
async function waitCommitted(id){
 for(let i=0;i<150;i++){const state=await control('state');if(state.requests.some(r=>r.id===id&&r.status===200))return;
 await new Promise(resolve=>setTimeout(resolve,100));}
 throw Error('Real local commit barrier did not arrive');
}
async function ready(page,url,signIn=false){
 await page.goto(url);await page.waitForFunction(()=>window.expenseLive);
 if(signIn){
  const result=await page.evaluate(async({email,password})=>{
   const {data,error}=await window.expenseLive.client.auth.signInWithPassword({email,password});
   return {id:data.user?.id,error:error?.message};
  },{email:config.email,password:config.password});
  assert(!result.error,result.error);assert.equal(result.id,config.user);
 }
 await page.waitForFunction(user=>document.body.dataset.user===user&&document.body.dataset.role==='Gerencia',config.user);
}
function draft(id,name){return{solicitudId:id,savedAt:new Date().toISOString(),rows:[{
 id:crypto.randomUUID(),fecha:'2026-10-29',nombre:name,valor:'10',negocio_id:config.catalog,
 region_id:config.catalog,categoria_id:config.catalog,concepto_id:config.catalog,
 proveedor_id:'',medio_pago_id:config.catalog,observaciones:'',factura_uploaded:false}]}};
async function countName(page,name){return page.evaluate(async name=>{
 const{data,error}=await window.expenseLive.client.from('fin_gastos').select('id,created_by').eq('nombre',name);
 if(error)throw Error(error.message);return data;
},name);}
try{
 await writeFile(path.join(temp,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
 await writeFile(path.join(temp,'fixture.css'),'@import "'+root+'/src/index.css"; @source "'+root+'/src";');
 const fixture=[
  "import React,{useEffect} from 'react';import {createRoot} from 'react-dom/client';",
  "import {Toaster} from 'sonner';import './fixture.css';",
  "import {AuthProvider,useAuth} from '"+root+"/src/contexts/AuthContext';",
  "import {getSupabase} from '"+root+"/src/utils/supabase/client';",
  "import {guardarGastosLote} from '"+root+"/src/utils/guardadoGastosLote';",
  "import {GastosBatchTable} from '"+root+"/src/components/finanzas/components/GastosBatchTable';",
  "window.expenseLive={client:getSupabase(),save:guardarGastosLote};",
  "const item={id:'"+config.catalog+"',nombre:'Synthetic local',activo:true};",
  "const catalogs={negocios:[item],regiones:[item],categorias:[item],conceptos:[item],proveedores:[],mediosPago:[item],loading:false,getConceptosPorCategoria:()=>[item],reloadProveedores:async()=>{}};",
  "function Capture(){const {user,profile}=useAuth();",
  "useEffect(()=>{document.body.dataset.user=user?.id||'';document.body.dataset.role=profile?.rol||''},[user,profile]);",
  "return user?<GastosBatchTable catalogs={catalogs} onSaved={()=>{document.body.dataset.saved='yes'}}/>:<p>Local synthetic login pending</p>}",
  "createRoot(document.getElementById('root')!).render(<AuthProvider><Capture/><Toaster/></AuthProvider>);"
 ].join('\n');
 await writeFile(path.join(temp,'fixture.tsx'),fixture);
 server=await createServer({configFile:false,root:temp,plugins:[react(),tailwindcss()],
  define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(config.api),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify(config.anon)},
  resolve:{alias:{'@':path.join(root,'src')}},server:{host:'127.0.0.1',port:0,fs:{allow:[root]}}});
 await server.listen();const url=server.resolvedUrls.local[0];
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 async function context(viewport){
  const ctx=await browser.newContext({viewport});
  await ctx.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  return ctx;
 }
 for(const width of [1280,390]){
  const ctx=await context({width,height:900}),page=await ctx.newPage();await ready(page,url,true);
  const id=crypto.randomUUID(),name='Real browser UI '+width+' '+id;
  await page.evaluate(d=>localStorage.setItem('gastos_batch_draft',JSON.stringify(d)),draft(id,name));
  await ready(page,url);await page.getByRole('button',{name:'Restaurar',exact:true}).click();
  await control('drop',{request_id:id});
  await page.getByRole('button',{name:'Guardar 1 gasto',exact:true}).click();
  await waitCommitted(id);await control('release',{ok:true});
  await page.getByRole('button',{name:'Verificar lote pendiente',exact:true}).waitFor();
  assert(await page.getByPlaceholder('Nombre del gasto').isDisabled());
  await ready(page,url);
  await page.getByRole('button',{name:'Verificar lote pendiente',exact:true}).click();
  await page.waitForFunction(()=>document.body.dataset.saved==='yes');
  const rows=await countName(page,name);assert.equal(rows.length,1);assert.equal(rows[0].created_by,config.user);
  assert.equal(await page.evaluate(user=>localStorage.getItem('gastos_lote_pendiente_v1_'+user),config.user),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('gastos_batch_draft')),null);
  const requests=(await control('state')).requests.filter(r=>r.id===id);
  assert.equal(requests.length,2);assert.equal(requests[0].payload_hash,requests[1].payload_hash);
  console.log('PASS REAL '+width+'px: actual AuthProvider/sign-in, committed HTTP response lost, reload, exact RPC replay, one row and cleanup');
  await ctx.close();
 }
 for(const reverse of [false,true]){
  const ctx=await context({width:1280,height:900}),a=await ctx.newPage(),b=await ctx.newPage();
  await ready(a,url,true);await ready(b,url);
  const id=crypto.randomUUID(),name='Real concurrent '+id;
  const first=[{fecha:'2026-10-29',nombre:name,valor:10,negocio_id:config.catalog,region_id:config.catalog,categoria_id:config.catalog,concepto_id:config.catalog,medio_pago_id:config.catalog,proveedor_id:null,observaciones:null,url_factura:'synthetic-existing-path-a',estado:'Confirmado'}];
  const changed=[{...first[0],valor:20,url_factura:'synthetic-existing-path-b'}];
  const owner=reverse?b:a,waiter=reverse?a:b,key='gastos_lote_pendiente_v1_'+config.user;
  await control('drop',{request_id:id});
  const send=(page,datos)=>page.evaluate(async({user,id,datos})=>{
   try{return{ok:true,count:await window.expenseLive.save(window.expenseLive.client,user,datos,id)}}
   catch(e){return{ok:false,message:e.message}}
  },{user:config.user,id,datos});
  const one=send(owner,first);await waitCommitted(id);
  const frozen=await waiter.evaluate(key=>localStorage.getItem(key),key);
  const two=send(waiter,changed);
  await waiter.waitForFunction(async key=>(await navigator.locks.query()).pending.some(lock=>lock.name===key),key);
  assert.equal((await control('state')).requests.filter(r=>r.id===id).length,1);
  assert.equal(await waiter.evaluate(key=>localStorage.getItem(key),key),frozen);
  await control('release',{ok:true});
  assert.equal((await one).ok,false);assert.match((await two).message,/cambiar/);
  assert.equal(await waiter.evaluate(key=>localStorage.getItem(key),key),frozen);
  await ready(owner,url);
  assert.equal(await owner.evaluate(async user=>window.expenseLive.save(window.expenseLive.client,user,undefined,undefined,()=>true),config.user),1);
  const requests=(await control('state')).requests.filter(r=>r.id===id);
  assert.equal(requests.length,2);assert.equal(requests[0].payload_hash,requests[1].payload_hash);
  assert.equal((await countName(owner,name)).length,1);
  assert.equal(await owner.evaluate(key=>localStorage.getItem(key),key),null);
  console.log('PASS REAL native two-page contention reverse='+reverse+': no overwrite/conflicting send; committed loss+reload exact replay');
  await ctx.close();
 }
 const ctx=await context({width:390,height:844}),page=await ctx.newPage();await ready(page,url,true);
 const id=crypto.randomUUID();await page.evaluate(d=>localStorage.setItem('gastos_batch_draft',JSON.stringify(d)),draft(id,'Unsupported synthetic '+id));
 await ready(page,url);await page.getByRole('button',{name:'Restaurar',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic fixture')});
 let mutations=0;
 page.on('request',request=>{if(request.url().startsWith(config.api)&&request.method()==='POST'&&!request.url().includes('/auth/'))mutations++;});
 await page.evaluate(()=>Object.defineProperty(navigator,'locks',{value:undefined,configurable:true}));
 await page.getByRole('button',{name:'Guardar 1 gasto',exact:true}).click();
 await page.getByText('Este navegador no permite guardar el lote con seguridad.',{exact:false}).waitFor();
 assert.equal(mutations,0);
 assert.equal(await page.evaluate(user=>localStorage.getItem('gastos_lote_pendiente_v1_'+user),config.user),null);
 console.log('PASS REAL unsupported-lock UI: no RPC/Storage POST or pending mutation; synthetic file stays local');
 await ctx.close();
}finally{
 await browser?.close();await server?.close();await rm(temp,{recursive:true,force:true});
}
