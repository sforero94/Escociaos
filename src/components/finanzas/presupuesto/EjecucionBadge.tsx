import { cn } from '@/components/ui/utils';

interface EjecucionBadgeProps {
  value: number | null;
}

export function EjecucionBadge({ value }: EjecucionBadgeProps) {
  if (value === null || value === undefined) return null;

  const label = `${value}%`;
  const color =
    value <= 80
      ? 'bg-green-100 text-green-700'
      : value <= 100
        ? 'bg-yellow-100 text-yellow-700'
        : 'bg-red-100 text-red-700';

  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', color)}>
      {label}
    </span>
  );
}

export function VariacionBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) return null;

  const label = (value > 0 ? '+' : '') + value + '%';
  const color = value <= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';

  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', color)}>
      {label}
    </span>
  );
}

export function StatusDot({ ejecucion }: { ejecucion: number | null }) {
  const color =
    ejecucion === null
      ? 'bg-gray-300'
      : ejecucion <= 80
        ? 'bg-green-500'
        : ejecucion <= 100
          ? 'bg-yellow-500'
          : 'bg-red-500';

  return <span className={cn('inline-block w-2.5 h-2.5 rounded-full', color)} />;
}
