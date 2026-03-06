import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock, Loader2, X } from 'lucide-react';
import { getSupabase } from '@/utils/supabase/client';
import { formatNumber } from '@/utils/format';
import { formatearFechaCorta } from '@/utils/fechas';
import { Badge } from '@/components/ui/badge';

interface GastosDetalleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  negocioId: string;
  negocioNombre: string;
  categoriaNombre: string;
  periodoLabel: string;
  fechaDesde: string;
  fechaHasta: string;
}

interface GastoDetalle {
  id: string;
  nombre: string;
  fecha: string;
  valor: number;
  estado: string;
  observaciones?: string;
  fin_negocios?: { nombre: string };
  fin_regiones?: { nombre: string };
  fin_categorias_gastos?: { nombre: string };
  fin_conceptos_gastos?: { nombre: string };
  fin_medios_pago?: { nombre: string };
}

export function GastosDetalleDialog({
  open,
  onOpenChange,
  negocioId,
  negocioNombre,
  categoriaNombre,
  periodoLabel,
  fechaDesde,
  fechaHasta,
}: GastosDetalleDialogProps) {
  const [gastos, setGastos] = useState<GastoDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  // Lock body scroll when dialog is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) loadGastos();
  }, [open, negocioId, categoriaNombre, fechaDesde, fechaHasta]);

  const loadGastos = async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();

      const { data: catData } = await (supabase
        .from('fin_categorias_gastos')
        .select('id')
        .eq('nombre', categoriaNombre) as any);

      const categoriaIds = (catData as any[])?.map((c: any) => c.id) || [];

      let query: any = supabase
        .from('fin_gastos')
        .select(`
          id, nombre, fecha, valor, estado, observaciones,
          fin_negocios (nombre),
          fin_regiones (nombre),
          fin_categorias_gastos (nombre),
          fin_conceptos_gastos (nombre),
          fin_medios_pago (nombre)
        `)
        .eq('negocio_id', negocioId)
        .eq('estado', 'Confirmado')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta);

      if (categoriaIds.length > 0) {
        query = query.in('categoria_id', categoriaIds);
      }

      query = query.order('fecha', { ascending: false });

      const { data } = await query;
      const items = (data || []) as GastoDetalle[];
      setGastos(items);
      setTotal(items.reduce((s, g) => s + (g.valor || 0), 0));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return createPortal(
    // Fullscreen overlay — flex centering, above everything
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div
        className="relative w-[90%] max-w-3xl max-h-[80vh] flex flex-col overflow-hidden bg-background rounded-xl shadow-2xl border border-border"
      >
        {/* Header — never scrolls */}
        <div className="shrink-0 p-6 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-base font-semibold text-foreground">
              Gastos de {negocioNombre} para {categoriaNombre} — {periodoLabel}
            </h2>
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-red-50 px-3 py-1.5 text-right">
                <p className="text-[10px] font-medium text-red-600 uppercase">Total</p>
                <p className="text-lg font-bold text-red-700">${formatNumber(total)}</p>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : gastos.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-brand-brown/50">Sin gastos para esta combinación</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {gastos.map((gasto) => {
                const EstadoIcon = gasto.estado === 'Confirmado' ? CheckCircle2 : Clock;
                const estadoColor = gasto.estado === 'Confirmado'
                  ? 'bg-green-100 text-green-800 border-green-200'
                  : 'bg-yellow-100 text-yellow-800 border-yellow-200';

                return (
                  <div key={gasto.id} className="py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          gasto.estado === 'Confirmado' ? 'bg-green-100' : 'bg-yellow-100'
                        }`}>
                          <EstadoIcon className={`w-4 h-4 ${
                            gasto.estado === 'Confirmado' ? 'text-green-600' : 'text-yellow-600'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-gray-900 truncate">{gasto.nombre}</span>
                            <Badge className={`text-[10px] ${estadoColor}`}>{gasto.estado}</Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                            <span>📅 {formatearFechaCorta(gasto.fecha)}</span>
                            {gasto.fin_regiones?.nombre && <span>📍 {gasto.fin_regiones.nombre}</span>}
                            {gasto.fin_conceptos_gastos?.nombre && <span>💡 {gasto.fin_conceptos_gastos.nombre}</span>}
                            {gasto.fin_medios_pago?.nombre && <span>💳 {gasto.fin_medios_pago.nombre}</span>}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-gray-900 shrink-0">${formatNumber(gasto.valor)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
