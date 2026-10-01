// ARCHIVO: components/hato/components/DetallePesajeSemanalDialog.tsx
// DESCRIPCIÓN: al tocar una barra MEDIDA del tracker, lista los pesajes de
// esa semana (mañana y tarde de cada fecha) y abre uno al lado de su
// planilla. Gerencia corrige litros o borra el pesaje. La foto queda.
// Issue #297.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { diaBogota, horaBogota } from '@/utils/fechas';
import { formatLongDate, formatNumber, formatShortDate } from '@/utils/format';
import {
  borradorInicial,
  efectoFila,
  elegirCaptura,
  filasDelPesaje,
  idAutorVisible,
  litrosDelPesaje,
  listarPesajesDeSemana,
  mesesDelRango,
  ordenarFilasPesaje,
  planBorrarPesaje,
  planGuardarBorrador,
  type BorradorFila,
  type CapturaPesajeCandidata,
  type FilaPesajeSemana,
  type PesajeEnSemana,
} from '@/utils/hato/detallePesajeSemanal';
import type { IdentidadAnimalHato } from '../hooks/useDatosProduccionPorVaca';
import { useDetallePesajeSemana } from '../hooks/useDetallePesajeSemana';

const ETIQUETA_SIN_AUTOR = 'Sin autor registrado';

function litrosVisibles(valor: number): string {
  const decimales = Number.isInteger(valor) ? 0 : 1;
  return formatNumber(valor, decimales);
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

export function ListaPesajesSemana({
  pesajes,
  filas,
  onElegir,
}: {
  pesajes: PesajeEnSemana[];
  filas: FilaPesajeSemana[];
  onElegir: (pesaje: PesajeEnSemana) => void;
}) {
  if (pesajes.length === 0) {
    return <p className="text-sm text-gray-500">Esta semana no tiene pesajes guardados.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        {pesajes.length} {pesajes.length === 1 ? 'pesaje' : 'pesajes'} en la semana
      </p>
      <ul className="space-y-2">
        {pesajes.map((pesaje) => {
          const propias = filasDelPesaje(filas, pesaje);
          return (
            <li key={pesaje.clave}>
              <button
                type="button"
                onClick={() => onElegir(pesaje)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50"
              >
                <span className="block text-sm font-semibold text-gray-900">
                  {pesaje.etiqueta} · {formatShortDate(pesaje.fecha)}
                </span>
                <span className="block text-xs text-gray-500">
                  {propias.length} {propias.length === 1 ? 'vaca' : 'vacas'} · {litrosVisibles(litrosDelPesaje(filas, pesaje))} L
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DetalleUnPesaje({
  pesaje,
  filas,
  borradores,
  identidadPorAnimal,
  capturaLigada,
  fotosDelMes,
  urls,
  autorNombre,
  puedeEditar,
  guardando,
  onCambiar,
  onVolver,
  onGuardar,
  onPedirBorrado,
}: {
  pesaje: PesajeEnSemana;
  filas: FilaPesajeSemana[];
  borradores: BorradorFila[];
  identidadPorAnimal: Map<string, IdentidadAnimalHato>;
  capturaLigada: CapturaPesajeCandidata | null;
  fotosDelMes: CapturaPesajeCandidata[];
  urls: Record<string, string>;
  autorNombre: string | null;
  puedeEditar: boolean;
  guardando: boolean;
  onCambiar: (id: string, campo: 'litros_am' | 'litros_pm' | 'litros_total', valor: string) => void;
  onVolver: () => void;
  onGuardar: () => void;
  onPedirBorrado: () => void;
}) {
  const fotos = capturaLigada ? [capturaLigada] : fotosDelMes;
  const turno = pesaje.turno;
  const porId = new Map(borradores.map((b) => [b.id, b]));

  return (
    <form className="flex flex-col flex-1 min-h-0 gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); onGuardar(); }}>
      <DialogHeader>
        <DialogTitle>
          {pesaje.etiqueta} · {formatLongDate(pesaje.fecha)}
        </DialogTitle>
        <button type="button" onClick={onVolver} className="text-xs text-primary text-left">
          Volver a los pesajes
        </button>
      </DialogHeader>
      <DialogBody>
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
            ) : (
              <p className="text-xs text-gray-500">Fecha del pesaje: {formatLongDate(pesaje.fecha)}</p>
            )}
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
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-900">Datos del pesaje</h4>
            {filas.length === 0 ? (
              <p className="text-sm text-gray-500">Ninguna vaca tiene litros en este pesaje.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vaca</TableHead>
                    {turno == null ? (
                      <TableHead>Litros</TableHead>
                    ) : (
                      <>
                        <TableHead>Mañana</TableHead>
                        <TableHead>Tarde</TableHead>
                        <TableHead>Total</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody striped>
                  {filas.map((fila) => {
                    const borrador = porId.get(fila.id) ?? borradorInicial(fila);
                    const efecto = efectoFila(fila, borrador, turno);
                    const totalDerivado =
                      efecto.tipo === 'actualizar'
                        ? efecto.actualizacion.litros_total
                        : efecto.tipo === 'borrar'
                          ? null
                          : fila.litros_total;
                    return (
                      <TableRow key={fila.id}>
                        <TableCell>{nombreVaca(identidadPorAnimal.get(fila.animal_id))}</TableCell>
                        {turno == null ? (
                          <TableCell>
                            {puedeEditar ? (
                              <Input
                                type="text"
                                inputMode="decimal"
                                aria-label={`Litros de ${nombreVaca(identidadPorAnimal.get(fila.animal_id))}`}
                                value={borrador.litros_total}
                                disabled={guardando}
                                onChange={(e) => onCambiar(fila.id, 'litros_total', e.target.value)}
                                onWheel={(e) => e.currentTarget.blur()}
                                className="w-24"
                              />
                            ) : (
                              litrosVisibles(fila.litros_total)
                            )}
                            {efecto.tipo === 'error' && <p className="text-xs text-red-600">{efecto.error}</p>}
                          </TableCell>
                        ) : (
                          <>
                            <TableCell>
                              {turno === 'am' && puedeEditar ? (
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  aria-label={`Mañana de ${nombreVaca(identidadPorAnimal.get(fila.animal_id))}`}
                                  value={borrador.litros_am}
                                  disabled={guardando}
                                  onChange={(e) => onCambiar(fila.id, 'litros_am', e.target.value)}
                                  onWheel={(e) => e.currentTarget.blur()}
                                  className="w-24"
                                />
                              ) : (
                                fila.litros_am == null ? '—' : litrosVisibles(fila.litros_am)
                              )}
                            </TableCell>
                            <TableCell>
                              {turno === 'pm' && puedeEditar ? (
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  aria-label={`Tarde de ${nombreVaca(identidadPorAnimal.get(fila.animal_id))}`}
                                  value={borrador.litros_pm}
                                  disabled={guardando}
                                  onChange={(e) => onCambiar(fila.id, 'litros_pm', e.target.value)}
                                  onWheel={(e) => e.currentTarget.blur()}
                                  className="w-24"
                                />
                              ) : (
                                fila.litros_pm == null ? '—' : litrosVisibles(fila.litros_pm)
                              )}
                            </TableCell>
                            <TableCell>
                              {efecto.tipo === 'borrar' ? 'Se quita' : totalDerivado == null ? '—' : litrosVisibles(totalDerivado)}
                              {efecto.tipo === 'error' && <p className="text-xs text-red-600">{efecto.error}</p>}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {!puedeEditar && (
              <p className="text-xs text-gray-500">Solo Gerencia puede corregir o borrar un pesaje.</p>
            )}
          </section>
        </div>
      </DialogBody>
      {puedeEditar && filas.length > 0 && (
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={guardando} onClick={onPedirBorrado}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Borrar este pesaje
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      )}
    </form>
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
  const puedeEditar = !isLoading && hasRole(['Gerencia']);
  const consulta =
    abierto && fechaReferencia != null && semana != null ? { fechaReferencia, semana } : null;
  const detalle = useDetallePesajeSemana(consulta);

  const [seleccionClave, setSeleccionClave] = useState<string | null>(null);
  const [borradores, setBorradores] = useState<BorradorFila[]>([]);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const pesajes = useMemo(() => listarPesajesDeSemana(detalle.filas), [detalle.filas]);
  const seleccion = pesajes.find((p) => p.clave === seleccionClave) ?? null;

  const filasVisibles = useMemo(() => {
    if (!seleccion) return [];
    return ordenarFilasPesaje(filasDelPesaje(detalle.filas, seleccion), (id) => identidadPorAnimal.get(id)?.numero ?? null);
  }, [seleccion, detalle.filas, identidadPorAnimal]);

  const firmaFilas = filasVisibles
    .map((f) => `${f.id}:${f.litros_am}:${f.litros_pm}:${f.litros_total}`)
    .join('|');

  useEffect(() => {
    setBorradores(filasVisibles.map(borradorInicial));
  }, [firmaFilas, filasVisibles]);

  useEffect(() => {
    if (seleccionClave && !pesajes.some((p) => p.clave === seleccionClave)) {
      setSeleccionClave(null);
    }
  }, [pesajes, seleccionClave]);

  const meses = detalle.inicio && detalle.fin ? mesesDelRango(detalle.inicio, detalle.fin) : [];
  const fotos = seleccion
    ? elegirCaptura(detalle.capturas, filasVisibles, meses)
    : { ligada: null, delMes: [] };
  const autorId = seleccion ? idAutorVisible(fotos.ligada, filasVisibles) : null;
  const autorNombre = autorId ? (detalle.autores.get(autorId) ?? null) : null;

  const guardar = async () => {
    if (!seleccion || !puedeEditar) return;
    const resultado = planGuardarBorrador(filasVisibles, borradores, seleccion.turno);
    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }
    if (resultado.plan.actualizaciones.length === 0 && resultado.plan.borrarIds.length === 0) return;
    const ok = await detalle.guardar(resultado.plan);
    if (ok) {
      toast.success('Pesaje actualizado');
      onCambio();
    }
  };

  const borrar = async () => {
    if (!seleccion || !puedeEditar) return;
    const deLaFecha = detalle.filas.filter((fila) => fila.fecha === seleccion.fecha);
    const plan = planBorrarPesaje(deLaFecha, seleccion.turno);
    setConfirmarBorrado(false);
    const ok = await detalle.borrar(plan);
    if (ok) {
      toast.success('Pesaje borrado');
      setSeleccionClave(null);
      onCambio();
    }
  };

  const cambiar = (id: string, campo: 'litros_am' | 'litros_pm' | 'litros_total', valor: string) => {
    setBorradores((prev) => prev.map((b) => (b.id === id ? { ...b, [campo]: valor } : b)));
  };

  const tituloSemana =
    detalle.inicio && detalle.fin
      ? `${etiqueta ?? 'Semana'} · ${formatShortDate(detalle.inicio)} a ${formatShortDate(detalle.fin)}`
      : (etiqueta ?? 'Pesajes de la semana');

  return (
    <>
      <Dialog open={abierto} onOpenChange={(open) => { if (!open) onCerrar(); }}>
        <DialogContent size="xl">
          {seleccion ? (
            <DetalleUnPesaje
              pesaje={seleccion}
              filas={filasVisibles}
              borradores={borradores}
              identidadPorAnimal={identidadPorAnimal}
              capturaLigada={fotos.ligada}
              fotosDelMes={fotos.delMes}
              urls={detalle.urls}
              autorNombre={autorNombre}
              puedeEditar={puedeEditar}
              guardando={detalle.guardando}
              onCambiar={cambiar}
              onVolver={() => setSeleccionClave(null)}
              onGuardar={() => { void guardar(); }}
              onPedirBorrado={() => setConfirmarBorrado(true)}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Pesajes de la semana</DialogTitle>
                <p className="text-xs text-gray-500">{tituloSemana}</p>
              </DialogHeader>
              <DialogBody>
                {detalle.cargando ? (
                  <p className="flex items-center text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando pesajes…
                  </p>
                ) : detalle.error ? (
                  <p className="text-sm text-red-600">{detalle.error}</p>
                ) : (
                  <ListaPesajesSemana pesajes={pesajes} filas={detalle.filas} onElegir={(p) => setSeleccionClave(p.clave)} />
                )}
              </DialogBody>
            </>
          )}
          {seleccion && detalle.error && (
            <p className="text-sm text-red-600 px-1">{detalle.error}</p>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmarBorrado}
        onOpenChange={setConfirmarBorrado}
        title="Borrar este pesaje"
        description="Se quitan los litros de este pesaje. La foto queda guardada para volver a cargarlos. Esta acción no se puede deshacer."
        confirmLabel="Borrar"
        destructive
        onConfirm={() => { void borrar(); }}
      />
    </>
  );
}
