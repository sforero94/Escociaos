import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { getSupabase } from '../../../utils/supabase/client';
import { formatNumber } from '../../../utils/format';
import { formatearFechaCorta, calcularRangoFechasPorPeriodo } from '../../../utils/fechas';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { FiltrosIngresos } from './FiltrosIngresos';
import { CargaMasivaIngresos } from './CargaMasivaIngresos';
import type { Ingreso } from '../../../types/finanzas';

interface IngresosListProps {
  onEdit?: (ingreso: Ingreso) => void;
}

interface FiltrosIngresosExtendidos {
  periodo?: string;
  negocio_id?: string;
  region_id?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  categoria_id?: string;
}

export function IngresosList({ onEdit }: IngresosListProps) {
  const location = useLocation();

  // Inicializar filtros con datos de navegación si vienen en location.state
  const filtrosIniciales = (() => {
    const state = location.state as any;
    const base: FiltrosIngresosExtendidos = { periodo: 'mes_actual' };

    if (state) {
      const filtrosDesdeNavegacion: FiltrosIngresosExtendidos = {
        periodo: state.periodo || base.periodo,
        negocio_id: state.negocio_id,
        region_id: state.region_id,
        categoria_id: state.categoria,
        fecha_desde: state.fecha_desde,
        fecha_hasta: state.fecha_hasta
      };

      return filtrosDesdeNavegacion;
    }

    return base;
  })();

  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtros, setFiltros] = useState<FiltrosIngresosExtendidos>(filtrosIniciales);
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [showCargaMasiva, setShowCargaMasiva] = useState(false);

  // Rastrear la clave de navegación para evitar aplicar filtros múltiples veces
  const aplicadoKey = useRef<string | null>(location.key);

  // Aplicar filtros cuando cambia la navegación (solo navegaciones subsecuentes)
  useEffect(() => {
    const state = location.state as any;

    // Solo procesar si es una nueva navegación con datos de filtros
    if (state && aplicadoKey.current !== location.key) {
      aplicadoKey.current = location.key;
      setFiltros({
        periodo: state.periodo || 'mes_actual',
        negocio_id: state.negocio_id,
        region_id: state.region_id,
        categoria_id: state.categoria,
        fecha_desde: state.fecha_desde,
        fecha_hasta: state.fecha_hasta
      });
    }
  }, [location.state, location.key]);

  useEffect(() => {
    loadIngresos();
  }, [filtros]);

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = () => {
      if (menuAbiertoId) {
        setMenuAbiertoId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuAbiertoId]);

  const loadIngresos = async () => {
    try {
      setIsLoading(true);

      // Calcular fechas reales basadas en el período seleccionado
      let fechaDesde = filtros.fecha_desde;
      let fechaHasta = filtros.fecha_hasta;

      if (filtros.periodo && filtros.periodo !== 'rango_personalizado') {
        const { fecha_desde, fecha_hasta } = calcularRangoFechasPorPeriodo(filtros.periodo);
        fechaDesde = fecha_desde;
        fechaHasta = fecha_hasta;
      }

      let query = getSupabase()
        .from('fin_ingresos')
        .select(`
          *,
          fin_negocios (nombre),
          fin_regiones (nombre),
          fin_categorias_ingresos (nombre),
          fin_compradores (nombre),
          fin_medios_pago (nombre)
        `);

      // Aplicar filtros de fecha
      if (fechaDesde) query = query.gte('fecha', fechaDesde);
      if (fechaHasta) query = query.lte('fecha', fechaHasta);

      // Aplicar filtros de negocio y región
      if (filtros.negocio_id) {
        if (Array.isArray(filtros.negocio_id)) {
          query = query.in('negocio_id', filtros.negocio_id);
        } else {
          query = query.eq('negocio_id', filtros.negocio_id);
        }
      }
      if (filtros.region_id) {
        if (Array.isArray(filtros.region_id)) {
          query = query.in('region_id', filtros.region_id);
        } else {
          query = query.eq('region_id', filtros.region_id);
        }
      }

      // Aplicar filtro de categoría
      if (filtros.categoria_id) {
        query = query.eq('categoria_id', filtros.categoria_id);
      }

      query = query.order('fecha', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // Aplicar filtros básicos
      let ingresosFiltrados = data || [];

      // Filtro de búsqueda
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        ingresosFiltrados = ingresosFiltrados.filter(ingreso =>
          ingreso.nombre?.toLowerCase().includes(query) ||
          ingreso.fin_categorias_ingresos?.nombre?.toLowerCase().includes(query) ||
          ingreso.fin_compradores?.nombre?.toLowerCase().includes(query)
        );
      }

      setIngresos(ingresosFiltrados);
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar ingresos por búsqueda
  useEffect(() => {
    loadIngresos();
  }, [searchQuery]);

  const handleEliminar = async (ingresoId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este ingreso?')) {
      return;
    }

    try {
      setEliminando(ingresoId);

      const { error } = await getSupabase()
        .from('fin_ingresos')
        .delete()
        .eq('id', ingresoId);

      if (error) throw error;

      // Actualizar lista local
      setIngresos(ingresos.filter(i => i.id !== ingresoId));
      alert('Ingreso eliminado exitosamente');
    } catch (error: any) {
      alert('Error al eliminar el ingreso: ' + error.message);
    } finally {
      setEliminando(null);
    }
  };

  const handleFiltrosChange = (nuevosFiltros: FiltrosIngresosExtendidos) => {
    setFiltros(nuevosFiltros);
  };

  const handleAplicarFiltros = () => {
    loadIngresos();
  };

  return (
    <div className="space-y-6">
      {/* Filtros Globales */}
      <FiltrosIngresos
        filtros={filtros}
        onFiltrosChange={handleFiltrosChange}
        onAplicarFiltros={handleAplicarFiltros}
      />

      {/* Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Ingresos</p>
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-600 text-sm">💰</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{ingresos.length}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Valor Total</p>
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 text-sm">$</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            ${formatNumber(ingresos.reduce((sum, i) => sum + (i.valor || 0), 0))}
          </p>
        </div>
      </div>

      {/* Búsqueda y Carga Masiva */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por nombre, categoría o comprador..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Botón Carga Masiva */}
          <Button
            onClick={() => setShowCargaMasiva(true)}
            variant="outline"
            className="border-[#73991C] text-[#73991C] hover:bg-[#73991C]/10"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Carga Masiva
          </Button>
        </div>
      </div>

      {/* Lista de ingresos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#73991C] animate-spin" />
          </div>
        ) : ingresos.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">💰</span>
            </div>
            <h3 className="text-lg text-gray-900 mb-2">
              {searchQuery ? 'No se encontraron ingresos' : 'No hay ingresos registrados'}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {searchQuery
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Comienza registrando tu primer ingreso'
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {ingresos.map((ingreso) => (
              <div
                key={ingreso.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    {/* Información */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-gray-900 truncate font-medium">
                          {ingreso.nombre}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
                        <span className="flex items-center gap-1">
                          📅 {formatearFechaCorta(ingreso.fecha)}
                        </span>
                        <span className="flex items-center gap-1">
                          🏢 {ingreso.fin_negocios?.nombre || 'Sin negocio'}
                        </span>
                        <span className="flex items-center gap-1">
                          📍 {ingreso.fin_regiones?.nombre || 'Sin región'}
                        </span>
                        <span className="flex items-center gap-1">
                          📂 {ingreso.fin_categorias_ingresos?.nombre || 'Sin categoría'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        {ingreso.fin_compradores?.nombre && (
                          <span className="flex items-center gap-1">
                            🛒 {ingreso.fin_compradores.nombre}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          💳 {ingreso.fin_medios_pago?.nombre || 'Sin medio'}
                        </span>
                      </div>

                      {ingreso.observaciones && (
                        <p className="text-sm text-gray-500 mt-2 line-clamp-1">
                          {ingreso.observaciones}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Valor y acciones */}
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-600">
                        +${formatNumber(ingreso.valor)}
                      </p>
                    </div>

                    {/* Menú de acciones */}
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuAbiertoId(
                            menuAbiertoId === ingreso.id ? null : ingreso.id
                          );
                        }}
                        disabled={eliminando === ingreso.id}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>

                      {/* Dropdown menu */}
                      {menuAbiertoId === ingreso.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit?.(ingreso);
                              setMenuAbiertoId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                          >
                            <Edit2 className="w-4 h-4 text-gray-500" />
                            Editar
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEliminar(ingreso.id);
                              setMenuAbiertoId(null);
                            }}
                            disabled={eliminando === ingreso.id}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de confirmación de eliminación */}
      {eliminando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg text-gray-900">Eliminar Ingreso</h3>
                <p className="text-sm text-gray-600">Esta acción no se puede deshacer</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              ¿Estás seguro de que deseas eliminar este ingreso? Esta acción no se puede deshacer.
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setEliminando(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => handleEliminar(eliminando)}
                className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={!eliminando}
              >
                {eliminando ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Carga Masiva Dialog */}
      <CargaMasivaIngresos
        open={showCargaMasiva}
        onOpenChange={setShowCargaMasiva}
        onSuccess={(count) => {
          loadIngresos(); // Refresh the list
          alert(`¡Éxito! Se cargaron ${count} ingresos correctamente`);
        }}
        onError={(message) => {
          alert(`Error: ${message}`);
        }}
      />
    </div>
  );
}