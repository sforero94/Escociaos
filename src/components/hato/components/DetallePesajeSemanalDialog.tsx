// ARCHIVO: components/hato/components/DetallePesajeSemanalDialog.tsx
// DESCRIPCIÓN: al tocar una barra MEDIDA del tracker, abre la semana
// completa: mañana y tarde en la misma tabla, al lado de la planilla.
// Solo lectura hasta que Gerencia pulsa Editar. Un guardado escribe
// los dos turnos. No borra la subida: eso vive en Subidas del mes.
// Issue #297.

import { useMemo, useState, type FormEvent } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { diaBogota, horaBogota } from '@/utils/fechas';
import { formatLongDate, formatNumber, formatShortDate } from '@/utils/format';
import {
  borradorInicial,
  efectoFila,
  elegirCaptura,
  idAutorVisible,
  mesesDelRango,
  ordenarFilasPesaje,
  planGuardarSemana,
  type BorradorFila,
  type CapturaPesajeCandidata,
  type FilaPesajeSemana,
} from '@/utils/hato/detallePesajeSemanal';
import type { IdentidadAnimalHato } from '../hooks/useDatosProduccionPorVaca';
import { useDetallePesajeSemana } from '../hooks/useDetallePesajeSemana';

const ETIQUETA_SIN_AUTOR = 'Sin autor registrado';

export interface FechaPesajeVista {
  fecha: string;
  filas: FilaPesajeSemana[];
  conTurno: boolean;
}

function litrosVisibles(valor: number): string {
  const decimales = Number.isInteger(valor) ? 0 : 1;
  return formatNumber(valor, decimales);
}

function textoCelda(valor: number | null): string {
  return valor == null ? '—' : litrosVisibles(valor);
}

function nombreVaca(identidad: IdentidadAnimalHato | undefined): string {
  if (!identidad) return 'Vaca sin ficha';
  const chapeta = identidad.numero != null ? `#${identidad.numero}` : 'Sin chapeta';
  return identidad.nombre ? `${chapeta} ${identidad.nombre}` : chapeta;
}

function etiquetaOrigen(origen: string): string {
  if (origen === 'telegram') return 'Desde Telegram';
  if (origen === 'web') return 'Desde la web';
  return 'Origen sin dato';
}

function claveUrl(captura: CapturaPesajeCandidata, ruta: string): string {
  return `${captura.storageBucket}:${ruta}`;
}

function agruparFechas(filas: readonly FilaPesajeSemana[]): FechaPesajeVista[] {
  const map = new Map<string, FilaPesajeSemana[]>();
  for (const fila of filas) {
    const grupo = map.get(fila.fecha);
    if (grupo) grupo.push(fila);
    else map.set(fila.fecha, [fila]);
  }
  return [...map.keys()].sort().map((fecha) => {
    const grupo = map.get(fecha) ?? [];
    return {
      fecha,
      filas: grupo,
      conTurno: grupo.some((fila) => fila.litros_am != null || fila.litros_pm != null),
    };
  });
}

function planVacio(plan: { actualizaciones: readonly unknown[]; borrarIds: readonly string[] }): boolean {
  return plan.actualizaciones.length === 0 && plan.borrarIds.length === 0;
}

export function DetalleSemanaPesaje({
  titulo,
  subtitulo,
  fechas,
  borradores,
  identidadPorAnimal,
  capturaLigada,
  fotosDelMes,
  urls,
  autorNombre,
  puedeGerencia,
  editando,
  guardando,
  error,
  onCambiar,
  onEditar,
  onCancelar,
  onGuardar,
}: {
  titulo: string;
  subtitulo: string | null;
  fechas: FechaPesajeVista[];
  borradores: BorradorFila[];
  identidadPorAnimal: Map<string, IdentidadAnimalHato>;
  capturaLigada: CapturaPesajeCandidata | null;
  fotosDelMes: CapturaPesajeCandidata[];
  urls: Record<string, string>;
  autorNombre: string | null;
  puedeGerencia: boolean;
  editando: boolean;
  guardando: boolean;
  error: string | null;
  onCambiar: (id: string, campo: 'litros_am' | 'litros_pm' | 'litros_total', valor: string) => void;
  onEditar: () => void;
  onCancelar: () => void;
  onGuardar: () => void;
}) {
  const fotos = capturaLigada ? [capturaLigada] : fotosDelMes;
  const porId = new Map(borradores.map((b) => [b.id, b]));
  const hayFilas = fechas.some((grupo) => grupo.filas.length > 0);

  return (
    <form
      className="flex flex-col flex-1 min-h-0 gap-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (editando) onGuardar();
      }}
    >
      <DialogHeader>
        <DialogTitle>{titulo}</DialogTitle>
        {subtitulo && <p className="text-xs text-gray-500">{subtitulo}</p>}
      </DialogHeader>
      <DialogBody>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {!hayFilas ? (
          <p className="text-sm text-gray-500">Esta semana no tiene pesajes guardados.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900">Planilla</h4>
              <p className="text-sm text-gray-700">Subió {autorNombre ?? ETIQUETA_SIN_AUTOR}</p>
              {capturaLigada ? (
                <p className="text-xs text-gray-500">
                  Cargada el {formatLongDate(diaBogota(capturaLigada.creadoEn))} a las {horaBogota(capturaLigada.creadoEn)}
                  {' · '}
                  {etiquetaOrigen(capturaLigada.origen)}
                </p>
              ) : fechas.length === 1 ? (
                <p className="text-xs text-gray-500">Fecha del pesaje: {formatLongDate(fechas[0].fecha)}</p>
              ) : null}
              {!capturaLigada && fotosDelMes.length > 0 && (
                <p className="text-xs text-amber-800">
                  Estas fotos son del mismo mes. No está probado que hayan producido estas filas.
                </p>
              )}
              {fotos.length === 0 && <p className="text-sm text-gray-500">No hay foto de este mes para este pesaje.</p>}
              {fotos.map((captura) =>
                captura.storageRutas.map((ruta, indice) => {
                  const url = urls[claveUrl(captura, ruta)];
                  return url ? (
                    <img
                      key={`${captura.id}-${ruta}`}
                      src={url}
                      alt={`Planilla, página ${indice + 1}`}
                      className="w-full rounded-md border border-gray-200"
                    />
                  ) : (
                    <p key={`${captura.id}-${ruta}`} className="text-xs text-gray-500">
                      No se pudo abrir la foto {indice + 1}.
                    </p>
                  );
                }),
              )}
            </section>
            <section className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900">Datos del pesaje</h4>
              {fechas.map((grupo) => (
                <div key={grupo.fecha} className="space-y-2">
                  {fechas.length > 1 && (
                    <h5 className="text-sm font-medium text-gray-800">{formatLongDate(grupo.fecha)}</h5>
                  )}
                  <TablaFecha
                    grupo={grupo}
                    porId={porId}
                    identidadPorAnimal={identidadPorAnimal}
                    editando={editando && puedeGerencia}
                    guardando={guardando}
                    onCambiar={onCambiar}
                  />
                </div>
              ))}
              {!puedeGerencia && (
                <p className="text-xs text-gray-500">Solo Gerencia puede corregir un pesaje.</p>
              )}
            </section>
          </div>
        )}
      </DialogBody>
      {puedeGerencia && hayFilas && (
        <DialogFooter className="gap-2">
          {editando ? (
            <>
              <Button type="button" variant="outline" disabled={guardando} onClick={onCancelar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar cambios'}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={onEditar}>
              <Pencil className="w-4 h-4 mr-1.5" /> Editar
            </Button>
          )}
        </DialogFooter>
      )}
    </form>
  );
}

function TablaFecha({
  grupo,
  porId,
  identidadPorAnimal,
  editando,
  guardando,
  onCambiar,
}: {
  grupo: FechaPesajeVista;
  porId: Map<string, BorradorFila>;
  identidadPorAnimal: Map<string, IdentidadAnimalHato>;
  editando: boolean;
  guardando: boolean;
  onCambiar: (id: string, campo: 'litros_am' | 'litros_pm' | 'litros_total', valor: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vaca</TableHead>
          {grupo.conTurno ? (
            <>
              <TableHead>Mañana</TableHead>
              <TableHead>Tarde</TableHead>
              <TableHead>Total</TableHead>
            </>
          ) : (
            <TableHead>Litros</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody striped>
        {grupo.filas.map((fila) => {
          const nombre = nombreVaca(identidadPorAnimal.get(fila.animal_id));
          const borrador = porId.get(fila.id) ?? borradorInicial(fila);
          const efecto = editando ? efectoFila(fila, borrador, grupo.conTurno ? 'ambos' : null) : null;
          const totalDerivado =
            efecto?.tipo === 'actualizar'
              ? efecto.actualizacion.litros_total
              : efecto?.tipo === 'borrar'
                ? null
                : fila.litros_total;
          return (
            <TableRow key={fila.id}>
              <TableCell>{nombre}</TableCell>
              {grupo.conTurno ? (
                <>
                  <TableCell>
                    {editando ? (
                      <Input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Mañana de ${nombre}`}
                        value={borrador.litros_am}
                        disabled={guardando}
                        onChange={(e) => onCambiar(fila.id, 'litros_am', e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-24"
                      />
                    ) : (
                      textoCelda(fila.litros_am)
                    )}
                  </TableCell>
                  <TableCell>
                    {editando ? (
                      <Input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Tarde de ${nombre}`}
                        value={borrador.litros_pm}
                        disabled={guardando}
                        onChange={(e) => onCambiar(fila.id, 'litros_pm', e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-24"
                      />
                    ) : (
                      textoCelda(fila.litros_pm)
                    )}
                  </TableCell>
                  <TableCell>
                    {efecto?.tipo === 'borrar' ? 'Se quita' : textoCelda(totalDerivado)}
                    {efecto?.tipo === 'error' && <p className="text-xs text-red-600">{efecto.error}</p>}
                  </TableCell>
                </>
              ) : (
                <TableCell>
                  {editando ? (
                    <Input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Litros de ${nombre}`}
                      value={borrador.litros_total}
                      disabled={guardando}
                      onChange={(e) => onCambiar(fila.id, 'litros_total', e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-24"
                    />
                  ) : (
                    litrosVisibles(fila.litros_total)
                  )}
                  {efecto?.tipo === 'error' && <p className="text-xs text-red-600">{efecto.error}</p>}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export interface DetallePesajeSemanalDialogProps {
  abierto: boolean;
  semana: number | null;
  etiqueta: string | null;
  /** Ancla congelada al abrir. Un borrado no mueve la ventana abierta. */
  fechaReferencia: string | null;
  identidadPorAnimal: Map<string, IdentidadAnimalHato>;
  onCerrar: () => void;
  onCambio: () => void;
}

export function DetallePesajeSemanalDialog({
  abierto,
  semana,
  etiqueta,
  fechaReferencia,
  identidadPorAnimal,
  onCerrar,
  onCambio,
}: DetallePesajeSemanalDialogProps) {
  const { hasRole, isLoading } = useAuth();
  const puedeGerencia = !isLoading && hasRole(['Gerencia']);
  const consulta =
    abierto && fechaReferencia != null && semana != null ? { fechaReferencia, semana } : null;
  const detalle = useDetallePesajeSemana(consulta);

  const [editando, setEditando] = useState(false);
  const [borradores, setBorradores] = useState<BorradorFila[]>([]);

  const claveConsulta = consulta ? `${consulta.fechaReferencia}|${consulta.semana}` : '';
  const [claveVista, setClaveVista] = useState(claveConsulta);
  if (claveConsulta !== claveVista) {
    setClaveVista(claveConsulta);
    setEditando(false);
  }

  const filasOrdenadas = useMemo(
    () => ordenarFilasPesaje(detalle.filas, (id) => identidadPorAnimal.get(id)?.numero ?? null),
    [detalle.filas, identidadPorAnimal],
  );
  const fechas = useMemo(() => agruparFechas(filasOrdenadas), [filasOrdenadas]);

  const firmaFilas = filasOrdenadas
    .map((f) => `${f.id}:${f.litros_am}:${f.litros_pm}:${f.litros_total}`)
    .join('|');
  const [firmaBorrador, setFirmaBorrador] = useState<string | null>(null);
  if (firmaFilas !== firmaBorrador) {
    setFirmaBorrador(firmaFilas);
    setBorradores(filasOrdenadas.map(borradorInicial));
  }

  const meses = detalle.inicio && detalle.fin ? mesesDelRango(detalle.inicio, detalle.fin) : [];
  const fotos = elegirCaptura(detalle.capturas, filasOrdenadas, meses);
  const autorId = idAutorVisible(fotos.ligada, filasOrdenadas);
  const autorNombre = autorId ? (detalle.autores.get(autorId) ?? null) : null;

  const unaFecha = fechas.length === 1 ? fechas[0] : null;
  const titulo = unaFecha ? formatLongDate(unaFecha.fecha) : 'Pesajes de la semana';
  const rango =
    detalle.inicio && detalle.fin
      ? `${etiqueta ?? 'Semana'} · ${formatShortDate(detalle.inicio)} a ${formatShortDate(detalle.fin)}`
      : etiqueta;
  const subtitulo = unaFecha
    ? [rango, unaFecha.conTurno ? 'Mañana y tarde' : null].filter(Boolean).join(' · ')
    : rango;

  const guardar = async () => {
    if (!puedeGerencia) return;
    const resultado = planGuardarSemana(filasOrdenadas, borradores);
    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }
    if (planVacio(resultado.plan)) {
      setEditando(false);
      return;
    }
    const ok = await detalle.guardar(resultado.plan);
    if (ok) {
      toast.success('Pesaje actualizado');
      setEditando(false);
      onCambio();
    }
  };

  const cambiar = (id: string, campo: 'litros_am' | 'litros_pm' | 'litros_total', valor: string) => {
    setBorradores((prev) => prev.map((b) => (b.id === id ? { ...b, [campo]: valor } : b)));
  };

  const cancelar = () => {
    setBorradores(filasOrdenadas.map(borradorInicial));
    setEditando(false);
  };

  return (
    <>
      <Dialog open={abierto} onOpenChange={(open) => { if (!open) onCerrar(); }}>
        <DialogContent size="xl">
          {detalle.cargando ? (
            <>
              <DialogHeader>
                <DialogTitle>{etiqueta ?? 'Pesajes de la semana'}</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <p className="flex items-center text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando pesajes…
                </p>
              </DialogBody>
            </>
          ) : (
            <DetalleSemanaPesaje
              titulo={titulo}
              subtitulo={subtitulo}
              fechas={fechas}
              borradores={borradores}
              identidadPorAnimal={identidadPorAnimal}
              capturaLigada={fotos.ligada}
              fotosDelMes={fotos.delMes}
              urls={detalle.urls}
              autorNombre={autorNombre}
              puedeGerencia={puedeGerencia}
              editando={editando}
              guardando={detalle.guardando}
              error={detalle.error}
              onCambiar={cambiar}
              onEditar={() => setEditando(true)}
              onCancelar={cancelar}
              onGuardar={() => { void guardar(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
