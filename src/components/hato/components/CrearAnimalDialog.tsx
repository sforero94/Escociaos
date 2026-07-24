// ARCHIVO: components/hato/components/CrearAnimalDialog.tsx
// DESCRIPCIÓN: Diálogo "+ Registrar" de `AnimalesList.tsx` (Figma alignment
// spec §4) -- alta manual de un animal que todavía no tiene ficha (compra o
// nacimiento no capturado por un chequeo). Gateado a Administrador/Gerencia
// por el caller, mismo patrón que `EditarAnimalDialog.tsx`.
//
// Valida en cliente que una caravana FÍSICA nueva quede por debajo de la
// franja reservada 800-999 (`esNumeroProvisional`, migración 066 + spec
// §0c/"Provisional-period guardrails") -- esa franja es para desempates de
// importación y números de trabajo, nunca para una caravana que Martha va a
// colgar de verdad. La colisión sobre `hato_animales_numero_activa_unique`
// (23505) la valida el servidor vía `useCrearHatoAnimal`.

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrearHatoAnimal } from '../hooks/useCrearHatoAnimal';
import { ETAPAS } from './EditarAnimalDialog';
import { esNumeroProvisional, RANGO_NUMEROS_PROVISIONALES } from '@/utils/importHato/overridesChapeta';
import type { EtapaHato, OrigenAnimalHato } from '@/types/hato';

const ORIGENES: { value: OrigenAnimalHato; label: string }[] = [
  { value: 'compra', label: 'Compra' },
  { value: 'nacimiento', label: 'Nacimiento' },
];

interface FormState {
  numero: number | undefined;
  nombre: string;
  etapa: EtapaHato;
  raza: string;
  fecha_nacimiento: string;
  origen: OrigenAnimalHato;
}

const FORM_INICIAL: FormState = {
  numero: undefined,
  nombre: '',
  etapa: 'ternera',
  raza: '',
  fecha_nacimiento: '',
  origen: 'compra',
};

export function CrearAnimalDialog({
  open,
  onOpenChange,
  onCreado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama tras un alta exitosa, antes de cerrar el diálogo -- el caller
   * decide cómo refrescar (`AnimalesList` vuelve a llamar `reload()` de
   * `useHatoAnimales`). */
  onCreado: () => void;
}) {
  const { crear, guardando } = useCrearHatoAnimal();
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [errorNumero, setErrorNumero] = useState<string | null>(null);

  // Reinicia el formulario cada vez que se abre -- evita arrastrar un alta
  // sin guardar de una apertura anterior.
  useEffect(() => {
    if (open) {
      setForm(FORM_INICIAL);
      setErrorNumero(null);
    }
  }, [open]);

  const actualizarCampo = <K extends keyof FormState>(campo: K, valor: FormState[K]) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (form.numero != null && esNumeroProvisional(form.numero)) {
      setErrorNumero(
        `El rango ${RANGO_NUMEROS_PROVISIONALES.min}-${RANGO_NUMEROS_PROVISIONALES.max} está reservado para números provisionales -- una caravana física nueva debe ser menor a ${RANGO_NUMEROS_PROVISIONALES.min}.`,
      );
      return;
    }
    setErrorNumero(null);

    const resultado = await crear({
      numero: form.numero ?? null,
      nombre: form.nombre.trim() || null,
      etapa: form.etapa,
      raza: form.raza.trim() || null,
      fecha_nacimiento: form.fecha_nacimiento || null,
      origen: form.origen,
    });
    if (!resultado.ok) {
      // Colisión de caravana u otro error: mensaje amigable, el diálogo
      // queda abierto para corregir -- nunca se cierra en error.
      toast.error(resultado.error ?? 'Error desconocido creando el animal');
      return;
    }
    toast.success('Animal registrado');
    onCreado();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Registrar animal</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="crear-animal-numero">Número (caravana)</Label>
                <NumberInput
                  id="crear-animal-numero"
                  value={form.numero}
                  onChange={(valor) => {
                    actualizarCampo('numero', valor);
                    setErrorNumero(null);
                  }}
                  decimals={0}
                  placeholder="Sin caravana"
                />
                {errorNumero && <p className="text-xs text-red-600">{errorNumero}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crear-animal-nombre">Nombre</Label>
                <Input
                  id="crear-animal-nombre"
                  value={form.nombre}
                  onChange={(e) => actualizarCampo('nombre', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="crear-animal-etapa">Etapa</Label>
                <Select value={form.etapa} onValueChange={(v) => actualizarCampo('etapa', v as EtapaHato)}>
                  <SelectTrigger id="crear-animal-etapa">
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
                <Label htmlFor="crear-animal-origen">Origen</Label>
                <Select value={form.origen} onValueChange={(v) => actualizarCampo('origen', v as OrigenAnimalHato)}>
                  <SelectTrigger id="crear-animal-origen">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORIGENES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="crear-animal-raza">Raza</Label>
                <Input
                  id="crear-animal-raza"
                  value={form.raza}
                  onChange={(e) => actualizarCampo('raza', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crear-animal-fecha-nacimiento">Fecha de nacimiento</Label>
                <Input
                  id="crear-animal-fecha-nacimiento"
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
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
