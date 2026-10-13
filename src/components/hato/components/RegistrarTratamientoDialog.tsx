// ARCHIVO: components/hato/components/RegistrarTratamientoDialog.tsx
// DESCRIPCIÓN: Diálogo "Registrar tratamiento" de la card Tratamientos
// (Hoja de Vida). Usa el protocolo revisado `fn_hato_treatment_create_web`.
//
// DECISIONES DEL DUEÑO (2026-09-09) QUE ESTE FORMULARIO EJECUTA
// ------------------------------------------------------------
// - Un tratamiento = una aplicación + una próxima fecha OPCIONAL. No es un
//   protocolo de N pasos.
// - El nombre es texto libre. `hato_protocolos` sigue vacío a propósito.
// - Dosis, quién aplicó y retiro de leche NO son campos: van en la nota,
//   texto libre, mientras se aprende qué se repite. Por eso la etiqueta de
//   la nota nombra esos tres ejemplos -- si nadie los sugiere, nadie los
//   escribe, y entonces nunca se sabría cuáles merecen ser columna.
// - El tratamiento NO entra a la línea de tiempo de eventos.
//
// La próxima fecha es lo único que enciende la alerta `tratamiento_paso`
// del motor (056/S6), que existe desde julio de 2026 y nunca disparó porque
// no había un solo paso que recordar. El texto de ayuda lo dice, para que
// dejarla vacía sea una decisión y no un descuido.

import { useEffect, useState, useRef, useLayoutEffect, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {useAuth} from '@/contexts/AuthContext';
import {pendingBrowserTreatment,treatmentCanonical} from '@/utils/hato/hatoTreatmentBrowserAttempt';
import {canonicalTreatmentProposal,type JsonRow,type TreatmentProposal} from '@/utils/hato/hatoTreatmentCreation';
import { obtenerFechaHoy } from '@/utils/fechas';
import type {
  InputRegistrarTratamiento,
  ResultadoRegistrarTratamiento,
} from '../hooks/useRegistrarTratamientoHato';

export function RegistrarTratamientoDialog({
  open,
  onOpenChange,
  animalId,
  originalAnimal,
  animalEtiqueta,
  registrar,
  guardando,
  onGuardado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  originalAnimal: JsonRow;
  /** "MOCA (#177)" -- para que el título diga sobre cuál vaca se escribe. */
  animalEtiqueta: string;
  registrar: (input: InputRegistrarTratamiento,mode?:'post'|'retry'|'status'|'resolve'|'new',current?:()=>boolean) => Promise<ResultadoRegistrarTratamiento>;
  guardando: boolean;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [fechaInicio, setFechaInicio] = useState(obtenerFechaHoy());
  const [nota, setNota] = useState('');
  const [fechaProximoPaso, setFechaProximoPaso] = useState('');
  const [descripcionPaso, setDescripcionPaso] = useState('');

  const {user}=useAuth();const owner=user?.id;
  const identity=`${open}:${owner}:${animalId}`;const life=useRef({identity,n:0,mounted:true});
  const [original,setOriginal]=useState<JsonRow|null>(null);
  const [loadedGeneration,setLoadedGeneration]=useState(-1);
  const [pending,setPending]=useState(false);const [pendingPayload,setPendingPayload]=useState<TreatmentProposal|null>(null);const [message,setMessage]=useState('');
  const revision=useRef(0);const latest=useRef(originalAnimal);
  useLayoutEffect(()=>{latest.current=originalAnimal;},[originalAnimal]);
  const draftKey=owner?`hato_treatment_draft_v1:${owner}:${animalId}`:null;
  useLayoutEffect(()=>{life.current={identity,n:life.current.n+1,mounted:true};return()=>{life.current.mounted=false;life.current.n++;};},[identity]);
  useLayoutEffect(()=>{
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore the owned external storage snapshot on dialog/session changes.
    if(!open)return;revision.current++;setMessage('');
    let a=null;try{a=owner?pendingBrowserTreatment(owner,animalId):null;setPending(!!a);setPendingPayload(a?.payload??null);}catch(error){setMessage(String(error));setPending(true);}
    let draft:InputRegistrarTratamiento|null=null;
    try{const raw=draftKey?localStorage.getItem(draftKey):null;if(raw){const d=JSON.parse(raw) as InputRegistrarTratamiento;if(d.animalId===animalId&&d.observedAnimal?.id===animalId&&typeof d.nombre==='string'&&typeof d.fechaInicio==='string'&&[d.nota,d.fechaProximoPaso,d.descripcionPaso].every(v=>v===null||typeof v==='string'))draft=d;}}catch{setMessage('No se pudo recuperar el borrador original.');}
    const p=draft??a?.payload;
    setNombre(p?.nombre??'');setFechaInicio(p?.fechaInicio??obtenerFechaHoy());setNota(p?.nota??'');setFechaProximoPaso(p?.fechaProximoPaso??'');setDescripcionPaso(p?.descripcionPaso??'');
    setOriginal(JSON.parse(JSON.stringify(p?.observedAnimal??latest.current)) as JsonRow);setLoadedGeneration(life.current.n);
  },[open,owner,animalId,draftKey]);
  useEffect(()=>{
    if(!open||!draftKey||!original||loadedGeneration!==life.current.n)return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Surface failure from the external durable-storage write.
    try{localStorage.setItem(draftKey,JSON.stringify({animalId,nombre,fechaInicio,nota:nota||null,fechaProximoPaso:fechaProximoPaso||null,descripcionPaso:descripcionPaso||null,observedAnimal:original}));}catch{setMessage('No se pudo conservar el borrador. No cierre el formulario.');}
  },[open,draftKey,animalId,nombre,fechaInicio,nota,fechaProximoPaso,descripcionPaso,original,loadedGeneration]);
  const input=():InputRegistrarTratamiento=>({animalId,nombre:nombre.trim(),fechaInicio,nota:nota.trim()||null,fechaProximoPaso:fechaProximoPaso||null,descripcionPaso:descripcionPaso.trim()||null,observedAnimal:original!});
  const edit=()=>{revision.current++;};
  async function perform(mode:'post'|'retry'|'status'|'resolve'|'new'){
    if(!original)return;const n=life.current.n,r=revision.current;const sent=input();
    const current=()=>life.current.mounted&&life.current.n===n&&life.current.identity===identity&&open;
    const outcome=await registrar(sent,mode,current);if(!current())return;
    try{const a=owner?pendingBrowserTreatment(owner,animalId):null;setPending(!!a);setPendingPayload(a?.payload??null);}catch{setPending(true);}
    if(outcome.error){toast.error(outcome.error);setMessage(outcome.error);return;}
    let sameProposal=false;try{sameProposal=!!outcome.result&&treatmentCanonical(canonicalTreatmentProposal({version:1,...sent}))===treatmentCanonical(outcome.result.payload);}catch{/* Later incomplete edits remain an unsent draft. */}
    if(mode==='new'){
      if(revision.current!==r)return;
      if(!sameProposal){setMessage('El intento anterior quedó resuelto. Revise los cambios conservados antes de guardarlos.');return;}
      setOriginal(JSON.parse(JSON.stringify(latest.current)) as JsonRow);setNombre('');setNota('');setFechaInicio(obtenerFechaHoy());setFechaProximoPaso('');setDescripcionPaso('');setMessage('Revise el animal y complete un tratamiento nuevo.');revision.current++;return;
    }
    const state=outcome.result?.state;
    setMessage(state==='committed'?'El intento original quedó registrado.':state==='canceled'?'El intento original fue cancelado.':state==='pending'?'El intento original está pendiente. Puede reintentar o cancelarlo.':'El intento original aún no se registró. Puede reintentar o cancelarlo.');
    if(state!=='committed')return;
    onGuardado();
    if(revision.current!==r||treatmentCanonical(input())!==treatmentCanonical(sent)||!sameProposal)return;
    toast.success(sent.fechaProximoPaso?'Tratamiento registrado. Llegará un recordatorio por Telegram el día del próximo paso.':'Tratamiento registrado');
    try{if(draftKey)localStorage.removeItem(draftKey);}catch{setMessage('El tratamiento está registrado. No se pudo limpiar el borrador local.');return;}onOpenChange(false);
  }

  const proximaFechaInvalida = fechaProximoPaso !== '' && fechaProximoPaso < fechaInicio;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error('Escribe qué se aplicó');
      return;
    }
    if (!fechaInicio) {
      toast.error('La fecha es obligatoria');
      return;
    }
    if (proximaFechaInvalida) {
      toast.error('La próxima fecha no puede ser anterior a la fecha del tratamiento');
      return;
    }

    await perform('post');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Registrar tratamiento — {String(original?.nombre??(original?.numero!=null?`#${original.numero}`:animalEtiqueta))}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {message&&<p role="status">{message}</p>}
            {pending&&<div className="flex flex-wrap gap-2">
              {pendingPayload&&<p>Intento original: {pendingPayload.nombre} · {pendingPayload.fechaInicio}{pendingPayload.fechaProximoPaso?` · Seguimiento: ${pendingPayload.fechaProximoPaso}`:''}{pendingPayload.nota?` · ${pendingPayload.nota}`:''}{pendingPayload.descripcionPaso?` · ${pendingPayload.descripcionPaso}`:''}</p>}
              <Button type="button" disabled={guardando} onClick={()=>perform('retry')}>Reintentar intento original</Button>
              <Button type="button" disabled={guardando} onClick={()=>perform('status')}>Verificar intento original</Button>
              <Button type="button" disabled={guardando} onClick={()=>perform('resolve')}>Cancelar intento original</Button>
              <Button type="button" disabled={guardando} onClick={()=>perform('new')}>Preparar otro tratamiento</Button>
            </div>}
            <div className="space-y-1.5">
              <Label htmlFor="ttto-nombre">¿Qué se aplicó?</Label>
              <Input
                id="ttto-nombre"
                value={nombre}
                onChange={(e) => {edit();setNombre(e.target.value);}}
                placeholder="Ej: Estrumate"
                maxLength={120}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ttto-fecha">Fecha</Label>
              <Input
                id="ttto-fecha"
                type="date"
                value={fechaInicio}
                onChange={(e) => {edit();setFechaInicio(e.target.value);}}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ttto-nota">Detalle (opcional)</Label>
              <Textarea
                id="ttto-nota"
                value={nota}
                onChange={(e) => {edit();setNota(e.target.value);}}
                rows={3}
                placeholder="Dosis, quién aplicó, días de retiro de la leche, lo que sea útil."
              />
            </div>

            <div className="rounded-lg border border-gray-200 p-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ttto-proximo">Próxima fecha (opcional)</Label>
                <Input
                  id="ttto-proximo"
                  type="date"
                  value={fechaProximoPaso}
                  min={fechaInicio || undefined}
                  onChange={(e) => {edit();setFechaProximoPaso(e.target.value);}}
                />
                <p className="text-xs text-gray-500">
                  Si la dejas vacía, el tratamiento queda como completado y nadie recibe aviso. Con
                  fecha, ese día llega un recordatorio por Telegram y se puede marcar como hecho
                  desde ahí.
                </p>
                {proximaFechaInvalida && (
                  <p className="text-xs text-red-600">
                    La próxima fecha es anterior a la fecha del tratamiento.
                  </p>
                )}
              </div>

              {fechaProximoPaso && (
                <div className="space-y-1.5">
                  <Label htmlFor="ttto-paso-desc">¿Qué toca hacer ese día? (opcional)</Label>
                  <Input
                    id="ttto-paso-desc"
                    value={descripcionPaso}
                    onChange={(e) => {edit();setDescripcionPaso(e.target.value);}}
                    placeholder="Ej: segunda dosis"
                    maxLength={120}
                  />
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando||!original}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
