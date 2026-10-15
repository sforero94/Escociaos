import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogBody,DialogFooter} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import type {ClinicalBrowserAttempt} from '@/utils/hato/clinicalStepBrowserAttempt';
interface Props {open:boolean;busy:boolean;error:string|null;attempt:ClinicalBrowserAttempt|null;onClose:()=>void;onAction:(mode:'prepare'|'post'|'status'|'resolve'|'new')=>void}
export function ClinicalStepConfirmationDialog({open,busy,error,attempt,onClose,onAction}:Props){
 const r=attempt?.result,s=r?.original?.steps.find(x=>x.id===attempt?.intent.stepId),a=r?.original?.animal;
 return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}}><DialogContent><DialogHeader><DialogTitle>Confirmar paso aplicado</DialogTitle><DialogDescription>Revise el animal, tratamiento y fecha del intento original.</DialogDescription></DialogHeader><DialogBody>
 {r?.original&&<dl className="space-y-2"><div><dt>Animal</dt><dd>{String(a?.numero??'Sin caravana')} · {String(a?.nombre??'Sin nombre')}</dd></div><div><dt>Tratamiento</dt><dd>{String(r.original.header.nombre??'Sin nombre')}</dd></div><div><dt>Paso</dt><dd>{String(s?.descripcion??'Sin descripción')}</dd></div><div><dt>Fecha aplicada</dt><dd>{attempt?.intent.fechaEjecutada}</dd></div></dl>}
 {r?.state==='committed'&&<p role="status">Paso confirmado. La constancia original quedó guardada.</p>}
 {r?.state==='canceled'&&<p role="status">Intento cancelado. Este intento no puede aplicar el paso.</p>}
 {(!r||r.state==='unknown')&&<p>Verifique el intento original antes de volver a confirmar.</p>}
 {error&&<p role="alert">{error}</p>}
 </DialogBody><DialogFooter className="flex flex-wrap gap-2">{r?.state==='pending'&&<Button disabled={busy} onClick={()=>onAction('post')}>Confirmar aplicación</Button>}
 {(!r||r.state==='unknown')&&<Button disabled={busy||!attempt} onClick={()=>onAction('prepare')}>Preparar revisión</Button>}
 <Button variant="outline" disabled={busy} onClick={()=>onAction('status')}>Verificar</Button>
 {r?.state==='committed'||r?.state==='canceled'?<Button disabled={busy} onClick={()=>onAction('new')}>Listo</Button>:<Button variant="outline" disabled={busy||!attempt} onClick={()=>onAction('resolve')}>Cancelar intento</Button>}
 <Button variant="ghost" disabled={busy} onClick={onClose}>Cerrar</Button></DialogFooter></DialogContent></Dialog>;
}
