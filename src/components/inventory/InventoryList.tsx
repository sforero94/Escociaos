import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Package, AlertTriangle, Loader2, Edit, Eye, History, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { getSupabase } from '../../utils/supabase/client';
import { ProductForm } from './ProductForm';
import { ProductMovements } from './ProductMovements';
import { InventorySubNav } from './InventorySubNav';

interface InventoryListProps {
  onNavigate?: (view: string, productId?: number) => void;
}

interface Product {
  id: number;
  nombre: string;
  categoria: string;
  estado: string;
  cantidad_actual: number;
  unidad_medida: string;
  stock_minimo: number;
  precio_unitario: number;
}

export function InventoryList({ onNavigate }: InventoryListProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('todas');
  const [isLoading, setIsLoading] = useState(true);
  
  // Estados para el formulario de productos
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  // Estados para el modal de movimientos
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [selectedProductForMovements, setSelectedProductForMovements] = useState<Product | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [searchQuery, categoryFilter, products]);

  const loadProducts = async () => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .order('nombre');

      if (error) {
        console.error('Error cargando productos:', error);
      } else if (data) {
        setProducts(data);
      }
    } catch (error) {
      console.error('Error inesperado:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterProducts = () => {
    let filtered = products;

    // Filtrar por búsqueda
    if (searchQuery) {
      filtered = filtered.filter((p) =>
        p.nombre.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filtrar por categoría
    if (categoryFilter !== 'todas') {
      filtered = filtered.filter((p) => p.categoria === categoryFilter);
    }

    setFilteredProducts(filtered);
  };

  const getCategories = () => {
    const categories = new Set(products.map((p) => p.categoria));
    return Array.from(categories).sort();
  };

  const hasLowStock = (product: Product) => {
    return product.cantidad_actual < product.stock_minimo;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const handleEditProduct = (productId: number) => {
    setEditingProductId(productId);
    setIsProductFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-[#4A7C59] animate-spin" />
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
          <h1 className="text-[#172E08] mb-2">Inventario</h1>
          <p className="text-[#4D240F]/70">{products.length} productos registrados</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {/* Link a Movimientos */}
          <Link
            to="/inventario/movimientos"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 border-2 border-[#73991C] text-[#73991C] bg-white hover:bg-[#F8FAF5] rounded-xl transition-all duration-200 font-medium"
          >
            <History className="w-4 h-4" />
            Ver Movimientos
          </Link>
          
          <Button
            onClick={() => {
              setEditingProductId(null);
              setIsProductFormOpen(true);
            }}
            className="bg-[#73991C] hover:bg-[#5f7d17] text-white rounded-xl transition-all duration-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Producto
          </Button>
          
          <Button
            onClick={() => onNavigate && onNavigate('inventory-new-purchase')}
            className="bg-gradient-to-r from-[#73991C] to-[#BFD97D] hover:shadow-lg hover:shadow-[#73991C]/30 text-white rounded-xl transition-all duration-200 hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Compra
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-4 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4D240F]/50" />
            <Input
              type="text"
              placeholder="Buscar productos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[#E7EDDD]/30 border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
          >
            <option value="todas">Todas las categorías</option>
            {getCategories().map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 overflow-hidden shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-[#E7EDDD]/50 to-[#E7EDDD]/30 border-b border-[#73991C]/10">
              <tr>
                <th className="text-left px-6 py-4 text-sm text-[#4D240F]/70 tracking-wide uppercase">Producto</th>
                <th className="text-left px-6 py-4 text-sm text-[#4D240F]/70 tracking-wide uppercase">Categoría</th>
                <th className="text-left px-6 py-4 text-sm text-[#4D240F]/70 tracking-wide uppercase">Estado</th>
                <th className="text-right px-6 py-4 text-sm text-[#4D240F]/70 tracking-wide uppercase">Cantidad</th>
                <th className="text-right px-6 py-4 text-sm text-[#4D240F]/70 tracking-wide uppercase">Stock Mín.</th>
                <th className="text-right px-6 py-4 text-sm text-[#4D240F]/70 tracking-wide uppercase">Valor Unit.</th>
                <th className="text-center px-6 py-4 text-sm text-[#4D240F]/70 tracking-wide uppercase">Alertas</th>
                <th className="text-center px-6 py-4 text-sm text-[#4D240F]/70 tracking-wide uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#73991C]/5">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Package className="w-12 h-12 text-[#4D240F]/40 mx-auto mb-3" />
                    <p className="text-[#4D240F]/60">No se encontraron productos</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-[#E7EDDD]/20 cursor-pointer transition-all duration-200"
                    onClick={() => onNavigate && onNavigate('inventory-detail', product.id)}
                  >
                    <td className="px-6 py-4">
                      <p className="text-[#172E08]">{product.nombre}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-[#73991C]/10 text-[#73991C] text-xs">
                        {product.categoria}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs ${
                          product.estado === 'Disponible'
                            ? 'bg-[#28A745]/10 text-[#28A745]'
                            : 'bg-[#FFC107]/10 text-[#FFC107]'
                        }`}
                      >
                        {product.estado || 'Disponible'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-[#172E08]">
                      {product.cantidad_actual} {product.unidad_medida}
                    </td>
                    <td className="px-6 py-4 text-right text-[#4D240F]/70">
                      {product.stock_minimo} {product.unidad_medida}
                    </td>
                    <td className="px-6 py-4 text-right text-[#172E08]">
                      {formatCurrency(product.precio_unitario || 0)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {hasLowStock(product) && (
                        <div className="inline-flex items-center justify-center w-8 h-8 bg-[#FFC107]/10 rounded-lg">
                          <AlertTriangle className="w-4 h-4 text-[#FFC107]" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditProduct(product.id);
                          }}
                          size="sm"
                          className="bg-[#73991C] hover:bg-[#5f7d17] text-white rounded-xl transition-all duration-200"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProductForMovements(product);
                            setShowMovementsModal(true);
                          }}
                          size="sm"
                          variant="outline"
                          className="border-[#73991C]/20 text-[#73991C] hover:bg-[#73991C]/5 rounded-xl transition-all duration-200"
                        >
                          <History className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-5 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200">
          <p className="text-sm text-[#4D240F]/60 mb-1 uppercase tracking-wide">Total Productos</p>
          <p className="text-2xl text-[#172E08]">{filteredProducts.length}</p>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-5 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200">
          <p className="text-sm text-[#4D240F]/60 mb-1 uppercase tracking-wide">Con Stock Bajo</p>
          <p className="text-2xl text-[#FFC107]">
            {filteredProducts.filter(hasLowStock).length}
          </p>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-5 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200">
          <p className="text-sm text-[#4D240F]/60 mb-1 uppercase tracking-wide">Valor Total</p>
          <p className="text-2xl text-[#172E08]">
            {formatCurrency(
              filteredProducts.reduce(
                (sum, p) => sum + p.cantidad_actual * (p.precio_unitario || 0),
                0
              )
            )}
          </p>
        </div>
      </div>

      {/* Formulario de Productos */}
      {isProductFormOpen && (
        <ProductForm
          isOpen={isProductFormOpen}
          productId={editingProductId}
          onClose={() => {
            setIsProductFormOpen(false);
            setEditingProductId(null);
          }}
          onSuccess={loadProducts}
        />
      )}

      {/* Modal de Movimientos del Producto */}
      {showMovementsModal && selectedProductForMovements && (
        <div className="fixed inset-0 bg-[#172E08]/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-[0_8px_32px_rgba(115,153,28,0.2)] animate-in fade-in zoom-in duration-200">
            {/* Header del Modal */}
            <div className="bg-gradient-to-r from-[#73991C] to-[#BFD97D] px-6 py-4 flex items-center justify-between border-b border-[#73991C]/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <History className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl text-white">Historial de Movimientos</h2>
                  <p className="text-sm text-white/80">{selectedProductForMovements.nombre}</p>
                </div>
              </div>
              <Button
                onClick={() => setShowMovementsModal(false)}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20 rounded-xl transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Contenido del Modal */}
            <div className="overflow-y-auto p-6 bg-[#F8FAF5]" style={{ maxHeight: 'calc(90vh - 80px)' }}>
              <ProductMovements
                productId={selectedProductForMovements.id}
                productName={selectedProductForMovements.nombre}
                unidadMedida={selectedProductForMovements.unidad_medida}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}