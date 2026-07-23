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

import { useMemo, useState } from 'react';
import { Loader2, AlertTriangle, BellRing, Inbox } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
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
  type EstadoAlertaHato,
  type TipoAlertaHato,
} from '@/utils/hatoAlertasUi';
import { formatNumber } from '@/utils/format';

const selectClass = 'px-2 py-1.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0';

export function AlertasView() {
  const { profile } = useAuth();
  const canWrite = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';

  const { alertas, loading, error, actualizarEstadoAlerta } = useHatoAlertas();
  const [tipoFiltro, setTipoFiltro] = useState<TipoAlertaHato | ''>('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoAlertaHato | ''>('');
  const [idActuando, setIdActuando] = useState<string | null>(null);

  const revisionSemanal = useMemo(
    () => ordenarAlertasHato(alertas.filter((a) => requiereRevisionSemanal(a.estado))),
    [alertas],
  );

  const colaFiltrada = useMemo(
    () => ordenarAlertasHato(filtrarAlertasHato(alertas, { tipo: tipoFiltro, estado: estadoFiltro })),
    [alertas, tipoFiltro, estadoFiltro],
  );

  const conteoPorEstado = useMemo(() => contarAlertasPorEstado(alertas), [alertas]);

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
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Cola completa ({colaFiltrada.length})</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={tipoFiltro}
                    onChange={(e) => setTipoFiltro(e.target.value as TipoAlertaHato | '')}
                    className={selectClass}
                  >
                    <option value="">Todos los tipos</option>
                    {TIPOS_ALERTA_HATO.map((tipo) => (
                      <option key={tipo} value={tipo}>{LABEL_TIPO_ALERTA_HATO[tipo]}</option>
                    ))}
                  </select>
                  <select
                    value={estadoFiltro}
                    onChange={(e) => setEstadoFiltro(e.target.value as EstadoAlertaHato | '')}
                    className={selectClass}
                  >
                    <option value="">Todos los estados</option>
                    {ESTADOS_ALERTA_HATO.map((estado) => (
                      <option key={estado} value={estado}>{LABEL_ESTADO_ALERTA_HATO[estado]}</option>
                    ))}
                  </select>
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
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
