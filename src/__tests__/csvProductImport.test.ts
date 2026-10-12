import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { createHash } from 'node:crypto';
import { parseCsvProducts, csvDecimal, CsvValidationError,validateCsvReceipt,validateCsvStatus,CSV_PERCENT,CSV_NUMERIC10,CSV_NUMERIC12,CSV_INTEGER } from '../supabase/functions/server/csv-product-import';
import { importCsvProducts,pendingCsvImport,type CsvImportClient } from '../utils/csvProductImport';
import { owner,other,product,movement,memory,storage,testLocks,sdkHarness } from './purchaseProtocolFixtures';
const raw='nombre,categoria,grupo,unidad_medida,cantidad_actual\nSynthetic,Fertilizante,Agroinsumos,Kilos,2.345';
const slot=`csv_product_import_v1:${owner}`;
const url='https://csv.invalid/functions/v1/make-server-1ccce916/inventario/importar-productos';
export function csvResult(b:Record<string,unknown>){const p=parseCsvProducts(String(b.csvData));return {success:true,actor:owner,requestKey:b.requestKey,parserVersion:1,csvSha256:createHash('sha256').update(p.raw_csv).digest('hex'),total:p.products.length,importados:p.products.length,message:'Imported atomically',products:p.products.map(v=>({product_id:product,opening_quantity:v.cantidad_actual??0,movement_id:Number(v.cantidad_actual??0)>0?movement:null,product:{...v,id:product,cantidad_actual:v.cantidad_actual??0,updated_by:owner}}))};}
function status(b:Record<string,unknown>,committed:boolean,result:unknown){const r=csvResult(b);return {actor:r.actor,requestKey:r.requestKey,parserVersion:r.parserVersion,csvSha256:r.csvSha256,committed,result};}
let calls:Array<Record<string,unknown>>;
async function setup(run:(b:Record<string,unknown>)=>unknown|Promise<unknown>){const h=await sdkHarness(()=>null);vi.stubGlobal('fetch',vi.fn(async (_input:unknown,init:RequestInit)=>{expect(new Headers(init.headers).get('Authorization')).toMatch(/^Bearer ey/);const b=JSON.parse(String(init.body));calls.push(b);const r=await run(b);return r instanceof Response?r:new Response(JSON.stringify(r),{headers:{'Content-Type':'application/json'}});}));return {h,client:h.client as unknown as CsvImportClient};}
beforeEach(()=>{memory.clear();calls=[];vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{locks:testLocks});});
afterEach(()=>{vi.unstubAllGlobals();});
describe('whole CSV parser',()=>{
 it('preserves multiline quoted text, doubled quotes, comma decimals, comments and BOM',()=>{
  const p=parseCsvProducts('\uFEFF# note\nnombre,categoria,grupo,unidad_medida,cantidad_actual,ingrediente_activo_3,concentracion_ia_3\n"Named, product",fertilizante,agroinsumos,kilos,"1,005","line one\n# actual data and ""quote""",2e-1');
  expect(p.products[0]).toEqual({activo:true,nombre:'Named, product',categoria:'Fertilizante',grupo:'Agroinsumos',unidad_medida:'Kilos',cantidad_actual:1.01,ingrediente_activo_3:'line one\n# actual data and "quote"',concentracion_ia_3:0.2});
 });
 it('rounds numeric exactly including ties and scientific fractions',()=>{
  for(const [s,n] of [['1.005',1.01],['-1.005',-1.01],['0.005',0.01],['2.675',2.68],['1e-309',0],['0e9999',0]] as const)expect(csvDecimal(s,99999999.99)).toBe(n);
 });
 it('rejects unsupported duplicate headers, malformed rows and quote syntax',()=>{
  for(const s of [raw.replace('nombre,','nombre,id,'),raw.replace('nombre,','nombre,nombre,'),raw+',extra',raw+'"',raw.replace('Synthetic','"unfinished')])expect(()=>parseCsvProducts(s)).toThrow(CsvValidationError);
 });
 it('rejects malformed optional fields and fractional integers without dropping values',()=>{
  for(const [field,value] of [['nitrogeno','1foo'],['precio_unitario','Infinity'],['concentracion_ia_3','100000000'],['periodo_reingreso_horas','1.5']])expect(()=>parseCsvProducts(raw.replace('\n',','+field+'\n')+','+value)).toThrow();
 });
 it('preserves every valid business field and boolean mapping',()=>{
  const p=parseCsvProducts(raw.replace('\n',',tipo_aplicacion,estado_fisico,permitido_gerencia,activo,precio_unitario,nitrogeno\n')+',edafico,liquido,SÍ,false,100,2.25');
  expect(p.products[0]).toMatchObject({tipo_aplicacion:'Edáfico',estado_fisico:'Líquido',permitido_gerencia:true,activo:false,precio_unitario:100,nitrogeno:2.25});
 });
 it('rejects all negative numeric fields and six percentage fields above the existing max',()=>{
  for(const field of [...CSV_NUMERIC10,...CSV_NUMERIC12,...CSV_INTEGER]){
    const csv=field==='cantidad_actual'?raw.replace('2.345','-1e-309'):raw.replace('\n',','+field+'\n')+',-1';
    expect(()=>parseCsvProducts(csv)).toThrow();
  }
  for(const field of CSV_PERCENT)expect(()=>parseCsvProducts(raw.replace('\n',','+field+'\n')+',100.001')).toThrow();
  for(const field of ['concentracion_ia_1','concentracion_ia_2','concentracion_ia_3'])expect(parseCsvProducts(raw.replace('\n',','+field+'\n')+',250').products[0][field]).toBe(250);
  expect(()=>parseCsvProducts(raw.replace('2.345','9999999999.9900001'))).toThrow();
  expect(()=>parseCsvProducts(raw.replace('\n',',periodo_carencia_dias\n')+',1.00000000000000000001')).toThrow();
 });
 it('strictly accepts known quoted boolean aliases and rejects unknown flags',()=>{
  for(const [flag,value] of [['TRUE',true],['false',false],['0',false],['no',false],['Si',true],['yes',true]] as const)
    expect(parseCsvProducts(raw.replace('\n',',riesgo_acuatico\n')+',"'+flag+'"').products[0].riesgo_acuatico).toBe(value);
  for(const flag of ['tru','falso','none','2'])expect(()=>parseCsvProducts(raw.replace('\n',',riesgo_acuatico\n')+','+flag)).toThrow();
 });
 it('caps raw bytes and batch rows before any request',()=>{expect(()=>parseCsvProducts(raw+'x'.repeat(1048576))).toThrow();expect(()=>parseCsvProducts('nombre,categoria,grupo,unidad_medida\n'+Array.from({length:501},(_,i)=>`P${i},Fertilizante,Agroinsumos,Kilos`).join('\n'))).toThrow();});
});
describe('actual browser SDK durable CSV protocol',()=>{
 it('posts verified human JWT and clears only exact proven receipt',async()=>{const {client}=await setup(csvResult);const r=await importCsvProducts(client,url,owner,raw);expect(r?.importados).toBe(1);expect(memory.has(slot)).toBe(false);expect(calls[0]).toMatchObject({csvData:raw,action:'import'});});
 it('uncertain transport resolves committed request using identical owner key/raw',async()=>{const {client}=await setup(b=>b.action==='import'?Promise.reject(new Error('lost')):status(b,true,csvResult(b)));expect((await importCsvProducts(client,url,owner,raw))?.success).toBe(true);expect(calls[0].requestKey).toBe(calls[1].requestKey);expect(calls[1].csvData).toBe(raw);expect(memory.has(slot)).toBe(false);});
 it('unknown status retains evidence and unchanged retry reuses key',async()=>{let lose=true;const {client}=await setup(b=>lose?null:csvResult(b));await expect(importCsvProducts(client,url,owner,raw)).rejects.toThrow();const key=pendingCsvImport(owner)!.key;lose=false;await importCsvProducts(client,url,owner,raw);expect(calls[1].requestKey).toBe(key);expect(memory.has(slot)).toBe(false);});
 it('changed later file refuses replacement of uncertain durable attempt',async()=>{const {client}=await setup(()=>null);await expect(importCsvProducts(client,url,owner,raw)).rejects.toThrow();await expect(importCsvProducts(client,url,owner,raw.replace('Synthetic','Changed'))).rejects.toThrow('pendiente');expect(calls).toHaveLength(1);expect(pendingCsvImport(owner)!.raw).toBe(raw);});
 it('explicit resolution clears only durable canceled proof',async()=>{const {client}=await setup(b=>b.action==='import'?null:status(b,false,null));await expect(importCsvProducts(client,url,owner,raw)).rejects.toThrow();expect(await importCsvProducts(client,url,owner,null,'resolve')).toBeNull();expect(memory.has(slot)).toBe(false);});
 it('rejects malformed or mixed cancellation proof without clearing',async()=>{const {client}=await setup(b=>b.action==='import'?null:status(b,false,{}));await expect(importCsvProducts(client,url,owner,raw)).rejects.toThrow();await expect(importCsvProducts(client,url,owner,null,'resolve')).rejects.toThrow();expect(memory.has(slot)).toBe(true);});
 it('does not clear durable evidence after owner/lifecycle changes while response pending',async()=>{let done!:(r:unknown)=>void;let b!:Record<string,unknown>;let current=true;const {client}=await setup(body=>{b=body;return new Promise(resolve=>{done=resolve;});});const p=importCsvProducts(client,url,owner,raw,'import',()=>current);await vi.waitFor(()=>expect(done).toBeTypeOf('function'));current=false;done(csvResult(b));await expect(p).rejects.toThrow('sesión');expect(memory.has(slot)).toBe(true);});
 it('rejects switched SDK account before reservation',async()=>{const {client,h}=await setup(csvResult);h.switchOwner(other);await expect(importCsvProducts(client,url,owner,raw)).rejects.toThrow('sesión');expect(calls).toHaveLength(0);expect(memory.has(slot)).toBe(false);});
 it('cross-tab changed requests share exclusive reservation and cannot double-post',async()=>{let release!:(v:unknown)=>void;let original!:Record<string,unknown>;const {client}=await setup(b=>{original=b;return new Promise(done=>{release=done;});});const p=importCsvProducts(client,url,owner,raw);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));await expect(importCsvProducts(client,url,owner,raw.replace('Synthetic','Changed'))).rejects.toThrow('pendiente');release(csvResult(original));await p;expect(calls).toHaveLength(1);});
 it('status proof binds cancellation to owner, key, raw hash and parser version',async()=>{const p=parseCsvProducts(raw);const b={csvData:raw,requestKey:other};const proof=status(b,false,null);expect(await validateCsvStatus(proof,owner,other,p)).toBeNull();for(const patch of [{actor:other},{requestKey:owner},{parserVersion:2},{csvSha256:'0'.repeat(64)},{result:{}},{extra:true}])await expect(validateCsvStatus({...proof,...patch},owner,other,p)).rejects.toThrow();});
 it('stored attempts refuse a changed parser version without replacing evidence',async()=>{const {client}=await setup(()=>null);await expect(importCsvProducts(client,url,owner,raw)).rejects.toThrow();const saved=JSON.parse(memory.get(slot)!);memory.set(slot,JSON.stringify({...saved,version:2}));await expect(importCsvProducts(client,url,owner,raw)).rejects.toThrow();expect(JSON.parse(memory.get(slot)!).version).toBe(2);expect(calls).toHaveLength(1);});
 it('receipt verification refuses actor, key, field, stock, ledger, digest and count mutation',async()=>{const p=parseCsvProducts(raw);const b={csvData:raw,requestKey:other};const r=csvResult(b);for(const patch of [{actor:other},{requestKey:owner},{csvSha256:'0'.repeat(64)},{total:2},{products:[{...r.products[0],opening_quantity:3}]},{products:[{...r.products[0],movement_id:null}]},{products:[{...r.products[0],product:{...r.products[0].product,nombre:'Changed'}}]}])await expect(validateCsvReceipt({...r,...patch},owner,other,p)).rejects.toThrow();});
});
