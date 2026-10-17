import {useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogBody,DialogFooter} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {useCycleBirthUndo} from '../hooks/useCycleBirthUndo';
import {pendingCycleBirthUndoBrowser} from '@/utils/hato/hatoCycleBirthUndoBrowserAttempt';
import type {JsonRow} from '@/utils/hato/alertResponseProtocol';
import type {HatoEventoRow} from '@/types/hato';
import type {EditarEventoDialogProps} from './EditarEventoDialog';
/** Selection chooses a protocol, never proves eligibility; the database owns provenance. */
export function isCycleRetainedBirth(e:HatoEventoRow){return e.tipo==='parto'&&e.fuente==='web'&&e.cria_destino==='retenida'&&e.cria_id!==null;}
const display=(v:unknown)=>v===null||v===undefined?'Sin registrar':String(v);
export function CycleBirthUndoDialog({open,onOpenChange,evento,onGuardado}:EditarEventoDialogProps & {evento:HatoEventoRow}){
 const {hasRole}=useAuth(),allowed=hasRole(['Gerencia']),undo=useCycleBirthUndo(evento.id);
 const result=undo.attempt?.result,b=result?.original,e=b?.event,c=b?.calf,m=b?.snapshot.graph.animal,father=b?.snapshot.toros.find(t=>t.id===c?.padre_toro_id);
 const run=async(mode:'prepare'|'post'|'status'|'resolve'|'new')=>{try{await undo.run(mode,mode==='prepare'?{eventId:evento.id,observedEvent:structuredClone(evento) as unknown as JsonRow}:null);if(mode==='new'){if(result?.state==='committed')onGuardado();onOpenChange(false);}}catch{/* The hook retains the original and displays its error. */}};
 return <Dialog open={open} onOpenChange={value=>{if(!value&&!undo.busy)onOpenChange(false);}}><DialogContent size="md"><DialogHeader><DialogTitle>Deshacer parto y ficha de cría</DialogTitle></DialogHeader><DialogBody>
 {!allowed?<p role="alert">Requiere Gerencia vigente para revisar o recuperar este intento.</p>:<>
 <p>Revise el parto y su ficha automática intacta antes de confirmar su eliminación conjunta. La base verifica su evidencia original y sus referencias.</p>
 {!undo.attempt&&<Button type="button" disabled={undo.busy} onClick={()=>void run('prepare')}>Revisar eliminación de parto y cría</Button>}
 <Button type="button" disabled={undo.busy} onClick={()=>void run('status')}>Recuperar intento original del parto</Button>
 {undo.error&&<p role="alert">{undo.error}</p>}
 {undo.attempt&&<section aria-label="Revisión de parto y cría"><p>Intento: {undo.attempt.key}. Estado: {result?.state??'por verificar'}. Revisión válida para: {result?.effectiveDate??'por verificar'}.</p>
 {b&&<><p>Madre capturada: #{display(m?.numero)} {display(m?.nombre)} · {display(e?.animal_id)}</p><p>Parto: {display(e?.id)} · {display(e?.fecha)} ({display(e?.fecha_confianza)}) · Destino: {display(e?.cria_destino)}</p><p>Cría capturada: #{display(c?.numero)} {display(c?.nombre)} · {display(c?.id)}</p><p>Madre de la cría: {display(c?.madre_id)}. Nacimiento: {display(c?.fecha_nacimiento)} ({display(c?.fecha_nacimiento_confianza)}).</p><p>Sexo: {display(c?.sexo)} · Etapa: {display(c?.etapa)} · Estado: {display(c?.estado)}.</p><p>Finca: {display(c?.finca_id)}. Padre: {display(father?.nombre)} · {display(c?.padre_toro_id)}.</p><p>Registro original: {display(e?.created_at)}. Perfil creador: {display(e?.created_by)}.</p><p>{result?.state==='committed'?'Eliminación verificada: el parto y la ficha de su cría se retiraron juntos. Las dos trazas de corrección y la evidencia original se conservan.':'Se eliminarán juntos únicamente este parto y esta ficha automática intacta. Se conservarán dos trazas de corrección y la evidencia original. Cualquier cambio o referencia puede impedir la operación.'}</p></>}
 <Button type="button" disabled={undo.busy||result?.state!=='pending'||!b} onClick={()=>void run('post')}>Confirmar eliminación de parto y cría</Button>
 <Button type="button" disabled={undo.busy||!['pending','unknown'].includes(result?.state??'unknown')} onClick={()=>void run('resolve')}>Cancelar intento original del parto</Button>
 <Button type="button" disabled={undo.busy||!['committed','canceled'].includes(result?.state??'')} onClick={()=>void run('new')}>Finalizar intento verificado del parto</Button>
 </section>}</>}
 </DialogBody><DialogFooter><Button type="button" disabled={undo.busy} onClick={()=>onOpenChange(false)}>Cerrar</Button></DialogFooter></DialogContent></Dialog>;
}
/** Uses the saved selector; no live timeline row is required after deletion. */
export function CycleBirthUndoRecoveryButton({onRecover}:{onRecover:(event:HatoEventoRow)=>void}){
 const {user,hasRole}=useAuth();const [error,setError]=useState<string|null>(null);
 return <><Button type="button" variant="outline" disabled={!hasRole(['Gerencia'])} onClick={()=>{try{if(!user?.id||!hasRole(['Gerencia']))throw Error('Requiere Gerencia vigente.');const a=pendingCycleBirthUndoBrowser(user.id);if(!a)throw Error('No hay un intento original del parto guardado en esta cuenta y navegador.');setError(null);onRecover(a.intent.observedEvent as unknown as HatoEventoRow);}catch(e){setError(e instanceof Error?e.message:'Conserve el intento original.');}}}>Recuperar deshacer de parto y cría</Button>{error&&<p role="alert">{error}</p>}</>;
}
