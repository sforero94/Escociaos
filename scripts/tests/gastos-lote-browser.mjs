// Local-only browser regression. No app backend, credentials or real records.
// Requires installed Vite/React and Playwright + Chromium. Set PLAYWRIGHT_MODULE
// to the local playwright-core module path when it is not in node_modules.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

const root = path.resolve(import.meta.dirname, '../..');
const temp = await mkdtemp(path.join(root, 'node_modules/.cache-gastos-browser-'));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
let server, browser;
const user = '00000000-0000-4000-8000-000000000001';
const catalog = '10000000-0000-4000-8000-000000000001';
try {
  await writeFile(path.join(temp, 'index.html'), '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
  await writeFile(path.join(temp, 'auth.ts'), `export function useAuth(){return {user:{id:'${user}'}}}`);
  await writeFile(path.join(temp, 'client.ts'), `
export function getSupabase(){return {rpc: async (name,args)=>{
  if(name!=='fn_fin_gastos_guardar_lote') throw Error('Unexpected RPC');
  if(args.p_usuario_id!=='${user}') throw Error('Unexpected user');
  const receipts=JSON.parse(localStorage.getItem('synthetic_receipts')||'{}');
  const prior=receipts[args.p_solicitud_id];
  if(prior && JSON.stringify(prior.payload)!==JSON.stringify(args.p_datos)) return {data:null,error:{code:'PGB01',message:'Changed payload'}};
  if(prior) return {data:prior.result,error:null};
  const result={cantidad:args.p_datos.length,ids:args.p_datos.map((_,i)=>'synthetic-'+i)};
  receipts[args.p_solicitud_id]={payload:args.p_datos,result};
  localStorage.setItem('synthetic_receipts',JSON.stringify(receipts));
  if(localStorage.getItem('lose_response')==='yes') {localStorage.removeItem('lose_response'); throw Error('Synthetic lost response');}
  return {data:result,error:null};
}}}
`);
  await writeFile(path.join(temp, 'fixture.css'), `@import '${root}/src/index.css'; @source '${root}/src';`);
  await writeFile(path.join(temp, 'fixture.tsx'), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import './fixture.css';
import * as expenseApi from '${root}/src/utils/guardadoGastosLote';
window.expenseApi=expenseApi;
import {GastosBatchTable} from '${root}/src/components/finanzas/components/GastosBatchTable';
const item={id:'${catalog}',nombre:'Local',activo:true};
const catalogs={negocios:[item],regiones:[item],categorias:[item],conceptos:[item],proveedores:[],mediosPago:[item],loading:false,getConceptosPorCategoria:()=>[item],reloadProveedores:async()=>{}};
createRoot(document.getElementById('root')!).render(<GastosBatchTable catalogs={catalogs} onSaved={()=>{document.body.dataset.saved='yes'}}/>);
`);
  server = await createServer({configFile:false, root:temp, plugins:[react(),tailwindcss()],
    resolve:{alias:[{find:'@/contexts/AuthContext',replacement:path.join(temp,'auth.ts')},
      {find:'@/utils/supabase/client',replacement:path.join(temp,'client.ts')},{find:'@',replacement:path.join(root,'src')}]},
    server:{host:'127.0.0.1',port:0,fs:{allow:[root]}},});
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
    const context=await browser.newContext({viewport});
    await context.route('**/*', route => {
      const host=new URL(route.request().url()).hostname;
      return host==='127.0.0.1'||host==='localhost' ? route.continue() : route.abort();
    });
    const a=await context.newPage();
    await a.goto(url);
    await a.evaluate(({catalog})=>{
      localStorage.clear();
      localStorage.setItem('gastos_batch_draft',JSON.stringify({solicitudId:'20000000-0000-4000-8000-000000000001',savedAt:new Date().toISOString(),rows:[{
        id:'30000000-0000-4000-8000-000000000001',fecha:'2026-10-28',nombre:'Gasto sintético',valor:'10',
        negocio_id:catalog,region_id:catalog,categoria_id:catalog,concepto_id:catalog,proveedor_id:'',medio_pago_id:catalog,observaciones:'',factura_uploaded:false
      }]}));
      localStorage.setItem('lose_response','yes');
    },{catalog});
    await a.reload();
    await a.getByRole('button',{name:'Restaurar',exact:true}).click();
    await a.getByPlaceholder('Nombre del gasto').fill('   ');
    await a.getByRole('button',{name:'Guardar 1 gasto',exact:true}).click();
    assert.equal(await a.evaluate(()=>localStorage.getItem('synthetic_receipts')),null);
    assert.equal(await a.evaluate(user=>localStorage.getItem('gastos_lote_pendiente_v1_'+user),user),null);
    await a.getByPlaceholder('Nombre del gasto').fill('Gasto sintético');
    const b=await context.newPage();
    await b.goto(url);
    await b.getByRole('button',{name:'Restaurar',exact:true}).click();
    await a.getByRole('button',{name:'Guardar 1 gasto',exact:true}).click();
    await a.getByRole('button',{name:'Verificar lote pendiente',exact:true}).waitFor();
    assert(await a.getByPlaceholder('Nombre del gasto').isDisabled());
    await a.reload();
    await a.getByRole('button',{name:'Verificar lote pendiente',exact:true}).click();
    await a.waitForFunction(()=>document.body.dataset.saved==='yes');
    // B still holds the original draft in memory after A confirmed and cleared storage.
    // The draft UUID must replay the original receipt, never create another batch.
    await b.getByRole('button',{name:'Guardar 1 gasto',exact:true}).click();
    await b.waitForFunction(()=>document.body.dataset.saved==='yes');
    assert.equal(await a.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('synthetic_receipts'))).length),1);
    assert.equal(await a.evaluate(user=>localStorage.getItem('gastos_lote_pendiente_v1_'+user),user),null);
    assert.equal(await a.evaluate(()=>localStorage.getItem('gastos_batch_draft')),null);
    await a.evaluate(()=>localStorage.setItem('gastos_batch_draft',JSON.stringify({solicitudId:'different-newer-draft',rows:[{id:'newer-row',nombre:'Otro borrador'}]})));
    await a.waitForTimeout(5500); // Both empty grids still have their autosave timers.
    assert.equal(await a.evaluate(()=>JSON.parse(localStorage.getItem('gastos_batch_draft')).solicitudId),'different-newer-draft');
    const sizes=await a.evaluate(()=>({body:document.documentElement.scrollWidth,width:innerWidth,fieldset:getComputedStyle(document.querySelector('fieldset')).minWidth,overflow:getComputedStyle(document.querySelector('table').parentElement).overflowX}));
    console.log(sizes);
    assert(sizes.body<=sizes.width,`Page overflow: ${JSON.stringify(sizes)}`);
    await a.screenshot({path:`/tmp/gastos-lote-${viewport.width}.png`,fullPage:true});
    console.log(`PASS ${viewport.width}px: lost response, locked input, reload, receipt recovery, stale second-tab replay, preserve newer draft after autosave, page width`);
    await context.close();
  }
  // Native Web Locks in separate browser pages. RPC transport is deliberately
  // synthetic: this validates real cross-tab serialization, not PostgREST.
  for (const reverse of [false,true]) {
    const context=await browser.newContext();
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    const a=await context.newPage(), b=await context.newPage();
    let signalEntered, releaseFirst;
    const entered=new Promise(resolve=>{signalEntered=resolve;});
    const barrier=new Promise(resolve=>{releaseFirst=resolve;});
    let calls=0;
    const receipts=new Map();
    const rpc=async (_name,args)=>{
      calls++;
      const prior=receipts.get(args.p_solicitud_id);
      if(prior) {
        assert.deepEqual(args.p_datos,prior.payload);
        return {data:prior.result,error:null};
      }
      const result={cantidad:1,ids:['synthetic-original-id']};
      receipts.set(args.p_solicitud_id,{payload:args.p_datos,result});
      signalEntered();
      await barrier;
      throw Error('Synthetic committed response lost');
    };
    await a.exposeFunction('adversarialRpc',rpc);
    await b.exposeFunction('adversarialRpc',rpc);
    await Promise.all([a.goto(url),b.goto(url)]);
    await Promise.all([a.waitForFunction(()=>window.expenseApi),b.waitForFunction(()=>window.expenseApi)]);
    await a.evaluate(()=>localStorage.clear());
    const original=[{nombre:'Original',valor:10,url_factura:'invoice-path-a'}];
    const changed=[{nombre:'Edited',valor:20,url_factura:'invoice-path-b'}];
    const first=reverse?changed:original, second=reverse?original:changed;
    const request='40000000-0000-4000-8000-000000000001';
    const pendingKey='gastos_lote_pendiente_v1_'+user;
    const submit=(page,payload)=>page.evaluate(async({user,payload,request})=>{
      try {return await window.expenseApi.guardarGastosLote({rpc:window.adversarialRpc},user,payload,request);}
      catch(e){return e.message;}
    },{user,payload,request});
    const owner=reverse?b:a, waiter=reverse?a:b;
    const one=submit(owner,first);
    await entered;
    const frozen=await b.evaluate(key=>localStorage.getItem(key),pendingKey);
    const two=submit(waiter,second);
    await waiter.waitForFunction(async key=>(await navigator.locks.query()).pending.some(lock=>lock.name===key),pendingKey);
    assert.equal(calls,1);
    assert.equal(await b.evaluate(key=>localStorage.getItem(key),pendingKey),frozen);
    releaseFirst();
    assert.match(await one,/response lost/);
    assert.match(await two,/cambiar/);
    assert.equal(calls,1); // Conflicting waiter never overwrites storage or sends RPC.
    assert.equal(await b.evaluate(key=>localStorage.getItem(key),pendingKey),frozen);
    assert.deepEqual(JSON.parse(frozen).datos,first);
    await owner.reload();
    await owner.waitForFunction(()=>window.expenseApi);
    assert.equal(await owner.evaluate(async user=>window.expenseApi.guardarGastosLote({rpc:window.adversarialRpc},user,undefined,undefined,()=>true),user),1);
    assert.equal(receipts.size,1);
    assert.equal(calls,2); // Original + exact replay, no changed-payload RPC.
    assert.equal(await a.evaluate(key=>localStorage.getItem(key),pendingKey),null);
    console.log(`PASS native cross-tab locks reverse=${reverse}: conflicting invoice/edit waits, no overwrite, lost response + reload replays exact committed payload`);
    await context.close();
  }
  const unsupported=await browser.newContext();
  await unsupported.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const page=await unsupported.newPage(); await page.goto(url); await page.waitForFunction(()=>window.expenseApi);
  const absent=await page.evaluate(async user=>{
    localStorage.clear(); Object.defineProperty(navigator,'locks',{value:undefined,configurable:true});
    let calls=0;
    try {await window.expenseApi.guardarGastosLote({rpc:async()=>{calls++;}},user,[{nombre:'Local'}],'id');}
    catch(e){return {calls,message:e.message,pending:localStorage.getItem('gastos_lote_pendiente_v1_'+user)};}
  },user);
  assert.equal(absent.calls,0); assert.equal(absent.pending,null); assert.match(absent.message,/navegador/);
  console.log('PASS unsupported browser helper: no pending mutation or RPC fallback');
  await unsupported.close();

} finally {
  await browser?.close(); await server?.close(); await rm(temp,{recursive:true,force:true});
}
