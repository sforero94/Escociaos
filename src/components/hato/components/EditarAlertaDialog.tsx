// ARCHIVO: components/hato/components/EditarAlertaDialog.tsx
// DESCRIPCIÓN: Edita campos de COLA (`fecha_programada` + nota en `datos`).
// No cambia el animal ni un tratamiento — eso es Hoja de Vida (issue #217).

import { useState, type FormEvent } from 'react';
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
import { DateInput } from '@/components/ui/date-input';
import { validarEdicionAlerta } from '@/utils/hatoAlertasGestor';
import type { AlertaHatoEnriquecida } from '../hooks/useHatoAlertas';

function notaInicial(alerta: AlertaHatoEnriquecida): string {
  const datos = alerta.datos;
  if (!datos) return '';
  if (typeof datos.nota_gestor === 'string') return datos.nota_gestor;
  if (typeof datos.nota === 'string') return datos.nota;
  return '';
}

export function EditarAlertaDialog({
  alerta,
  open,
  onOpenChange,
  onGuardar,
  guardando,
}: {
  alerta: AlertaHatoEnriquecida | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGuardar: (alerta: AlertaHatoEnriquecida, input: { fechaProgramada: string; nota: string }) => Promise<void>;
  guardando: boolean;
}) {
  const [fechaProgramada, setFechaProgramada] = useState(alerta?.fecha_programada ?? '');
  const [nota, setNota] = useState(alerta ? notaInicial(alerta) : '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!alerta) return;
    const validacion = validarEdicionAlerta({ fechaProgramada, nota });
    if (!validacion.ok) {
      toast.error(validacion.error);
      return;
    }
    try {
      await onGuardar(alerta, { fechaProgramada, nota });
      onOpenChange(false);
      toast.success('Alerta actualizada');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudo editar la alerta: ' + message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Editar alerta</DialogTitle>
          <DialogDescription>
            Cambia la fecha de la cola o deja una nota. El animal y el tratamiento no se editan acá.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogBody className="space-y-4">
            <div>
              <Label>Fecha programada</Label>
              <div className="mt-1">
                <DateInput value={fechaProgramada} onChange={setFechaProgramada} required />
              </div>
            </div>
            <div>
              <Label htmlFor="nota-alerta-editar">Nota</Label>
              <Textarea
                id="nota-alerta-editar"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </DialogBody>
          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando || !alerta}>
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
