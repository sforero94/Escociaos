// ARCHIVO: components/hato/components/MuerteAnimalDialog.tsx
// DESCRIPCIÓN: Diálogo "Registrar muerte" de la ficha (HojaDeVida, S9). A
// diferencia de la venta, una muerte NO es una transacción financiera --
// nunca abre TransaccionGanadoForm. Captura fecha (default hoy) + causa
// (opcional) y escribe directo: evento `muerte` append-only en
// `hato_eventos` + `hato_animales.estado = 'muerta'`
// (`useRegistrarSalidaHato`). Gateado por el caller (Administrador/Gerencia
// + `estado === 'activa'`), mismo patrón que `EditarAnimalDialog`.

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRegistrarSalidaHato } from '../hooks/useRegistrarSalidaHato';
import { esFechaFutura } from '@/utils/hatoSalida';

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MuerteAnimalDialog({
  open,
  onOpenChange,
  animalId,
  onGuardado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  /** Se llama tras un guardado exitoso, antes de cerrar el diálogo --
   * mismo contrato que `EditarAnimalDialog.onGuardado`. */
  onGuardado: () => void;
}) {
  const { registrarMuerte, guardando } = useRegistrarSalidaHato();
  const [fecha, setFecha] = useState(hoyISO());
  const [causa, setCausa] = useState('');

  // Reinicia el formulario cada vez que se abre -- evita arrastrar una
  // fecha/causa de una apertura anterior (mismo patrón que EditarAnimalDialog).
  useEffect(() => {
    if (open) {
      setFecha(hoyISO());
      setCausa('');
    }
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (esFechaFutura(fecha, hoyISO())) {
      toast.error('La fecha de muerte no puede ser en el futuro');
      return;
    }

    const resultado = await registrarMuerte(animalId, fecha, causa);
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido registrando la muerte del animal');
      return;
    }
    toast.success('Muerte registrada');
    onGuardado();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Registrar muerte</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="muerte-animal-fecha">Fecha *</Label>
              <Input
                id="muerte-animal-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="muerte-animal-causa">Causa (opcional)</Label>
              <Textarea
                id="muerte-animal-causa"
                value={causa}
                onChange={(e) => setCausa(e.target.value)}
                placeholder="Notas sobre la causa..."
                rows={3}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={guardando}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar muerte
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
