import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import type { Context } from 'npm:hono';
import { perfilAplicacionActivo } from './perfilAplicacionActivo.ts';
import { INVOICE_MAX_BYTES, INVOICE_VERSION, validateInvoiceBytes,InvoiceValidationError } from './invoice-file-validation.ts';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const reject=(c:Context,message:string,status:400|401|403|409|500=400)=>c.json({error:message},status);
async function bounded(request:Request,limit:number){
  const length=request.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>limit))throw new InvoiceValidationError('Solicitud demasiado grande');
  const reader=request.body?.getReader();if(!reader)throw new InvoiceValidationError('Solicitud vacía');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw new InvoiceValidationError('Solicitud demasiado grande');}chunks.push(part.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export async function handleInvoiceUpload(c:Context,action:'upload'|'status'|'target'):Promise<Response>{
  const url=Deno.env.get('SUPABASE_URL')!;const apiKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const service=createClient(url,apiKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const bearer=c.req.header('Authorization');if(!bearer?.startsWith('Bearer '))return reject(c,'Sesión humana requerida',401);
  const auth=await service.auth.getUser(bearer.slice(7));if(auth.error||!auth.data.user)return reject(c,'Sesión inválida',401);
  const actor=auth.data.user.id;
  const profile=await service.from('usuarios').select('id,rol,activo').eq('id',actor).maybeSingle();
  if(profile.error)return reject(c,'No se pudo verificar la cuenta',500);
  if(!perfilAplicacionActivo(profile.data?[profile.data]:[],actor,['Administrador','Gerencia']))return reject(c,'Cuenta activa de Administrador o Gerencia requerida',403);
  const step=async(kind:string,identity:unknown,observed:string|null=null)=>{
    const r=await service.rpc('fn_invoice_upload_step',{p_actor:actor,p_action:kind,p_identity:identity,p_observed_sha:observed});
    if(r.error)throw new Error(r.error.message);
    const data=r.data as {state:string;path?:string;identity:Record<string,unknown>;actor:string;receiptId?:string;cleanupPending?:boolean};
    if(!data||typeof data!=='object'||Array.isArray(data)||data.actor!==actor||!identity||typeof identity!=='object'||!data.identity||typeof data.identity!=='object'
      ||Object.keys(data.identity).length!==Object.keys(identity).length||Object.entries(identity).some(([k,v])=>data.identity[k]!==v))throw new Error('Recibo de factura no verificable');
    if(data.state==='unknown'){if(kind!=='status'||Object.keys(data).length!==3)throw new Error('Estado de factura no verificable');}
    else if(!['pending','uploaded','quarantined','committed'].includes(data.state)||Object.keys(data).length!==6||!uuid(data.receiptId)
      ||data.path!==`verified/${data.receiptId}.${data.identity.extension}`||typeof data.cleanupPending!=='boolean'||(data.state==='committed'&&data.cleanupPending))throw new Error('Recibo de factura no verificable');
    return data;
  };
  const cleanup=(identity:unknown,_path:string)=>reconcileInvoiceUpload(service,actor,identity).catch(()=>undefined);
  try{
    if(action==='target'){
      const body=JSON.parse(new TextDecoder().decode(await bounded(c.req.raw,4096)));
      if(!uuid(body.targetKey)||!['activate','invalidate'].includes(body.action)||Object.keys(body).length!==2)return reject(c,'Destino de factura inválido');
      const r=await service.rpc('fn_invoice_upload_target',{p_actor:actor,p_target_key:body.targetKey,p_action:body.action});
      if(r.error)throw new Error(r.error.message);return c.json(r.data);
    }
    if(action==='status'){
      const identity=JSON.parse(new TextDecoder().decode(await bounded(c.req.raw,4096)));
      return c.json(await step('status',identity)); // Absence remains unknown, never a cancel proof.
    }
    // Body cap includes at most 64KiB multipart overhead. Actual file cap is independent.
    const bytes=await bounded(c.req.raw,INVOICE_MAX_BYTES+65536);
    const type=c.req.header('Content-Type')??'';if(!type.toLowerCase().startsWith('multipart/form-data;'))return reject(c,'Se requiere multipart/form-data');
    const form=await new Response(bytes,{headers:{'Content-Type':type}}).formData();
    const names=['requestKey','protocolVersion','targetKey','generation','tipo','file'];
    if([...form.keys()].length!==names.length||names.some(k=>form.getAll(k).length!==1)||[...form.keys()].some(k=>!names.includes(k)))return reject(c,'Campos de factura inválidos');
    const file=form.get('file');if(!file||typeof file==='string'||file.size>INVOICE_MAX_BYTES)return reject(c,'Archivo de máximo 5 MiB requerido');
    if(!uuid(form.get('requestKey'))||!uuid(form.get('targetKey'))||!uuid(form.get('generation'))||form.get('protocolVersion')!==String(INVOICE_VERSION)||!['compra','venta'].includes(String(form.get('tipo'))))return reject(c,'Identidad de factura inválida');
    const actual=new Uint8Array(await file.arrayBuffer());
    const meta=await validateInvoiceBytes(actual,file.type,file.name);
    const identity={requestKey:form.get('requestKey'),protocolVersion:INVOICE_VERSION,targetKey:form.get('targetKey'),generation:form.get('generation'),tipo:form.get('tipo'),...meta};
    const reserved=await step('reserve',identity);
    if(reserved.state==='committed')return c.json(reserved);
    if(!['pending','uploaded'].includes(reserved.state)||!reserved.path||!uuid(reserved.receiptId))return reject(c,'Factura en cuarentena. Conserve el intento.',409);
    const expectedPath=`verified/${reserved.receiptId}.${meta.extension}`;
    if(reserved.path!==expectedPath)throw new Error('Reserva no verificable');
    if(reserved.state==='pending'){
      // Conflict and lost acknowledgments recover by reading the SAME immutable object.
      const executionId=crypto.randomUUID();
      await step('write-claim',identity,executionId);
      const outcome=await service.storage.from('facturas').upload(expectedPath,actual,{contentType:meta.mime,upsert:false,cacheControl:'3600'});
      // Transport failures can conceal a delayed write. Only definitive success
      // or immutable-name conflict closes its retained execution authorization.
      const code=outcome.error&&'statusCode'in outcome.error?String(outcome.error.statusCode):null;
      if(!outcome.error||code==='409'||code==='Duplicate')await step('write-settled',identity,executionId);
    }
    const readback=await service.storage.from('facturas').download(expectedPath);
    if(readback.error||!readback.data)throw new Error('Resultado de Storage desconocido. Conserve el intento.');
    if(readback.data.size>INVOICE_MAX_BYTES){await step('quarantine',identity);await cleanup(identity,expectedPath);throw new Error('Objeto de factura no verificable');}
    let stored;
    try{stored=await validateInvoiceBytes(new Uint8Array(await readback.data.arrayBuffer()),meta.mime,`factura.${meta.sourceExtension}`);}
    catch{await step('quarantine',identity);await cleanup(identity,expectedPath);throw new Error('Objeto de factura no verificable');}
    if(stored.sha256!==meta.sha256||stored.size!==meta.size){await step('quarantine',identity);await cleanup(identity,expectedPath);throw new Error('Bytes de factura distintos');}
    await step('uploaded',identity);
    const committed=await step('finalize',identity,stored.sha256);
    if(committed.state!=='committed'){await cleanup(identity,expectedPath);return reject(c,'La cuenta o el destino cambió. Factura en cuarentena.',409);}
    return c.json(committed);
  }catch(error:unknown){return reject(c,error instanceof Error?error.message:'No se pudo verificar la factura',error instanceof InvoiceValidationError||error instanceof SyntaxError?400:500);}
}

// Service-only bounded reconciliation. No caller supplies a bucket or path.
// Scheduling and privileged route authentication remain release decisions.
export async function reconcileInvoiceUpload(service:ReturnType<typeof createClient>,actor:string,identity:unknown){
 const call=async(action:string,observation:string|null=null)=>{
  const result=await service.rpc('fn_invoice_upload_step',{p_actor:actor,p_action:action,p_identity:identity,p_observed_sha:observation});
  if(result.error)throw new Error('Invoice reconciliation pending');
  const r=result.data;
  if(!r||r.actor!==actor||r.state!=='quarantined'||!uuid(r.receiptId)||!identity||typeof identity!=='object'||!r.identity
    ||Object.keys(r.identity).length!==Object.keys(identity).length||Object.entries(identity).some(([k,v])=>r.identity[k]!==v)
    ||!['jpg','png','gif','pdf'].includes(r.identity.extension)||r.path!==`verified/${r.receiptId}.${r.identity.extension}`)throw new Error('Invoice quarantine proof required');
  return r;
 };
 const r=await call('cleanup-authorize');
 const removal=await service.storage.from('facturas').remove([r.path]);
 if(removal.error)return call('cleanup-observed','unknown');
 const probe=await service.storage.from('facturas').download(r.path);
 const absent=probe.error&&(('status'in probe.error&&String(probe.error.status)==='404')||('statusCode'in probe.error&&String(probe.error.statusCode)==='404'));
 return call('cleanup-observed',absent?'absent':'unknown');
}
