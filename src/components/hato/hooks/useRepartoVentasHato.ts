// ARCHIVO: components/hato/hooks/useRepartoVentasHato.ts
// DESCRIPCIÓN: I/O de `KpisVentaHato.tsx` (SOW 5,
// `docs/plan_hato_produccion_rework.md` §4.3 decisión 14): TODO el
// histórico de `fin_ingresos` del negocio Hato Lechero, clasificado en
// las 3 cubetas del dueño + "otros" vía `repartoVentasHato`
// (`hatoProduccion.ts`, SOW 5) -- este hook NO clasifica ni suma nada, solo
// consulta y arma el shape que ese motor puro necesita.
//
// Owner feedback (toggle quincena/mes/trimestre de "Ventas del Hato"): el
// hook ahora también expone la lista CRUDA `ingresos` (con `fecha`) --
// `KpisVentaHato` la filtra por periodo con `filtrarIngresosPorPeriodo` y
// recalcula `repartoVentasHato` en memoria, sin un segundo round-trip a la
// base. `reparto` (histórico, sin filtrar) se conserva para no romper el
// contrato existente.
//
// GERENCIA-ONLY por RLS (`fin_ingresos`/`fin_negocios`, ver
// `create_finanzas_tables.sql`) -- el componente que usa este hook está
// detrás de `RoleGuard allowedRoles={['Gerencia']}` (plan §4.3, "el gate es
// el ROL, nunca el resultado de la consulta"), así que un Administrador
// nunca debería montar este hook; si de todos modos lo hiciera, RLS
// devuelve `[]` sin error -- se trata como "sin negocio Hato Lechero
// visible", nunca como un total de $0 real.
//
// `fin_regiones`/`fin_negocios`/`fin_categorias_ingresos`/`fin_ingresos` SÍ
// están en `src/types/database.ts` (son tablas de finanzas, no `hato_*`) --
// este hook no necesita el cast `as any` que el resto del módulo hato usa.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { repartoVentasHato, type RepartoVentasHato, type IngresoHatoParaReparto } from '@/utils/hatoProduccion';

const NEGOCIO_HATO_LECHERO = 'Hato Lechero';

interface FilaIngresoHatoDb {
  valor: number;
  cantidad: number | null;
  fecha: string;
  fin_categorias_ingresos: { nombre: string } | { nombre: string }[] | null;
}

export interface UseRepartoVentasHato {
  /** `null` mientras carga, o cuando el negocio "Hato Lechero" no existe en
   * `fin_negocios` (nunca debería pasar en un entorno con la migración 070
   * aplicada) -- el componente decide el estado vacío, este hook nunca
   * fabrica un reparto en 0 para ese caso. Histórico completo (sin
   * filtrar por periodo) -- se conserva por compatibilidad. */
  reparto: RepartoVentasHato | null;
  /** Lista cruda (con `fecha`) del mismo histórico que produjo `reparto` --
   * el componente la filtra por periodo (`filtrarIngresosPorPeriodo`) y
   * recalcula `repartoVentasHato` en memoria. `null` en los mismos casos
   * que `reparto`. */
  ingresos: IngresoHatoParaReparto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useRepartoVentasHato(): UseRepartoVentasHato {
  const [reparto, setReparto] = useState<RepartoVentasHato | null>(null);
  const [ingresos, setIngresos] = useState<IngresoHatoParaReparto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();

      const { data: negocio, error: negocioError } = await supabase
        .from('fin_negocios')
        .select('id')
        .eq('nombre', NEGOCIO_HATO_LECHERO)
        .maybeSingle();
      if (negocioError) throw negocioError;
      if (!negocio) {
        setReparto(null);
        setIngresos(null);
        return;
      }

      const { filas } = await fetchAll<FilaIngresoHatoDb>((desde, hasta) =>
        supabase
          .from('fin_ingresos')
          .select('valor, cantidad, fecha, fin_categorias_ingresos(nombre)')
          .eq('negocio_id', negocio.id)
          .range(desde, hasta),
      );

      const listaIngresos: IngresoHatoParaReparto[] = filas.map((f) => {
        const categoria = Array.isArray(f.fin_categorias_ingresos)
          ? f.fin_categorias_ingresos[0]
          : f.fin_categorias_ingresos;
        return { categoriaNombre: categoria?.nombre ?? '', valor: f.valor, cantidad: f.cantidad, fecha: f.fecha };
      });

      setIngresos(listaIngresos);
      setReparto(repartoVentasHato(listaIngresos));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando el reparto de ventas del Hato');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { reparto, ingresos, loading, error, reload };
}
