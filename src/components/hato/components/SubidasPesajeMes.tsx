// ARCHIVO: components/hato/components/SubidasPesajeMes.tsx
// DESCRIPCIÓN: lista las planillas subidas del mes en Producción.
// Gerencia descarta una subida (foto + litros ligados). El resto del
// mes queda. Issue #297.

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { diaBogota, horaBogota, obtenerFechaHoy } from '@/utils/fechas';
import { formatLongDate, formatShortDate } from '@/utils/format';
import { textoDescartarSubida, BUCKET_PESAJES, type SubidaLigada } from '@/utils/hato/subidasPesajeMes';
import { useSubidasPesajeMes } from '../hooks/useSubidasPesajeMes';

const ETIQUETA_SIN_AUTOR = 'Sin autor registrado';
const CLASE_DESCARTAR = 'border-red-600 text-red-600 hover:bg-red-50 hover:text-red-600';

const ESTADO: Record<string, string> = {
  ok: 'Ok',
  pendiente: 'Pendiente',
  ocr_fallo: 'Falló el OCR',
  abandonado: 'Abandonada',
  error: 'Error',
};

function mesActualIso(): string {
  return obtenerFechaHoy().slice(0, 7);
}

function etiquetaOrigen(origen: string): string {
  if (origen === 'telegram') return 'Desde Telegram';
  if (origen === 'web') return 'Desde la web';
  return 'Origen sin dato';
}

function nombreMes(anio: number, mes: number): string {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(new Date(anio, mes - 1, 1));
}

export interface SubidaVisible {
  id: string;
  autor: string;
  cuando: string;
  origen: string;
  estado: string;
  rango: string;
  fotos: number;
  url: string | null;
}

export function filasVisibles(
  subidas: readonly SubidaLigada[],
  autores: ReadonlyMap<string, string>,
  urls: Readonly<Record<string, string>>,
): SubidaVisible[] {
  return subidas.map((subida) => {
    const { captura } = subida;
    const ruta = captura.storageRutas[0];
    const url = ruta && captura.storageBucket === BUCKET_PESAJES ? (urls[`${captura.id}:${ruta}`] ?? null) : null;
    const rango =
      subida.desde == null
        ? 'Sin litros ligados'
        : subida.desde === subida.hasta
          ? `Litros del ${formatShortDate(subida.desde)}`
          : `Litros del ${formatShortDate(subida.desde)} al ${formatShortDate(subida.hasta ?? subida.desde)}`;
    return {
      id: captura.id,
      autor: (captura.createdBy && autores.get(captura.createdBy)) || ETIQUETA_SIN_AUTOR,
      cuando: `${formatLongDate(diaBogota(captura.creadoEn))} a las ${horaBogota(captura.creadoEn)}`,
      origen: etiquetaOrigen(captura.origen),
      estado: ESTADO[captura.desenlace] ?? 'Sin estado',
      rango,
      fotos: captura.storageRutas.length,
      url,
    };
  });
}

export function ListaSubidasMes({
  subidas,
  puedeGerencia,
  descartando,
  onDescartar,
}: {
  subidas: SubidaVisible[];
  puedeGerencia: boolean;
  descartando: boolean;
  onDescartar: (id: string) => void;
}) {
  if (subidas.length === 0) {
    return <p className="text-sm text-gray-500">Este mes no tiene subidas.</p>;
  }
  return (
    <ul className="space-y-3">
      {subidas.map((subida) => (
        <li key={subida.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 sm:flex-row sm:items-center">
          {subida.url ? (
            <img src={subida.url} alt="" className="h-16 w-16 rounded-md border border-gray-200 object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-500">
              Sin foto
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">Subió {subida.autor}</p>
            <p className="text-xs text-gray-500">
              {subida.cuando} · {subida.origen} · {subida.estado}
            </p>
            <p className="text-xs text-gray-700">
              {subida.rango}
              {subida.fotos > 1 ? ` · ${subida.fotos} fotos` : ''}
            </p>
          </div>
          {puedeGerencia && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={CLASE_DESCARTAR}
              disabled={descartando}
              onClick={() => onDescartar(subida.id)}
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Descartar esta subida
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SubidasPesajeMes({ onCambio }: { onCambio: () => void }) {
  const { hasRole, isLoading } = useAuth();
  const puedeGerencia = !isLoading && hasRole(['Gerencia']);
  const [periodo, setPeriodo] = useState(mesActualIso);
  const [anioTexto, mesTexto] = periodo.split('-');
  const anio = parseInt(anioTexto, 10);
  const mes = parseInt(mesTexto, 10);
  const periodoValido = Number.isFinite(anio) && Number.isFinite(mes) && mes >= 1 && mes <= 12;
  const estado = useSubidasPesajeMes(anio, mes);
  const [confirmarId, setConfirmarId] = useState<string | null>(null);

  const visibles = filasVisibles(estado.subidas, estado.autores, estado.urls);
  const elegida = estado.subidas.find((subida) => subida.captura.id === confirmarId) ?? null;
  const descripcion = elegida
    ? textoDescartarSubida(
        elegida.filaIds.length,
        elegida.desde ? formatShortDate(elegida.desde) : null,
        elegida.hasta ? formatShortDate(elegida.hasta) : null,
      )
    : '';

  const descartar = async () => {
    if (!confirmarId || !puedeGerencia) return;
    const id = confirmarId;
    setConfirmarId(null);
    const ok = await estado.descartar(id);
    if (ok) {
      toast.success('Subida descartada');
      onCambio();
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Subidas del mes</h3>
          <p className="text-xs text-gray-500">
            {periodoValido ? nombreMes(anio, mes) : 'Elige un mes'}
            {'. '}
            Cada fila es una planilla subida.
          </p>
        </div>
        <Input
          type="month"
          aria-label="Mes de las subidas"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="w-40"
        />
      </div>
      {estado.error && <p className="mb-3 text-sm text-red-600">{estado.error}</p>}
      {estado.cargando ? (
        <p className="flex items-center text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando subidas…
        </p>
      ) : (
        <ListaSubidasMes
          subidas={visibles}
          puedeGerencia={puedeGerencia}
          descartando={estado.descartando}
          onDescartar={setConfirmarId}
        />
      )}
      {!puedeGerencia && !estado.cargando && (
        <p className="mt-3 text-xs text-gray-500">Solo Gerencia puede descartar una subida.</p>
      )}
      <ConfirmDialog
        open={confirmarId != null}
        onOpenChange={(open) => { if (!open) setConfirmarId(null); }}
        title="Descartar esta subida"
        description={descripcion}
        confirmLabel="Descartar"
        destructive
        onConfirm={() => { void descartar(); }}
      />
    </section>
  );
}
