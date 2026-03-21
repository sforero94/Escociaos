import { useState } from 'react';
import { Download, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useClimaData } from '@/hooks/useClimaData';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ClimaSubNav } from './ClimaSubNav';
import { GraficoTemperatura } from './components/GraficoTemperatura';
import { GraficoPrecipitacion } from './components/GraficoPrecipitacion';
import { GraficoHumedadRadiacion } from './components/GraficoHumedadRadiacion';
import { GraficoViento } from './components/GraficoViento';

type RangoPreset = '24h' | '7d' | '30d' | '90d' | '365d' | '3y' | 'custom';

const DIAS_MS = 24 * 60 * 60 * 1000;

const PRESETS: { key: RangoPreset; label: string; ms: number }[] = [
  { key: '24h', label: '24 horas', ms: 1 * DIAS_MS },
  { key: '7d', label: '7 días', ms: 7 * DIAS_MS },
  { key: '30d', label: '30 días', ms: 30 * DIAS_MS },
  { key: '90d', label: '90 días', ms: 90 * DIAS_MS },
  { key: '365d', label: '1 año', ms: 365 * DIAS_MS },
  { key: '3y', label: '3 años', ms: 3 * 365 * DIAS_MS },
];

export function ClimaHistorico() {
  const { serieHistorica, serieAnual, setRangoHistorico } = useClimaData();
  const [rangoSeleccionado, setRangoSeleccionado] = useState<RangoPreset>('24h');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handlePresetChange = (preset: typeof PRESETS[number]) => {
    setRangoSeleccionado(preset.key);
    const now = new Date();
    const desde = new Date(now.getTime() - preset.ms);
    setRangoHistorico(desde, now);
  };

  const handleCustomApply = () => {
    if (!customDesde || !customHasta) {
      toast.error('Selecciona ambas fechas');
      return;
    }
    const desde = new Date(customDesde + 'T00:00:00');
    const hasta = new Date(customHasta + 'T23:59:59');
    if (desde >= hasta) {
      toast.error('La fecha inicial debe ser anterior a la final');
      return;
    }
    setRangoSeleccionado('custom');
    setRangoHistorico(desde, hasta);
    setPopoverOpen(false);
  };

  const handleExportCSV = () => {
    if (serieHistorica.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const headers = [
      'Fecha',
      'Temp Promedio (°C)',
      'Temp Máx (°C)',
      'Temp Mín (°C)',
      'Lluvia (mm)',
      'Humedad Promedio (%)',
      'Viento Promedio (km/h)',
      'Viento Máx (km/h)',
    ];

    const rows = serieHistorica.map((row) => [
      row.fecha,
      row.temp_c_promedio ?? '',
      row.temp_c_max ?? '',
      row.temp_c_min ?? '',
      row.lluvia_diaria_mm ?? '',
      row.humedad_pct_promedio ?? '',
      row.viento_kmh_promedio ?? '',
      row.rafaga_kmh_max ?? '',
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clima-historico-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div>
      <ClimaSubNav />

      {/* Selector de Rango */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((preset) => (
            <Button
              key={preset.key}
              variant={rangoSeleccionado === preset.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => handlePresetChange(preset)}
            >
              {preset.label}
            </Button>
          ))}

          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                rangoSeleccionado === 'custom'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Personalizado
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="start">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Desde</label>
                  <input
                    type="date"
                    value={customDesde}
                    onChange={(e) => setCustomDesde(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Hasta</label>
                  <input
                    type="date"
                    value={customHasta}
                    onChange={(e) => setCustomHasta(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <Button size="sm" onClick={handleCustomApply}>
                  Aplicar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Gráficos */}
      {serieHistorica.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          Sin datos para el rango seleccionado
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GraficoTemperatura data={serieHistorica} dataAnual={serieAnual} />
          <GraficoPrecipitacion data={serieHistorica} dataAnual={serieAnual} />
          <GraficoHumedadRadiacion data={serieHistorica} dataAnual={serieAnual} />
          <GraficoViento data={serieHistorica} dataAnual={serieAnual} />
        </div>
      )}
    </div>
  );
}
