import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card } from '../ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { toast } from 'sonner@2.0.3';
import { getSupabase } from '../../utils/supabase/client';
import { calcularIncidencia, clasificarGravedad } from '../../utils/calculosMonitoreo';

interface Lote {
  id: string;
  nombre: string;
}

interface Sublote {
  id: string;
  nombre: string;
  lote_id: string;
}

interface Plaga {
  id: string;
  nombre: string;
}

interface PlagaDetectada {
  plaga_id: string;
  plaga_nombre: string;
  arboles_afectados: number;
  individuos_encontrados: number;
}

interface RegistroMonitoreoProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const MONITORES_DISPONIBLES = ['Clara', 'Daniela', 'Angie', 'Emiliano', 'David'];
const STORAGE_KEY = 'monitoreo_session';

export function RegistroMonitoreo({ open, onClose, onSuccess }: RegistroMonitoreoProps) {
  const supabase = getSupabase();
  
  // Datos del catálogo
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [todosLosSublotes, setTodosLosSublotes] = useState<Sublote[]>([]);
  const [plagas, setPlagas] = useState<Plaga[]>([]);
  
  // Formulario - Datos del evento
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [monitores, setMonitores] = useState<string[]>([]);
  const [loteId, setLoteId] = useState<string>('');
  const [subloteId, setSubloteId] = useState<string>('');
  const [arbolesMonitoreados, setArbolesMonitoreados] = useState<number>(35);
  
  // Formulario - Plagas
  const [plagasDetectadas, setPlagasDetectadas] = useState<PlagaDetectada[]>([]);
  const [plagaSeleccionada, setPlagaSeleccionada] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  
  // UI
  const [loading, setLoading] = useState(false);
  const [mostrarSelectMonitores, setMostrarSelectMonitores] = useState(false);

  // Cargar datos al abrir
  useEffect(() => {
    if (open) {
      cargarDatos();
      restaurarSesion();
    }
  }, [open]);

  async function cargarDatos() {
    try {
      // Cargar lotes
      const { data: lotesData } = await supabase
        .from('lotes')
        .select('id, nombre')
        .eq('activo', true)
        .order('numero_orden', { ascending: true });
      
      setLotes(lotesData || []);

      // Cargar todos los sublotes
      const { data: sublotesData } = await supabase
        .from('sublotes')
        .select('id, nombre, lote_id')
        .order('numero_sublote', { ascending: true });
      
      setTodosLosSublotes(sublotesData || []);

      // Cargar plagas
      const { data: plagasData } = await supabase
        .from('plagas_enfermedades_catalogo')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      
      setPlagas(plagasData || []);
    } catch (error) {
      toast.error('Error al cargar los catálogos');
    }
  }

  function restaurarSesion() {
    try {
      const sessionStr = localStorage.getItem(STORAGE_KEY);
      if (!sessionStr) return;

      const session = JSON.parse(sessionStr);
      const hoy = new Date().toISOString().split('T')[0];

      // Solo restaurar si es el mismo día
      if (session.fecha === hoy && session.monitores?.length > 0) {
        setMonitores(session.monitores);
      } else {
        // Limpiar sesión antigua
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
    }
  }

  function guardarSesion() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fecha,
        monitores
      }));
    } catch (error) {
    }
  }

  // Filtrar sublotes por lote seleccionado
  const sublotesFiltrados = todosLosSublotes.filter(s => s.lote_id === loteId);

  // Plagas disponibles (que no estén ya agregadas)
  const plagasDisponibles = plagas.filter(
    p => !plagasDetectadas.some(pd => pd.plaga_id === p.id)
  );

  function toggleMonitor(monitor: string) {
    setMonitores(prev => 
      prev.includes(monitor)
        ? prev.filter(m => m !== monitor)
        : [...prev, monitor]
    );
  }

  function agregarPlaga() {
    if (!plagaSeleccionada) return;

    const plaga = plagas.find(p => p.id === plagaSeleccionada);
    if (!plaga) return;

    setPlagasDetectadas(prev => [...prev, {
      plaga_id: plaga.id,
      plaga_nombre: plaga.nombre,
      arboles_afectados: 0,
      individuos_encontrados: 0
    }]);

    setPlagaSeleccionada('');
  }

  function actualizarPlaga(index: number, campo: 'arboles_afectados' | 'individuos_encontrados', valor: number) {
    setPlagasDetectadas(prev => {
      const nueva = [...prev];
      nueva[index] = { ...nueva[index], [campo]: valor };
      return nueva;
    });
  }

  function eliminarPlaga(index: number) {
    setPlagasDetectadas(prev => prev.filter((_, i) => i !== index));
  }

  function validarFormulario(): boolean {
    if (!fecha) {
      toast.error('La fecha es obligatoria');
      return false;
    }

    if (monitores.length === 0) {
      toast.error('Selecciona al menos un monitor');
      return false;
    }

    if (!loteId) {
      toast.error('Selecciona un lote');
      return false;
    }

    if (!subloteId) {
      toast.error('Selecciona un sublote');
      return false;
    }

    if (!arbolesMonitoreados || arbolesMonitoreados <= 0) {
      toast.error('Los árboles monitoreados deben ser mayor a 0');
      return false;
    }

    if (plagasDetectadas.length === 0) {
      toast.error('Agrega al menos una plaga. Si no hubo detección, cierra sin guardar.');
      return false;
    }

    // Validar que cada plaga tenga datos
    for (let i = 0; i < plagasDetectadas.length; i++) {
      const plaga = plagasDetectadas[i];
      if (plaga.arboles_afectados < 0 || plaga.individuos_encontrados < 0) {
        toast.error(`Completa los datos de ${plaga.plaga_nombre}`);
        return false;
      }
    }

    return true;
  }

  async function guardar(continuarConSiguiente: boolean) {
    if (!validarFormulario()) return;

    setLoading(true);

    try {
      // Preparar monitores como string
      const monitoresStr = monitores.join(', ');

      // Crear un registro por cada plaga detectada
      const registros = plagasDetectadas.map(plaga => {
        const incidencia = calcularIncidencia(plaga.arboles_afectados, arbolesMonitoreados);
        const gravedad = clasificarGravedad(incidencia);

        return {
          fecha_monitoreo: fecha,
          lote_id: loteId,
          sublote_id: subloteId,
          plaga_enfermedad_id: plaga.plaga_id,
          arboles_monitoreados: arbolesMonitoreados,
          arboles_afectados: plaga.arboles_afectados,
          individuos_encontrados: plaga.individuos_encontrados,
          gravedad_texto: gravedad.texto,
          gravedad_numerica: gravedad.numerica,
          monitor: monitoresStr,
          observaciones: observaciones || null
        };
      });


      // Insertar en batch
      const { error } = await supabase
        .from('monitoreos')
        .insert(registros);

      if (error) throw error;

      toast.success(`✅ ${registros.length} registro${registros.length > 1 ? 's' : ''} guardado${registros.length > 1 ? 's' : ''} exitosamente`);

      if (continuarConSiguiente) {
        // Guardar sesión y preparar para siguiente
        guardarSesion();
        limpiarParaSiguiente();
      } else {
        // Cerrar modal
        limpiarFormulario();
        onSuccess?.();
        onClose();
      }

    } catch (error: any) {
      toast.error(`Error al guardar: ${error.message || 'Desconocido'}`);
    } finally {
      setLoading(false);
    }
  }

  function limpiarParaSiguiente() {
    // Mantener fecha y monitores
    // Limpiar todo lo demás
    setLoteId('');
    setSubloteId('');
    setArbolesMonitoreados(35);
    setPlagasDetectadas([]);
    setPlagaSeleccionada('');
    setObservaciones('');
  }

  function limpiarFormulario() {
    setFecha(new Date().toISOString().split('T')[0]);
    setMonitores([]);
    setLoteId('');
    setSubloteId('');
    setArbolesMonitoreados(35);
    setPlagasDetectadas([]);
    setPlagaSeleccionada('');
    setObservaciones('');
  }

  function handleClose() {
    limpiarFormulario();
    onClose();
  }

  // Cambiar lote resetea sublote
  useEffect(() => {
    setSubloteId('');
  }, [loteId]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>📊 Nuevo Registro de Monitoreo</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* FECHA */}
          <div>
            <Label htmlFor="fecha">📅 Fecha *</Label>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* MONITORES */}
          <div>
            <Label>👥 Monitores *</Label>
            <div className="mt-2 space-y-2">
              {/* Chips de monitores seleccionados */}
              {monitores.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {monitores.map(monitor => (
                    <div
                      key={monitor}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-[#73991C] text-white rounded-full text-sm"
                    >
                      {monitor}
                      <button
                        onClick={() => toggleMonitor(monitor)}
                        className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Botón para mostrar/ocultar selector */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMostrarSelectMonitores(!mostrarSelectMonitores)}
              >
                {mostrarSelectMonitores ? '▲' : '▼'} Seleccionar monitores
              </Button>

              {/* Lista de checkboxes */}
              {mostrarSelectMonitores && (
                <Card className="p-3 mt-2">
                  <div className="space-y-2">
                    {MONITORES_DISPONIBLES.map(monitor => (
                      <label
                        key={monitor}
                        className="flex items-center gap-2 cursor-pointer hover:bg-[#F8FAF5] p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={monitores.includes(monitor)}
                          onChange={() => toggleMonitor(monitor)}
                          className="w-4 h-4 text-[#73991C] rounded"
                        />
                        <span>{monitor}</span>
                      </label>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>

          {/* LOTE */}
          <div>
            <Label htmlFor="lote">🌳 Lote *</Label>
            <Select value={loteId} onValueChange={setLoteId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleccionar lote" />
              </SelectTrigger>
              <SelectContent>
                {lotes.map(lote => (
                  <SelectItem key={lote.id} value={lote.id}>
                    {lote.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* SUBLOTE */}
          <div>
            <Label htmlFor="sublote">🌿 Sublote *</Label>
            <Select 
              value={subloteId} 
              onValueChange={setSubloteId}
              disabled={!loteId}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={loteId ? "Seleccionar sublote" : "Primero selecciona un lote"} />
              </SelectTrigger>
              <SelectContent>
                {sublotesFiltrados.map(sublote => (
                  <SelectItem key={sublote.id} value={sublote.id}>
                    {sublote.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ÁRBOLES MONITOREADOS */}
          <div>
            <Label htmlFor="arboles">🔢 Árboles monitoreados *</Label>
            <Input
              id="arboles"
              type="number"
              min="1"
              value={arbolesMonitoreados}
              onChange={(e) => setArbolesMonitoreados(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
          </div>

          {/* SEPARADOR */}
          <div className="border-t border-[#BFD97D]/30 pt-4">
            <h3 className="font-semibold text-[#172E08] mb-3">🐛 Plagas Detectadas *</h3>

            {/* Selector de plagas */}
            <div className="flex gap-2 mb-4">
              <Select 
                value={plagaSeleccionada} 
                onValueChange={setPlagaSeleccionada}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Buscar plaga..." />
                </SelectTrigger>
                <SelectContent>
                  {plagasDisponibles.map(plaga => (
                    <SelectItem key={plaga.id} value={plaga.id}>
                      {plaga.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                onClick={agregarPlaga}
                disabled={!plagaSeleccionada}
                className="bg-[#73991C] hover:bg-[#5C7A16]"
              >
                <Plus className="w-4 h-4 mr-1" />
                Agregar
              </Button>
            </div>

            {/* Lista de plagas detectadas */}
            <div className="space-y-3">
              {plagasDetectadas.length === 0 ? (
                <div className="text-center py-6 text-[#4D240F]/50 text-sm">
                  💡 Si no detectaste plagas, cierra sin guardar
                </div>
              ) : (
                plagasDetectadas.map((plaga, index) => {
                  const incidencia = calcularIncidencia(plaga.arboles_afectados, arbolesMonitoreados);
                  const gravedad = clasificarGravedad(incidencia);
                  
                  return (
                    <Card key={index} className="p-4 bg-gradient-to-br from-white to-[#F8FAF5]">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-medium text-[#172E08]">🐛 {plaga.plaga_nombre}</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => eliminarPlaga(index)}
                          className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-2">
                        <div>
                          <Label className="text-xs">Árboles afectados</Label>
                          <Input
                            type="number"
                            min="0"
                            max={arbolesMonitoreados}
                            value={plaga.arboles_afectados}
                            onChange={(e) => actualizarPlaga(index, 'arboles_afectados', parseInt(e.target.value) || 0)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Individuos encontrados</Label>
                          <Input
                            type="number"
                            min="0"
                            value={plaga.individuos_encontrados}
                            onChange={(e) => actualizarPlaga(index, 'individuos_encontrados', parseInt(e.target.value) || 0)}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      {/* Preview de cálculos */}
                      {plaga.arboles_afectados > 0 && (
                        <div className="text-xs text-[#4D240F]/70 mt-2">
                          📊 Incidencia: {incidencia.toFixed(1)}% • Gravedad: <span className={`font-semibold ${
                            gravedad.texto === 'Alta' ? 'text-red-600' :
                            gravedad.texto === 'Media' ? 'text-orange-600' :
                            'text-green-600'
                          }`}>{gravedad.texto}</span>
                        </div>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          </div>

          {/* OBSERVACIONES */}
          <div>
            <Label htmlFor="observaciones">💬 Observaciones (opcional)</Label>
            <textarea
              id="observaciones"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2 border border-[#BFD97D]/30 rounded-md focus:outline-none focus:ring-2 focus:ring-[#73991C] resize-none"
              placeholder="Notas adicionales..."
            />
          </div>

          {/* BOTONES */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={loading}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => guardar(false)}
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Guardando...' : 'Guardar y cerrar'}
            </Button>
            <Button
              type="button"
              onClick={() => guardar(true)}
              disabled={loading}
              className="flex-1 bg-[#73991C] hover:bg-[#5C7A16]"
            >
              {loading ? 'Guardando...' : 'Siguiente sublote'}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
