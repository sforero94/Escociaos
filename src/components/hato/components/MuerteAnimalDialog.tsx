import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogBody,DialogFooter} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {useAuth} from '@/contexts/AuthContext';
import {useFormPersistence} from '@/hooks/useFormPersistence';
import {useDeath} from '../hooks/useDeath';
import {obtenerFechaHoy} from '@/utils/fechas';
import {deathIntent} from '@/utils/hato/hatoDeathProtocol';
import {FormDraftBanner} from '@/components/shared/FormDraftBanner';
import type {HatoAnimalRow} from '@/types/hato';
interface Props {open:boolean;onOpenChange:(open:boolean)=>void;animal:HatoAnimalRow;onGuardado:()=>void}
export function MuerteAnimalDialog(props:Props){const {user}=useAuth();return <DeathForm key={`${user?.id??'none'}:${props.animal.id}`} {...props}/>;}
function DeathForm({open,onOpenChange,animal,onGuardado}:Props){
 const [inputError,setInputError]=useState<string|null>(null);const flow=useDeath();const [form,setForm,clearForm,restored]=useFormPersistence({key:`hato_death_form:${animal.id}`,initialState:{date:obtenerFechaHoy(),cause:''},enabled:open});
 const {run}=flow;
 // Status alone recovers the durable original request; opening never creates/posts one.
 useEffect(()=>{if(open)void run('status').catch(()=>{});},[open]); // eslint-disable-line react-hooks/exhaustive-deps
 const attempt=flow.attempt,result=attempt?.result,original=result?.original;
 const invoke=(mode:'prepare'|'post'|'status'|'resolve'|'new')=>{
  if(mode==='prepare'&&form.date>obtenerFechaHoy())return;
  setInputError(null);let intent=null;try{if(mode==='prepare')intent=deathIntent({version:1,animalId:animal.id,date:form.date,cause:form.cause.trim(),observedAnimal:animal});}catch(e){setInputError(e instanceof Error?e.message:'Datos inválidos');return;}
  void run(mode,intent).then(()=>{
   if(mode==='new'){clearForm();onOpenChange(false);if(result?.state==='committed')onGuardado();}
  }).catch(()=>{});
 };
 return <Dialog open={open} onOpenChange={value=>{if(!flow.busy)onOpenChange(value);}}><DialogContent size="sm"><DialogHeader><DialogTitle>Registrar muerte</DialogTitle></DialogHeader>
 <DialogBody className="space-y-4">
 {(flow.error||inputError)&&<p role="alert">{flow.error||inputError}</p>}
 {attempt?<><p>Intento original: {attempt.key}</p><p>Estado: {result?.state??'sin verificar'}</p>
 <p>Animal: {String(original?.animal.nombre??attempt.intent.observedAnimal.nombre??'Sin nombre')} · #{String(original?.animal.numero??attempt.intent.observedAnimal.numero??'sin chapeta')} · {attempt.intent.animalId}</p>
 <p>Fecha de muerte: {attempt.intent.date}</p><p>Causa: {attempt.intent.cause||'Sin causa indicada'}</p>
 {result?.state==='pending'&&<p>Revise este animal, fecha y causa antes de confirmar. La muerte y el evento se guardan juntos; sus registros relacionados se conservan.</p>}
 {result?.state==='committed'&&<p>Muerte registrada y comprobada. Evento: {result.eventId}</p>}
 </>:<><p>Animal: {animal.nombre??'Sin nombre'} · #{animal.numero??'sin chapeta'} · {animal.id}</p><FormDraftBanner show={restored} variant="restored" onDiscard={clearForm}/>
 <Label htmlFor="muerte-fecha">Fecha *</Label><Input id="muerte-fecha" type="date" max={obtenerFechaHoy()} value={form.date} onChange={e=>setForm(previous=>({...previous,date:e.target.value}))}/>
 <Label htmlFor="muerte-causa">Causa (opcional)</Label><Textarea id="muerte-causa" maxLength={4000} value={form.cause} onChange={e=>setForm(previous=>({...previous,cause:e.target.value}))}/></>}
 </DialogBody><DialogFooter>
 <Button variant="outline" disabled={flow.busy} onClick={()=>onOpenChange(false)}>Cerrar</Button>
 <Button variant="outline" disabled={flow.busy} onClick={()=>invoke('status')}>Verificar intento original</Button>
 {attempt&&(!result||['unknown','pending'].includes(result.state))&&<Button variant="outline" disabled={flow.busy} onClick={()=>invoke('resolve')}>Cancelar intento original</Button>}
 {result?.state==='pending'&&<Button variant="destructive" disabled={flow.busy} onClick={()=>invoke('post')}>Confirmar muerte preparada</Button>}
 {result&&['committed','canceled'].includes(result.state)&&<Button disabled={flow.busy} onClick={()=>invoke('new')}>Finalizar intento verificado</Button>}
 {!attempt&&<Button disabled={flow.busy||!!flow.error||!form.date||form.date>obtenerFechaHoy()} onClick={()=>invoke('prepare')}>Preparar revisión</Button>}
 </DialogFooter></DialogContent></Dialog>;
}
