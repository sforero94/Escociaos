import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber, formatCurrency } from '@/utils/format';
import { formatearFecha, obtenerFechaHoy } from '@/utils/fechas';
import { antiguedadEnDias, cabezasDePendiente } from '@/utils/calculosGanado';
import type { GanMovimiento } from '@/types/ganado';

const TIPO_LABELS: Record<string, string> = {
  compra: 'Compra',
  venta: 'Venta',
};

const TIPO_BADGE: Record<string, string> = {
  compra: 'bg-green-100 text-green-800',
  venta: 'bg-blue-100 text-blue-800',
};

/**
 * `fetchPendientes` puede traer el valor de la transacción embebido cuando
 * el rol del usuario lo permite (B-2, último criterio) — el campo es
 * opcional a propósito: si el embed no viene, la celda cae a "—", nunca a
 * un valor inventado.
 */
export interface PendienteConValor extends GanMovimiento {
  valor_total?: number | null;
}

/** `created_at` es un timestamptz; se reduce a fecha LOCAL, nunca UTC. */
function fechaLocalDeTimestamp(ts: string): string {
  const d = new Date(ts);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

interface BannerPendientesProps {
  pendientes: PendienteConValor[];
  canWrite: boolean;
  canVerPlata: boolean;
  onConfirmar: (m: GanMovimiento) => void;
  onDescartar: (m: GanMovimiento) => void;
}

/**
 * Deuda de confirmación del puente Finanzas → Inventario, con antigüedad en
 * días (B-5): la plata se conoce antes que el potrero, así que el valor ya
 * es visible acá cuando el rol lo permite (B-2, último criterio).
 */
export function BannerPendientes({ pendientes, canWrite, canVerPlata, onConfirmar, onDescartar }: BannerPendientesProps) {
  if (pendientes.length === 0) return null;
  const hoy = obtenerFechaHoy();

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">Pendientes de confirmar ({pendientes.length})</h3>
      </div>
      <div className="space-y-2">
        {pendientes.map((p) => {
          const dias = antiguedadEnDias(fechaLocalDeTimestamp(p.created_at), hoy);
          return (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-amber-200 px-3 py-2"
            >
              <div className="text-sm">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${
                    TIPO_BADGE[p.tipo] || 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {TIPO_LABELS[p.tipo] || p.tipo}
                </span>
                <strong>{formatNumber(cabezasDePendiente(p))}</strong> cabezas · {formatearFecha(p.fecha)}
                {canVerPlata && p.valor_total != null && (
                  <span className="text-brand-brown/70"> · {formatCurrency(p.valor_total)}</span>
                )}
                <span className="text-amber-700 ml-2">
                  pendiente hace {dias} {dias === 1 ? 'día' : 'días'}
                </span>
                {p.notas && <span className="text-brand-brown/60 ml-2 hidden sm:inline">{p.notas}</span>}
              </div>
              {canWrite && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => onConfirmar(p)}>
                    Confirmar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onDescartar(p)} title="Descartar (ya registrado manualmente)">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
