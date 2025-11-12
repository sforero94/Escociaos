import { useState, useEffect } from 'react';
import { Sprout, Calendar, MapPin, Plus, X, AlertCircle } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import type {
  ConfiguracionAplicacion,
  LoteSeleccionado,
  LoteCatalogo,
  TipoAplicacion,
} from '../../types/aplicaciones';

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
    fecha_inicio: configuracion?.fecha_inicio || '',
    proposito: configuracion?.proposito || '',
    agronomo_responsable: configuracion?.agronomo_responsable || '',
    lotes_seleccionados: configuracion?.lotes_seleccionados || [],
  });

  // Catálogo de lotes disponibles
  const [lotesCatalogo, setLotesCatalogo] = useState<LoteCatalogo[]>([]);
  const [cargandoLotes, setCargandoLotes] = useState(true);

  // Lote seleccionado para agregar
  const [loteAAgregar, setLoteAAgregar] = useState<string>('');

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

      setLotesCatalogo(lotesFormateados);
    } catch (error) {
      console.error('Error cargando lotes:', error);
    } finally {
      setCargandoLotes(false);
    }
  };

  /**
   * AGREGAR LOTE A LA SELECCIÓN
   */
  const agregarLote = () => {
    if (!loteAAgregar) return;

    const lote = lotesCatalogo.find((l) => l.id === loteAAgregar);
    if (!lote) return;

    // Verificar que no esté ya agregado
    if (formData.lotes_seleccionados?.some((l) => l.lote_id === lote.id)) {
      alert('Este lote ya está agregado');
      return;
    }

    const nuevoLote: LoteSeleccionado = {
      lote_id: lote.id,
      nombre: lote.nombre,
      sublotes_ids: lote.sublotes.map((s) => s.id),
      area_hectareas: lote.area_hectareas,
      conteo_arboles: lote.conteo_arboles,
      // Valores por defecto para fumigación
      calibracion_litros_arbol: formData.tipo === 'fumigacion' ? 20 : undefined,
      tamano_caneca: formData.tipo === 'fumigacion' ? 200 : undefined,
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

    if (!formData.fecha_inicio) {
      nuevosErrores.fecha_inicio = 'La fecha de inicio es requerida';
    }

    if (!formData.lotes_seleccionados || formData.lotes_seleccionados.length === 0) {
      nuevosErrores.lotes = 'Debes seleccionar al menos un lote';
    }

    // Validaciones específicas de fumigación
    if (formData.tipo === 'fumigacion') {
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
      formData.fecha_inicio &&
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
        <h2 className="text-lg text-[#172E08] mb-4">Información General</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm text-[#4D240F] mb-1">
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
                focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]
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
            <label className="block text-sm text-[#4D240F] mb-1">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
            >
              <option value="fumigacion">Fumigación</option>
              <option value="fertilizacion">Fertilización</option>
            </select>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-sm text-[#4D240F] mb-1">
              Fecha Estimada de Inicio *
            </label>
            <input
              type="date"
              value={formData.fecha_inicio}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, fecha_inicio: e.target.value }))
              }
              className={`
                w-full px-3 py-2 border rounded-lg
                ${errores.fecha_inicio ? 'border-red-300' : 'border-gray-300'}
                focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]
              `}
            />
            {errores.fecha_inicio && (
              <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errores.fecha_inicio}
              </p>
            )}
          </div>

          {/* Agrónomo */}
          <div>
            <label className="block text-sm text-[#4D240F] mb-1">
              Agrónomo Responsable
            </label>
            <input
              type="text"
              value={formData.agronomo_responsable}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, agronomo_responsable: e.target.value }))
              }
              placeholder="Nombre del agrónomo"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
            />
          </div>

          {/* Propósito */}
          <div className="md:col-span-2">
            <label className="block text-sm text-[#4D240F] mb-1">
              Propósito / Observaciones
            </label>
            <textarea
              value={formData.proposito}
              onChange={(e) => setFormData((prev) => ({ ...prev, proposito: e.target.value }))}
              placeholder="Describe el objetivo de esta aplicación..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
            />
          </div>
        </div>
      </div>

      {/* SELECCIÓN DE LOTES */}
      <div>
        <h2 className="text-lg text-[#172E08] mb-4">Lotes a Aplicar</h2>

        {/* Selector para agregar lotes */}
        <div className="flex gap-2 mb-4">
          <select
            value={loteAAgregar}
            onChange={(e) => setLoteAAgregar(e.target.value)}
            disabled={cargandoLotes}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
          >
            <option value="">
              {cargandoLotes ? 'Cargando lotes...' : 'Selecciona un lote'}
            </option>
            {lotesCatalogo
              .filter((lote) => !formData.lotes_seleccionados?.some((l) => l.lote_id === lote.id))
              .map((lote) => (
                <option key={lote.id} value={lote.id}>
                  {lote.nombre} - {lote.area_hectareas}ha - {lote.conteo_arboles.total} árboles
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={agregarLote}
            disabled={!loteAAgregar}
            className="px-4 py-2 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-lg hover:from-[#5f7d17] hover:to-[#9db86d] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Agregar
          </button>
        </div>

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
              className="border border-gray-200 rounded-xl p-4 bg-gradient-to-br from-[#73991C]/5 to-[#BFD97D]/5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-[#172E08] flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#73991C]" />
                    {lote.nombre}
                  </h3>
                  <p className="text-sm text-[#4D240F]/70">
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
                  <div className="text-xs text-[#4D240F]/70">Grandes</div>
                  <div className="text-[#172E08]">{lote.conteo_arboles.grandes}</div>
                </div>
                <div className="text-center p-2 bg-white rounded-lg">
                  <div className="text-xs text-[#4D240F]/70">Medianos</div>
                  <div className="text-[#172E08]">{lote.conteo_arboles.medianos}</div>
                </div>
                <div className="text-center p-2 bg-white rounded-lg">
                  <div className="text-xs text-[#4D240F]/70">Pequeños</div>
                  <div className="text-[#172E08]">{lote.conteo_arboles.pequenos}</div>
                </div>
                <div className="text-center p-2 bg-white rounded-lg">
                  <div className="text-xs text-[#4D240F]/70">Clonales</div>
                  <div className="text-[#172E08]">{lote.conteo_arboles.clonales}</div>
                </div>
              </div>

              {/* Configuración específica de fumigación */}
              {formData.tipo === 'fumigacion' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#4D240F] mb-1">
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
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#4D240F] mb-1">
                      Tamaño Caneca (L)
                    </label>
                    <select
                      value={lote.tamano_caneca || 200}
                      onChange={(e) =>
                        actualizarLote(lote.lote_id, 'tamano_caneca', parseInt(e.target.value))
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
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
        <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 border border-[#73991C]/20 rounded-xl p-6">
          <h3 className="text-[#172E08] mb-4">Resumen Total</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-sm text-[#4D240F]/70">Lotes</div>
              <div className="text-2xl text-[#172E08]">
                {formData.lotes_seleccionados.length}
              </div>
            </div>
            <div>
              <div className="text-sm text-[#4D240F]/70">Área Total</div>
              <div className="text-2xl text-[#172E08]">{totales.area.toFixed(1)} ha</div>
            </div>
            <div>
              <div className="text-sm text-[#4D240F]/70">Árboles</div>
              <div className="text-2xl text-[#172E08]">{totales.arboles.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}