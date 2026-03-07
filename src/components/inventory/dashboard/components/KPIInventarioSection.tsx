import { KPIScorecard } from '@/components/finanzas/dashboard/components/KPIScorecard';
import type { KPIConVariacion } from '@/types/finanzas';
import type { AlertaVencimiento } from '../hooks/useInventoryDashboard';
import { AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { formatearFecha } from '@/utils/fechas';
import { formatCompact, formatNumber } from '@/utils/format';

interface KPIInventarioSectionProps {
  valoracion: KPIConVariacion;
  entradas: KPIConVariacion;
  salidas: KPIConVariacion;
  alertas: AlertaVencimiento[];
}

export function KPIInventarioSection({ valoracion, entradas, salidas, alertas }: KPIInventarioSectionProps) {
  const vencidos = alertas.filter(a => a.vencido);
  const proximos = alertas.filter(a => !a.vencido);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Valoracion + Movimientos COP */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Inventario</h3>
        <KPIScorecard
          label={valoracion.periodo_label}
          valor={valoracion.valor}
          variacion={valoracion.variacion_porcentaje}
          formato="compact"
        />
        <div className="grid grid-cols-2 gap-3">
          <KPIScorecard
            label={entradas.periodo_label}
            valor={entradas.valor}
            variacion={entradas.variacion_porcentaje}
            formato="compact"
            size="sm"
          />
          <KPIScorecard
            label={salidas.periodo_label}
            valor={salidas.valor}
            variacion={salidas.variacion_porcentaje}
            formato="compact"
            size="sm"
          />
        </div>
      </div>

      {/* Right: Alertas de vencimiento */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Alertas de Vencimiento (60 dias)</h3>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            vencidos.length > 0 ? 'bg-red-100 text-red-700' : alertas.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
          }`}>
            {vencidos.length > 0 ? `${vencidos.length} vencido${vencidos.length > 1 ? 's' : ''}` : alertas.length > 0 ? `${proximos.length} proximo${proximos.length > 1 ? 's' : ''}` : 'Sin alertas'}
          </span>
        </div>

        <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
          {alertas.length === 0 ? (
            <div className="p-6 text-center">
              <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className="text-sm text-brand-brown/50">Sin insumos proximos a vencer</p>
            </div>
          ) : (
            <div className="max-h-[200px] overflow-y-auto divide-y divide-gray-50">
              {[...vencidos, ...proximos].map(item => (
                <div key={item.compra_id} className={`px-3 py-2 flex items-center gap-3 text-sm ${item.vencido ? 'bg-red-50/50' : ''}`}>
                  {item.vencido
                    ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    : <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  }
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{item.producto_nombre}</p>
                    <p className="text-xs text-brand-brown/50">{item.categoria}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs tabular-nums">{formatNumber(item.cantidad, 1)} {item.unidad}</p>
                    <p className="text-xs text-brand-brown/50">${formatCompact(item.valor)}</p>
                  </div>
                  <div className="text-right flex-shrink-0 w-20">
                    <p className={`text-xs font-medium ${item.vencido ? 'text-red-600' : 'text-amber-600'}`}>
                      {item.vencido ? 'Vencido' : `${item.dias_restantes}d`}
                    </p>
                    <p className="text-[10px] text-brand-brown/40">{formatearFecha(item.fecha_vencimiento)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
