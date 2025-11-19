import { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { InventorySubNav } from './InventorySubNav';
import {
  ShoppingCart,
  Calendar,
  Package,
  DollarSign,
  FileText,
  User,
  Loader2,
  Search,
  Eye,
  X,
  ExternalLink,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface Purchase {
  id: string;
  fecha_compra: string;
  proveedor: string;
  numero_factura: string | null;
  producto_id: string;
  cantidad: number;
  unidad: string;
  numero_lote_producto: string | null;
  fecha_vencimiento: string | null;
  costo_unitario: number;
  costo_total: number;
  link_factura: string | null;
  usuario_registro: string | null;
  created_at: string;
  producto?: {
    nombre: string;
    categoria: string;
  };
}

/**
 * Modal de detalles de compra
 */
function PurchaseDetailModal({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  if (!purchase) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="fixed inset-0 bg-[#172E08]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#73991C] to-[#BFD97D] px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white">Detalle de Compra</h2>
              <p className="text-xs text-white/80">
                {purchase.numero_factura ? `Factura: ${purchase.numero_factura}` : 'Sin número de factura'}
              </p>
            </div>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            className="text-white hover:bg-white/20 rounded-xl"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Información General */}
          <div>
            <h3 className="text-sm uppercase tracking-wide text-[#4D240F]/60 mb-3">
              Información General
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#F8FAF5] rounded-xl p-4 border border-[#73991C]/10">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-[#73991C]" />
                  <p className="text-xs text-[#4D240F]/60">Fecha de Compra</p>
                </div>
                <p className="text-[#172E08]">{formatDate(purchase.fecha_compra)}</p>
              </div>

              <div className="bg-[#F8FAF5] rounded-xl p-4 border border-[#73991C]/10">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-[#73991C]" />
                  <p className="text-xs text-[#4D240F]/60">Proveedor</p>
                </div>
                <p className="text-[#172E08]">{purchase.proveedor}</p>
              </div>

              <div className="bg-[#F8FAF5] rounded-xl p-4 border border-[#73991C]/10">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-[#73991C]" />
                  <p className="text-xs text-[#4D240F]/60">Número de Factura</p>
                </div>
                <p className="text-[#172E08]">{purchase.numero_factura || '-'}</p>
              </div>

              <div className="bg-[#F8FAF5] rounded-xl p-4 border border-[#73991C]/10">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-[#73991C]" />
                  <p className="text-xs text-[#4D240F]/60">Registrado por</p>
                </div>
                <p className="text-[#172E08]">{purchase.usuario_registro || '-'}</p>
              </div>
            </div>
          </div>

          {/* Producto */}
          <div>
            <h3 className="text-sm uppercase tracking-wide text-[#4D240F]/60 mb-3">
              Producto
            </h3>
            <div className="bg-gradient-to-br from-[#73991C]/5 to-[#BFD97D]/10 rounded-xl p-4 border border-[#73991C]/20">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-[#73991C] rounded-xl flex items-center justify-center flex-shrink-0">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="text-[#172E08] mb-1">
                    {purchase.producto?.nombre || 'Producto no disponible'}
                  </h4>
                  <p className="text-sm text-[#4D240F]/70">
                    Categoría: {purchase.producto?.categoria || '-'}
                  </p>
                  {purchase.numero_lote_producto && (
                    <p className="text-sm text-[#4D240F]/70 mt-1">
                      Lote: {purchase.numero_lote_producto}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Cantidad y Costos */}
          <div>
            <h3 className="text-sm uppercase tracking-wide text-[#4D240F]/60 mb-3">
              Cantidad y Costos
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#F8FAF5] rounded-xl p-4 border border-[#73991C]/10">
                <p className="text-xs text-[#4D240F]/60 mb-2">Cantidad</p>
                <p className="text-2xl text-[#73991C]">
                  {purchase.cantidad.toLocaleString('es-CO')}
                </p>
                <p className="text-xs text-[#4D240F]/70 mt-1">{purchase.unidad}</p>
              </div>

              <div className="bg-[#F8FAF5] rounded-xl p-4 border border-[#73991C]/10">
                <p className="text-xs text-[#4D240F]/60 mb-2">Costo Unitario</p>
                <p className="text-lg text-[#172E08]">
                  {formatCurrency(purchase.costo_unitario)}
                </p>
                <p className="text-xs text-[#4D240F]/70 mt-1">por {purchase.unidad}</p>
              </div>

              <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/20 rounded-xl p-4 border border-[#73991C]/30">
                <p className="text-xs text-[#4D240F]/60 mb-2">Costo Total</p>
                <p className="text-2xl text-[#73991C]">
                  {formatCurrency(purchase.costo_total)}
                </p>
              </div>
            </div>
          </div>

          {/* Fecha de Vencimiento */}
          {purchase.fecha_vencimiento && (
            <div>
              <h3 className="text-sm uppercase tracking-wide text-[#4D240F]/60 mb-3">
                Información Adicional
              </h3>
              <div className="bg-[#F8FAF5] rounded-xl p-4 border border-[#73991C]/10">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-[#73991C]" />
                  <p className="text-xs text-[#4D240F]/60">Fecha de Vencimiento</p>
                </div>
                <p className="text-[#172E08]">{formatDate(purchase.fecha_vencimiento)}</p>
              </div>
            </div>
          )}

          {/* Link a Factura */}
          {purchase.link_factura && (
            <div>
              <a
                href={purchase.link_factura}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[#73991C] hover:text-[#5f7d17] transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Ver factura digital
              </a>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t border-[#73991C]/10">
            <p className="text-xs text-[#4D240F]/50">
              Registrado el{' '}
              {new Date(purchase.created_at).toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Historial de Compras - Lista de todas las compras registradas
 */
export function PurchaseHistory() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [filteredPurchases, setFilteredPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);

  useEffect(() => {
    loadPurchases();
  }, []);

  useEffect(() => {
    filterPurchases();
  }, [searchQuery, purchases]);

  const loadPurchases = async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('compras')
        .select(`
          *,
          producto:productos(nombre, categoria)
        `)
        .order('fecha_compra', { ascending: false });

      if (error) throw error;

      setPurchases(data || []);
    } catch (error) {
      console.error('Error cargando compras:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterPurchases = () => {
    if (!searchQuery.trim()) {
      setFilteredPurchases(purchases);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = purchases.filter((purchase) => {
      return (
        purchase.proveedor?.toLowerCase().includes(query) ||
        purchase.numero_factura?.toLowerCase().includes(query) ||
        purchase.producto?.nombre?.toLowerCase().includes(query) ||
        purchase.numero_lote_producto?.toLowerCase().includes(query)
      );
    });

    setFilteredPurchases(filtered);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <InventorySubNav />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-[#73991C] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InventorySubNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[#172E08] mb-2">Historial de Compras</h1>
          <p className="text-[#4D240F]/70">
            Registro completo de todas las compras de productos
          </p>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-4 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4D240F]/50" />
          <Input
            type="text"
            placeholder="Buscar por proveedor, factura, producto o lote..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-[#E7EDDD]/30 border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
          />
        </div>
        <p className="text-xs text-[#4D240F]/60 mt-2">
          Mostrando {filteredPurchases.length} de {purchases.length} compras
        </p>
      </div>

      {/* Lista de Compras */}
      {filteredPurchases.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-12 text-center shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
          <ShoppingCart className="w-16 h-16 text-[#4D240F]/40 mx-auto mb-4" />
          <h3 className="text-xl text-[#172E08] mb-2">No hay compras registradas</h3>
          <p className="text-[#4D240F]/60">
            {searchQuery
              ? 'No se encontraron compras con los criterios de búsqueda'
              : 'Aún no hay compras en el sistema'}
          </p>
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 overflow-hidden shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-[#73991C]/5 to-[#BFD97D]/10 border-b border-[#73991C]/10">
                <tr>
                  <th className="px-6 py-4 text-left text-xs uppercase tracking-wide text-[#4D240F]/70">
                    Fecha
                  </th>
                  <th className="px-6 py-4 text-left text-xs uppercase tracking-wide text-[#4D240F]/70">
                    Producto
                  </th>
                  <th className="px-6 py-4 text-left text-xs uppercase tracking-wide text-[#4D240F]/70">
                    Proveedor
                  </th>
                  <th className="px-6 py-4 text-left text-xs uppercase tracking-wide text-[#4D240F]/70">
                    Factura
                  </th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wide text-[#4D240F]/70">
                    Cantidad
                  </th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wide text-[#4D240F]/70">
                    Costo Total
                  </th>
                  <th className="px-6 py-4 text-center text-xs uppercase tracking-wide text-[#4D240F]/70">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#73991C]/10">
                {filteredPurchases.map((purchase) => (
                  <tr
                    key={purchase.id}
                    className="hover:bg-[#E7EDDD]/30 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#73991C]" />
                        <span className="text-sm text-[#172E08]">
                          {formatDate(purchase.fecha_compra)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-[#172E08]">
                          {purchase.producto?.nombre || 'Sin nombre'}
                        </p>
                        <p className="text-xs text-[#4D240F]/60">
                          {purchase.producto?.categoria || '-'}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-[#172E08]">
                        {purchase.proveedor}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-[#4D240F]/70">
                        {purchase.numero_factura || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div>
                        <p className="text-sm text-[#172E08]">
                          {purchase.cantidad.toLocaleString('es-CO')}
                        </p>
                        <p className="text-xs text-[#4D240F]/60">
                          {purchase.unidad}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-[#73991C]">
                        {formatCurrency(purchase.costo_total)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Button
                        onClick={() => setSelectedPurchase(purchase)}
                        variant="ghost"
                        className="text-[#73991C] hover:bg-[#73991C]/10 rounded-xl"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-[#73991C]/10">
            {filteredPurchases.map((purchase) => (
              <div
                key={purchase.id}
                className="p-4 hover:bg-[#E7EDDD]/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-sm text-[#172E08] mb-1">
                      {purchase.producto?.nombre || 'Sin nombre'}
                    </h3>
                    <p className="text-xs text-[#4D240F]/60">
                      {purchase.proveedor}
                    </p>
                  </div>
                  <Button
                    onClick={() => setSelectedPurchase(purchase)}
                    variant="ghost"
                    className="text-[#73991C] hover:bg-[#73991C]/10 rounded-xl -mr-2"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-[#4D240F]/60">Fecha</p>
                    <p className="text-sm text-[#172E08]">
                      {formatDate(purchase.fecha_compra)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#4D240F]/60">Cantidad</p>
                    <p className="text-sm text-[#172E08]">
                      {purchase.cantidad.toLocaleString('es-CO')} {purchase.unidad}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-[#4D240F]/60">Costo Total</p>
                    <p className="text-lg text-[#73991C]">
                      {formatCurrency(purchase.costo_total)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {filteredPurchases.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/20 rounded-2xl border border-[#73991C]/20 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
            <div className="flex items-center gap-3 mb-2">
              <ShoppingCart className="w-6 h-6 text-[#73991C]" />
              <p className="text-sm text-[#4D240F]/70 uppercase tracking-wide">
                Total Compras
              </p>
            </div>
            <p className="text-3xl text-[#73991C]">{filteredPurchases.length}</p>
          </div>

          <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/20 rounded-2xl border border-[#73991C]/20 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-6 h-6 text-[#73991C]" />
              <p className="text-sm text-[#4D240F]/70 uppercase tracking-wide">
                Inversión Total
              </p>
            </div>
            <p className="text-3xl text-[#73991C]">
              {formatCurrency(
                filteredPurchases.reduce((sum, p) => sum + p.costo_total, 0)
              )}
            </p>
          </div>

          <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/20 rounded-2xl border border-[#73991C]/20 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-6 h-6 text-[#73991C]" />
              <p className="text-sm text-[#4D240F]/70 uppercase tracking-wide">
                Productos Únicos
              </p>
            </div>
            <p className="text-3xl text-[#73991C]">
              {new Set(filteredPurchases.map((p) => p.producto_id)).size}
            </p>
          </div>
        </div>
      )}

      {/* Modal de Detalles */}
      {selectedPurchase && (
        <PurchaseDetailModal
          purchase={selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
        />
      )}
    </div>
  );
}
