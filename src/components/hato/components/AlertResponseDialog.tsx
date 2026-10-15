import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogBody,DialogFooter} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import type {AlertResponseBrowserAttempt} from '@/utils/hato/alertResponseBrowserAttempt';
interface Props {open:boolean;busy:boolean;error:string|null;attempt:AlertResponseBrowserAttempt|null;onClose:()=>void;onAction:(mode:'prepare'|'post'|'status'|'resolve'|'new')=>void}
export function AlertResponseDialog({open,busy,error,attempt,onClose,onAction}:Props){
 const r=attempt?.result,a=r?.original?.animal,c=r?.original?.clinical,s=c?.steps.find(x=>x.id===r?.original?.alert.paso_id);
 const labels:Record<string,string>={secado_due:'Secado pendiente',tratamiento_paso:'Paso de tratamiento',rechequeo_due:'Rechequeo pendiente',servicio_sin_confirmacion:'Servicio sin confirmar',parto_proximo:'Parto próximo'};
 return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}}><DialogContent><DialogHeader><DialogTitle>Revisar respuesta de alerta</DialogTitle><DialogDescription>Revise el animal, alerta, respuesta y fecha del intento original.</DialogDescription></DialogHeader><DialogBody>
 {r?.original&&<dl className="space-y-2"><div><dt>Animal</dt><dd>{String(a?.numero??'Sin caravana')} · {String(a?.nombre??'Sin nombre')}</dd></div><div><dt>Alerta</dt><dd>{labels[String(r.original.alert.tipo)]}</dd></div><div><dt>Programada</dt><dd>{String(r.original.alert.fecha_programada)}</dd></div><div><dt>Respuesta</dt><dd>{attempt?.intent.respuesta}</dd></div><div><dt>Fecha de respuesta</dt><dd>{attempt?.intent.fecha}</dd></div></dl>}
 {c&&<p>Tratamiento: {String(c.header.nombre)} · Paso {String(s?.paso_num)}: {String(s?.descripcion??'Sin descripción')} · Programado: {String(s?.fecha_programada)}</p>}
 {r?.state==='pending'&&<p>{r.original?.alert.tipo==='secado_due'&&attempt?.intent.respuesta==='si'?'Se registrará un evento de secado para este animal y fecha.':'Se registrará la respuesta sin crear un evento.'}</p>}
 {r?.state==='committed'&&<p role="status">Respuesta registrada. La constancia original quedó guardada.</p>}
 {r?.state==='canceled'&&<p role="status">Intento cancelado. Este intento no puede registrar la respuesta.</p>}
 {(!r||r.state==='unknown')&&<p>Verifique el intento original antes de volver a confirmar.</p>}
 {error&&<p role="alert">{error}</p>}
 </DialogBody><DialogFooter className="flex flex-wrap gap-2">{r?.state==='pending'&&<Button disabled={busy} onClick={()=>onAction('post')}>Confirmar respuesta</Button>}
 {(!r||r.state==='unknown')&&<Button disabled={busy||!attempt} onClick={()=>onAction('prepare')}>Preparar revisión</Button>}
 <Button variant="outline" disabled={busy} onClick={()=>onAction('status')}>Verificar</Button>
 {r?.state==='committed'||r?.state==='canceled'?<Button disabled={busy} onClick={()=>onAction('new')}>Listo</Button>:<Button variant="outline" disabled={busy||!attempt} onClick={()=>onAction('resolve')}>Cancelar intento</Button>}
 <Button variant="ghost" disabled={busy} onClick={onClose}>Cerrar</Button></DialogFooter></DialogContent></Dialog>;
}
