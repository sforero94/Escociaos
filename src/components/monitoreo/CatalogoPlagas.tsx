// ARCHIVO: components/monitoreo/CatalogoPlagas.tsx
// DESCRIPCIÓN: CRUD completo para catálogo de plagas y enfermedades
// Propósito: Administración del catálogo maestro de plagas para el sistema de monitoreo

import { useState, useEffect } from 'react';
import {
  Bug,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  AlertCircle,
  Link as LinkIcon,
  Eye,
  EyeOff
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';

// ============================================
// INTERFACES
// ============================================

interface Plaga {
  id: string;
  nombre: string;
  tipo: string;
  descripcion?: string;
  link_info?: string;
  activo: boolean;
  usos?: number; // Cantidad de veces que aparece en monitoreos
  ultima_vez?: Date;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function CatalogoPlagas() {
  const [plagas, setPlagas] = useState<Plaga[]>([]);
  const [plagasFiltradas, setPlagasFiltradas] = useState<Plaga[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroActivo, setFiltroActivo] = useState<'todas' | 'activas' | 'inactivas'>('activas');

  // Modal states
  const [modalAbierto, setModalAbierto] = useState(false);
  const [plagaEditando, setPlagaEditando] = useState<Plaga | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    tipo: '',
    descripcion: '',
    link_info: '',
    activo: true
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // ============================================
  // CARGAR PLAGAS
  // ============================================

  useEffect(() => {
    cargarPlagas();
  }, []);

  const cargarPlagas = async () => {
    try {
      setIsLoading(true);
      const supabase = getSupabase();

      // Cargar plagas con conteo de usos
      const { data: plagasData, error: plagasError } = await supabase
        .from('plagas_enfermedades_catalogo')
        .select('*')
        .order('nombre', { ascending: true });

      if (plagasError) throw plagasError;

      // Cargar conteos de monitoreos
      const { data: monitoreos, error: monError } = await supabase
        .from('monitoreos')
        .select('plaga_enfermedad_id, fecha_monitoreo');

      if (monError) throw monError;

      // Procesar conteos
      const conteos: { [key: string]: { usos: number; ultimaVez: Date } } = {};
      monitoreos?.forEach((m) => {
        if (!conteos[m.plaga_enfermedad_id]) {
          conteos[m.plaga_enfermedad_id] = {
            usos: 0,
            ultimaVez: new Date(m.fecha_monitoreo)
          };
        }
        conteos[m.plaga_enfermedad_id].usos++;
        const fecha = new Date(m.fecha_monitoreo);
        if (fecha > conteos[m.plaga_enfermedad_id].ultimaVez) {
          conteos[m.plaga_enfermedad_id].ultimaVez = fecha;
        }
      });

      // Combinar datos
      const plagasConUsos: Plaga[] = (plagasData || []).map(p => ({
        ...p,
        usos: conteos[p.id]?.usos || 0,
        ultima_vez: conteos[p.id]?.ultimaVez
      }));

      setPlagas(plagasConUsos);
      aplicarFiltros(plagasConUsos, searchTerm, filtroActivo);

    } catch (error) {
      console.error('Error al cargar plagas:', error);
      setError('Error al cargar el catálogo de plagas');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // FILTROS Y BÚSQUEDA
  // ============================================

  useEffect(() => {
    aplicarFiltros(plagas, searchTerm, filtroActivo);
  }, [searchTerm, filtroActivo, plagas]);

  const aplicarFiltros = (
    todasPlagas: Plaga[],
    busqueda: string,
    filtro: 'todas' | 'activas' | 'inactivas'
  ) => {
    let resultado = [...todasPlagas];

    // Filtro por estado
    if (filtro === 'activas') {
      resultado = resultado.filter(p => p.activo);
    } else if (filtro === 'inactivas') {
      resultado = resultado.filter(p => !p.activo);
    }

    // Búsqueda por texto
    if (busqueda.trim()) {
      const termino = busqueda.toLowerCase();
      resultado = resultado.filter(
        p =>
          p.nombre.toLowerCase().includes(termino) ||
          p.tipo?.toLowerCase().includes(termino) ||
          p.descripcion?.toLowerCase().includes(termino)
      );
    }

    setPlagasFiltradas(resultado);
  };

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  const abrirModalNuevo = () => {
    setFormData({
      nombre: '',
      tipo: '',
      descripcion: '',
      link_info: '',
      activo: true
    });
    setPlagaEditando(null);
    setModalAbierto(true);
    setError(null);
  };

  const abrirModalEditar = (plaga: Plaga) => {
    setFormData({
      nombre: plaga.nombre,
      tipo: plaga.tipo || '',
      descripcion: plaga.descripcion || '',
      link_info: plaga.link_info || '',
      activo: plaga.activo
    });
    setPlagaEditando(plaga);
    setModalAbierto(true);
    setError(null);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setPlagaEditando(null);
    setError(null);
  };

  const handleGuardar = async () => {
    try {
      // Validaciones
      if (!formData.nombre.trim()) {
        setError('El nombre es obligatorio');
        return;
      }

      setGuardando(true);
      setError(null);
      const supabase = getSupabase();

      if (plagaEditando) {
        // ACTUALIZAR
        const { error: updateError } = await supabase
          .from('plagas_enfermedades_catalogo')
          .update({
            nombre: formData.nombre.trim(),
            tipo: formData.tipo.trim() || null,
            descripcion: formData.descripcion.trim() || null,
            link_info: formData.link_info.trim() || null,
            activo: formData.activo
          })
          .eq('id', plagaEditando.id);

        if (updateError) throw updateError;
      } else {
        // CREAR
        const { error: insertError } = await supabase
          .from('plagas_enfermedades_catalogo')
          .insert({
            nombre: formData.nombre.trim(),
            tipo: formData.tipo.trim() || null,
            descripcion: formData.descripcion.trim() || null,
            link_info: formData.link_info.trim() || null,
            activo: formData.activo
          });

        if (insertError) throw insertError;
      }

      // Recargar lista
      await cargarPlagas();
      cerrarModal();

    } catch (error: any) {
      console.error('Error al guardar:', error);
      if (error.code === '23505') {
        setError('Ya existe una plaga con ese nombre');
      } else {
        setError('Error al guardar. Intenta nuevamente.');
      }
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (plaga: Plaga) => {
    if (plaga.usos && plaga.usos > 0) {
      alert(
        `No puedes eliminar "${plaga.nombre}" porque tiene ${plaga.usos} registros de monitoreo asociados. Desactívala en su lugar.`
      );
      return;
    }

    if (!confirm(`¿Seguro que quieres eliminar "${plaga.nombre}"?`)) {
      return;
    }

    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('plagas_enfermedades_catalogo')
        .delete()
        .eq('id', plaga.id);

      if (error) throw error;

      await cargarPlagas();
    } catch (error) {
      console.error('Error al eliminar:', error);
      alert('Error al eliminar la plaga');
    }
  };

  const toggleActivo = async (plaga: Plaga) => {
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('plagas_enfermedades_catalogo')
        .update({ activo: !plaga.activo })
        .eq('id', plaga.id);

      if (error) throw error;

      await cargarPlagas();
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      alert('Error al cambiar el estado');
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#73991C]/10 rounded-xl flex items-center justify-center">
            <Bug className="w-6 h-6 text-[#73991C]" />
          </div>
          <div>
            <h2 className="text-[#172E08]">
              Catálogo de Plagas y Enfermedades
            </h2>
            <p className="text-[#4D240F]/60 mt-1">
              {plagasFiltradas.length} de {plagas.length} plagas
            </p>
          </div>
        </div>

        <button
          onClick={abrirModalNuevo}
          className="flex items-center gap-2 px-4 py-2 bg-[#73991C] text-white rounded-lg hover:bg-[#5C7A16] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva Plaga
        </button>
      </div>

      {/* FILTROS Y BÚSQUEDA */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Búsqueda */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, tipo o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
            />
          </div>

          {/* Filtro por estado */}
          <div className="flex gap-2">
            {(['todas', 'activas', 'inactivas'] as const).map((filtro) => (
              <button
                key={filtro}
                onClick={() => setFiltroActivo(filtro)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filtroActivo === filtro
                    ? 'bg-[#73991C] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filtro.charAt(0).toUpperCase() + filtro.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin" />
          </div>
        ) : plagasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Bug className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-[#172E08]">No se encontraron plagas</p>
            <p className="mt-2">Intenta cambiar los filtros de búsqueda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-gray-700 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-gray-700 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-center text-gray-700 uppercase tracking-wider">
                    Usos
                  </th>
                  <th className="px-6 py-3 text-center text-gray-700 uppercase tracking-wider">
                    Última Vez
                  </th>
                  <th className="px-6 py-3 text-center text-gray-700 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-gray-700 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {plagasFiltradas.map((plaga) => (
                  <tr key={plaga.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-[#172E08]">{plaga.nombre}</div>
                        {plaga.descripcion && (
                          <div className="text-[#4D240F]/60 mt-1">
                            {plaga.descripcion.substring(0, 60)}
                            {plaga.descripcion.length > 60 && '...'}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {plaga.tipo && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                          {plaga.tipo}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-[#172E08]">
                        {plaga.usos || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-[#4D240F]/60">
                      {plaga.ultima_vez
                        ? new Date(plaga.ultima_vez).toLocaleDateString('es-CO')
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleActivo(plaga)}
                        className={`flex items-center justify-center gap-1 mx-auto px-3 py-1 rounded-full transition-colors ${
                          plaga.activo
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {plaga.activo ? (
                          <>
                            <Eye className="w-3 h-3" />
                            Activa
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" />
                            Inactiva
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {plaga.link_info && (
                          <a
                            href={plaga.link_info}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Ver información"
                          >
                            <LinkIcon className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => abrirModalEditar(plaga)}
                          className="p-2 text-[#73991C] hover:bg-[#73991C]/10 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEliminar(plaga)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CREAR/EDITAR */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-[#172E08]">
                {plagaEditando ? 'Editar Plaga' : 'Nueva Plaga'}
              </h3>
              <button
                onClick={cerrarModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div>
                <label className="block text-[#172E08] mb-2">
                  Nombre de la Plaga *
                </label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
                  placeholder="Ej: Monalonion"
                />
              </div>

              <div>
                <label className="block text-[#172E08] mb-2">
                  Tipo
                </label>
                <input
                  type="text"
                  value={formData.tipo}
                  onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
                  placeholder="Ej: Plaga, Hongo, Bacteria, Virus"
                />
              </div>

              <div>
                <label className="block text-[#172E08] mb-2">
                  Descripción
                </label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
                  placeholder="Descripción breve"
                />
              </div>

              <div>
                <label className="block text-[#172E08] mb-2">
                  Link de Información
                </label>
                <input
                  type="url"
                  value={formData.link_info}
                  onChange={(e) => setFormData({ ...formData, link_info: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
                  placeholder="https://..."
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="activo"
                  checked={formData.activo}
                  onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                  className="w-4 h-4 text-[#73991C] border-gray-300 rounded focus:ring-[#73991C]"
                />
                <label htmlFor="activo" className="text-[#172E08]">
                  Plaga activa (visible en formularios)
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={cerrarModal}
                disabled={guardando}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="flex items-center gap-2 px-4 py-2 bg-[#73991C] text-white rounded-lg hover:bg-[#5C7A16] transition-colors disabled:opacity-50"
              >
                {guardando ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {plagaEditando ? 'Actualizar' : 'Crear'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
