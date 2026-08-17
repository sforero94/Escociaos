import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getSupabase } from '@/utils/supabase/client';
import { formatNumber } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';

// Fecha de lanzamiento de esta pantalla — el contador es prospectivo a
// propósito: las 92 transacciones históricas sin movimiento NO se
// backfillean (R-10, migración 044 §5), así que contarlas convertiría el
// indicador en un número fijo que nadie puede bajar.
const FECHA_LANZAMIENTO = '2026-08-17';

/**
 * "N transacciones de finanzas sin movimiento confirmado en inventario"
 * desde el lanzamiento — mitigación de R-B y métrica 8.3 a la vez. Consulta
 * directa (no pasa por `useGanadoInventario`, que solo cubre `gan_*`):
 * cuenta `fin_transacciones_ganado` posteriores al corte y las cruza contra
 * `gan_movimientos.estado = 'confirmado'`.
 */
export function ContadorBrechaFinanzas() {
  const [estado, setEstado] = useState<{ total: number; sinConfirmar: number } | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        // es_hato=false: una venta del Hato Lechero no es un movimiento de
        // inventario de ceba — este contador es solo del puente Ganado.
        const { data: transacciones, error: errorTx } = await supabase
          .from('fin_transacciones_ganado')
          .select('id')
          .eq('es_hato', false)
          .gte('fecha', FECHA_LANZAMIENTO);
        if (errorTx || !transacciones) return;
        if (transacciones.length === 0) {
          if (activo) setEstado({ total: 0, sinConfirmar: 0 });
          return;
        }

        const ids = transacciones.map((t: { id: string }) => t.id);
        const { data: movimientos, error: errorMov } = await supabase
          .from('gan_movimientos')
          .select('transaccion_ganado_id')
          .in('transaccion_ganado_id', ids)
          .eq('estado', 'confirmado');
        if (errorMov) return;

        const confirmadas = new Set(
          (movimientos || []).map((m: { transaccion_ganado_id: string }) => m.transaccion_ganado_id)
        );
        const sinConfirmar = ids.filter((id: string) => !confirmadas.has(id)).length;
        if (activo) setEstado({ total: ids.length, sinConfirmar });
      } catch {
        // Métrica de apoyo — si falla no bloquea el resto de la pantalla.
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  if (!estado || estado.sinConfirmar === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-brand-brown/60">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
      <span>
        <strong className="text-brand-brown/80">{formatNumber(estado.sinConfirmar)}</strong> de{' '}
        <strong className="text-brand-brown/80">{formatNumber(estado.total)}</strong> transacciones de ganado
        registradas desde el {formatearFecha(FECHA_LANZAMIENTO)} siguen sin un movimiento confirmado en inventario
      </span>
    </div>
  );
}
