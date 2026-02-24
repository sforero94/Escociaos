import { useEffect, useState } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Search, ArrowUpCircle, ArrowDownCircle, Filter, Plus, Loader2, RefreshCw, Calendar, RotateCcw, Package, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { NuevoMovimientoModal } from './NuevoMovimientoModal';
import { InventorySubNav } from './InventorySubNav';
import { formatearFechaHora } from '../../utils/fechas';

interface Movement {
  id: number;
  producto_id: number;
  tipo_movimiento: string;
  cantidad: number;
  saldo_anterior: number | null;
  saldo_nuevo: number | null;
  aplicacion_id: string | null;
  observaciones: string | null;
  created_at: string;
  fecha_movimiento: string;
  lote_aplicacion: string | null;
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
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
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

      if (error) throw error;

      setMovements(data || []);
    } catch (err: any) {
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
    const notas = mov.observaciones || '';
    const search = searchTerm.toLowerCase();
    return (
      productName.toLowerCase().includes(search) ||
      notas.toLowerCase().includes(search)
    );
  });

  // Paginación
  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedMovements = filteredMovements.slice(startIndex, endIndex);

  const getMovementIcon = (type: string) => {
    const typeNormalized = type?.toLowerCase()?.trim();
    
    if (typeNormalized === 'entrada') {
      return <ArrowUpCircle className="w-5 h-5 text-success-alt" />;
    } else if (typeNormalized === 'ajuste') {
      return <RotateCcw className="w-5 h-5 text-[#F59E0B]" />;
    } else {
      return <ArrowDownCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const getMovementColor = (type: string) => {
    const typeNormalized = type?.toLowerCase()?.trim();
    
    if (typeNormalized === 'entrada') {
      return 'border-success-alt/20 hover:border-success-alt/40';
    } else if (typeNormalized === 'ajuste') {
      return 'border-[#F59E0B]/20 hover:border-[#F59E0B]/40';
    } else {
      return 'border-destructive/20 hover:border-destructive/40';
    }
  };

  const getMovementBadgeColor = (type: string) => {
    const typeNormalized = type?.toLowerCase()?.trim();
    
    if (typeNormalized === 'entrada') {
      return 'bg-success-alt/10 text-success-alt';
    } else if (typeNormalized === 'ajuste') {
      return 'bg-[#F59E0B]/10 text-[#F59E0B]';
    } else {
      return 'bg-destructive/10 text-destructive';
    }
  };

  // Removed - now using formatearFechaHora from utils/fechas

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

  const formatNumber = (num: number | null | undefined, decimals: number = 2): string => {
    if (num === null || num === undefined || isNaN(num)) {
      return '0.00';
    }
    return num.toLocaleString('es-CO', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const hasActiveFilters = selectedProduct || selectedType || startDate || endDate;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de navegación */}
      <InventorySubNav />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-foreground mb-2">Movimientos de Inventario</h1>
          <p className="text-brand-brown/70">Historial completo de entradas y salidas de productos</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-primary hover:bg-primary-dark text-white rounded-xl transition-all duration-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Movimiento
          </Button>
          <Button
            onClick={loadMovements}
            className="bg-primary hover:bg-primary-dark text-white rounded-xl transition-all duration-200"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-foreground flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary" />
            Filtros
          </h2>
          {hasActiveFilters && (
            <Button
              onClick={clearFilters}
              variant="ghost"
              className="text-brand-brown/70 hover:text-primary text-sm"
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
              className="w-full px-4 py-2 border border-primary/20 rounded-xl bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
              className="w-full px-4 py-2 border border-primary/20 rounded-xl bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
              className="w-full px-4 py-2 border border-primary/20 rounded-xl bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
              className="w-full px-4 py-2 border border-primary/20 rounded-xl bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        {/* Búsqueda */}
        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-brown/50" />
            <Input
              type="text"
              placeholder="Buscar por producto, notas o referencia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-muted/30 border-primary/20 focus:border-primary rounded-xl"
            />
          </div>
        </div>

        {/* Contador de resultados */}
        <div className="mt-4 text-sm text-brand-brown/70">
          Mostrando <span className="text-primary">{filteredMovements.length}</span> movimiento{filteredMovements.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Resumen de filtros activos */}
      {hasActiveFilters && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
          <p className="text-sm text-foreground">
            <span className="text-primary">Filtros activos:</span>{' '}
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
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-12 text-center shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
          <Package className="w-16 h-16 text-brand-brown/40 mx-auto mb-4" />
          <h3 className="text-xl text-foreground mb-2">
            No hay movimientos
          </h3>
          <p className="text-brand-brown/60">
            {hasActiveFilters
              ? 'No se encontraron movimientos con los filtros seleccionados'
              : 'Aún no hay movimientos de inventario registrados'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginatedMovements.map(movement => (
            <div
              key={movement.id}
              className={`bg-white/80 backdrop-blur-sm rounded-xl border ${getMovementColor(movement.tipo_movimiento)} px-4 py-3 shadow-sm hover:shadow-md transition-all duration-200`}
            >
              <div className="flex items-center justify-between gap-4">
                {/* Icono y Producto */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex-shrink-0">
                    {getMovementIcon(movement.tipo_movimiento)}
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm text-foreground truncate">
                        {movement.producto?.nombre || 'Producto eliminado'}
                      </h3>
                      <span className={`px-2 py-0.5 rounded text-xs uppercase tracking-wide flex-shrink-0 ${getMovementBadgeColor(movement.tipo_movimiento)}`}>
                        {movement.tipo_movimiento}
                      </span>
                    </div>
                    
                    {/* Info secundaria en una sola línea */}
                    <div className="flex items-center gap-3 text-xs text-brand-brown/60">
                      {movement.aplicacion_id && (
                        <span>Apl: #{movement.aplicacion_id.substring(0, 6)}</span>
                      )}
                      {movement.lote_aplicacion && (
                        <span>Lote: {movement.lote_aplicacion}</span>
                      )}
                      {movement.observaciones && (
                        <span className="truncate max-w-[200px]">{movement.observaciones}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cantidad */}
                <div className="text-center flex-shrink-0">
                  <p className="text-xs text-brand-brown/50 uppercase tracking-wide mb-0.5">Cantidad</p>
                  <p className="text-sm text-foreground">
                    {movement.tipo_movimiento?.toLowerCase()?.trim() === 'entrada' ? '+' : ''}
                    {movement.tipo_movimiento?.toLowerCase()?.trim() === 'salida otros' ? '-' : ''}
                    {formatNumber(Math.abs(movement.cantidad), 2)} {movement.producto?.unidad_medida}
                  </p>
                </div>

                {/* Stock Anterior */}
                <div className="text-center flex-shrink-0 hidden sm:block">
                  <p className="text-xs text-brand-brown/50 uppercase tracking-wide mb-0.5">Stock Anterior</p>
                  <p className="text-sm text-brand-brown/70">
                    {formatNumber(movement.saldo_anterior, 2)} {movement.producto?.unidad_medida}
                  </p>
                </div>

                {/* Stock Nuevo */}
                <div className="text-center flex-shrink-0">
                  <p className="text-xs text-brand-brown/50 uppercase tracking-wide mb-0.5">Stock Nuevo</p>
                  <p className="text-sm text-foreground">
                    {formatNumber(movement.saldo_nuevo, 2)} {movement.producto?.unidad_medida}
                  </p>
                </div>

                {/* Fecha */}
                <div className="text-right flex-shrink-0 hidden md:block">
                  <p className="text-xs text-brand-brown/60 whitespace-nowrap">
                    {formatearFechaHora(movement.created_at)}
                  </p>
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
            className="border-primary/20 hover:bg-primary/5 disabled:opacity-50 rounded-xl"
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
                      ? 'bg-primary text-white hover:bg-primary-dark'
                      : 'bg-white border border-primary/20 text-foreground hover:bg-primary/5'
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
            className="border-primary/20 hover:bg-primary/5 disabled:opacity-50 rounded-xl"
          >
            Siguiente →
          </Button>
        </div>
      )}

      {/* Stats resumen */}
      {filteredMovements.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-success-alt/5 to-success-alt/10 rounded-2xl border border-success-alt/20 p-6 shadow-[0_4px_24px_rgba(40,167,69,0.08)] hover:shadow-[0_6px_28px_rgba(40,167,69,0.12)] transition-all duration-200">
            <div className="flex items-center gap-3 mb-2">
              <ArrowUpCircle className="w-6 h-6 text-success-alt" />
              <p className="text-sm text-success-alt/70 uppercase tracking-wide">Total Entradas</p>
            </div>
            <p className="text-3xl text-success-alt">
              {filteredMovements.filter(m => m.tipo_movimiento?.toLowerCase()?.trim() === 'entrada').length}
            </p>
          </div>
          
          <div className="bg-gradient-to-br from-destructive/5 to-destructive/10 rounded-2xl border border-destructive/20 p-6 shadow-[0_4px_24px_rgba(220,53,69,0.08)] hover:shadow-[0_6px_28px_rgba(220,53,69,0.12)] transition-all duration-200">
            <div className="flex items-center gap-3 mb-2">
              <ArrowDownCircle className="w-6 h-6 text-destructive" />
              <p className="text-sm text-destructive/70 uppercase tracking-wide">Total Salidas</p>
            </div>
            <p className="text-3xl text-destructive">
              {filteredMovements.filter(m => m.tipo_movimiento?.toLowerCase()?.trim() === 'salida').length}
            </p>
          </div>
          
          <div className="bg-gradient-to-br from-background to-secondary/20 rounded-2xl border border-secondary p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200">
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-6 h-6 text-primary" />
              <p className="text-sm text-brand-brown/70 uppercase tracking-wide">Total Movimientos</p>
            </div>
            <p className="text-3xl text-primary">
              {filteredMovements.length}
            </p>
          </div>
        </div>
      )}

      {/* Modal de Nuevo Movimiento */}
      <NuevoMovimientoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadMovements}
      />
    </div>
  );
}