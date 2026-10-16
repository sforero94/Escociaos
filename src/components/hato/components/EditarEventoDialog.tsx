import { useState, type FormEvent } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {useAuth} from '@/contexts/AuthContext';
import {useFormDraft} from '@/hooks/useFormDraft';
import {eventCorrectionIntent} from '@/utils/hato/hatoEventCorrectionProtocol';
import type {JsonRow} from '@/utils/hato/alertResponseProtocol';
import {pendingEventCorrectionBrowser} from '@/utils/hato/hatoEventCorrectionBrowserAttempt';
import {useEventCorrection} from '../hooks/useEventCorrection';
import { formatShortDate } from '@/utils/format';
import type { ConfianzaFecha, CriaDestino, HatoEventoRow, TipoEventoHato, TipoServicioHato } from '@/types/hato';

const DESTINOS: { value: CriaDestino; label: string }[] = [
  { value: 'retenida', label: 'Cría retenida' },
  { value: 'hembra_vendida', label: 'Hembra vendida' },
  { value: 'macho_vendido', label: 'Macho vendido' },
  { value: 'muerta', label: 'Cría muerta' },
  { value: 'aborto', label: 'Aborto' },
];

const TIPOS_SERVICIO: { value: TipoServicioHato; label: string }[] = [
  { value: 'monta', label: 'Monta' },
  { value: 'inseminacion', label: 'Inseminación' },
];

const LABEL_TIPO_EVENTO: Record<TipoEventoHato, string> = {
  servicio: 'servicio',
  celo: 'celo (retorno)',
  confirmacion_prenez: 'confirmación de preñez',
  parto: 'parto',
  aborto: 'aborto',
  secado_real: 'secado real',
  venta: 'venta',
  muerte: 'muerte',
  compra: 'compra',
  cambio_etapa: 'cambio de etapa',
  rechequeo: 'rechequeo',
};

function notaDesdeDatos(datos: Record<string, unknown> | null): string {
  const nota = datos?.nota;
  return typeof nota === 'string' ? nota : '';
}

export interface EditarEventoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evento: HatoEventoRow | null;
  /** Fecha del chequeo que originó `evento.chequeo_vaca_id`, ya resuelta
   * por el caller (mapa `chequeo_vaca_id -> hato_chequeos.fecha` construido
   * desde `detalle.chequeos`, sin una query nueva) -- `null` si no se pudo
   * resolver (evento manual, o el mapa no lo cubre). */
  chequeoFecha: string | null;
  nombresToroPorId: Record<string, string>;
  /** Se llama tras un guardado/eliminado exitoso, antes de cerrar el
   * diálogo -- el caller decide cómo refrescar. */
  onGuardado: () => void;
}

function EventEditor({open,onOpenChange,evento:initial,nombresToroPorId,onGuardado}: EditarEventoDialogProps & {evento:HatoEventoRow}) {
  const edit=useEventCorrection(initial.id), {hasRole}=useAuth();
  const guardando=edit.busy;
  const [evento,setEvento]=useState(()=>structuredClone(initial));
  const [fecha,setFecha]=useState(evento.fecha);
  const [fechaConfianza,setFechaConfianza]=useState<ConfianzaFecha>(evento.fecha_confianza);
  const [tipoServicio,setTipoServicio]=useState<TipoServicioHato|''>(evento.tipo_servicio??'');
  const [toroId,setToroId]=useState(evento.toro_id??'');
  const [criaDestino,setCriaDestino]=useState<CriaDestino|''>(evento.cria_destino??'');
  const [nota,setNota]=useState(notaDesdeDatos(evento.datos));
  const [motivo,setMotivo]=useState('');
  const form={fecha,fechaConfianza,tipoServicio,toroId,criaDestino,nota,motivo};
  const draft=useFormDraft('hato-event-correction:'+evento.id,{form,observed:evento},{enabled:open});
  const esServicio=evento.tipo==='servicio',esParto=evento.tipo==='parto';
  let unsupported=false;
  try {eventCorrectionIntent({version:1,eventId:evento.id,mode:'delete',observedEvent:evento,changes:null});}catch{unsupported=true;}
  const prepare=async(mode:'edit'|'delete')=>{
    try {await edit.run('prepare',eventCorrectionIntent({version:1,eventId:evento.id,mode,observedEvent:evento as unknown as JsonRow,changes:mode==='delete'?null:{fecha,fecha_confianza:fechaConfianza,tipo_servicio:esServicio?tipoServicio||null:evento.tipo_servicio,toro_id:esServicio?toroId||null:evento.toro_id,cria_destino:esParto?criaDestino||null:evento.cria_destino,nota:nota.trim(),motivo:motivo.trim()}}));}
    catch(e){toast.error(e instanceof Error?e.message:'Conserve el intento original.');}
  };
  const handleSubmit=(e:FormEvent)=>{e.preventDefault();void prepare('edit');};
  const action=async(mode:'post'|'status'|'resolve'|'new')=>{
    try {const a=await edit.run(mode);if(mode==='new'){draft.clearDraft();if(edit.attempt?.result?.state==='committed')onGuardado();onOpenChange(false);}else if(a?.result?.state==='committed')toast.success('Corrección verificada. Finalice para cerrar.');}
    catch(e){toast.error(e instanceof Error?e.message:'Conserve el intento original.');}
  };
  const captured=edit.attempt?.result,original=captured?.original;
  const check=original?.graph.checks.find(c=>c.id===original.event.chequeo_vaca_id);
  const header=original?.graph.checkHeaders.find(h=>h.id===check?.chequeo_id);
  const avisoCaducidad=(original?.event??evento).chequeo_vaca_id!=null
    ?`Este evento viene de un chequeo${typeof header?.fecha==='string'?` del ${formatShortDate(header.fecha)}`:''}. Si se vuelve a aprobar ese chequeo, esta corrección se pierde. El camino permanente es corregir la planilla y re-subirla.`:null;
  const display=(v:unknown)=>v===null||v===undefined?'Sin registrar':typeof v==='object'?JSON.stringify(v):String(v);
  const close=()=>{if(!guardando){if(!edit.attempt)draft.clearDraft();onOpenChange(false);}};
  return (
    <>
      <Dialog open={open} onOpenChange={value=>{if(!value)close();}}>
        {/* `md`, no `sm`: aviso de caducidad + fecha/confianza + (servicio:
            tipo+toro, o parto: destino) + nota + motivo + el pie con
            "Eliminar evento" no cabían en `sm` (384px de alto) sin dejar el
            último campo pegado al pie (auditoría de UI). */}
        <DialogContent size="md">
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
            <DialogHeader>
              <DialogTitle>Corregir {LABEL_TIPO_EVENTO[evento.tipo] ?? evento.tipo}</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-4">
              {avisoCaducidad && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">{avisoCaducidad}</p>
                </div>
              )}

              {unsupported&&<p role="alert">Este evento tiene un ciclo o vínculo que requiere una corrección coordinada. No se permite corregirlo o eliminarlo desde este diálogo. No se modifica su historia.</p>}
              {draft.hasDraft&&!edit.attempt&&<div role="status"><p>Hay una corrección guardada de esta cuenta.</p><Button type="button" onClick={()=>{const d=draft.draftData;if(d){setEvento(d.observed);setFecha(d.form.fecha);setFechaConfianza(d.form.fechaConfianza);setTipoServicio(d.form.tipoServicio);setToroId(d.form.toroId);setCriaDestino(d.form.criaDestino);setNota(d.form.nota);setMotivo(d.form.motivo);draft.acceptDraft();}}}>Restaurar borrador</Button><Button type="button" onClick={draft.discardDraft}>Descartar borrador</Button></div>}
              <Button type="button" disabled={guardando} onClick={()=>void action('status')}>Recuperar intento original</Button>
              {edit.error&&<p role="alert">{edit.error}</p>}
              {edit.attempt&&<section aria-label="Revisión de corrección">
                <p>Animal capturado: #{display(original?.graph.animal.numero)} {display(original?.graph.animal.nombre)} · {display(original?.event.animal_id)}</p>
                <p>Evento capturado: {display(original?.event.tipo)} · {display(original?.event.id)}. Intento: {edit.attempt.key}</p>
                <p>Revisión válida para: {captured?.effectiveDate??'por verificar'}. Estado: {captured?.state??'por verificar'}.</p>
                {original&&<><p>{edit.attempt.intent.mode==='delete'?'Se eliminará únicamente este evento. Su traza de corrección queda registrada.':'Cambios revisados:'}</p>
                  {(['fecha','fecha_confianza','tipo_servicio','toro_id','cria_destino','datos'] as const).map(field=><p key={field}>{({fecha:'Fecha',fecha_confianza:'Confianza',tipo_servicio:'Servicio',toro_id:'Toro',cria_destino:'Destino',datos:'Nota, motivo y datos conservados'})[field]}: {display(original.event[field])} → {captured?.plan?.event?display(captured.plan.event[field]):'Eliminar'}</p>)}
                  {original.toro&&<p>Toro seleccionado capturado: {display(original.toro.nombre)} · {display(original.toro.id)}</p>}
                  <p>La identidad, origen y creador del evento y la planilla original se conservan. La eliminación requiere Gerencia vigente.</p></>}
                <Button type="button" disabled={guardando||captured?.state!=='pending'} onClick={()=>void action('post')}>{edit.attempt.intent.mode==='delete'?'Confirmar eliminación revisada':'Confirmar corrección revisada'}</Button>
                <Button type="button" disabled={guardando||!['pending','unknown'].includes(captured?.state??'unknown')} onClick={()=>void action('resolve')}>Cancelar intento original</Button>
                <Button type="button" disabled={guardando||!['committed','canceled'].includes(captured?.state??'')} onClick={()=>void action('new')}>Finalizar intento verificado</Button>
              </section>}
              <fieldset disabled={guardando||!!edit.attempt||draft.hasDraft||unsupported} className="contents">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="editar-evento-fecha">Fecha</Label>
                  <Input
                    id="editar-evento-fecha"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="editar-evento-confianza">Confianza de la fecha</Label>
                  <Select value={fechaConfianza} onValueChange={(v) => setFechaConfianza(v as ConfianzaFecha)}>
                    <SelectTrigger id="editar-evento-confianza">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exacta">Exacta</SelectItem>
                      <SelectItem value="aproximada">Aproximada</SelectItem>
                      <SelectItem value="desconocida">Desconocida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {esServicio && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="editar-evento-tipo-servicio">Tipo de servicio</Label>
                    <Select
                      value={tipoServicio || undefined}
                      onValueChange={(v) => setTipoServicio(v as TipoServicioHato)}
                    >
                      <SelectTrigger id="editar-evento-tipo-servicio">
                        <SelectValue placeholder="Sin especificar" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_SERVICIO.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="editar-evento-toro">Toro</Label>
                    <Select value={toroId || undefined} onValueChange={setToroId}>
                      <SelectTrigger id="editar-evento-toro">
                        <SelectValue placeholder="Sin especificar" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(nombresToroPorId).map(([id, nombre]) => (
                          <SelectItem key={id} value={id}>{nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {esParto && (
                <div className="space-y-1.5">
                  <Label htmlFor="editar-evento-destino">Destino de la cría</Label>
                  <Select value={criaDestino || undefined} onValueChange={(v) => setCriaDestino(v as CriaDestino)}>
                    <SelectTrigger id="editar-evento-destino">
                      <SelectValue placeholder="Sin especificar" />
                    </SelectTrigger>
                    <SelectContent>
                      {DESTINOS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="editar-evento-nota">Nota (opcional)</Label>
                <Textarea id="editar-evento-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editar-evento-motivo">Motivo de la corrección (opcional)</Label>
                <Textarea
                  id="editar-evento-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="¿Por qué se corrige este dato?"
                  rows={2}
                />
              </div>
              </fieldset>
            </DialogBody>
            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => void prepare('delete')}
                disabled={guardando||!!edit.attempt||draft.hasDraft||unsupported||!hasRole(['Gerencia'])}
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Revisar eliminación
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={close} disabled={guardando}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={guardando||!fecha||!!edit.attempt||draft.hasDraft||unsupported}>
                  {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Revisar corrección
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </>
  );
}

/** A different account, event or opening cannot reuse an earlier mounted review. */
export function EditarEventoDialog(props:EditarEventoDialogProps){
 const {user}=useAuth();return props.open&&props.evento?<EventEditor key={(user?.id??'signed-out')+':'+props.evento.id} {...props} evento={props.evento}/>:null;
}

/** Independent entry survives a deleted event disappearing from the timeline. */
export function EventCorrectionRecoveryButton({onRecover}:{onRecover:(event:HatoEventoRow)=>void}){
 const {user}=useAuth();const [error,setError]=useState<string|null>(null);
 return <><Button type="button" variant="outline" onClick={()=>{try{if(!user?.id)throw Error('Verifique su sesión.');const a=pendingEventCorrectionBrowser(user.id);if(!a)throw Error('No hay un intento original guardado en esta cuenta y navegador.');setError(null);onRecover(a.intent.observedEvent as unknown as HatoEventoRow);}catch(e){setError(e instanceof Error?e.message:'Conserve el intento original.');}}}>Recuperar corrección de evento</Button>{error&&<p role="alert">{error}</p>}</>;
}
