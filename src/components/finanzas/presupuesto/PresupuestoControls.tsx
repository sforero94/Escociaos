import { cn } from '@/components/ui/utils';

interface PresupuestoControlsProps {
  anio: number;
  quarters: number[];
  onAnioChange: (anio: number) => void;
  onToggleQuarter: (q: number) => void;
  showPct: boolean;
  onTogglePct: () => void;
}

export function PresupuestoControls({
  anio,
  quarters,
  onAnioChange,
  onToggleQuarter,
  showPct,
  onTogglePct,
}: PresupuestoControlsProps) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="flex items-center gap-6 bg-white rounded-lg border border-gray-200 px-4 py-3">
      {/* Year selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 font-medium">Año</span>
        <select
          value={anio}
          onChange={(e) => onAnioChange(Number(e.target.value))}
          className="text-sm font-medium border border-gray-200 rounded-md px-3 py-1.5 bg-white"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Quarter pills (multi-select) */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 font-medium">Trimestre</span>
        <div className="flex gap-3">
          {[1, 2, 3, 4].map((q) => (
            <button
              key={q}
              onClick={() => onToggleQuarter(q)}
              className={cn(
                'px-5 py-1.5 rounded-md text-sm font-semibold transition-colors',
                quarters.includes(q)
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
              )}
            >
              Q{q}
            </button>
          ))}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Toggle % columns */}
      <button
        onClick={onTogglePct}
        className={cn(
          'text-xs font-medium px-3 py-1.5 rounded-md transition-colors',
          showPct ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
        )}
      >
        {showPct ? '− Ocultar %' : '+ Mostrar %'}
      </button>

      {/* Negocio badge */}
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-50 text-primary text-xs font-semibold">
        Aguacate Hass
      </span>
    </div>
  );
}
