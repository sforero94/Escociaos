// ARCHIVO: components/hato/components/EditarAnimalDialog.tsx
// DESCRIPCIÓN: Diálogo "Editar" de la ficha (HojaDeVida) -- corrige in-place
// numero/nombre/etapa/estado/raza/fecha_nacimiento de UN `hato_animales` ya
// existente. `numero` es la renumeración que pidió el dueño para cuando
// Martha retagea el hato (migración 066: atributo mutable -- "chapeta
// actual" -- NUNCA la identidad, que sigue siendo `id`). Gateado a
// Administrador/Gerencia por el caller (mismo patrón que
// `ganado/GanadoMovimientos.tsx`/`GanadoDashboard.tsx`: `canEdit` decide si
// el botón "Editar" existe, no si el diálogo se puede abrir sin permiso).
//
// NO crea animales nuevos -- fuera de alcance de este diálogo.

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActualizarHatoAnimal, type HatoAnimalEdicion } from '../hooks/useActualizarHatoAnimal';
import type { HatoAnimalRow, EtapaHato, EstadoAnimalHato } from '@/types/hato';

const ETAPAS: { value: EtapaHato; label: string }[] = [
  { value: 'ternera', label: 'Ternera' },
  { value: 'novilla', label: 'Novilla' },
  { value: 'vaca', label: 'Vaca' },
  { value: 'toro', label: 'Toro' },
];

const ESTADOS: { value: EstadoAnimalHato; label: string }[] = [
  { value: 'activa', label: 'Activa' },
  { value: 'vendida', label: 'Vendida' },
  { value: 'muerta', label: 'Muerta' },
  { value: 'descartada', label: 'Descartada' },
];

/** Estado local del formulario: strings vacíos en vez de `null` para que los
 * inputs controlados no salten entre controlado/no-controlado; se normaliza
 * a `HatoAnimalEdicion` (con `null`) solo al enviar. */
interface FormState {
  numero: number | undefined;
  nombre: string;
  etapa: EtapaHato;
  estado: EstadoAnimalHato;
  raza: string;
  fecha_nacimiento: string;
}

function formDesdeAnimal(animal: HatoAnimalRow): FormState {
  return {
    numero: animal.numero ?? undefined,
    nombre: animal.nombre ?? '',
    etapa: animal.etapa,
    estado: animal.estado,
    raza: animal.raza ?? '',
    fecha_nacimiento: animal.fecha_nacimiento ?? '',
  };
}

function edicionDesdeForm(form: FormState): HatoAnimalEdicion {
  return {
    numero: form.numero ?? null,
    nombre: form.nombre.trim() || null,
    etapa: form.etapa,
    estado: form.estado,
    raza: form.raza.trim() || null,
    fecha_nacimiento: form.fecha_nacimiento || null,
  };
}

export function EditarAnimalDialog({
  open,
  onOpenChange,
  animal,
  onGuardado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal: HatoAnimalRow;
  /** Se llama tras un guardado exitoso, antes de cerrar el diálogo -- el
   * caller decide cómo refrescar (HojaDeVida vuelve a llamar `reload()` de
   * `useHatoAnimal`). */
  onGuardado: () => void;
}) {
  const { actualizar, guardando } = useActualizarHatoAnimal();
  const [form, setForm] = useState<FormState>(() => formDesdeAnimal(animal));

  // Reinicia el formulario cada vez que se abre el diálogo -- evita
  // arrastrar una edición sin guardar de una apertura anterior.
  useEffect(() => {
    if (open) setForm(formDesdeAnimal(animal));
  }, [open, animal]);

  const actualizarCampo = <K extends keyof FormState>(campo: K, valor: FormState[K]) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const resultado = await actualizar(animal.id, edicionDesdeForm(form));
    if (!resultado.ok) {
      // Colisión de caravana u otro error: se muestra el mensaje amigable y
      // el diálogo queda abierto para corregir -- nunca se cierra en error.
      toast.error(resultado.error ?? 'Error desconocido actualizando el animal');
      return;
    }
    toast.success('Animal actualizado');
    onGuardado();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Editar animal</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="editar-animal-numero">Número (caravana)</Label>
                <NumberInput
                  id="editar-animal-numero"
                  value={form.numero}
                  onChange={(valor) => actualizarCampo('numero', valor)}
                  decimals={0}
                  placeholder="Sin caravana"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editar-animal-nombre">Nombre</Label>
                <Input
                  id="editar-animal-nombre"
                  value={form.nombre}
                  onChange={(e) => actualizarCampo('nombre', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="editar-animal-etapa">Etapa</Label>
                <Select value={form.etapa} onValueChange={(v) => actualizarCampo('etapa', v as EtapaHato)}>
                  <SelectTrigger id="editar-animal-etapa">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ETAPAS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editar-animal-estado">Estado</Label>
                <Select value={form.estado} onValueChange={(v) => actualizarCampo('estado', v as EstadoAnimalHato)}>
                  <SelectTrigger id="editar-animal-estado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="editar-animal-raza">Raza</Label>
                <Input
                  id="editar-animal-raza"
                  value={form.raza}
                  onChange={(e) => actualizarCampo('raza', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editar-animal-fecha-nacimiento">Fecha de nacimiento</Label>
                <Input
                  id="editar-animal-fecha-nacimiento"
                  type="date"
                  value={form.fecha_nacimiento}
                  onChange={(e) => actualizarCampo('fecha_nacimiento', e.target.value)}
                />
              </div>
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
