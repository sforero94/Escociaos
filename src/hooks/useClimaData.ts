import { useState, useEffect, useMemo, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { LecturaClima, ResumenDiario, PeriodoResumen, LecturaClimaAgregada, SerieAnual } from '@/types/clima';
import {
  lecturaActual as getLecturaActual,
  calcularResumen24h,
  calcularResumenPeriodoDiario,
  calcularResumenAnioALaFechaDiario,
  resumenDiarioToAgregada,
  resumenDiarioToMensual,
  lecturas24hToHorario,
  resumenDiarioToAnual,
} from '@/utils/calculosClima';

// Exported for testing
export const PERIODOS = [
  { label: 'Día', dias: 1, type: 'trailing' as const },
  { label: 'Semana', dias: 7, type: 'trailing' as const },
  { label: 'Mes', dias: 30, type: 'trailing' as const },
  { label: 'Trimestre', dias: 90, type: 'trailing' as const },
  { label: 'Año a la fecha', dias: 0, type: 'ytd' as const },
  { label: 'Último año', dias: 365, type: 'trailing' as const },
] as const;

type RangoPreset = '24h' | '7d' | '30d' | '90d' | '365d' | '3y';

interface UseClimaDataReturn {
  lecturaActual: LecturaClima | null;
  resumenPeriodos: PeriodoResumen[];
  serieHistorica: LecturaClimaAgregada[];
  serieAnual: SerieAnual | null;
  rawLecturas: LecturaClima[];
  estacionConfigurada: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setRangoHistorico: (desde: Date, hasta: Date) => void;
  ultimaActualizacion: Date | null;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function useClimaData(): UseClimaDataReturn {
  // Live 5-min readings (rolling 24h window — small, ~288 rows)
  const [liveLecturas, setLiveLecturas] = useState<LecturaClima[]>([]);
  // Pre-aggregated daily summaries (one row/day — small even for years)
  const [resumenesDiarios, setResumenesDiarios] = useState<ResumenDiario[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const [rangoHistorico, setRangoHistoricoState] = useState<{ desde: Date; hasta: Date }>({
    desde: new Date(Date.now() - 24 * 60 * 60 * 1000),
    hasta: new Date(),
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const supabase = getSupabase();

      // Fetch both tables in parallel
      const [liveRes, dailyRes] = await Promise.all([
        // Live readings: all rows in clima_lecturas (rolling 24h window after migration)
        (supabase
          .from('clima_lecturas' as any)
          .select('*')
          .order('timestamp', { ascending: true }) as any),
        // Daily summaries: all rows (one per day, stays small forever)
        (supabase
          .from('clima_resumen_diario' as any)
          .select('*')
          .order('fecha', { ascending: true }) as any),
      ]);

      if (liveRes.error) {
        setError(liveRes.error.message);
        return;
      }
      if (dailyRes.error) {
        setError(dailyRes.error.message);
        return;
      }

      setLiveLecturas((liveRes.data as LecturaClima[]) ?? []);
      setResumenesDiarios((dailyRes.data as ResumenDiario[]) ?? []);
      setUltimaActualizacion(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Live current reading
  const actual = useMemo(() => getLecturaActual(liveLecturas), [liveLecturas]);

  // Period summaries: "Día" uses live 5-min readings, rest use daily summaries
  const resumenPeriodos = useMemo((): PeriodoResumen[] => {
    return PERIODOS.map(p => ({
      label: p.label,
      dias: p.type === 'ytd' ? 0 : p.dias,
      resumen: p.dias === 1
        ? calcularResumen24h(liveLecturas)
        : p.type === 'ytd'
          ? calcularResumenAnioALaFechaDiario(resumenesDiarios)
          : calcularResumenPeriodoDiario(resumenesDiarios, p.dias),
    }));
  }, [liveLecturas, resumenesDiarios]);

  // Historical chart series
  const serieHistorica = useMemo((): LecturaClimaAgregada[] => {
    const desdeStr = toDateStr(rangoHistorico.desde);
    const hastaStr = toDateStr(rangoHistorico.hasta);
    const rangoMs = rangoHistorico.hasta.getTime() - rangoHistorico.desde.getTime();
    const rangoDias = rangoMs / (24 * 60 * 60 * 1000);

    if (rangoDias <= 1) {
      // 24h view: hourly granularity from live 5-min readings
      return lecturas24hToHorario(liveLecturas);
    } else if (rangoDias < 365) {
      // 7d–365d: daily granularity from daily summaries
      return resumenDiarioToAgregada(resumenesDiarios, desdeStr, hastaStr);
    } else {
      // >365d: monthly granularity from daily summaries
      return resumenDiarioToMensual(resumenesDiarios, desdeStr, hastaStr);
    }
  }, [liveLecturas, resumenesDiarios, rangoHistorico]);

  // Year-overlay series (only for ranges > 365d)
  const serieAnual = useMemo((): SerieAnual | null => {
    const rangoMs = rangoHistorico.hasta.getTime() - rangoHistorico.desde.getTime();
    const rangoDias = rangoMs / (24 * 60 * 60 * 1000);
    if (rangoDias <= 365) return null;
    return resumenDiarioToAnual(resumenesDiarios, toDateStr(rangoHistorico.desde), toDateStr(rangoHistorico.hasta));
  }, [resumenesDiarios, rangoHistorico]);

  const setRangoHistorico = useCallback((desde: Date, hasta: Date) => {
    setRangoHistoricoState({ desde, hasta });
  }, []);

  return {
    lecturaActual: actual,
    resumenPeriodos,
    serieHistorica,
    serieAnual,
    rawLecturas: liveLecturas,
    estacionConfigurada: liveLecturas.length > 0 || resumenesDiarios.length > 0,
    loading,
    error,
    refetch: fetchData,
    setRangoHistorico,
    ultimaActualizacion,
  };
}
