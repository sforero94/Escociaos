import { useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StandardDialog } from '@/components/ui/standard-dialog';
import { Users, Loader2 } from 'lucide-react';

interface CompradorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (compradorId: string) => void;
  onError?: (message: string) => void;
}

export function CompradorDialog({
  open,
  onOpenChange,
  onSuccess,
  onError
}: CompradorDialogProps) {
  const [formData, setFormData] = useState({
    nombre: '',
    telefono: '',
    email: '',
  });
  const [saving, setSaving] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData({ nombre: '', telefono: '', email: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      onError?.('El nombre del comprador es obligatorio');
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await getSupabase()
        .from('fin_compradores')
        .insert([{
          nombre: formData.nombre.trim(),
          telefono: formData.telefono.trim() || null,
          email: formData.email.trim() || null,
          activo: true,
        }])
        .select()
        .single();

      if (error) throw error;

      onSuccess(data.id);
      resetForm();
      onOpenChange(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al crear el comprador';
      onError?.(message);
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
        className="bg-primary hover:bg-primary-dark text-white"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Guardando...
          </>
        ) : (
          'Crear Comprador'
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
          <Users className="w-5 h-5 text-primary" />
          Crear Nuevo Comprador
        </span>
      }
      description="Complete la informacion del comprador para agregarlo al catalogo"
      size="sm"
      footer={footerButtons}
    >
      <form onSubmit={handleSubmit} className="space-y-4 contents">
        <div className="space-y-2">
          <Label htmlFor="comprador-nombre">Nombre *</Label>
          <Input
            id="comprador-nombre"
            value={formData.nombre}
            onChange={(e) => handleInputChange('nombre', e.target.value)}
            placeholder="Nombre del comprador"
            disabled={saving}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="comprador-telefono">Telefono</Label>
          <Input
            id="comprador-telefono"
            type="tel"
            value={formData.telefono}
            onChange={(e) => handleInputChange('telefono', e.target.value)}
            placeholder="Telefono de contacto"
            disabled={saving}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="comprador-email">Email</Label>
          <Input
            id="comprador-email"
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
