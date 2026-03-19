import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useClimaData } from '@/hooks/useClimaData';
import { Button } from '@/components/ui/button';
import { ClimaSubNav } from './ClimaSubNav';
import { GraficoTemperatura } from './components/GraficoTemperatura';
import { GraficoPrecipitacion } from './components/GraficoPrecipitacion';
import { GraficoHumedadRadiacion } from './components/GraficoHumedadRadiacion';
import { GraficoViento } from './components/GraficoViento';

export function ClimaHistorico() {
  const { serieHistorica, setRangoHistorico } = useClimaData();
  const [rangoSeleccionado, setRangoSeleccionado] = useState<'24h' | '7d' | '30d' | '90d' | '365d'>('24h');

  const getRangoFechas = (rango: string) => {
    const now = new Date();
    let desde = new Date();

    switch (rango) {
      case '24h':
        desde = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        desde = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        desde = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        desde = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '365d':
        desde = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
    }

    return { desde, hasta: now };
  };

  const handleRangoChange = (rango: '24h' | '7d' | '30d' | '90d' | '365d') => {
    setRangoSeleccionado(rango);
    const { desde, hasta } = getRangoFechas(rango);
    setRangoHistorico(desde, hasta);
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
        <div className="flex gap-2">
          {(['24h', '7d', '30d', '90d', '365d'] as const).map((rango) => {
            const labels = {
              '24h': '24 horas',
              '7d': '7 días',
              '30d': '30 días',
              '90d': '90 días',
              '365d': 'Último año',
            };

            return (
              <Button
                key={rango}
                variant={rangoSeleccionado === rango ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleRangoChange(rango)}
              >
                {labels[rango]}
              </Button>
            );
          })}
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
          <GraficoTemperatura data={serieHistorica} />
          <GraficoPrecipitacion data={serieHistorica} />
          <GraficoHumedadRadiacion data={serieHistorica} />
          <GraficoViento data={serieHistorica} />
        </div>
      )}
    </div>
  );
}
