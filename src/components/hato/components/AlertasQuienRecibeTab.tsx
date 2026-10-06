// ARCHIVO: components/hato/components/AlertasQuienRecibeTab.tsx
// DESCRIPCIÓN: Matriz tipo × usuario sobre telegram_alertas_suscripciones
// (issue #217). Filas = tipos del catálogo, columnas = usuarios Telegram,
// dos casillas: Recibe y Escala. Desde 2026-10-05 (decisión del dueño) no
// hay ninguna regla de rol en código: lo que Gerencia marca acá es
// exactamente lo que el tick manda.

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useAlertasRouting } from '../hooks/useAlertasRouting';
import {
  agruparAlertasPorModulo,
  alternarEscalamiento,
  alternarRecibe,
  construirEstadoDesdeSuscripciones,
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

  const handleToggle = (usuario: TelegramUsuarioRow, clave: string, campo: 'recibe' | 'escalamiento') => {
    setEstados((prev) => ({
      ...prev,
      [usuario.id]:
        campo === 'recibe'
          ? alternarRecibe(prev[usuario.id] ?? {}, clave)
          : alternarEscalamiento(prev[usuario.id] ?? {}, clave),
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
          Una fila por tipo de alerta, una columna por usuario. Recibe: le llega la alerta por Telegram.
          Escala: le llega un aviso si nadie responde dentro de las horas de escalamiento del tipo.
          Lo que marques aquí es exactamente lo que el sistema envía.
        </p>
        <Button size="sm" disabled={guardando} onClick={() => void handleGuardar()}>
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sticky className="min-w-[12rem]">Tipo</TableHead>
            {usuarios.map((usuario) => (
              <TableHead key={usuario.id} className="text-center min-w-[7rem] normal-case tracking-normal">
                <span className="block text-sm font-medium text-gray-900">{usuario.nombre_display}</span>
                <span className="block text-[11px] font-normal text-gray-500">
                  {ROL_LABEL[usuario.rol_bot] ?? usuario.rol_bot}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {grupos.map((grupo) => (
            <Fragment key={grupo.modulo}>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell
                  colSpan={usuarios.length + 1}
                  className="py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-brown/70 whitespace-normal"
                >
                  {grupo.label}
                </TableCell>
              </TableRow>
              {grupo.alertas.map((alerta) => (
                <TableRow key={alerta.clave}>
                  <TableCell sticky>{alerta.nombre}</TableCell>
                  {usuarios.map((usuario) => {
                    const actual = estados[usuario.id]?.[alerta.clave] ?? { recibe: false, escalamiento: false };
                    return (
                      <TableCell key={usuario.id} className="text-center">
                        <div className="flex justify-center gap-3">
                          <label className="flex flex-col items-center gap-1 text-[11px] text-gray-500">
                            <Checkbox
                              checked={actual.recibe}
                              disabled={guardando}
                              onCheckedChange={() => handleToggle(usuario, alerta.clave, 'recibe')}
                              aria-label={`${alerta.nombre}: ${usuario.nombre_display} recibe`}
                            />
                            Recibe
                          </label>
                          <label className="flex flex-col items-center gap-1 text-[11px] text-gray-500">
                            <Checkbox
                              checked={actual.escalamiento}
                              disabled={guardando}
                              onCheckedChange={() => handleToggle(usuario, alerta.clave, 'escalamiento')}
                              aria-label={`${alerta.nombre}: ${usuario.nombre_display} recibe el escalamiento`}
                            />
                            Escala
                          </label>
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
