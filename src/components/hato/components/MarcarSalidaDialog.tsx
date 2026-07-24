// ARCHIVO: components/hato/components/MarcarSalidaDialog.tsx
// DESCRIPCIÓN: Diálogo de acción rápida "Marcar vendida / muerta" de la
// Hoja de Vida (Figma alignment spec §3). A diferencia de "Registrar
// parto", esta acción SÍ toca `hato_animales.estado` además de loguear el
// evento -- ver la nota larga en `useEventoRapidoHato.ts` sobre por qué
// (num_partos se deriva de eventos, `estado` no).

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

const TIPOS: { value: 'venta' | 'muerte'; label: string }[] = [
  { value: 'venta', label: 'Venta' },
  { value: 'muerte', label: 'Muerte' },
];

export function MarcarSalidaDialog({
  open,
  onOpenChange,
  animalId,
  onRegistrado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  /** Se llama tras un guardado exitoso -- el caller (`HojaDeVida`) vuelve a
   * llamar `reload()` de `useHatoAnimal` para que el chip de estado y la
   * franja de estadísticas reflejen la salida de inmediato. */
  onRegistrado: () => void;
}) {
  const { marcarSalida, guardando } = useEventoRapidoHato();
  const [tipo, setTipo] = useState<'venta' | 'muerte'>('venta');
  const [fecha, setFecha] = useState(obtenerFechaHoy());
  const [nota, setNota] = useState('');

  useEffect(() => {
    if (open) {
      setTipo('venta');
      setFecha(obtenerFechaHoy());
      setNota('');
    }
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const resultado = await marcarSalida(animalId, { tipo, fecha, nota });
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido registrando la salida del animal');
      return;
    }
    toast.success(tipo === 'venta' ? 'Animal marcado como vendido' : 'Animal marcado como muerto');
    onRegistrado();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Marcar vendida / muerta</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="salida-tipo">Tipo de salida</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as 'venta' | 'muerte')}>
                <SelectTrigger id="salida-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="salida-fecha">Fecha</Label>
              <Input
                id="salida-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="salida-nota">Nota (opcional)</Label>
              <Textarea id="salida-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
            </div>
            <p className="text-xs text-gray-500">
              Esto marca al animal como {tipo === 'venta' ? 'vendido' : 'muerto'} en toda la app (deja de contar en
              las listas y KPIs del hato activo) y queda registrado en su línea de tiempo.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={guardando}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
