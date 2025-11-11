import { LucideIcon } from 'lucide-react';
import { Button } from './button';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  alert?: {
    count: number;
    type: 'warning' | 'error' | 'success';
  };
  actionLabel?: string;
  onAction?: () => void;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  alert,
  actionLabel,
  onAction,
}: MetricCardProps) {
  const getAlertColor = () => {
    if (!alert) return '';
    switch (alert.type) {
      case 'warning':
        return 'bg-[#FFC107]/10 text-[#FFC107] border-[#FFC107]/20';
      case 'error':
        return 'bg-[#DC3545]/10 text-[#DC3545] border-[#DC3545]/20';
      case 'success':
        return 'bg-[#73991C]/10 text-[#73991C] border-[#73991C]/20';
    }
  };

  const getAlertIcon = () => {
    if (!alert) return '';
    switch (alert.type) {
      case 'warning':
        return '⚠️';
      case 'error':
        return '🔴';
      case 'success':
        return '✅';
    }
  };

  return (
    <div className="group bg-white rounded-2xl p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_8px_32px_rgba(115,153,28,0.16)] transition-all duration-300 hover:-translate-y-1 border border-[#73991C]/5 relative overflow-hidden">
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#73991C]/0 to-[#BFD97D]/0 group-hover:from-[#73991C]/[0.02] group-hover:to-[#BFD97D]/[0.02] transition-all duration-300 rounded-2xl"></div>
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <p className="text-sm text-[#4D240F]/60 mb-2 tracking-wide uppercase">{title}</p>
            <p className="text-3xl text-[#172E08] mb-2">{value}</p>
            {subtitle && <p className="text-sm text-[#4D240F]/70">{subtitle}</p>}
          </div>
          <div className="w-14 h-14 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Icon className="w-7 h-7 text-[#73991C]" />
          </div>
        </div>

        {alert && (
          <div className={`px-3 py-2 rounded-xl border text-sm mb-4 ${getAlertColor()}`}>
            <span className="mr-2">{getAlertIcon()}</span>
            {alert.count} {alert.type === 'error' ? 'críticas' : 'pendientes'}
          </div>
        )}

        {actionLabel && onAction && (
          <Button
            onClick={onAction}
            variant="outline"
            className="w-full mt-2 border-[#73991C]/20 text-[#73991C] hover:bg-[#73991C]/5 hover:border-[#73991C]/30 rounded-xl transition-all duration-200"
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}