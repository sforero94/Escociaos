import { useMemo } from 'react';
import { Thermometer, CloudRain, Wind, Droplets, Sun, Zap } from 'lucide-react';
import { LecturaClima } from '@/types/clima';
import { calcularResumenPeriodo } from '@/utils/calculosClima';
import { WindDirectionArrow } from './WindDirectionArrow';
import { Skeleton } from '@/components/ui/skeleton';

interface ClimaKPICardsProps {
  lecturaActual: LecturaClima | null;
  todasLecturas: LecturaClima[];
  loading: boolean;
}

export function ClimaKPICards({ lecturaActual, todasLecturas, loading }: ClimaKPICardsProps) {
  const resumen24h = useMemo(() => calcularResumenPeriodo(todasLecturas, 1), [todasLecturas]);

  const getUVDescriptor = (uv: number | null) => {
    if (uv === null) return '--';
    if (uv < 3) return 'Bajo';
    if (uv < 6) return 'Moderado';
    if (uv < 8) return 'Alto';
    if (uv < 11) return 'Muy alto';
    return 'Extremo';
  };

  const KPICard = ({
    icon: Icon,
    label,
    value,
    unit,
    secondary,
    color,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string | number | null;
    unit: string;
    secondary?: string;
    color: string;
  }) => (
    <div className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-shadow p-4">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 bg-gradient-to-br ${color} rounded-lg flex items-center justify-center text-white`}>
          {Icon}
        </div>
        {secondary && <span className="text-xs text-gray-500 font-medium">{secondary}</span>}
      </div>

      <h3 className="text-sm text-gray-600 font-medium mb-1">{label}</h3>

      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-gray-900">
            {value !== null ? value : '--'}
          </span>
          <span className="text-sm text-gray-500">{unit}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Temperatura */}
      <KPICard
        icon={<Thermometer className="w-6 h-6" />}
        label="Temperatura"
        value={lecturaActual?.temp_c ?? null}
        unit="°C"
        secondary={
          resumen24h.temp_max_c !== null && resumen24h.temp_min_c !== null
            ? `Max: ${resumen24h.temp_max_c}° / Min: ${resumen24h.temp_min_c}°`
            : undefined
        }
        color="from-orange-400 to-red-500"
      />

      {/* Precipitación */}
      <KPICard
        icon={<CloudRain className="w-6 h-6" />}
        label="Precipitación"
        value={lecturaActual?.lluvia_diaria_mm ?? null}
        unit="mm"
        secondary="Hoy"
        color="from-blue-400 to-cyan-500"
      />

      {/* Viento */}
      <div className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-shadow p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-green-500 rounded-lg flex items-center justify-center text-white">
            <Wind className="w-6 h-6" />
          </div>
        </div>
        <h3 className="text-sm text-gray-600 font-medium mb-2">Viento</h3>
        {loading ? (
          <>
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-6 w-12" />
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-2xl font-bold text-gray-900">
                {lecturaActual?.viento_kmh ?? '--'}
              </span>
              <span className="text-sm text-gray-500">km/h</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Ráfaga: {lecturaActual?.rafaga_kmh ?? '--'} km/h</span>
              <WindDirectionArrow degrees={lecturaActual?.viento_dir ?? null} size={20} />
            </div>
          </>
        )}
      </div>

      {/* Humedad */}
      <KPICard
        icon={<Droplets className="w-6 h-6" />}
        label="Humedad Relativa"
        value={lecturaActual?.humedad_pct ?? null}
        unit="%"
        color="from-blue-400 to-indigo-500"
      />

      {/* Radiación Solar */}
      <KPICard
        icon={<Sun className="w-6 h-6" />}
        label="Radiación Solar"
        value={lecturaActual?.radiacion_wm2 ?? null}
        unit="W/m²"
        color="from-yellow-400 to-amber-500"
      />

      {/* UV Index */}
      <KPICard
        icon={<Zap className="w-6 h-6" />}
        label="Índice UV"
        value={lecturaActual?.uv_index ?? null}
        unit={`(${getUVDescriptor(lecturaActual?.uv_index ?? null)})`}
        color="from-purple-400 to-pink-500"
      />
    </div>
  );
}
