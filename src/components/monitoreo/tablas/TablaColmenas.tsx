import { useState, useEffect } from 'react';
import { getSupabase } from '../../../utils/supabase/client';
import { formatearFecha } from '../../../utils/fechas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import type { MonitoreoColmena, Apiario } from '../../../types/monitoreo';

interface TablaColmenasProps {
  refreshKey?: number;
}

export function TablaColmenas({ refreshKey }: TablaColmenasProps) {
  const supabase = getSupabase();
  const [registros, setRegistros] = useState<MonitoreoColmena[]>([]);
  const [apiarios, setApiarios] = useState<Apiario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtroApiario, setFiltroApiario] = useState('todos');

  useEffect(() => {
    cargarDatos();
  }, [refreshKey]);

  async function cargarDatos() {
    setIsLoading(true);
    try {
      const [{ data: colData }, { data: apiariosData }] = await Promise.all([
        supabase
          .from('mon_colmenas')
          .select('*, apiarios(nombre)')
          .order('fecha_monitoreo', { ascending: false })
          .limit(500),
        supabase.from('apiarios').select('*').eq('activo', true).order('nombre'),
      ]);

      const mapped = (colData || []).map((r: any) => ({
        ...r,
        apiario_nombre: r.apiarios?.nombre,
      }));
      setRegistros(mapped);
      setApiarios(apiariosData || []);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }

  const registrosFiltrados = filtroApiario === 'todos'
    ? registros
    : registros.filter(r => r.apiario_id === filtroApiario);

  if (isLoading) {
    return <div className="text-center py-8 text-brand-brown/50">Cargando registros de colmenas...</div>;
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <Select value={filtroApiario} onValueChange={setFiltroApiario}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por apiario" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los apiarios</SelectItem>
            {apiarios.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {registrosFiltrados.length === 0 ? (
        <div className="text-center py-8 text-brand-brown/50">No hay registros de colmenas</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-brand-brown/60">
                <th className="py-2 px-3">Fecha</th>
                <th className="py-2 px-3">Apiario</th>
                <th className="py-2 px-3 text-right text-green-700">Fuertes</th>
                <th className="py-2 px-3 text-right text-yellow-700">Débiles</th>
                <th className="py-2 px-3 text-right text-red-700">Muertas</th>
                <th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3 text-right text-blue-700">Con reina</th>
                <th className="py-2 px-3">Monitor</th>
              </tr>
            </thead>
            <tbody>
              {registrosFiltrados.map(r => {
                const total = r.colmenas_fuertes + r.colmenas_debiles + r.colmenas_muertas;
                const pctFuertes = total > 0 ? Math.round((r.colmenas_fuertes / total) * 100) : 0;

                return (
                  <tr key={r.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3">{formatearFecha(r.fecha_monitoreo)}</td>
                    <td className="py-2 px-3">{r.apiario_nombre}</td>
                    <td className="py-2 px-3 text-right text-green-700 font-medium">{r.colmenas_fuertes}</td>
                    <td className="py-2 px-3 text-right text-yellow-700 font-medium">{r.colmenas_debiles}</td>
                    <td className="py-2 px-3 text-right text-red-700 font-medium">{r.colmenas_muertas}</td>
                    <td className="py-2 px-3 text-right">
                      {total}
                      <span className="text-xs text-brand-brown/50 ml-1">({pctFuertes}% fuertes)</span>
                    </td>
                    <td className="py-2 px-3 text-right text-blue-700 font-medium">{r.colmenas_con_reina}</td>
                    <td className="py-2 px-3">{r.monitor ?? '—'}</td>
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
