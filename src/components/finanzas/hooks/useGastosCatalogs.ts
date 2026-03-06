import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type {
  Negocio,
  Region,
  CategoriaGasto,
  ConceptoGasto,
  Proveedor,
  MedioPago,
} from '@/types/finanzas';

export interface GastosCatalogs {
  negocios: Negocio[];
  regiones: Region[];
  categorias: CategoriaGasto[];
  conceptos: ConceptoGasto[];
  proveedores: Proveedor[];
  mediosPago: MedioPago[];
  loading: boolean;
  getConceptosPorCategoria: (categoriaId: string) => ConceptoGasto[];
  reloadProveedores: () => Promise<void>;
}

export function useGastosCatalogs(): GastosCatalogs {
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [conceptos, setConceptos] = useState<ConceptoGasto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [mediosPago, setMediosPago] = useState<MedioPago[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();

      const [neg, reg, cat, con, prov, mp] = await Promise.all([
        supabase.from('fin_negocios').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_regiones').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_categorias_gastos').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_conceptos_gastos').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_proveedores').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_medios_pago').select('*').eq('activo', true).order('nombre'),
      ]);

      if (neg.data) setNegocios(neg.data);
      if (reg.data) setRegiones(reg.data);
      if (cat.data) setCategorias(cat.data);
      if (con.data) setConceptos(con.data);
      if (prov.data) setProveedores(prov.data);
      if (mp.data) setMediosPago(mp.data);
    } catch {
      // catalogs fail silently — selects will be empty
    } finally {
      setLoading(false);
    }
  };

  const reloadProveedores = async () => {
    const { data } = await getSupabase()
      .from('fin_proveedores')
      .select('*')
      .eq('activo', true)
      .order('nombre');
    if (data) setProveedores(data);
  };

  const getConceptosPorCategoria = useCallback(
    (categoriaId: string) => conceptos.filter((c) => c.categoria_id === categoriaId),
    [conceptos]
  );

  return {
    negocios,
    regiones,
    categorias,
    conceptos,
    proveedores,
    mediosPago,
    loading,
    getConceptosPorCategoria,
    reloadProveedores,
  };
}
