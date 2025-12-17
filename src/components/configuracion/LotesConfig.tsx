import { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Pencil, Plus, Save, X, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface Lote {
  id: string;
  nombre: string;
  numero_orden: number | null;
  area_hectareas: number | null;
  arboles_grandes: number | null;
  arboles_medianos: number | null;
  arboles_pequenos: number | null;
  arboles_clonales: number | null;
  total_arboles: number | null;
  activo: boolean | null;
}

export function LotesConfig() {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Lote>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loteToDelete, setLoteToDelete] = useState<Lote | null>(null);
  const supabase = getSupabase();

  useEffect(() => {
    cargarLotes();
  }, []);

  async function cargarLotes() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('lotes')
        .select('*')
        .order('numero_orden', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setLotes(data || []);
    } catch (error) {
      toast.error('Error al cargar los lotes');
    } finally {
      setLoading(false);
    }
  }

  function iniciarEdicion(lote: Lote) {
    setEditingId(lote.id);
    setEditForm(lote);
    setIsCreating(false);
  }

  function cancelarEdicion() {
    setEditingId(null);
    setEditForm({});
    setIsCreating(false);
  }

  function iniciarCreacion() {
    setIsCreating(true);
    setEditingId(null);
    setEditForm({
      nombre: '',
      numero_orden: null,
      area_hectareas: null,
      arboles_grandes: 0,
      arboles_medianos: 0,
      arboles_pequenos: 0,
      arboles_clonales: 0,
      activo: true,
    });
  }

  async function guardarLote() {
    if (!editForm.nombre?.trim()) {
      toast.error('El nombre del lote es obligatorio');
      return;
    }

    try {
      // Excluir campos calculados/generados de la BD
      const { total_arboles, id, ...dataToSave } = editForm;

      if (isCreating) {
        // Crear nuevo lote
        const { data, error } = await supabase
          .from('lotes')
          .insert([dataToSave])
          .select();

        if (error) throw error;
        toast.success('Lote creado exitosamente');
      } else if (editingId) {
        // Actualizar lote existente
        const { data, error } = await supabase
          .from('lotes')
          .update(dataToSave)
          .eq('id', editingId)
          .select();

        if (error) throw error;
        toast.success('Lote actualizado exitosamente');
      } else {
        toast.error('Error: estado de edición inválido');
        return;
      }

      await cargarLotes();
      cancelarEdicion();
    } catch (error: any) {
      
      // Manejar error de duplicate key
      if (error.code === '23505') {
        if (error.message?.includes('lotes_numero_orden_key')) {
          toast.error(
            'Número de orden duplicado',
            {
              description: `Ya existe un lote con el número de orden ${editForm.numero_orden}. Usa un número diferente o déjalo vacío para asignación automática.`,
              duration: 6000,
            }
          );
        } else {
          toast.error('Ya existe un lote con estos datos');
        }
      } else {
        toast.error(`Error al guardar el lote: ${error?.message || 'Error desconocido'}`);
      }
    }
  }

  function confirmarEliminacion(lote: Lote) {
    setLoteToDelete(lote);
    setDeleteDialogOpen(true);
  }

  async function eliminarLote() {
    if (!loteToDelete) return;

    try {
      
      const { data, error } = await supabase
        .from('lotes')
        .delete()
        .eq('id', loteToDelete.id)
        .select();


      if (error) {
        throw error;
      }
      
      toast.success('Lote eliminado exitosamente');
      await cargarLotes();
      setDeleteDialogOpen(false);
      setLoteToDelete(null);
    } catch (error: any) {
      
      // Cerrar el diálogo primero
      setDeleteDialogOpen(false);
      
      // Mensaje más específico según el tipo de error
      if (error.code === '23503') {
        // Foreign key constraint - tiene registros asociados
        const detalles = error.details || '';
        let tabla = 'registros';
        let solucion = 'Elimina primero los registros asociados';
        
        // Detectar qué tabla tiene la referencia
        if (detalles.includes('monitoreos')) {
          tabla = 'registros de monitoreo';
          solucion = 'Ve a Monitoreo → Todos y elimina los registros de este lote primero';
        } else if (detalles.includes('aplicaciones_lotes')) {
          tabla = 'aplicaciones fitosanitarias';
          solucion = 'Ve a Aplicaciones y elimina las aplicaciones de este lote primero';
        } else if (detalles.includes('sublotes')) {
          tabla = 'sublotes';
          solucion = 'Ve a la pestaña Sublotes y elimina los sublotes de este lote primero';
        } else if (detalles.includes('cosechas')) {
          tabla = 'registros de cosecha';
          solucion = 'Ve a Producción y elimina las cosechas de este lote primero';
        }
        
        toast.error(
          `No se puede eliminar "${loteToDelete.nombre}"`,
          {
            description: `Tiene ${tabla} asociados. ${solucion}. También puedes desactivarlo en lugar de eliminarlo.`,
            duration: 8000,
          }
        );
      } else if (error.code === '42501') {
        toast.error('No tienes permisos para eliminar este lote.');
      } else if (error.message) {
        toast.error(`Error al eliminar: ${error.message}`);
      } else {
        toast.error('Error al eliminar el lote');
      }
      
      // Limpiar estado
      setLoteToDelete(null);
    }
  }

  async function moverLote(lote: Lote, direccion: 'arriba' | 'abajo') {
    const lotesOrdenados = [...lotes].sort((a, b) => 
      (a.numero_orden || 999) - (b.numero_orden || 999)
    );
    
    const index = lotesOrdenados.findIndex(l => l.id === lote.id);
    if (index === -1) return;
    
    if (direccion === 'arriba' && index === 0) return;
    if (direccion === 'abajo' && index === lotesOrdenados.length - 1) return;

    const newIndex = direccion === 'arriba' ? index - 1 : index + 1;
    const otroLote = lotesOrdenados[newIndex];

    try {
      // Intercambiar números de orden
      const nuevoOrdenLote = otroLote.numero_orden;
      const nuevoOrdenOtro = lote.numero_orden;

      await supabase
        .from('lotes')
        .update({ numero_orden: nuevoOrdenLote })
        .eq('id', lote.id);

      await supabase
        .from('lotes')
        .update({ numero_orden: nuevoOrdenOtro })
        .eq('id', otroLote.id);

      await cargarLotes();
      toast.success('Orden actualizado');
    } catch (error) {
      toast.error('Error al cambiar el orden');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#73991C] border-r-transparent mb-4"></div>
          <p className="text-[#4D240F]/70">Cargando lotes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[#172E08]">Gestión de Lotes</h2>
          <p className="text-[#4D240F]/70">
            Administra los {lotes.length} lotes del cultivo
          </p>
        </div>
        <Button
          onClick={iniciarCreacion}
          className="bg-gradient-to-br from-[#73991C] to-[#5c7a16] hover:from-[#5c7a16] hover:to-[#4a6112]"
          disabled={isCreating || editingId !== null}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Lote
        </Button>
      </div>

      {/* Formulario de creación */}
      {isCreating && (
        <Card className="p-6 bg-gradient-to-br from-white/90 to-[#F8FAF5]/90 backdrop-blur-sm shadow-xl border-[#BFD97D]/30">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#172E08]">Crear Nuevo Lote</h3>
              <div className="flex gap-2">
                <Button
                  onClick={guardarLote}
                  size="sm"
                  className="bg-gradient-to-br from-[#73991C] to-[#5c7a16]"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Guardar
                </Button>
                <Button
                  onClick={cancelarEdicion}
                  size="sm"
                  variant="outline"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nombre */}
              <div className="md:col-span-2">
                <Label htmlFor="nombre">Nombre del Lote *</Label>
                <Input
                  id="nombre"
                  value={editForm.nombre || ''}
                  onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                  placeholder="Ej: 1. Piedra Paula"
                />
              </div>

              {/* Número de orden */}
              <div>
                <Label htmlFor="numero_orden">Número de Orden</Label>
                <Input
                  id="numero_orden"
                  type="number"
                  value={editForm.numero_orden || ''}
                  onChange={(e) => setEditForm({ ...editForm, numero_orden: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="1, 2, 3..."
                />
              </div>

              {/* Área en hectáreas */}
              <div>
                <Label htmlFor="area_hectareas">Área (hectáreas)</Label>
                <Input
                  id="area_hectareas"
                  type="number"
                  step="0.01"
                  value={editForm.area_hectareas || ''}
                  onChange={(e) => setEditForm({ ...editForm, area_hectareas: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="5.5"
                />
              </div>

              {/* Árboles grandes */}
              <div>
                <Label htmlFor="arboles_grandes">Árboles Grandes</Label>
                <Input
                  id="arboles_grandes"
                  type="number"
                  value={editForm.arboles_grandes ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, arboles_grandes: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="0"
                />
              </div>

              {/* Árboles medianos */}
              <div>
                <Label htmlFor="arboles_medianos">Árboles Medianos</Label>
                <Input
                  id="arboles_medianos"
                  type="number"
                  value={editForm.arboles_medianos ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, arboles_medianos: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="0"
                />
              </div>

              {/* Árboles pequeños */}
              <div>
                <Label htmlFor="arboles_pequenos">Árboles Pequeños</Label>
                <Input
                  id="arboles_pequenos"
                  type="number"
                  value={editForm.arboles_pequenos ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, arboles_pequenos: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="0"
                />
              </div>

              {/* Árboles clonales */}
              <div>
                <Label htmlFor="arboles_clonales">Árboles Clonales</Label>
                <Input
                  id="arboles_clonales"
                  type="number"
                  value={editForm.arboles_clonales ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, arboles_clonales: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="0"
                />
              </div>

              {/* Activo */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="activo"
                  checked={editForm.activo ?? true}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, activo: checked })}
                />
                <Label htmlFor="activo">Lote activo</Label>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Lista de lotes */}
      <div className="space-y-3">
        {lotes.map((lote, index) => (
          <Card
            key={lote.id}
            className="p-4 bg-gradient-to-br from-white/80 to-[#F8FAF5]/80 backdrop-blur-sm hover:shadow-lg transition-all border-[#BFD97D]/20"
          >
            {editingId === lote.id ? (
              // Modo edición
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[#172E08]">Editando: {lote.nombre}</h3>
                  <div className="flex gap-2">
                    <Button
                      onClick={guardarLote}
                      size="sm"
                      className="bg-gradient-to-br from-[#73991C] to-[#5c7a16]"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Guardar
                    </Button>
                    <Button
                      onClick={cancelarEdicion}
                      size="sm"
                      variant="outline"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancelar
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor={`nombre-${lote.id}`}>Nombre del Lote *</Label>
                    <Input
                      id={`nombre-${lote.id}`}
                      value={editForm.nombre || ''}
                      onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`numero_orden-${lote.id}`}>Número de Orden</Label>
                    <Input
                      id={`numero_orden-${lote.id}`}
                      type="number"
                      value={editForm.numero_orden || ''}
                      onChange={(e) => setEditForm({ ...editForm, numero_orden: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`area_hectareas-${lote.id}`}>Área (ha)</Label>
                    <Input
                      id={`area_hectareas-${lote.id}`}
                      type="number"
                      step="0.01"
                      value={editForm.area_hectareas || ''}
                      onChange={(e) => setEditForm({ ...editForm, area_hectareas: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`arboles_grandes-${lote.id}`}>Árboles Grandes</Label>
                    <Input
                      id={`arboles_grandes-${lote.id}`}
                      type="number"
                      value={editForm.arboles_grandes ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, arboles_grandes: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`arboles_medianos-${lote.id}`}>Árboles Medianos</Label>
                    <Input
                      id={`arboles_medianos-${lote.id}`}
                      type="number"
                      value={editForm.arboles_medianos ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, arboles_medianos: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`arboles_pequenos-${lote.id}`}>Árboles Pequeños</Label>
                    <Input
                      id={`arboles_pequenos-${lote.id}`}
                      type="number"
                      value={editForm.arboles_pequenos ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, arboles_pequenos: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`arboles_clonales-${lote.id}`}>Árboles Clonales</Label>
                    <Input
                      id={`arboles_clonales-${lote.id}`}
                      type="number"
                      value={editForm.arboles_clonales ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, arboles_clonales: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`activo-${lote.id}`}
                      checked={editForm.activo ?? true}
                      onCheckedChange={(checked) => setEditForm({ ...editForm, activo: checked })}
                    />
                    <Label htmlFor={`activo-${lote.id}`}>Lote activo</Label>
                  </div>
                </div>
              </div>
            ) : (
              // Modo vista
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-[#172E08]">{lote.nombre}</h3>
                    {!lote.activo && (
                      <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">
                        Inactivo
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {lote.area_hectareas && (
                      <div>
                        <span className="text-[#4D240F]/60">Área:</span>
                        <span className="ml-2 text-[#172E08]">{lote.area_hectareas} ha</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[#4D240F]/60">Grandes:</span>
                      <span className="ml-2 text-[#172E08]">{lote.arboles_grandes || 0}</span>
                    </div>
                    <div>
                      <span className="text-[#4D240F]/60">Medianos:</span>
                      <span className="ml-2 text-[#172E08]">{lote.arboles_medianos || 0}</span>
                    </div>
                    <div>
                      <span className="text-[#4D240F]/60">Pequeños:</span>
                      <span className="ml-2 text-[#172E08]">{lote.arboles_pequenos || 0}</span>
                    </div>
                    <div>
                      <span className="text-[#4D240F]/60">Clonales:</span>
                      <span className="ml-2 text-[#172E08]">{lote.arboles_clonales || 0}</span>
                    </div>
                    <div>
                      <span className="text-[#4D240F]/60">Total:</span>
                      <span className="ml-2 text-[#172E08]">{lote.total_arboles || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {/* Botones de orden */}
                  <div className="flex flex-col gap-1">
                    <Button
                      onClick={() => moverLote(lote, 'arriba')}
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0"
                      disabled={index === 0}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </Button>
                    <Button
                      onClick={() => moverLote(lote, 'abajo')}
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0"
                      disabled={index === lotes.length - 1}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Botones de acción */}
                  <Button
                    onClick={() => iniciarEdicion(lote)}
                    size="sm"
                    variant="outline"
                    disabled={isCreating || editingId !== null}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => confirmarEliminacion(lote)}
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={isCreating || editingId !== null}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}

        {lotes.length === 0 && !isCreating && (
          <div className="text-center py-12">
            <p className="text-[#4D240F]/70 mb-4">No hay lotes registrados</p>
            <Button
              onClick={iniciarCreacion}
              className="bg-gradient-to-br from-[#73991C] to-[#5c7a16]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Crear Primer Lote
            </Button>
          </div>
        )}
      </div>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar lote?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar el lote <strong>{loteToDelete?.nombre}</strong>.
              Esta acción no se puede deshacer.
              {loteToDelete?.total_arboles && loteToDelete.total_arboles > 0 && (
                <span className="block mt-2 text-orange-600">
                  ⚠️ Este lote tiene {loteToDelete.total_arboles} árboles registrados.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={eliminarLote}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}