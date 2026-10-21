import type {MetadataClient} from '@/utils/hato/hatoIncomeMetadataProtocol';
import {useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {getSupabase} from '@/utils/supabase/client';
import {pendingInvoice,type InvoiceClient,type InvoiceReceipt} from '@/utils/invoiceUpload';
import {cancelIncomeInvoice,incomeInvoiceScope} from '@/utils/hato/hatoIncomeInvoiceAttempt';
import {runOriginInvoice,pendingOriginInvoice,type OriginInvoiceAttempt} from '@/utils/hato/hatoIncomeInvoiceOriginBrowserAttempt';
import {FACTURA_ACCEPT} from '@/utils/archivoFactura';
import {Button} from '@/components/ui/button';
export function MeasuredIncomeInvoiceUploader({incomeId,open,disabled,onReceipt,onHold,resetKey=0}:{incomeId:string;open:boolean;disabled:boolean;onHold:(held:boolean)=>void;resetKey?:number;onReceipt:(r:InvoiceReceipt)=>void}){
 const {user,hasRole}=useAuth(),owner=user?.id,allowed=open&&hasRole(['Gerencia']),generation=useRef(0);
 const [attempt,setAttempt]=useState<OriginInvoiceAttempt|null>(null),[held,setHeld]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const currentContext=useRef({owner,incomeId,allowed});currentContext.current={owner,incomeId,allowed};
 useLayoutEffect(()=>{const lifecycle=generation;lifecycle.current++;setBusy(false);setError(null);try{setAttempt(owner?pendingOriginInvoice(owner,incomeId):null);setHeld(Boolean(owner&&(pendingOriginInvoice(owner,incomeId)?.held||pendingInvoice(owner,incomeInvoiceScope(incomeId)))));}catch{setHeld(true);setError('Conserva el intento original; el almacenamiento no se pudo verificar.');}return()=>{lifecycle.current++;};},[owner,incomeId,allowed,resetKey]);
 useLayoutEffect(()=>{onHold(allowed&&(busy||held));return()=>onHold(false);},[onHold,allowed,busy,held,owner,incomeId,resetKey]);
 async function run(mode:'upload'|'status'|'cancel',file:File|null=null){
  if(!owner||!allowed||disabled||busy)return;const n=generation.current,current=()=>n===generation.current&&currentContext.current.owner===owner&&currentContext.current.incomeId===incomeId&&currentContext.current.allowed;
  setBusy(true);setError(null);
  try{if(mode==='cancel'){if(!attempt?.legacy)throw Error('La reserva original se conserva; consulta su resultado.');await cancelIncomeInvoice(getSupabase() as unknown as InvoiceClient,owner,incomeId,current);if(current()){setAttempt(null);setHeld(false);}return;}const a=await runOriginInvoice(getSupabase() as unknown as InvoiceClient & MetadataClient,owner,incomeId,mode,file,current);if(!current())return;setAttempt(a);setHeld(Boolean(a?.held||pendingInvoice(owner,incomeInvoiceScope(incomeId))));if(a?.receipt)onReceipt(a.receipt);else setError('Resultado pendiente. Consulta la factura original; no se enviará otro archivo.');}
  catch(e){if(current()){try{setAttempt(pendingOriginInvoice(owner,incomeId));setHeld(Boolean(pendingOriginInvoice(owner,incomeId)?.held||pendingInvoice(owner,incomeInvoiceScope(incomeId))));}catch{setHeld(true);}setError(e instanceof Error?e.message:'Consulta el intento original.');}}
  finally{if(current())setBusy(false);}
 }
 return <section aria-label="Factura verificada de ingreso medido" className="space-y-2">
 <p>La factura se valida antes de revisar el cambio. El ingreso solo cambia tras confirmar los metadatos capturados.</p>
 {error&&<p role="alert">{error}</p>}
 <input aria-label="Seleccionar factura verificada" type="file" accept={FACTURA_ACCEPT} disabled={disabled||busy||!allowed||held||Boolean(attempt?.receipt)} onChange={e=>{const f=e.target.files?.[0];if(f)void run('upload',f);}}/>
 <Button type="button" variant="outline" disabled={disabled||busy||!allowed} onClick={()=>void run('status')}>Consultar factura original</Button>
 {attempt?.legacy&&<Button type="button" variant="outline" disabled={disabled||busy||!allowed} onClick={()=>void run('cancel')}>Cancelar destino original (conservar archivo)</Button>}
 {attempt&&<p className="text-xs break-all">{attempt.targetKey?`Destino original: ${attempt.targetKey}`:`Reserva original: ${attempt.requestKey}`}</p>}
 {attempt?.receipt&&<p className="text-sm break-all">Factura verificada: {attempt.receipt.path} · {attempt.receipt.identity.mime} · {attempt.receipt.identity.size} bytes · SHA-256 {attempt.receipt.identity.sha256}</p>}
 </section>;
}
