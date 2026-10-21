import {runInvoiceRelease,pendingInvoiceRelease,type InvoiceReleaseAttempt} from '@/utils/hato/hatoIncomeInvoiceReleaseBrowserAttempt';
import type {InvoiceReleasePreview,InvoiceReleaseReceipt} from '@/utils/hato/hatoIncomeInvoiceReleaseProtocol';
import type {MetadataClient} from '@/utils/hato/hatoIncomeMetadataProtocol';
import {useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {getSupabase} from '@/utils/supabase/client';
import {pendingInvoice,type InvoiceClient,type InvoiceReceipt} from '@/utils/invoiceUpload';
import {cancelIncomeInvoice,incomeInvoiceScope} from '@/utils/hato/hatoIncomeInvoiceAttempt';
import {runOriginInvoice,pendingOriginInvoice,type OriginInvoiceAttempt} from '@/utils/hato/hatoIncomeInvoiceOriginBrowserAttempt';
import {FACTURA_ACCEPT} from '@/utils/archivoFactura';
import {Button} from '@/components/ui/button';
export function MeasuredIncomeInvoiceUploader({incomeId,open,disabled,onReceipt,onReleased,onHold,resetKey=0}:{incomeId:string;open:boolean;disabled:boolean;onHold:(held:boolean)=>void;resetKey?:number;onReceipt:(r:InvoiceReceipt)=>void;onReleased?:(r:InvoiceReleaseReceipt)=>void}){
 const {user,hasRole}=useAuth(),owner=user?.id,allowed=open&&hasRole(['Gerencia']),generation=useRef(0);
 const [attempt,setAttempt]=useState<OriginInvoiceAttempt|null>(null),[held,setHeld]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [release,setRelease]=useState<InvoiceReleaseAttempt|null>(null),[preview,setPreview]=useState<InvoiceReleasePreview|null>(null),[confirmed,setConfirmed]=useState(false);
 const currentContext=useRef({owner,incomeId,allowed});currentContext.current={owner,incomeId,allowed};
 useLayoutEffect(()=>{const lifecycle=generation;lifecycle.current++;setBusy(false);setError(null);setPreview(null);setConfirmed(false);try{setRelease(owner?pendingInvoiceRelease(owner,incomeId):null);setAttempt(owner?pendingOriginInvoice(owner,incomeId):null);setHeld(Boolean(owner&&(pendingInvoiceRelease(owner,incomeId)||pendingOriginInvoice(owner,incomeId)?.held||pendingInvoice(owner,incomeInvoiceScope(incomeId)))));}catch{setHeld(true);setError('Conserva el intento original; el almacenamiento no se pudo verificar.');}return()=>{lifecycle.current++;};},[owner,incomeId,allowed,resetKey]);
 useLayoutEffect(()=>{onHold(allowed&&(busy||held));return()=>onHold(false);},[onHold,allowed,busy,held,owner,incomeId,resetKey]);
 async function run(mode:'upload'|'status'|'cancel',file:File|null=null){
  if(!owner||!allowed||disabled||busy)return;const n=generation.current,current=()=>n===generation.current&&currentContext.current.owner===owner&&currentContext.current.incomeId===incomeId&&currentContext.current.allowed;
  setBusy(true);setError(null);
  try{if(mode==='cancel'){if(!attempt?.legacy)throw Error('La reserva original se conserva; consulta su resultado.');await cancelIncomeInvoice(getSupabase() as unknown as InvoiceClient,owner,incomeId,current);if(current()){setAttempt(null);setHeld(false);}return;}const a=await runOriginInvoice(getSupabase() as unknown as InvoiceClient & MetadataClient,owner,incomeId,mode,file,current);if(!current())return;setAttempt(a);setHeld(Boolean(a?.held||pendingInvoice(owner,incomeInvoiceScope(incomeId))));if(a?.receipt)onReceipt(a.receipt);else setError('Resultado pendiente. Consulta la factura original; no se enviará otro archivo.');}
  catch(e){if(current()){try{setAttempt(pendingOriginInvoice(owner,incomeId));setHeld(Boolean(pendingInvoiceRelease(owner,incomeId)||pendingOriginInvoice(owner,incomeId)?.held||pendingInvoice(owner,incomeInvoiceScope(incomeId))));}catch{setHeld(true);}setError(e instanceof Error?e.message:'Consulta el intento original.');}}
  finally{if(current())setBusy(false);}
 }
 async function terminal(action:'preview'|'release'|'recover'|'acknowledge'){
  if(!owner||!allowed||disabled||busy||action==='release'&&(!confirmed||!preview))return;
  const n=generation.current,current=()=>n===generation.current&&currentContext.current.owner===owner&&currentContext.current.incomeId===incomeId&&currentContext.current.allowed;
  setBusy(true);setError(null);
  try{
   const result=await runInvoiceRelease(getSupabase() as unknown as InvoiceClient & MetadataClient,owner,incomeId,action,current,action==='acknowledge'?release?.preview:preview??undefined);
   if(!current())return;setConfirmed(false);
   if(action==='preview'){setPreview(result as InvoiceReleasePreview);setHeld(true);return;}
   if(action==='acknowledge'){
    const done=result as InvoiceReleaseAttempt;if(!done.receipt)throw Error('Consulta el comprobante original.');onReleased?.(done.receipt);setRelease(null);setPreview(null);setAttempt(pendingOriginInvoice(owner,incomeId));setHeld(Boolean(pendingOriginInvoice(owner,incomeId)?.held||pendingInvoice(owner,incomeInvoiceScope(incomeId))));
   }else{setRelease(result as InvoiceReleaseAttempt|null);setPreview(null);setHeld(Boolean(result||pendingOriginInvoice(owner,incomeId)?.held||pendingInvoice(owner,incomeInvoiceScope(incomeId))));if(!result)setError('Sin comprobante definitivo. Conserva y consulta el original.');}
  }catch(e){if(current()){setHeld(true);try{setRelease(pendingInvoiceRelease(owner,incomeId));}catch{/* Preserve hold on corrupt or inaccessible evidence. */}setError(e instanceof Error?e.message:'Consulta la liberación original.');}}
  finally{if(current())setBusy(false);}
 }
 return <section aria-label="Factura verificada de ingreso medido" className="space-y-2">
 <p>La factura se valida antes de revisar el cambio. El ingreso solo cambia tras confirmar los metadatos capturados.</p>
 {error&&<p role="alert">{error}</p>}
 <input aria-label="Seleccionar factura verificada" type="file" accept={FACTURA_ACCEPT} disabled={disabled||busy||!allowed||held||Boolean(attempt?.receipt)} onChange={e=>{const f=e.target.files?.[0];if(f)void run('upload',f);}}/>
 <Button type="button" variant="outline" disabled={disabled||busy||!allowed||Boolean(release)} onClick={()=>void run('status')}>Consultar factura original</Button>
 {attempt?.legacy&&<Button type="button" variant="outline" disabled={disabled||busy||!allowed||Boolean(release)} onClick={()=>void run('cancel')}>Cancelar destino original (conservar archivo)</Button>}
 {attempt&&<p className="text-xs break-all">{attempt.targetKey?`Destino original: ${attempt.targetKey}`:`Reserva original: ${attempt.requestKey}`}</p>}
 {attempt?.receipt&&<p className="text-sm break-all">Factura verificada: {attempt.receipt.path} · {attempt.receipt.identity.mime} · {attempt.receipt.identity.size} bytes · SHA-256 {attempt.receipt.identity.sha256}</p>}
 <Button type="button" variant="outline" disabled={disabled||busy||!allowed||Boolean(release)} onClick={()=>void terminal('preview')}>Revisar liberación del original</Button>
 <Button type="button" variant="outline" disabled={disabled||busy||!allowed} onClick={()=>void terminal('recover')}>Consultar liberación original</Button>
 {preview&&<div aria-label="Revisión de liberación original">
 <p>Destino {preview.target.target_key} · Original {preview.originKey} · Resultado {{held:'pendiente de resolución',committed_settled:'archivo confirmado y permisos finalizados',unused_fenced:'reserva sin permisos de escritura emitidos',quarantine_settled_absent:'cuarentena con ausencia definitiva y permisos finalizados'}[preview.disposition]}</p>
 <p>Permisos emitidos: {preview.executions.length}; pendientes: {preview.executions.filter(e=>!e.settled).length}. Referencias: {preview.references.length}. Cambios de metadatos pendientes: {preview.metadataClaims.length}.</p>
 <p>Se conservan el archivo, las referencias y todo el historial. Solo se cierra el destino original y se registra la liberación.</p>
 <details><summary>Detalle del original revisado</summary>
 <p className="break-all">Archivo: {String(preview.request.path)} · Estado: {String(preview.request.state)} · Tamaño: {String((preview.origin.file_claims as {size:number}).size)} bytes · SHA-256: {String((preview.origin.file_claims as {sha256:string}).sha256)}</p>
 <p>Destino {preview.target.active?'abierto':'cerrado'}; archivo {preview.object?'conservado':'sin objeto observado'}. La ausencia por sí sola no resuelve un resultado pendiente.</p>
 <ul>{preview.executions.map(e=><li key={e.execution_id}>Permiso {e.execution_id}: {e.settled?'finalizado':'resultado pendiente'}</li>)}</ul>
 <ul>{preview.references.map((r,i)=><li key={i}>Referencia conservada {r.table==='compras'?'Compra':r.table==='fin_gastos'?'Gasto':'Ingreso'}: {String(r.row.id)} · Fecha {String(r.row.fecha??'sin fecha')} · Valor {String(r.row.valor??r.row.total??'sin valor')}</li>)}</ul>
 <ul>{preview.metadataClaims.map(c=><li key={String(c.request_key)}>Cambio original {String(c.request_key)}: {String(c.state)}</li>)}</ul>
 </details>
 {preview.disposition==='held'?<p role="alert">El resultado o un permiso sigue pendiente. No se libera ni se envía un reemplazo.</p>:<><label><input type="checkbox" checked={confirmed} disabled={busy||disabled||!allowed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo liberar este original conservando archivo e historial</label><Button type="button" disabled={busy||disabled||!allowed||!confirmed} onClick={()=>void terminal('release')}>Confirmar liberación revisada</Button></>}
 </div>}
 {release&&<div aria-label="Resultado de liberación original"><p>Original {release.preview.originKey}: {release.receipt?'liberación definitiva verificada':'resultado pendiente; consulta el mismo original'}</p>{release.receipt&&<Button type="button" disabled={busy||disabled||!allowed} onClick={()=>void terminal('acknowledge')}>Reconocer liberación y limpiar solo este intento</Button>}</div>}
 </section>;
}
