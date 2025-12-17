import { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  MoreVertical,
  Users,
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
import type { Comprador } from '../../../types/finanzas';

export function CompradoresConfig() {
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingComprador, setEditingComprador] = useState<Comprador | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    telefono: '',
    email: '',
    activo: true,
  });

  useEffect(() => {
    loadCompradores();
  }, []);

  const loadCompradores = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await getSupabase()
        .from('fin_compradores')
        .select('*')
        .order('nombre');

      if (error) throw error;
      setCompradores(data || []);
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCompradores = compradores.filter(comprador =>
    comprador.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (comprador.email && comprador.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleNewComprador = () => {
    setEditingComprador(null);
    setFormData({
      nombre: '',
      telefono: '',
      email: '',
      activo: true,
    });
    setShowForm(true);
  };

  const handleEditComprador = (comprador: Comprador) => {
    setEditingComprador(comprador);
    setFormData({
      nombre: comprador.nombre,
      telefono: comprador.telefono || '',
      email: comprador.email || '',
      activo: comprador.activo,
    });
    setShowForm(true);
  };

  const handleDeleteComprador = async (compradorId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este comprador?')) {
      return;
    }

    try {
      const { error } = await getSupabase()
        .from('fin_compradores')
        .delete()
        .eq('id', compradorId);

      if (error) throw error;

      setCompradores(compradores.filter(c => c.id !== compradorId));
      alert('Comprador eliminado exitosamente');
    } catch (error: any) {
      alert('Error al eliminar comprador: ' + error.message);
    }
  };

  const handleToggleActive = async (comprador: Comprador) => {
    try {
      const { error } = await getSupabase()
        .from('fin_compradores')
        .update({ activo: !comprador.activo })
        .eq('id', comprador.id);

      if (error) throw error;

      setCompradores(compradores.map(c =>
        c.id === comprador.id ? { ...c, activo: !c.activo } : c
      ));
    } catch (error: any) {
      alert('Error al actualizar comprador: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      alert('El nombre del comprador es obligatorio');
      return;
    }

    try {
      setSaving(true);

      const compradorData = {
        nombre: formData.nombre.trim(),
        telefono: formData.telefono.trim() || null,
        email: formData.email.trim() || null,
        activo: formData.activo,
      };

      if (editingComprador) {
        // Update
        const { error } = await getSupabase()
          .from('fin_compradores')
          .update(compradorData)
          .eq('id', editingComprador.id);

        if (error) throw error;

        setCompradores(compradores.map(c =>
          c.id === editingComprador.id ? { ...c, ...compradorData } : c
        ));
      } else {
        // Create
        const { data, error } = await getSupabase()
          .from('fin_compradores')
          .insert([compradorData])
          .select()
          .single();

        if (error) throw error;

        setCompradores([...compradores, data]);
      }

      setShowForm(false);
      setEditingComprador(null);
    } catch (error: any) {
      alert('Error al guardar comprador: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Compradores</h2>
          <p className="text-sm text-gray-600">
            Gestiona los compradores utilizados en los ingresos
          </p>
        </div>

        <Button
          onClick={handleNewComprador}
          className="bg-[#73991C] hover:bg-[#5a7716]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Comprador
        </Button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por nombre o email..."
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
        ) : filteredCompradores.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg text-gray-900 mb-2">
              {searchQuery ? 'No se encontraron compradores' : 'No hay compradores registrados'}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {searchQuery
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Comienza registrando tu primer comprador'
              }
            </p>
            {!searchQuery && (
              <Button
                onClick={handleNewComprador}
                className="bg-[#73991C] hover:bg-[#5a7716]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Comprador
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredCompradores.map((comprador) => (
              <div
                key={comprador.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    {/* Status indicator */}
                    <div className={`w-3 h-3 rounded-full ${
                      comprador.activo ? 'bg-green-500' : 'bg-gray-400'
                    }`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-gray-900 font-medium truncate">
                          {comprador.nombre}
                        </h3>
                        {!comprador.activo && (
                          <Badge variant="secondary" className="text-xs">
                            Inactivo
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        {comprador.telefono && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {comprador.telefono}
                          </span>
                        )}
                        {comprador.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {comprador.email}
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
                        {comprador.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      <Switch
                        checked={comprador.activo}
                        onCheckedChange={() => handleToggleActive(comprador)}
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
                            menuAbiertoId === comprador.id ? null : comprador.id
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
                      {menuAbiertoId === comprador.id && menuPosition && (
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
                              handleEditComprador(comprador);
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
                              handleDeleteComprador(comprador.id);
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
              {editingComprador ? 'Editar Comprador' : 'Nuevo Comprador'}
            </DialogTitle>
            <DialogDescription>
              {editingComprador
                ? 'Modifica los datos del comprador seleccionado.'
                : 'Agrega un nuevo comprador al catálogo.'
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
                placeholder="Nombre del comprador"
                required
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
              <Label htmlFor="activo">Comprador activo</Label>
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
                {saving ? 'Guardando...' : (editingComprador ? 'Actualizar' : 'Crear')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}