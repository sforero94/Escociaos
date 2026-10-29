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
  if(prior && JSON.stringify(prior.payload)!==JSON.stringify(args.p_datos)) return {data:null,error:{code:'22023',message:'Changed payload'}};
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
} finally {
  await browser?.close(); await server?.close(); await rm(temp,{recursive:true,force:true});
}
