// ARCHIVO: components/hato/hooks/useAnimalesParaPlanillaChequeo.ts
// DESCRIPCIÓN: B5.1 (export de la planilla del PRÓXIMO chequeo, pre-llenada
// -- docs/hato/sesiones-b5-d7-e3.md, `ChequeosList.tsx`). Carga SOLO lo que
// ese export necesita: identidad + último estado conocido de cada vaca
// activa (chapeta, nombre, PL, #Partos, última cría) más Secar/Parto
// Probable ya derivados por el motor (`derivarEstadoReproductivo`, el MISMO
// cálculo que el resto del módulo -- nunca una segunda fórmula).
//
// Deliberadamente independiente de `useHatoAnimales.ts` (que alimenta
// Tablero/Animales/Alertas y no expone "última cría"): esta sesión no toca
// ese hook compartido -- lo usan `HatoDashboard.tsx`/`AnimalesList.tsx`, que
// están fuera de este alcance (ver CLAUDE.md "Hato Lechero" / la nota de la
// sesión de UI en paralelo). Mismo patrón de I/O que el resto del módulo:
// `hato_config` + `v_hato_estado_actual`, `getSupabase() as any` (
// `src/types/database.ts` no incluye tablas/vistas `hato_*`, follow-up #3
// del plan).

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from '@/utils/hatoConfigDesdeTabla';
import { derivarEstadoReproductivo, type EstadoActualHatoRow } from '@/utils/calculosHato';
import type { EstadoActualHatoViewRow } from '@/types/hato';

export interface AnimalParaPlanillaChequeo {
  numero: number | null;
  nombre: string | null;
  pl: number | null;
  numPartos: number;
  /** "Última Cría" -- fecha del último parto conocido, cruda de la vista
   * (`ultimo_parto_fecha`). `null` = sin partos registrados, nunca una
   * fecha inventada. */
  ultimoPartoFecha: string | null;
  /** Referencia de solo-lectura calculada por el motor (`calculosHato.ts`)
   * con la raza REAL del animal -- distinta de la que deriva
   * `procesarHojaChequeo` durante el parseo de una planilla (que no conoce
   * la raza y usa el `_default` de `HatoConfig`, ver `chequeos.ts`). Es la
   * mejor referencia disponible para que el veterinario la vea impresa. */
  fechaSecar: string | null;
  fechaProbableParto: string | null;
}

function filaVistaAFactRow(fila: EstadoActualHatoViewRow): EstadoActualHatoRow {
  return {
    etapa: fila.etapa,
    raza: fila.raza,
    estado: fila.estado,
    num_partos: fila.num_partos,
    ultimo_chequeo_fecha: fila.ultimo_chequeo_fecha,
    ultimo_servicio_fecha: fila.ultimo_servicio_fecha,
    ultimo_parto_fecha: fila.ultimo_parto_fecha,
    ultimo_secado_real_fecha: fila.ultimo_secado_real_fecha,
    ultima_confirmacion_prenez_fecha: fila.ultima_confirmacion_prenez_fecha,
    ultimo_evento_fecha: fila.ultimo_evento_fecha,
    ultimo_estado_chequeo: fila.ultimo_estado_chequeo,
  };
}

/** Solo vacas adultas activas (etapa `vaca`, estado `activa`) -- ordeño y
 * horro por igual, terneras/novillas quedan fuera: la planilla de chequeo
 * histórica es específicamente el ciclo reproductivo de vacas adultas
 * (esquema TERNERAS es una tabla aparte, ver CLAUDE.md "Hato Lechero"). */
function esCandidataAPlanilla(fila: EstadoActualHatoViewRow): boolean {
  return fila.etapa === 'vaca' && fila.estado === 'activa';
}

export function useAnimalesParaPlanillaChequeo() {
  const [animales, setAnimales] = useState<AnimalParaPlanillaChequeo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase() as any;
      const [{ data: configRows, error: configError }, { data: estadoRows, error: estadoError }] = await Promise.all([
        supabase.from('hato_config').select('clave, valor'),
        supabase.from('v_hato_estado_actual').select('*'),
      ]);
      if (configError) throw configError;
      if (estadoError) throw estadoError;

      const config = construirHatoConfigDesdeFilas((configRows ?? []) as FilaHatoConfig[]);
      const hoy = new Date().toISOString().slice(0, 10);

      const filas: AnimalParaPlanillaChequeo[] = ((estadoRows ?? []) as EstadoActualHatoViewRow[])
        .filter(esCandidataAPlanilla)
        .map((fila) => {
          const derivado = derivarEstadoReproductivo(filaVistaAFactRow(fila), config, hoy);
          return {
            numero: fila.numero,
            nombre: fila.nombre,
            pl: fila.pl,
            numPartos: fila.num_partos,
            ultimoPartoFecha: fila.ultimo_parto_fecha,
            fechaSecar: derivado.fecha_secar,
            fechaProbableParto: derivado.fecha_probable_parto,
          };
        })
        .sort((a, b) => {
          if (a.numero == null && b.numero == null) return 0;
          if (a.numero == null) return 1;
          if (b.numero == null) return -1;
          return a.numero - b.numero;
        });

      setAnimales(filas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando el hato para la planilla');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { animales, loading, error, reload };
}
