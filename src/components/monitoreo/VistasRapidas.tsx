// ARCHIVO: components/monitoreo/VistasRapidas.tsx
// DESCRIPCIÓN: Grid de vistas guardadas para acceso rápido a análisis frecuentes
// Propósito: Dashboard de vistas predefinidas y personalizadas del monitoreo

import { useState, useEffect } from 'react';
import {
  Eye,
  TrendingUp,
  AlertTriangle,
  MapPin,
  Calendar,
  Bookmark,
  Plus,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { formatearFecha } from '../../utils/fechas';

// ============================================
// INTERFACES
// ============================================

interface VistaRapida {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  filtros: {
    loteId?: string;
    subloteId?: string;
    plagaId?: string;
    fechaInicio?: string;
    fechaFin?: string;
    gravedadMinima?: 'Baja' | 'Media' | 'Alta';
  };
  color: string;
  ultimaActualizacion: Date;
}

interface ResumenVista {
  totalRegistros: number;
  incidenciaPromedio: number;
  tendencia: 'subiendo' | 'bajando' | 'estable';
  plagaMasCritica?: string;
}

// ============================================
// VISTAS PREDEFINIDAS
// ============================================

const VISTAS_PREDEFINIDAS: Omit<VistaRapida, 'id' | 'ultimaActualizacion'>[] = [
  {
    nombre: 'Críticos Esta Semana',
    descripcion: 'Monitoreos con gravedad alta en los últimos 7 días',
    icono: 'alert',
    filtros: {
      gravedadMinima: 'Alta',
      fechaInicio: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      fechaFin: new Date().toISOString().split('T')[0]
    },
    color: 'red'
  },
  {
    nombre: 'Tendencias Mensuales',
    descripcion: 'Evolución de todas las plagas en el último mes',
    icono: 'trending',
    filtros: {
      fechaInicio: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      fechaFin: new Date().toISOString().split('T')[0]
    },
    color: 'blue'
  },
  {
    nombre: 'Por Lote',
    descripcion: 'Vista comparativa de todos los lotes',
    icono: 'map',
    filtros: {},
    color: 'green'
  },
  {
    nombre: 'Últimos 90 Días',
    descripcion: 'Histórico trimestral completo',
    icono: 'calendar',
    filtros: {
      fechaInicio: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      fechaFin: new Date().toISOString().split('T')[0]
    },
    color: 'purple'
  }
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function VistasRapidas({ onVistaSeleccionada }: { onVistaSeleccionada: (filtros: any) => void }) {
  const [vistas, setVistas] = useState<VistaRapida[]>([]);
  const [resumenes, setResumenes] = useState<{ [key: string]: ResumenVista }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [vistaPersonalizadaVisible, setVistaPersonalizadaVisible] = useState(false);

  // ============================================
  // CARGAR VISTAS
  // ============================================

  useEffect(() => {
    cargarVistas();
  }, []);

  const cargarVistas = async () => {
    try {
      setIsLoading(true);

      // Cargar vistas guardadas del usuario (localStorage por ahora)
      const vistasGuardadas = localStorage.getItem('vistasRapidasMonitoreo');
      const vistasUsuario: VistaRapida[] = vistasGuardadas ? JSON.parse(vistasGuardadas) : [];

      // Combinar con vistas predefinidas
      const todasLasVistas: VistaRapida[] = [
        ...VISTAS_PREDEFINIDAS.map((v, index) => ({
          ...v,
          id: `predefinida-${index}`,
          ultimaActualizacion: new Date()
        })),
        ...vistasUsuario
      ];

      setVistas(todasLasVistas);

      // Cargar resúmenes para cada vista
      await cargarResumenes(todasLasVistas);

    } catch (error) {
      console.error('Error al cargar vistas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // CARGAR RESÚMENES
  // ============================================

  const cargarResumenes = async (vistas: VistaRapida[]) => {
    const supabase = getSupabase();
    const nuevosResumenes: { [key: string]: ResumenVista } = {};

    for (const vista of vistas) {
      try {
        let query = supabase
          .from('monitoreos')
          .select(`
            incidencia,
            gravedad_texto,
            plaga_enfermedad_id,
            plagas_enfermedades_catalogo!inner(nombre)
          `);

        // Aplicar filtros
        if (vista.filtros.loteId) {
          query = query.eq('lote_id', vista.filtros.loteId);
        }
        if (vista.filtros.subloteId) {
          query = query.eq('sublote_id', vista.filtros.subloteId);
        }
        if (vista.filtros.plagaId) {
          query = query.eq('plaga_enfermedad_id', vista.filtros.plagaId);
        }
        if (vista.filtros.fechaInicio) {
          query = query.gte('fecha_monitoreo', vista.filtros.fechaInicio);
        }
        if (vista.filtros.fechaFin) {
          query = query.lte('fecha_monitoreo', vista.filtros.fechaFin);
        }
        if (vista.filtros.gravedadMinima) {
          query = query.eq('gravedad_texto', vista.filtros.gravedadMinima);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Calcular resumen
        const totalRegistros = data?.length || 0;
        const incidencias = data?.map(m => parseFloat(m.incidencia) || 0) || [];
        const incidenciaPromedio = incidencias.length > 0
          ? incidencias.reduce((a, b) => a + b, 0) / incidencias.length
          : 0;

        // Determinar tendencia (simplificado)
        const tendencia: 'subiendo' | 'bajando' | 'estable' = 'estable';

        // Plaga más crítica
        const plagaCounts: { [key: string]: number } = {};
        data?.forEach((m: any) => {
          const nombre = m.plagas_enfermedades_catalogo.nombre;
          plagaCounts[nombre] = (plagaCounts[nombre] || 0) + 1;
        });
        const plagaMasCritica = Object.entries(plagaCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0];

        nuevosResumenes[vista.id] = {
          totalRegistros,
          incidenciaPromedio: Math.round(incidenciaPromedio * 10) / 10,
          tendencia,
          plagaMasCritica
        };

      } catch (error) {
        console.error(`Error al cargar resumen de vista ${vista.nombre}:`, error);
      }
    }

    setResumenes(nuevosResumenes);
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleEliminarVista = (vistaId: string) => {
    if (vistaId.startsWith('predefinida-')) {
      alert('No puedes eliminar vistas predefinidas');
      return;
    }

    const nuevasVistas = vistas.filter(v => v.id !== vistaId);
    const vistasUsuario = nuevasVistas.filter(v => !v.id.startsWith('predefinida-'));
    localStorage.setItem('vistasRapidasMonitoreo', JSON.stringify(vistasUsuario));
    setVistas(nuevasVistas);
  };

  // ============================================
  // ICONOS DINÁMICOS
  // ============================================

  const getIcono = (tipo: string) => {
    switch (tipo) {
      case 'alert': return AlertTriangle;
      case 'trending': return TrendingUp;
      case 'map': return MapPin;
      case 'calendar': return Calendar;
      default: return Eye;
    }
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'red':
        return 'bg-red-50 border-red-200 text-red-700';
      case 'blue':
        return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'green':
        return 'bg-[#73991C]/10 border-[#73991C]/20 text-[#73991C]';
      case 'purple':
        return 'bg-purple-50 border-purple-200 text-purple-700';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-700';
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bookmark className="w-6 h-6 text-[#73991C]" />
          <h2 className="text-[#172E08]">
            Vistas Rápidas
          </h2>
        </div>
        <button
          onClick={() => setVistaPersonalizadaVisible(!vistaPersonalizadaVisible)}
          className="flex items-center gap-2 px-4 py-2 bg-[#73991C] text-white rounded-lg hover:bg-[#5C7A16] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva Vista
        </button>
      </div>

      {/* GRID DE VISTAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {vistas.map((vista) => {
          const Icono = getIcono(vista.icono);
          const resumen = resumenes[vista.id];
          const colorClasses = getColorClasses(vista.color);

          return (
            <div
              key={vista.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
              onClick={() => onVistaSeleccionada(vista.filtros)}
            >
              {/* HEADER DE TARJETA */}
              <div className={`p-4 border-b ${colorClasses}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/50 rounded-lg flex items-center justify-center">
                      <Icono className="w-5 h-5" />
                    </div>
                    <div>
                      <h3>{vista.nombre}</h3>
                      <p className="opacity-75 mt-1">{vista.descripcion}</p>
                    </div>
                  </div>
                  {!vista.id.startsWith('predefinida-') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEliminarVista(vista.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* CONTENIDO */}
              {resumen && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[#4D240F]/60">Registros</span>
                    <span className="text-[#172E08]">
                      {resumen.totalRegistros}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-[#4D240F]/60">Incidencia</span>
                    <span className="text-[#172E08]">
                      {resumen.incidenciaPromedio}%
                    </span>
                  </div>

                  {resumen.plagaMasCritica && (
                    <div className="pt-3 border-t border-gray-100">
                      <p className="text-[#4D240F]/60">Más frecuente</p>
                      <p className="text-[#172E08] mt-1">
                        {resumen.plagaMasCritica}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* FOOTER */}
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[#4D240F]/60">
                <span>Actualizado: {formatearFecha(vista.ultimaActualizacion.toISOString().split('T')[0])}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cargarVistas();
                  }}
                  className="hover:text-[#73991C] transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* MENSAJE SI NO HAY VISTAS */}
      {vistas.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Bookmark className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-[#172E08]">No hay vistas guardadas</p>
          <p className="mt-2">Crea tu primera vista para acceso rápido</p>
        </div>
      )}
    </div>
  );
}
