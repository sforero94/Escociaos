import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, Droplets, Wind, CloudRain } from 'lucide-react';
import { getSupabase } from '@/utils/supabase/client';
import { projectId } from '@/utils/supabase/info.tsx';

interface LecturaActual {
  temp_c: number | null;
  humedad_pct: number | null;
  viento_kmh: number | null;
  lluvia_diaria_mm: number | null;
}

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
 * ClimaCard - Condiciones actuales + pronóstico corto, siempre visible
 * (no depende de umbrales de alerta). El pronóstico es una mejora
 * progresiva: si el endpoint aún no está desplegado o falla, la tarjeta
 * simplemente omite esa fila sin romperse.
 */
export function ClimaCard() {
  const navigate = useNavigate();
  const [actual, setActual] = useState<LecturaActual | null>(null);
  const [pronostico, setPronostico] = useState<DiaPronostico[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('clima_lecturas' as any)
        .select('temp_c, humedad_pct, viento_kmh, lluvia_diaria_mm')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelado) {
        setActual((data as unknown as LecturaActual) ?? null);
        setLoading(false);
      }
    })();

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
    return <div className="h-16 bg-gray-100 rounded-2xl animate-pulse" />;
  }

  if (!actual || actual.temp_c === null) {
    return null;
  }

  return (
    <div
      onClick={() => navigate('/clima')}
      className="bg-white rounded-2xl p-4 border border-gray-200 hover:border-primary/40 transition-all cursor-pointer flex items-center gap-4 flex-wrap"
    >
      <div className="flex items-center gap-2">
        <Cloud className="w-8 h-8 text-primary/70" />
        <span className="text-2xl font-semibold text-foreground">{Math.round(actual.temp_c)}°C</span>
      </div>

      <div className="flex items-center gap-3 text-xs text-brand-brown/60">
        {actual.humedad_pct !== null && (
          <span className="flex items-center gap-1">
            <Droplets className="w-3.5 h-3.5" /> {Math.round(actual.humedad_pct)}%
          </span>
        )}
        {actual.viento_kmh !== null && (
          <span className="flex items-center gap-1">
            <Wind className="w-3.5 h-3.5" /> {Math.round(actual.viento_kmh)} km/h
          </span>
        )}
        {actual.lluvia_diaria_mm !== null && actual.lluvia_diaria_mm > 0 && (
          <span className="flex items-center gap-1">
            <CloudRain className="w-3.5 h-3.5" /> {actual.lluvia_diaria_mm.toFixed(1)} mm hoy
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
  );
}
