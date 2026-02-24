import { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  MoreVertical,
  Building2,
  Phone,
  Mail,
  Loader2,
  X,
} from 'lucide-react';
import { getSupabase } from '../../../utils/supabase/client';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Switch } from '../../ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Label } from '../../ui/label';
import type { Proveedor } from '../../../types/finanzas';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../ui/confirm-dialog';

export function ProveedoresConfig() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProveedor, setEditingProveedor] = useState<Proveedor | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    nit: '',
    telefono: '',
    email: '',
    activo: true,
  });

  useEffect(() => {
    loadProveedores();
  }, []);

  const loadProveedores = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await getSupabase()
        .from('fin_proveedores')
        .select('*')
        .order('nombre');

      if (error) throw error;
      setProveedores(data || []);
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProveedores = proveedores.filter(proveedor =>
    proveedor.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (proveedor.nit && proveedor.nit.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleNewProveedor = () => {
    setEditingProveedor(null);
    setFormData({
      nombre: '',
      nit: '',
      telefono: '',
      email: '',
      activo: true,
    });
    setShowForm(true);
  };

  const handleEditProveedor = (proveedor: Proveedor) => {
    setEditingProveedor(proveedor);
    setFormData({
      nombre: proveedor.nombre,
      nit: proveedor.nit || '',
      telefono: proveedor.telefono || '',
      email: proveedor.email || '',
      activo: proveedor.activo,
    });
    setShowForm(true);
  };

  const handleDeleteProveedor = (proveedorId: string) => {
    setDeleteTargetId(proveedorId);
    setConfirmDeleteOpen(true);
  };

  const confirmDeleteProveedor = async () => {
    if (!deleteTargetId) return;
    try {
      const { error } = await getSupabase()
        .from('fin_proveedores')
        .delete()
        .eq('id', deleteTargetId);
      if (error) throw error;
      setProveedores(proveedores.filter(p => p.id !== deleteTargetId));
      toast.success('Proveedor eliminado exitosamente');
    } catch (error: any) {
      toast.error('Error al eliminar proveedor: ' + error.message);
    } finally {
      setDeleteTargetId(null);
    }
  };

  const handleToggleActive = async (proveedor: Proveedor) => {
    try {
      const { error } = await getSupabase()
        .from('fin_proveedores')
        .update({ activo: !proveedor.activo })
        .eq('id', proveedor.id);

      if (error) throw error;

      setProveedores(proveedores.map(p =>
        p.id === proveedor.id ? { ...p, activo: !p.activo } : p
      ));
    } catch (error: any) {
      toast.error('Error al actualizar proveedor: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      toast.error('El nombre del proveedor es obligatorio');
      return;
    }

    try {
      setSaving(true);

      const proveedorData = {
        nombre: formData.nombre.trim(),
        nit: formData.nit.trim() || null,
        telefono: formData.telefono.trim() || null,
        email: formData.email.trim() || null,
        activo: formData.activo,
      };

      if (editingProveedor) {
        // Update
        const { error } = await getSupabase()
          .from('fin_proveedores')
          .update(proveedorData)
          .eq('id', editingProveedor.id);

        if (error) throw error;

        setProveedores(proveedores.map(p =>
          p.id === editingProveedor.id ? { ...p, ...proveedorData } : p
        ));
      } else {
        // Create
        const { data, error } = await getSupabase()
          .from('fin_proveedores')
          .insert([proveedorData])
          .select()
          .single();

        if (error) throw error;

        setProveedores([...proveedores, data]);
      }

      setShowForm(false);
      setEditingProveedor(null);
    } catch (error: any) {
      toast.error('Error al guardar proveedor: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Proveedores</h2>
          <p className="text-sm text-gray-600">
            Gestiona los proveedores utilizados en los gastos
          </p>
        </div>

        <Button
          onClick={handleNewProveedor}
          className="bg-primary hover:bg-primary-dark"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Proveedor
        </Button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por nombre o NIT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredProveedores.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <Building2 className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg text-gray-900 mb-2">
              {searchQuery ? 'No se encontraron proveedores' : 'No hay proveedores registrados'}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {searchQuery
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Comienza registrando tu primer proveedor'
              }
            </p>
            {!searchQuery && (
              <Button
                onClick={handleNewProveedor}
                className="bg-primary hover:bg-primary-dark"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Proveedor
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredProveedores.map((proveedor) => (
              <div
                key={proveedor.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    {/* Status indicator */}
                    <div className={`w-3 h-3 rounded-full ${
                      proveedor.activo ? 'bg-green-500' : 'bg-gray-400'
                    }`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-gray-900 font-medium truncate">
                          {proveedor.nombre}
                        </h3>
                        {!proveedor.activo && (
                          <Badge variant="secondary" className="text-xs">
                            Inactivo
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        {proveedor.nit && (
                          <span className="flex items-center gap-1">
                            🆔 {proveedor.nit}
                          </span>
                        )}
                        {proveedor.telefono && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {proveedor.telefono}
                          </span>
                        )}
                        {proveedor.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {proveedor.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    {/* Active toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        {proveedor.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      <Switch
                        checked={proveedor.activo}
                        onCheckedChange={() => handleToggleActive(proveedor)}
                      />
                    </div>

                    {/* Menu */}
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuAbiertoId(
                            menuAbiertoId === proveedor.id ? null : proveedor.id
                          );
                          setMenuPosition({
                            top: rect.bottom + window.scrollY,
                            left: rect.left + window.scrollX - 192 + rect.width,
                          });
                        }}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>

                      {/* Dropdown menu */}
                      {menuAbiertoId === proveedor.id && menuPosition && (
                        <div
                          className="fixed w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[9999]"
                          style={{
                            top: `${menuPosition.top}px`,
                            left: `${menuPosition.left}px`,
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditProveedor(proveedor);
                              setMenuAbiertoId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                          >
                            <Edit2 className="w-4 h-4 text-gray-500" />
                            Editar
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProveedor(proveedor.id);
                              setMenuAbiertoId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            </DialogTitle>
            <DialogDescription>
              {editingProveedor
                ? 'Modifica los datos del proveedor seleccionado.'
                : 'Agrega un nuevo proveedor al catálogo.'
              }
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Nombre del proveedor"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nit">NIT</Label>
              <Input
                id="nit"
                value={formData.nit}
                onChange={(e) => setFormData(prev => ({ ...prev, nit: e.target.value }))}
                placeholder="Número de identificación tributaria"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                value={formData.telefono}
                onChange={(e) => setFormData(prev => ({ ...prev, telefono: e.target.value }))}
                placeholder="Número de teléfono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="activo"
                checked={formData.activo}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, activo: checked }))}
              />
              <Label htmlFor="activo">Proveedor activo</Label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-primary hover:bg-primary-dark"
              >
                {saving ? 'Guardando...' : (editingProveedor ? 'Actualizar' : 'Crear')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="¿Eliminar proveedor?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={confirmDeleteProveedor}
        destructive
      />
    </div>
  );
}