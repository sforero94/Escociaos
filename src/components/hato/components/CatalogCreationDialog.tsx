import {useState,type FormEvent} from 'react';
import {toast} from 'sonner';
import {useAuth} from '@/contexts/AuthContext';
import {useFormDraft} from '@/hooks/useFormDraft';
import {draftStorageKey,removeOwnedDraft} from '@/utils/draftStorage';
import {catalogCreationIntent,type CatalogCreationIntent} from '@/utils/hato/hatoCatalogCreationProtocol';
import {useCatalogCreation} from '../hooks/useCatalogCreation';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogBody,DialogFooter} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {NumberInput} from '@/components/ui/number-input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Switch} from '@/components/ui/switch';
import type {HatoToroRow} from '@/types/hato';
interface Props {open:boolean;kind:'lot'|'toro';toros:HatoToroRow[];onOpenChange:(open:boolean)=>void;onGuardado:()=>void}
interface Form {toroId:string;cantidad:number|undefined;nombre:string;tipo:string;raza:string;activo:boolean}
const initial:Form={toroId:'',cantidad:undefined,nombre:'',tipo:'sin_especificar',raza:'',activo:true};
function intent(kind:Props['kind'],f:Form):CatalogCreationIntent{return catalogCreationIntent(kind==='lot'?{version:1,kind,input:{toro_id:f.toroId,cantidad_inicial:f.cantidad}}:{version:1,kind,input:{nombre:f.nombre.trim(),tipo:f.tipo==='sin_especificar'?null:f.tipo,raza:f.raza.trim()||null,activo:f.activo}});}
function CatalogEditor({open,kind,toros,onOpenChange,onGuardado}:Props){
 const creation=useCatalogCreation(),{user}=useAuth(),[form,setForm]=useState<Form>(initial),draft=useFormDraft('hato-catalog-creation:'+kind,form,{enabled:open});
 const attempt=creation.attempt,captured=attempt?.result,plan=captured?.plan?.row;
 const selectedBull=attempt?.intent.kind==='lot'?attempt.intent.input.toro_id:null,originalBull=captured?.original?.toros.find(t=>t.id===selectedBull);
 const capturedKind=attempt?.intent.kind??kind,busy=creation.busy;
 const change=<K extends keyof Form>(key:K,value:Form[K])=>setForm(f=>({...f,[key]:value}));
 const close=()=>{if(!busy){if(!attempt)draft.clearDraft();onOpenChange(false);}};
 const restore=()=>{const d=draft.draftData;if(!d)return;try{intent(kind,d);setForm(d);draft.acceptDraft();}catch{toast.error('Revise el borrador original antes de continuar.');}};
 const action=async(mode:'post'|'status'|'resolve'|'new')=>{try{await creation.run(mode);if(mode==='new'){
  if(attempt?.intent.kind===kind){draft.clearDraft();onOpenChange(false);}else if(user&&attempt)removeOwnedDraft(draftStorageKey(user.id,'hato-catalog-creation:'+attempt.intent.kind));
  if(captured?.state==='committed')onGuardado();
 }}catch(e){toast.error(e instanceof Error?e.message:'Conserve el intento original.');}};
 const submit=async(e:FormEvent)=>{e.preventDefault();try{await creation.run('prepare',intent(kind,form));}catch(e){toast.error(e instanceof Error?e.message:'Conserve y verifique el intento original.');}};
 return <Dialog open={open} onOpenChange={value=>{if(!value)close();}}><DialogContent size="sm"><form onSubmit={submit} className="flex flex-col flex-1 min-h-0 gap-4">
  <DialogHeader><DialogTitle>{capturedKind==='lot'?'Registrar compra de pajillas':'Nuevo toro'}</DialogTitle></DialogHeader>
  <DialogBody className="space-y-4">
   {draft.hasDraft&&!attempt&&<div role="status"><p>Hay un borrador de esta cuenta.</p><Button type="button" onClick={restore}>Restaurar borrador</Button><Button type="button" onClick={draft.discardDraft}>Descartar borrador</Button></div>}
   <Button type="button" disabled={busy} onClick={()=>void action('status')}>Recuperar creación original</Button>
   {creation.error&&<p role="alert">{creation.error}</p>}
   {attempt&&<section aria-label="Revisión de creación"><p>Intento: {attempt.key} · Estado: {captured?.state??'por verificar'}</p>
    {plan&&<><p>{capturedKind==='lot'?'Lote reservado':'Toro reservado'}: {String(plan.id)}</p>
     {capturedKind==='lot'?<><p>Toro: {String(originalBull?.nombre)} · {String(originalBull?.id)}</p><p>Tipo: {String(originalBull?.tipo??'Sin especificar')} · Raza: {String(originalBull?.raza??'Sin registrar')} · {originalBull?.activo?'activo':'inactivo'}</p><p>Cantidad inicial: {String(plan.cantidad_inicial)} · Lote: {plan.activa?'activo':'inactivo'}</p><p>Usos iniciales: 0 · Stock inicial: {String(plan.cantidad_inicial)}</p><p>Se crea únicamente el lote de inventario, sin registrar un gasto o evento clínico.</p></>:<><p>Nombre: {String(plan.nombre)}</p><p>Tipo: {String(plan.tipo??'Sin especificar')} · Raza: {String(plan.raza??'Sin registrar')} · {plan.activo?'activo':'inactivo'}</p><p>Se crea únicamente este toro del catálogo.</p></>}
     <p>Cuenta registradora: {String(plan.created_by)} · Revisión válida para: {captured?.effectiveDate}</p></>}
    <Button type="button" disabled={busy||captured?.state!=='pending'} onClick={()=>void action('post')}>Confirmar creación revisada</Button>
    <Button type="button" disabled={busy||['committed','canceled'].includes(captured?.state??'')} onClick={()=>void action('resolve')}>Cancelar intento original</Button>
    <Button type="button" disabled={busy||!['committed','canceled'].includes(captured?.state??'')} onClick={()=>void action('new')}>Finalizar creación verificada</Button>
   </section>}
   <fieldset disabled={busy||!!attempt||draft.hasDraft} className="contents">
    {kind==='lot'?<><Label htmlFor="compra-toro">Toro</Label><Select value={form.toroId} onValueChange={v=>change('toroId',v)}><SelectTrigger id="compra-toro"><SelectValue placeholder="Seleccionar toro..."/></SelectTrigger><SelectContent>{toros.filter(t=>t.activo).map(t=><SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}</SelectContent></Select>
     {toros.filter(t=>t.activo).length===0&&<p>No hay toros activos en el catálogo — crea uno primero.</p>}
     <Label htmlFor="compra-cantidad">Cantidad inicial</Label><NumberInput id="compra-cantidad" value={form.cantidad} onChange={v=>change('cantidad',v)} decimals={0}/></>:<>
     <Label htmlFor="toro-nombre">Nombre</Label><Input id="toro-nombre" value={form.nombre} onChange={e=>change('nombre',e.target.value)}/>
     <Label htmlFor="toro-tipo">Tipo de servicio</Label><Select value={form.tipo} onValueChange={v=>change('tipo',v)}><SelectTrigger id="toro-tipo"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="sin_especificar">Sin especificar</SelectItem><SelectItem value="monta">Monta</SelectItem><SelectItem value="inseminacion">Inseminación</SelectItem></SelectContent></Select>
     <Label htmlFor="toro-raza">Raza</Label><Input id="toro-raza" value={form.raza} onChange={e=>change('raza',e.target.value)}/><Label htmlFor="toro-activo">Activo</Label><Switch id="toro-activo" checked={form.activo} onCheckedChange={v=>change('activo',v)}/>
    </>}
   </fieldset>
  </DialogBody><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={close}>Cerrar</Button><Button type="submit" disabled={busy||!!attempt||draft.hasDraft}>Revisar creación</Button></DialogFooter>
 </form></DialogContent></Dialog>;
}
export function CatalogCreationDialog(props:Props){const {user,hasRole}=useAuth();if(!props.open||!user||!hasRole(['Administrador','Gerencia']))return null;return <CatalogEditor key={`${user.id}:${props.kind}`} {...props}/>;}
