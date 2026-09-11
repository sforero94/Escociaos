// ARCHIVO: components/hato/AlertasView.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/alertas` — gestor de alertas (S6 +
// issue #217). Tres pestañas sobre el mismo stack `hato_alertas` /
// `hato_alertas_config` / `telegram_alertas_suscripciones`. No hay un
// segundo sistema de notificaciones.
//
//   Activas — arriba: temas de gerencia (rechequeo y parto informativos;
//             servicio con botones). Abajo: pendientes de campo (secado
//             y tratamiento, por vaca).
//   Historial — tabla de Completadas, estilo Snapshot de monitoreo.
//   Configuración — matriz tipo × usuario (`recibe`) + tipos.

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, BellRing, Inbox, Plus, ListTodo, History, SlidersHorizontal, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHatoAlertas, type AlertaHatoEnriquecida } from './hooks/useHatoAlertas';
import { AlertaFila } from './components/AlertaFila';
import { AlertaGrupoInformativo } from './components/AlertaGrupoInformativo';
import { AlertaHistorialTabla } from './components/AlertaHistorialTabla';
import { CrearAlertaManualDialog } from './components/CrearAlertaManualDialog';
import { EditarAlertaDialog } from './components/EditarAlertaDialog';
import { AlertasQuienRecibeTab } from './components/AlertasQuienRecibeTab';
import { AlertasTiposTab } from './components/AlertasTiposTab';
import { HatoPageHeader } from './components/HatoPageHeader';
import { LABEL_TIPO_ALERTA_HATO, ordenarAlertasHato } from '@/utils/hatoAlertasUi';
import {
  TEMAS_ALERTA_CAMPO,
  TEMAS_ALERTA_GERENCIA,
  agruparPartoInformativo,
  agruparRechequeoInformativo,
  ordenarAlertasHistorial,
  particionarAlertasGestor,
  tabAlertasDesdeParam,
  tipoAlertaInformativa,
} from '@/utils/hatoAlertasGestor';
import type { RespuestaAlertaHato, TipoAlertaHato } from '@/utils/hatoAlertas';

function SeccionTema({
  tipo,
  alertas,
  canWrite,
  idActuando,
  onResponder,
  onEditar,
  onDescartar,
}: {
  tipo: TipoAlertaHato;
  alertas: AlertaHatoEnriquecida[];
  canWrite: boolean;
  idActuando: string | null;
  onResponder?: (id: string, respuesta: RespuestaAlertaHato) => void;
  onEditar?: (alerta: AlertaHatoEnriquecida) => void;
  onDescartar?: (id: string) => void;
}) {
  const delTipo = ordenarAlertasHato(alertas.filter((a) => a.tipo === tipo));
  const grupos = tipo === 'rechequeo_due'
    ? agruparRechequeoInformativo(delTipo)
    : tipo === 'parto_proximo'
      ? agruparPartoInformativo(delTipo)
      : [];

  return (
    <section className="mb-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">
        {LABEL_TIPO_ALERTA_HATO[tipo]}
      </h3>
      {tipoAlertaInformativa(tipo) ? (
        grupos.length === 0 ? (
          <p className="text-sm text-gray-500 px-1">Ninguna.</p>
        ) : (
          <div className="space-y-2">
            {grupos.map((grupo) => (
              <AlertaGrupoInformativo key={grupo.clave} grupo={grupo} />
            ))}
          </div>
        )
      ) : delTipo.length === 0 ? (
        <p className="text-sm text-gray-500 px-1">Ninguna.</p>
      ) : (
        <div className="space-y-2">
          {delTipo.map((alerta) => (
            <AlertaFila
              key={alerta.id}
              alerta={alerta}
              canWrite={canWrite}
              actuando={idActuando === alerta.id}
              onResponder={onResponder}
              onEditar={onEditar}
              onDescartar={onDescartar}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function AlertasView() {
  const { profile, user } = useAuth();
  const canWrite = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';
  const canGerencia = profile?.rol === 'Gerencia';

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(tabAlertasDesdeParam(searchParams.get('tab')));

  const {
    alertas,
    loading,
    error,
    actualizarEstadoAlertas,
    responderAlerta,
    editarAlerta,
    crearAlertaManual,
  } = useHatoAlertas();
  const [idActuando, setIdActuando] = useState<string | null>(null);
  const [crearOpen, setCrearOpen] = useState(false);
  const [guardandoForm, setGuardandoForm] = useState(false);
  const [alertaEditando, setAlertaEditando] = useState<AlertaHatoEnriquecida | null>(null);

  const { gerencia, campo, completadas } = useMemo(
    () => particionarAlertasGestor(alertas),
    [alertas],
  );
  const historial = useMemo(() => ordenarAlertasHistorial(completadas), [completadas]);
  const nombreActor = profile?.nombre ?? null;

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

  const handleDescartar = async (id: string) => {
    setIdActuando(id);
    try {
      await actualizarEstadoAlertas([id], { estado: 'descartada', respondidaPor: nombreActor });
      toast.success('Alerta descartada');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error descartando la alerta: ' + message);
    } finally {
      setIdActuando(null);
    }
  };

  const propsFila = {
    canWrite,
    idActuando,
    onResponder: canWrite ? handleResponder : undefined,
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
          subtitle="Activas, historial y quién recibe cada tipo."
        />

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(tabAlertasDesdeParam(v))} activationMode="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="activas" className="flex items-center gap-2">
              <ListTodo className="w-4 h-4" />
              Alertas activas
            </TabsTrigger>
            <TabsTrigger value="historial" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Historial
            </TabsTrigger>
            <TabsTrigger value="configuracion" className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Configuración
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activas" className="mt-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : gerencia.length === 0 && campo.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
                <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  No hay alertas activas. El motor las genera cada día a las 5:45 a.m.
                </p>
              </div>
            ) : (
              <>
                <section className="mb-10">
                  {TEMAS_ALERTA_GERENCIA.map((tipo) => (
                    <SeccionTema key={tipo} tipo={tipo} alertas={gerencia} {...propsFila} />
                  ))}
                </section>

                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <BellRing className="w-4 h-4 text-amber-600" />
                    <h2 className="text-sm font-semibold text-gray-900">
                      Pendientes en campo
                    </h2>
                  </div>
                  {TEMAS_ALERTA_CAMPO.map((tipo) => (
                    <SeccionTema key={tipo} tipo={tipo} alertas={campo} {...propsFila} />
                  ))}
                </section>
              </>
            )}
          </TabsContent>

          <TabsContent value="historial" className="mt-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <AlertaHistorialTabla alertas={historial} />
            )}
          </TabsContent>

          <TabsContent value="configuracion" className="mt-6 space-y-10">
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Usuarios</h2>
              <AlertasQuienRecibeTab canGerencia={canGerencia} updatedBy={profile?.id ?? null} />
            </section>
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Tipos</h2>
                {canWrite && (
                  <Button size="sm" onClick={() => setCrearOpen(true)}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Crear alerta
                  </Button>
                )}
              </div>
              <AlertasTiposTab canWrite={canWrite} />
            </section>
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
    </div>
  );
}
