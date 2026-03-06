import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type {
  Negocio,
  Region,
  CategoriaIngreso,
  Comprador,
  MedioPago,
} from '@/types/finanzas';

export interface IngresosCatalogs {
  negocios: Negocio[];
  regiones: Region[];
  categorias: CategoriaIngreso[];
  compradores: Comprador[];
  mediosPago: MedioPago[];
  loading: boolean;
  getCategoriasPorNegocio: (negocioId: string) => CategoriaIngreso[];
  reloadCompradores: () => Promise<void>;
}

export function useIngresosCatalogs(): IngresosCatalogs {
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [categorias, setCategorias] = useState<CategoriaIngreso[]>([]);
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [mediosPago, setMediosPago] = useState<MedioPago[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();

      const [neg, reg, cat, comp, mp] = await Promise.all([
        supabase.from('fin_negocios').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_regiones').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_categorias_ingresos').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_compradores').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_medios_pago').select('*').eq('activo', true).order('nombre'),
      ]);

      if (neg.data) setNegocios(neg.data);
      if (reg.data) setRegiones(reg.data);
      if (cat.data) setCategorias(cat.data);
      if (comp.data) setCompradores(comp.data);
      if (mp.data) setMediosPago(mp.data);
    } catch {
      // catalogs fail silently — selects will be empty
    } finally {
      setLoading(false);
    }
  };

  const reloadCompradores = async () => {
    const { data } = await getSupabase()
      .from('fin_compradores')
      .select('*')
      .eq('activo', true)
      .order('nombre');
    if (data) setCompradores(data);
  };

  const getCategoriasPorNegocio = useCallback(
    (negocioId: string) => categorias.filter((c) => c.negocio_id === negocioId),
    [categorias]
  );

  return {
    negocios,
    regiones,
    categorias,
    compradores,
    mediosPago,
    loading,
    getCategoriasPorNegocio,
    reloadCompradores,
  };
}
