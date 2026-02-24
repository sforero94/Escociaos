import { formatNumber } from '../../../utils/format';
import { TrendingUp, TrendingDown, DollarSign, CreditCard, PiggyBank, Percent } from 'lucide-react';

interface KPICardProps {
  titulo: string;
  valor: number;
  icono: typeof DollarSign;
  color: string;
  tendencia?: number;
  formato?: 'moneda' | 'porcentaje' | 'numero';
}

/**
 * Componente reutilizable para tarjetas de métricas KPI
 */
function KPICard({ titulo, valor, icono: Icono, color, tendencia, formato = 'moneda' }: KPICardProps) {
  // Formatear valor según tipo
  const formatearValor = (valor: number, formato: string) => {
    switch (formato) {
      case 'moneda':
        return `$${formatNumber(valor)}`;
      case 'porcentaje':
        return `${valor}%`;
      case 'numero':
        return formatNumber(valor);
      default:
        return valor.toString();
    }
  };

  // Determinar color de tendencia
  const getColorTendencia = (tendencia?: number) => {
    if (!tendencia) return 'text-gray-500';
    return tendencia >= 0 ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-gray-300 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center`}>
          <Icono className="w-6 h-6 text-white" />
        </div>
        {tendencia !== undefined && tendencia !== 0 && (
          <div className={`flex items-center gap-1 text-sm ${getColorTendencia(tendencia)}`}>
            {tendencia >= 0
              ? <TrendingUp className="w-4 h-4" />
              : <TrendingDown className="w-4 h-4" />
            }
            <span>{Math.abs(tendencia)}%</span>
          </div>
        )}
      </div>

      {/* Valor principal */}
      <div className="mb-2">
        <h3 className="text-2xl font-bold text-gray-900">
          {formatearValor(valor, formato)}
        </h3>
      </div>

      {/* Título */}
      <p className="text-sm text-gray-600 font-medium">
        {titulo}
      </p>
    </div>
  );
}

/**
 * Conjunto de tarjetas KPI para el dashboard financiero
 */
interface KPICardsProps {
  kpis: {
    ingresos_total: number;
    gastos_total: number;
    flujo_neto: number;
    margen_porcentaje: number;
  };
  loading?: boolean;
}

export function KPICards({ kpis, loading = false }: KPICardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 border border-gray-200 animate-pulse">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
              <div className="w-16 h-4 bg-gray-200 rounded"></div>
            </div>
            <div className="mb-2">
              <div className="w-24 h-8 bg-gray-200 rounded mb-2"></div>
            </div>
            <div className="w-20 h-4 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      titulo: 'Ingresos del Período',
      valor: kpis.ingresos_total,
      icono: DollarSign,
      color: 'from-green-500 to-green-600',
      formato: 'moneda' as const
    },
    {
      titulo: 'Gastos del Período',
      valor: kpis.gastos_total,
      icono: CreditCard,
      color: 'from-red-500 to-red-600',
      formato: 'moneda' as const
    },
    {
      titulo: 'Flujo Neto',
      valor: kpis.flujo_neto,
      icono: PiggyBank,
      color: kpis.flujo_neto >= 0 ? 'from-blue-500 to-blue-600' : 'from-red-500 to-red-600',
      formato: 'moneda' as const
    },
    {
      titulo: 'Margen %',
      valor: kpis.margen_porcentaje,
      icono: Percent,
      color: kpis.margen_porcentaje >= 0 ? 'from-green-500 to-green-600' : 'from-red-500 to-red-600',
      formato: 'porcentaje' as const
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <KPICard
          key={index}
          titulo={card.titulo}
          valor={card.valor}
          icono={card.icono}
          color={card.color}
          formato={card.formato}
        />
      ))}
    </div>
  );
}