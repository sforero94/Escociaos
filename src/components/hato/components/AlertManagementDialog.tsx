import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogBody,DialogFooter} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import type {AlertManagementBrowserAttempt} from '@/utils/hato/alertManagementBrowserAttempt';
interface Props {open:boolean;busy:boolean;error:string|null;attempt:AlertManagementBrowserAttempt|null;onClose:()=>void;onAction:(mode:'prepare'|'post'|'status'|'resolve'|'new')=>void}
export function AlertManagementDialog({open,busy,error,attempt,onClose,onAction}:Props){
 const r=attempt?.result,p=r?.intent,o=r?.original;
 const labels={create:'Crear alerta',edit:'Editar alerta',discard:'Descartar alertas'};
 return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}}><DialogContent><DialogHeader><DialogTitle>Revisar gestión de alertas</DialogTitle><DialogDescription>Verifique los animales, alertas y fechas capturados antes de confirmar.</DialogDescription></DialogHeader><DialogBody>
 {p&&o&&<><p>{labels[p.kind]}</p>{p.kind==='create'?<dl><dt>Animal</dt><dd>{o.animal?`${o.animal.numero??'Sin caravana'} · ${o.animal.nombre??'Sin nombre'}`:'Todo el hato'}</dd><dt>Tipo</dt><dd>{p.tipo}</dd><dt>Fecha programada</dt><dd>{p.fechaProgramada}</dd><dt>Nota</dt><dd>{p.nota||'Sin nota'}</dd></dl>:o.targets.map(t=><dl key={String(t.alert.id)}><dt>Animal</dt><dd>{t.animal?`${t.animal.numero??'Sin caravana'} · ${t.animal.nombre??'Sin nombre'}`:'Todo el hato'}</dd><dt>Alerta</dt><dd>{String(t.alert.tipo)} · {String(t.alert.fecha_programada)}</dd>{p.kind==='edit'&&<><dt>Nueva fecha</dt><dd>{p.fechaProgramada}</dd><dt>Nota</dt><dd>{p.nota||'Sin nota'}</dd></>}</dl>)}
 {o.clinical&&<p>Tratamiento: {String(o.clinical.header.nombre)} · Paso: {String(o.clinical.steps.find(s=>s.id===(p.kind==='create'?p.pasoId:null))?.descripcion??'Sin descripción')}. Crear la alerta no ejecuta el paso.</p>}
 </>}
 {r?.state==='committed'&&<p role="status">Gestión registrada. La constancia original quedó guardada.</p>}
 {r?.state==='canceled'&&<p role="status">Intento cancelado. Este intento no puede registrar cambios.</p>}
 {(!r||r.state==='unknown')&&<p>Verifique el intento original antes de volver a confirmar.</p>}
 {error&&<p role="alert">{error}</p>}
 </DialogBody><DialogFooter className="flex flex-wrap gap-2">
 {r?.state==='pending'&&<Button disabled={busy} onClick={()=>onAction('post')}>Confirmar gestión</Button>}
 {(!r||r.state==='unknown')&&<Button disabled={busy||!attempt} onClick={()=>onAction('prepare')}>Preparar revisión</Button>}
 <Button variant="outline" disabled={busy} onClick={()=>onAction('status')}>Verificar</Button>
 {r?.state==='committed'||r?.state==='canceled'?<Button disabled={busy} onClick={()=>onAction('new')}>Listo</Button>:<Button variant="outline" disabled={busy||!attempt} onClick={()=>onAction('resolve')}>Cancelar intento</Button>}
 <Button variant="ghost" disabled={busy} onClick={onClose}>Cerrar</Button></DialogFooter></DialogContent></Dialog>;
}
