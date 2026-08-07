// ARCHIVO: components/hato/components/MarcarCicloDialog.tsx
// DESCRIPCIÓN: T4a (S3, docs/plan_hato_ciclo_manual_override.md §3.5) --
// diálogo único para las 4 marcas manuales del ciclo reproductivo: preñada,
// confirmada, seca, parida. Escribe 1-2 `hato_eventos` vía
// `useMarcarCicloHato` (un solo INSERT, atómico).
//
// D-7: solo Gerencia. El gate es el ROL (RoleGuard-equivalente inline),
// nunca el resultado de la consulta -- mismo patrón que
// `ProduccionQuincenalForm`/`ProduccionView` (candado compacto si el rol no
// alcanza, skeleton mientras `useAuth().isLoading` en vez de un hueco en
// blanco, QA FIX 5 de esa sesión). No se usa el componente genérico
// `RoleGuard` directo porque su fallback por defecto es una tarjeta a
// pantalla completa (`min-h-[60vh]`), que no cabe en un `DialogContent
// size="sm"`.
//
// Cabecera fija "Estado actual: {antes} → quedará: {despues}"
// (`proyectarEstadoTrasMarca`) -- hace visible D-5 sin explicárselo a nadie.

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/contexts/AuthContext';
import { useMarcarCicloHato } from '../hooks/useMarcarCicloHato';
import { EstadoChip } from './EstadoChip';
import {
  necesitaAnclaServicio,
  proyectarEstadoTrasMarca,
  validarMarcaCiclo,
  type AnclaServicioInput,
  type InputMarcaCiclo,
  type MarcaCiclo,
  type ModoAnclaServicio,
} from '@/utils/hatoCicloManual';
import { chipEstadoReproductivo } from '@/utils/hatoUi';
import { obtenerFechaHoy } from '@/utils/fechas';
import type { CriaDestino } from '@/types/hato';

const MARCAS: { value: MarcaCiclo; label: string }[] = [
  { value: 'preñada', label: 'Preñada' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'seca', label: 'Seca' },
  { value: 'parida', label: 'Parida' },
];

const DESTINOS: { value: CriaDestino; label: string }[] = [
  { value: 'retenida', label: 'Cría retenida' },
  { value: 'hembra_vendida', label: 'Hembra vendida' },
  { value: 'macho_vendido', label: 'Macho vendido' },
  { value: 'muerta', label: 'Cría muerta' },
  { value: 'aborto', label: 'Aborto' },
];

function CandadoGerencia() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Lock className="w-4 h-4 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Marcar ciclo reproductivo</p>
        <p className="text-xs text-gray-500">Preñada, confirmada, seca y parida requieren permisos de Gerencia.</p>
      </div>
    </div>
  );
}

function MarcarCicloSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="h-9 bg-gray-100 rounded-lg" />
      <div className="h-24 bg-gray-100 rounded-lg" />
      <div className="h-9 bg-gray-100 rounded-lg" />
    </div>
  );
}

interface MarcarCicloDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string | undefined;
  /** Se llama tras un guardado exitoso, antes de cerrar el diálogo -- el
   * caller decide cómo refrescar (HojaDeVida/AnimalesList vuelven a llamar
   * su propio `reload()`). */
  onGuardado: () => void;
}

export function MarcarCicloDialog({ open, onOpenChange, animalId, onGuardado }: MarcarCicloDialogProps) {
  const { profile, isLoading: authLoading, hasRole } = useAuth();
  // Solo carga mientras el diálogo está abierto -- evita 3 queries por cada
  // fila del hato si este componente se monta una sola vez y se reutiliza
  // para "acción por fila" (AnimalesList).
  const { fila, config, loading, error, marcarCiclo, guardando } = useMarcarCicloHato(open ? animalId : undefined);

  const [marca, setMarca] = useState<MarcaCiclo>('preñada');
  const [fecha, setFecha] = useState(obtenerFechaHoy());
  const [fechaAproximada, setFechaAproximada] = useState(false);
  const [criaDestino, setCriaDestino] = useState<CriaDestino>('retenida');
  const [nota, setNota] = useState('');
  const [modoAncla, setModoAncla] = useState<ModoAnclaServicio>('ninguna');
  const [anclaFechaServicio, setAnclaFechaServicio] = useState(obtenerFechaHoy());
  const [anclaMeses, setAnclaMeses] = useState<number | undefined>(undefined);

  // Reinicia el formulario cada vez que se abre -- evita arrastrar una marca
  // a medio llenar de una apertura anterior (mismo patrón que el resto del
  // módulo: EditarAnimalDialog, MuerteAnimalDialog, etc.).
  useEffect(() => {
    if (open) {
      setMarca('preñada');
      setFecha(obtenerFechaHoy());
      setFechaAproximada(false);
      setCriaDestino('retenida');
      setNota('');
      setModoAncla('ninguna');
      setAnclaFechaServicio(obtenerFechaHoy());
      setAnclaMeses(undefined);
    }
  }, [open, animalId]);

  const puedeGerencia = hasRole(['Gerencia']);
  const hoy = obtenerFechaHoy();

  const ancla: AnclaServicioInput | undefined =
    marca === 'preñada' || marca === 'confirmada'
      ? modoAncla === 'fecha_conocida'
        ? { modo: 'fecha_conocida', fechaServicio: anclaFechaServicio }
        : modoAncla === 'meses_prenez'
          ? { modo: 'meses_prenez', mesesPrenez: anclaMeses }
          : { modo: 'ninguna' }
      : undefined;

  const input: InputMarcaCiclo = {
    marca,
    fecha,
    fechaConfianza: fechaAproximada ? 'aproximada' : 'exacta',
    criaDestino: marca === 'parida' ? criaDestino : undefined,
    nota: nota.trim() || undefined,
    ancla,
  };

  const mostrarAncla = (marca === 'preñada' || marca === 'confirmada') && !!fila && necesitaAnclaServicio(fila);

  const validacion = fila && config ? validarMarcaCiclo(input, fila, config, { rol: profile?.rol ?? '', hoy }) : null;
  const proyeccion = fila && config ? proyectarEstadoTrasMarca(fila, marca, fecha, config, hoy) : null;

  const anclaIncompleta =
    mostrarAncla &&
    ((modoAncla === 'fecha_conocida' && !anclaFechaServicio) ||
      (modoAncla === 'meses_prenez' && (anclaMeses == null || anclaMeses <= 0)));

  const puedeGuardar =
    !loading &&
    !guardando &&
    !!fila &&
    !!config &&
    !!fecha &&
    (validacion?.bloqueos.length ?? 1) === 0 &&
    !anclaIncompleta;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    const resultado = await marcarCiclo(input);
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido registrando la marca del ciclo');
      return;
    }
    toast.success('Ciclo actualizado');
    onGuardado();
    onOpenChange(false);
  };

  // Contenido de acceso denegado/skeleton/error: sin DialogFooter propio --
  // el usuario cierra con la X del panel (siempre presente en DialogContent).
  const mostrarFormulario = !authLoading && puedeGerencia && !loading && !error && fila && config;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `md`, no `sm`: con la marca "Preñada"/"Confirmada" y una vaca sin
          ancla de servicio conocida, el formulario suma el bloque "¿Desde
          cuándo está servida?" a fecha+checkbox+nota -- en `sm` (384px de
          alto) ese campo quedaba pegado al pie del diálogo (auditoría de
          UI). */}
      <DialogContent size="md">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Marcar ciclo reproductivo</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {authLoading || (puedeGerencia && loading) ? (
              <MarcarCicloSkeleton />
            ) : !puedeGerencia ? (
              <CandadoGerencia />
            ) : error || !fila || !config ? (
              <p className="text-sm text-red-600">{error ?? 'No se pudo cargar el estado del animal.'}</p>
            ) : (
              <>
                {proyeccion && (
                  <div className="flex items-center gap-2 flex-wrap rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
                    <span className="text-gray-500">Estado actual:</span>
                    <EstadoChip chip={chipEstadoReproductivo(proyeccion.antes)} />
                    <span className="text-gray-400">→</span>
                    <span className="text-gray-500">quedará:</span>
                    <EstadoChip chip={chipEstadoReproductivo(proyeccion.despues)} />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Marca</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={marca}
                    onValueChange={(v) => v && setMarca(v as MarcaCiclo)}
                    className="w-full"
                  >
                    {MARCAS.map((m) => (
                      <ToggleGroupItem key={m.value} value={m.value} className="text-xs">
                        {m.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="marca-ciclo-fecha">Fecha</Label>
                    <Input
                      id="marca-ciclo-fecha"
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex items-end pb-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                      <Checkbox checked={fechaAproximada} onCheckedChange={(v) => setFechaAproximada(v === true)} />
                      Fecha aproximada
                    </label>
                  </div>
                </div>

                {marca === 'parida' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="marca-ciclo-destino">Destino de la cría</Label>
                    <Select value={criaDestino} onValueChange={(v) => setCriaDestino(v as CriaDestino)}>
                      <SelectTrigger id="marca-ciclo-destino">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DESTINOS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {mostrarAncla && (
                  <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                    <Label>¿Desde cuándo está servida?</Label>
                    <Select value={modoAncla} onValueChange={(v) => setModoAncla(v as ModoAnclaServicio)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fecha_conocida">Fecha de servicio conocida</SelectItem>
                        <SelectItem value="meses_prenez">Meses de preñez (aproximado)</SelectItem>
                        <SelectItem value="ninguna">No sé / no aplica</SelectItem>
                      </SelectContent>
                    </Select>
                    {modoAncla === 'fecha_conocida' && (
                      <Input
                        type="date"
                        value={anclaFechaServicio}
                        onChange={(e) => setAnclaFechaServicio(e.target.value)}
                      />
                    )}
                    {modoAncla === 'meses_prenez' && (
                      <NumberInput
                        value={anclaMeses}
                        onChange={setAnclaMeses}
                        decimals={1}
                        placeholder="Meses de preñez"
                      />
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="marca-ciclo-nota">Nota (opcional)</Label>
                  <Textarea id="marca-ciclo-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
                </div>

                {validacion && validacion.advertencias.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
                    {validacion.advertencias.map((a, i) => (
                      <p key={i} className="text-xs text-amber-700">{a}</p>
                    ))}
                  </div>
                )}

                {validacion && validacion.bloqueos.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-1">
                    {validacion.bloqueos.map((b, i) => (
                      <p key={i} className="text-xs text-red-700">{b}</p>
                    ))}
                  </div>
                )}
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
                Guardar
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
