// ARCHIVO: components/hato/components/PajillaUsoDialog.tsx
// DESCRIPCIÓN: Diálogo "Registrar uso de pajilla" (G2, S10) -- log
// append-only en `hato_pajillas_uso`. Solo pide fecha de uso y, si se
// conoce, la vaca servida (opcional -- mejor registrar el uso sin la vaca
// que no registrarlo, plan §6 Épica G). El stock puede estar en 0 o
// negativo: se muestra el chip de advertencia (`chipStockPajillas`) pero
// NUNCA se deshabilita el lote ni se bloquea el envío (G3).

import { useMemo, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EstadoChip } from './EstadoChip';
import { chipStockPajillas } from '@/utils/hatoUi';
import { ordenarPorValor } from '@/utils/ordenarAnimalesHato';
import type { PajillaConToro, AnimalPickerPajillas } from '../hooks/useHatoPajillas';
import { obtenerFechaHoy } from '@/utils/fechas';
import {usePajillaUse} from '../hooks/usePajillaUse';
import {useAuth} from '@/contexts/AuthContext';
import {useFormDraft} from '@/hooks/useFormDraft';
import {pajillaUseIntent} from '@/utils/hato/hatoPajillaUseProtocol';

function hoyISO(): string {
  return obtenerFechaHoy();
}

function PajillaUseEditor({
  open,
  onOpenChange,
  pajillas,
  animales,
  pajillaIdInicial,
  onGuardado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pajillas: PajillaConToro[];
  animales: AnimalPickerPajillas[];
  /** Preselecciona un lote cuando el diálogo se abre desde la acción "Registrar
   * uso" de una fila específica de la tabla; `null` cuando se abre desde el
   * botón general del encabezado (el usuario elige el lote). */
  pajillaIdInicial: string | null;
  onGuardado: () => void;
}) {
  const use=usePajillaUse(),guardando=use.busy;
  const [form,setForm]=useState(()=>({pajillaId:pajillaIdInicial??'',fechaUso:hoyISO(),animalId:'sin_vaca'}));
  const {pajillaId,fechaUso,animalId}=form;
  const setPajillaId=(value:string)=>setForm(v=>({...v,pajillaId:value}));
  const setFechaUso=(value:string)=>setForm(v=>({...v,fechaUso:value}));
  const setAnimalId=(value:string)=>setForm(v=>({...v,animalId:value}));
  const draft=useFormDraft('hato-pajilla-use',form,{enabled:open});
  const close=()=>{if(!guardando){if(!use.attempt)draft.clearDraft();onOpenChange(false);}};
  const restore=()=>{const d=draft.draftData;if(d&&typeof d.pajillaId==='string'&&typeof d.fechaUso==='string'&&typeof d.animalId==='string'){setForm({pajillaId:d.pajillaId,fechaUso:d.fechaUso,animalId:d.animalId});draft.acceptDraft();}};
  const action=async(mode:'post'|'status'|'resolve'|'new')=>{try{const a=await use.run(mode);if(mode==='new'){draft.clearDraft();if(use.attempt?.result?.state==='committed')onGuardado();onOpenChange(false);}else if(a?.result?.state==='committed')toast.success('Uso verificado. Finalice para cerrar.');}catch(e){toast.error(e instanceof Error?e.message:'Conserve el intento original.');}};
  const captured=use.attempt?.result,b=captured?.original;
  const pajillaSeleccionada = pajillas.find((p) => p.pajilla_id === pajillaId);
  const chipStock = pajillaSeleccionada ? chipStockPajillas(pajillaSeleccionada.cantidad_actual) : null;

  // Alfabético por nombre (T2, ronda agosto 2026) -- `useHatoPajillas` trae
  // los animales ordenados por `numero` (el orden que le sirve al fetch),
  // pero Martha ubica por nombre en un selector largo.
  const animalesOrdenados = useMemo(() => ordenarPorValor(animales, (a) => a.nombre, 'asc'), [animales]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pajillaId) {
      toast.error('Selecciona el lote de pajillas usado');
      return;
    }
    if (!fechaUso) {
      toast.error('La fecha de uso es obligatoria');
      return;
    }
    try{await use.run('prepare',pajillaUseIntent({version:1,pajillaId,fechaUso,animalId:animalId==='sin_vaca'?null:animalId}));}catch(e){toast.error(e instanceof Error?e.message:'Conserve el intento original.');}
  };

  return (
    <Dialog open={open} onOpenChange={(value)=>{if(!value)close();}}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Registrar uso de pajilla</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {draft.hasDraft&&!use.attempt&&<div role="status"><p>Hay un borrador de esta cuenta.</p><Button type="button" onClick={restore}>Restaurar borrador</Button><Button type="button" onClick={draft.discardDraft}>Descartar borrador</Button></div>}
            <Button type="button" disabled={guardando} onClick={()=>void action('status')}>Recuperar intento original</Button>
            {use.error&&<p role="alert">{use.error}</p>}
            {use.attempt&&<section aria-label="Revisión del uso de pajilla">
              <p>Intento: {use.attempt.key} · Estado: {captured?.state??'por verificar'}</p>
              {b&&<><p>Toro: {String(b.toro.nombre)} ({String(b.toro.id)})</p><p>Lote: {String(b.lot.id)} · {b.lot.activa?'activo':'inactivo'} · Toro {b.toro.activo?'activo':'inactivo'}</p><p>Fecha de uso: {use.attempt.intent.fechaUso}</p><p>Vaca: {b.graph?`${String(b.graph.animal.nombre??'Sin nombre')} (#${String(b.graph.animal.numero??'—')}) · ${use.attempt.intent.animalId}`:'Sin especificar'}</p><p>Stock capturado: {b.stock.cantidad_actual} → {b.stock.cantidad_actual-1}</p>{b.stock.cantidad_actual<=0&&<p role="status">Stock cero o negativo: solo advierte; no bloquea registrar el uso.</p>}<p>Se registra un uso de pajilla. No se crea un evento clínico. Revisión válida para: {captured?.effectiveDate}</p></>}
              <Button type="button" disabled={guardando||captured?.state!=='pending'} onClick={()=>void action('post')}>Confirmar uso revisado</Button>
              <Button type="button" disabled={guardando||['committed','canceled'].includes(captured?.state??'')} onClick={()=>void action('resolve')}>Cancelar intento original</Button>
              <Button type="button" disabled={guardando||!['committed','canceled'].includes(captured?.state??'')} onClick={()=>void action('new')}>Finalizar intento verificado</Button>
            </section>}
            <fieldset disabled={guardando||!!use.attempt||draft.hasDraft} className="contents">
            <div className="space-y-1.5">
              <Label htmlFor="uso-pajilla">Lote (toro)</Label>
              <Select value={pajillaId} onValueChange={setPajillaId}>
                <SelectTrigger id="uso-pajilla">
                  <SelectValue placeholder="Seleccionar lote..." />
                </SelectTrigger>
                <SelectContent>
                  {pajillas.map((p) => (
                    <SelectItem key={p.pajilla_id} value={p.pajilla_id}>
                      {p.toroNombre} — {p.cantidad_actual} disponibles
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {chipStock && (
                <div className="flex items-center gap-1.5 mt-1">
                  <EstadoChip chip={chipStock} />
                  <span className="text-xs text-amber-700">No bloquea registrar el uso.</span>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uso-fecha">Fecha de uso</Label>
              <Input id="uso-fecha" type="date" value={fechaUso} onChange={(e) => setFechaUso(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uso-animal">Vaca servida (opcional)</Label>
              <Select value={animalId} onValueChange={setAnimalId}>
                <SelectTrigger id="uso-animal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin_vaca">Sin especificar</SelectItem>
                  {animalesOrdenados.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.numero != null ? `#${a.numero}` : 'sin caravana'}
                      {a.numeroEsProvisional ? ' (provisional)' : ''}
                      {a.nombre ? ` — ${a.nombre}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Mejor registrar el uso sin la vaca que no registrarlo — si no se conoce, déjalo en "Sin especificar".
              </p>
            </div>
            </fieldset>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando||!!use.attempt||draft.hasDraft}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Preparar revisión
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PajillaUsoDialog(props:Parameters<typeof PajillaUseEditor>[0]){const {user}=useAuth();return <PajillaUseEditor key={`${user?.id??'none'}:${props.pajillaIdInicial??'all'}:${props.open?'open':'closed'}`} {...props}/>;}
