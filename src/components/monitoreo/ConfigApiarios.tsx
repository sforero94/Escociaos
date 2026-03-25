import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Plus, Search, Edit, Trash2, MapPin } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { getSupabase } from '../../utils/supabase/client';
import { MonitoreoSubNav } from './MonitoreoSubNav';
import type { Apiario } from '../../types/monitoreo';

export function ConfigApiarios() {
  const supabase = getSupabase();
  const [apiarios, setApiarios] = useState<Apiario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Apiario | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    ubicacion: '',
    total_colmenas: 0,
    activo: true,
  });
  const [guardando, setGuardando] = useState(false);

  // Delete
  const [confirmEliminarOpen, setConfirmEliminarOpen] = useState(false);
  const [apiarioParaEliminar, setApiarioParaEliminar] = useState<Apiario | null>(null);

  useEffect(() => {
    cargarApiarios();
  }, []);

  async function cargarApiarios() {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('apiarios')
        .select('*')
        .order('nombre');

      if (error) throw error;
      setApiarios(data || []);
    } catch (error: any) {
      toast.error(`Error al cargar apiarios: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  const apiariosFiltrados = apiarios.filter(a =>
    a.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.ubicacion?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  function abrirCrear() {
    setEditando(null);
    setFormData({ nombre: '', ubicacion: '', total_colmenas: 0, activo: true });
    setModalAbierto(true);
  }

  function abrirEditar(apiario: Apiario) {
    setEditando(apiario);
    setFormData({
      nombre: apiario.nombre,
      ubicacion: apiario.ubicacion || '',
      total_colmenas: apiario.total_colmenas,
      activo: apiario.activo ?? true,
    });
    setModalAbierto(true);
  }

  async function guardar() {
    if (!formData.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (formData.total_colmenas < 0) {
      toast.error('El total de colmenas no puede ser negativo');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        ubicacion: formData.ubicacion.trim() || null,
        total_colmenas: formData.total_colmenas,
        activo: formData.activo,
      };

      if (editando) {
        const { error } = await supabase
          .from('apiarios')
          .update(payload)
          .eq('id', editando.id);
        if (error) throw error;
        toast.success('Apiario actualizado');
      } else {
        const { error } = await supabase
          .from('apiarios')
          .insert(payload);
        if (error) throw error;
        toast.success('Apiario creado');
      }

      setModalAbierto(false);
      cargarApiarios();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!apiarioParaEliminar) return;

    try {
      // Check if apiario has monitoring records
      const { count } = await supabase
        .from('mon_colmenas')
        .select('id', { count: 'exact', head: true })
        .eq('apiario_id', apiarioParaEliminar.id);

      if (count && count > 0) {
        toast.error('No se puede eliminar: tiene registros de monitoreo. Desactívalo en su lugar.');
        setConfirmEliminarOpen(false);
        return;
      }

      const { error } = await supabase
        .from('apiarios')
        .delete()
        .eq('id', apiarioParaEliminar.id);

      if (error) throw error;
      toast.success('Apiario eliminado');
      setConfirmEliminarOpen(false);
      cargarApiarios();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  }

  return (
    <div>
      <MonitoreoSubNav />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Apiarios</h2>
            <p className="text-sm text-brand-brown/60">Administra los apiarios y su capacidad de colmenas</p>
          </div>
          <Button onClick={abrirCrear} className="bg-primary hover:bg-primary-dark">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Apiario
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-brown/40" />
          <Input
            placeholder="Buscar apiario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-12 text-brand-brown/50">Cargando...</div>
        ) : apiariosFiltrados.length === 0 ? (
          <div className="text-center py-12 text-brand-brown/50">
            {searchTerm ? 'No se encontraron apiarios' : 'No hay apiarios registrados'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apiariosFiltrados.map(apiario => (
              <Card key={apiario.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-foreground">{apiario.nombre}</h3>
                    {apiario.ubicacion && (
                      <p className="text-xs text-brand-brown/60 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {apiario.ubicacion}
                      </p>
                    )}
                  </div>
                  <Badge variant={apiario.activo ? 'default' : 'secondary'}>
                    {apiario.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>

                <div className="text-sm text-brand-brown/70 mb-4">
                  <span className="font-medium text-foreground text-lg">{apiario.total_colmenas}</span> colmenas
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => abrirEditar(apiario)}>
                    <Edit className="w-3 h-3 mr-1" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => {
                      setApiarioParaEliminar(apiario);
                      setConfirmEliminarOpen(true);
                    }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Modal */}
        <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>{editando ? 'Editar Apiario' : 'Nuevo Apiario'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Nombre *</Label>
                <Input
                  value={formData.nombre}
                  onChange={(e) => setFormData(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Apiario Norte"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Ubicación</Label>
                <Input
                  value={formData.ubicacion}
                  onChange={(e) => setFormData(f => ({ ...f, ubicacion: e.target.value }))}
                  placeholder="Ej: Entrada finca, junto al río"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Total de colmenas</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.total_colmenas}
                  onChange={(e) => setFormData(f => ({ ...f, total_colmenas: parseInt(e.target.value) || 0 }))}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="mt-1"
                />
              </div>
              {editando && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.activo}
                    onChange={(e) => setFormData(f => ({ ...f, activo: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <Label>Activo</Label>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setModalAbierto(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={guardar} disabled={guardando} className="flex-1 bg-primary hover:bg-primary-dark">
                  {guardando ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirm delete */}
        <ConfirmDialog
          open={confirmEliminarOpen}
          onOpenChange={setConfirmEliminarOpen}
          onConfirm={eliminar}
          title="Eliminar apiario"
          description={`¿Estás seguro de eliminar "${apiarioParaEliminar?.nombre}"? Esta acción no se puede deshacer.`}
        />
      </div>
    </div>
  );
}
