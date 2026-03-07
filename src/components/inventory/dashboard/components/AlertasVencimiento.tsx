import { AlertTriangle, Clock } from 'lucide-react';
import { formatearFecha } from '@/utils/fechas';
import type { AlertaVencimiento } from '../hooks/useInventoryDashboard';

interface AlertasVencimientoProps {
  data: AlertaVencimiento[];
  loading?: boolean;
}

export function AlertasVencimiento({ data, loading }: AlertasVencimientoProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-6">
        <div className="animate-pulse space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const vencidos = data.filter(a => a.vencido);
  const proximos = data.filter(a => !a.vencido);

  return (
    <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-primary/10 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Alertas de Vencimiento</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          vencidos.length > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {vencidos.length > 0 ? `${vencidos.length} vencido${vencidos.length > 1 ? 's' : ''}` : 'Sin vencidos'}
        </span>
      </div>

      <div className="max-h-[320px] overflow-y-auto">
        {data.length === 0 ? (
          <div className="p-8 text-center">
            <Clock className="w-10 h-10 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-brand-brown/50">Sin alertas de vencimiento</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {vencidos.map(item => (
              <div key={item.compra_id} className="px-4 py-3 bg-red-50/50 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{item.producto_nombre}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-red-600 font-medium">Vencido {formatearFecha(item.fecha_vencimiento)}</span>
                    <span className="text-xs text-brand-brown/40">|</span>
                    <span className="text-xs text-brand-brown/50">{item.proveedor}</span>
                  </div>
                </div>
                <span className="text-xs text-brand-brown/60 whitespace-nowrap">
                  {item.cantidad} {item.unidad}
                </span>
              </div>
            ))}
            {proximos.map(item => (
              <div key={item.compra_id} className="px-4 py-3 flex items-start gap-3">
                <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{item.producto_nombre}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-amber-600 font-medium">
                      Vence en {item.dias_restantes} dia{item.dias_restantes !== 1 ? 's' : ''} ({formatearFecha(item.fecha_vencimiento)})
                    </span>
                    <span className="text-xs text-brand-brown/40">|</span>
                    <span className="text-xs text-brand-brown/50">{item.proveedor}</span>
                  </div>
                </div>
                <span className="text-xs text-brand-brown/60 whitespace-nowrap">
                  {item.cantidad} {item.unidad}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
