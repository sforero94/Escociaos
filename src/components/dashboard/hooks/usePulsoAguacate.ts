// ARCHIVO: components/dashboard/hooks/usePulsoAguacate.ts
// DESCRIPCIÓN: I/O de la tarjeta Aguacate Hass del bloque "Pulso por
// negocio" (`docs/plan_dashboard_centro_control.md` §4 Bloque 3 / §9.2).
// Toda la aritmética (agrupar por ronda, incidencia, gravedad, delta vs.
// ronda anterior) vive en `calcularPulsoAguacate`
// (`../pulsoNegocioCalculos.ts`, puro) -- este hook sólo consulta
// `monitoreos` y adapta las filas a la forma que esa función espera.
//
// Ventana de 90 días (mismo criterio que el KPI de plagas que este bloque
// reemplaza, `Dashboard.tsx::loadPlagas`): suficiente para casi siempre
// traer al menos dos rondas recientes y poder calcular el delta pp de la
// plaga principal, sin traer el histórico completo del módulo.

import { useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { calcularPulsoAguacate, type FilaMonitoreoPulso, type PulsoAguacateDatos } from '../pulsoNegocioCalculos';

const VENTANA_DIAS_MONITOREO_PULSO = 90;

export interface UsoPulsoAguacate {
  cargando: boolean;
  error: string | null;
  /** `null` = sin ninguna ronda real (con `ronda_id`) en la ventana
   *  consultada, o la consulta falló -- nunca "0% de incidencia". */
  datos: PulsoAguacateDatos | null;
}

interface FilaMonitoreoCruda {
  ronda_id: string | null;
  fecha_monitoreo: string;
  arboles_monitoreados: number | null;
  arboles_afectados: number | null;
  plagas_enfermedades_catalogo: { nombre: string } | { nombre: string }[] | null;
}

function nombrePlaga(catalogo: FilaMonitoreoCruda['plagas_enfermedades_catalogo']): string | null {
  if (!catalogo) return null;
  return Array.isArray(catalogo) ? (catalogo[0]?.nombre ?? null) : catalogo.nombre;
}

export function usePulsoAguacate(): UsoPulsoAguacate {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<PulsoAguacateDatos | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setCargando(true);
      setError(null);
      try {
        const supabase = getSupabase();
        const haceNDias = new Date();
        haceNDias.setDate(haceNDias.getDate() - VENTANA_DIAS_MONITOREO_PULSO);

        const { data, error: errConsulta } = await supabase
          .from('monitoreos')
          .select('ronda_id, fecha_monitoreo, arboles_monitoreados, arboles_afectados, plagas_enfermedades_catalogo(nombre)')
          .gte('fecha_monitoreo', haceNDias.toISOString());
        if (errConsulta) throw errConsulta;

        const filas: FilaMonitoreoPulso[] = ((data ?? []) as unknown as FilaMonitoreoCruda[]).map((m) => ({
          ronda_id: m.ronda_id,
          // `fecha_monitoreo` llega como timestamp ISO completo -- se
          // recorta a `AAAA-MM-DD` para que la comparación lexicográfica de
          // `calcularPulsoAguacate` (fechaMax) funcione igual que en el
          // resto del módulo (mismo patrón que `PlagasKPICard`).
          fecha_monitoreo: String(m.fecha_monitoreo).slice(0, 10),
          arboles_monitoreados: m.arboles_monitoreados,
          arboles_afectados: m.arboles_afectados,
          plaga_nombre: nombrePlaga(m.plagas_enfermedades_catalogo),
        }));

        if (!cancelado) setDatos(calcularPulsoAguacate(filas));
      } catch (err) {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'Error cargando el monitoreo de plagas');
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
  }, []);

  return { cargando, error, datos };
}
