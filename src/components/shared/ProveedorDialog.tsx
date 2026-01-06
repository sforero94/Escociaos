import { useState } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { StandardDialog } from '../ui/standard-dialog';
import { Building2, Loader2 } from 'lucide-react';

interface ProveedorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (proveedorId: string) => void;
  onError?: (message: string) => void;
}

/**
 * Reusable dialog for creating a new vendor (proveedor)
 * Can be used by any role without restrictions
 */
export function ProveedorDialog({
  open,
  onOpenChange,
  onSuccess,
  onError
}: ProveedorDialogProps) {
  const [formData, setFormData] = useState({
    nombre: '',
    nit: '',
    telefono: '',
    email: '',
  });
  const [saving, setSaving] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData({
      nombre: '',
      nit: '',
      telefono: '',
      email: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      onError?.('El nombre del proveedor es obligatorio');
      return;
    }

    setSaving(true);

    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('fin_proveedores')
        .insert([{
          nombre: formData.nombre.trim(),
          nit: formData.nit.trim() || null,
          telefono: formData.telefono.trim() || null,
          email: formData.email.trim() || null,
          activo: true,
        }])
        .select()
        .single();

      if (error) throw error;

      // Call success callback with new vendor ID
      onSuccess(data.id);

      // Reset form and close dialog
      resetForm();
      onOpenChange(false);

    } catch (error: any) {
      onError?.(error.message || 'Error al crear el proveedor');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  const footerButtons = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleCancel}
        disabled={saving}
      >
        Cancelar
      </Button>
      <Button
        type="submit"
        disabled={saving || !formData.nombre.trim()}
        className="bg-[#73991C] hover:bg-[#5a7716] text-white"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Guardando...
          </>
        ) : (
          'Crear Proveedor'
        )}
      </Button>
    </>
  );

  return (
    <StandardDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-[#73991C]" />
          Crear Nuevo Proveedor
        </span>
      }
      description="Complete la información del proveedor para agregarlo al catálogo"
      size="sm"
      footer={footerButtons}
    >
      <form onSubmit={handleSubmit} className="space-y-4 contents">
          {/* Nombre - Required */}
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              value={formData.nombre}
              onChange={(e) => handleInputChange('nombre', e.target.value)}
              placeholder="Nombre del proveedor"
              disabled={saving}
              required
            />
          </div>

          {/* NIT - Optional */}
          <div className="space-y-2">
            <Label htmlFor="nit">NIT</Label>
            <Input
              id="nit"
              value={formData.nit}
              onChange={(e) => handleInputChange('nit', e.target.value)}
              placeholder="Número de identificación tributaria"
              disabled={saving}
            />
          </div>

          {/* Teléfono - Optional */}
          <div className="space-y-2">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              type="tel"
              value={formData.telefono}
              onChange={(e) => handleInputChange('telefono', e.target.value)}
              placeholder="Teléfono de contacto"
              disabled={saving}
            />
          </div>

          {/* Email - Optional */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="Email de contacto"
              disabled={saving}
            />
          </div>
        </form>
    </StandardDialog>
  );
}
