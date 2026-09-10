// ARCHIVO: components/hato/components/AlertasQuienRecibeTab.tsx
// DESCRIPCIÓN: Matriz telegram_usuarios × alertas_catalogo (issue #217).
// Misma tabla que TelegramConfig. Un usuario `campo` no puede recibir tipos
// de gerencia del hato — el checkbox se apaga y el guardrail del tick
// vuelve a filtrar.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAlertasRouting } from '../hooks/useAlertasRouting';
import {
  agruparAlertasPorModulo,
  alternarEscalamiento,
  alternarRecibe,
  construirEstadoDesdeSuscripciones,
  puedeRecibirAlertaTelegram,
  type SuscripcionEstado,
} from '@/utils/telegramAlertas';
import type { TelegramUsuarioRow } from '@/utils/telegramUsuarios';

const ROL_LABEL: Record<string, string> = {
  campo: 'Campo',
  admin: 'Admin',
  gerencia: 'Gerencia',
  monitor: 'Monitor',
};

export function AlertasQuienRecibeTab({
  canGerencia,
  updatedBy,
}: {
  canGerencia: boolean;
  updatedBy: string | null;
}) {
  const { catalogo, usuarios, suscripciones, loading, error, guardarSuscripciones } = useAlertasRouting();
  const [estados, setEstados] = useState<Record<string, SuscripcionEstado>>({});
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

  const grupos = useMemo(() => agruparAlertasPorModulo(catalogo), [catalogo]);

  useEffect(() => {
    const next: Record<string, SuscripcionEstado> = {};
    for (const u of usuarios) {
      next[u.id] = construirEstadoDesdeSuscripciones(
        suscripciones.filter((s) => s.telegram_usuario_id === u.id),
      );
    }
    setEstados(next);
  }, [usuarios, suscripciones]);

  if (!canGerencia) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 flex items-center gap-3">
        <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-gray-600">
          Solo Gerencia configura quién recibe cada alerta en Telegram.
        </p>
      </div>
    );
  }

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

  if (usuarios.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        No hay usuarios de Telegram activos. Créalos en Configuración → Telegram.
      </div>
    );
  }

  const handleGuardar = async (usuario: TelegramUsuarioRow) => {
    setGuardandoId(usuario.id);
    try {
      await guardarSuscripciones(usuario, estados[usuario.id] ?? {}, updatedBy);
      toast.success(`Alertas de ${usuario.nombre_display} guardadas`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudieron guardar las alertas: ' + message);
    } finally {
      setGuardandoId(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Fernando (campo) solo puede recibir Secado y Paso de tratamiento en Telegram.
        El resto de tipos del hato quedan en la cola web, salvo que Gerencia las reciba.
      </p>
      {usuarios.map((usuario) => {
        const estado = estados[usuario.id] ?? {};
        return (
          <div key={usuario.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">{usuario.nombre_display}</p>
                <p className="text-xs text-gray-500">{ROL_LABEL[usuario.rol_bot] ?? usuario.rol_bot}</p>
              </div>
              <Button
                size="sm"
                disabled={guardandoId === usuario.id}
                onClick={() => void handleGuardar(usuario)}
              >
                {guardandoId === usuario.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
            {grupos.map((grupo) => (
              <div key={grupo.modulo}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {grupo.label}
                </p>
                <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {grupo.alertas.map((alerta) => {
                    const actual = estado[alerta.clave] ?? { recibe: false, escalamiento: false };
                    const permitido = puedeRecibirAlertaTelegram(usuario.rol_bot, alerta.clave);
                    return (
                      <div key={alerta.clave} className="flex items-start justify-between gap-3 p-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{alerta.nombre}</p>
                          {!permitido && (
                            <p className="text-xs text-amber-700 mt-0.5">
                              Campo no recibe este tipo en Telegram.
                            </p>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 gap-4">
                          <label className="flex flex-col items-center gap-1 text-xs text-gray-500">
                            <Checkbox
                              checked={permitido && actual.recibe}
                              disabled={!permitido}
                              onCheckedChange={() =>
                                setEstados((prev) => ({
                                  ...prev,
                                  [usuario.id]: alternarRecibe(prev[usuario.id] ?? {}, alerta.clave),
                                }))
                              }
                            />
                            Recibe
                          </label>
                          <label className="flex flex-col items-center gap-1 text-xs text-gray-500">
                            <Checkbox
                              checked={permitido && actual.escalamiento}
                              disabled={!permitido}
                              onCheckedChange={() =>
                                setEstados((prev) => ({
                                  ...prev,
                                  [usuario.id]: alternarEscalamiento(prev[usuario.id] ?? {}, alerta.clave),
                                }))
                              }
                            />
                            Escalamiento
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
