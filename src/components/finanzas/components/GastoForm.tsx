import { useState, useEffect } from 'react';
import { getSupabase } from '../../../utils/supabase/client';
import { ProveedorDialog } from '../../shared/ProveedorDialog';
import { FacturaUploader } from '../../shared/FacturaUploader';
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
import { StandardDialog } from '../../ui/standard-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import { Loader2 } from 'lucide-react';
import type {
  Gasto,
  GastoFormData,
  Negocio,
  Region,
  CategoriaGasto,
  ConceptoGasto,
  Proveedor,
  MedioPago
} from '../../../types/finanzas';
import { toast } from 'sonner';

interface GastoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto?: Gasto | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function GastoForm({ open, onOpenChange, gasto, onSuccess, onCancel }: GastoFormProps) {
  // Form state
  const [formData, setFormData] = useState<GastoFormData>({
    fecha: new Date().toISOString().split('T')[0],
    negocio_id: '',
    region_id: '',
    categoria_id: '',
    concepto_id: '',
    nombre: '',
    proveedor_id: '',
    valor: 0,
    medio_pago_id: '',
    observaciones: '',
    url_factura: '',
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
  const [saving, setSaving] = useState(false);
  const [showProveedorDialog, setShowProveedorDialog] = useState(false);

  // Load catalogs on mount
  useEffect(() => {
    if (open) {
      loadCatalogs();
    }
  }, [open]);

  // Load form data when gasto changes
  useEffect(() => {
    if (gasto) {
      setFormData({
        fecha: gasto.fecha,
        negocio_id: gasto.negocio_id,
        region_id: gasto.region_id,
        categoria_id: gasto.categoria_id,
        concepto_id: gasto.concepto_id,
        nombre: gasto.nombre,
        proveedor_id: gasto.proveedor_id || '',
        valor: gasto.valor,
        medio_pago_id: gasto.medio_pago_id,
        observaciones: gasto.observaciones || '',
        url_factura: gasto.url_factura || '',
      });
    } else {
      // Reset form for new gasto
      setFormData({
        fecha: new Date().toISOString().split('T')[0],
        negocio_id: '',
        region_id: '',
        categoria_id: '',
        concepto_id: '',
        nombre: '',
        proveedor_id: '',
        valor: 0,
        medio_pago_id: '',
        observaciones: '',
        url_factura: '',
      });
    }
  }, [gasto]);

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
      setLoading(true);
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
        supabase.from('fin_medios_pago').select('*').eq('activo', true).order('nombre'),
      ]);

      if (negociosResult.data) setNegocios(negociosResult.data);
      if (regionesResult.data) setRegiones(regionesResult.data);
      if (categoriasResult.data) setCategorias(categoriasResult.data);
      if (proveedoresResult.data) setProveedores(proveedoresResult.data);
      if (mediosPagoResult.data) setMediosPago(mediosPagoResult.data);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const loadConceptos = async (categoriaId: string) => {
    try {
      const { data, error } = await getSupabase()
        .from('fin_conceptos_gastos')
        .select('*')
        .eq('categoria_id', categoriaId)
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;
      setConceptos(data || []);
    } catch (error) {
      setConceptos([]);
    }
  };

  const handleInputChange = (field: keyof GastoFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear concepto when categoria changes
    if (field === 'categoria_id') {
      setFormData(prev => ({ ...prev, concepto_id: '' }));
    }
  };

  const handleProveedorCreated = async (proveedorId: string) => {
    // Reload vendors and select the newly created one
    await loadCatalogs();
    setFormData(prev => ({ ...prev, proveedor_id: proveedorId }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.nombre.trim()) {
      toast.error('El nombre del gasto es obligatorio');
      return;
    }
    if (!formData.negocio_id) {
      toast.error('Debe seleccionar un negocio');
      return;
    }
    if (!formData.region_id) {
      toast.error('Debe seleccionar una región');
      return;
    }
    if (!formData.categoria_id) {
      toast.error('Debe seleccionar una categoría');
      return;
    }
    if (!formData.concepto_id) {
      toast.error('Debe seleccionar un concepto');
      return;
    }
    if (formData.valor <= 0) {
      toast.error('El valor debe ser mayor a cero');
      return;
    }
    if (!formData.medio_pago_id) {
      toast.error('Debe seleccionar un medio de pago');
      return;
    }

    try {
      setSaving(true);

      const gastoData = {
        ...formData,
        valor: Number(formData.valor),
        proveedor_id: formData.proveedor_id || null,
        observaciones: formData.observaciones || null,
        url_factura: formData.url_factura || null,
      };

      if (gasto?.id) {
        // Update - don't change estado when editing
        const { error } = await getSupabase()
          .from('fin_gastos')
          .update(gastoData)
          .eq('id', gasto.id);

        if (error) throw error;
      } else {
        // Create - manually created expenses are automatically confirmed
        const { error } = await getSupabase()
          .from('fin_gastos')
          .insert([{
            ...gastoData,
            estado: 'Confirmado' as const,
          }]);

        if (error) throw error;
      }

      onSuccess();
    } catch (error: any) {
      toast.error('Error al guardar gasto: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const isEditing = !!gasto?.id;

  return (
    <>
    <StandardDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? 'Editar Gasto' : 'Nuevo Gasto'}
      description={isEditing ? 'Modifica los detalles del gasto seleccionado.' : 'Registra un nuevo gasto en el sistema.'}
      size="lg"
      footer={
        <div className="flex gap-2 justify-end w-full">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="bg-primary hover:bg-primary-dark"
            onClick={handleSubmit}
          >
            {saving ? 'Guardando...' : (isEditing ? 'Actualizar Gasto' : 'Crear Gasto')}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
            {/* Información básica */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha *</Label>
                <Input
                  id="fecha"
                  type="date"
                  value={formData.fecha}
                  onChange={(e) => handleInputChange('fecha', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valor">Valor *</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.valor}
                  onChange={(e) => handleInputChange('valor', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="nombre">Nombre del Gasto *</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => handleInputChange('nombre', e.target.value)}
                  placeholder="Ej: Compra de fertilizantes"
                  required
                />
              </div>
            </div>

            {/* Ubicación and Clasificación */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="negocio">Negocio *</Label>
                <Select
                  value={formData.negocio_id}
                  onValueChange={(value) => handleInputChange('negocio_id', value)}
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

              <div className="space-y-2">
                <Label htmlFor="categoria">Categoría *</Label>
                <Select
                  value={formData.categoria_id}
                  onValueChange={(value) => handleInputChange('categoria_id', value)}
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
                  disabled={!formData.categoria_id}
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

            {/* Proveedor y Medio de Pago */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="proveedor">Proveedor</Label>
                <Select
                  value={formData.proveedor_id || undefined}
                  onValueChange={(value) => {
                    if (value === 'CREATE_NEW') {
                      setShowProveedorDialog(true);
                    } else {
                      handleInputChange('proveedor_id', value);
                    }
                  }}
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
                    <SelectItem value="CREATE_NEW" className="text-primary font-medium border-t mt-1 pt-1">
                      + Crear nuevo proveedor
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="medio_pago">Medio de Pago *</Label>
                <Select
                  value={formData.medio_pago_id}
                  onValueChange={(value) => handleInputChange('medio_pago_id', value)}
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

            {/* Observaciones and Factura */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea
                  id="observaciones"
                  value={formData.observaciones}
                  onChange={(e) => handleInputChange('observaciones', e.target.value)}
                  placeholder="Observaciones adicionales..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Factura</Label>
                <FacturaUploader
                  tipo="compra"
                  currentUrl={formData.url_factura}
                  onUploadSuccess={(url) => handleInputChange('url_factura', url)}
                  onRemove={() => handleInputChange('url_factura', '')}
                  disabled={saving}
                />
              </div>
            </div>
        </form>
      )}
    </StandardDialog>

    {/* Proveedor Creation Dialog */}
    <ProveedorDialog
      open={showProveedorDialog}
      onOpenChange={setShowProveedorDialog}
      onSuccess={handleProveedorCreated}
      onError={(message) => toast.error(message)}
    />
    </>
  );
}