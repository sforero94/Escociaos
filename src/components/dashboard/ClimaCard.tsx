import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, Droplets, Wind, CloudRain } from 'lucide-react';
import { useClimaData } from '@/hooks/useClimaData';
import { getSupabase } from '@/utils/supabase/client';
import { projectId } from '@/utils/supabase/info.tsx';

interface DiaPronostico {
  date: string;
  temp_min: number;
  temp_max: number;
  rain_probability_pct: number;
}

const EDGE_FUNCTION_BASE = `https://${projectId}.supabase.co/functions/v1`;

function nombreDia(fechaISO: string): string {
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  // fecha viene como YYYY-MM-DD; parsear como fecha local para evitar corrimiento de un día
  const [y, m, d] = fechaISO.split('-').map(Number);
  return dias[new Date(y, m - 1, d).getDay()];
}

/**
 * ClimaCard - Condiciones actuales + resumen de la semana, siempre visible
 * (no depende de umbrales de alerta). El resumen semanal sale de
 * clima_resumen_diario (ya agregado por el cron diario, sin depender del
 * edge function). El pronóstico de 3 días sí depende del edge function
 * clima/forecast; si no está desplegado o falla, la tarjeta simplemente
 * omite esa fila sin romperse.
 */
export function ClimaCard() {
  const navigate = useNavigate();
  const { lecturaActual, resumenPeriodos, loading, estacionConfigurada } = useClimaData();
  const [pronostico, setPronostico] = useState<DiaPronostico[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch(`${EDGE_FUNCTION_BASE}/make-server-1ccce916/clima/forecast?days=3`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelado && Array.isArray(body?.dias)) {
          setPronostico(body.dias);
        }
      } catch {
        // Pronóstico es una mejora progresiva — falla en silencio
      }
    })();
    return () => { cancelado = true; };
  }, []);

  if (loading) {
    return <div className="h-20 bg-gray-100 rounded-2xl animate-pulse" />;
  }

  if (!estacionConfigurada || !lecturaActual || lecturaActual.temp_c === null) {
    return null;
  }

  const resumenSemana = resumenPeriodos.find((p) => p.label === 'Semana')?.resumen ?? null;

  return (
    <div
      onClick={() => navigate('/clima')}
      className="bg-white rounded-2xl p-4 border border-gray-200 hover:border-primary/40 transition-all cursor-pointer space-y-3"
    >
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Cloud className="w-8 h-8 text-primary/70" />
          <span className="text-2xl font-semibold text-foreground">{Math.round(lecturaActual.temp_c)}°C</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-brand-brown/60">
          {lecturaActual.humedad_pct !== null && (
            <span className="flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5" /> {Math.round(lecturaActual.humedad_pct)}%
            </span>
          )}
          {lecturaActual.viento_kmh !== null && (
            <span className="flex items-center gap-1">
              <Wind className="w-3.5 h-3.5" /> {Math.round(lecturaActual.viento_kmh)} km/h
            </span>
          )}
          {lecturaActual.lluvia_diaria_mm !== null && lecturaActual.lluvia_diaria_mm > 0 && (
            <span className="flex items-center gap-1">
              <CloudRain className="w-3.5 h-3.5" /> {lecturaActual.lluvia_diaria_mm.toFixed(1)} mm hoy
            </span>
          )}
        </div>

        {pronostico && pronostico.length > 0 && (
          <div className="flex items-center gap-3 ml-auto pl-3 border-l border-gray-100">
            {pronostico.map((dia) => (
              <div key={dia.date} className="text-center">
                <p className="text-[10px] text-brand-brown/50 uppercase">{nombreDia(dia.date)}</p>
                <p className="text-xs text-foreground font-medium">
                  {Math.round(dia.temp_max)}°/{Math.round(dia.temp_min)}°
                </p>
                {dia.rain_probability_pct >= 40 && (
                  <p className="text-[10px] text-blue-500">{Math.round(dia.rain_probability_pct)}% lluvia</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {resumenSemana && (
        <div className="pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-brand-brown/70">
          <span className="text-[10px] uppercase text-brand-brown/40 tracking-wide">Esta semana</span>
          {resumenSemana.lluvia_total_mm !== null && (
            <span className="flex items-center gap-1">
              <CloudRain className="w-3.5 h-3.5 text-blue-400" /> {formatMm(resumenSemana.lluvia_total_mm)} acumulados
            </span>
          )}
          {resumenSemana.temp_promedio_c !== null && (
            <span>
              Prom. {resumenSemana.temp_promedio_c.toFixed(1)}°C
              {resumenSemana.temp_max_c !== null && resumenSemana.temp_min_c !== null && (
                <span className="text-brand-brown/50"> ({resumenSemana.temp_min_c.toFixed(0)}°–{resumenSemana.temp_max_c.toFixed(0)}°)</span>
              )}
            </span>
          )}
          {resumenSemana.rafaga_max_kmh !== null && (
            <span className="flex items-center gap-1">
              <Wind className="w-3.5 h-3.5" /> ráfaga máx. {Math.round(resumenSemana.rafaga_max_kmh)} km/h
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatMm(mm: number): string {
  return `${mm.toFixed(mm < 10 ? 1 : 0)} mm`;
}
