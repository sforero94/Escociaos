import { useState, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';

interface RegionFilterProps {
  value: string;
  onChange: (regionId: string) => void;
}

export function RegionFilter({ value, onChange }: RegionFilterProps) {
  const [regiones, setRegiones] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    const loadRegiones = async () => {
      const { data } = await getSupabase()
        .from('fin_regiones')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (data) setRegiones(data);
    };
    loadRegiones();
  }, []);

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-brand-brown/70">Region:</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-primary/20 bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Todas</option>
        {regiones.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
