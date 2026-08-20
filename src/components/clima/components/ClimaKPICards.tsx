import { useMemo } from 'react';
import { Thermometer, CloudRain, Wind, Droplets, Sun, Zap, CloudOff } from 'lucide-react';
import { LecturaClima } from '@/types/clima';
import {
  calcularResumen24h,
  clasificarFrescuraLectura,
  etiquetaEdadLectura,
  minutosDesdeLectura,
} from '@/utils/calculosClima';
import { estimateSunHoursToday, getRadiationStatus } from '@/utils/calculosRadiacion';
import { WindDirectionArrow } from './WindDirectionArrow';
import { Skeleton } from '@/components/ui/skeleton';

interface ClimaKPICardsProps {
  lecturaActual: LecturaClima | null;
  todasLecturas: LecturaClima[];
  loading: boolean;
}

export function ClimaKPICards({ lecturaActual, todasLecturas, loading }: ClimaKPICardsProps) {
  const resumen24h = useMemo(() => calcularResumen24h(todasLecturas), [todasLecturas]);

  const todaySunEstimate = useMemo(() => {
    const todayStr = new Date().toDateString();
    const todayReadings = todasLecturas.filter(r => new Date(r.timestamp).toDateString() === todayStr);
    return estimateSunHoursToday(todayReadings);
  }, [todasLecturas]);

  const sunStatus = todaySunEstimate ? getRadiationStatus(todaySunEstimate.sunHoursSoFar) : null;

  // Misma reja de frescura que la tarjeta del Tablero: `lecturaActual` es un
  // `max by timestamp` sin noción de edad, así que sin esto la última lectura
  // de anoche se pinta bajo el título "Condiciones Actuales" como si fuera de
  // hace 5 minutos. Umbrales: UMBRAL_FRESCURA_LECTURA en calculosClima.ts.
  const minutosLectura = minutosDesdeLectura(lecturaActual);
  const frescura = clasificarFrescuraLectura(lecturaActual);
  const mostrarAvisoFrescura = !loading && frescura !== 'fresca';

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
      <div className="flex items-start justify-between gap-2 mb-3">
        {/* `shrink-0`: sin esto el ícono (ancho fijo w-12) es un flex item
            encogible como cualquier otro, así que si `secondary` alguna vez
            necesita más espacio del que sobra, el ícono se comprime en vez del
            texto — mismo defecto de "nada protegido de encogerse" que ya se
            corrigió en AplicacionesList/VacasPorEstadoCard en esta sesión. */}
        <div className={`w-12 h-12 bg-gradient-to-br ${color} rounded-lg flex items-center justify-center text-white shrink-0`}>
          {Icon}
        </div>
        {secondary && <span className="text-xs text-gray-500 font-medium text-right">{secondary}</span>}
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
    <div className="space-y-3">
      {mostrarAvisoFrescura && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <CloudOff className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {minutosLectura === null
              ? 'La estación no envía lecturas desde hace más de 24 h.'
              : `Última lectura ${etiquetaEdadLectura(minutosLectura)}.`}{' '}
            Los valores de abajo no son las condiciones actuales.
          </span>
        </div>
      )}

      <div
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${
          frescura === 'obsoleta' && !loading ? 'opacity-60' : ''
        }`}
      >
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
          <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-green-500 rounded-lg flex items-center justify-center text-white shrink-0">
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

      {/* Radiación Solar — with sun-hours estimate + status badge */}
      <div className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-shadow p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-lg flex items-center justify-center text-white shrink-0">
            <Sun className="w-6 h-6" />
          </div>
          {sunStatus && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full text-right ${sunStatus.bgColor} ${sunStatus.textColor}`}>
              {sunStatus.label}
            </span>
          )}
        </div>
        <h3 className="text-sm text-gray-600 font-medium mb-1">Radiación Solar</h3>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900">
                {lecturaActual?.radiacion_wm2 ?? '--'}
              </span>
              <span className="text-sm text-gray-500">W/m²</span>
            </div>
            {todaySunEstimate && (
              <p className="text-xs text-gray-500 mt-1">
                Hoy: ~{todaySunEstimate.sunHoursSoFar} horas-sol
              </p>
            )}
          </>
        )}
      </div>

      {/* UV Index */}
      <KPICard
        icon={<Zap className="w-6 h-6" />}
        label="Índice UV"
        value={lecturaActual?.uv_index ?? null}
        unit={`(${getUVDescriptor(lecturaActual?.uv_index ?? null)})`}
        color="from-purple-400 to-pink-500"
      />
      </div>
    </div>
  );
}
