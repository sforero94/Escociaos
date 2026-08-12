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
//
// "Forzar esta etapa" (migración 092, corrección de precedencia D-13,
// 2026-08-06): la categoría de un animal (ternera/novilla/vaca) se CALCULA
// de fecha_nacimiento + num_partos (`calcularEtapaHato`, hatoCategorias.ts)
// -- editar `etapa` acá SOLO tiene efecto en la categoría mostrada cuando
// `etapa_forzada` está en TRUE. Es el override de "el cálculo se equivocó"
// (típicamente una fecha de nacimiento mal digitada) -- de fácil entrada
// (el switch) y de fácil salida (apagarlo vuelve al cálculo automático,
// sin perder el valor de `etapa` que quedó guardado).

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useActualizarHatoAnimal, type HatoAnimalEdicion } from '../hooks/useActualizarHatoAnimal';
import { useCandidatosGenealogia } from '../hooks/useCandidatosGenealogia';
import { candidatasAMadre, etiquetaCandidatoGenealogia } from '@/utils/hato/genealogiaHato';
import { ordenarPorValor } from '@/utils/ordenarAnimalesHato';
import type { HatoAnimalRow, EtapaHato, EstadoAnimalHato } from '@/types/hato';

// Exportado para que `CrearAnimalDialog.tsx` (§4 del Figma spec) use el
// mismo catálogo de etapas -- una sola fuente, nunca dos listas que puedan
// desalinearse.
export const ETAPAS: { value: EtapaHato; label: string }[] = [
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
  etapaForzada: boolean;
  /** `SIN_REGISTRAR` en vez de `''`: Radix Select trata la cadena vacía como
   * "sin valor" y no deja seleccionar esa opción, así que quitar una madre
   * ya puesta sería imposible. Se traduce a `null` al enviar. */
  madreId: string;
  padreToroId: string;
}

/** Centinela de "sin registrar" para los dos selectores de genealogía. */
const SIN_REGISTRAR = 'sin_registrar';

function formDesdeAnimal(animal: HatoAnimalRow): FormState {
  return {
    numero: animal.numero ?? undefined,
    nombre: animal.nombre ?? '',
    etapa: animal.etapa,
    estado: animal.estado,
    raza: animal.raza ?? '',
    fecha_nacimiento: animal.fecha_nacimiento ?? '',
    etapaForzada: animal.etapa_forzada,
    madreId: animal.madre_id ?? SIN_REGISTRAR,
    padreToroId: animal.padre_toro_id ?? SIN_REGISTRAR,
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
    etapa_forzada: form.etapaForzada,
    madre_id: form.madreId === SIN_REGISTRAR ? null : form.madreId,
    padre_toro_id: form.padreToroId === SIN_REGISTRAR ? null : form.padreToroId,
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
  const { candidatos, loading: cargandoCandidatos } = useCandidatosGenealogia(open);
  const [form, setForm] = useState<FormState>(() => formDesdeAnimal(animal));

  // Candidatas a madre: sin el propio animal, sin toros y sin las que
  // nacieron después que él -- ver `genealogiaHato.ts` para el porqué.
  const madres = candidatasAMadre(candidatos.animales, animal);
  const toros = ordenarPorValor(candidatos.toros, (t) => t.nombre, 'asc');

  // La madre guardada puede quedar fuera de la lista filtrada (una fecha de
  // nacimiento mal digitada la vuelve "imposible"). Si eso pasa, el Select
  // se quedaría en blanco y guardar la borraría sin que nadie lo pidiera:
  // se la agrega de vuelta como opción para que siga visible y elegible.
  const madreGuardadaFaltante =
    form.madreId !== SIN_REGISTRAR && !madres.some((m) => m.id === form.madreId)
      ? candidatos.animales.find((a) => a.id === form.madreId)
      : undefined;
  const opcionesMadre = madreGuardadaFaltante ? [madreGuardadaFaltante, ...madres] : madres;

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

            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="editar-animal-etapa-forzada">Forzar esta etapa</Label>
                <p className="text-xs text-gray-500">
                  {form.etapaForzada
                    ? 'Etapa forzada manualmente -- el cálculo automático (fecha de nacimiento y partos) no la va a cambiar hasta que apagues esto.'
                    : 'La etapa se calcula sola a partir de la fecha de nacimiento y los partos. Actívalo solo si ese cálculo está mal (ej. una fecha de nacimiento equivocada).'}
                </p>
              </div>
              <Switch
                id="editar-animal-etapa-forzada"
                checked={form.etapaForzada}
                onCheckedChange={(v) => actualizarCampo('etapaForzada', v)}
              />
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

            <div className="space-y-3 rounded-lg border border-gray-200 px-3 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Genealogía</p>
                <p className="text-xs text-gray-500">
                  Deja &quot;Sin registrar&quot; si no se sabe — nunca se inventa un dato que no esté confirmado.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="editar-animal-madre">Madre</Label>
                  <Select
                    value={form.madreId}
                    onValueChange={(v) => actualizarCampo('madreId', v)}
                    disabled={cargandoCandidatos}
                  >
                    <SelectTrigger id="editar-animal-madre">
                      <SelectValue placeholder={cargandoCandidatos ? 'Cargando…' : 'Sin registrar'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_REGISTRAR}>Sin registrar</SelectItem>
                      {opcionesMadre.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{etiquetaCandidatoGenealogia(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Solo se listan las nacidas antes que este animal: es lo que
                      evita elegir a la MOTA equivocada entre dos homónimas. */}
                  {form.fecha_nacimiento && (
                    <p className="text-xs text-gray-500">Solo animales nacidos antes que este.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="editar-animal-padre">Padre (toro)</Label>
                  <Select
                    value={form.padreToroId}
                    onValueChange={(v) => actualizarCampo('padreToroId', v)}
                    disabled={cargandoCandidatos}
                  >
                    <SelectTrigger id="editar-animal-padre">
                      <SelectValue placeholder={cargandoCandidatos ? 'Cargando…' : 'Sin registrar'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_REGISTRAR}>Sin registrar</SelectItem>
                      {toros.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Del catálogo de toros (Pajillas).</p>
                </div>
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
