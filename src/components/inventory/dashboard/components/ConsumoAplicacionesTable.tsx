import { useState, Fragment } from 'react';
import { Beaker, Leaf, Droplets, ChevronDown, ChevronRight } from 'lucide-react';
import { formatCompact, formatNumber } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import type { ConsumoAplicacion } from '../hooks/useInventoryDashboard';

interface ConsumoAplicacionesTableProps {
  data: ConsumoAplicacion[];
  loading?: boolean;
}

const TIPO_ICON: Record<string, typeof Beaker> = {
  'Fumigación': Beaker,
  'Fertilización': Leaf,
  'Drench': Droplets,
};

const ESTADO_COLORS: Record<string, string> = {
  'Calculada': 'bg-blue-50 text-blue-700',
  'En ejecución': 'bg-amber-50 text-amber-700',
  'Cerrada': 'bg-green-50 text-green-700',
};

export function ConsumoAplicacionesTable({ data, loading }: ConsumoAplicacionesTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-6">
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-8 text-center">
        <Beaker className="w-10 h-10 text-brand-brown/30 mx-auto mb-2" />
        <p className="text-sm text-brand-brown/50">Sin aplicaciones en este periodo</p>
      </div>
    );
  }

  const totalCosto = data.reduce((s, d) => s + d.costo_total, 0);

  return (
    <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-primary/10 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Consumo por Aplicaciones</h3>
        <span className="text-xs text-brand-brown/50">Total: ${formatCompact(totalCosto)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-brand-brown/50 w-8" />
              <th className="px-3 py-2 text-left text-xs font-medium text-brand-brown/50">Aplicacion</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-brand-brown/50">Tipo</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-brand-brown/50">Estado</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-brand-brown/50">Fecha</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-brand-brown/50">Productos</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-brand-brown/50">Costo Insumos</th>
            </tr>
          </thead>
          <tbody>
            {data.map((app, i) => {
              const Icon = TIPO_ICON[app.tipo] || Beaker;
              const isExpanded = expanded.has(app.aplicacion_id);

              return (
                <Fragment key={app.aplicacion_id}>
                  <tr
                    className={`border-t border-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-green-50 transition-colors cursor-pointer`}
                    onClick={() => toggleExpand(app.aplicacion_id)}
                  >
                    <td className="px-3 py-2 text-center">
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-brand-brown/50" />
                        : <ChevronRight className="w-4 h-4 text-brand-brown/50" />
                      }
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{app.nombre}</p>
                          <p className="text-xs text-brand-brown/40">{app.codigo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-brand-brown/70">{app.tipo}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[app.estado] || 'bg-gray-50 text-gray-700'}`}>
                        {app.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-brand-brown/60 text-xs">
                      {app.fecha_inicio ? formatearFecha(app.fecha_inicio) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{app.productos_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">${formatCompact(app.costo_total)}</td>
                  </tr>
                  {isExpanded && app.productos.map((prod, pi) => (
                    <tr key={`${app.aplicacion_id}-${pi}`} className="bg-primary/[0.02] border-t border-primary/5">
                      <td />
                      <td className="px-3 py-1.5 pl-12 text-brand-brown/70 text-sm">{prod.nombre}</td>
                      <td className="px-3 py-1.5 text-xs text-brand-brown/50">{prod.categoria}</td>
                      <td />
                      <td />
                      <td className="px-3 py-1.5 text-right tabular-nums text-sm text-brand-brown/60">
                        {formatNumber(prod.cantidad, 2)} {prod.unidad}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-sm">${formatCompact(prod.valor)}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-foreground/20 bg-gray-100 font-bold">
              <td />
              <td colSpan={4} className="px-3 py-2 text-foreground">TOTAL</td>
              <td className="px-3 py-2 text-right tabular-nums">{data.reduce((s, d) => s + d.productos_count, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums">${formatCompact(totalCosto)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
