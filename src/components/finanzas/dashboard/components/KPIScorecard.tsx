import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrency, formatNumber, formatCompact } from '@/utils/format';

interface KPIScorecardProps {
  label: string;
  valor: number;
  variacion?: number;
  formato?: 'currency' | 'number' | 'compact';
  size?: 'sm' | 'md';
}

export function KPIScorecard({ label, valor, variacion, formato = 'compact', size = 'md' }: KPIScorecardProps) {
  const formatValue = (v: number) => {
    switch (formato) {
      case 'currency': return formatCurrency(v);
      case 'compact': return `$${formatCompact(v)}`;
      case 'number': return formatNumber(v);
      default: return formatCurrency(v);
    }
  };

  const variacionColor = variacion === undefined || variacion === 0
    ? 'text-brand-brown/50'
    : variacion > 0
      ? 'text-green-600'
      : 'text-red-600';

  const VariacionIcon = variacion === undefined || variacion === 0
    ? Minus
    : variacion > 0
      ? TrendingUp
      : TrendingDown;

  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-brand-brown/60 uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-bold text-foreground ${size === 'md' ? 'text-2xl' : 'text-lg'}`}>
        {formatValue(valor)}
      </p>
      {variacion !== undefined && (
        <div className={`flex items-center gap-1 mt-1 ${variacionColor}`}>
          <VariacionIcon className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">
            {variacion > 0 ? '+' : ''}{variacion.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
