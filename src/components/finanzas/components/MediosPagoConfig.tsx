import { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  MoreVertical,
  CreditCard,
  Loader2,
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
import type { MedioPago } from '../../../types/finanzas';

export function MediosPagoConfig() {
  const [mediosPago, setMediosPago] = useState<MedioPago[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingMedioPago, setEditingMedioPago] = useState<MedioPago | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    activo: true,
  });

  useEffect(() => {
    loadMediosPago();
  }, []);

  const loadMediosPago = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await getSupabase()
        .from('fin_medios_pago')
        .select('*')
        .order('nombre');

      if (error) throw error;
      setMediosPago(data || []);
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMediosPago = mediosPago.filter(medio =>
    medio.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (medio.descripcion && medio.descripcion.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleNewMedioPago = () => {
    setEditingMedioPago(null);
    setFormData({
      nombre: '',
      descripcion: '',
      activo: true,
    });
    setShowForm(true);
  };

  const handleEditMedioPago = (medioPago: MedioPago) => {
    setEditingMedioPago(medioPago);
    setFormData({
      nombre: medioPago.nombre,
      descripcion: medioPago.descripcion || '',
      activo: medioPago.activo,
    });
    setShowForm(true);
  };

  const handleDeleteMedioPago = async (medioPagoId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este medio de pago?')) {
      return;
    }

    try {
      const { error } = await getSupabase()
        .from('fin_medios_pago')
        .delete()
        .eq('id', medioPagoId);

      if (error) throw error;

      setMediosPago(mediosPago.filter(m => m.id !== medioPagoId));
      alert('Medio de pago eliminado exitosamente');
    } catch (error: any) {
      alert('Error al eliminar medio de pago: ' + error.message);
    }
  };

  const handleToggleActive = async (medioPago: MedioPago) => {
    try {
      const { error } = await getSupabase()
        .from('fin_medios_pago')
        .update({ activo: !medioPago.activo })
        .eq('id', medioPago.id);

      if (error) throw error;

      setMediosPago(mediosPago.map(m =>
        m.id === medioPago.id ? { ...m, activo: !m.activo } : m
      ));
    } catch (error: any) {
      alert('Error al actualizar medio de pago: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      alert('El nombre del medio de pago es obligatorio');
      return;
    }

    try {
      setSaving(true);

      const medioPagoData = {
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim() || null,
        activo: formData.activo,
      };

      if (editingMedioPago) {
        // Update
        const { error } = await getSupabase()
          .from('fin_medios_pago')
          .update(medioPagoData)
          .eq('id', editingMedioPago.id);

        if (error) throw error;

        setMediosPago(mediosPago.map(m =>
          m.id === editingMedioPago.id ? { ...m, ...medioPagoData } : m
        ));
      } else {
        // Create
        const { data, error } = await getSupabase()
          .from('fin_medios_pago')
          .insert([medioPagoData])
          .select()
          .single();

        if (error) throw error;

        setMediosPago([...mediosPago, data]);
      }

      setShowForm(false);
      setEditingMedioPago(null);
    } catch (error: any) {
      alert('Error al guardar medio de pago: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Medios de Pago</h2>
          <p className="text-sm text-gray-600">
            Gestiona los medios de pago utilizados en gastos e ingresos
          </p>
        </div>

        <Button
          onClick={handleNewMedioPago}
          className="bg-[#73991C] hover:bg-[#5a7716]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Medio de Pago
        </Button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por nombre o descripción..."
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
            <Loader2 className="w-8 h-8 text-[#73991C] animate-spin" />
          </div>
        ) : filteredMediosPago.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <CreditCard className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg text-gray-900 mb-2">
              {searchQuery ? 'No se encontraron medios de pago' : 'No hay medios de pago registrados'}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {searchQuery
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Comienza registrando tu primer medio de pago'
              }
            </p>
            {!searchQuery && (
              <Button
                onClick={handleNewMedioPago}
                className="bg-[#73991C] hover:bg-[#5a7716]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Medio de Pago
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredMediosPago.map((medioPago) => (
              <div
                key={medioPago.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    {/* Status indicator */}
                    <div className={`w-3 h-3 rounded-full ${
                      medioPago.activo ? 'bg-green-500' : 'bg-gray-400'
                    }`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-gray-900 font-medium truncate">
                          {medioPago.nombre}
                        </h3>
                        {!medioPago.activo && (
                          <Badge variant="secondary" className="text-xs">
                            Inactivo
                          </Badge>
                        )}
                      </div>

                      {medioPago.descripcion && (
                        <p className="text-sm text-gray-600">
                          {medioPago.descripcion}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    {/* Active toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        {medioPago.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      <Switch
                        checked={medioPago.activo}
                        onCheckedChange={() => handleToggleActive(medioPago)}
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
                            menuAbiertoId === medioPago.id ? null : medioPago.id
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
                      {menuAbiertoId === medioPago.id && menuPosition && (
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
                              handleEditMedioPago(medioPago);
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
                              handleDeleteMedioPago(medioPago.id);
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
              {editingMedioPago ? 'Editar Medio de Pago' : 'Nuevo Medio de Pago'}
            </DialogTitle>
            <DialogDescription>
              {editingMedioPago
                ? 'Modifica los datos del medio de pago seleccionado.'
                : 'Agrega un nuevo medio de pago al catálogo.'
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
                placeholder="Ej: Efectivo, Transferencia, Tarjeta de crédito"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Input
                id="descripcion"
                value={formData.descripcion}
                onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                placeholder="Descripción opcional del medio de pago"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="activo"
                checked={formData.activo}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, activo: checked }))}
              />
              <Label htmlFor="activo">Medio de pago activo</Label>
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
                className="bg-[#73991C] hover:bg-[#5a7716]"
              >
                {saving ? 'Guardando...' : (editingMedioPago ? 'Actualizar' : 'Crear')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}