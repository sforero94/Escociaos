// ARCHIVO: components/hato/components/CrearAlertaManualDialog.tsx
// DESCRIPCIÓN: Alta manual de una fila en `hato_alertas` (issue #217).
// No dispara Telegram por sí sola: el tick despacha si el tipo está activo
// y hay suscripción. `rechequeo_due` no exige vaca; el resto sí.

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import {useAuth} from '@/contexts/AuthContext';
import { getSupabase } from '@/utils/supabase/client';
import { obtenerFechaHoy } from '@/utils/fechas';
import { LABEL_TIPO_ALERTA_HATO } from '@/utils/hatoAlertasUi';
import {
  TIPOS_ALERTA_MANUAL,
  tipoAlertaRequiereAnimal,
  validarAlertaManual,
} from '@/utils/hatoAlertasGestor';
import type { TipoAlertaHato } from '@/utils/hatoAlertas';

interface VacaOpcion {
  id: string;
  numero: number | null;
  nombre: string | null;
}

function etiquetaVaca(v: VacaOpcion): string {
  const nombre = v.nombre?.trim() || 'sin nombre';
  return v.numero != null ? `${nombre} (#${v.numero})` : nombre;
}

export function CrearAlertaManualDialog({
  open,
  onOpenChange,
  onCrear,
  guardando,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCrear: (input: {
    tipo: TipoAlertaHato;
    animalId: string | null;
    fechaProgramada: string;
    nota: string;
    pasoId?: string | null;
  }) => Promise<void>;
  guardando: boolean;
}) {
  const {user}=useAuth();
  const [pasoId,setPasoId]=useState<string|null>(null);
  const [pasos,setPasos]=useState<Array<{id:string;descripcion:string|null;fecha_programada:string}>>([]);
  const [cargandoPasos,setCargandoPasos]=useState(false);
  const [errorPasos,setErrorPasos]=useState<string|null>(null);
  const [tipo, setTipo] = useState<TipoAlertaHato>('secado_due');
  const [animalId, setAnimalId] = useState<string | null>(null);
  const [fechaProgramada, setFechaProgramada] = useState(obtenerFechaHoy());
  const [nota, setNota] = useState('');
  const [vacas, setVacas] = useState<VacaOpcion[]>([]);

  useEffect(() => {
    if (!open) return;
    let current=true;
    setVacas([]);
    setTipo('secado_due');
    setAnimalId(null);
    setFechaProgramada(obtenerFechaHoy());
    setNota('');
    void (async () => {
      try {
        const supabase = getSupabase() as any;
        const { data, error } = await supabase
          .from('hato_animales')
          .select('id, numero, nombre')
          .eq('estado', 'activa')
          .order('nombre', { ascending: true });
        if (error) throw error;
        if(current)setVacas((data ?? []) as VacaOpcion[]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        if(current)toast.error('No se pudieron cargar las vacas: ' + message);
      }
    })();
    return ()=>{current=false;};
  }, [open,user?.id]);

  useEffect(()=>{
    let current=true;setPasoId(null);setPasos([]);setErrorPasos(null);setCargandoPasos(false);
    if(open&&tipo==='tratamiento_paso'&&animalId&&user?.id){
      setCargandoPasos(true);
      void(async()=>{try{
        const {data,error}=await (getSupabase() as any).from('hato_tratamiento_pasos')
          .select('id,descripcion,fecha_programada,hato_tratamientos!inner(animal_id,estado)')
          .eq('hato_tratamientos.animal_id',animalId).eq('hato_tratamientos.estado','activo')
          .is('fecha_ejecutada',null).order('fecha_programada',{ascending:true});
        if(error)throw error;
        if(current)setPasos(data??[]);
      }catch{if(current)setErrorPasos('No se pudieron verificar los pasos pendientes.');}
      finally{if(current)setCargandoPasos(false);}})();
    }
    return()=>{current=false;};
  },[open,tipo,animalId,user?.id]);

  const exigeVaca = tipoAlertaRequiereAnimal(tipo);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if(tipo==='tratamiento_paso'&&(cargandoPasos||errorPasos||!pasos.some(p=>p.id===pasoId))){toast.error('Elige un paso clínico pendiente verificado para esta vaca.');return;}
    const validacion = validarAlertaManual({
      tipo,
      animalId: exigeVaca ? animalId : null,
      fechaProgramada,
      nota,
      idUnico: 'preview',
      pasoId,
    });
    if (!validacion.ok) {
      toast.error(validacion.error);
      return;
    }
    try {
      await onCrear({
        tipo,
        animalId: exigeVaca ? animalId : null,
        fechaProgramada,
        nota,
        pasoId:tipo==='tratamiento_paso'?pasoId:null,
      });
      onOpenChange(false);
      toast.success('Alerta creada');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudo crear la alerta: ' + message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Crear alerta</DialogTitle>
          <DialogDescription>
            Entra a la cola del hato. Telegram la manda solo si el tipo está activo y alguien la recibe.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogBody className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoAlertaHato)}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ALERTA_MANUAL.map((t) => (
                    <SelectItem key={t} value={t}>{LABEL_TIPO_ALERTA_HATO[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {exigeVaca && (
              <div>
                <Label>Vaca</Label>
                <Select key={tipo} value={animalId ?? undefined} onValueChange={(v) => setAnimalId(v)}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue placeholder="Elige la vaca" />
                  </SelectTrigger>
                  <SelectContent>
                    {vacas.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{etiquetaVaca(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {tipo==='tratamiento_paso'&&<div><Label>Paso clínico pendiente</Label>
              <Select value={pasoId??undefined} onValueChange={setPasoId} disabled={cargandoPasos||!animalId||!!errorPasos}>
                <SelectTrigger><SelectValue placeholder="Elige el paso existente"/></SelectTrigger>
                <SelectContent>{pasos.map(p=><SelectItem key={p.id} value={p.id}>{p.fecha_programada} · {p.descripcion??'Sin descripción'}</SelectItem>)}</SelectContent>
              </Select>
              {cargandoPasos&&<p role="status">Verificando pasos pendientes…</p>}
              {errorPasos&&<p role="alert">{errorPasos}</p>}
              {!cargandoPasos&&!errorPasos&&animalId&&pasos.length===0&&<p>No hay pasos pendientes para esta vaca.</p>}
              <p>Responder Sí registra la ejecución de este paso después de revisar la confirmación.</p>
            </div>}
            <div>
              <Label>Fecha programada</Label>
              <div className="mt-1">
                <DateInput value={fechaProgramada} onChange={setFechaProgramada} required />
              </div>
            </div>
            <div>
              <Label htmlFor="nota-alerta-manual">Nota</Label>
              <Textarea
                id="nota-alerta-manual"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                className="mt-1"
                rows={3}
                placeholder="Qué hay que hacer. Opcional."
              />
            </div>
          </DialogBody>
          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
