import { useState, useEffect } from 'react';
import { Search, Package, Calendar, Filter, X, ArrowUpCircle, ArrowDownCircle, RefreshCw } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { formatNumber } from '../../utils/format';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { InventoryNav } from './InventoryNav';
import { useToast } from '../shared/Toast';

interface Movement {
  id: number;
  producto_id: number;
  tipo_movimiento: string;
  cantidad: number;
  cantidad_anterior: number;
  cantidad_nueva: number;
  referencia_id: number | null;
  tipo_referencia: string | null;
  notas: string | null;
  created_at: string;
  created_by: string | null;
  producto?: {
    nombre: string;
    unidad_medida: string;
  };
}

interface Product {
  id: number;
  nombre: string;
  unidad_medida: string;
}

export function InventoryMovements() {
  const { showError, showSuccess, showInfo, ToastContainer } = useToast();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de filtros
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    loadProducts();
    loadMovements();
  }, []);

  useEffect(() => {
    loadMovements();
  }, [selectedProduct, selectedType, startDate, endDate]);

  const loadProducts = async () => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('productos')
        .select('id, nombre, unidad_medida')
        .eq('activo', true)
        .order('nombre');

      if (error) {
        console.error('Error cargando productos:', error);
        showError('❌ No se pudieron cargar los productos para filtros.');
        return;
      }

      setProducts(data || []);
    } catch (err: any) {
      console.error('Error cargando productos:', err);
      showError('❌ Error inesperado al cargar productos.');
    }
  };

  const loadMovements = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabase();

      // Query base
      let query = supabase
        .from('movimientos_inventario')
        .select(`
          *,
          producto:productos(nombre, unidad_medida)
        `)
        .order('created_at', { ascending: false });

      // Aplicar filtros
      if (selectedProduct) {
        query = query.eq('producto_id', selectedProduct);
      }

      if (selectedType) {
        query = query.eq('tipo_movimiento', selectedType);
      }

      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00`);
      }

      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error cargando movimientos:', error);
        showError('❌ No se pudieron cargar los movimientos. Por favor intente nuevamente.');
        setError('Error al cargar los movimientos');
        return;
      }

      // Debug: Ver qué tipo_movimiento viene de la BD
      if (data && data.length > 0) {
        console.log('🔍 Ejemplo de movimiento desde BD:', {
          tipo_movimiento: data[0].tipo_movimiento,
          tipo_exact: `"${data[0].tipo_movimiento}"`,
          cantidad: data[0].cantidad,
          producto: data[0].producto
        });
      }

      setMovements(data || []);
      showSuccess(`✅ ${data.length} movimientos cargados`);
    } catch (err: any) {
      console.error('Error cargando movimientos:', err);
      showError('❌ Error inesperado al cargar movimientos. Verifique su conexión.');
      setError('Error al cargar los movimientos');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSelectedProduct('');
    setSelectedType('');
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Filtrar por término de búsqueda (en memoria)
  const filteredMovements = movements.filter(mov => {
    if (!searchTerm) return true;
    const productName = mov.producto?.nombre || '';
    const notas = mov.notas || '';
    const search = searchTerm.toLowerCase();
    return (
      productName.toLowerCase().includes(search) ||
      notas.toLowerCase().includes(search) ||
      mov.tipo_referencia?.toLowerCase().includes(search)
    );
  });

  // Paginación
  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedMovements = filteredMovements.slice(startIndex, endIndex);

  const getMovementIcon = (type: string) => {
    const isEntrada = type?.toLowerCase()?.trim() === 'entrada';
    return isEntrada
      ? <ArrowUpCircle className="w-8 h-8 text-[#28A745]" />
      : <ArrowDownCircle className="w-8 h-8 text-[#DC3545]" />;
  };

  const getMovementColor = (type: string) => {
    const isEntrada = type?.toLowerCase()?.trim() === 'entrada';
    return isEntrada
      ? 'border-[#28A745]/20 hover:border-[#28A745]/40' 
      : 'border-[#DC3545]/20 hover:border-[#DC3545]/40';
  };

  const getMovementBadgeColor = (type: string) => {
    const isEntrada = type?.toLowerCase()?.trim() === 'entrada';
    return isEntrada
      ? 'bg-[#28A745]/10 text-[#28A745]'
      : 'bg-[#DC3545]/10 text-[#DC3545]';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatReferencia = (tipo: string | null, id: number | null) => {
    if (!tipo || !id) return 'Manual';
    
    const tipos: Record<string, string> = {
      'compra': 'Compra',
      'aplicacion': 'Aplicación',
      'ajuste': 'Ajuste',
      'verificacion': 'Verificación',
      'devolucion': 'Devolución',
    };
    
    return `${tipos[tipo] || tipo} #${id}`;
  };

  const hasActiveFilters = selectedProduct || selectedType || startDate || endDate;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-[#73991C] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer />
      {/* Barra de navegación */}
      <InventoryNav />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[#172E08] mb-2">Movimientos de Inventario</h1>
          <p className="text-[#4D240F]/70">Historial completo de entradas y salidas de productos</p>
        </div>
        <Button
          onClick={loadMovements}
          className="bg-[#73991C] hover:bg-[#5f7d17] text-white rounded-xl transition-all duration-200"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#172E08] flex items-center gap-2">
            <Filter className="w-5 h-5 text-[#73991C]" />
            Filtros
          </h2>
          {hasActiveFilters && (
            <Button
              onClick={clearFilters}
              variant="ghost"
              className="text-[#4D240F]/70 hover:text-[#73991C] text-sm"
            >
              <X className="w-4 h-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Filtro por Producto */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Producto
            </label>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full px-4 py-2 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
            >
              <option value="">Todos los productos</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>
                  {product.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Tipo */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Tipo de Movimiento
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-4 py-2 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
            >
              <option value="">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="salida">Salidas</option>
            </select>
          </div>

          {/* Fecha Inicio */}
          <div>
            <label className="block text-sm text-gray-700 mb-2 flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Desde
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
            />
          </div>

          {/* Fecha Fin */}
          <div>
            <label className="block text-sm text-gray-700 mb-2 flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Hasta
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
            />
          </div>
        </div>

        {/* Búsqueda */}
        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4D240F]/50" />
            <Input
              type="text"
              placeholder="Buscar por producto, notas o referencia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-[#E7EDDD]/30 border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
            />
          </div>
        </div>

        {/* Contador de resultados */}
        <div className="mt-4 text-sm text-[#4D240F]/70">
          Mostrando <span className="text-[#73991C]">{filteredMovements.length}</span> movimiento{filteredMovements.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Resumen de filtros activos */}
      {hasActiveFilters && (
        <div className="bg-[#73991C]/5 border border-[#73991C]/20 rounded-xl p-4">
          <p className="text-sm text-[#172E08]">
            <span className="text-[#73991C]">Filtros activos:</span>{' '}
            {selectedProduct && `Producto: ${products.find(p => p.id === parseInt(selectedProduct))?.nombre} `}
            {selectedType && `| Tipo: ${selectedType === 'entrada' ? 'Entradas' : 'Salidas'} `}
            {startDate && `| Desde: ${new Date(startDate).toLocaleDateString('es-CO')} `}
            {endDate && `| Hasta: ${new Date(endDate).toLocaleDateString('es-CO')}`}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Lista de Movimientos */}
      {paginatedMovements.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-12 text-center shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
          <Package className="w-16 h-16 text-[#4D240F]/40 mx-auto mb-4" />
          <h3 className="text-xl text-[#172E08] mb-2">
            No hay movimientos
          </h3>
          <p className="text-[#4D240F]/60">
            {hasActiveFilters
              ? 'No se encontraron movimientos con los filtros seleccionados'
              : 'Aún no hay movimientos de inventario registrados'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedMovements.map(movement => (
            <div
              key={movement.id}
              className={`bg-white/80 backdrop-blur-sm rounded-2xl border-2 ${getMovementColor(movement.tipo_movimiento)} p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200`}
            >
              <div className="flex items-start justify-between">
                {/* Info Principal */}
                <div className="flex items-start gap-4 flex-1">
                  {/* Icono */}
                  <div>
                    {getMovementIcon(movement.tipo_movimiento)}
                  </div>

                  {/* Detalles */}
                  <div className="flex-1">
                    {/* Producto y tipo */}
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-lg text-[#172E08]">
                        {movement.producto?.nombre || 'Producto eliminado'}
                      </h3>
                      <span className={`px-3 py-1 rounded-lg text-xs uppercase tracking-wide ${getMovementBadgeColor(movement.tipo_movimiento)}`}>
                        {movement.tipo_movimiento}
                      </span>
                    </div>

                    {/* Cantidad y cambio de stock */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-[#4D240F]/60 mb-1 uppercase tracking-wide">Cantidad</p>
                        <p className="text-lg text-[#172E08]">
                          {movement.tipo_movimiento?.toLowerCase()?.trim() === 'entrada' ? '+' : '-'}
                          {formatNumber(Math.abs(movement.cantidad), 2)} {movement.producto?.unidad_medida}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#4D240F]/60 mb-1 uppercase tracking-wide">Stock Anterior</p>
                        <p className="text-sm text-[#4D240F]/70">
                          {formatNumber(movement.cantidad_anterior, 2)} {movement.producto?.unidad_medida}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#4D240F]/60 mb-1 uppercase tracking-wide">Stock Nuevo</p>
                        <p className="text-sm text-[#172E08]">
                          {formatNumber(movement.cantidad_nueva, 2)} {movement.producto?.unidad_medida}
                        </p>
                      </div>
                    </div>

                    {/* Referencia y notas */}
                    <div className="flex flex-wrap gap-4 text-sm text-[#4D240F]/70">
                      {movement.tipo_referencia && (
                        <div className="flex items-center gap-1">
                          <span className="text-[#73991C]">●</span>
                          <span>Referencia:</span>{' '}
                          <span className="text-[#172E08]">{formatReferencia(movement.tipo_referencia, movement.referencia_id)}</span>
                        </div>
                      )}
                      {movement.notas && (
                        <div className="flex items-center gap-1">
                          <span className="text-[#73991C]">●</span>
                          <span>Notas:</span>{' '}
                          <span className="text-[#172E08]">{movement.notas}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fecha */}
                <div className="text-right text-sm text-[#4D240F]/60 ml-4">
                  <div className="whitespace-nowrap">
                    {formatDate(movement.created_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            variant="outline"
            className="border-[#73991C]/20 hover:bg-[#73991C]/5 disabled:opacity-50 rounded-xl"
          >
            ← Anterior
          </Button>
          
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              // Mostrar primera, última y páginas cercanas a la actual
              let page;
              if (totalPages <= 7) {
                page = i + 1;
              } else if (currentPage <= 4) {
                page = i + 1;
              } else if (currentPage >= totalPages - 3) {
                page = totalPages - 6 + i;
              } else {
                page = currentPage - 3 + i;
              }
              
              return (
                <Button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`rounded-xl min-w-[2.5rem] ${
                    currentPage === page
                      ? 'bg-[#73991C] text-white hover:bg-[#5f7d17]'
                      : 'bg-white border border-[#73991C]/20 text-[#172E08] hover:bg-[#73991C]/5'
                  }`}
                >
                  {page}
                </Button>
              );
            })}
          </div>

          <Button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            variant="outline"
            className="border-[#73991C]/20 hover:bg-[#73991C]/5 disabled:opacity-50 rounded-xl"
          >
            Siguiente →
          </Button>
        </div>
      )}

      {/* Stats resumen */}
      {filteredMovements.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-[#28A745]/5 to-[#28A745]/10 rounded-2xl border border-[#28A745]/20 p-6 shadow-[0_4px_24px_rgba(40,167,69,0.08)] hover:shadow-[0_6px_28px_rgba(40,167,69,0.12)] transition-all duration-200">
            <div className="flex items-center gap-3 mb-2">
              <ArrowUpCircle className="w-6 h-6 text-[#28A745]" />
              <p className="text-sm text-[#28A745]/70 uppercase tracking-wide">Total Entradas</p>
            </div>
            <p className="text-3xl text-[#28A745]">
              {filteredMovements.filter(m => m.tipo_movimiento?.toLowerCase()?.trim() === 'entrada').length}
            </p>
          </div>
          
          <div className="bg-gradient-to-br from-[#DC3545]/5 to-[#DC3545]/10 rounded-2xl border border-[#DC3545]/20 p-6 shadow-[0_4px_24px_rgba(220,53,69,0.08)] hover:shadow-[0_6px_28px_rgba(220,53,69,0.12)] transition-all duration-200">
            <div className="flex items-center gap-3 mb-2">
              <ArrowDownCircle className="w-6 h-6 text-[#DC3545]" />
              <p className="text-sm text-[#DC3545]/70 uppercase tracking-wide">Total Salidas</p>
            </div>
            <p className="text-3xl text-[#DC3545]">
              {filteredMovements.filter(m => m.tipo_movimiento?.toLowerCase()?.trim() === 'salida').length}
            </p>
          </div>
          
          <div className="bg-gradient-to-br from-[#F8FAF5] to-[#BFD97D]/20 rounded-2xl border border-[#BFD97D] p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200">
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-6 h-6 text-[#73991C]" />
              <p className="text-sm text-[#4D240F]/70 uppercase tracking-wide">Total Movimientos</p>
            </div>
            <p className="text-3xl text-[#73991C]">
              {filteredMovements.length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}