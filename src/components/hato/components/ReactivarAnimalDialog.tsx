// ARCHIVO: components/hato/components/ReactivarAnimalDialog.tsx
// DESCRIPCIÓN: Path A ("El animal sigue en el hato") de la resolución del
// motivo `numero_animal_inactivo` (plan
// `docs/hato/plan_chequeo_novedades_implementacion.md` §4.6/§6.4): una fila
// escrita a mano en el chequeo trae una chapeta que hoy lleva un animal
// `descartada`/`vendida`/`muerta` -- cualquier `estado` no-activo, tratado
// IDÉNTICO, sin ramas (decisión del dueño, 2026-09-15: "muerta gets
// reactivation too, same as the others").
//
// Escribe EXACTAMENTE tres columnas (`useReactivarHatoAnimal.ts`): `estado`,
// `fecha_estado`, `notas`. NADA MÁS. `numero`, `nombre`, `etapa`, `raza`,
// genealogía y todo `hato_eventos` quedan intactos -- en particular el
// evento `venta`/`muerte` que cerró al animal NO se borra: "el animal
// volvió" y "la venta estuvo mal" son dos afirmaciones distintas (corregir
// la venta es `EditarEventoDialog`, deliberadamente aparte).
//
// Se escribe desde el NAVEGADOR, nunca desde el endpoint de commit (§4.7):
// `hato_correcciones` (084) sólo traza sesiones humanas (`auth.uid()` no
// nulo) -- una reactivación hecha con `service_role` no dejaría rastro en
// la única bitácora de cambios que tiene esta tabla.
//
// Va como HERMANO del diálogo de subida, nunca anidado dentro de su propio
// `Dialog` -- mismo motivo que `CrearAnimalDialog` (`SubirChequeoExcel.tsx`):
// es la forma en que Radix apila dos modales sin que cerrar el de arriba
// cierre el de abajo. El caller (`SubirChequeoExcel.tsx`) es quien, tras un
// `onReactivado` exitoso, llama `revision.corregirCampo(fila, 'numero',
// String(numero))` + `revision.recargarEstado()` -- este componente no
// conoce `RevisionChequeo`, para poder testearse y reusarse sin acoplarse a
// esa forma.

import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useReactivarHatoAnimal } from '../hooks/useReactivarHatoAnimal';
import type { AnimalFueraDelRoster } from '@/utils/importHato/ocrChequeo';

/** Rótulo en español del `estado` previo -- literal, sin inventar
 * sinónimos. Un estado desconocido se muestra tal cual llega (nunca "—":
 * es un dato real que vino de la base). */
function etiquetaEstado(estado: string): string {
  switch (estado) {
    case 'descartada':
      return 'descartada';
    case 'vendida':
      return 'vendida';
    case 'muerta':
      return 'muerta';
    default:
      return estado;
  }
}

function CandadoGerencia() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Lock className="w-4 h-4 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Reactivar animal</p>
        <p className="text-xs text-gray-500">Requiere permisos de Administrador o Gerencia.</p>
      </div>
    </div>
  );
}

function ReactivarSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="h-16 bg-gray-100 rounded-lg" />
      <div className="h-9 bg-gray-100 rounded-lg" />
    </div>
  );
}

export interface ReactivarAnimalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chapeta/nombre escritos a mano en la fila del chequeo -- verbatim,
   * response-only (`ocr.filasPromovidas`), nunca releídos de la base. */
  numeroImpreso: string;
  nombreImpreso: string;
  /** 1..N animales inactivos que hoy llevan esa chapeta. Nunca se adjudica
   * uno solo si hay más de uno -- ver el radio de selección abajo. */
  candidatos: readonly AnimalFueraDelRoster[];
  /** Fecha del chequeo que originó la fila, si ya se fijó -- alimenta la
   * nota de reactivación. `null` = todavía sin fijar, la nota se redacta
   * genérica (ver `construirNotaReactivacion`). */
  fechaChequeo: string | null;
  /** Se llama tras un guardado exitoso, ANTES de cerrar -- el caller decide
   * qué hacer con la fila (corregir el campo `numero`, recargar el estado
   * fresco del hato). */
  onReactivado: (animal: { id: string; numero: number }) => void;
}

export function ReactivarAnimalDialog({
  open,
  onOpenChange,
  numeroImpreso,
  nombreImpreso,
  candidatos,
  fechaChequeo,
  onReactivado,
}: ReactivarAnimalDialogProps) {
  const { isLoading: authLoading, hasRole } = useAuth();
  const { reactivar, verificarColision, guardando, verificandoColision } = useReactivarHatoAnimal();

  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [colision, setColision] = useState<{ id: string; nombre: string | null } | null>(null);

  const puedeEscribir = hasRole(['Administrador', 'Gerencia']);

  // Reinicia el formulario cada vez que se abre -- evita arrastrar la
  // selección de una apertura anterior (mismo patrón que el resto del
  // módulo: MarcarCicloDialog, EditarAnimalDialog...). Con UN solo
  // candidato no hay ambigüedad que adjudicar, así que se pre-selecciona;
  // con más de uno se deja sin selección (§4.6: "pre-selects none").
  useEffect(() => {
    if (open) {
      setSeleccionadoId(candidatos.length === 1 ? candidatos[0].id : null);
      setMotivo('');
      setColision(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const candidato = candidatos.find((c) => c.id === seleccionadoId) ?? null;

  // Pre-chequeo de colisión de caravana (§4.6): en cuanto hay un candidato
  // elegido, se verifica contra la base FRESCA si otro animal activo ya
  // lleva su número. Es la explicación amigable -- el `23505` real de
  // `reactivar` sigue siendo la guarda, nunca se retira por este resultado.
  useEffect(() => {
    if (!candidato) {
      setColision(null);
      return;
    }
    let vigente = true;
    void verificarColision(candidato.numero, candidato.id).then((resultado) => {
      if (vigente) setColision(resultado);
    });
    return () => {
      vigente = false;
    };
  }, [candidato, verificarColision]);

  const puedeGuardar = !authLoading && puedeEscribir && !guardando && candidato !== null && colision === null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!candidato || !puedeGuardar) return;
    const resultado = await reactivar(candidato.id, {
      fechaChequeo,
      motivo: motivo.trim() || null,
    });
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido reactivando el animal');
      if (resultado.esColisionCaravana) {
        setColision({ id: candidato.id, nombre: candidato.nombre });
      }
      return;
    }
    toast.success(`${candidato.nombre ?? `#${candidato.numero}`} reactivada`);
    onReactivado({ id: candidato.id, numero: candidato.numero });
    onOpenChange(false);
  };

  const mostrarFormulario = !authLoading && puedeEscribir;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Reactivar animal</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {authLoading ? (
              <ReactivarSkeleton />
            ) : !puedeEscribir ? (
              <CandadoGerencia />
            ) : (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <p>
                    La fila escrita a mano dice <strong>#{numeroImpreso} {nombreImpreso}</strong>. Esa caravana la
                    lleva {candidatos.length > 1 ? 'más de un animal' : 'un animal'} que el sistema tiene como
                    inactivo. Nadie puede aprobar esta fila hasta que decidas qué pasó.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>{candidatos.length > 1 ? 'Elige cuál de los dos es' : 'Animal a reactivar'}</Label>
                  {candidatos.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="radio"
                        name="reactivar-candidato"
                        checked={seleccionadoId === c.id}
                        onChange={() => setSeleccionadoId(c.id)}
                        className="accent-primary"
                      />
                      <div className="text-sm">
                        <span className="font-medium text-gray-900">
                          #{c.numero} {c.nombre ?? '(sin nombre)'}
                        </span>{' '}
                        <span className="text-gray-500">-- {etiquetaEstado(c.estado)}</span>
                      </div>
                    </label>
                  ))}
                </div>

                {candidato && verificandoColision && (
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando la caravana contra el hato activo…
                  </p>
                )}

                {colision && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>
                      La caravana {candidato?.numero} la lleva hoy <strong>{colision.nombre ?? 'otro animal'}</strong>{' '}
                      (activa). Renumera primero a ese animal, o corrige el número de esta fila en vez de reactivar.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="reactivar-motivo">Motivo (opcional)</Label>
                  <Textarea
                    id="reactivar-motivo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={2}
                    placeholder="Ej.: Uriel la vio en el potrero de Escocia."
                  />
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-1">
                  <p className="font-medium text-gray-700">Al reactivar:</p>
                  <p>Se cambia el estado a <strong>activa</strong> y la fecha de estado a hoy.</p>
                  <p>Se agrega una nota fechada explicando por qué -- lo que ya había escrito no se borra.</p>
                  <p>
                    <strong>No</strong> se toca la caravana, el nombre, la genealogía ni el evento de venta/muerte que
                    cerró al animal: eso es una decisión aparte, no parte de "el animal volvió".
                  </p>
                </div>
              </>
            )}
          </DialogBody>

          {mostrarFormulario && (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!puedeGuardar}>
                {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Reactivar
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
