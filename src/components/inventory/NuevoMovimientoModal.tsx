import { useState, useEffect, useRef } from 'react';
import { Package, Search, AlertCircle, CheckCircle, X } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '../ui/dialog';
import { useFormDraft } from '@/hooks/useFormDraft';
import { FormDraftBanner } from '@/components/shared/FormDraftBanner';
import { obtenerFechaHoy } from '@/utils/fechas';
import { buildManualMovementPayload, normalizeManualQuantity, postManualMovement, type ManualStockClient } from '@/utils/manualStockMovement';

interface Product {
  id: string;
  nombre: string;
  unidad_medida: string;
  cantidad_actual: number | null;
  precio_unitario: number | null;
  activo: boolean | null;
  updated_at: string | null;
}

interface NuevoMovimientoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NuevoMovimientoModal({ isOpen, onClose, onSuccess }: NuevoMovimientoModalProps) {
  const { user } = useAuth();
  const lifecycle = useRef({ owner: user?.id, open: isOpen, generation: 0 });
  const observedProps = useRef({ owner: user?.id, open: isOpen });
  if (observedProps.current.owner !== user?.id || observedProps.current.open !== isOpen) {
    observedProps.current = { owner: user?.id, open: isOpen };
    lifecycle.current = { owner: user?.id, open: isOpen, generation: lifecycle.current.generation + 1 };
  }
  const renderGeneration = lifecycle.current.generation;
  const searchGeneration = useRef(0);
  const submitting = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [tipoMovimiento, setTipoMovimiento] = useState<'Entrada' | 'Salida Otros' | 'Ajuste'>('Entrada');
  const [cantidad, setCantidad] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [noOp, setNoOp] = useState(false);

  useEffect(() => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    searchGeneration.current += 1;
    setSearchTerm(''); setProducts([]); setSelectedProduct(null);
    setTipoMovimiento('Entrada'); setCantidad(''); setObservaciones('');
    setError(null); setSuccess(false); setNoOp(false); setLoading(false);
    submitting.current = false;
  }, [user?.id, isOpen]);

  useEffect(() => () => {
    lifecycle.current.open = false;
    lifecycle.current.generation += 1;
    searchGeneration.current += 1;
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  const draft = useFormDraft('movimiento-new-v1', { tipoMovimiento, cantidad, observaciones });
  const previewQuantity = (() => {
    try { return normalizeManualQuantity(cantidad, tipoMovimiento === 'Ajuste'); }
    catch { return null; }
  })();


  function handleRestoreDraft() {
    if (!draft.draftData) return;
    setTipoMovimiento(draft.draftData.tipoMovimiento);
    setCantidad(draft.draftData.cantidad);
    setObservaciones(draft.draftData.observaciones);
    draft.acceptDraft();
  }

  useEffect(() => {
    const request = ++searchGeneration.current;
    const generation = lifecycle.current.generation;
    const owner = user?.id;
    const controller = new AbortController();
    const current = () => lifecycle.current.open && lifecycle.current.owner === owner
      && lifecycle.current.generation === generation && searchGeneration.current === request;
    if (!isOpen || !owner || searchTerm.length < 2 || selectedProduct) {
      setProducts([]); setSearching(false);
      return () => { controller.abort(); };
    }
    setProducts([]); setSearching(true);
    void (async () => {
      try {
        const { data, error } = await getSupabase().from('productos')
          .select('id, nombre, unidad_medida, cantidad_actual, precio_unitario, activo, updated_at')
          .eq('activo', true).ilike('nombre', `%${searchTerm}%`).order('nombre').limit(10)
          .abortSignal(controller.signal);
        if (!current()) return;
        if (error) throw error;
        setProducts(data || []);
      } catch (err: unknown) {
        if (current()) console.error('Failed to search products:', err);
      } finally {
        if (current()) setSearching(false);
      }
    })();
    return () => { searchGeneration.current += 1; controller.abort(); };
  }, [searchTerm, selectedProduct, user?.id, isOpen]);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSearchTerm(product.nombre);
    setProducts([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const owner = user?.id;
    const current = () => lifecycle.current.open && lifecycle.current.owner === owner
      && lifecycle.current.generation === renderGeneration;
    if (!current() || submitting.current) return;
    setError(null);

    // Validaciones
    if (!selectedProduct) {
      setError('Debe seleccionar un producto');
      return;
    }

    if (!owner) { setError('Debe iniciar sesión'); return; }
    submitting.current = true;
    setLoading(true);
    let completed = false;
    try {
      const payload = buildManualMovementPayload(selectedProduct, tipoMovimiento, cantidad, obtenerFechaHoy(), observaciones);
      const result = await postManualMovement(getSupabase() as unknown as ManualStockClient, owner, payload, current);
      if (!current()) return;

      // Success
      draft.clearDraft();
      setNoOp(result.noop);
      setSuccess(true);
      completed = true;
      closeTimer.current = setTimeout(() => {
        if (!current()) return;
        onSuccess();
        handleClose();
      }, 1500);

    } catch (err: unknown) {
      if (current()) setError(err instanceof Error ? err.message : 'Error al registrar el movimiento');
    } finally {
      if (current()) {
        submitting.current = completed;
        setLoading(false);
      }
    }
  };

  const handleClose = () => {
    if (!lifecycle.current.open || lifecycle.current.generation !== renderGeneration) return;
    lifecycle.current.open = false;
    lifecycle.current.generation += 1;
    searchGeneration.current += 1;
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    submitting.current = false;
    draft.clearDraft();
    setSearchTerm('');
    setProducts([]);
    setSelectedProduct(null);
    setTipoMovimiento('Entrada');
    setCantidad('');
    setObservaciones('');
    setError(null);
    setSuccess(false);
    setNoOp(false);
    onClose();
  };

  const footerButtons = (
    <>
      <Button
        type="button"
        onClick={handleClose}
        variant="outline"
        className="flex-1 border-gray-300 hover:bg-gray-50"
        disabled={loading}
      >
        Cancelar
      </Button>
      <Button
        type="submit"
        form="movimiento-form"
        className="flex-1 bg-primary hover:bg-primary-dark text-white"
        disabled={loading || success || !selectedProduct || !cantidad}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
            Registrando...
          </>
        ) : (
          <>
            <Package className="w-4 h-4 mr-2" />
            Registrar Movimiento
          </>
        )}
      </Button>
    </>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Registrar Movimiento Manual
            </span>
          </DialogTitle>
          <DialogDescription>Complete la información del movimiento de inventario</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <FormDraftBanner
            variant="available"
            show={draft.hasDraft}
            onRestore={handleRestoreDraft}
            onDiscard={draft.discardDraft}
          />

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-green-800">{noOp ? 'El stock ya coincide. No se creó un movimiento.' : 'Movimiento registrado exitosamente'}</p>
            </div>
          )}

          {/* Form */}
          <form id="movimiento-form" onSubmit={handleSubmit} className="space-y-6">
              {/* Buscador de Producto */}
              <div className="relative">
                <label className="block text-sm text-gray-700 mb-2">
                  Producto *
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      searchGeneration.current += 1;
                      setProducts([]);
                      setSearchTerm(e.target.value);
                      if (selectedProduct && e.target.value !== selectedProduct.nombre) {
                        setSelectedProduct(null);
                      }
                    }}
                    placeholder="Buscar producto por nombre..."
                    className="pl-10 pr-4 py-3 rounded-xl border-primary/20 focus:ring-primary focus:border-primary"
                    disabled={loading}
                  />
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>

                {/* Resultados de búsqueda */}
                {products.length > 0 && !selectedProduct && (
                  <div className="absolute z-10 w-full mt-2 bg-white border border-primary/20 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    {products.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleSelectProduct(product)}
                        className="w-full px-4 py-3 text-left hover:bg-background transition-colors border-b border-gray-100 last:border-b-0"
                      >
                        <p className="text-foreground font-medium">{product.nombre}</p>
                        <p className="text-sm text-brand-brown/70">
                          Stock actual: {product.cantidad_actual} {product.unidad_medida}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {/* Producto seleccionado */}
                {selectedProduct && (
                  <div className="mt-3 p-4 bg-background rounded-xl border border-primary/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-foreground font-medium">{selectedProduct.nombre}</p>
                        <p className="text-sm text-brand-brown/70">
                          Stock actual: <span className="font-medium text-primary">
                            {(selectedProduct.cantidad_actual ?? 0)} {selectedProduct.unidad_medida}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProduct(null);
                          setSearchTerm('');
                        }}
                        className="text-brand-brown/70 hover:text-destructive transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Tipo de Movimiento */}
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Tipo de Movimiento *
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(['Entrada', 'Salida Otros', 'Ajuste'] as const).map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setTipoMovimiento(tipo)}
                      disabled={loading}
                      className={`px-4 py-3 rounded-xl border-2 transition-all duration-200 capitalize ${
                        tipoMovimiento === tipo
                          ? 'border-primary bg-primary text-white shadow-md'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-primary/40'
                      }`}
                    >
                      {tipo}
                    </button>
                  ))}
                </div>

                {/* Descripción del tipo seleccionado */}
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900">
                    {tipoMovimiento === 'Entrada' && '✅ Aumenta el stock del producto'}
                    {tipoMovimiento === 'Salida Otros' && '⬇️ Disminuye el stock del producto'}
                    {tipoMovimiento === 'Ajuste' && '🔧 Ajuste de inventario (corrección de stock)'}
                  </p>
                </div>
              </div>

              {/* Cantidad */}
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Cantidad *
                </label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min={tipoMovimiento === 'Ajuste' ? '0' : '0.01'}
                    className="flex-1 rounded-xl border-primary/20 focus:ring-primary focus:border-primary"
                    disabled={loading || !selectedProduct}
                  />
                  {selectedProduct && (
                    <span className="text-brand-brown/70 font-medium whitespace-nowrap">
                      {selectedProduct.unidad_medida}
                    </span>
                  )}
                </div>

                {/* Preview del nuevo saldo */}
                {selectedProduct && selectedProduct.cantidad_actual !== null && previewQuantity !== null && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Saldo anterior:</span>
                      <span className="font-medium">{(selectedProduct.cantidad_actual ?? 0)} {selectedProduct.unidad_medida}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-600">Movimiento:</span>
                      <span className={`font-medium ${
                        tipoMovimiento === 'Entrada' ? 'text-green-600' :
                        tipoMovimiento === 'Salida Otros' ? 'text-red-600' :
                        (() => {
                          const diff = previewQuantity - (selectedProduct.cantidad_actual ?? 0);
                          return diff >= 0 ? 'text-green-600' : 'text-red-600';
                        })()
                      }`}>
                        {tipoMovimiento === 'Entrada' && `+${previewQuantity} ${selectedProduct.unidad_medida}`}
                        {tipoMovimiento === 'Salida Otros' && `-${previewQuantity} ${selectedProduct.unidad_medida}`}
                        {tipoMovimiento === 'Ajuste' && (() => {
                          const diff = previewQuantity - (selectedProduct.cantidad_actual ?? 0);
                          const sign = diff >= 0 ? '+' : '';
                          return `${sign}${diff.toFixed(2)} ${selectedProduct.unidad_medida}`;
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-gray-300">
                      <span className="font-medium text-gray-900">Nuevo saldo:</span>
                      <span className="font-bold text-primary">
                        {tipoMovimiento === 'Entrada'
                          ? (selectedProduct.cantidad_actual ?? 0) + previewQuantity
                          : tipoMovimiento === 'Salida Otros'
                          ? (selectedProduct.cantidad_actual ?? 0) - previewQuantity
                          : previewQuantity
                        } {selectedProduct.unidad_medida}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Notas / Motivo
                </label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Ej: Pérdida por daño, ajuste por inventario físico, etc."
                  rows={3}
                  maxLength={2000}
                  className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                  disabled={loading}
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}
            </form>
        </DialogBody>
        <DialogFooter>
          {footerButtons}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}