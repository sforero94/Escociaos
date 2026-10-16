// ARCHIVO: components/hato/components/VentaAnimalesHatoDialog.tsx
// DESCRIPCIÓN: Diálogo "Registrar venta" del Hato para terneros y vacas de
// descarte (decisión 7 del dueño, plan `docs/plan_hato_produccion_rework.md`
// §0/§3/§6 SOW 3). Reemplaza el destino del botón "Registrar venta" de la
// Hoja de Vida, que hasta SOW 3 abría `VentaAnimalDialog` -> `
// TransaccionGanadoForm` (camino `fin_transacciones_ganado` + `es_hato`,
// ahora reservado para compras y para el registro de muerte — SOW 0 del
// mismo plan). Escribe vía `fn_hato_registrar_venta_animales` (migración
// 070): un `fin_ingresos` + N `hato_eventos` tipo `venta` + `hato_animales.
// estado='vendida'` para los animales enlazados, en una sola transacción.
//
// Decisión 6 del dueño: cabezas + valor son OBLIGATORIOS; enlazar animales
// específicos es OPCIONAL (una venta de N cabezas sin vínculo de animal
// concreto es válida). El selector de animales solo ofrece `hato_animales`
// `estado='activa'` — un animal ya vendido/muerto no puede volver a
// aparecer aquí.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {useFormDraft} from '@/hooks/useFormDraft';
import {FormDraftBanner} from '@/components/shared/FormDraftBanner';
import {useSale} from '../hooks/useSale';
import {saleIntent} from '@/utils/hato/hatoSaleProtocol';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { NumberInput } from '@/components/ui/number-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVentaAnimalesHato, type AnimalPickerVenta } from '../hooks/useVentaAnimalesHato';
import { useFinCatalogosVenta } from '../hooks/useFinCatalogosVenta';
import { validarCabezasVentaAnimales } from '@/utils/hatoProduccion';
import type { TipoVentaAnimalesHato } from '@/types/hato';
import { obtenerFechaHoy } from '@/utils/fechas';

function hoyISO(): string {
  return obtenerFechaHoy();
}

/** Mismo formato de etiqueta que `PajillaUsoDialog.tsx` usa para su
 * selector de "vaca servida" -- nunca un segundo formato para el mismo
 * dato en el mismo módulo. */
function etiquetaAnimal(a: AnimalPickerVenta): string {
  const chapeta = a.numero != null ? `#${a.numero}` : 'sin caravana';
  const provisional = a.numeroEsProvisional ? ' (provisional)' : '';
  const nombre = a.nombre ? ` — ${a.nombre}` : '';
  return `${chapeta}${provisional}${nombre}`;
}

interface VentaAnimalesHatoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `HojaDeVida` abre este diálogo desde LA FICHA de un animal puntual --
   * se pre-selecciona en el picker (y precarga `cabezas=1`) como punto de
   * partida, pero sigue siendo editable: decisión 6 del dueño es que el
   * vínculo de animal es OPCIONAL, así que Gerencia puede desmarcarlo o
   * agregar más animales a la misma venta. `undefined` cuando el diálogo
   * se abre sin contexto de un animal (uso futuro genérico). */
  animalIdPreseleccionado?: string;
  /** Se llama tras un guardado exitoso -- el caller (HojaDeVida) decide
   * cómo refrescar. */
  onGuardado: () => void;
}

export function VentaAnimalesHatoDialog(props:VentaAnimalesHatoDialogProps){const {user}=useAuth();return <SaleForm key={user?.id??'none'} {...props}/>;}
function SaleForm({
  open,
  onOpenChange,
  animalIdPreseleccionado,
  onGuardado,
}: VentaAnimalesHatoDialogProps) {
  const { animales, loadingAnimales } = useVentaAnimalesHato();
  const flow=useSale(),guardando=flow.busy;const mounted=useRef(true);useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const catalogos = useFinCatalogosVenta();

  const [tipo, setTipo] = useState<TipoVentaAnimalesHato>('terneros');
  const [cabezas, setCabezas] = useState<number | undefined>(undefined);
  const [valor, setValor] = useState<number | undefined>(undefined);
  const [fecha, setFecha] = useState(hoyISO());
  const [regionId, setRegionId] = useState('');
  const [medioPagoId, setMedioPagoId] = useState('');
  const [compradorId, setCompradorId] = useState('');
  const [nombre, setNombre] = useState('');
  const [animalIds, setAnimalIds] = useState<Set<string>>(new Set());

  const draft=useFormDraft('hato_sale',{tipo,cabezas,valor,fecha,regionId,medioPagoId,compradorId,nombre,animalIds:[...animalIds]}, {enabled:open&&!flow.attempt});
  useEffect(()=>{if(open)void flow.run('status').catch(()=>{});},[open]); // eslint-disable-line react-hooks/exhaustive-deps
  const action=(mode:'post'|'status'|'resolve'|'new')=>{const committed=flow.attempt?.result?.state==='committed';void flow.run(mode).then(()=>{if(!mounted.current)return;if(mode==='new'){draft.clearDraft();onOpenChange(false);if(committed)onGuardado();}}).catch(()=>{});};
  // Reinicia el formulario cada vez que se abre -- evita arrastrar datos de
  // una apertura anterior (mismo patrón que MuerteAnimalDialog/EditarAnimalDialog).
  useEffect(() => {
    if (open) {
      setTipo('terneros');
      setCabezas(animalIdPreseleccionado ? 1 : undefined);
      setValor(undefined);
      setFecha(hoyISO());
      setRegionId('');
      setMedioPagoId('');
      setCompradorId('');
      setNombre('');
      setAnimalIds(animalIdPreseleccionado ? new Set([animalIdPreseleccionado]) : new Set());
    }
  }, [open, animalIdPreseleccionado]);

  const toggleAnimal = (id: string) => {
    setAnimalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Si hay animales enlazados, las cabezas seleccionadas deben coincidir
  // con el número de animales -- de lo contrario el RPC vendería N cabezas
  // pero solo marcaría M como vendidas, una divergencia silenciosa entre
  // "lo que se cobró" y "lo que se registró". Es una validación de UI, el
  // RPC no la exige (animal_ids puede ser cualquier subconjunto).
  const cabezasVsAnimales = useMemo(() => {
    if (animalIds.size === 0) return null;
    if (cabezas != null && animalIds.size !== cabezas) {
      return `Seleccionaste ${animalIds.size} animal(es), pero cabezas = ${cabezas}. Deben coincidir o deja el selector vacío.`;
    }
    return null;
  }, [animalIds, cabezas]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const errorCabezas = validarCabezasVentaAnimales(cabezas);
    if (errorCabezas) {
      toast.error(errorCabezas);
      return;
    }
    if (!valor || valor <= 0) {
      toast.error('El valor de la venta debe ser mayor a cero');
      return;
    }
    if (!regionId) {
      toast.error('Selecciona una región');
      return;
    }
    if (!medioPagoId) {
      toast.error('Selecciona un medio de pago');
      return;
    }
    if (cabezasVsAnimales) {
      toast.error(cabezasVsAnimales);
      return;
    }

    try {
      if(!Number.isSafeInteger(valor))throw Error('El valor debe ser un número entero de pesos dentro del rango exacto.');
      const selected=animales.filter(a=>animalIds.has(a.id)).map(a=>({id:a.id,numero:a.numero,nombre:a.nombre})).sort((a,b)=>a.id.localeCompare(b.id));
      if(selected.length!==animalIds.size)throw Error('La selección de animales cambió. Revísala antes de preparar.');
      const region=catalogos.regiones.find(r=>r.id===regionId),medio=catalogos.mediosPago.find(r=>r.id===medioPagoId),comprador=catalogos.compradores.find(r=>r.id===compradorId);
      if(!region||!medio||(compradorId&&!comprador))throw Error('Verifica los catálogos seleccionados.');
      const ref=(r:{id:string;nombre:string})=>({id:r.id,nombre:r.nombre});
      await flow.run('prepare',saleIntent({version:1,tipo,cabezas,valor:String(valor),fecha,regionId,medioPagoId,compradorId:compradorId||null,nombre:nombre.trim(),animals:selected,refs:{region:ref(region),medio:ref(medio),comprador:comprador?ref(comprador):null}}));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido registrando la venta';
      toast.error(msg);
    }
  };

  if(flow.attempt){const a=flow.attempt,r=a.result;return <Dialog open={open} onOpenChange={value=>{if(!guardando)onOpenChange(value);}}><DialogContent size="lg"><DialogHeader><DialogTitle>Revisar venta preparada</DialogTitle></DialogHeader><DialogBody className="space-y-3">
    {flow.error&&<p role="alert">{flow.error}</p>}<p>Intento original: {a.key} · {r?.state??'sin verificar'}</p><p>Fecha: {a.intent.fecha} · {a.intent.tipo} · {a.intent.cabezas} cabezas</p><p>Valor total: {a.intent.valor} pesos</p><p>Región: {a.intent.refs.region.nombre} · Pago: {a.intent.refs.medio.nombre} · Comprador: {a.intent.refs.comprador?.nombre??'Sin comprador seleccionado'}</p><p>Nombre: {a.intent.nombre||`Venta ${a.intent.tipo} (${a.intent.cabezas} cabezas)`}</p>
    {r?.original&&<p>Categoría: {String(r.original.refs.categoria.nombre)} · Negocio: {String(r.original.refs.negocio.nombre)}</p>}
    <p>Ingreso reservado: {r?.plan?.incomeId??'sin verificar'}</p>{a.intent.animals.map(animal=><p key={animal.id}>Animal: #{animal.numero??'sin caravana'} {animal.nombre??'Sin nombre'} · {animal.id}</p>)}
    {a.intent.animals.length===0&&<p>Venta sin animales enlazados; no se crearán eventos ni cambios de estado.</p>}
    {r?.state==='pending'&&<p>Confirme este importe, fecha, referencias y animales. El ingreso, sus eventos y los estados se guardan juntos.</p>}{r?.state==='committed'&&<p>Venta registrada y comprobada.</p>}
    </DialogBody><DialogFooter><Button variant="outline" disabled={guardando} onClick={()=>onOpenChange(false)}>Cerrar</Button><Button disabled={guardando} onClick={()=>action('status')}>Verificar venta original</Button>
    {(!r||['unknown','pending'].includes(r.state))&&<Button disabled={guardando} onClick={()=>action('resolve')}>Cancelar intento original</Button>}{r?.state==='pending'&&<Button disabled={guardando} onClick={()=>action('post')}>Confirmar venta preparada</Button>}{r&&['committed','canceled'].includes(r.state)&&<Button disabled={guardando} onClick={()=>action('new')}>Finalizar venta verificada</Button>}</DialogFooter></DialogContent></Dialog>;}
  return (
    <Dialog open={open} onOpenChange={value=>{if(!guardando)onOpenChange(value);}}>
      {/* `lg`, no `md`: 5 filas de campos (tipo/fecha, cabezas/valor,
          región/medio de pago, comprador/nombre) más el picker de animales
          enlazados (hasta 256px de lista propia) es el formulario más largo
          del módulo -- en `md` (512px de alto) el picker quedaba casi
          entero fuera de la vista inicial (auditoría de UI). */}
      <DialogContent size="lg">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Registrar venta</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {flow.error&&<p role="alert">{flow.error}</p>}
            <FormDraftBanner show={draft.hasDraft} variant="available" onDiscard={draft.discardDraft} onRestore={()=>{const d=draft.draftData;if(d){setTipo(d.tipo);setCabezas(d.cabezas);setValor(d.valor);setFecha(d.fecha);setRegionId(d.regionId);setMedioPagoId(d.medioPagoId);setCompradorId(d.compradorId);setNombre(d.nombre);setAnimalIds(new Set(d.animalIds));draft.acceptDraft();}}}/>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="venta-tipo">Tipo de venta *</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoVentaAnimalesHato)}>
                  <SelectTrigger id="venta-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="terneros">Terneros</SelectItem>
                    <SelectItem value="descarte">Descarte (vacas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="venta-fecha">Fecha *</Label>
                <Input id="venta-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="venta-cabezas">Cabezas *</Label>
                <NumberInput id="venta-cabezas" value={cabezas} onChange={setCabezas} decimals={0} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="venta-valor">Valor total *</Label>
                <NumberInput id="venta-valor" value={valor} onChange={setValor} decimals={0} placeholder="0" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="venta-region">Región *</Label>
                <Select value={regionId || undefined} onValueChange={setRegionId} disabled={catalogos.loading}>
                  <SelectTrigger id="venta-region">
                    <SelectValue placeholder="Seleccionar región" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogos.regiones.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="venta-medio-pago">Medio de pago *</Label>
                <Select value={medioPagoId || undefined} onValueChange={setMedioPagoId} disabled={catalogos.loading}>
                  <SelectTrigger id="venta-medio-pago">
                    <SelectValue placeholder="Seleccionar medio de pago" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogos.mediosPago.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="venta-comprador">Comprador</Label>
                <Select value={compradorId || undefined} onValueChange={setCompradorId} disabled={catalogos.loading}>
                  <SelectTrigger id="venta-comprador">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogos.compradores.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="venta-nombre">Nombre del ingreso</Label>
                <Input
                  id="venta-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder={`Venta ${tipo} (${cabezas ?? '…'} cabezas)`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Animales enlazados (opcional)</Label>
                <span className="text-xs text-gray-400">{animalIds.size} seleccionado(s)</span>
              </div>
              {loadingAnimales ? (
                <div className="flex items-center py-3 text-sm text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando animales…
                </div>
              ) : animales.length === 0 ? (
                <p className="text-sm text-gray-400">No hay animales activos en el hato.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-md border border-gray-200 p-2 space-y-1">
                  {animales.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-50 cursor-pointer select-none"
                    >
                      <Checkbox checked={animalIds.has(a.id)} onCheckedChange={() => toggleAnimal(a.id)} />
                      <span className="text-sm text-gray-700">{etiquetaAnimal(a)}</span>
                    </label>
                  ))}
                </div>
              )}
              {cabezasVsAnimales && <p className="text-xs text-red-600">{cabezasVsAnimales}</p>}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!!flow.error||guardando||loadingAnimales||catalogos.loading}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Preparar venta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
