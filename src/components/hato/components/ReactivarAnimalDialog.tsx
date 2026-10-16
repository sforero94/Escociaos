import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogBody,DialogFooter} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {FormDraftBanner} from '@/components/shared/FormDraftBanner';
import {useAuth} from '@/contexts/AuthContext';
import {useFormPersistence} from '@/hooks/useFormPersistence';
import {useReactivation} from '../hooks/useReactivation';
import {construirNotaReactivacion} from '@/utils/hato/reactivacionAnimal';
import {reactivationIntent} from '@/utils/hato/hatoReactivationProtocol';
import type {AnimalFueraDelRoster} from '@/utils/importHato/ocrChequeo';
export interface ReactivarAnimalDialogProps {
 open:boolean;onOpenChange:(open:boolean)=>void;numeroImpreso:string;nombreImpreso:string;candidatos:readonly AnimalFueraDelRoster[];fechaChequeo:string|null;
 onReactivado:(animal:{id:string;numero:number})=>void;
 /** Exact live row identity; deliberately not restored from an older browser request. */
 rowContext?:object|null;
 /** Refresh only: recovered requests never reassign the currently open OCR row. */
 onVerificado?:()=>void;
}
export function ReactivarAnimalDialog(props:ReactivarAnimalDialogProps){const {user}=useAuth();return <ReactivationForm key={user?.id??'none'} {...props}/>;}
function ReactivationForm(props:ReactivarAnimalDialogProps){
 const {open,onOpenChange,numeroImpreso,nombreImpreso,candidatos,fechaChequeo}=props;
 const {isLoading,hasRole}=useAuth(),allowed=!isLoading&&hasRole(['Administrador','Gerencia']);const flow=useReactivation();
 const [error,setError]=useState<string|null>(null),[selected,setSelected]=useState<string|null>(null);
 const [form,setForm,clearForm,restored]=useFormPersistence({key:'hato_reactivation_form',initialState:{motivo:''},enabled:open});
 const live=useRef({mounted:true,props}),origin=useRef<{key:string;row:object;date:string|null;number:string;name:string}|null>(null);
 useLayoutEffect(()=>{live.current={mounted:true,props};return()=>{live.current.mounted=false;};},[props]);
 useEffect(()=>{if(open){setSelected(candidatos.length===1?candidatos[0].id:null);void flow.run('status').catch(()=>{});}},[open]); // eslint-disable-line react-hooks/exhaustive-deps
 const a=flow.attempt,r=a?.result,b=r?.original,candidate=candidatos.find(c=>c.id===selected);
 const invoke=(mode:'prepare'|'post'|'status'|'resolve'|'new')=>{
  setError(null);let intent=null;
  try{if(mode==='prepare'){if(!candidate||!allowed)return;intent=reactivationIntent({version:1,animalId:candidate.id,observedCandidate:candidate,fechaChequeo,motivo:form.motivo.trim()});}}
  catch(e){setError(e instanceof Error?e.message:'Datos inválidos');return;}
  const context=props.rowContext;
  void flow.run(mode,intent).then(next=>{
   if(!live.current.mounted)return;
   if(mode==='prepare'&&next&&context&&context===live.current.props.rowContext)origin.current={key:next.key,row:context,date:fechaChequeo,number:numeroImpreso,name:nombreImpreso};
   if(mode==='new'){
    clearForm();const current=live.current.props;
    if(r?.state==='committed'&&a){
     if(origin.current?.key===a.key&&origin.current.row===current.rowContext&&origin.current.date===current.fechaChequeo&&origin.current.number===current.numeroImpreso&&origin.current.name===current.nombreImpreso)current.onReactivado({id:a.intent.animalId,numero:a.intent.observedCandidate.numero});
     else current.onVerificado?.();
    }
    current.onOpenChange(false);
   }
  }).catch(()=>{});
 };
 return <Dialog open={open} onOpenChange={value=>{if(!flow.busy)onOpenChange(value);}}><DialogContent size="sm"><DialogHeader><DialogTitle>Reactivar animal</DialogTitle></DialogHeader>
 <DialogBody className="space-y-4">
 {!allowed?<p>Requiere permisos de Administrador o Gerencia.</p>:<>
 {(flow.error||error)&&<p role="alert">{flow.error||error}</p>}
 {a?<><p>Intento original: {a.key}</p><p>Estado: {r?.state??'sin verificar'}</p><p>Animal: #{a.intent.observedCandidate.numero} {a.intent.observedCandidate.nombre??'Sin nombre'} · {a.intent.animalId}</p>
 <p>Estado anterior: {String(b?.animal.estado??a.intent.observedCandidate.estado)}</p><p>Fecha de reactivación: {r?.effectiveDate??'sin verificar'}</p><p>Chequeo: {a.intent.fechaChequeo??'sin fecha fijada'}</p><p>Motivo: {a.intent.motivo||'Sin motivo adicional'}</p>
 {b&&<p className="whitespace-pre-wrap">Notas anteriores: {String(b.animal.notas??'Sin notas')}</p>}
 {b&&r?.effectiveDate&&<p className="whitespace-pre-wrap">Notas después de reactivar: {construirNotaReactivacion({notasPrevias:b.animal.notas as string|null,estadoAnterior:String(b.animal.estado),fechaEstadoAnterior:b.animal.fecha_estado as string|null,fechaHoy:r.effectiveDate,fechaChequeo:a.intent.fechaChequeo,motivo:a.intent.motivo})}</p>}
 {r?.state==='pending'&&<p>Revise el animal y la fecha preparados. La caravana debe seguir libre. Se conservan sus eventos de venta/muerte y registros relacionados.</p>}
 {r?.state==='committed'&&<p>Reactivación registrada y comprobada.</p>}
 <p>Un intento recuperado actualiza la consulta del hato; revise la fila actual antes de aprobar el chequeo.</p>
 </>:<><p>La fila escrita a mano dice #{numeroImpreso} {nombreImpreso}.</p><Label>Elija el animal a reactivar</Label>
 {candidatos.map(c=><label key={c.id} className="block"><input type="radio" name="reactivar-candidato" checked={selected===c.id} onChange={()=>setSelected(c.id)}/> #{c.numero} {c.nombre??'Sin nombre'} · {c.estado} · {c.id}</label>)}
 <FormDraftBanner show={restored} variant="restored" onDiscard={clearForm}/><Label htmlFor="reactivar-motivo">Motivo (opcional)</Label><Textarea id="reactivar-motivo" maxLength={4000} value={form.motivo} onChange={e=>setForm({motivo:e.target.value})}/>
 <p>Se cambian solo estado, fecha de estado y notas. Una colisión con otra caravana activa debe resolverse reasignando la fila; no se cambia la identidad del animal.</p></>}
 </>}
 </DialogBody><DialogFooter><Button variant="outline" disabled={flow.busy} onClick={()=>onOpenChange(false)}>Cerrar</Button>
 {allowed&&<><Button variant="outline" disabled={flow.busy} onClick={()=>invoke('status')}>Verificar intento original</Button>
 {a&&(!r||['unknown','pending'].includes(r.state))&&<Button variant="outline" disabled={flow.busy} onClick={()=>invoke('resolve')}>Cancelar intento original</Button>}
 {r?.state==='pending'&&<Button disabled={flow.busy} onClick={()=>invoke('post')}>Confirmar reactivación preparada</Button>}
 {r&&['committed','canceled'].includes(r.state)&&<Button disabled={flow.busy} onClick={()=>invoke('new')}>Finalizar intento verificado</Button>}
 {!a&&<Button disabled={flow.busy||!!flow.error||!candidate} onClick={()=>invoke('prepare')}>Preparar reactivación</Button>}</>}
 </DialogFooter></DialogContent></Dialog>;
}
