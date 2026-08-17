import { Link } from 'react-router-dom';
import { AlertTriangle, Settings } from 'lucide-react';
import { formatNumber } from '@/utils/format';

interface AvisoDatosGanadoProps {
  potrerosSinEtapa: { potreros: number; cabezas: number };
  fueraDeFincaActiva: { cabezas: number; fincas: { finca: string; cabezas: number }[] };
}

/**
 * Avisos accionables de calidad de dato — nunca se esconden en silencio.
 * "Sin clasificar" (A-2) y "fuera de finca activa" (§7.1 del plan técnico)
 * son hechos que hay que poder ver y resolver, no un cero disimulado.
 */
export function AvisoDatosGanado({ potrerosSinEtapa, fueraDeFincaActiva }: AvisoDatosGanadoProps) {
  if (potrerosSinEtapa.potreros === 0 && fueraDeFincaActiva.cabezas === 0) return null;

  return (
    <div className="space-y-2">
      {potrerosSinEtapa.potreros > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm text-amber-800 flex-1 min-w-[220px]">
            <strong>{formatNumber(potrerosSinEtapa.potreros)}</strong>{' '}
            {potrerosSinEtapa.potreros === 1 ? 'potrero sin etapa asignada' : 'potreros sin etapa asignada'} ·{' '}
            <strong>{formatNumber(potrerosSinEtapa.cabezas)}</strong> cabezas en &quot;Sin clasificar&quot;
          </p>
          <Link
            to="/configuracion"
            className="inline-flex items-center gap-1 text-sm font-medium text-amber-800 hover:underline whitespace-nowrap"
          >
            <Settings className="w-3.5 h-3.5" />
            Asignar en Configuración → Ganado
          </Link>
        </div>
      )}

      {fueraDeFincaActiva.cabezas > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm text-amber-800 flex-1 min-w-[220px]">
            <strong>{formatNumber(fueraDeFincaActiva.cabezas)}</strong> cabezas en fincas inactivas — no cuentan en el
            total
            {fueraDeFincaActiva.fincas.length > 0 && (
              <span className="text-amber-700/80">
                {' '}
                ({fueraDeFincaActiva.fincas.map((f) => `${f.finca} ${formatNumber(f.cabezas)}`).join(' · ')})
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
