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
  }) => Promise<void>;
  guardando: boolean;
}) {
  const [tipo, setTipo] = useState<TipoAlertaHato>('secado_due');
  const [animalId, setAnimalId] = useState<string | null>(null);
  const [fechaProgramada, setFechaProgramada] = useState(obtenerFechaHoy());
  const [nota, setNota] = useState('');
  const [vacas, setVacas] = useState<VacaOpcion[]>([]);

  useEffect(() => {
    if (!open) return;
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
        setVacas((data ?? []) as VacaOpcion[]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        toast.error('No se pudieron cargar las vacas: ' + message);
      }
    })();
  }, [open]);

  const exigeVaca = tipoAlertaRequiereAnimal(tipo);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validacion = validarAlertaManual({
      tipo,
      animalId: exigeVaca ? animalId : null,
      fechaProgramada,
      nota,
      idUnico: 'preview',
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
