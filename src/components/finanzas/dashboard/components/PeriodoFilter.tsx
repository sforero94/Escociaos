import { useState } from 'react';
import type { DashboardPeriodo } from '@/types/finanzas';

interface PeriodoFilterProps {
  value: DashboardPeriodo;
  onChange: (periodo: DashboardPeriodo, fechas?: { desde: string; hasta: string }) => void;
}

const OPCIONES: { value: DashboardPeriodo; label: string }[] = [
  { value: 'mes_actual', label: 'Mes actual' },
  { value: 'trimestre', label: 'Trimestre actual' },
  { value: 'ytd', label: 'Ano a la fecha' },
  { value: 'ano_anterior', label: 'Ano anterior' },
  { value: 'rango_personalizado', label: 'Rango personalizado' },
];

export function PeriodoFilter({ value, onChange }: PeriodoFilterProps) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const handlePeriodoChange = (periodo: DashboardPeriodo) => {
    if (periodo === 'rango_personalizado') {
      onChange(periodo, desde && hasta ? { desde, hasta } : undefined);
    } else {
      onChange(periodo);
    }
  };

  const handleApplyRange = () => {
    if (desde && hasta) {
      onChange('rango_personalizado', { desde, hasta });
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="text-sm font-medium text-brand-brown/70">Periodo:</label>
      <select
        value={value}
        onChange={(e) => handlePeriodoChange(e.target.value as DashboardPeriodo)}
        className="rounded-lg border border-primary/20 bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {OPCIONES.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {value === 'rango_personalizado' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-primary/20 bg-white px-3 py-2 text-sm"
          />
          <span className="text-sm text-brand-brown/50">a</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-primary/20 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={handleApplyRange}
            className="rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
