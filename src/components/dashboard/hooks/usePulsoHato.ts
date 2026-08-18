// ARCHIVO: components/dashboard/hooks/usePulsoHato.ts
// DESCRIPCIÓN: I/O de la tarjeta Hato Lechero del bloque "Pulso por
// negocio" (`docs/plan_dashboard_centro_control.md` §4 Bloque 3 / §9.2).
// Sólo compone hooks/consultas que YA existen -- ninguna lógica de negocio
// vive aquí, toda la aritmética está en `pulsoNegocioCalculos.ts`
// (litros/vaca) y en `@/utils/hatoAlertasTablero.ts`
// (`vaciasMasDeNDias`/`derivarAlertasTablero`, instrucción explícita del
// encargo: "no reimplementes esa lógica").
//
// Gate de módulo (§8 del plan: "un bloque sin módulo no se renderiza y no
// se consulta"): este hook NO recibe un flag `habilitado` -- el gate vive
// en si `PulsoHatoCard` (su único consumidor) llega a montarse o no. React
// no dispara ningún efecto de un componente que nunca se monta, así que
// "no se consulta" es una consecuencia estructural, no algo que este hook
// tenga que negociar.

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { useHatoAnimales } from '@/components/hato/hooks/useHatoAnimales';
import { usePesajesYPartos } from '@/components/hato/hooks/usePesajesYPartos';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from '@/utils/hatoConfigDesdeTabla';
import { vaciasMasDeNDias, derivarAlertasTablero } from '@/utils/hatoAlertasTablero';
import { calcularPulsoHato, vejezPesajes, type PulsoHatoDatos, type VejezPesajes } from '../pulsoNegocioCalculos';
import { obtenerFechaHoy } from '@/utils/fechas';

export interface RevisionPulsoHato {
  /** Vacías con `>= umbralDias` desde el último parto (`vaciasMasDeNDias`). */
  vacias: number;
  /** Secado vencido (`derivarAlertasTablero(...).secadoVencido`). */
  secadoVencido: number;
  /** `hato_config.dias_espera_voluntaria_post_parto` -- se muestra en la
   *  línea de revisión ("hace más de {umbralDias} d"); nunca un "90"
   *  hardcodeado en el componente (CLAUDE.md: ningún umbral de negocio
   *  vive en el código sin ser el propio `hato_config`). */
  umbralDias: number;
}

export interface UsoPulsoHato {
  cargando: boolean;
  error: string | null;
  /** `null` = sin ningún pesaje registrado (o la consulta falló) -- nunca
   *  "0 L/vaca". */
  datos: PulsoHatoDatos | null;
  /** `null` mientras carga. `vejezPesajes` ya sabe reportar el caso "cero
   *  pesajes" con su propio nivel `critico` -- se calcula SIEMPRE que
   *  `usePesajesYPartos` termine, incluso cuando `datos` es `null`, porque
   *  el chip de frescura tiene que poder decir "sin pesajes" con su propio
   *  color en vez de desaparecer. */
  vejez: VejezPesajes | null;
  /** `null` mientras carga la config o si `hato_config` no se pudo leer --
   *  la línea de revisión completa depende de ese umbral, así que se
   *  degrada entera en vez de mostrar un conteo a medias. */
  revision: RevisionPulsoHato | null;
}

export function usePulsoHato(): UsoPulsoHato {
  const { animales, loading: cargandoAnimales, error: errorAnimales } = useHatoAnimales();
  const { pesajes, loading: cargandoPesajes, error: errorPesajes } = usePesajesYPartos();

  const [umbralDias, setUmbralDias] = useState<number | null>(null);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [errorConfig, setErrorConfig] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargarConfig() {
      setCargandoConfig(true);
      setErrorConfig(null);
      try {
        // `hato_config` no está en `src/types/database.ts` (generado,
        // anterior a 044) -- mismo workaround `as any` que
        // `useHatoAnimales.ts`/`useGanadoInventario.ts`.
        const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const { data, error } = await supabase.from('hato_config').select('clave, valor');
        if (error) throw error;
        const config = construirHatoConfigDesdeFilas((data ?? []) as FilaHatoConfig[]);
        if (!cancelado) setUmbralDias(config.dias_espera_voluntaria_post_parto);
      } catch (err) {
        if (!cancelado) setErrorConfig(err instanceof Error ? err.message : 'Error cargando hato_config');
      } finally {
        if (!cancelado) setCargandoConfig(false);
      }
    }
    cargarConfig();
    return () => {
      cancelado = true;
    };
  }, []);

  const hoy = obtenerFechaHoy();

  const vacasTotalEnOrdeno = useMemo(
    () => animales.filter((a) => a.categoria === 'hato' && a.estadoAnimal === 'activa').length,
    [animales],
  );

  const datos = useMemo(
    () => calcularPulsoHato(pesajes, vacasTotalEnOrdeno, hoy),
    [pesajes, vacasTotalEnOrdeno, hoy],
  );

  const vejez = useMemo(() => (cargandoPesajes ? null : vejezPesajes(pesajes, hoy)), [pesajes, cargandoPesajes, hoy]);

  const revision = useMemo<RevisionPulsoHato | null>(() => {
    if (umbralDias === null) return null;
    return {
      vacias: vaciasMasDeNDias(animales, { dias_espera_voluntaria_post_parto: umbralDias }, hoy).length,
      secadoVencido: derivarAlertasTablero(animales).secadoVencido.length,
      umbralDias,
    };
  }, [animales, umbralDias, hoy]);

  return {
    cargando: cargandoAnimales || cargandoPesajes || cargandoConfig,
    error: errorAnimales || errorPesajes || errorConfig,
    datos,
    vejez,
    revision,
  };
}
