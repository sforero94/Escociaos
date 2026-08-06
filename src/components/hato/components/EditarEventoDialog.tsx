// ARCHIVO: components/hato/components/EditarEventoDialog.tsx
// DESCRIPCIÓN: T4b (S3, docs/plan_hato_ciclo_manual_override.md §4.6) --
// corrige o elimina UN `hato_eventos` ya registrado, incluidas las 4
// marcas manuales de T4a. `tipo` y `animal_id` NO son editables: cambiar el
// tipo es borrar y crear, no corregir (§4.6). La traza la escribe el
// trigger de la migración 084 sola -- este diálogo solo hace el
// UPDATE/DELETE; el "motivo" opcional viaja en `datos.motivo_correccion`,
// el único canal que el trigger sabe leer.
//
// Chip de caducidad (§4.4 del diseño): si el evento viene de un chequeo
// (`chequeo_vaca_id` no nulo), una re-aprobación de ESE chequeo (065) borra
// y re-inserta sus eventos derivados -- cualquier corrección hecha aquí se
// pierde entonces. Se avisa ANTES de guardar, no después.

import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCorregirEventoHato } from '../hooks/useCorregirEventoHato';
import { formatShortDate } from '@/utils/format';
import type { ConfianzaFecha, CriaDestino, HatoEventoRow, TipoEventoHato, TipoServicioHato } from '@/types/hato';

const DESTINOS: { value: CriaDestino; label: string }[] = [
  { value: 'retenida', label: 'Cría retenida' },
  { value: 'hembra_vendida', label: 'Hembra vendida' },
  { value: 'macho_vendido', label: 'Macho vendido' },
  { value: 'muerta', label: 'Cría muerta' },
  { value: 'aborto', label: 'Aborto' },
];

const TIPOS_SERVICIO: { value: TipoServicioHato; label: string }[] = [
  { value: 'monta', label: 'Monta' },
  { value: 'inseminacion', label: 'Inseminación' },
];

const LABEL_TIPO_EVENTO: Record<TipoEventoHato, string> = {
  servicio: 'servicio',
  celo: 'celo (retorno)',
  confirmacion_prenez: 'confirmación de preñez',
  parto: 'parto',
  aborto: 'aborto',
  secado_real: 'secado real',
  venta: 'venta',
  muerte: 'muerte',
  compra: 'compra',
  cambio_etapa: 'cambio de etapa',
  rechequeo: 'rechequeo',
};

function notaDesdeDatos(datos: Record<string, unknown> | null): string {
  const nota = datos?.nota;
  return typeof nota === 'string' ? nota : '';
}

export interface EditarEventoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evento: HatoEventoRow | null;
  /** Fecha del chequeo que originó `evento.chequeo_vaca_id`, ya resuelta
   * por el caller (mapa `chequeo_vaca_id -> hato_chequeos.fecha` construido
   * desde `detalle.chequeos`, sin una query nueva) -- `null` si no se pudo
   * resolver (evento manual, o el mapa no lo cubre). */
  chequeoFecha: string | null;
  nombresToroPorId: Record<string, string>;
  /** Se llama tras un guardado/eliminado exitoso, antes de cerrar el
   * diálogo -- el caller decide cómo refrescar. */
  onGuardado: () => void;
}

export function EditarEventoDialog({
  open,
  onOpenChange,
  evento,
  chequeoFecha,
  nombresToroPorId,
  onGuardado,
}: EditarEventoDialogProps) {
  const { editar, eliminar, guardando } = useCorregirEventoHato();

  const [fecha, setFecha] = useState('');
  const [fechaConfianza, setFechaConfianza] = useState<ConfianzaFecha>('exacta');
  const [tipoServicio, setTipoServicio] = useState<TipoServicioHato | ''>('');
  const [toroId, setToroId] = useState('');
  const [criaDestino, setCriaDestino] = useState<CriaDestino | ''>('');
  const [nota, setNota] = useState('');
  const [motivo, setMotivo] = useState('');
  const [confirmEliminarOpen, setConfirmEliminarOpen] = useState(false);

  // Reinicia el formulario cada vez que se abre con un evento -- evita
  // arrastrar una edición sin guardar de una apertura anterior.
  useEffect(() => {
    if (open && evento) {
      setFecha(evento.fecha);
      setFechaConfianza(evento.fecha_confianza);
      setTipoServicio(evento.tipo_servicio ?? '');
      setToroId(evento.toro_id ?? '');
      setCriaDestino(evento.cria_destino ?? '');
      setNota(notaDesdeDatos(evento.datos));
      setMotivo('');
    }
  }, [open, evento]);

  if (!evento) return null;

  const esServicio = evento.tipo === 'servicio';
  const esParto = evento.tipo === 'parto';
  const vieneDeChequeo = evento.chequeo_vaca_id != null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fecha) return;
    const resultado = await editar(evento, {
      fecha,
      fecha_confianza: fechaConfianza,
      tipo_servicio: esServicio ? tipoServicio || null : evento.tipo_servicio,
      toro_id: esServicio ? toroId || null : evento.toro_id,
      cria_destino: esParto ? criaDestino || null : evento.cria_destino,
      nota,
      motivo,
    });
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido corrigiendo el evento');
      return;
    }
    toast.success('Evento corregido');
    onGuardado();
    onOpenChange(false);
  };

  const handleEliminar = async () => {
    const resultado = await eliminar(evento.id);
    setConfirmEliminarOpen(false);
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido eliminando el evento');
      return;
    }
    toast.success('Evento eliminado');
    onGuardado();
    onOpenChange(false);
  };

  const avisoCaducidad = vieneDeChequeo
    ? `Este evento viene del chequeo${chequeoFecha ? ` del ${formatShortDate(chequeoFecha)}` : ''}. Si se vuelve a aprobar ese chequeo, esta corrección se pierde — el camino permanente es corregir la planilla y re-subirla.`
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* `md`, no `sm`: aviso de caducidad + fecha/confianza + (servicio:
            tipo+toro, o parto: destino) + nota + motivo + el pie con
            "Eliminar evento" no cabían en `sm` (384px de alto) sin dejar el
            último campo pegado al pie (auditoría de UI). */}
        <DialogContent size="md">
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
            <DialogHeader>
              <DialogTitle>Corregir {LABEL_TIPO_EVENTO[evento.tipo] ?? evento.tipo}</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-4">
              {avisoCaducidad && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">{avisoCaducidad}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="editar-evento-fecha">Fecha</Label>
                  <Input
                    id="editar-evento-fecha"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="editar-evento-confianza">Confianza de la fecha</Label>
                  <Select value={fechaConfianza} onValueChange={(v) => setFechaConfianza(v as ConfianzaFecha)}>
                    <SelectTrigger id="editar-evento-confianza">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exacta">Exacta</SelectItem>
                      <SelectItem value="aproximada">Aproximada</SelectItem>
                      <SelectItem value="desconocida">Desconocida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {esServicio && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="editar-evento-tipo-servicio">Tipo de servicio</Label>
                    <Select
                      value={tipoServicio || undefined}
                      onValueChange={(v) => setTipoServicio(v as TipoServicioHato)}
                    >
                      <SelectTrigger id="editar-evento-tipo-servicio">
                        <SelectValue placeholder="Sin especificar" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_SERVICIO.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="editar-evento-toro">Toro</Label>
                    <Select value={toroId || undefined} onValueChange={setToroId}>
                      <SelectTrigger id="editar-evento-toro">
                        <SelectValue placeholder="Sin especificar" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(nombresToroPorId).map(([id, nombre]) => (
                          <SelectItem key={id} value={id}>{nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {esParto && (
                <div className="space-y-1.5">
                  <Label htmlFor="editar-evento-destino">Destino de la cría</Label>
                  <Select value={criaDestino || undefined} onValueChange={(v) => setCriaDestino(v as CriaDestino)}>
                    <SelectTrigger id="editar-evento-destino">
                      <SelectValue placeholder="Sin especificar" />
                    </SelectTrigger>
                    <SelectContent>
                      {DESTINOS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="editar-evento-nota">Nota (opcional)</Label>
                <Textarea id="editar-evento-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editar-evento-motivo">Motivo de la corrección (opcional)</Label>
                <Textarea
                  id="editar-evento-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="¿Por qué se corrige este dato?"
                  rows={2}
                />
              </div>
            </DialogBody>
            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setConfirmEliminarOpen(true)}
                disabled={guardando}
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar evento
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={guardando || !fecha}>
                  {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar corrección
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmEliminarOpen}
        onOpenChange={setConfirmEliminarOpen}
        title="¿Eliminar este evento?"
        description={
          avisoCaducidad
            ? `${avisoCaducidad} Queda registrado en el historial de correcciones.`
            : 'Esta acción no se puede deshacer directamente, aunque queda registrada en el historial de correcciones.'
        }
        confirmLabel="Eliminar"
        onConfirm={handleEliminar}
        destructive
      />
    </>
  );
}
