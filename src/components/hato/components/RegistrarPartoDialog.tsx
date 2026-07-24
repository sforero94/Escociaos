// ARCHIVO: components/hato/components/RegistrarPartoDialog.tsx
// DESCRIPCIÓN: Diálogo de acción rápida "Registrar parto" de la Hoja de
// Vida (Figma alignment spec §3). Inserta UN `hato_eventos` (tipo `parto`)
// vía `useEventoRapidoHato` -- ver esa nota para por qué basta con el
// evento (num_partos es un COUNT sobre la vista, migración 056).

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEventoRapidoHato } from '../hooks/useEventoRapidoHato';
import { obtenerFechaHoy } from '@/utils/fechas';
import type { CriaDestino } from '@/types/hato';

const DESTINOS: { value: CriaDestino; label: string }[] = [
  { value: 'retenida', label: 'Cría retenida' },
  { value: 'hembra_vendida', label: 'Hembra vendida' },
  { value: 'macho_vendido', label: 'Macho vendido' },
  { value: 'muerta', label: 'Cría muerta' },
  { value: 'aborto', label: 'Aborto' },
];

export function RegistrarPartoDialog({
  open,
  onOpenChange,
  animalId,
  onRegistrado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  /** Se llama tras un guardado exitoso -- el caller (`HojaDeVida`) vuelve a
   * llamar `reload()` de `useHatoAnimal` para que la franja de estadísticas
   * y la línea de tiempo reflejen el parto de inmediato. */
  onRegistrado: () => void;
}) {
  const { registrarParto, guardando } = useEventoRapidoHato();
  const [fecha, setFecha] = useState(obtenerFechaHoy());
  const [criaDestino, setCriaDestino] = useState<CriaDestino>('retenida');
  const [nota, setNota] = useState('');

  // Reinicia el formulario cada vez que se abre.
  useEffect(() => {
    if (open) {
      setFecha(obtenerFechaHoy());
      setCriaDestino('retenida');
      setNota('');
    }
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const resultado = await registrarParto(animalId, { fecha, criaDestino, nota });
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido registrando el parto');
      return;
    }
    toast.success('Parto registrado');
    onRegistrado();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Registrar parto</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="parto-fecha">Fecha del parto</Label>
              <Input
                id="parto-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parto-destino">Destino de la cría</Label>
              <Select value={criaDestino} onValueChange={(v) => setCriaDestino(v as CriaDestino)}>
                <SelectTrigger id="parto-destino">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DESTINOS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parto-nota">Nota (opcional)</Label>
              <Textarea id="parto-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
