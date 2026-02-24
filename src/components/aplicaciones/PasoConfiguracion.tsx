import { useState, useEffect, useRef } from 'react';
import { Sprout, Calendar, MapPin, Plus, X, AlertCircle, Bug } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { formatearFecha } from '../../utils/fechas';
import { DateInput } from '../ui/date-input';
import type {
  ConfiguracionAplicacion,
  LoteSeleccionado,
  LoteCatalogo,
  TipoAplicacion,
  BlancoBiologico,
} from '../../types/aplicaciones';
import { toast } from 'sonner';

interface PasoConfiguracionProps {
  configuracion: ConfiguracionAplicacion | null;
  onUpdate: (configuracion: ConfiguracionAplicacion) => void;
}

export function PasoConfiguracion({ configuracion, onUpdate }: PasoConfiguracionProps) {
  const supabase = getSupabase();

  // Estado del formulario
  const [formData, setFormData] = useState<Partial<ConfiguracionAplicacion>>({
    nombre: configuracion?.nombre || '',
    tipo: configuracion?.tipo || 'fumigacion',
    fecha_inicio_planeada: configuracion?.fecha_inicio_planeada || '',
    fecha_fin_planeada: configuracion?.fecha_fin_planeada || '',
    fecha_recomendacion: configuracion?.fecha_recomendacion || '',
    proposito: configuracion?.proposito || '',
    agronomo_responsable: configuracion?.agronomo_responsable || '',
    blanco_biologico: configuracion?.blanco_biologico || [],
    lotes_seleccionados: configuracion?.lotes_seleccionados || [],
  });

  // Catálogo de lotes disponibles
  const [lotesCatalogo, setLotesCatalogo] = useState<LoteCatalogo[]>([]);
  const [cargandoLotes, setCargandoLotes] = useState(true);
  
  // Catálogo de blancos biológicos
  const [blancosBiologicos, setBlancosBiologicos] = useState<BlancoBiologico[]>([]);
  const [cargandoBlancos, setCargandoBlancos] = useState(true);
  
  // Búsqueda de blancos biológicos
  const [busquedaBlanco, setBusquedaBlanco] = useState('');
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  // Lote seleccionado para agregar
  const [loteAAgregar, setLoteAAgregar] = useState<string>('');

  // Búsqueda de lotes
  const [busquedaLote, setBusquedaLote] = useState<string>('');

  // Errores de validación
  const [errores, setErrores] = useState<Record<string, string>>({});

  /**
   * CARGAR LOTES DEL CATÁLOGO
   */
  useEffect(() => {
    cargarLotes();
  }, []);

  const cargarLotes = async () => {
    try {
      const { data, error } = await supabase
        .from('lotes')
        .select(
          `
          id,
          nombre,
          area_hectareas,
          arboles_grandes,
          arboles_medianos,
          arboles_pequenos,
          arboles_clonales,
          total_arboles,
          sublotes (
            id,
            nombre,
            arboles_grandes,
            arboles_medianos,
            arboles_pequenos,
            arboles_clonales,
            total_arboles
          )
        `
        )
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;

      const lotesFormateados: LoteCatalogo[] = data.map((lote) => ({
        id: lote.id,
        nombre: lote.nombre,
        area_hectareas: lote.area_hectareas,
        sublotes: lote.sublotes || [],
        conteo_arboles: {
          grandes: lote.arboles_grandes || 0,
          medianos: lote.arboles_medianos || 0,
          pequenos: lote.arboles_pequenos || 0,
          clonales: lote.arboles_clonales || 0,
          total: lote.total_arboles || 0,
        },
      }));

      // Debug: Verificar datos de lotes

      setLotesCatalogo(lotesFormateados);
    } catch (error) {
    } finally {
      setCargandoLotes(false);
    }
  };

  /**
   * CARGAR BLANCOS BIÓLOGICOS
   */
  useEffect(() => {
    cargarBlancosBiologicos();
  }, []);

  const cargarBlancosBiologicos = async () => {
    try {
      
      const { data, error } = await supabase
        .from('plagas_enfermedades_catalogo')
        .select('id, nombre, tipo, descripcion, link_info, activo')
        .eq('activo', true)
        .order('nombre');


      if (error) {
        throw error;
      }

      setBlancosBiologicos(data || []);
    } catch (error) {
      setBlancosBiologicos([]);
    } finally {
      setCargandoBlancos(false);
    }
  };

  /**
   * AGREGAR BLANCO BIOLÓGICO
   */
  const agregarBlanco = (blancoId: string) => {
    if (!formData.blanco_biologico?.includes(blancoId)) {
      setFormData((prev) => ({
        ...prev,
        blanco_biologico: [...(prev.blanco_biologico || []), blancoId],
      }));
    }
    setBusquedaBlanco('');
    setMostrarSugerencias(false);
  };

  /**
   * QUITAR BLANCO BIOLÓGICO
   */
  const quitarBlanco = (blancoId: string) => {
    setFormData((prev) => ({
      ...prev,
      blanco_biologico: (prev.blanco_biologico || []).filter((id) => id !== blancoId),
    }));
  };

  /**
   * FILTRAR BLANCOS POR BÚSQUEDA
   */
  const blancosFiltrados = blancosBiologicos.filter((blanco) => {
    // No mostrar los ya seleccionados
    if (formData.blanco_biologico?.includes(blanco.id)) return false;
    
    // Filtrar por búsqueda
    if (!busquedaBlanco.trim()) return false;
    
    const busqueda = busquedaBlanco.toLowerCase();
    return (
      blanco.nombre.toLowerCase().includes(busqueda) ||
      blanco.tipo?.toLowerCase().includes(busqueda) ||
      blanco.descripcion?.toLowerCase().includes(busqueda)
    );
  });

  /**
   * OBTENER BLANCOS SELECCIONADOS
   */
  const blancosSeleccionados = blancosBiologicos.filter((blanco) =>
    formData.blanco_biologico?.includes(blanco.id)
  );

  /**
   * AGREGAR LOTE A LA SELECCIÓN
   */
  const agregarLote = () => {
    if (!loteAAgregar) return;

    const lote = lotesCatalogo.find((l) => l.id === loteAAgregar);
    if (!lote) return;

    // Verificar que no esté ya agregado
    if (formData.lotes_seleccionados?.some((l) => l.lote_id === lote.id)) {
      toast('Este lote ya está agregado');
      return;
    }

    const nuevoLote: LoteSeleccionado = {
      lote_id: lote.id,
      nombre: lote.nombre,
      sublotes_ids: lote.sublotes.map((s) => s.id),
      area_hectareas: lote.area_hectareas,
      conteo_arboles: lote.conteo_arboles,
      // Valores por defecto para fumigación y drench (ambos usan canecas)
      calibracion_litros_arbol: (formData.tipo === 'fumigacion' || formData.tipo === 'drench') ? 20 : undefined,
      tamano_caneca: (formData.tipo === 'fumigacion' || formData.tipo === 'drench') ? 200 : undefined,
    };

    setFormData((prev) => ({
      ...prev,
      lotes_seleccionados: [...(prev.lotes_seleccionados || []), nuevoLote],
    }));

    setLoteAAgregar('');
  };

  /**
   * QUITAR LOTE DE LA SELECCIÓN
   */
  const quitarLote = (loteId: string) => {
    setFormData((prev) => ({
      ...prev,
      lotes_seleccionados: prev.lotes_seleccionados?.filter((l) => l.lote_id !== loteId),
    }));
  };

  /**
   * ACTUALIZAR CONFIGURACIÓN DE LOTE
   */
  const actualizarLote = (loteId: string, campo: string, valor: any) => {
    setFormData((prev) => ({
      ...prev,
      lotes_seleccionados: prev.lotes_seleccionados?.map((lote) =>
        lote.lote_id === loteId ? { ...lote, [campo]: valor } : lote
      ),
    }));
  };

  /**
   * VALIDAR FORMULARIO
   */
  const validar = (): boolean => {
    const nuevosErrores: Record<string, string> = {};

    if (!formData.nombre?.trim()) {
      nuevosErrores.nombre = 'El nombre es requerido';
    }

    if (!formData.fecha_inicio_planeada) {
      nuevosErrores.fecha_inicio_planeada = 'La fecha de inicio es requerida';
    }

    if (!formData.lotes_seleccionados || formData.lotes_seleccionados.length === 0) {
      nuevosErrores.lotes = 'Debes seleccionar al menos un lote';
    }

    // Validaciones específicas de fumigación
    if (formData.tipo === 'fumigacion') {
      // Validar blanco biológico solo en fumigación (OBLIGATORIO)
      if (!formData.blanco_biologico || formData.blanco_biologico.length === 0) {
        nuevosErrores.blanco_biologico = 'Debes seleccionar al menos un blanco biológico para fumigaciones';
      }

      // Validar calibración y canecas
      formData.lotes_seleccionados?.forEach((lote) => {
        if (!lote.calibracion_litros_arbol || lote.calibracion_litros_arbol <= 0) {
          nuevosErrores[`lote_${lote.lote_id}`] = 'Falta calibración';
        }
        if (!lote.tamano_caneca) {
          nuevosErrores[`lote_${lote.lote_id}`] = 'Falta tamaño de caneca';
        }
      });
    }

    // Validaciones específicas de drench (igual a fumigación pero blanco biológico OPCIONAL)
    if (formData.tipo === 'drench') {
      // Blanco biológico es opcional para drench

      // Validar calibración y canecas (igual a fumigación)
      formData.lotes_seleccionados?.forEach((lote) => {
        if (!lote.calibracion_litros_arbol || lote.calibracion_litros_arbol <= 0) {
          nuevosErrores[`lote_${lote.lote_id}`] = 'Falta calibración';
        }
        if (!lote.tamano_caneca) {
          nuevosErrores[`lote_${lote.lote_id}`] = 'Falta tamaño de caneca';
        }
      });
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  /**
   * AUTO-GUARDAR AL CAMBIAR
   */
  useEffect(() => {
    // Auto-guardar configuración válida
    if (
      formData.nombre &&
      formData.tipo &&
      formData.fecha_inicio_planeada &&
      formData.lotes_seleccionados &&
      formData.lotes_seleccionados.length > 0
    ) {
      const esValido = validar();
      if (esValido) {
        onUpdate(formData as ConfiguracionAplicacion);
      }
    }
  }, [formData]);

  /**
   * CALCULAR TOTALES
   */
  const totales =
    formData.lotes_seleccionados?.reduce(
      (acc, lote) => ({
        area: acc.area + lote.area_hectareas,
        arboles: acc.arboles + lote.conteo_arboles.total,
      }),
      { area: 0, arboles: 0 }
    ) || { area: 0, arboles: 0 };

  return (
    <div className="space-y-6">
      {/* INFORMACIÓN GENERAL */}
      <div>
        <h2 className="text-lg text-foreground mb-4">Información General</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm text-brand-brown mb-1">
              Nombre de la Aplicación *
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData((prev) => ({ ...prev, nombre: e.target.value }))}
              placeholder="Ej: Fumigación Control Trips - Nov 2025"
              className={`
                w-full px-3 py-2 border rounded-lg
                ${errores.nombre ? 'border-red-300' : 'border-gray-300'}
                focus:ring-2 focus:ring-primary/20 focus:border-primary
              `}
            />
            {errores.nombre && (
              <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errores.nombre}
              </p>
            )}
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm text-brand-brown mb-1">
              Tipo de Aplicación *
            </label>
            <select
              value={formData.tipo}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  tipo: e.target.value as TipoAplicacion,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="fumigacion">Fumigación</option>
              <option value="fertilizacion">Fertilización</option>
              <option value="drench">Drench</option>
            </select>
          </div>

          {/* Fecha Inicio Planeada */}
          <div>
            <label className="block text-sm text-brand-brown mb-1">
              Fecha Inicio Planeada *
            </label>
            <DateInput
              value={formData.fecha_inicio_planeada || ''}
              onChange={(valor) =>
                setFormData((prev) => ({ ...prev, fecha_inicio_planeada: valor }))
              }
              required
            />
            {errores.fecha_inicio_planeada && (
              <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errores.fecha_inicio_planeada}
              </p>
            )}
          </div>

          {/* Fecha Fin Planeada */}
          <div>
            <label className="block text-sm text-brand-brown mb-1">
              Fecha Fin Planeada
            </label>
            <DateInput
              value={formData.fecha_fin_planeada || ''}
              onChange={(valor) =>
                setFormData((prev) => ({ ...prev, fecha_fin_planeada: valor }))
              }
            />
          </div>

          {/* Fecha de Recomendación */}
          <div>
            <label className="block text-sm text-brand-brown mb-1">
              Fecha de Recomendación
            </label>
            <DateInput
              value={formData.fecha_recomendacion || ''}
              onChange={(valor) =>
                setFormData((prev) => ({ ...prev, fecha_recomendacion: valor }))
              }
            />
          </div>

          {/* Agrónomo */}
          <div>
            <label className="block text-sm text-brand-brown mb-1">
              Agrónomo Responsable
            </label>
            <input
              type="text"
              value={formData.agronomo_responsable}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, agronomo_responsable: e.target.value }))
              }
              placeholder="Nombre del agrónomo"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Propósito */}
          <div className="md:col-span-2">
            <label className="block text-sm text-brand-brown mb-1">
              Propósito / Observaciones
            </label>
            <textarea
              value={formData.proposito}
              onChange={(e) => setFormData((prev) => ({ ...prev, proposito: e.target.value }))}
              placeholder="Describe el objetivo de esta aplicación..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Blancos Biológicos - Solo para fumigación */}
          {formData.tipo === 'fumigacion' && (
            <div className="md:col-span-2">
              <label className="block text-sm text-brand-brown mb-2">
                Blancos Biológicos (Plagas/Enfermedades) *
              </label>
              
              {cargandoBlancos ? (
                <div className="p-4 bg-gray-50 rounded-lg text-center">
                  <p className="text-sm text-brand-brown/70">Cargando blancos biológicos...</p>
                </div>
              ) : blancosBiologicos.length === 0 ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    ⚠️ No hay blancos biológicos disponibles. Verifica la tabla en Supabase.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Input de búsqueda con sugerencias */}
                  <div className="relative">
                    <div className="relative">
                      <input
                        type="text"
                        value={busquedaBlanco}
                        onChange={(e) => {
                          setBusquedaBlanco(e.target.value);
                          setMostrarSugerencias(true);
                        }}
                        onFocus={() => setMostrarSugerencias(true)}
                        placeholder="Buscar plaga o enfermedad... (ej: trips, phytophthora)"
                        className="w-full px-4 py-2.5 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      />
                      <Bug className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-brown/50" />
                    </div>

                    {/* Sugerencias desplegables */}
                    {mostrarSugerencias && blancosFiltrados.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                        {blancosFiltrados.map((blanco) => (
                          <button
                            key={blanco.id}
                            type="button"
                            onClick={() => agregarBlanco(blanco.id)}
                            className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {blanco.tipo === 'plaga' ? '🐛' : '🍄'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-foreground font-medium">
                                  {blanco.nombre}
                                </div>
                                {blanco.descripcion && (
                                  <div className="text-xs text-brand-brown/60 truncate">
                                    {blanco.descripcion}
                                  </div>
                                )}
                                <div className="text-xs text-primary capitalize mt-0.5">
                                  {blanco.tipo}
                                </div>
                              </div>
                              <Plus className="w-4 h-4 text-primary" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Blancos seleccionados (chips/tags) */}
                  {blancosSeleccionados.length > 0 && (
                    <div className="border border-primary/30 bg-primary/5 rounded-lg p-4">
                      <div className="text-xs text-brand-brown/70 mb-2">
                        Seleccionados ({blancosSeleccionados.length}):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {blancosSeleccionados.map((blanco) => (
                          <div
                            key={blanco.id}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-primary rounded-full text-sm"
                          >
                            <span>{blanco.tipo === 'plaga' ? '🐛' : '🍄'}</span>
                            <span className="text-foreground">{blanco.nombre}</span>
                            <button
                              type="button"
                              onClick={() => quitarBlanco(blanco.id)}
                              className="ml-1 text-brand-brown/70 hover:text-red-600 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {errores.blanco_biologico && (
                <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errores.blanco_biologico}
                </p>
              )}
            </div>
          )}

          {/* Blancos Biológicos - Para drench (OPCIONAL) */}
          {formData.tipo === 'drench' && (
            <div className="md:col-span-2">
              <label className="block text-sm text-brand-brown mb-2">
                Blancos Biológicos (Plagas/Enfermedades) <span className="text-gray-400 text-xs">(Opcional)</span>
              </label>
              
              {cargandoBlancos ? (
                <div className="p-4 bg-gray-50 rounded-lg text-center">
                  <p className="text-sm text-brand-brown/70">Cargando blancos biológicos...</p>
                </div>
              ) : blancosBiologicos.length === 0 ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    ⚠️ No hay blancos biológicos disponibles. Verifica la tabla en Supabase.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Input de búsqueda con sugerencias */}
                  <div className="relative">
                    <div className="relative">
                      <input
                        type="text"
                        value={busquedaBlanco}
                        onChange={(e) => {
                          setBusquedaBlanco(e.target.value);
                          setMostrarSugerencias(true);
                        }}
                        onFocus={() => setMostrarSugerencias(true)}
                        placeholder="Buscar plaga o enfermedad... (ej: trips, phytophthora)"
                        className="w-full px-4 py-2.5 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      />
                      <Bug className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-brown/50" />
                    </div>

                    {/* Sugerencias desplegables */}
                    {mostrarSugerencias && blancosFiltrados.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                        {blancosFiltrados.map((blanco) => (
                          <button
                            key={blanco.id}
                            type="button"
                            onClick={() => agregarBlanco(blanco.id)}
                            className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {blanco.tipo === 'plaga' ? '🐛' : '🍄'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-foreground font-medium">
                                  {blanco.nombre}
                                </div>
                                {blanco.descripcion && (
                                  <div className="text-xs text-brand-brown/60 truncate">
                                    {blanco.descripcion}
                                  </div>
                                )}
                                <div className="text-xs text-primary capitalize mt-0.5">
                                  {blanco.tipo}
                                </div>
                              </div>
                              <Plus className="w-4 h-4 text-primary" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Blancos seleccionados (chips/tags) */}
                  {blancosSeleccionados.length > 0 && (
                    <div className="border border-primary/30 bg-primary/5 rounded-lg p-4">
                      <div className="text-xs text-brand-brown/70 mb-2">
                        Seleccionados ({blancosSeleccionados.length}):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {blancosSeleccionados.map((blanco) => (
                          <div
                            key={blanco.id}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-primary rounded-full text-sm"
                          >
                            <span>{blanco.tipo === 'plaga' ? '🐛' : '🍄'}</span>
                            <span className="text-foreground">{blanco.nombre}</span>
                            <button
                              type="button"
                              onClick={() => quitarBlanco(blanco.id)}
                              className="ml-1 text-brand-brown/70 hover:text-red-600 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SELECCIÓN DE LOTES */}
      <div>
        <h2 className="text-lg text-foreground mb-4">Lotes a Aplicar</h2>

        {/* Barra de búsqueda de lotes */}
        <div className="mb-4">
          <input
            type="text"
            value={busquedaLote}
            onChange={(e) => setBusquedaLote(e.target.value)}
            placeholder="Buscar lote por nombre..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            disabled={cargandoLotes}
          />
        </div>

        {/* Grid de lotes disponibles con checkboxes */}
        {cargandoLotes ? (
          <div className="p-8 bg-gray-50 rounded-lg text-center">
            <p className="text-sm text-brand-brown/70">Cargando lotes...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {lotesCatalogo
              .filter((lote) => 
                lote.nombre.toLowerCase().includes(busquedaLote.toLowerCase())
              )
              .map((lote) => {
                const yaSeleccionado = formData.lotes_seleccionados?.some((l) => l.lote_id === lote.id);

                return (
                  <button
                    key={lote.id}
                    type="button"
                    onClick={() => {
                      if (yaSeleccionado) {
                        // Quitar lote
                        quitarLote(lote.id);
                      } else {
                        // Agregar lote
                        const nuevoLote: LoteSeleccionado = {
                          lote_id: lote.id,
                          nombre: lote.nombre,
                          sublotes_ids: lote.sublotes.map((s) => s.id),
                          area_hectareas: lote.area_hectareas,
                          conteo_arboles: lote.conteo_arboles,
                          calibracion_litros_arbol: (formData.tipo === 'fumigacion' || formData.tipo === 'drench') ? 20 : undefined,
                          tamano_caneca: (formData.tipo === 'fumigacion' || formData.tipo === 'drench') ? 200 : undefined,
                        };
                        setFormData((prev) => ({
                          ...prev,
                          lotes_seleccionados: [...(prev.lotes_seleccionados || []), nuevoLote],
                        }));
                      }
                    }}
                    className={`
                      p-4 rounded-xl border-2 text-left transition-all
                      ${yaSeleccionado
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-gray-300'
                      }
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-foreground mb-1">{lote.nombre}</p>
                        <p className="text-xs text-brand-brown/70">
                          {lote.area_hectareas}ha • {lote.conteo_arboles.total} árboles
                        </p>
                      </div>
                      {yaSeleccionado && (
                        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-white flex-shrink-0">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        )}

        {errores.lotes && (
          <p className="text-red-600 text-sm mb-4 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            {errores.lotes}
          </p>
        )}

        {/* Lista de lotes seleccionados */}
        <div className="space-y-4">
          {formData.lotes_seleccionados?.map((lote) => (
            <div
              key={lote.lote_id}
              className="border border-gray-200 rounded-xl p-4 bg-gradient-to-br from-primary/5 to-secondary/5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    {lote.nombre}
                  </h3>
                  <p className="text-sm text-brand-brown/70">
                    {lote.area_hectareas} ha • {lote.conteo_arboles.total} árboles
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => quitarLote(lote.lote_id)}
                  className="text-red-600 hover:text-red-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Desglose de árboles */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center p-2 bg-white rounded-lg">
                  <div className="text-xs text-brand-brown/70">Grandes</div>
                  <div className="text-foreground">{lote.conteo_arboles.grandes}</div>
                </div>
                <div className="text-center p-2 bg-white rounded-lg">
                  <div className="text-xs text-brand-brown/70">Medianos</div>
                  <div className="text-foreground">{lote.conteo_arboles.medianos}</div>
                </div>
                <div className="text-center p-2 bg-white rounded-lg">
                  <div className="text-xs text-brand-brown/70">Pequeños</div>
                  <div className="text-foreground">{lote.conteo_arboles.pequenos}</div>
                </div>
                <div className="text-center p-2 bg-white rounded-lg">
                  <div className="text-xs text-brand-brown/70">Clonales</div>
                  <div className="text-foreground">{lote.conteo_arboles.clonales}</div>
                </div>
              </div>

              {/* Configuración específica de fumigación */}
              {formData.tipo === 'fumigacion' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-brand-brown mb-1">
                      Calibración (L/árbol)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={lote.calibracion_litros_arbol || ''}
                      onChange={(e) =>
                        actualizarLote(
                          lote.lote_id,
                          'calibracion_litros_arbol',
                          parseFloat(e.target.value)
                        )
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-brand-brown mb-1">
                      Tamaño Caneca (L)
                    </label>
                    <select
                      value={lote.tamano_caneca || 200}
                      onChange={(e) =>
                        actualizarLote(lote.lote_id, 'tamano_caneca', parseInt(e.target.value))
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value={20}>20L</option>
                      <option value={200}>200L</option>
                      <option value={500}>500L</option>
                      <option value={1000}>1000L</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Configuración específica de drench (igual a fumigación) */}
              {formData.tipo === 'drench' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-brand-brown mb-1">
                      Calibración (L/árbol)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={lote.calibracion_litros_arbol || ''}
                      onChange={(e) =>
                        actualizarLote(
                          lote.lote_id,
                          'calibracion_litros_arbol',
                          parseFloat(e.target.value)
                        )
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-brand-brown mb-1">
                      Tamaño Caneca (L)
                    </label>
                    <select
                      value={lote.tamano_caneca || 200}
                      onChange={(e) =>
                        actualizarLote(lote.lote_id, 'tamano_caneca', parseInt(e.target.value))
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value={20}>20L</option>
                      <option value={200}>200L</option>
                      <option value={500}>500L</option>
                      <option value={1000}>1000L</option>
                    </select>
                  </div>
                </div>
              )}

              {errores[`lote_${lote.lote_id}`] && (
                <p className="text-red-600 text-xs mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errores[`lote_${lote.lote_id}`]}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RESUMEN TOTALES */}
      {formData.lotes_seleccionados && formData.lotes_seleccionados.length > 0 && (
        <div className="bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 rounded-xl p-6">
          <h3 className="text-foreground mb-4">Resumen Total</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-sm text-brand-brown/70">Lotes</div>
              <div className="text-2xl text-foreground">
                {formData.lotes_seleccionados.length}
              </div>
            </div>
            <div>
              <div className="text-sm text-brand-brown/70">Área Total</div>
              <div className="text-2xl text-foreground">{totales.area.toFixed(1)} ha</div>
            </div>
            <div>
              <div className="text-sm text-brand-brown/70">Árboles</div>
              <div className="text-2xl text-foreground">{totales.arboles.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}