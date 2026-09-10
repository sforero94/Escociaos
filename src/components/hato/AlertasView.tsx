// ARCHIVO: components/hato/AlertasView.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/alertas` — gestor de alertas (S6 +
// issue #217). Tres pestañas sobre el mismo stack `hato_alertas` /
// `hato_alertas_config` / `telegram_alertas_suscripciones`. No hay un
// segundo sistema de notificaciones.
//
//   Cola — revisión semanal, filtros, responder (Sí / Todavía no / Otra
//          cosa, parity Telegram), editar, descartar uno o varias, expirar.
//   Quién recibe — matriz de suscripciones Telegram (Gerencia).
//   Tipos — activo / horas de escalamiento + alta manual.

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertTriangle, BellRing, Inbox, Trash2, TimerOff, Plus, ListTodo, Users, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHatoAlertas, type AlertaHatoEnriquecida } from './hooks/useHatoAlertas';
import { AlertaFila } from './components/AlertaFila';
import { CrearAlertaManualDialog } from './components/CrearAlertaManualDialog';
import { EditarAlertaDialog } from './components/EditarAlertaDialog';
import { AlertasQuienRecibeTab } from './components/AlertasQuienRecibeTab';
import { AlertasTiposTab } from './components/AlertasTiposTab';
import { HatoPageHeader } from './components/HatoPageHeader';
import {
  TIPOS_ALERTA_HATO,
  ESTADOS_ALERTA_HATO,
  LABEL_TIPO_ALERTA_HATO,
  LABEL_ESTADO_ALERTA_HATO,
  ordenarAlertasHato,
  filtrarAlertasHato,
  contarAlertasPorEstado,
  requiereRevisionSemanal,
  alertasVencidasParaExpirar,
  type EstadoAlertaHato,
  type TipoAlertaHato,
} from '@/utils/hatoAlertasUi';
import { formatNumber } from '@/utils/format';
import { obtenerFechaHoy } from '@/utils/fechas';
import type { RespuestaAlertaHato } from '@/utils/hatoAlertas';

const TABS_VALIDOS = ['cola', 'quien', 'tipos'];

export function AlertasView() {
  const { profile, user } = useAuth();
  const canWrite = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';
  const canGerencia = profile?.rol === 'Gerencia';

  const [searchParams] = useSearchParams();
  const tabInicial = TABS_VALIDOS.includes(searchParams.get('tab') || '')
    ? (searchParams.get('tab') as string)
    : 'cola';
  const [activeTab, setActiveTab] = useState(tabInicial);

  const {
    alertas,
    loading,
    error,
    actualizarEstadoAlertas,
    responderAlerta,
    confirmarRevisionAlerta,
    editarAlerta,
    crearAlertaManual,
  } = useHatoAlertas();
  const [tipoFiltro, setTipoFiltro] = useState<TipoAlertaHato | ''>('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoAlertaHato | ''>('');
  const [idActuando, setIdActuando] = useState<string | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const [confirmandoExpiracion, setConfirmandoExpiracion] = useState(false);
  const [procesandoLote, setProcesandoLote] = useState(false);
  const [crearOpen, setCrearOpen] = useState(false);
  const [guardandoForm, setGuardandoForm] = useState(false);
  const [alertaEditando, setAlertaEditando] = useState<AlertaHatoEnriquecida | null>(null);

  const revisionSemanal = useMemo(
    () => ordenarAlertasHato(alertas.filter((a) => requiereRevisionSemanal(a.estado))),
    [alertas],
  );

  const colaFiltrada = useMemo(
    () => ordenarAlertasHato(filtrarAlertasHato(alertas, { tipo: tipoFiltro, estado: estadoFiltro })),
    [alertas, tipoFiltro, estadoFiltro],
  );

  const conteoPorEstado = useMemo(() => contarAlertasPorEstado(alertas), [alertas]);

  const vencidas = useMemo(() => alertasVencidasParaExpirar(alertas, obtenerFechaHoy()), [alertas]);

  const nombreActor = profile?.nombre ?? null;

  const toggleSeleccion = (id: string) => {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleResponder = async (id: string, respuesta: RespuestaAlertaHato) => {
    setIdActuando(id);
    try {
      await responderAlerta(id, respuesta, nombreActor);
      toast.success(
        respuesta === 'si' ? 'Alerta confirmada' : respuesta === 'no' ? 'Anotado: todavía no' : 'Anotado: otra cosa',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error actualizando la alerta: ' + message);
    } finally {
      setIdActuando(null);
    }
  };

  const handleConfirmarRevision = async (id: string) => {
    setIdActuando(id);
    try {
      await confirmarRevisionAlerta(id, nombreActor);
      toast.success('Alerta confirmada');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error confirmando la alerta: ' + message);
    } finally {
      setIdActuando(null);
    }
  };

  const handleDescartar = async (id: string) => {
    setIdActuando(id);
    try {
      await actualizarEstadoAlertas([id], { estado: 'descartada', respondidaPor: nombreActor });
      toast.success('Alerta descartada');
      setSeleccionadas((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error descartando la alerta: ' + message);
    } finally {
      setIdActuando(null);
    }
  };

  const handleConfirmarDescarteMasivo = async () => {
    setProcesandoLote(true);
    try {
      const ids = Array.from(seleccionadas);
      await actualizarEstadoAlertas(ids, { estado: 'descartada', respondidaPor: nombreActor });
      toast.success(`${ids.length} alerta${ids.length > 1 ? 's' : ''} descartada${ids.length > 1 ? 's' : ''}`);
      setSeleccionadas(new Set());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error descartando las alertas seleccionadas: ' + message);
    } finally {
      setProcesandoLote(false);
      setConfirmandoDescarte(false);
    }
  };

  const handleConfirmarExpiracionAutomatica = async () => {
    setProcesandoLote(true);
    try {
      const ids = vencidas.map((a) => a.id);
      await actualizarEstadoAlertas(ids, { estado: 'expirada' });
      toast.success(`${ids.length} alerta${ids.length > 1 ? 's' : ''} expirada${ids.length > 1 ? 's' : ''} automáticamente`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error expirando las alertas vencidas: ' + message);
    } finally {
      setProcesandoLote(false);
      setConfirmandoExpiracion(false);
    }
  };

  const propsFila = {
    canWrite,
    onResponder: canWrite ? handleResponder : undefined,
    onConfirmarRevision: canWrite ? handleConfirmarRevision : undefined,
    onEditar: canWrite ? (alerta: AlertaHatoEnriquecida) => setAlertaEditando(alerta) : undefined,
    onDescartar: canWrite ? handleDescartar : undefined,
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background p-4 lg:p-8">
      <div className="max-w-5xl mx-auto w-full">
        <HatoPageHeader
          breadcrumb="Hato Lechero"
          section="Alertas"
          title="Alertas"
          subtitle="Cola, quién recibe en Telegram y tipos. Fernando responde Sí / Todavía no / Otra cosa."
          actions={
            canWrite ? (
              <Button size="sm" onClick={() => setCrearOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                Crear alerta
              </Button>
            ) : undefined
          }
        />

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} activationMode="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cola" className="flex items-center gap-2">
              <ListTodo className="w-4 h-4" />
              Cola
            </TabsTrigger>
            <TabsTrigger value="quien" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Quién recibe
            </TabsTrigger>
            <TabsTrigger value="tipos" className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Tipos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cola" className="mt-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : alertas.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
                <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  Todavía no hay alertas en la cola. El motor las genera cada día a las 5:45 a.m.,
                  o créala a mano desde Tipos / Crear alerta.
                </p>
              </div>
            ) : (
              <>
                {conteoPorEstado && Object.keys(conteoPorEstado).length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-6">
                    {ESTADOS_ALERTA_HATO.filter((e) => conteoPorEstado[e]).map((estado) => (
                      <div key={estado} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                        <span className="text-gray-500">{LABEL_ESTADO_ALERTA_HATO[estado]}: </span>
                        <span className="font-semibold text-gray-900">{formatNumber(conteoPorEstado[estado] ?? 0)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {canWrite && vencidas.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6">
                    <div className="flex items-center gap-2 text-sm text-amber-700">
                      <TimerOff className="w-4 h-4 flex-shrink-0" />
                      <span>
                        {vencidas.length} alerta{vencidas.length > 1 ? 's' : ''} escalada{vencidas.length > 1 ? 's' : ''} o
                        respondida{vencidas.length > 1 ? 's' : ''} sin cerrar hace más de 14 días.
                      </span>
                    </div>
                    <Button size="sm" variant="outline" disabled={procesandoLote} onClick={() => setConfirmandoExpiracion(true)}>
                      Expirar automáticamente
                    </Button>
                  </div>
                )}

                {canWrite && seleccionadas.size > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 mb-6">
                    <span className="text-sm text-gray-700">
                      {seleccionadas.size} alerta{seleccionadas.size > 1 ? 's' : ''} seleccionada{seleccionadas.size > 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSeleccionadas(new Set())}
                        className="text-xs text-gray-400 hover:text-gray-900 underline"
                      >
                        Limpiar selección
                      </button>
                      <Button size="sm" variant="outline" disabled={procesandoLote} onClick={() => setConfirmandoDescarte(true)}>
                        <Trash2 className="w-4 h-4 mr-1.5" />
                        Descartar seleccionadas
                      </Button>
                    </div>
                  </div>
                )}

                <section className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <BellRing className="w-4 h-4 text-amber-600" />
                    <h2 className="text-sm font-semibold text-gray-900">
                      Revisión semanal ({revisionSemanal.length})
                    </h2>
                  </div>
                  {revisionSemanal.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
                      Nada pendiente de revisión: sin alertas respondidas, escaladas o expiradas por ahora.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {revisionSemanal.map((alerta) => (
                        <AlertaFila
                          key={alerta.id}
                          alerta={alerta}
                          actuando={idActuando === alerta.id}
                          seleccionable
                          seleccionada={seleccionadas.has(alerta.id)}
                          onToggleSeleccion={toggleSeleccion}
                          {...propsFila}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-sm font-semibold text-gray-900">Cola completa ({colaFiltrada.length})</h2>
                      {canWrite && colaFiltrada.length > 0 && (
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                          <Checkbox
                            checked={colaFiltrada.every((a) => seleccionadas.has(a.id))}
                            onCheckedChange={(checked) =>
                              setSeleccionadas((prev) => {
                                const next = new Set(prev);
                                colaFiltrada.forEach((a) => (checked ? next.add(a.id) : next.delete(a.id)));
                                return next;
                              })
                            }
                          />
                          Seleccionar todas
                        </label>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={tipoFiltro || 'todos'}
                        onValueChange={(v) => setTipoFiltro(v === 'todos' ? '' : (v as TipoAlertaHato))}
                      >
                        <SelectTrigger className="w-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos los tipos</SelectItem>
                          {TIPOS_ALERTA_HATO.map((tipo) => (
                            <SelectItem key={tipo} value={tipo}>{LABEL_TIPO_ALERTA_HATO[tipo]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={estadoFiltro || 'todos'}
                        onValueChange={(v) => setEstadoFiltro(v === 'todos' ? '' : (v as EstadoAlertaHato))}
                      >
                        <SelectTrigger className="w-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos los estados</SelectItem>
                          {ESTADOS_ALERTA_HATO.map((estado) => (
                            <SelectItem key={estado} value={estado}>{LABEL_ESTADO_ALERTA_HATO[estado]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {colaFiltrada.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
                      Ninguna alerta coincide con los filtros actuales.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {colaFiltrada.map((alerta: AlertaHatoEnriquecida) => (
                        <AlertaFila
                          key={alerta.id}
                          alerta={alerta}
                          actuando={idActuando === alerta.id}
                          seleccionable
                          seleccionada={seleccionadas.has(alerta.id)}
                          onToggleSeleccion={toggleSeleccion}
                          {...propsFila}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </TabsContent>

          <TabsContent value="quien" className="mt-6">
            <AlertasQuienRecibeTab canGerencia={canGerencia} updatedBy={profile?.id ?? null} />
          </TabsContent>

          <TabsContent value="tipos" className="mt-6">
            <AlertasTiposTab canWrite={canWrite} />
          </TabsContent>
        </Tabs>
      </div>

      <CrearAlertaManualDialog
        open={crearOpen}
        onOpenChange={setCrearOpen}
        guardando={guardandoForm}
        onCrear={async (input) => {
          setGuardandoForm(true);
          try {
            await crearAlertaManual(input, user?.id ?? null);
          } finally {
            setGuardandoForm(false);
          }
        }}
      />

      <EditarAlertaDialog
        key={alertaEditando?.id ?? 'idle'}
        alerta={alertaEditando}
        open={alertaEditando != null}
        onOpenChange={(open) => {
          if (!open) setAlertaEditando(null);
        }}
        guardando={guardandoForm}
        onGuardar={async (alerta, input) => {
          setGuardandoForm(true);
          try {
            await editarAlerta(alerta, input);
          } finally {
            setGuardandoForm(false);
          }
        }}
      />

      <ConfirmDialog
        open={confirmandoDescarte}
        onOpenChange={setConfirmandoDescarte}
        title={`¿Descartar ${seleccionadas.size} alerta${seleccionadas.size > 1 ? 's' : ''}?`}
        description="Quedan marcadas como descartadas — no se puede deshacer desde acá."
        confirmLabel="Descartar"
        destructive
        onConfirm={handleConfirmarDescarteMasivo}
      />

      <ConfirmDialog
        open={confirmandoExpiracion}
        onOpenChange={setConfirmandoExpiracion}
        title={`¿Expirar ${vencidas.length} alerta${vencidas.length > 1 ? 's' : ''} vencida${vencidas.length > 1 ? 's' : ''}?`}
        description="Escaladas o respondidas sin cerrar hace más de 14 días. Quedan marcadas como expiradas — no se puede deshacer desde acá."
        confirmLabel="Expirar"
        onConfirm={handleConfirmarExpiracionAutomatica}
      />
    </div>
  );
}
