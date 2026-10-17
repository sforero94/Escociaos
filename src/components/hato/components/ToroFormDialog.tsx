import {useState,type FormEvent} from 'react';
import {toast} from 'sonner';
import {useAuth} from '@/contexts/AuthContext';
import {draftStorageKey,removeOwnedDraft} from '@/utils/draftStorage';
import {useFormDraft} from '@/hooks/useFormDraft';
import {catalogEditIntent,type CatalogEditIntent} from '@/utils/hato/hatoCatalogEditProtocol';
import {useCatalogEdit} from '../hooks/useCatalogEdit';
import {CatalogCreationDialog} from './CatalogCreationDialog';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogBody,DialogFooter} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import type {HatoToroRow} from '@/types/hato';
interface Props {open:boolean;onOpenChange:(v:boolean)=>void;toro:HatoToroRow|null;onGuardado:()=>void}
function Editor({toro,onOpenChange,onGuardado}:Props&{toro:HatoToroRow}){
 const edit=useCatalogEdit(),[observedBull]=useState(()=>({id:toro.id,nombre:toro.nombre,tipo:toro.tipo,raza:toro.raza,activo:toro.activo})),[form,setForm]=useState(()=>({nombre:toro.nombre,tipo:toro.tipo??'sin_especificar',raza:toro.raza??'',activo:toro.activo}));
 const [restored,setRestored]=useState<CatalogEditIntent['observedBull']|null>(null);
 const draft=useFormDraft('hato-bull-edit:'+toro.id,{observedBull:restored??observedBull,form}),attempt=edit.attempt,result=attempt?.result,after=result?.plan?.row,before=result?.original?.toros.find(t=>t.id===attempt?.intent.bullId);
 const intent=()=>catalogEditIntent({version:1,bullId:toro.id,observedBull:restored??observedBull,changes:{nombre:form.nombre.trim(),tipo:form.tipo==='sin_especificar'?null:form.tipo,raza:form.raza.trim()||null,activo:form.activo}});
 const action=async(mode:'post'|'status'|'resolve'|'new')=>{try{await edit.run(mode);if(mode==='new'){if(attempt?.intent.bullId===toro.id)draft.clearDraft();else if(attempt)removeOwnedDraft(draftStorageKey(attempt.owner,'hato-bull-edit:'+attempt.intent.bullId));if(result?.state==='committed')onGuardado();onOpenChange(false);}}catch(e){toast.error(e instanceof Error?e.message:'Conserve y verifique la edición original.');}};
 const close=()=>{if(!edit.busy){if(!attempt)draft.clearDraft();onOpenChange(false);}};
 const submit=async(e:FormEvent)=>{e.preventDefault();try{await edit.run('prepare',intent());}catch(e){toast.error(e instanceof Error?e.message:'Conserve la edición original.');}};
 const restore=()=>{try{const d=draft.draftData;if(!d)return;catalogEditIntent({version:1,bullId:toro.id,observedBull:d.observedBull,changes:{nombre:d.form.nombre.trim(),tipo:d.form.tipo==='sin_especificar'?null:d.form.tipo,raza:d.form.raza.trim()||null,activo:d.form.activo}});setRestored(d.observedBull);setForm(d.form);draft.acceptDraft();}catch{toast.error('Revise el borrador original.');}};
 return <Dialog open onOpenChange={v=>{if(!v)close();}}><DialogContent size="sm"><form onSubmit={submit} className="flex flex-col flex-1 min-h-0 gap-4"><DialogHeader><DialogTitle>Editar toro</DialogTitle></DialogHeader><DialogBody className="space-y-4">
 {draft.hasDraft&&!attempt&&<div><p>Hay un borrador de esta cuenta.</p><Button type="button" onClick={restore}>Restaurar borrador</Button><Button type="button" onClick={draft.discardDraft}>Descartar borrador</Button></div>}
 <Button type="button" disabled={edit.busy} onClick={()=>void action('status')}>Recuperar edición original</Button>{edit.error&&<p role="alert">{edit.error}</p>}
 {attempt&&<section aria-label="Revisión de edición"><p>Intento: {attempt.key} · Estado: {result?.state??'por verificar'} · Toro: {attempt.intent.bullId}</p>{after&&before&&<><p>Nombre: {String(before.nombre)} → {String(after.nombre)}</p><p>Tipo: {String(before.tipo??'Sin especificar')} → {String(after.tipo??'Sin especificar')}</p><p>Raza: {String(before.raza??'Sin registrar')} → {String(after.raza??'Sin registrar')}</p><p>Activo: {String(before.activo)} → {String(after.activo)}</p><p>Cuenta que edita: {attempt.owner} · Revisión válida para: {result?.effectiveDate}</p><p>Se conserva el registro de creación y toda la historia vinculada.</p></>}
 <Button type="button" disabled={edit.busy||result?.state!=='pending'} onClick={()=>void action('post')}>Confirmar edición revisada</Button><Button type="button" disabled={edit.busy||['committed','canceled'].includes(result?.state??'')} onClick={()=>void action('resolve')}>Cancelar intento original</Button><Button type="button" disabled={edit.busy||!['committed','canceled'].includes(result?.state??'')} onClick={()=>void action('new')}>Finalizar edición verificada</Button></section>}
 <fieldset disabled={edit.busy||!!attempt||draft.hasDraft} className="contents"><Label htmlFor="toro-nombre">Nombre</Label><Input id="toro-nombre" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/><Label htmlFor="toro-tipo">Tipo de servicio</Label><Select value={form.tipo} onValueChange={v=>setForm(f=>({...f,tipo:v as typeof f.tipo}))}><SelectTrigger id="toro-tipo"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="sin_especificar">Sin especificar</SelectItem><SelectItem value="monta">Monta</SelectItem><SelectItem value="inseminacion">Inseminación</SelectItem></SelectContent></Select>
 <Label htmlFor="toro-raza">Raza</Label><Input id="toro-raza" value={form.raza} onChange={e=>setForm(f=>({...f,raza:e.target.value}))}/><Label htmlFor="toro-activo">Activo</Label><Switch id="toro-activo" checked={form.activo} onCheckedChange={v=>setForm(f=>({...f,activo:v}))}/></fieldset>
 </DialogBody><DialogFooter><Button type="button" variant="outline" disabled={edit.busy} onClick={close}>Cerrar</Button><Button type="submit" disabled={edit.busy||!!attempt||draft.hasDraft}>Revisar edición</Button></DialogFooter></form></DialogContent></Dialog>;
}
export function ToroFormDialog(props:Props){const {user,hasRole}=useAuth();if(!props.toro)return <CatalogCreationDialog open={props.open} kind="toro" toros={[]} onOpenChange={props.onOpenChange} onGuardado={props.onGuardado}/>;if(!props.open||!user||!hasRole(['Administrador','Gerencia']))return null;return <Editor key={`${user.id}:${props.toro.id}`} {...props} toro={props.toro}/>;}
