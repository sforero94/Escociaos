import { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Pencil, Plus, Save, X, Trash2, ChevronUp, ChevronDown, ChevronRight, ChevronDown as ChevronDownIcon } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

import type { Lote, Sublote } from '../../types/shared';

interface SubloteConLote extends Sublote {
  lote_nombre: string;
}

export function SublotesConfig() {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [sublotes, setSublotes] = useState<SubloteConLote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Sublote>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subloteToDelete, setSubloteToDelete] = useState<SubloteConLote | null>(null);
  const [expandedLotes, setExpandedLotes] = useState<Set<string>>(new Set());
  const supabase = getSupabase();

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    try {
      setLoading(true);
      
      // Cargar lotes
      const { data: lotesData, error: lotesError } = await supabase
        .from('lotes')
        .select('id, nombre, numero_orden')
        .order('numero_orden', { ascending: true, nullsFirst: false });

      if (lotesError) throw lotesError;
      setLotes(lotesData || []);

      // Expandir todos los lotes por defecto
      if (lotesData) {
        setExpandedLotes(new Set(lotesData.map(l => l.id)));
      }

      // Cargar sublotes con join a lotes
      const { data: sublotesData, error: sublotesError } = await supabase
        .from('sublotes')
        .select(`
          *,
          lotes!inner(nombre)
        `)
        .order('numero_sublote', { ascending: true, nullsFirst: false });

      if (sublotesError) throw sublotesError;
      
      // Mapear sublotes con nombre del lote
      const sublotesConLote = sublotesData?.map((s: any) => ({
        ...s,
        lote_nombre: s.lotes.nombre
      })) || [];
      
      setSublotes(sublotesConLote);
    } catch (error) {
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  }

  function toggleLoteExpansion(loteId: string) {
    setExpandedLotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(loteId)) {
        newSet.delete(loteId);
      } else {
        newSet.add(loteId);
      }
      return newSet;
    });
  }

  function iniciarEdicion(sublote: SubloteConLote) {
    setEditingId(sublote.id);
    setEditForm(sublote);
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
      lote_id: lotes[0]?.id || '',
      numero_sublote: null,
      arboles_grandes: 0,
      arboles_medianos: 0,
      arboles_pequenos: 0,
      arboles_clonales: 0,
    });
  }

  async function guardarSublote() {
    if (!editForm.nombre?.trim()) {
      toast.error('El nombre del sublote es obligatorio');
      return;
    }

    if (!editForm.lote_id) {
      toast.error('Debes seleccionar un lote');
      return;
    }

    try {
      // Excluir campos calculados/generados, el ID y campos de relación
      const { id, lote_nombre, lotes, total_arboles, ...dataToSave } = editForm as any;

      if (isCreating) {
        // Crear nuevo sublote
        const { error } = await supabase
          .from('sublotes')
          .insert([dataToSave]);

        if (error) throw error;
        toast.success('Sublote creado exitosamente');
      } else if (editingId) {
        // Actualizar sublote existente
        const { error } = await supabase
          .from('sublotes')
          .update(dataToSave)
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Sublote actualizado exitosamente');
      }

      await cargarDatos();
      cancelarEdicion();
    } catch (error: any) {
      
      // Manejar error de duplicate key
      if (error.code === '23505') {
        if (error.message?.includes('sublotes_lote_id_numero_sublote_key')) {
          toast.error(
            'Número de sublote duplicado',
            {
              description: `Ya existe un sublote con el número ${editForm.numero_sublote} en este lote. Usa un número diferente o déjalo vacío para asignación automática.`,
              duration: 6000,
            }
          );
        } else {
          toast.error('Ya existe un sublote con estos datos');
        }
      } else {
        toast.error(`Error al guardar el sublote: ${error?.message || 'Error desconocido'}`);
      }
    }
  }

  function confirmarEliminacion(sublote: SubloteConLote) {
    setSubloteToDelete(sublote);
    setDeleteDialogOpen(true);
  }

  async function eliminarSublote() {
    if (!subloteToDelete) return;

    try {
      const { error } = await supabase
        .from('sublotes')
        .delete()
        .eq('id', subloteToDelete.id);

      if (error) throw error;
      
      toast.success('Sublote eliminado exitosamente');
      await cargarDatos();
      setDeleteDialogOpen(false);
      setSubloteToDelete(null);
    } catch (error: any) {
      
      if (error.code === '23503') {
        const detalles = error.details || '';
        let tabla = 'registros';
        let solucion = 'Elimina primero los registros asociados';
        
        if (detalles.includes('monitoreos')) {
          tabla = 'registros de monitoreo';
          solucion = 'Ve a Monitoreo → Todos y filtra por este sublote, luego elimina los registros';
        } else if (detalles.includes('aplicaciones')) {
          tabla = 'aplicaciones fitosanitarias';
          solucion = 'Ve a Aplicaciones y elimina las aplicaciones que usan este sublote';
        } else if (detalles.includes('cosechas')) {
          tabla = 'registros de cosecha';
          solucion = 'Ve a Producción y elimina las cosechas de este sublote';
        }
        
        toast.error(
          `No se puede eliminar "${subloteToDelete.nombre}"`,
          {
            description: `Tiene ${tabla} asociados. ${solucion}. También puedes desactivarlo en lugar de eliminarlo.`,
            duration: 8000,
          }
        );
      } else {
        toast.error('Error al eliminar el sublote');
      }
    }
  }

  async function moverSublote(sublote: SubloteConLote, direccion: 'arriba' | 'abajo') {
    // Obtener sublotes del mismo lote ordenados
    const sublotesDelLote = sublotes
      .filter(s => s.lote_id === sublote.lote_id)
      .sort((a, b) => (a.numero_sublote || 999) - (b.numero_sublote || 999));
    
    const index = sublotesDelLote.findIndex(s => s.id === sublote.id);
    if (index === -1) return;
    
    if (direccion === 'arriba' && index === 0) return;
    if (direccion === 'abajo' && index === sublotesDelLote.length - 1) return;

    const newIndex = direccion === 'arriba' ? index - 1 : index + 1;
    const otroSublote = sublotesDelLote[newIndex];

    try {
      // Intercambiar números de orden
      const nuevoOrdenSublote = otroSublote.numero_sublote;
      const nuevoOrdenOtro = sublote.numero_sublote;

      await supabase
        .from('sublotes')
        .update({ numero_sublote: nuevoOrdenSublote })
        .eq('id', sublote.id);

      await supabase
        .from('sublotes')
        .update({ numero_sublote: nuevoOrdenOtro })
        .eq('id', otroSublote.id);

      await cargarDatos();
      toast.success('Orden actualizado');
    } catch (error) {
      toast.error('Error al cambiar el orden');
    }
  }

  function getLoteNombre(loteId: string): string {
    return lotes.find(l => l.id === loteId)?.nombre || 'Lote desconocido';
  }

  function getSublotesPorLote(loteId: string): SubloteConLote[] {
    return sublotes
      .filter(s => s.lote_id === loteId)
      .sort((a, b) => (a.numero_sublote || 999) - (b.numero_sublote || 999));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
          <p className="text-brand-brown/70">Cargando sublotes...</p>
        </div>
      </div>
    );
  }

  if (lotes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-brand-brown/70 mb-4">
          No hay lotes registrados. Primero debes crear lotes.
        </p>
        <p className="text-sm text-brand-brown/50">
          Ve a la pestaña "Lotes" para crear lotes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-foreground">Gestión de Sublotes</h2>
          <p className="text-brand-brown/70">
            Administra los {sublotes.length} sublotes del cultivo
          </p>
        </div>
        <Button
          onClick={iniciarCreacion}
          className="bg-gradient-to-br from-primary to-primary-dark hover:from-primary-dark hover:to-primary-dark"
          disabled={isCreating || editingId !== null}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Sublote
        </Button>
      </div>

      {/* Formulario de creación */}
      {isCreating && (
        <Card className="p-6 bg-gradient-to-br from-white/90 to-background/90 backdrop-blur-sm shadow-xl border-secondary/30">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground">Crear Nuevo Sublote</h3>
              <div className="flex gap-2">
                <Button
                  onClick={guardarSublote}
                  size="sm"
                  className="bg-gradient-to-br from-primary to-primary-dark"
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
              {/* Lote padre */}
              <div>
                <Label htmlFor="lote_id">Lote *</Label>
                <Select
                  value={editForm.lote_id}
                  onValueChange={(value) => setEditForm({ ...editForm, lote_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un lote" />
                  </SelectTrigger>
                  <SelectContent>
                    {lotes.map((lote) => (
                      <SelectItem key={lote.id} value={lote.id}>
                        {lote.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Nombre */}
              <div>
                <Label htmlFor="nombre">Nombre del Sublote *</Label>
                <Input
                  id="nombre"
                  value={editForm.nombre || ''}
                  onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                  placeholder="Ej: Sublote 1"
                />
              </div>

              {/* Número de sublote */}
              <div>
                <Label htmlFor="numero_sublote">Número de Sublote</Label>
                <Input
                  id="numero_sublote"
                  type="number"
                  value={editForm.numero_sublote || ''}
                  onChange={(e) => setEditForm({ ...editForm, numero_sublote: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="1, 2, 3..."
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
            </div>
          </div>
        </Card>
      )}

      {/* Lista de sublotes agrupados por lote */}
      <div className="space-y-4">
        {lotes.map((lote) => {
          const sublotesDelLote = getSublotesPorLote(lote.id);
          const isExpanded = expandedLotes.has(lote.id);

          return (
            <div key={lote.id} className="space-y-2">
              {/* Header del lote */}
              <button
                onClick={() => toggleLoteExpansion(lote.id)}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-lg hover:from-primary/20 hover:to-secondary/20 transition-all"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDownIcon className="w-5 h-5 text-primary" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-primary" />
                  )}
                  <h3 className="text-foreground">{lote.nombre}</h3>
                  <span className="px-2 py-1 text-xs rounded-full bg-primary/20 text-foreground">
                    {sublotesDelLote.length} sublote{sublotesDelLote.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>

              {/* Sublotes del lote */}
              {isExpanded && (
                <div className="space-y-2 ml-4">
                  {sublotesDelLote.length === 0 ? (
                    <div className="p-4 text-center text-brand-brown/50 text-sm bg-white/50 rounded-lg">
                      No hay sublotes en este lote
                    </div>
                  ) : (
                    sublotesDelLote.map((sublote, index) => (
                      <Card
                        key={sublote.id}
                        className="p-4 bg-gradient-to-br from-white/80 to-background/80 backdrop-blur-sm hover:shadow-lg transition-all border-secondary/20"
                      >
                        {editingId === sublote.id ? (
                          // Modo edición
                          <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-foreground">Editando: {sublote.nombre}</h4>
                              <div className="flex gap-2">
                                <Button
                                  onClick={guardarSublote}
                                  size="sm"
                                  className="bg-gradient-to-br from-primary to-primary-dark"
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
                              <div>
                                <Label htmlFor={`lote_id-${sublote.id}`}>Lote *</Label>
                                <Select
                                  value={editForm.lote_id}
                                  onValueChange={(value) => setEditForm({ ...editForm, lote_id: value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {lotes.map((l) => (
                                      <SelectItem key={l.id} value={l.id}>
                                        {l.nombre}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div>
                                <Label htmlFor={`nombre-${sublote.id}`}>Nombre *</Label>
                                <Input
                                  id={`nombre-${sublote.id}`}
                                  value={editForm.nombre || ''}
                                  onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                                />
                              </div>

                              <div>
                                <Label htmlFor={`numero_sublote-${sublote.id}`}>Número</Label>
                                <Input
                                  id={`numero_sublote-${sublote.id}`}
                                  type="number"
                                  value={editForm.numero_sublote || ''}
                                  onChange={(e) => setEditForm({ ...editForm, numero_sublote: e.target.value ? parseInt(e.target.value) : null })}
                                />
                              </div>

                              <div>
                                <Label htmlFor={`arboles_grandes-${sublote.id}`}>Árboles Grandes</Label>
                                <Input
                                  id={`arboles_grandes-${sublote.id}`}
                                  type="number"
                                  value={editForm.arboles_grandes ?? ''}
                                  onChange={(e) => setEditForm({ ...editForm, arboles_grandes: e.target.value ? parseInt(e.target.value) : null })}
                                />
                              </div>

                              <div>
                                <Label htmlFor={`arboles_medianos-${sublote.id}`}>Árboles Medianos</Label>
                                <Input
                                  id={`arboles_medianos-${sublote.id}`}
                                  type="number"
                                  value={editForm.arboles_medianos ?? ''}
                                  onChange={(e) => setEditForm({ ...editForm, arboles_medianos: e.target.value ? parseInt(e.target.value) : null })}
                                />
                              </div>

                              <div>
                                <Label htmlFor={`arboles_pequenos-${sublote.id}`}>Árboles Pequeños</Label>
                                <Input
                                  id={`arboles_pequenos-${sublote.id}`}
                                  type="number"
                                  value={editForm.arboles_pequenos ?? ''}
                                  onChange={(e) => setEditForm({ ...editForm, arboles_pequenos: e.target.value ? parseInt(e.target.value) : null })}
                                />
                              </div>

                              <div>
                                <Label htmlFor={`arboles_clonales-${sublote.id}`}>Árboles Clonales</Label>
                                <Input
                                  id={`arboles_clonales-${sublote.id}`}
                                  type="number"
                                  value={editForm.arboles_clonales ?? ''}
                                  onChange={(e) => setEditForm({ ...editForm, arboles_clonales: e.target.value ? parseInt(e.target.value) : null })}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          // Modo vista
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="text-foreground mb-2">{sublote.nombre}</h4>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <span className="text-brand-brown/60">Grandes:</span>
                                  <span className="ml-2 text-foreground">{sublote.arboles_grandes || 0}</span>
                                </div>
                                <div>
                                  <span className="text-brand-brown/60">Medianos:</span>
                                  <span className="ml-2 text-foreground">{sublote.arboles_medianos || 0}</span>
                                </div>
                                <div>
                                  <span className="text-brand-brown/60">Pequeños:</span>
                                  <span className="ml-2 text-foreground">{sublote.arboles_pequenos || 0}</span>
                                </div>
                                <div>
                                  <span className="text-brand-brown/60">Clonales:</span>
                                  <span className="ml-2 text-foreground">{sublote.arboles_clonales || 0}</span>
                                </div>
                                <div className="md:col-span-4">
                                  <span className="text-brand-brown/60">Total:</span>
                                  <span className="ml-2 text-foreground">{sublote.total_arboles || 0} árboles</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              {/* Botones de orden */}
                              <div className="flex flex-col gap-1">
                                <Button
                                  onClick={() => moverSublote(sublote, 'arriba')}
                                  size="sm"
                                  variant="outline"
                                  className="h-6 w-6 p-0"
                                  disabled={index === 0}
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </Button>
                                <Button
                                  onClick={() => moverSublote(sublote, 'abajo')}
                                  size="sm"
                                  variant="outline"
                                  className="h-6 w-6 p-0"
                                  disabled={index === sublotesDelLote.length - 1}
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </Button>
                              </div>

                              {/* Botones de acción */}
                              <Button
                                onClick={() => iniciarEdicion(sublote)}
                                size="sm"
                                variant="outline"
                                disabled={isCreating || editingId !== null}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                onClick={() => confirmarEliminacion(sublote)}
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
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar sublote?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar el sublote <strong>{subloteToDelete?.nombre}</strong> del lote <strong>{subloteToDelete?.lote_nombre}</strong>.
              Esta acción no se puede deshacer.
              {subloteToDelete?.total_arboles && subloteToDelete.total_arboles > 0 && (
                <span className="block mt-2 text-orange-600">
                  ⚠️ Este sublote tiene {subloteToDelete.total_arboles} árboles registrados.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={eliminarSublote}
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