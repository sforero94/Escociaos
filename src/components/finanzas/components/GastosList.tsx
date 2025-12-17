import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import { getSupabase } from '../../../utils/supabase/client';
import { formatNumber } from '../../../utils/format';
import { formatearFechaCorta, calcularRangoFechasPorPeriodo } from '../../../utils/fechas';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { FiltrosGastos } from './FiltrosGastos';
import { CompletarGastoDialog } from './CompletarGastoDialog';
import { CargaMasivaGastos } from './CargaMasivaGastos';
import type { Gasto } from '../../../types/finanzas';

interface GastosListProps {
  onEdit?: (gasto: Gasto) => void;
}

interface FiltrosGastosExtendidos {
  periodo?: string;
  negocio_id?: string;
  region_id?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  categoria_id?: string;
  concepto_id?: string;
}

export function GastosList({ onEdit }: GastosListProps) {
  const location = useLocation();

  // Inicializar filtros con datos de navegación si vienen en location.state
  const filtrosIniciales = (() => {
    const state = location.state as any;
    const base: FiltrosGastosExtendidos = { periodo: 'mes_actual' };

    if (state) {
      const filtrosDesdeNavegacion: FiltrosGastosExtendidos = {
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

  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'Confirmado' | 'Pendiente'>('todos');
  const [filtros, setFiltros] = useState<FiltrosGastosExtendidos>(filtrosIniciales);
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [completandoGasto, setCompletandoGasto] = useState<Gasto | null>(null);
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
    loadGastos();
  }, [filtros, filtroEstado]);

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

  const loadGastos = async () => {
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
        .from('fin_gastos')
        .select(`
          *,
          fin_negocios (nombre),
          fin_regiones (nombre),
          fin_categorias_gastos (nombre),
          fin_conceptos_gastos (nombre),
          fin_proveedores (nombre),
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

      // Aplicar filtro de estado
      if (filtroEstado !== 'todos') {
        query = query.eq('estado', filtroEstado);
      }

      // Aplicar filtros de categoría y concepto
      if (filtros.categoria_id) {
        query = query.eq('categoria_id', filtros.categoria_id);
      }

      if (filtros.concepto_id) {
        query = query.eq('concepto_id', filtros.concepto_id);
      }

      query = query.order('fecha', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // Aplicar filtros básicos
      let gastosFiltrados = data || [];

      // Filtro de búsqueda
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        gastosFiltrados = gastosFiltrados.filter(gasto =>
          gasto.nombre?.toLowerCase().includes(query) ||
          gasto.fin_categorias_gastos?.nombre?.toLowerCase().includes(query) ||
          gasto.fin_conceptos_gastos?.nombre?.toLowerCase().includes(query) ||
          gasto.fin_proveedores?.nombre?.toLowerCase().includes(query)
        );
      }

      setGastos(gastosFiltrados);
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar gastos por búsqueda
  useEffect(() => {
    loadGastos();
  }, [searchQuery]);

  const handleEliminar = async (gastoId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este gasto?')) {
      return;
    }

    try {
      setEliminando(gastoId);

      const { error } = await getSupabase()
        .from('fin_gastos')
        .delete()
        .eq('id', gastoId);

      if (error) throw error;

      // Actualizar lista local
      setGastos(gastos.filter(g => g.id !== gastoId));
      alert('Gasto eliminado exitosamente');
    } catch (error: any) {
      alert('Error al eliminar el gasto: ' + error.message);
    } finally {
      setEliminando(null);
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'Confirmado':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Pendiente':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case 'Confirmado':
        return CheckCircle2;
      case 'Pendiente':
        return Clock;
      default:
        return Clock;
    }
  };

  const handleFiltrosChange = (nuevosFiltros: FiltrosGastosExtendidos) => {
    // Prevenir cambios no deseados - solo actualizar si realmente cambiaron
    const hayDiferencias = JSON.stringify(filtros) !== JSON.stringify(nuevosFiltros);

    if (hayDiferencias) {
      setFiltros(nuevosFiltros);
    }
  };

  const handleAplicarFiltros = () => {
    loadGastos();
  };

  return (
    <div className="space-y-6">
      {/* Filtros Globales */}
      <FiltrosGastos
        filtros={filtros}
        onFiltrosChange={handleFiltrosChange}
        onAplicarFiltros={handleAplicarFiltros}
      />

      {/* Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Gastos</p>
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <span className="text-red-600 text-sm">💸</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{gastos.length}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Confirmados</p>
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {gastos.filter(g => g.estado === 'Confirmado').length}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Valor Total</p>
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 text-sm">$</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            ${formatNumber(gastos.reduce((sum, g) => sum + (g.valor || 0), 0))}
          </p>
        </div>
      </div>

      {/* Búsqueda y acciones rápidas */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Búsqueda */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por nombre, categoría, concepto o proveedor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filtro por estado */}
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as 'todos' | 'Confirmado' | 'Pendiente')}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C] text-sm"
          >
            <option value="todos">Todos los estados</option>
            <option value="Confirmado">Confirmados</option>
            <option value="Pendiente">Pendientes</option>
          </select>

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

      {/* Lista de gastos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#73991C] animate-spin" />
          </div>
        ) : gastos.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">💸</span>
            </div>
            <h3 className="text-lg text-gray-900 mb-2">
              {searchQuery ? 'No se encontraron gastos' : 'No hay gastos registrados'}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {searchQuery
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Comienza registrando tu primer gasto'
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {gastos.map((gasto) => {
              const EstadoIcon = getEstadoIcon(gasto.estado);

              return (
                <div
                  key={gasto.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Estado */}
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          gasto.estado === 'Confirmado' ? 'bg-green-100' : 'bg-yellow-100'
                        }`}>
                          <EstadoIcon className={`w-5 h-5 ${
                            gasto.estado === 'Confirmado' ? 'text-green-600' : 'text-yellow-600'
                          }`} />
                        </div>
                      </div>

                      {/* Información */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-gray-900 truncate font-medium">
                            {gasto.nombre}
                          </h3>
                          <Badge
                            className={`text-xs ${getEstadoColor(gasto.estado)}`}
                          >
                            {gasto.estado}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
                          <span className="flex items-center gap-1">
                            📅 {formatearFechaCorta(gasto.fecha)}
                          </span>
                          <span className="flex items-center gap-1">
                            🏢 {gasto.fin_negocios?.nombre || 'Sin negocio'}
                          </span>
                          <span className="flex items-center gap-1">
                            📍 {gasto.fin_regiones?.nombre || 'Sin región'}
                          </span>
                          <span className="flex items-center gap-1">
                            📂 {gasto.fin_categorias_gastos?.nombre || 'Sin categoría'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            💡 {gasto.fin_conceptos_gastos?.nombre || 'Sin concepto'}
                          </span>
                          {gasto.fin_proveedores?.nombre && (
                            <span className="flex items-center gap-1">
                              🏪 {gasto.fin_proveedores.nombre}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            💳 {gasto.fin_medios_pago?.nombre || 'Sin medio'}
                          </span>
                        </div>

                        {gasto.observaciones && (
                          <p className="text-sm text-gray-500 mt-2 line-clamp-1">
                            {gasto.observaciones}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Valor y acciones */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          ${formatNumber(gasto.valor)}
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
                              menuAbiertoId === gasto.id ? null : gasto.id
                            );
                          }}
                          disabled={eliminando === gasto.id}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>

                        {/* Dropdown menu */}
                        {menuAbiertoId === gasto.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50"
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit?.(gasto);
                                setMenuAbiertoId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                            >
                              <Edit2 className="w-4 h-4 text-gray-500" />
                              Editar
                            </button>

                            {gasto.estado === 'Pendiente' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCompletandoGasto(gasto);
                                  setMenuAbiertoId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2 transition-colors"
                              >
                                <AlertTriangle className="w-4 h-4" />
                                Completar Gasto
                              </button>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEliminar(gasto.id);
                                setMenuAbiertoId(null);
                              }}
                              disabled={eliminando === gasto.id}
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
              );
            })}
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
                <h3 className="text-lg text-gray-900">Eliminar Gasto</h3>
                <p className="text-sm text-gray-600">Esta acción no se puede deshacer</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              ¿Estás seguro de que deseas eliminar este gasto? Esta acción no se puede deshacer.
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

      {/* Completar Gasto Dialog */}
      {completandoGasto && (
        <CompletarGastoDialog
          open={!!completandoGasto}
          onOpenChange={(open) => {
            if (!open) setCompletandoGasto(null);
          }}
          gasto={completandoGasto}
          onSuccess={() => {
            setCompletandoGasto(null);
            loadGastos(); // Refresh the list
          }}
          onError={(message) => {
            alert(message);
          }}
        />
      )}

      {/* Carga Masiva Dialog */}
      <CargaMasivaGastos
        open={showCargaMasiva}
        onOpenChange={setShowCargaMasiva}
        onSuccess={(count) => {
          loadGastos(); // Refresh the list
          alert(`¡Éxito! Se cargaron ${count} gastos correctamente`);
        }}
        onError={(message) => {
          alert(message);
        }}
      />
    </div>
  );
}