// ARCHIVO: components/hato/components/ToroFormDialog.tsx
// DESCRIPCIÓN: Diálogo crear/editar de `hato_toros` (G4/V12, S10). Se abre
// vacío para "Nuevo toro" o precargado con un `HatoToroRow` para "Editar".
// La colisión de nombre (índice único `lower(nombre)`, migración 053) se
// traduce a un mensaje en español por `useHatoToros.ts` -- el diálogo nunca
// muestra el error crudo de Postgres y queda abierto para corregir.

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHatoToros, type HatoToroEdicion } from '../hooks/useHatoToros';
import type { HatoToroRow, TipoServicioHato } from '@/types/hato';

const TIPOS: { value: string; label: string }[] = [
  { value: 'sin_especificar', label: 'Sin especificar' },
  { value: 'monta', label: 'Monta' },
  { value: 'inseminacion', label: 'Inseminación' },
];

interface FormState {
  nombre: string;
  tipo: string;
  raza: string;
  activo: boolean;
}

function formDesdeToro(toro: HatoToroRow | null): FormState {
  return {
    nombre: toro?.nombre ?? '',
    tipo: toro?.tipo ?? 'sin_especificar',
    raza: toro?.raza ?? '',
    activo: toro?.activo ?? true,
  };
}

function edicionDesdeForm(form: FormState): HatoToroEdicion {
  return {
    nombre: form.nombre.trim(),
    tipo: form.tipo === 'sin_especificar' ? null : (form.tipo as TipoServicioHato),
    raza: form.raza.trim() || null,
    activo: form.activo,
  };
}

export function ToroFormDialog({
  open,
  onOpenChange,
  toro,
  onGuardado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = creando un toro nuevo; un `HatoToroRow` = editando uno existente. */
  toro: HatoToroRow | null;
  onGuardado: () => void;
}) {
  const { crearToro, actualizarToro, guardando } = useHatoToros();
  const [form, setForm] = useState<FormState>(() => formDesdeToro(toro));

  useEffect(() => {
    if (open) setForm(formDesdeToro(toro));
  }, [open, toro]);

  const actualizarCampo = <K extends keyof FormState>(campo: K, valor: FormState[K]) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toast.error('El nombre del toro es obligatorio');
      return;
    }
    const edicion = edicionDesdeForm(form);
    const resultado = toro ? await actualizarToro(toro.id, edicion) : await crearToro(edicion);
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido guardando el toro');
      return;
    }
    toast.success(toro ? 'Toro actualizado' : 'Toro creado');
    onGuardado();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>{toro ? 'Editar toro' : 'Nuevo toro'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="toro-nombre">Nombre</Label>
              <Input
                id="toro-nombre"
                value={form.nombre}
                onChange={(e) => actualizarCampo('nombre', e.target.value)}
                placeholder="Ej. Fabace"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="toro-tipo">Tipo de servicio</Label>
              <Select value={form.tipo} onValueChange={(v) => actualizarCampo('tipo', v)}>
                <SelectTrigger id="toro-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="toro-raza">Raza</Label>
              <Input
                id="toro-raza"
                value={form.raza}
                onChange={(e) => actualizarCampo('raza', e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
              <Label htmlFor="toro-activo">Activo</Label>
              <Switch id="toro-activo" checked={form.activo} onCheckedChange={(v) => actualizarCampo('activo', v)} />
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
