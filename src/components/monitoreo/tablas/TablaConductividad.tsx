import { useState, useEffect } from 'react';
import { getSupabase } from '../../../utils/supabase/client';
import { formatearFecha } from '../../../utils/fechas';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import type { MonitoreoConductividad } from '../../../types/monitoreo';
import type { Lote } from '../../../types/shared';

interface TablaConductividadProps {
  refreshKey?: number;
}

export function TablaConductividad({ refreshKey }: TablaConductividadProps) {
  const supabase = getSupabase();
  const [registros, setRegistros] = useState<MonitoreoConductividad[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtroLote, setFiltroLote] = useState('todos');

  useEffect(() => {
    cargarDatos();
  }, [refreshKey]);

  async function cargarDatos() {
    setIsLoading(true);
    try {
      const [{ data: ceData }, { data: lotesData }] = await Promise.all([
        supabase
          .from('mon_conductividad')
          .select('*, lotes(nombre)')
          .order('fecha_monitoreo', { ascending: false })
          .limit(500),
        supabase.from('lotes').select('id, nombre').eq('activo', true).order('numero_orden'),
      ]);

      const mapped = (ceData || []).map((r: any) => ({
        ...r,
        lote_nombre: r.lotes?.nombre,
      }));
      setRegistros(mapped);
      setLotes(lotesData || []);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }

  const registrosFiltrados = filtroLote === 'todos'
    ? registros
    : registros.filter(r => r.lote_id === filtroLote);

  if (isLoading) {
    return <div className="text-center py-8 text-brand-brown/50">Cargando registros de CE...</div>;
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <Select value={filtroLote} onValueChange={setFiltroLote}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por lote" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los lotes</SelectItem>
            {lotes.map(l => (
              <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {registrosFiltrados.length === 0 ? (
        <div className="text-center py-8 text-brand-brown/50">No hay registros de conductividad</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-brand-brown/60">
                <th className="py-2 px-3">Fecha</th>
                <th className="py-2 px-3">Lote</th>
                <th className="py-2 px-3 text-right">CE (dS/m)</th>
                <th className="py-2 px-3 text-right">pH</th>
                <th className="py-2 px-3">Monitor</th>
                <th className="py-2 px-3">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {registrosFiltrados.map(r => {
                const ceColor = r.valor_ce > 3.0
                  ? 'text-red-600 font-semibold'
                  : r.valor_ce > 2.0
                    ? 'text-yellow-600 font-semibold'
                    : 'text-green-700';

                return (
                  <tr key={r.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3">{formatearFecha(r.fecha_monitoreo)}</td>
                    <td className="py-2 px-3">{r.lote_nombre}</td>
                    <td className={`py-2 px-3 text-right ${ceColor}`}>{r.valor_ce}</td>
                    <td className="py-2 px-3 text-right">{r.ph ?? '—'}</td>
                    <td className="py-2 px-3">{r.monitor ?? '—'}</td>
                    <td className="py-2 px-3 text-brand-brown/60 truncate max-w-[200px]">{r.observaciones ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
