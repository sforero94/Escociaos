// ARCHIVO: components/hato/components/PajillaUsoDialog.tsx
// DESCRIPCIÓN: Diálogo "Registrar uso de pajilla" (G2, S10) -- log
// append-only en `hato_pajillas_uso`. Solo pide fecha de uso y, si se
// conoce, la vaca servida (opcional -- mejor registrar el uso sin la vaca
// que no registrarlo, plan §6 Épica G). El stock puede estar en 0 o
// negativo: se muestra el chip de advertencia (`chipStockPajillas`) pero
// NUNCA se deshabilita el lote ni se bloquea el envío (G3).

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EstadoChip } from './EstadoChip';
import { chipStockPajillas } from '@/utils/hatoUi';
import type { PajillaConToro, AnimalPickerPajillas } from '../hooks/useHatoPajillas';

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PajillaUsoDialog({
  open,
  onOpenChange,
  pajillas,
  animales,
  pajillaIdInicial,
  registrarUso,
  guardando,
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
  registrarUso: (pajillaId: string, fechaUso: string, animalId: string | null) => Promise<{ ok: boolean; error?: string }>;
  guardando: boolean;
  onGuardado: () => void;
}) {
  const [pajillaId, setPajillaId] = useState('');
  const [fechaUso, setFechaUso] = useState(hoyISO());
  const [animalId, setAnimalId] = useState<string>('sin_vaca');

  useEffect(() => {
    if (open) {
      setPajillaId(pajillaIdInicial ?? '');
      setFechaUso(hoyISO());
      setAnimalId('sin_vaca');
    }
  }, [open, pajillaIdInicial]);

  const pajillaSeleccionada = pajillas.find((p) => p.pajilla_id === pajillaId);
  const chipStock = pajillaSeleccionada ? chipStockPajillas(pajillaSeleccionada.cantidad_actual) : null;

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
    const resultado = await registrarUso(pajillaId, fechaUso, animalId === 'sin_vaca' ? null : animalId);
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido registrando el uso');
      return;
    }
    toast.success('Uso de pajilla registrado');
    onGuardado();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Registrar uso de pajilla</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
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
                  {animales.map((a) => (
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
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
