import { useState, useEffect } from 'react';
import { getSupabase } from '../../../utils/supabase/client';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import { Loader2, Plus, X } from 'lucide-react';
import type {
  Ingreso,
  IngresoFormData,
  Negocio,
  Region,
  CategoriaIngreso,
  Comprador,
  MedioPago
} from '../../../types/finanzas';

interface IngresoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingreso?: Ingreso | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function IngresoForm({ open, onOpenChange, ingreso, onSuccess, onCancel }: IngresoFormProps) {
  // Form state
  const [formData, setFormData] = useState<IngresoFormData>({
    fecha: new Date().toISOString().split('T')[0],
    negocio_id: '',
    region_id: '',
    categoria_id: '',
    nombre: '',
    comprador_id: '',
    valor: 0,
    medio_pago_id: '',
    observaciones: '',
    url_factura: '',
  });

  // Catalog data
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [categorias, setCategorias] = useState<CategoriaIngreso[]>([]);
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [mediosPago, setMediosPago] = useState<MedioPago[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNewComprador, setShowNewComprador] = useState(false);
  const [newCompradorData, setNewCompradorData] = useState({
    nombre: '',
    telefono: '',
    email: '',
  });

  // Load catalogs on mount
  useEffect(() => {
    if (open) {
      loadCatalogs();
    }
  }, [open]);

  // Load form data when ingreso changes
  useEffect(() => {
    if (ingreso) {
      setFormData({
        fecha: ingreso.fecha,
        negocio_id: ingreso.negocio_id,
        region_id: ingreso.region_id,
        categoria_id: ingreso.categoria_id,
        nombre: ingreso.nombre,
        comprador_id: ingreso.comprador_id || '',
        valor: ingreso.valor,
        medio_pago_id: ingreso.medio_pago_id,
        observaciones: ingreso.observaciones || '',
        url_factura: ingreso.url_factura || '',
      });
    } else {
      // Reset form for new ingreso
      setFormData({
        fecha: new Date().toISOString().split('T')[0],
        negocio_id: '',
        region_id: '',
        categoria_id: '',
        nombre: '',
        comprador_id: '',
        valor: 0,
        medio_pago_id: '',
        observaciones: '',
        url_factura: '',
      });
    }
  }, [ingreso]);

  // Load categorias when negocio changes
  useEffect(() => {
    if (formData.negocio_id) {
      loadCategorias(formData.negocio_id);
    } else {
      setCategorias([]);
    }
  }, [formData.negocio_id]);

  const loadCatalogs = async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();

      const [
        negociosResult,
        regionesResult,
        compradoresResult,
        mediosPagoResult
      ] = await Promise.all([
        supabase.from('fin_negocios').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_regiones').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_compradores').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_medios_pago').select('*').eq('activo', true).order('nombre'),
      ]);

      if (negociosResult.data) setNegocios(negociosResult.data);
      if (regionesResult.data) setRegiones(regionesResult.data);
      if (compradoresResult.data) setCompradores(compradoresResult.data);
      if (mediosPagoResult.data) setMediosPago(mediosPagoResult.data);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const loadCategorias = async (negocioId: string) => {
    try {
      const { data, error } = await getSupabase()
        .from('fin_categorias_ingresos')
        .select('*')
        .eq('negocio_id', negocioId)
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;
      setCategorias(data || []);
    } catch (error) {
      setCategorias([]);
    }
  };

  const handleInputChange = (field: keyof IngresoFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear categoria when negocio changes
    if (field === 'negocio_id') {
      setFormData(prev => ({ ...prev, categoria_id: '' }));
    }
  };

  const handleCreateComprador = async () => {
    if (!newCompradorData.nombre.trim()) {
      alert('El nombre del comprador es obligatorio');
      return;
    }

    try {
      const { data, error } = await getSupabase()
        .from('fin_compradores')
        .insert([{
          nombre: newCompradorData.nombre.trim(),
          telefono: newCompradorData.telefono.trim() || null,
          email: newCompradorData.email.trim() || null,
          activo: true,
        }])
        .select()
        .single();

      if (error) throw error;

      // Add to local state
      setCompradores(prev => [...prev, data]);

      // Set as selected
      setFormData(prev => ({ ...prev, comprador_id: data.id }));

      // Reset form
      setNewCompradorData({ nombre: '', telefono: '', email: '' });
      setShowNewComprador(false);
    } catch (error: any) {
      alert('Error al crear comprador: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.nombre.trim()) {
      alert('El nombre del ingreso es obligatorio');
      return;
    }
    if (!formData.negocio_id) {
      alert('Debe seleccionar un negocio');
      return;
    }
    if (!formData.region_id) {
      alert('Debe seleccionar una región');
      return;
    }
    if (!formData.categoria_id) {
      alert('Debe seleccionar una categoría');
      return;
    }
    if (formData.valor <= 0) {
      alert('El valor debe ser mayor a cero');
      return;
    }
    if (!formData.medio_pago_id) {
      alert('Debe seleccionar un medio de pago');
      return;
    }

    try {
      setSaving(true);

      const ingresoData = {
        ...formData,
        valor: Number(formData.valor),
        comprador_id: formData.comprador_id || null,
        observaciones: formData.observaciones || null,
        url_factura: formData.url_factura || null,
      };

      if (ingreso?.id) {
        // Update
        const { error } = await getSupabase()
          .from('fin_ingresos')
          .update(ingresoData)
          .eq('id', ingreso.id);

        if (error) throw error;
      } else {
        // Create
        const { error } = await getSupabase()
          .from('fin_ingresos')
          .insert([ingresoData]);

        if (error) throw error;
      }

      onSuccess();
    } catch (error: any) {
      alert('Error al guardar ingreso: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const isEditing = !!ingreso?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Ingreso' : 'Nuevo Ingreso'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Modifica los detalles del ingreso seleccionado.'
              : 'Registra un nuevo ingreso en el sistema.'
            }
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="contents">
          <DialogBody>
          <div className="space-y-6">
            {/* Información básica */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre del Ingreso *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => handleInputChange('nombre', e.target.value)}
                placeholder="Ej: Venta de palmito orgánico"
                required
              />
            </div>

            {/* Ubicación */}
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Ubicación</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
            </div>

            {/* Clasificación */}
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Clasificación</h3>
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoría *</Label>
                <Select
                  value={formData.categoria_id}
                  onValueChange={(value) => handleInputChange('categoria_id', value)}
                  disabled={!formData.negocio_id}
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
                {!formData.negocio_id && (
                  <p className="text-sm text-gray-500">
                    Selecciona un negocio primero para ver las categorías disponibles
                  </p>
                )}
              </div>
            </div>

            {/* Comprador y Medio de Pago */}
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Comprador y Pago</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="comprador">Comprador</Label>
                  <div className="flex gap-2">
                    <Select
                      value={formData.comprador_id || undefined}
                      onValueChange={(value) => handleInputChange('comprador_id', value)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Seleccionar comprador (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {compradores.map((comprador) => (
                          <SelectItem key={comprador.id} value={comprador.id}>
                            {comprador.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewComprador(true)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
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
            </div>

            {/* Observaciones */}
            <div className="space-y-2">
              <Label htmlFor="observaciones">Observaciones</Label>
              <Textarea
                id="observaciones"
                value={formData.observaciones}
                onChange={(e) => handleInputChange('observaciones', e.target.value)}
                placeholder="Observaciones adicionales..."
                rows={3}
              />
            </div>

            {/* Factura */}
            <div className="border-t pt-4">
              <FacturaUploader
                tipo="venta"
                currentUrl={formData.url_factura}
                onUploadSuccess={(url) => handleInputChange('url_factura', url)}
                onRemove={() => handleInputChange('url_factura', '')}
                disabled={saving}
              />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
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
            className="bg-[#73991C] hover:bg-[#5a7716]"
          >
            {saving ? 'Guardando...' : (isEditing ? 'Actualizar Ingreso' : 'Crear Ingreso')}
          </Button>
        </DialogFooter>
      </form>
        )}

        {/* Modal para crear nuevo comprador */}
        {showNewComprador && (
          <Dialog open={showNewComprador} onOpenChange={setShowNewComprador}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Crear Nuevo Comprador</DialogTitle>
                <DialogDescription>
                  Agrega un nuevo comprador al catálogo.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nuevo-nombre">Nombre *</Label>
                  <Input
                    id="nuevo-nombre"
                    value={newCompradorData.nombre}
                    onChange={(e) => setNewCompradorData(prev => ({ ...prev, nombre: e.target.value }))}
                    placeholder="Nombre del comprador"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nuevo-telefono">Teléfono</Label>
                  <Input
                    id="nuevo-telefono"
                    value={newCompradorData.telefono}
                    onChange={(e) => setNewCompradorData(prev => ({ ...prev, telefono: e.target.value }))}
                    placeholder="Número de teléfono"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nuevo-email">Email</Label>
                  <Input
                    id="nuevo-email"
                    type="email"
                    value={newCompradorData.email}
                    onChange={(e) => setNewCompradorData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="correo@ejemplo.com"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewComprador(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateComprador}
                  className="bg-[#73991C] hover:bg-[#5a7716]"
                >
                  Crear Comprador
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}