// ARCHIVO: components/hato/components/MarcarCicloDialog.tsx
// DESCRIPCIÓN: T4a (S3, docs/plan_hato_ciclo_manual_override.md §3.5) --
// diálogo único para las 4 marcas manuales del ciclo reproductivo: preñada,
// confirmada, seca, parida. Escribe 1-2 `hato_eventos` vía
// `useMarcarCicloHato` (un solo INSERT, atómico).
//
// D-7: solo Gerencia. El gate es el ROL (RoleGuard-equivalente inline),
// nunca el resultado de la consulta -- mismo patrón que
// `ProduccionQuincenalForm`/`ProduccionView` (candado compacto si el rol no
// alcanza, skeleton mientras `useAuth().isLoading` en vez de un hueco en
// blanco, QA FIX 5 de esa sesión). No se usa el componente genérico
// `RoleGuard` directo porque su fallback por defecto es una tarjeta a
// pantalla completa (`min-h-[60vh]`), que no cabe en un `DialogContent
// size="sm"`.
//
// Cabecera fija "Estado actual: {antes} → quedará: {despues}"
// (`proyectarEstadoTrasMarca`) -- hace visible D-5 sin explicárselo a nadie.

import { useState, type FormEvent } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/contexts/AuthContext';
import { useMarcarCicloHato } from '../hooks/useMarcarCicloHato';
import { EstadoChip } from './EstadoChip';
import {
  necesitaAnclaServicio,
  proyectarEstadoTrasMarca,
  validarMarcaCiclo,
  type AnclaServicioInput,
  type InputMarcaCiclo,
  type MarcaCiclo,
  type ModoAnclaServicio,
} from '@/utils/hatoCicloManual';
import { chipEstadoReproductivo } from '@/utils/hatoUi';
import { obtenerFechaHoy } from '@/utils/fechas';
import { NOMBRE_CRIA_SIN_NOMBRE } from '@/utils/hato/criaAutomatica';
import {useCycle} from '../hooks/useCycle';
import {canonicalCycleInput,cycleIntent} from '@/utils/hato/hatoCycleProtocol';
import {construirHatoConfigDesdeFilas,type FilaHatoConfig} from '@/utils/hatoConfigDesdeTabla';
import {useFormDraft} from '@/hooks/useFormDraft';
import type {EstadoActualHatoRow} from '@/utils/calculosHato';
import type { CriaDestino } from '@/types/hato';

const MARCAS: { value: MarcaCiclo; label: string }[] = [
  { value: 'preñada', label: 'Preñada' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'seca', label: 'Seca' },
  { value: 'parida', label: 'Parida' },
];

const DESTINOS: { value: CriaDestino; label: string }[] = [
  { value: 'retenida', label: 'Cría retenida' },
  { value: 'hembra_vendida', label: 'Hembra vendida' },
  { value: 'macho_vendido', label: 'Macho vendido' },
  { value: 'muerta', label: 'Cría muerta' },
  { value: 'aborto', label: 'Aborto' },
];

function CandadoGerencia() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Lock className="w-4 h-4 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Marcar ciclo reproductivo</p>
        <p className="text-xs text-gray-500">Preñada, confirmada, seca y parida requieren permisos de Gerencia.</p>
      </div>
    </div>
  );
}

function MarcarCicloSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="h-9 bg-gray-100 rounded-lg" />
      <div className="h-24 bg-gray-100 rounded-lg" />
      <div className="h-9 bg-gray-100 rounded-lg" />
    </div>
  );
}

interface MarcarCicloDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string | undefined;
  /** Se llama tras un guardado exitoso, antes de cerrar el diálogo -- el
   * caller decide cómo refrescar (HojaDeVida/AnimalesList vuelven a llamar
   * su propio `reload()`). */
  onGuardado: () => void;
}

function CycleDialog({ open, onOpenChange, animalId, onGuardado }: MarcarCicloDialogProps) {
  const { profile, isLoading: authLoading, hasRole } = useAuth();
  const cycle=useCycle(),guardando=cycle.busy;
  // Solo carga mientras el diálogo está abierto -- evita 3 queries por cada
  // fila del hato si este componente se monta una sola vez y se reutiliza
  // para "acción por fila" (AnimalesList).
  const { fila, config, loading, error, observedAnimal } = useMarcarCicloHato(open ? animalId : undefined);

  const [marca, setMarca] = useState<MarcaCiclo>('preñada');
  const [fecha, setFecha] = useState(obtenerFechaHoy());
  const [fechaAproximada, setFechaAproximada] = useState(false);
  const [criaDestino, setCriaDestino] = useState<CriaDestino>('retenida');
  const [nota, setNota] = useState('');
  const [modoAncla, setModoAncla] = useState<ModoAnclaServicio>('ninguna');
  const [anclaFechaServicio, setAnclaFechaServicio] = useState(obtenerFechaHoy());
  const [anclaMeses, setAnclaMeses] = useState<number | undefined>(undefined);

  // Owner/target/open remount boundaries isolate drafts and original attempts.
  const puedeGerencia = hasRole(['Gerencia']);
  const hoy = obtenerFechaHoy();

  const ancla: AnclaServicioInput | undefined =
    marca === 'preñada' || marca === 'confirmada'
      ? modoAncla === 'fecha_conocida'
        ? { modo: 'fecha_conocida', fechaServicio: anclaFechaServicio }
        : modoAncla === 'meses_prenez'
          ? { modo: 'meses_prenez', mesesPrenez: anclaMeses }
          : { modo: 'ninguna' }
      : undefined;

  const input: InputMarcaCiclo = {
    marca,
    fecha,
    fechaConfianza: fechaAproximada ? 'aproximada' : 'exacta',
    criaDestino: marca === 'parida' ? criaDestino : undefined,
    nota: nota.trim() || undefined,
    ancla,
  };

  const mostrarAncla = (marca === 'preñada' || marca === 'confirmada') && !!fila && necesitaAnclaServicio(fila);

  const validacion = fila && config ? validarMarcaCiclo(input, fila, config, { rol: profile?.rol ?? '', hoy }) : null;
  const proyeccion = fila && config ? proyectarEstadoTrasMarca(fila, marca, fecha, config, hoy) : null;

  const anclaIncompleta =
    mostrarAncla &&
    ((modoAncla === 'fecha_conocida' && !anclaFechaServicio) ||
      (modoAncla === 'meses_prenez' && (anclaMeses == null || anclaMeses <= 0)));

  const puedeGuardar =
    !loading &&
    !guardando &&
    !!fila &&
    !!config &&
    !!fecha &&
    (validacion?.bloqueos.length ?? 1) === 0 &&
    !anclaIncompleta;

  const draft=useFormDraft('hato-cycle:'+animalId,{marca,fecha,fechaAproximada,criaDestino,nota,modoAncla,anclaFechaServicio,anclaMeses},{enabled:open});
  const restoreDraft=()=>{const d=draft.draftData;if(!d)return;setMarca(d.marca);setFecha(d.fecha);setFechaAproximada(d.fechaAproximada);setCriaDestino(d.criaDestino);setNota(d.nota);setModoAncla(d.modoAncla);setAnclaFechaServicio(d.anclaFechaServicio);setAnclaMeses(d.anclaMeses);draft.acceptDraft();};
  const handleSubmit=async(e:FormEvent)=>{e.preventDefault();if(!puedeGuardar||!observedAnimal||!animalId)return;try{await cycle.run('prepare',cycleIntent({version:1,animalId,observedAnimal,input:canonicalCycleInput(input)}));}catch(e){toast.error(e instanceof Error?e.message:'Conserve el intento original.');}};
  const action=async(mode:'post'|'status'|'resolve'|'new')=>{try{await cycle.run(mode);if(mode==='new'){draft.clearDraft();if(cycle.attempt?.result?.state==='committed')onGuardado();onOpenChange(false);}}catch(e){toast.error(e instanceof Error?e.message:'Conserve el intento original.');}};
  const captured=cycle.attempt?.result;
  let reviewWarnings:string[]|null=null,reviewProjection:ReturnType<typeof proyectarEstadoTrasMarca>|null=null;
  if(captured?.original&&captured.intent){try{const c=construirHatoConfigDesdeFilas(captured.original.config as unknown as FilaHatoConfig[]);const r=validarMarcaCiclo({...captured.intent.input,criaDestino:captured.intent.input.criaDestino??undefined,ancla:{modo:captured.intent.input.ancla.modo,fechaServicio:captured.intent.input.ancla.fechaServicio??undefined,mesesPrenez:captured.intent.input.ancla.mesesPrenez??undefined}},captured.original.view as unknown as EstadoActualHatoRow,c,{rol:profile?.rol??'',hoy:captured.effectiveDate!});if(!r.bloqueos.length){reviewWarnings=r.advertencias;reviewProjection=proyectarEstadoTrasMarca(captured.original.view as unknown as EstadoActualHatoRow,captured.intent.input.marca,captured.intent.input.fecha,c,captured.effectiveDate!);}}catch{/* Missing source config is not replaced with invented defaults. */}}
  // Contenido de acceso denegado/skeleton/error: sin DialogFooter propio --
  // el usuario cierra con la X del panel (siempre presente en DialogContent).
  const mostrarFormulario = !authLoading && puedeGerencia && !loading && !error && fila && config;

  return (
    <Dialog open={open} onOpenChange={value=>{if(!value&&!guardando){if(!cycle.attempt)draft.clearDraft();onOpenChange(false);}}}>
      {/* `md`, no `sm`: con la marca "Preñada"/"Confirmada" y una vaca sin
          ancla de servicio conocida, el formulario suma el bloque "¿Desde
          cuándo está servida?" a fecha+checkbox+nota -- en `sm` (384px de
          alto) ese campo quedaba pegado al pie del diálogo (auditoría de
          UI). */}
      <DialogContent size="md">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Marcar ciclo reproductivo</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Button type="button" disabled={guardando||!puedeGerencia} onClick={()=>void action('status')}>Recuperar intento original</Button>
            {cycle.error&&<p role="alert">{cycle.error}</p>}
            {draft.hasDraft&&!cycle.attempt&&<div><p>Hay una marca guardada de esta cuenta.</p><Button type="button" onClick={restoreDraft}>Restaurar borrador</Button><Button type="button" onClick={draft.discardDraft}>Descartar borrador</Button></div>}
            {cycle.attempt&&<section aria-label="Revisión de ciclo"><p>Animal capturado: #{String(captured?.original?.graph.animal.numero??'—')} {String(captured?.original?.graph.animal.nombre??'')} · {cycle.attempt.key}</p><p>Fecha del hecho: {cycle.attempt.intent.input.fecha}. Revisión válida para: {captured?.effectiveDate??'por verificar'}.</p>
              <p>Marca: {cycle.attempt.intent.input.marca}. Destino: {cycle.attempt.intent.input.criaDestino??'No aplica'}. Nota: {cycle.attempt.intent.input.nota||'Sin nota'}.</p>{reviewProjection&&<p>Estado capturado: {reviewProjection.antes} → quedará: {reviewProjection.despues}</p>}
              <p>{captured?.state==='committed'?'Registrado y verificado':captured?.state==='canceled'?'Cancelado':captured?.state==='pending'?'Pendiente de confirmación':'Por verificar'}</p>
              {captured?.plan?.events.map(e=><p key={String(e.id)}>{String(e.tipo)} · {String(e.fecha)} · {String(e.fecha_confianza)}</p>)}
              {captured?.plan?.calf&&<p>Se creará la ternera #{String(captured.plan.calf.numero)} SIN NOMBRE, madre #{String(captured.original?.graph.animal.numero)}, padre {captured.plan.calf.padre_toro_id?String(captured.original?.toros.find(t=>t.id===captured.plan!.calf!.padre_toro_id)?.nombre??'Referencia registrada'):'Sin registrar'}. Parto y ficha se guardan juntos.</p>}
              {reviewWarnings?.map(w=><p key={w}>{w}</p>)}{captured?.state==='pending'&&reviewWarnings===null&&<p role="alert">No pude comprobar la configuración original. Recupere o cancele este intento.</p>}
              <Button type="button" disabled={guardando||captured?.state!=='pending'||reviewWarnings===null||!puedeGerencia} onClick={()=>void action('post')}>Confirmar marca revisada</Button>
              <Button type="button" disabled={guardando||!['pending','unknown'].includes(captured?.state??'unknown')} onClick={()=>void action('resolve')}>Cancelar intento original</Button>
              <Button type="button" disabled={guardando||!['committed','canceled'].includes(captured?.state??'')} onClick={()=>void action('new')}>Finalizar intento verificado</Button>
            </section>}
            <fieldset disabled={guardando||!!cycle.attempt||draft.hasDraft} className="contents">
            {authLoading || (puedeGerencia && loading) ? (
              <MarcarCicloSkeleton />
            ) : !puedeGerencia ? (
              <CandadoGerencia />
            ) : error || !fila || !config ? (
              <p className="text-sm text-red-600">{error ?? 'No se pudo cargar el estado del animal.'}</p>
            ) : (
              <>
                {proyeccion && (
                  <div className="flex items-center gap-2 flex-wrap rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
                    <span className="text-gray-500">Estado actual:</span>
                    <EstadoChip chip={chipEstadoReproductivo(proyeccion.antes)} />
                    <span className="text-gray-400">→</span>
                    <span className="text-gray-500">quedará:</span>
                    <EstadoChip chip={chipEstadoReproductivo(proyeccion.despues)} />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Marca</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={marca}
                    onValueChange={(v) => v && setMarca(v as MarcaCiclo)}
                    className="w-full"
                  >
                    {MARCAS.map((m) => (
                      <ToggleGroupItem key={m.value} value={m.value} className="text-xs">
                        {m.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="marca-ciclo-fecha">Fecha</Label>
                    <Input
                      id="marca-ciclo-fecha"
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex items-end pb-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                      <Checkbox checked={fechaAproximada} onCheckedChange={(v) => setFechaAproximada(v === true)} />
                      Fecha aproximada
                    </label>
                  </div>
                </div>

                {marca === 'parida' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="marca-ciclo-destino">Destino de la cría</Label>
                    <Select value={criaDestino} onValueChange={(v) => setCriaDestino(v as CriaDestino)}>
                      <SelectTrigger id="marca-ciclo-destino">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DESTINOS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {criaDestino === 'retenida' && (
                      <p className="text-xs text-gray-500">
                        Se creará la ficha de la ternera como {NOMBRE_CRIA_SIN_NOMBRE}, con la chapeta siguiente de la serie.
                      </p>
                    )}
                  </div>
                )}

                {mostrarAncla && (
                  <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                    <Label>¿Desde cuándo está servida?</Label>
                    <Select value={modoAncla} onValueChange={(v) => setModoAncla(v as ModoAnclaServicio)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fecha_conocida">Fecha de servicio conocida</SelectItem>
                        <SelectItem value="meses_prenez">Meses de preñez (aproximado)</SelectItem>
                        <SelectItem value="ninguna">No sé / no aplica</SelectItem>
                      </SelectContent>
                    </Select>
                    {modoAncla === 'fecha_conocida' && (
                      <Input
                        type="date"
                        value={anclaFechaServicio}
                        onChange={(e) => setAnclaFechaServicio(e.target.value)}
                      />
                    )}
                    {modoAncla === 'meses_prenez' && (
                      <NumberInput
                        value={anclaMeses}
                        onChange={setAnclaMeses}
                        decimals={1}
                        placeholder="Meses de preñez"
                      />
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="marca-ciclo-nota">Nota (opcional)</Label>
                  <Textarea id="marca-ciclo-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
                </div>

                {validacion && validacion.advertencias.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
                    {validacion.advertencias.map((a, i) => (
                      <p key={i} className="text-xs text-amber-700">{a}</p>
                    ))}
                  </div>
                )}

                {validacion && validacion.bloqueos.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-1">
                    {validacion.bloqueos.map((b, i) => (
                      <p key={i} className="text-xs text-red-700">{b}</p>
                    ))}
                  </div>
                )}
              </>
            )}
            </fieldset>
          </DialogBody>

          {mostrarFormulario && (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {if(!cycle.attempt)draft.clearDraft();onOpenChange(false);}} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!puedeGuardar||!!cycle.attempt||draft.hasDraft}>
                {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Revisar marca
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MarcarCicloDialog(props:MarcarCicloDialogProps){const {user}=useAuth();return props.open?<CycleDialog key={(user?.id??'signed-out')+':'+props.animalId} {...props}/>:null;}
