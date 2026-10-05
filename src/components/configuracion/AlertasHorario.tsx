// ARCHIVO: components/configuracion/AlertasHorario.tsx
// DESCRIPCIÓN: Hora diaria de envío de las alertas (migración 175). Una fila
// por proceso que manda alertas por Telegram. La hora es de Colombia.

import { useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHorarioAlertas } from './hooks/useHorarioAlertas';
import {
  ETIQUETA_JOB_HORARIO,
  esJobHorarioAlertas,
  formatearHoraAlertas,
  validarHoraAlertas,
} from '@/utils/horarioAlertas';

export function AlertasHorario() {
  const { filas, loading, error, sinMigracion, cambiarHora } = useHorarioAlertas();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (sinMigracion) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        El horario todavía no se puede editar: falta aplicar la migración 175 en la base de datos.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
    );
  }

  const handleGuardar = async (jobname: string) => {
    if (!esJobHorarioAlertas(jobname)) return;
    const hora = draft[jobname];
    if (hora === undefined) return;
    const errorHora = validarHoraAlertas(hora);
    if (errorHora) {
      toast.error(errorHora);
      return;
    }
    setGuardando(jobname);
    try {
      await cambiarHora(jobname, hora);
      toast.success(`${ETIQUETA_JOB_HORARIO[jobname].titulo}: ahora a las ${formatearHoraAlertas(hora)}`);
      setDraft((prev) => {
        const next = { ...prev };
        delete next[jobname];
        return next;
      });
    } catch (err) {
      toast.error('No se pudo cambiar la hora: ' + (err instanceof Error ? err.message : 'error desconocido'));
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Hora de Colombia a la que el sistema revisa y envía las alertas cada día. El cambio vale desde el día siguiente
        si la hora nueva ya pasó hoy.
      </p>
      {filas.filter((f) => esJobHorarioAlertas(f.jobname)).map((fila) => {
        const etiqueta = ETIQUETA_JOB_HORARIO[fila.jobname as keyof typeof ETIQUETA_JOB_HORARIO];
        const valor = draft[fila.jobname] ?? fila.hora_bogota ?? '';
        const cambiado = draft[fila.jobname] !== undefined && draft[fila.jobname] !== fila.hora_bogota;
        const ocupado = guardando === fila.jobname;
        return (
          <div
            key={fila.jobname}
            className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                {etiqueta.titulo}
              </p>
              <p className="text-xs text-gray-500">{etiqueta.descripcion}</p>
              <p className="text-xs text-gray-500 mt-1">
                Hoy: {formatearHoraAlertas(fila.hora_bogota)}
                {!fila.activo && ' · proceso pausado'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={valor}
                disabled={ocupado}
                onChange={(e) => setDraft((prev) => ({ ...prev, [fila.jobname]: e.target.value }))}
                className="w-32"
                aria-label={`Hora de ${etiqueta.titulo}`}
              />
              <Button size="sm" disabled={!cambiado || ocupado} onClick={() => void handleGuardar(fila.jobname)}>
                {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
