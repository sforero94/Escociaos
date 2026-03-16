import { Package } from 'lucide-react';
import { formatearMoneda, formatearNumero } from '../../../utils/calculosReporteAplicacion';

interface ComparisonField {
  real: number;
  planeado: number;
  desviacion: number;
}

interface ProductoDetalle {
  producto_id: string;
  producto_nombre: string;
  unidad: string;
  cantidad: ComparisonField;
  costo: ComparisonField;
}

interface ProductComparisonTableProps {
  productos: ProductoDetalle[];
}

function deviationColor(desviacion: number): string {
  const abs = Math.abs(desviacion);
  if (abs <= 5) return 'text-green-600';
  if (abs <= 20) return 'text-amber-600';
  return 'text-red-600';
}

export function ProductComparisonTable({ productos }: ProductComparisonTableProps) {
  if (productos.length === 0) return null;

  const highDeviationCount = productos.filter((p) => Math.abs(p.cantidad.desviacion) > 20).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          Comparacion de Productos
        </h3>
        {highDeviationCount > 0 && (
          <span className="text-sm text-brand-brown/60">
            {highDeviationCount} producto(s) con alta desviacion
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-2.5 px-4 text-xs text-gray-500 font-medium sticky left-0 bg-gray-50 z-10">Producto</th>
              <th className="text-left py-2.5 px-3 text-xs text-gray-500 font-medium">Unidad</th>
              <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">Plan</th>
              <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">Real</th>
              <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">Diferencia</th>
              <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">Desv%</th>
              <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">Costo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {productos.map((prod) => {
              const highDev = Math.abs(prod.cantidad.desviacion) > 20;
              const diferencia = prod.cantidad.real - prod.cantidad.planeado;
              return (
                <tr key={prod.producto_id} className={`hover:bg-gray-50 transition-colors ${highDev ? 'bg-red-50/40' : ''}`}>
                  <td className="py-2.5 px-4 text-sm text-foreground font-medium sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                      {prod.producto_nombre}
                      {highDev && (
                        <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">Alta desv.</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-sm text-gray-500">{prod.unidad}</td>
                  <td className="py-2.5 px-3 text-right text-sm text-foreground">
                    {formatearNumero(prod.cantidad.planeado, 1)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-sm text-primary font-medium">
                    {formatearNumero(prod.cantidad.real, 1)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg ${
                      diferencia > 0.1 ? 'bg-red-50 text-red-700' :
                      diferencia < -0.1 ? 'bg-amber-50 text-amber-700' :
                      'bg-gray-50 text-gray-700'
                    }`}>
                      {diferencia > 0 ? '+' : ''}{formatearNumero(diferencia, 1)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-sm">
                    <span className={`font-medium ${deviationColor(prod.cantidad.desviacion)}`}>
                      {prod.cantidad.desviacion > 0 ? '+' : ''}{prod.cantidad.desviacion.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-sm text-foreground">
                    {formatearMoneda(prod.costo.real)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td className="py-2.5 px-4 text-sm font-semibold text-foreground sticky left-0 bg-gray-50 z-10" colSpan={2}>Total</td>
              <td className="py-2.5 px-3 text-right text-sm font-semibold text-foreground">
                {formatearNumero(productos.reduce((s, p) => s + p.cantidad.planeado, 0), 1)}
              </td>
              <td className="py-2.5 px-3 text-right text-sm font-semibold text-primary">
                {formatearNumero(productos.reduce((s, p) => s + p.cantidad.real, 0), 1)}
              </td>
              <td className="py-2.5 px-3" colSpan={2}></td>
              <td className="py-2.5 px-3 text-right text-sm font-semibold text-foreground">
                {formatearMoneda(productos.reduce((s, p) => s + p.costo.real, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
