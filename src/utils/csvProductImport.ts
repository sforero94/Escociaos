import { CSV_PARSER_VERSION, parseCsvProducts, validateCsvReceipt, validateCsvStatus, type CsvReceipt } from '../supabase/functions/server/csv-product-import';
export interface CsvImportClient {
  auth: {
    getUser(): PromiseLike<{data:{user:{id:string}|null};error:{message:string}|null}>;
    getSession(): PromiseLike<{data:{session:{access_token:string;user:{id:string}}|null};error:{message:string}|null}>;
  };
}
export interface CsvAttempt { version: number; owner: string; key: string; raw: string }
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slot=(owner:string)=>`csv_product_import_v1:${owner.toLowerCase()}`;
const fail=():never=>{throw new Error('No se pudo verificar la importación. Conserve el intento pendiente.');};
export function pendingCsvImport(owner:string):CsvAttempt|null {
  if(!UUID.test(owner)) return fail();
  const saved=localStorage.getItem(slot(owner));if(saved===null)return null;
  const p=JSON.parse(saved) as CsvAttempt;
  if(!p || Object.keys(p).length!==4 || p.version!==CSV_PARSER_VERSION || p.owner!==owner || !UUID.test(p.key) || typeof p.raw!=='string')return fail();
  parseCsvProducts(p.raw);return p;
}
async function authorize(client:CsvImportClient,owner:string,current:()=>boolean) {
  const u=await client.auth.getUser();const s=await client.auth.getSession();
  if(u.error || s.error || u.data.user?.id!==owner || s.data.session?.user.id!==owner || !s.data.session.access_token || !current())
    throw new Error('La sesión cambió. Abra la importación con su cuenta.');
  return s.data.session.access_token;
}
export async function importCsvProducts(client:CsvImportClient,url:string,owner:string,raw:string|null,
  action:'import'|'resolve'='import',current:()=>boolean=()=>true):Promise<CsvReceipt|null> {
  if(!UUID.test(owner))return fail();
  const locks=globalThis.navigator?.locks;
  if(!locks)throw new Error('Use un navegador actualizado con conexión HTTPS para importar.');
  if(raw!==null)parseCsvProducts(raw);
  await authorize(client,owner,current);
  const a=await locks.request(slot(owner),{mode:'exclusive'},()=>{
    if(!current())return fail();
    let a=pendingCsvImport(owner);
    if(a && raw!==null && a.raw!==raw)throw new Error('Hay una importación pendiente. Verifíquela antes de importar otro archivo.');
    if(!a){
      if(raw===null || action==='resolve')throw new Error('No hay importación pendiente.');
      a={version:CSV_PARSER_VERSION,owner,key:crypto.randomUUID(),raw};localStorage.setItem(slot(owner),JSON.stringify(a));
    }
    return a;
  });
  const payload=parseCsvProducts(a.raw);
  const request=async (kind:'import'|'resolve')=>{
    const token=await authorize(client,owner,current);
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({csvData:a.raw,requestKey:a.key,action:kind})});
    const data:unknown=await response.json();
    if(!response.ok)throw new Error(data && typeof data==='object' && 'error' in data ? String(data.error):'Error al importar productos');
    return data;
  };
  let data:unknown;
  if(action==='resolve')data=await request('resolve');
  else {
    try{data=await request('import');}
    catch{data=await request('resolve');action='resolve';}
  }
  let receipt:CsvReceipt|null;
  if(action==='resolve'){
    receipt=await validateCsvStatus(data,owner,a.key,payload);
  } else receipt=await validateCsvReceipt(data,owner,a.key,payload);
  await authorize(client,owner,current);
  await locks.request(slot(owner),{mode:'exclusive'},()=>{
    if(!current())return fail();
    if(pendingCsvImport(owner)?.key!==a.key)return fail();
    localStorage.removeItem(slot(owner));
  });
  return receipt;
}
