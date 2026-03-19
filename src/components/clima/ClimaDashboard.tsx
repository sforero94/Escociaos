import { AlertTriangle, CloudOff, Loader2 } from 'lucide-react';
import { useClimaData } from '@/hooks/useClimaData';
import { ClimaSubNav } from './ClimaSubNav';
import { ClimaKPICards } from './components/ClimaKPICards';
import { ClimaPeriodosTable } from './components/ClimaPeriodosTable';

export function ClimaDashboard() {
  const { lecturaActual, resumenPeriodos, rawLecturas, estacionConfigurada, loading, error } = useClimaData();

  if (!estacionConfigurada && !loading) {
    return (
      <div>
        <ClimaSubNav />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <CloudOff className="w-16 h-16 text-gray-300 mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Esperando datos de la estación</h2>
          <p className="text-gray-500 max-w-md mb-2">
            La Estación Escocia sincroniza datos automáticamente cada 5 minutos.
          </p>
          <p className="text-gray-400 text-sm">
            Si los datos no aparecen, verifica que los secretos <code className="bg-gray-100 px-1 rounded">ECOWITT_APP_KEY</code>, <code className="bg-gray-100 px-1 rounded">ECOWITT_API_KEY</code> y <code className="bg-gray-100 px-1 rounded">ECOWITT_MAC</code> estén configurados en Supabase Dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ClimaSubNav />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-6">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Condiciones Actuales */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Condiciones Actuales</h2>
          <ClimaKPICards lecturaActual={lecturaActual} todasLecturas={rawLecturas} loading={loading} />
        </section>

        {/* Resumen Acumulado */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumen Acumulado</h2>
          <ClimaPeriodosTable periodos={resumenPeriodos} loading={loading} />
        </section>
      </div>
    </div>
  );
}
