import { useState, useEffect, useMemo, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { LecturaClima, PeriodoResumen, LecturaClimaAgregada } from '@/types/clima';
import {
  lecturaActual as getLecturaActual,
  calcularResumenPeriodo,
  calcularResumenAnioALaFecha,
  agregarParaGrafico,
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

interface UseClimaDataReturn {
  lecturaActual: LecturaClima | null;
  resumenPeriodos: PeriodoResumen[];
  serieHistorica: LecturaClimaAgregada[];
  rawLecturas: LecturaClima[];
  estacionConfigurada: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setRangoHistorico: (desde: Date, hasta: Date) => void;
  ultimaActualizacion: Date | null;
}

export function useClimaData(): UseClimaDataReturn {
  const [rawLecturas, setRawLecturas] = useState<LecturaClima[]>([]);
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
      const last365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error: supabaseError } = await (supabase
        .from('clima_lecturas' as any)
        .select('*')
        .gte('timestamp', last365)
        .order('timestamp', { ascending: true }) as any);

      if (supabaseError) {
        setError(supabaseError.message);
        return;
      }

      setRawLecturas((data as LecturaClima[]) ?? []);
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

  const actual = useMemo(() => getLecturaActual(rawLecturas), [rawLecturas]);

  const resumenPeriodos = useMemo((): PeriodoResumen[] => {
    return PERIODOS.map(p => ({
      label: p.label,
      dias: p.type === 'ytd' ? 0 : p.dias,
      resumen: p.type === 'ytd'
        ? calcularResumenAnioALaFecha(rawLecturas)
        : calcularResumenPeriodo(rawLecturas, p.dias),
    }));
  }, [rawLecturas]);

  const serieHistorica = useMemo(
    () => agregarParaGrafico(rawLecturas, rangoHistorico.desde, rangoHistorico.hasta),
    [rawLecturas, rangoHistorico]
  );

  const setRangoHistorico = useCallback((desde: Date, hasta: Date) => {
    setRangoHistoricoState({ desde, hasta });
  }, []);

  return {
    lecturaActual: actual,
    resumenPeriodos,
    serieHistorica,
    rawLecturas,
    estacionConfigurada: rawLecturas.length > 0,
    loading,
    error,
    refetch: fetchData,
    setRangoHistorico,
    ultimaActualizacion,
  };
}
