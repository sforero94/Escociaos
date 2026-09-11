// ARCHIVO: components/hato/components/AlertasQuienRecibeTab.tsx
// DESCRIPCIÓN: Matriz tipo × usuario sobre telegram_alertas_suscripciones
// (issue #217). Filas = tipos del catálogo, columnas = usuarios Telegram,
// casilla = recibe sí/no. Escalamiento no vive en esta superficie.
// Un usuario `campo` no puede recibir tipos de gerencia — el checkbox se
// apaga y el guardrail del tick vuelve a filtrar.

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAlertasRouting } from '../hooks/useAlertasRouting';
import {
  agruparAlertasPorModulo,
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
  const { catalogo, usuarios, suscripciones, loading, error, guardarSuscripcionesMatriz } = useAlertasRouting();
  const [estados, setEstados] = useState<Record<string, SuscripcionEstado>>({});
  const [guardando, setGuardando] = useState(false);

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

  const handleToggle = (usuario: TelegramUsuarioRow, clave: string) => {
    if (!puedeRecibirAlertaTelegram(usuario.rol_bot, clave)) return;
    setEstados((prev) => ({
      ...prev,
      [usuario.id]: alternarRecibe(prev[usuario.id] ?? {}, clave),
    }));
  };

  const handleGuardar = async () => {
    setGuardando(true);
    try {
      await guardarSuscripcionesMatriz(estados, updatedBy);
      toast.success('Quién recibe quedó guardado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudo guardar la matriz: ' + message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-gray-600 max-w-2xl">
          Una fila por tipo de alerta, una columna por usuario. La casilla es Recibe.
          Fernando (campo) solo puede recibir Secado y Paso de tratamiento.
        </p>
        <Button size="sm" disabled={guardando} onClick={() => void handleGuardar()}>
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
        </Button>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-brand-brown/60">
              <th className="py-2 px-3 min-w-[12rem] sticky left-0 bg-white">Tipo</th>
              {usuarios.map((usuario) => (
                <th key={usuario.id} className="py-2 px-3 text-center min-w-[7rem]">
                  <span className="block font-medium text-gray-900">{usuario.nombre_display}</span>
                  <span className="block text-[11px] font-normal text-gray-500">
                    {ROL_LABEL[usuario.rol_bot] ?? usuario.rol_bot}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((grupo) => (
              <Fragment key={grupo.modulo}>
                <tr className="bg-muted/40">
                  <td
                    colSpan={usuarios.length + 1}
                    className="py-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-brand-brown/70"
                  >
                    {grupo.label}
                  </td>
                </tr>
                {grupo.alertas.map((alerta) => (
                  <tr key={alerta.clave} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3 sticky left-0 bg-white">{alerta.nombre}</td>
                    {usuarios.map((usuario) => {
                      const actual = estados[usuario.id]?.[alerta.clave] ?? { recibe: false, escalamiento: false };
                      const permitido = puedeRecibirAlertaTelegram(usuario.rol_bot, alerta.clave);
                      return (
                        <td key={usuario.id} className="py-2 px-3 text-center">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={permitido && actual.recibe}
                              disabled={!permitido || guardando}
                              onCheckedChange={() => handleToggle(usuario, alerta.clave)}
                              aria-label={`${alerta.nombre} para ${usuario.nombre_display}`}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
