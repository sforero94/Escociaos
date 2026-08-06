// ARCHIVO: components/hato/AlertasView.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/alertas` (S6, plan §7.5 "AlertasView --
// cola con estados y respuestas"). Reemplaza el `ComingSoon` de la tabla de
// rutas -- ver docs/plan_hato_lechero_module.md §6 Épica C.
//
// V11 (decisión del dueño, §6 C4): "para arrancar, el control se revisa una
// vez por semana directamente en la Cola de alertas del sistema" -- no hay
// resumen diario a Martha todavía, así que esta vista ES el mecanismo de
// supervisión. Dos secciones:
//   1. "Revisión semanal" -- alertas que exigen una decisión humana
//      (`respondida`, `escalada`, `expirada` -- ver
//      `requiereRevisionSemanal` en hatoAlertasUi.ts), con acciones
//      Confirmar/Descartar gateadas a Administrador/Gerencia (RLS 056).
//   2. "Cola completa" -- todas las alertas, filtrables por tipo/estado,
//      para que Martha pueda auditar cualquier cosa que el motor generó.
//
// El tick diario (migración 060, pg_cron 05:45) todavía no tiene endpoint
// (`/hato/alertas/tick` llega en una sesión posterior) -- hasta entonces
// `hato_alertas` está vacía en producción, y el estado vacío de esta vista
// lo explica en vez de mostrar un muro de KPIs en cero (regla "sin dato,
// nunca 0").
//
// T3a (ronda agosto 2026, S2) -- dos herramientas nuevas, ninguna de las dos
// se USA en esta sesión (`docs/plan_hato_ronda_agosto_2026.md` §S2: "NO
// limpies las 62 alertas que existen hoy en producción. Esa limpieza es S6,
// después de que S3 arregle la causa raíz. Vos construís la herramienta, no
// la usás"):
//   - **Descarte masivo**: checkbox por fila (Administrador/Gerencia) +
//     "Descartar seleccionadas", sobre CUALQUIER selección que Martha haga a
//     mano, para cualquier motivo.
//   - **Expirar automáticamente**: acción SEPARADA y explícita (nunca se
//     dispara sola al cargar la vista) que aplica la regla determinista
//     `alertasVencidasParaExpirar` (`hatoAlertasUi.ts`) -- `escalada`/
//     `respondida` sin cerrar hace más de `DIAS_EXPIRACION_ALERTA` días,
//     el mismo umbral que ya usa el motor. Las dos acciones piden
//     confirmación (`ConfirmDialog`) antes de escribir nada.

import { useMemo, useState } from 'react';
import { Loader2, AlertTriangle, BellRing, Inbox, Trash2, TimerOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHatoAlertas, type AlertaHatoEnriquecida } from './hooks/useHatoAlertas';
import { AlertaFila } from './components/AlertaFila';
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

export function AlertasView() {
  const { profile } = useAuth();
  const canWrite = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';

  const { alertas, loading, error, actualizarEstadoAlerta, actualizarEstadoAlertas } = useHatoAlertas();
  const [tipoFiltro, setTipoFiltro] = useState<TipoAlertaHato | ''>('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoAlertaHato | ''>('');
  const [idActuando, setIdActuando] = useState<string | null>(null);
  // T3a -- un solo set de seleccionados compartido entre "Revisión semanal"
  // y "Cola completa" (la misma alerta puede aparecer en las dos): marcarla
  // en una sección la deja marcada en la otra.
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const [confirmandoExpiracion, setConfirmandoExpiracion] = useState(false);
  const [procesandoLote, setProcesandoLote] = useState(false);

  const revisionSemanal = useMemo(
    () => ordenarAlertasHato(alertas.filter((a) => requiereRevisionSemanal(a.estado))),
    [alertas],
  );

  const colaFiltrada = useMemo(
    () => ordenarAlertasHato(filtrarAlertasHato(alertas, { tipo: tipoFiltro, estado: estadoFiltro })),
    [alertas, tipoFiltro, estadoFiltro],
  );

  const conteoPorEstado = useMemo(() => contarAlertasPorEstado(alertas), [alertas]);

  // T3a -- candidatas a "Expirar automáticamente" (nunca preseleccionadas:
  // esta lista solo alimenta el contador/confirmación de la acción, no
  // toca `seleccionadas`).
  const vencidas = useMemo(() => alertasVencidasParaExpirar(alertas, obtenerFechaHoy()), [alertas]);

  const toggleSeleccion = (id: string) => {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCambiarEstado = async (id: string, estado: EstadoAlertaHato) => {
    setIdActuando(id);
    try {
      await actualizarEstadoAlerta(id, { estado, respondidaPor: profile?.nombre ?? null });
      toast.success(estado === 'confirmada' ? 'Alerta confirmada' : 'Alerta descartada');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error actualizando la alerta: ' + message);
    } finally {
      setIdActuando(null);
    }
  };

  const handleConfirmarDescarteMasivo = async () => {
    setProcesandoLote(true);
    try {
      const ids = Array.from(seleccionadas);
      await actualizarEstadoAlertas(ids, { estado: 'descartada', respondidaPor: profile?.nombre ?? null });
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

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 p-4 lg:p-8">
      <div className="max-w-5xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-foreground mb-1">Alertas — Hato Lechero</h1>
          <p className="text-sm text-gray-500">
            Cola con estados y respuestas · revisión semanal, no diaria (Fernando responde por Telegram)
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : alertas.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Todavía no hay alertas en la cola. El motor las genera automáticamente cada día a las 5:45 a.m.
              (secado, tratamientos, rechequeos, servicios sin confirmar y partos próximos) — aparecerán aquí
              apenas el primer tick encuentre una condición que las dispare.
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

            {/* T3a -- "expirar automáticamente": herramienta de rutina, no un
                botón de limpieza puntual. Explícita a propósito -- nunca se
                dispara sola al cargar la vista (ver docstring del archivo). */}
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

            {/* T3a -- barra de acción del descarte masivo. Un solo set de
                seleccionados para las dos secciones de abajo. */}
            {canWrite && seleccionadas.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 mb-6">
                <span className="text-sm text-gray-700">
                  {seleccionadas.size} alerta{seleccionadas.size > 1 ? 's' : ''} seleccionada{seleccionadas.size > 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-3">
                  {/* `hover:text-gray-600` no existe en el build congelado
                      (verificado: solo `hover:text-gray-200`/`-900`) --
                      GastosList.tsx lo usa igual y por eso ese hover no
                      hace nada; acá se usa el que sí existe. */}
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
                      canWrite={canWrite}
                      actuando={idActuando === alerta.id}
                      onCambiarEstado={handleCambiarEstado}
                      seleccionable
                      seleccionada={seleccionadas.has(alerta.id)}
                      onToggleSeleccion={toggleSeleccion}
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
                  {/* Radix `Select.Item` no admite `value=""` -- `'todos'` es
                      el centinela (mismo patrón que `'sin_vaca'` en
                      `PajillaUsoDialog.tsx`), traducido de vuelta a `''` al
                      guardar el filtro. */}
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
                      canWrite={canWrite}
                      actuando={idActuando === alerta.id}
                      onCambiarEstado={handleCambiarEstado}
                      seleccionable
                      seleccionada={seleccionadas.has(alerta.id)}
                      onToggleSeleccion={toggleSeleccion}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

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
