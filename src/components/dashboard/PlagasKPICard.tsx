import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatearFechaCorta } from '@/utils/fechas';

export interface PlagaKPI {
  nombre: string;
  incidencia: number;
  deltaPp: number | null;
}

interface PlagasKPICardProps {
  plagas: PlagaKPI[];
  /** Fecha del monitoreo más reciente incluido en el cálculo (yyyy-mm-dd) */
  fecha: string | null;
  onClick?: () => void;
}

/**
 * PlagasKPICard - tarjeta KPI del dashboard principal con el top 3 de
 * plagas por incidencia global del último monitoreo, cada una con su
 * variación en puntos porcentuales (pp) frente al monitoreo anterior.
 *
 * A diferencia de DashboardKPICard, aquí la semántica de color está
 * invertida: subir incidencia es malo (rojo), bajar es bueno (verde).
 */
export function PlagasKPICard({ plagas, fecha, onClick }: PlagasKPICardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-primary/10 bg-white p-4 shadow-sm ${onClick ? 'cursor-pointer' : ''}`}
    >
      <p className="text-xs font-medium text-brand-brown/60 uppercase tracking-wide mb-1">Plagas</p>

      {plagas.length === 0 ? (
        <p className="text-sm text-brand-brown/60">Sin monitoreos recientes</p>
      ) : (
        <div className="space-y-1.5">
          {plagas.map((p) => {
            const esNeutra = p.deltaPp === null || p.deltaPp === 0;
            // Semántica invertida vs. tarjetas monetarias: sube = malo (rojo), baja = bueno (verde)
            const color = esNeutra ? 'text-brand-brown/50' : p.deltaPp! > 0 ? 'text-red-600' : 'text-green-600';
            const Icon = esNeutra ? Minus : p.deltaPp! > 0 ? TrendingUp : TrendingDown;

            return (
              <div key={p.nombre} className="flex items-center justify-between gap-2">
                <span className="text-xs text-foreground truncate flex-1" title={p.nombre}>
                  {p.nombre}
                </span>
                <span className="text-sm font-bold text-foreground shrink-0">{p.incidencia.toFixed(1)}%</span>
                <div className={`flex items-center gap-0.5 shrink-0 ${color}`}>
                  <Icon className="w-3 h-3" />
                  {p.deltaPp !== null && (
                    <span className="text-[11px] font-medium">
                      {p.deltaPp > 0 ? '+' : ''}{p.deltaPp.toFixed(1)}pp
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {fecha && (
        <p className="text-xs text-brand-brown/60 mt-2 truncate">
          {/* fecha_monitoreo llega como timestamp ISO completo; formatearFechaCorta espera YYYY-MM-DD */}
          Último monitoreo: {formatearFechaCorta(fecha.slice(0, 10))}
        </p>
      )}
    </div>
  );
}
