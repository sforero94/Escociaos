/**
 * `useGanadoParaAcciones` — el derivado de ganado que necesita el COTEJO del
 * bloque "Acciones recomendadas" (§6.2 del brief del motor).
 *
 * Vivía dentro del `loadGanado` del viejo `Dashboard.tsx`, mezclado con el
 * cálculo de la ficha de KPI que el rediseño eliminó. Se extrae tal cual —
 * misma agrupación, mismas fuentes— para que adelgazar el tablero no cambie
 * el comportamiento del cotejo.
 *
 * Por qué existe en vez de leerlo de la tarjeta de pulso: `PulsoGanadoCard`
 * consulta lo suyo por dentro y no expone el derivado, y hacer que lo
 * exponga acoplaría dos bloques que hoy son independientes. Reagrupa a
 * partir de las MISMAS filas de `fetchInventario()`, sin consulta extra.
 *
 * `null` es una respuesta legítima y NO significa "cero": el cotejo lo trata
 * como indeterminado (la acción se muestra), nunca como "el hecho dejó de
 * ser cierto". Un fallo de red no puede borrar una recomendación válida.
 */

import { useEffect, useState } from 'react';
import { useGanadoInventario } from '@/components/ganado/hooks/useGanadoInventario';
import { calcularKPIsInventario, calcularVariacion } from '@/utils/calculosGanado';
import { fechaAISODate } from '@/utils/fechas';
import type { GanadoInventarioParaAcciones } from '@/utils/accionesHechos';

export function useGanadoParaAcciones(habilitado: boolean): GanadoInventarioParaAcciones | null {
  const { fetchInventario, fetchMovimientos, countPendientes } = useGanadoInventario();
  const [derivado, setDerivado] = useState<GanadoInventarioParaAcciones | null>(null);

  useEffect(() => {
    if (!habilitado) {
      setDerivado(null);
      return;
    }
    let cancelado = false;

    (async () => {
      try {
        const [rows, movimientos, pendientes] = await Promise.all([
          fetchInventario(),
          fetchMovimientos(),
          countPendientes(),
        ]);
        const kpis = calcularKPIsInventario(rows);
        const hace30Dias = new Date();
        hace30Dias.setDate(hace30Dias.getDate() - 30);
        const variacion = calcularVariacion(movimientos, fechaAISODate(hace30Dias));

        const porFinca = new Map<string, { hectareas: number; cabezas: number; novillos: number; toros: number }>();
        for (const r of rows) {
          const acumulado = porFinca.get(r.finca) ?? { hectareas: r.hectareas, cabezas: 0, novillos: 0, toros: 0 };
          acumulado.cabezas += r.novillos + r.toros;
          acumulado.novillos += r.novillos;
          acumulado.toros += r.toros;
          porFinca.set(r.finca, acumulado);
        }

        if (cancelado) return;
        setDerivado({
          total: { cabezas: kpis.totalCabezas, novillos: kpis.totalNovillos, toros: kpis.totalToros },
          por_finca: Array.from(porFinca.entries()).map(([finca, v]) => ({ finca, ...v })),
          variacion_30_dias: variacion,
          pendientes_confirmacion: { total: pendientes },
        });
      } catch {
        // Silencio deliberado: `null` ya dice "no se pudo derivar", y el
        // cotejo lo interpreta como indeterminado. Fabricar ceros aquí haría
        // que un fallo de red caducara acciones que siguen siendo válidas.
        if (!cancelado) setDerivado(null);
      }
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habilitado]);

  return derivado;
}
