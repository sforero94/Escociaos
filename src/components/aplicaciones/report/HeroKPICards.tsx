import {
  DollarSign, Package, TreePine, Users, TrendingUp, TrendingDown,
} from 'lucide-react';
import { formatearMoneda, formatearNumero } from '../../../utils/calculosReporteAplicacion';

interface ComparisonField {
  real: number;
  planeado: number;
  desviacion: number;
}

interface FinancieroField {
  real: number;
  planeado: number;
  desviacion: number;
  cambio: number;
}

interface AnteriorData {
  nombre: string;
  costo_total: number;
  costo_por_arbol: number;
  total_arboles: number;
  canecas: number;
  jornales: number;
  arboles_por_jornal: number;
}

interface HeroKPICardsProps {
  financiero: {
    costo_total: FinancieroField;
    costo_por_arbol: FinancieroField;
  };
  canecasTotales: ComparisonField;
  totalArboles: number;
  totalJornales: number;
  containerLabel: string;
  anterior?: AnteriorData;
}

function deviationColor(desviacion: number, invertCost = false): string {
  const abs = Math.abs(desviacion);
  const isOver = invertCost ? desviacion > 0 : desviacion > 0;
  if (abs <= 5) return 'text-green-600 bg-green-50';
  if (abs <= 20) return 'text-amber-600 bg-amber-50';
  return isOver ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50';
}

function DeviationBadge({ desviacion, invertCost = false }: { desviacion: number; invertCost?: boolean }) {
  if (desviacion === 0 && invertCost) return null;
  const abs = Math.abs(desviacion);
  const color = deviationColor(desviacion, invertCost);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {desviacion > 0 ? '+' : ''}{abs.toFixed(1)}%
    </span>
  );
}

function DeltaBadge({ current, previous, inverted = false }: { current: number; previous: number; inverted?: boolean }) {
  if (previous === 0) return null;
  const delta = ((current - previous) / previous) * 100;
  const isPositive = delta > 0;
  const isGood = inverted ? !isPositive : isPositive;

  return (
    <div className={`flex items-center gap-1 text-xs font-medium ${isGood ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      <span>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
    </div>
  );
}

export function HeroKPICards({ financiero, canecasTotales, totalArboles, totalJornales, containerLabel, anterior }: HeroKPICardsProps) {
  const arbolesPorJornal = totalJornales > 0 ? totalArboles / totalJornales : 0;

  const cards = [
    {
      titulo: 'Costo Total',
      valor: formatearMoneda(financiero.costo_total.real),
      plan: financiero.costo_total.planeado > 0 ? `Plan: ${formatearMoneda(financiero.costo_total.planeado)}` : null,
      desviacion: financiero.costo_total.desviacion,
      invertCost: true,
      icon: DollarSign,
      iconBg: 'bg-gradient-to-br from-primary to-primary-dark',
      anteriorValue: anterior?.costo_total,
      anteriorLabel: anterior ? formatearMoneda(anterior.costo_total) : undefined,
      currentValue: financiero.costo_total.real,
      deltaInverted: true,
    },
    {
      titulo: 'Costo/Arbol',
      valor: formatearMoneda(financiero.costo_por_arbol.real),
      plan: financiero.costo_por_arbol.planeado > 0 ? `Plan: ${formatearMoneda(financiero.costo_por_arbol.planeado)}` : null,
      desviacion: financiero.costo_por_arbol.desviacion,
      invertCost: true,
      icon: TreePine,
      iconBg: 'bg-gradient-to-br from-orange-500 to-orange-600',
      anteriorValue: anterior?.costo_por_arbol,
      anteriorLabel: anterior ? formatearMoneda(anterior.costo_por_arbol) : undefined,
      currentValue: financiero.costo_por_arbol.real,
      deltaInverted: true,
    },
    {
      titulo: containerLabel,
      valor: formatearNumero(canecasTotales.real, 1),
      plan: canecasTotales.planeado > 0 ? `Plan: ${formatearNumero(canecasTotales.planeado, 1)}` : null,
      desviacion: canecasTotales.desviacion,
      invertCost: false,
      icon: Package,
      iconBg: 'bg-gradient-to-br from-blue-500 to-blue-600',
      anteriorValue: anterior?.canecas,
      anteriorLabel: anterior ? formatearNumero(anterior.canecas, 1) : undefined,
      currentValue: canecasTotales.real,
      deltaInverted: false,
    },
    {
      titulo: 'Arboles/Jornal',
      valor: formatearNumero(arbolesPorJornal, 0),
      plan: null,
      desviacion: 0,
      invertCost: false,
      icon: Users,
      iconBg: 'bg-gradient-to-br from-teal-500 to-teal-600',
      anteriorValue: anterior?.arboles_por_jornal,
      anteriorLabel: anterior ? formatearNumero(anterior.arboles_por_jornal, 0) : undefined,
      currentValue: arbolesPorJornal,
      deltaInverted: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.titulo} className="bg-white rounded-2xl p-5 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 ${card.iconBg} rounded-xl flex items-center justify-center`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex items-center gap-2">
                {anterior && card.anteriorValue != null && card.anteriorValue > 0 && (
                  <DeltaBadge current={card.currentValue} previous={card.anteriorValue} inverted={card.deltaInverted} />
                )}
                {card.desviacion !== 0 && (
                  <DeviationBadge desviacion={card.desviacion} invertCost={card.invertCost} />
                )}
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900">{card.valor}</h3>
            <p className="text-sm text-gray-600 font-medium mt-0.5">{card.titulo}</p>
            {card.plan && (
              <p className="text-xs text-gray-400 mt-1">{card.plan}</p>
            )}
            {anterior && card.anteriorLabel && (
              <p className="text-xs text-gray-400 mt-0.5">Anterior: {card.anteriorLabel}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
