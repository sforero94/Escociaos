// ARCHIVO: components/dashboard/hooks/usePulsoGanado.ts
// DESCRIPCIÓN: I/O de la tarjeta Ganado de Ceba del bloque "Pulso por
// negocio" (`docs/plan_dashboard_centro_control.md` §4 Bloque 3 / §9.2).
// Reusa `useGanadoInventario().fetchInventario()` (la misma consulta que ya
// usa `/ganado`) -- toda la aritmética vive en `calcularPulsoGanado`
// (`../pulsoNegocioCalculos.ts`, puro), que a su vez reusa
// `calcularKPIsInventario` (`@/utils/calculosGanado.ts`) para los totales y
// `cabezasPorHa`.

import { useEffect, useState } from 'react';
import { useGanadoInventario } from '@/components/ganado/hooks/useGanadoInventario';
import { calcularPulsoGanado, type PulsoGanadoDatos } from '../pulsoNegocioCalculos';

export interface UsoPulsoGanado {
  cargando: boolean;
  error: string | null;
  /** `null` = sin ninguna fila de inventario, o la consulta falló -- nunca
   *  "0 cabezas". */
  datos: PulsoGanadoDatos | null;
}

export function usePulsoGanado(): UsoPulsoGanado {
  const { fetchInventario } = useGanadoInventario();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<PulsoGanadoDatos | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setCargando(true);
      setError(null);
      try {
        const rows = await fetchInventario();
        if (!cancelado) setDatos(calcularPulsoGanado(rows));
      } catch (err) {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'Error cargando el inventario de ganado');
          setDatos(null);
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
    // `fetchInventario` es estable (`useCallback(..., [])` dentro de
    // `useGanadoInventario`) -- se declara en las deps por higiene, no
    // reintroduce un refetch.
  }, [fetchInventario]);

  return { cargando, error, datos };
}
