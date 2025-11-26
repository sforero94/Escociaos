// ARCHIVO: components/aplicaciones/HistorialAplicaciones.tsx
// DESCRIPCIÓN: Lista completa de aplicaciones con filtros avanzados
// Columnas: Código, Nombre, Tipo, Propósito, Fechas, Lotes, Estado
// Exportación: CSV funcional, Excel y PDF

import { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  FileText,
  Calendar,
  MapPin,
  Target,
  Eye,
  X,
  Package,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { DetalleAplicacionPage } from './DetalleAplicacionPage';

// ============================================
// INTERFACES
// ============================================

interface Aplicacion {
  id: string;
  codigo_aplicacion: string;
  nombre_aplicacion: string;
  tipo_aplicacion: 'Fumigación' | 'Fertilización' | 'Drench';
  estado: 'Calculada' | 'En ejecución' | 'Cerrada';
  proposito: string | null;
  blanco_biologico: string | null;
  fecha_inicio_planeada: string | null;
  fecha_fin_planeada: string | null;
  fecha_inicio_ejecucion: string | null;
  fecha_fin_ejecucion: string | null;
  fecha_cierre: string | null;
  agronomo_responsable: string | null;
  jornales_utilizados: number | null;
  valor_jornal: number | null;
  costo_total_insumos: number | null;
  costo_total_mano_obra: number | null;
  costo_total: number | null;
  costo_por_arbol: number | null;
  arboles_jornal: number | null;
  observaciones_cierre: string | null;
  created_at: string;
  lotes_nombres?: string;
  numero_lotes?: number;
  productos?: string[];
}

interface DetalleAplicacion {
  aplicacion: Aplicacion;
  calculos: {
    total_arboles: number;
    litros_mezcla: number;
    numero_canecas: number;
    kilos_totales: number;
    numero_bultos: number;
  };
  lotes: Array<{
    lote_nombre: string;
    total_arboles: number;
    litros_mezcla: number;
    numero_canecas: number;
    kilos_totales: number;
  }>;
  productos: Array<{
    producto_nombre: string;
    cantidad_planificada: number;
    cantidad_real: number;
    unidad: string;
    costo_unitario: number;
    costo_total: number;
  }>;
  manoObra: Array<{
    fecha: string;
    numero_jornales: number;
    valor_jornal: number;
    costo_total: number;
    observaciones: string;
  }>;
  anterior?: {
    codigo_aplicacion: string;
    costo_total: number;
    total_aplicado: number;
  };
}

interface FiltrosHistorial {
  busqueda: string;
  tipoAplicacion: 'Todos' | 'Fumigación' | 'Fertilización' | 'Drench';
  proposito: string;
  estado: 'Todos' | 'Calculada' | 'En ejecución' | 'Cerrada';
  blancoBiologico: string;
  fechaInicio: string;
  fechaFin: string;
  loteId: string;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function HistorialAplicaciones() {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(true);
  const [aplicaciones, setAplicaciones] = useState<Aplicacion[]>([]);
  const [aplicacionesFiltradas, setAplicacionesFiltradas] = useState<Aplicacion[]>([]);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [aplicacionSeleccionadaId, setAplicacionSeleccionadaId] = useState<string | null>(null);
  
  // Listas para filtros dinámicos
  const [lotes, setLotes] = useState<Array<{ id: string; nombre: string }>>([]);
  const [propositos, setPropositos] = useState<string[]>([]);
  const [blancosBiologicos, setBlancosBiologicos] = useState<string[]>([]);

  const [filtros, setFiltros] = useState<FiltrosHistorial>({
    busqueda: '',
    tipoAplicacion: 'Todos',
    proposito: 'Todos',
    estado: 'Todos',
    blancoBiologico: 'Todos',
    fechaInicio: '',
    fechaFin: '',
    loteId: 'Todos',
  });

  // ============================================
  // CARGAR DATOS
  // ============================================

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    aplicarFiltros();
  }, [filtros, aplicaciones]);

  const cargarDatos = async () => {
    try {
      setLoading(true);

      // Cargar aplicaciones con todos los campos
      const { data: aplicacionesData, error: errorAplicaciones } = await supabase
        .from('aplicaciones')
        .select(`
          id,
          codigo_aplicacion,
          nombre_aplicacion,
          tipo_aplicacion,
          estado,
          proposito,
          blanco_biologico,
          fecha_inicio_planeada,
          fecha_fin_planeada,
          fecha_inicio_ejecucion,
          fecha_fin_ejecucion,
          fecha_cierre,
          agronomo_responsable,
          jornales_utilizados,
          valor_jornal,
          costo_total_insumos,
          costo_total_mano_obra,
          costo_total,
          costo_por_arbol,
          arboles_jornal,
          observaciones_cierre,
          created_at
        `)
        .eq('estado', 'Cerrada')
        .order('created_at', { ascending: false });

      if (errorAplicaciones) {
        console.error('Error cargando aplicaciones:', errorAplicaciones);
        throw errorAplicaciones;
      }

      console.log(`✅ Total aplicaciones cargadas: ${aplicacionesData?.length || 0}`);
      console.log('📊 Estados de aplicaciones:', aplicacionesData?.map(a => ({ codigo: a.codigo_aplicacion, estado: a.estado })));

      // Cargar lotes y productos asociados a cada aplicación
      const aplicacionesEnriquecidas = await Promise.all(
        (aplicacionesData || []).map(async (app) => {
          // Obtener lotes
          const { data: lotesData } = await supabase
            .from('aplicaciones_lotes')
            .select('lote_id, lotes(nombre)')
            .eq('aplicacion_id', app.id);

          const lotes_nombres = lotesData?.map((l: any) => l.lotes.nombre).join(', ') || '-';
          const numero_lotes = lotesData?.length || 0;

          // Obtener productos (de la primera mezcla)
          const { data: mezclas } = await supabase
            .from('aplicaciones_mezclas')
            .select('id')
            .eq('aplicacion_id', app.id)
            .limit(1);

          let productos: string[] = [];
          if (mezclas && mezclas.length > 0) {
            const { data: productosData } = await supabase
              .from('aplicaciones_productos')
              .select('productos(nombre)')
              .eq('mezcla_id', mezclas[0].id);

            productos = productosData?.map((p: any) => p.productos.nombre) || [];
          }

          return {
            ...app,
            lotes_nombres,
            numero_lotes,
            productos,
          };
        })
      );

      setAplicaciones(aplicacionesEnriquecidas);

      // Cargar lotes para filtro
      const { data: lotesData } = await supabase
        .from('lotes')
        .select('id, nombre')
        .eq('activo', true)
        .order('numero_orden');

      setLotes(lotesData || []);

      // Extraer propósitos únicos
      const propositosUnicos = [
        ...new Set(aplicacionesData?.map((a) => a.proposito).filter(Boolean)),
      ];
      setPropositos(propositosUnicos as string[]);

      // Extraer blancos biológicos únicos
      const blancosUnicos = [
        ...new Set(aplicacionesData?.map((a) => a.blanco_biologico).filter(Boolean)),
      ];
      setBlancosBiologicos(blancosUnicos as string[]);
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // FILTROS
  // ============================================

  const aplicarFiltros = () => {
    let resultado = [...aplicaciones];

    // Filtro de búsqueda
    if (filtros.busqueda) {
      const busquedaLower = filtros.busqueda.toLowerCase();
      resultado = resultado.filter(
        (app) =>
          app.codigo_aplicacion?.toLowerCase().includes(busquedaLower) ||
          app.nombre_aplicacion?.toLowerCase().includes(busquedaLower) ||
          app.proposito?.toLowerCase().includes(busquedaLower) ||
          app.productos?.some(p => p.toLowerCase().includes(busquedaLower))
      );
    }

    // Filtro tipo
    if (filtros.tipoAplicacion !== 'Todos') {
      resultado = resultado.filter((app) => app.tipo_aplicacion === filtros.tipoAplicacion);
    }

    // Filtro propósito
    if (filtros.proposito !== 'Todos') {
      resultado = resultado.filter((app) => app.proposito === filtros.proposito);
    }

    // Filtro estado
    if (filtros.estado !== 'Todos') {
      resultado = resultado.filter((app) => app.estado === filtros.estado);
    }

    // Filtro blanco biológico
    if (filtros.blancoBiologico !== 'Todos') {
      resultado = resultado.filter((app) => app.blanco_biologico === filtros.blancoBiologico);
    }

    // Filtro fecha inicio
    if (filtros.fechaInicio) {
      resultado = resultado.filter(
        (app) => {
          const fecha = app.fecha_inicio_ejecucion || app.fecha_inicio_planeada;
          return fecha && fecha >= filtros.fechaInicio;
        }
      );
    }

    // Filtro fecha fin
    if (filtros.fechaFin) {
      resultado = resultado.filter(
        (app) => {
          const fecha = app.fecha_inicio_ejecucion || app.fecha_inicio_planeada;
          return fecha && fecha <= filtros.fechaFin;
        }
      );
    }

    // Filtro lote
    if (filtros.loteId !== 'Todos') {
      const nombreLote = lotes.find((l) => l.id === filtros.loteId)?.nombre;
      resultado = resultado.filter((app) => 
        app.lotes_nombres?.includes(nombreLote || '')
      );
    }

    setAplicacionesFiltradas(resultado);
  };

  const limpiarFiltros = () => {
    setFiltros({
      busqueda: '',
      tipoAplicacion: 'Todos',
      proposito: 'Todos',
      estado: 'Todos',
      blancoBiologico: 'Todos',
      fechaInicio: '',
      fechaFin: '',
      loteId: 'Todos',
    });
  };

  // ============================================
  // EXPORTACIÓN
  // ============================================

  const exportarCSV = () => {
    const headers = [
      'Código',
      'Nombre',
      'Tipo',
      'Propósito',
      'Blanco Biológico',
      'Estado',
      'Fecha Inicio',
      'Fecha Fin',
      'Lotes',
      'Productos',
    ];

    const rows = aplicacionesFiltradas.map((app) => [
      app.codigo_aplicacion || '-',
      app.nombre_aplicacion || '-',
      app.tipo_aplicacion,
      app.proposito || '-',
      app.blanco_biologico || '-',
      app.estado,
      app.fecha_inicio_ejecucion || app.fecha_inicio_planeada || '-',
      app.fecha_fin_ejecucion || app.fecha_fin_planeada || '-',
      app.lotes_nombres || '-',
      app.productos?.join(', ') || '-',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `\"${cell.toString().replace(/\"/g, '\"\"')}\"`).join(',')),
    ].join('\n');

    // Agregar BOM para UTF-8
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historial_aplicaciones_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportarExcel = () => {
    // Usar el mismo CSV pero con extensión .xls para compatibilidad básica
    exportarCSV();
  };

  const exportarPDF = () => {
    // TODO: Implementar exportación PDF con jsPDF
    alert('Exportación PDF en desarrollo. Por ahora usa CSV/Excel.');
  };

  // ============================================
  // UTILIDADES
  // ============================================

  const formatearFecha = (fecha: string | null) => {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getEstadoBadgeClass = (estado: string) => {
    switch (estado) {
      case 'Calculada':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'En ejecución':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Cerrada':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTipoBadgeClass = (tipo: string) => {
    switch (tipo) {
      case 'Fumigación':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Fertilización':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'Drench':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  // ============================================
  // RENDER
  // ============================================

  // Si hay aplicación seleccionada, mostrar página de detalle
  if (aplicacionSeleccionadaId) {
    return (
      <DetalleAplicacionPage
        aplicacionId={aplicacionSeleccionadaId}
        onVolver={() => setAplicacionSeleccionadaId(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con búsqueda y acciones */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* Búsqueda */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4D240F]/40" />
          <input
            type="text"
            placeholder="Buscar por código, nombre, propósito o producto..."
            value={filtros.busqueda}
            onChange={(e) => setFiltros({ ...filtros, busqueda: e.target.value })}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
          />
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2">
          <button
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
              mostrarFiltros
                ? 'bg-[#73991C] text-white border-[#73991C]'
                : 'bg-white text-[#172E08] border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>

          <div className="flex gap-2 border-l border-gray-200 pl-2">
            <button
              onClick={exportarCSV}
              disabled={aplicacionesFiltradas.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#172E08] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exportar CSV"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={exportarExcel}
              disabled={aplicacionesFiltradas.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#172E08] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exportar Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              onClick={exportarPDF}
              disabled={aplicacionesFiltradas.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#172E08] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exportar PDF"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Panel de filtros expandible */}
      {mostrarFiltros && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#172E08]">Filtros Avanzados</h3>
            <button
              onClick={limpiarFiltros}
              className="text-sm text-[#73991C] hover:underline flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              Limpiar filtros
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-[#172E08] mb-2">
                Tipo de Aplicación
              </label>
              <select
                value={filtros.tipoAplicacion}
                onChange={(e) =>
                  setFiltros({ ...filtros, tipoAplicacion: e.target.value as any })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
              >
                <option value="Todos">Todos</option>
                <option value="Fumigación">Fumigación</option>
                <option value="Fertilización">Fertilización</option>
                <option value="Drench">Drench</option>
              </select>
            </div>

            {/* Estado */}
            <div>
              <label className="block text-sm font-medium text-[#172E08] mb-2">Estado</label>
              <select
                value={filtros.estado}
                onChange={(e) => setFiltros({ ...filtros, estado: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
              >
                <option value="Todos">Todos</option>
                <option value="Calculada">Calculada</option>
                <option value="En ejecución">En ejecución</option>
                <option value="Cerrada">Cerrada</option>
              </select>
            </div>

            {/* Propósito */}
            <div>
              <label className="block text-sm font-medium text-[#172E08] mb-2">
                Propósito
              </label>
              <select
                value={filtros.proposito}
                onChange={(e) => setFiltros({ ...filtros, proposito: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
              >
                <option value="Todos">Todos</option>
                {propositos.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Blanco Biológico */}
            <div>
              <label className="block text-sm font-medium text-[#172E08] mb-2">
                Blanco Biológico
              </label>
              <select
                value={filtros.blancoBiologico}
                onChange={(e) =>
                  setFiltros({ ...filtros, blancoBiologico: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
              >
                <option value="Todos">Todos</option>
                {blancosBiologicos.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha Inicio */}
            <div>
              <label className="block text-sm font-medium text-[#172E08] mb-2">
                Desde
              </label>
              <input
                type="date"
                value={filtros.fechaInicio}
                onChange={(e) => setFiltros({ ...filtros, fechaInicio: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
              />
            </div>

            {/* Fecha Fin */}
            <div>
              <label className="block text-sm font-medium text-[#172E08] mb-2">Hasta</label>
              <input
                type="date"
                value={filtros.fechaFin}
                onChange={(e) => setFiltros({ ...filtros, fechaFin: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
              />
            </div>

            {/* Lote */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[#172E08] mb-2">Lote</label>
              <select
                value={filtros.loteId}
                onChange={(e) => setFiltros({ ...filtros, loteId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
              >
                <option value="Todos">Todos los lotes</option>
                {lotes.map((lote) => (
                  <option key={lote.id} value={lote.id}>
                    {lote.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Resumen de resultados */}
      <div className="flex items-center justify-between text-sm text-[#4D240F]/70">
        <span>
          Mostrando {aplicacionesFiltradas.length} de {aplicaciones.length} aplicaciones
        </span>
        {aplicacionesFiltradas.length !== aplicaciones.length && (
          <button
            onClick={limpiarFiltros}
            className="text-[#73991C] hover:underline flex items-center gap-1"
          >
            Ver todas
          </button>
        )}
      </div>

      {/* Tabla de resultados */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F8FAF5] border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#172E08] uppercase tracking-wider">
                  Aplicación
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#172E08] uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#172E08] uppercase tracking-wider">
                  Propósito
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#172E08] uppercase tracking-wider">
                  Fechas
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#172E08] uppercase tracking-wider">
                  Lotes
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#172E08] uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-[#172E08] uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {aplicacionesFiltradas.map((app) => (
                <tr key={app.id} className="hover:bg-[#F8FAF5]/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-[#172E08]">
                        {app.codigo_aplicacion}
                      </span>
                      <span className="text-sm text-[#4D240F]/70">
                        {app.nombre_aplicacion || '-'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getTipoBadgeClass(app.tipo_aplicacion)}`}>
                      {app.tipo_aplicacion}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm text-[#172E08]">{app.proposito || '-'}</span>
                      {app.blanco_biologico && (
                        <span className="text-xs text-[#4D240F]/60 flex items-center gap-1 mt-1">
                          <Target className="w-3 h-3" />
                          {app.blanco_biologico}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col text-sm">
                      {app.fecha_inicio_ejecucion || app.fecha_inicio_planeada ? (
                        <>
                          <span className="text-[#172E08]">
                            {formatearFecha(app.fecha_inicio_ejecucion || app.fecha_inicio_planeada)}
                          </span>
                          {(app.fecha_fin_ejecucion || app.fecha_fin_planeada) && (
                            <span className="text-[#4D240F]/60 text-xs">
                              al {formatearFecha(app.fecha_fin_ejecucion || app.fecha_fin_planeada)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[#4D240F]/40">Sin ejecutar</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-sm text-[#4D240F]/70">
                      <MapPin className="w-4 h-4" />
                      <span>{app.numero_lotes} lotes</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getEstadoBadgeClass(
                        app.estado
                      )}`}
                    >
                      {app.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => setAplicacionSeleccionadaId(app.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-[#73991C] hover:bg-[#73991C]/10 rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {aplicacionesFiltradas.length === 0 && (
            <div className="text-center py-12 text-[#4D240F]/60">
              <FileText className="w-16 h-16 mx-auto mb-4 text-[#4D240F]/30" />
              <p className="text-[#172E08] mb-2">No se encontraron aplicaciones</p>
              <p className="text-sm">
                {filtros.busqueda || filtros.tipoAplicacion !== 'Todos' || filtros.estado !== 'Todos'
                  ? 'Intenta ajustar los filtros de búsqueda'
                  : 'Aún no hay aplicaciones registradas'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}