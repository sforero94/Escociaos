import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Sparkline } from './Sparkline';

interface DashboardKPICardProps {
  label: string;
  valor: string;
  /** Variación % vs. período anterior — renderiza flecha + color estándar (verde=sube, rojo=baja) */
  variacion?: number;
  /** Texto de variación ya formateado (ej. "+2"), para métricas que no son porcentuales */
  variacionTexto?: string;
  variacionPositiva?: boolean;
  /** Línea secundaria de contexto (ej. "Mayor: Fertilizantes ($8.2M)") */
  contexto?: string;
  /** Serie para la mini gráfica de tendencia (ej. últimas 6 semanas) */
  sparkline?: number[];
  onClick?: () => void;
}

/**
 * DashboardKPICard - tarjeta KPI del dashboard principal: un número grande
 * más una señal de tendencia (flecha o mini gráfica) y una línea de
 * contexto opcional. Más rica que un KPIScorecard genérico porque el
 * dashboard necesita dar contexto, no solo un número.
 */
export function DashboardKPICard({
  label,
  valor,
  variacion,
  variacionTexto,
  variacionPositiva,
  contexto,
  sparkline,
  onClick,
}: DashboardKPICardProps) {
  const tieneVariacionTexto = variacionTexto !== undefined;
  const esPositiva = tieneVariacionTexto ? variacionPositiva : variacion !== undefined && variacion > 0;
  const esNeutra = tieneVariacionTexto
    ? variacionPositiva === undefined
    : variacion === undefined || variacion === 0;

  const color = esNeutra ? 'text-brand-brown/50' : esPositiva ? 'text-green-600' : 'text-red-600';
  const Icon = esNeutra ? Minus : esPositiva ? TrendingUp : TrendingDown;

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-primary/10 bg-white p-4 shadow-sm ${onClick ? 'cursor-pointer' : ''}`}
    >
      <p className="text-xs font-medium text-brand-brown/60 uppercase tracking-wide mb-1">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-lg font-bold text-foreground">{valor}</p>
        {sparkline && sparkline.length >= 2 && <Sparkline data={sparkline} />}
      </div>
      {(variacion !== undefined || tieneVariacionTexto) && (
        <div className={`flex items-center gap-1 mt-1 ${color}`}>
          <Icon className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">
            {tieneVariacionTexto ? variacionTexto : `${variacion! > 0 ? '+' : ''}${variacion!.toFixed(1)}%`}
          </span>
        </div>
      )}
      {contexto && <p className="text-xs text-brand-brown/60 mt-1 truncate">{contexto}</p>}
    </div>
  );
}
