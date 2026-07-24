// ARCHIVO: components/hato/components/PajillaCompraDialog.tsx
// DESCRIPCIÓN: Diálogo "Registrar compra de pajillas" (G1, S10) -- crea un
// nuevo lote (`hato_pajillas`) para un toro YA existente en el catálogo
// (G4/`hato_toros`), nunca un nombre de toro suelto. Sin proveedor ni costo
// -- fuera de alcance de la Épica G (deliberadamente mínimo).

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { HatoToroRow } from '@/types/hato';

export function PajillaCompraDialog({
  open,
  onOpenChange,
  toros,
  registrarCompra,
  guardando,
  onGuardado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Catálogo de toros activos -- solo se compran pajillas para toros vigentes. */
  toros: HatoToroRow[];
  registrarCompra: (toroId: string, cantidadInicial: number) => Promise<{ ok: boolean; error?: string }>;
  guardando: boolean;
  onGuardado: () => void;
}) {
  const [toroId, setToroId] = useState('');
  const [cantidad, setCantidad] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setToroId('');
      setCantidad(undefined);
    }
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!toroId) {
      toast.error('Selecciona un toro');
      return;
    }
    if (cantidad === undefined || cantidad < 0) {
      toast.error('La cantidad inicial debe ser un número mayor o igual a 0');
      return;
    }
    const resultado = await registrarCompra(toroId, cantidad);
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido registrando la compra');
      return;
    }
    toast.success('Compra de pajillas registrada');
    onGuardado();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Registrar compra de pajillas</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="compra-toro">Toro</Label>
              <Select value={toroId} onValueChange={setToroId}>
                <SelectTrigger id="compra-toro">
                  <SelectValue placeholder="Seleccionar toro..." />
                </SelectTrigger>
                <SelectContent>
                  {toros.filter((t) => t.activo).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {toros.filter((t) => t.activo).length === 0 && (
                <p className="text-xs text-amber-700">No hay toros activos en el catálogo — crea uno primero.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compra-cantidad">Cantidad inicial</Label>
              <NumberInput id="compra-cantidad" value={cantidad} onChange={setCantidad} decimals={0} />
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
