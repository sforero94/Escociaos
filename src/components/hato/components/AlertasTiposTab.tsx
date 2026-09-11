// ARCHIVO: components/hato/components/AlertasTiposTab.tsx
// DESCRIPCIÓN: Activo + horas de escalamiento de `hato_alertas_config`
// (issue #217). Un tipo inactivo no se despacha por Telegram; la cola web
// sigue mostrando las filas ya generadas.

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useHatoAlertasConfig } from '../hooks/useHatoAlertasConfig';
import { LABEL_TIPO_ALERTA_HATO, TIPOS_ALERTA_HATO } from '@/utils/hatoAlertasUi';
import { etiquetaCanalAlerta, validarHorasEscalamiento } from '@/utils/hatoAlertasGestor';
import type { TipoAlertaHato } from '@/utils/hatoAlertas';

export function AlertasTiposTab({ canWrite }: { canWrite: boolean }) {
  const { filas, loading, error, actualizarConfig } = useHatoAlertasConfig();
  const [horasDraft, setHorasDraft] = useState<Record<string, string>>({});
  const [guardandoTipo, setGuardandoTipo] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const porTipo = new Map(filas.map((f) => [f.tipo, f]));

  const handleActivo = async (tipo: TipoAlertaHato, activo: boolean) => {
    setGuardandoTipo(tipo);
    try {
      await actualizarConfig(tipo, { activo });
      toast.success(activo ? 'Tipo activo' : 'Tipo pausado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudo actualizar el tipo: ' + message);
    } finally {
      setGuardandoTipo(null);
    }
  };

  const handleHorasBlur = async (tipo: TipoAlertaHato) => {
    const fila = porTipo.get(tipo);
    if (!fila) return;
    const crudo = horasDraft[tipo];
    if (crudo === undefined) return;
    const valor = Number(crudo);
    const errorHoras = validarHorasEscalamiento(valor);
    if (errorHoras) {
      toast.error(errorHoras);
      setHorasDraft((prev) => {
        const next = { ...prev };
        delete next[tipo];
        return next;
      });
      return;
    }
    if (valor === fila.horas_escalamiento) {
      setHorasDraft((prev) => {
        const next = { ...prev };
        delete next[tipo];
        return next;
      });
      return;
    }
    setGuardandoTipo(tipo);
    try {
      await actualizarConfig(tipo, { horas_escalamiento: valor });
      toast.success('Horas de escalamiento actualizadas');
      setHorasDraft((prev) => {
        const next = { ...prev };
        delete next[tipo];
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudieron guardar las horas: ' + message);
    } finally {
      setGuardandoTipo(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Un tipo pausado no se manda por Telegram. Las filas ya generadas siguen en Activas o Historial.
        Campo = Secado y Paso de tratamiento. El resto es web, salvo que Gerencia lo reciba.
      </p>
      {TIPOS_ALERTA_HATO.map((tipo) => {
        const fila = porTipo.get(tipo);
        if (!fila) return null;
        const canal = etiquetaCanalAlerta(tipo);
        const horas = horasDraft[tipo] ?? String(fila.horas_escalamiento);
        const ocupado = guardandoTipo === tipo;
        return (
          <div key={tipo} className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{LABEL_TIPO_ALERTA_HATO[tipo]}</p>
              <p className="text-xs text-gray-500">
                Canal por defecto: {canal === 'campo' ? 'Telegram de campo' : 'Solo web'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <Switch
                  checked={fila.activo}
                  disabled={!canWrite || ocupado}
                  onCheckedChange={(v) => void handleActivo(tipo, v === true)}
                />
                Activo
              </label>
              <div className="flex items-center gap-2">
                <Label htmlFor={`horas-${tipo}`} className="text-xs text-gray-500 whitespace-nowrap">
                  Horas de escalamiento
                </Label>
                <Input
                  id={`horas-${tipo}`}
                  type="number"
                  min={1}
                  max={336}
                  step={1}
                  value={horas}
                  disabled={!canWrite || ocupado}
                  onChange={(e) => setHorasDraft((prev) => ({ ...prev, [tipo]: e.target.value }))}
                  onBlur={() => void handleHorasBlur(tipo)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-24"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
