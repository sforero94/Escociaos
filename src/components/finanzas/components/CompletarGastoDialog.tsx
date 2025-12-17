import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../../utils/supabase/client';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import { AlertCircle, CheckCircle, Clock, Package } from 'lucide-react';
import type { Gasto, Negocio, Region, CategoriaGasto, ConceptoGasto, Proveedor, MedioPago } from '../../../types/finanzas';

interface CompletarGastoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: Gasto | null;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function CompletarGastoDialog({
  open,
  onOpenChange,
  gasto,
  onSuccess,
  onError
}: CompletarGastoDialogProps) {
  // Form state
  const [formData, setFormData] = useState({
    negocio_id: '',
    region_id: '',
    categoria_id: '',
    concepto_id: '',
    proveedor_id: '',
    medio_pago_id: '',
    observaciones: '',
  });

  // Catalog data
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [conceptos, setConceptos] = useState<ConceptoGasto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [mediosPago, setMediosPago] = useState<MedioPago[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  // Initialize form when gasto changes - pre-load existing data
  useEffect(() => {
    if (gasto) {
      setFormData({
        negocio_id: gasto.negocio_id || '',
        region_id: gasto.region_id || '',
        categoria_id: gasto.categoria_id || '',
        concepto_id: gasto.concepto_id || '',
        proveedor_id: gasto.proveedor_id || '',
        medio_pago_id: gasto.medio_pago_id || '',
        observaciones: gasto.observaciones || '',
      });
    }
  }, [gasto]);

  // Load catalogs
  useEffect(() => {
    if (open) {
      loadCatalogs();
    }
  }, [open]);

  // Load conceptos when categoria changes
  useEffect(() => {
    if (formData.categoria_id) {
      loadConceptos(formData.categoria_id);
    } else {
      setConceptos([]);
    }
  }, [formData.categoria_id]);

  const loadCatalogs = async () => {
    try {
      setLoadingCatalogs(true);
      const supabase = getSupabase();

      const [
        negociosResult,
        regionesResult,
        categoriasResult,
        proveedoresResult,
        mediosPagoResult
      ] = await Promise.all([
        supabase.from('fin_negocios').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_regiones').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_categorias_gastos').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_proveedores').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_medios_pago').select('*').eq('activo', true).order('nombre')
      ]);

      if (negociosResult.data) setNegocios(negociosResult.data);
      if (regionesResult.data) setRegiones(regionesResult.data);
      if (categoriasResult.data) setCategorias(categoriasResult.data);
      if (proveedoresResult.data) setProveedores(proveedoresResult.data);
      if (mediosPagoResult.data) setMediosPago(mediosPagoResult.data);

    } catch (error: any) {
      onError('Error al cargar los catálogos');
    } finally {
      setLoadingCatalogs(false);
    }
  };

  const loadConceptos = async (categoriaId: string) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('fin_conceptos_gastos')
        .select('*')
        .eq('categoria_id', categoriaId)
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;
      setConceptos(data || []);
    } catch (error: any) {
      setConceptos([]);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!gasto) return;

    // Validation
    if (!formData.negocio_id || !formData.region_id || !formData.categoria_id ||
        !formData.concepto_id || !formData.medio_pago_id) {
      onError('Todos los campos son obligatorios');
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabase();

      // Update the gasto with the completed information
      const { error } = await supabase
        .from('fin_gastos')
        .update({
          negocio_id: formData.negocio_id,
          region_id: formData.region_id,
          categoria_id: formData.categoria_id,
          concepto_id: formData.concepto_id,
          proveedor_id: formData.proveedor_id || null,
          medio_pago_id: formData.medio_pago_id,
          observaciones: formData.observaciones,
          estado: 'Confirmado',
          updated_at: new Date().toISOString()
        })
        .eq('id', gasto.id);

      if (error) throw error;

      onSuccess();
      onOpenChange(false);

    } catch (error: any) {
      onError(`Error al completar el gasto: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getDiasPendiente = () => {
    if (!gasto) return 0;
    const created = new Date(gasto.created_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  if (!gasto) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-600" />
            Completar Gasto Pendiente
          </DialogTitle>
          <DialogDescription>
            Complete la información del gasto generado automáticamente desde una compra
          </DialogDescription>
        </DialogHeader>

        {/* Gasto Information Summary */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-orange-900 mb-2">Información del Gasto</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Nombre:</span>
                  <p className="font-medium">{gasto.nombre}</p>
                </div>
                <div>
                  <span className="text-gray-600">Valor:</span>
                  <p className="font-medium text-green-600">{formatCurrency(gasto.valor)}</p>
                </div>
                <div>
                  <span className="text-gray-600">Fecha:</span>
                  <p className="font-medium">{new Date(gasto.fecha).toLocaleDateString('es-CO')}</p>
                </div>
                <div>
                  <span className="text-gray-600">Estado:</span>
                  <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                    <Clock className="w-3 h-3 mr-1" />
                    Pendiente ({getDiasPendiente()} días)
                  </Badge>
                </div>
              </div>
              {gasto.observaciones && (
                <div className="mt-3">
                  <span className="text-gray-600 text-sm">Observaciones:</span>
                  <p className="text-sm text-gray-700 mt-1">{gasto.observaciones}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Business and Region */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="negocio">Negocio *</Label>
              <Select
                value={formData.negocio_id}
                onValueChange={(value) => handleInputChange('negocio_id', value)}
                disabled={loading || loadingCatalogs}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar negocio" />
                </SelectTrigger>
                <SelectContent>
                  {negocios.map((negocio) => (
                    <SelectItem key={negocio.id} value={negocio.id}>
                      {negocio.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="region">Región *</Label>
              <Select
                value={formData.region_id}
                onValueChange={(value) => handleInputChange('region_id', value)}
                disabled={loading || loadingCatalogs}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar región" />
                </SelectTrigger>
                <SelectContent>
                  {regiones.map((region) => (
                    <SelectItem key={region.id} value={region.id}>
                      {region.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category and Concept */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoría *</Label>
              <Select
                value={formData.categoria_id}
                onValueChange={(value) => handleInputChange('categoria_id', value)}
                disabled={loading || loadingCatalogs}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((categoria) => (
                    <SelectItem key={categoria.id} value={categoria.id}>
                      {categoria.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="concepto">Concepto *</Label>
              <Select
                value={formData.concepto_id}
                onValueChange={(value) => handleInputChange('concepto_id', value)}
                disabled={loading || loadingCatalogs || !formData.categoria_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar concepto" />
                </SelectTrigger>
                <SelectContent>
                  {conceptos.map((concepto) => (
                    <SelectItem key={concepto.id} value={concepto.id}>
                      {concepto.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Provider and Payment Method */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="proveedor">Proveedor</Label>
              <Select
                value={formData.proveedor_id}
                onValueChange={(value) => handleInputChange('proveedor_id', value)}
                disabled={loading || loadingCatalogs}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proveedor (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {proveedores.map((proveedor) => (
                    <SelectItem key={proveedor.id} value={proveedor.id}>
                      {proveedor.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="medio_pago">Medio de Pago *</Label>
              <Select
                value={formData.medio_pago_id}
                onValueChange={(value) => handleInputChange('medio_pago_id', value)}
                disabled={loading || loadingCatalogs}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar medio de pago" />
                </SelectTrigger>
                <SelectContent>
                  {mediosPago.map((medio) => (
                    <SelectItem key={medio.id} value={medio.id}>
                      {medio.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Observations */}
          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              value={formData.observaciones}
              onChange={(e) => handleInputChange('observaciones', e.target.value)}
              placeholder="Observaciones adicionales..."
              rows={3}
              disabled={loading}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || loadingCatalogs}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {loading ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2 animate-spin" />
                  Completando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirmar Gasto
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}