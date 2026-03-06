import { CheckCircle2 } from 'lucide-react';
import { formatNumber } from '@/utils/format';
import type { Gasto } from '@/types/finanzas';

interface GastosStatsBarProps {
  gastos: Gasto[];
}

export function GastosStatsBar({ gastos }: GastosStatsBarProps) {
  const confirmados = gastos.filter((g) => g.estado === 'Confirmado').length;
  const valorTotal = gastos.reduce((sum, g) => sum + (g.valor || 0), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-gray-600">Total Gastos</p>
          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
            <span className="text-red-600 text-sm">$</span>
          </div>
        </div>
        <p className="text-2xl font-bold text-gray-900">{gastos.length}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-gray-600">Confirmados</p>
          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </div>
        </div>
        <p className="text-2xl font-bold text-gray-900">{confirmados}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-gray-600">Valor Total</p>
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <span className="text-blue-600 text-sm">$</span>
          </div>
        </div>
        <p className="text-2xl font-bold text-gray-900">
          ${formatNumber(valorTotal)}
        </p>
      </div>
    </div>
  );
}
