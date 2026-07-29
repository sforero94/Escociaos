// ARCHIVO: components/hato/hooks/useFinCatalogosVenta.ts
// DESCRIPCIÓN: Catálogos de `fin_regiones`/`fin_medios_pago`/`fin_compradores`
// que necesita cualquier formulario del Hato que escriba en `fin_ingresos`
// (migración 070, RPCs `fn_hato_guardar_quincena_venta` y
// `fn_hato_registrar_venta_animales`) -- SOW 3 de
// `docs/plan_hato_produccion_rework.md`. Compartido entre
// `ProduccionQuincenalForm` y `VentaAnimalesHatoDialog` para no duplicar la
// misma consulta de catálogos dos veces (mismo patrón de `IngresoForm.tsx`,
// que carga estos tres catálogos + negocios/categorías -- aquí negocio y
// categoría los resuelve el RPC del lado servidor por NOMBRE, así que el
// formulario no los necesita).
//
// `fin_regiones`/`fin_medios_pago`/`fin_compradores` SÍ están en
// `src/types/database.ts` (son tablas de finanzas, no de `hato_*`), así que
// este hook NO necesita el cast `as any` que el resto del módulo hato usa.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { Region, MedioPago, Comprador } from '@/types/finanzas';

export function useFinCatalogosVenta() {
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [mediosPago, setMediosPago] = useState<MedioPago[]>([]);
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const [regionesRes, mediosRes, compradoresRes] = await Promise.all([
        supabase.from('fin_regiones').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_medios_pago').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_compradores').select('*').eq('activo', true).order('nombre'),
      ]);
      if (regionesRes.error) throw regionesRes.error;
      if (mediosRes.error) throw mediosRes.error;
      if (compradoresRes.error) throw compradoresRes.error;
      setRegiones((regionesRes.data ?? []) as Region[]);
      setMediosPago((mediosRes.data ?? []) as MedioPago[]);
      setCompradores((compradoresRes.data ?? []) as Comprador[]);
    } catch (err) {
      // `fin_regiones`/`fin_medios_pago`/`fin_compradores` son Gerencia-only
      // (mismo patrón que `fin_ingresos` -- create_finanzas_tables.sql) --
      // un Administrador que llegue a este formulario (no debería, está
      // detrás de `RoleGuard`) vería este error en vez de un formulario a
      // medias.
      setError(err instanceof Error ? err.message : 'Error desconocido cargando catálogos de venta');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { regiones, mediosPago, compradores, loading, error, reload };
}
