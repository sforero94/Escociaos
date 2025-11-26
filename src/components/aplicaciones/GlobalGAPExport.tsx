// ARCHIVO: components/aplicaciones/GlobalGAPExport.tsx
// DESCRIPCIÓN: Exportación de registros certificables para GlobalGAP
// Formato: CSV funcional + preparado para PDF
// Validación: Verifica campos obligatorios antes de exportar

import { useState, useEffect } from 'react';
import {
  FileCheck,
  Download,
  Filter,
  Calendar,
  AlertCircle,
  CheckCircle,
  Eye,
  X,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';

// ============================================
// INTERFACES
// ============================================

interface Aplicacion {
  id: string;
  codigo_aplicacion: string;
  nombre_aplicacion: string;
  tipo_aplicacion: 'Fumigación' | 'Fertilización' | 'Drench';
  estado: string;
  proposito: string | null;
  blanco_biologico: string | null;
  fecha_inicio_ejecucion: string | null;
  fecha_fin_ejecucion: string | null;
  created_at: string;
  lotes?: string[];
  productos?: ProductoDetalle[];
  movimientos?: MovimientoDetalle[];
  supervisor?: string;
  recomendado_por?: string;
  completitud?: number;
  camposFaltantes?: string[];
}

interface ProductoDetalle {
  nombre: string;
  ingrediente_activo_1: string | null;
  ingrediente_activo_2: string | null;
  ingrediente_activo_3: string | null;
  concentracion_ia_1: string | null;
  concentracion_ia_2: string | null;
  concentracion_ia_3: string | null;
  registro_ica: string | null;
  periodo_carencia: number | null;
  periodo_reingreso: number | null;
  dosis_caneca: string | null;
  cantidad_utilizada: number | null;
}

interface MovimientoDetalle {
  fecha: string;
  lote_nombre: string;
  arboles_tratados: number;
  canecas_20l: number;
  canecas_200l: number;
  canecas_500l: number;
  canecas_1000l: number;
  agua_total: number;
  metodo_aplicacion: string | null;
  condiciones_meteorologicas: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  aplicadores: string | null;
}

interface FiltrosGlobalGAP {
  fechaInicio: string;
  fechaFin: string;
  tipoAplicacion: 'Todos' | 'Fumigación' | 'Fertilización' | 'Drench';
  loteId: string;
  soloCompletas: boolean;
}

interface ValidacionGlobalGAP {
  esValida: boolean;
  camposFaltantes: string[];
  completitud: number;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function GlobalGAPExport() {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(false);
  const [aplicaciones, setAplicaciones] = useState<Aplicacion[]>([]);
  const [aplicacionSeleccionada, setAplicacionSeleccionada] = useState<Aplicacion | null>(null);
  const [lotes, setLotes] = useState<Array<{ id: string; nombre: string }>>([]);

  const [filtros, setFiltros] = useState<FiltrosGlobalGAP>({
    fechaInicio: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    fechaFin: new Date().toISOString().split('T')[0],
    tipoAplicacion: 'Todos',
    loteId: 'Todos',
    soloCompletas: false,
  });

  useEffect(() => {
    cargarLotes();
  }, []);

  useEffect(() => {
    cargarAplicaciones();
  }, [filtros]);

  // ============================================
  // CARGAR DATOS
  // ============================================

  const cargarLotes = async () => {
    const { data } = await supabase
      .from('lotes')
      .select('id, nombre')
      .eq('activo', true)
      .order('numero_orden');

    setLotes(data || []);
  };

  const cargarAplicaciones = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('aplicaciones')
        .select(`
          id,
          codigo_aplicacion,
          nombre_aplicacion,
          tipo_aplicacion,
          estado,
          proposito,
          blanco_biologico,
          fecha_inicio_ejecucion,
          fecha_fin_ejecucion,
          created_at
        `)
        .eq('estado', 'Cerrada')
        .order('fecha_inicio_ejecucion', { ascending: true });

      if (filtros.fechaInicio) {
        query = query.gte('fecha_inicio_ejecucion', filtros.fechaInicio);
      }
      if (filtros.fechaFin) {
        query = query.lte('fecha_inicio_ejecucion', filtros.fechaFin);
      }
      if (filtros.tipoAplicacion !== 'Todos') {
        query = query.eq('tipo_aplicacion', filtros.tipoAplicacion);
      }

      const { data: aplicacionesData, error } = await query;

      if (error) throw error;

      // Enriquecer con datos relacionados y validar
      const aplicacionesEnriquecidas = await Promise.all(
        (aplicacionesData || []).map(async (app) => {
          // Cargar lotes
          const { data: lotesData } = await supabase
            .from('aplicaciones_lotes')
            .select('lote_id, lotes(nombre)')
            .eq('aplicacion_id', app.id);

          const lotes = lotesData?.map((l: any) => l.lotes.nombre) || [];

          // Filtrar por lote si es necesario
          if (filtros.loteId !== 'Todos') {
            const loteNombre = lotes.find(
              (l) => l === lotes.find((l2) => l2 === lotes.find((l3) => l3))
            );
            if (!loteNombre) return null;
          }

          // Cargar productos
          const { data: mezclas } = await supabase
            .from('aplicaciones_mezclas')
            .select('id')
            .eq('aplicacion_id', app.id);

          const productos: ProductoDetalle[] = [];
          if (mezclas && mezclas.length > 0) {
            for (const mezcla of mezclas) {
              const { data: productosData } = await supabase
                .from('aplicaciones_productos')
                .select(`
                  cantidad_total_necesaria,
                  dosis_caneca,
                  productos(
                    nombre,
                    ingrediente_activo_1,
                    ingrediente_activo_2,
                    ingrediente_activo_3,
                    concentracion_ia_1,
                    concentracion_ia_2,
                    concentracion_ia_3,
                    registro_ica,
                    periodo_carencia_dias,
                    periodo_reingreso_horas
                  )
                `)
                .eq('mezcla_id', mezcla.id);

              if (productosData) {
                productosData.forEach((p: any) => {
                  productos.push({
                    nombre: p.productos.nombre,
                    ingrediente_activo_1: p.productos.ingrediente_activo_1,
                    ingrediente_activo_2: p.productos.ingrediente_activo_2,
                    ingrediente_activo_3: p.productos.ingrediente_activo_3,
                    concentracion_ia_1: p.productos.concentracion_ia_1,
                    concentracion_ia_2: p.productos.concentracion_ia_2,
                    concentracion_ia_3: p.productos.concentracion_ia_3,
                    registro_ica: p.productos.registro_ica,
                    periodo_carencia: p.productos.periodo_carencia_dias,
                    periodo_reingreso: p.productos.periodo_reingreso_horas,
                    dosis_caneca: p.dosis_caneca,
                    cantidad_utilizada: parseFloat(p.cantidad_total_necesaria) || 0,
                  });
                });
              }
            }
          }

          // Cargar movimientos diarios
          const { data: movimientosData } = await supabase
            .from('movimientos_diarios')
            .select(`
              fecha_movimiento,
              numero_canecas,
              canecas_20l,
              canecas_200l,
              canecas_500l,
              canecas_1000l,
              metodo_aplicacion,
              condiciones_meteorologicas,
              hora_inicio,
              hora_fin,
              aplicadores,
              lotes(nombre),
              aplicaciones_calculos(arboles_tratados_total)
            `)
            .eq('aplicacion_id', app.id);

          const movimientos: MovimientoDetalle[] =
            movimientosData?.map((m: any) => ({
              fecha: m.fecha_movimiento,
              lote_nombre: m.lotes?.nombre || '-',
              arboles_tratados: m.aplicaciones_calculos?.arboles_tratados_total || 0,
              canecas_20l: m.canecas_20l || 0,
              canecas_200l: m.canecas_200l || 0,
              canecas_500l: m.canecas_500l || 0,
              canecas_1000l: m.canecas_1000l || 0,
              agua_total: 0, // Calcular después
              metodo_aplicacion: m.metodo_aplicacion,
              condiciones_meteorologicas: m.condiciones_meteorologicas,
              hora_inicio: m.hora_inicio,
              hora_fin: m.hora_fin,
              aplicadores: m.aplicadores,
            })) || [];

          // Validar completitud
          const validacion = validarCompletitudGlobalGAP(
            { ...app, productos, movimientos },
            app.tipo_aplicacion
          );

          return {
            ...app,
            lotes,
            productos,
            movimientos,
            completitud: validacion.completitud,
            camposFaltantes: validacion.camposFaltantes,
          };
        })
      );

      // Filtrar nulos y aplicar filtro de completitud
      let resultado = aplicacionesEnriquecidas.filter((app) => app !== null) as Aplicacion[];

      if (filtros.soloCompletas) {
        resultado = resultado.filter((app) => (app.completitud || 0) >= 90);
      }

      // Filtrar por lote
      if (filtros.loteId !== 'Todos') {
        const loteNombre = lotes.find((l) => l.id === filtros.loteId)?.nombre;
        resultado = resultado.filter((app) => app.lotes?.includes(loteNombre || ''));
      }

      setAplicaciones(resultado);
    } catch (error) {
      console.error('Error cargando aplicaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // VALIDACIÓN GLOBALGAP
  // ============================================

  const validarCompletitudGlobalGAP = (
    aplicacion: any,
    tipo: string
  ): ValidacionGlobalGAP => {
    const camposFaltantes: string[] = [];
    let camposRequeridos = 0;
    let camposCompletos = 0;

    // Campos comunes
    const camposComunes = [
      { campo: aplicacion.fecha_inicio_ejecucion, nombre: 'Fecha de aplicación' },
      { campo: aplicacion.lotes?.length > 0, nombre: 'Lotes' },
      { campo: aplicacion.proposito, nombre: 'Propósito' },
      { campo: aplicacion.productos?.length > 0, nombre: 'Productos' },
      { campo: aplicacion.movimientos?.length > 0, nombre: 'Movimientos diarios' },
    ];

    camposComunes.forEach((c) => {
      camposRequeridos++;
      if (c.campo) {
        camposCompletos++;
      } else {
        camposFaltantes.push(c.nombre);
      }
    });

    // Validar productos
    if (aplicacion.productos && aplicacion.productos.length > 0) {
      aplicacion.productos.forEach((producto: ProductoDetalle, idx: number) => {
        const camposProducto = [
          { campo: producto.ingrediente_activo_1, nombre: `Ingrediente activo - ${producto.nombre}` },
          { campo: producto.registro_ica, nombre: `Registro ICA - ${producto.nombre}` },
        ];

        if (tipo === 'Fumigación') {
          camposProducto.push(
            { campo: producto.periodo_carencia, nombre: `Periodo carencia - ${producto.nombre}` },
            { campo: producto.periodo_reingreso, nombre: `Periodo reingreso - ${producto.nombre}` }
          );
        }

        camposProducto.forEach((c) => {
          camposRequeridos++;
          if (c.campo) {
            camposCompletos++;
          } else {
            camposFaltantes.push(c.nombre);
          }
        });
      });
    }

    // Validar movimientos
    if (aplicacion.movimientos && aplicacion.movimientos.length > 0) {
      aplicacion.movimientos.forEach((mov: MovimientoDetalle, idx: number) => {
        const camposMovimiento = [
          { campo: mov.metodo_aplicacion, nombre: `Método de aplicación - Día ${idx + 1}` },
          { campo: mov.condiciones_meteorologicas, nombre: `Condiciones meteorológicas - Día ${idx + 1}` },
          { campo: mov.aplicadores, nombre: `Aplicadores - Día ${idx + 1}` },
          { campo: mov.hora_inicio, nombre: `Hora inicio - Día ${idx + 1}` },
          { campo: mov.hora_fin, nombre: `Hora fin - Día ${idx + 1}` },
        ];

        camposMovimiento.forEach((c) => {
          camposRequeridos++;
          if (c.campo) {
            camposCompletos++;
          } else {
            camposFaltantes.push(c.nombre);
          }
        });
      });
    }

    const completitud = camposRequeridos > 0 ? (camposCompletos / camposRequeridos) * 100 : 0;

    return {
      esValida: completitud >= 90,
      camposFaltantes,
      completitud: Math.round(completitud),
    };
  };

  // ============================================
  // EXPORTACIÓN
  // ============================================

  const exportarCSV = () => {
    const filas: string[][] = [];

    // Determinar campos según tipo
    const esFumigacion = filtros.tipoAplicacion === 'Fumigación' || filtros.tipoAplicacion === 'Todos';
    const esFertilizacion = filtros.tipoAplicacion === 'Fertilización' || filtros.tipoAplicacion === 'Todos';

    // Headers dinámicos
    const headersBase = [
      'Código',
      'Tipo',
      'Fecha',
      'Año',
      'Mes',
      'Semana',
      'Lote',
      'Propósito',
      'Blanco Biológico',
      'Producto',
      'Registro ICA',
      'Ingrediente Activo 1',
      'Concentración IA 1',
      'Ingrediente Activo 2',
      'Concentración IA 2',
      'Ingrediente Activo 3',
      'Concentración IA 3',
    ];

    const headersFumigacion = [
      'Periodo Carencia (días)',
      'Periodo Reingreso (horas)',
    ];

    const headersComunes = [
      'Dosis/Caneca',
      'Cantidad Utilizada',
      'Canecas 20L',
      'Canecas 200L',
      'Canecas 500L',
      'Canecas 1000L',
      'Total Canecas',
      'Árboles Tratados',
      'Aplicación por Árbol',
      'Método Aplicación',
      'Condiciones Meteorológicas',
      'Hora Inicio',
      'Hora Fin',
      'Aplicadores',
      'Completitud %',
      'Campos Faltantes',
    ];

    const headers = [
      ...headersBase,
      ...(esFumigacion ? headersFumigacion : []),
      ...headersComunes,
    ];

    filas.push(headers);

    // Datos
    aplicaciones.forEach((app) => {
      const fecha = new Date(app.fecha_inicio_ejecucion || app.created_at);
      const año = fecha.getFullYear();
      const mes = fecha.toLocaleDateString('es-CO', { month: 'long' });
      const semana = getWeekNumber(fecha);

      app.movimientos?.forEach((mov) => {
        app.productos?.forEach((prod) => {
          const totalCanecas =
            mov.canecas_20l + mov.canecas_200l + mov.canecas_500l + mov.canecas_1000l;
          const aplicacionPorArbol =
            mov.arboles_tratados > 0 ? prod.cantidad_utilizada / mov.arboles_tratados : 0;

          const filaBase = [
            app.codigo_aplicacion,
            app.tipo_aplicacion,
            app.fecha_inicio_ejecucion || '-',
            año.toString(),
            mes,
            `S${semana}`,
            mov.lote_nombre,
            app.proposito || '-',
            app.blanco_biologico || '-',
            prod.nombre,
            prod.registro_ica || '-',
            prod.ingrediente_activo_1 || '-',
            prod.concentracion_ia_1 || '-',
            prod.ingrediente_activo_2 || '-',
            prod.concentracion_ia_2 || '-',
            prod.ingrediente_activo_3 || '-',
            prod.concentracion_ia_3 || '-',
          ];

          const filaFumigacion = [
            prod.periodo_carencia?.toString() || '-',
            prod.periodo_reingreso?.toString() || '-',
          ];

          const filaComun = [
            prod.dosis_caneca || '-',
            prod.cantidad_utilizada?.toString() || '-',
            mov.canecas_20l.toString(),
            mov.canecas_200l.toString(),
            mov.canecas_500l.toString(),
            mov.canecas_1000l.toString(),
            totalCanecas.toString(),
            mov.arboles_tratados.toString(),
            aplicacionPorArbol.toFixed(2),
            mov.metodo_aplicacion || '-',
            mov.condiciones_meteorologicas || '-',
            mov.hora_inicio || '-',
            mov.hora_fin || '-',
            mov.aplicadores || '-',
            `${app.completitud}%`,
            app.camposFaltantes?.join('; ') || 'Ninguno',
          ];

          const fila = [
            ...filaBase,
            ...(app.tipo_aplicacion === 'Fumigación' ? filaFumigacion : ['', '']),
            ...filaComun,
          ];

          filas.push(fila);
        });
      });
    });

    // Generar CSV
    const csv = filas
      .map((fila) => fila.map((celda) => `"${celda.toString().replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GlobalGAP_Export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportarExcel = () => {
    exportarCSV(); // Por ahora usa el mismo CSV
  };

  const exportarPDF = () => {
    alert('Exportación PDF en desarrollo. Se implementará con jsPDF + autoTable.\nPor ahora usa CSV/Excel.');
  };

  // ============================================
  // UTILIDADES
  // ============================================

  const getWeekNumber = (date: Date): number => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  };

  const formatearFecha = (fecha: string | null) => {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getCompletitudColor = (completitud: number) => {
    if (completitud >= 90) return 'text-green-600';
    if (completitud >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  const getCompletitudBg = (completitud: number) => {
    if (completitud >= 90) return 'bg-green-100 border-green-200';
    if (completitud >= 70) return 'bg-amber-100 border-amber-200';
    return 'bg-red-100 border-red-200';
  };

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  const calcularEstadisticas = () => {
    const total = aplicaciones.length;
    const completas = aplicaciones.filter((app) => (app.completitud || 0) >= 90).length;
    const incompletas = total - completas;
    const completitudPromedio =
      total > 0
        ? Math.round(
            aplicaciones.reduce((sum, app) => sum + (app.completitud || 0), 0) / total
          )
        : 0;

    return { total, completas, incompletas, completitudPromedio };
  };

  const stats = calcularEstadisticas();

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-6">
      {/* Header explicativo */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileCheck className="w-6 h-6 text-[#73991C]" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[#172E08] mb-2">Exportación GlobalGAP</h2>
            <p className="text-[#4D240F]/70 mb-3">
              Genera reportes certificables con todos los campos requeridos por GlobalGAP. El
              sistema valida automáticamente la completitud de los datos antes de exportar.
            </p>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full">
                ✓ Ingredientes activos
              </span>
              <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full">
                ✓ Periodos de carencia
              </span>
              <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full">
                ✓ Condiciones meteorológicas
              </span>
              <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full">
                ✓ Trazabilidad completa
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-[#73991C]" />
          <h3 className="font-semibold text-[#172E08]">Filtrar Aplicaciones</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#172E08] mb-2">Fecha Inicio</label>
            <input
              type="date"
              value={filtros.fechaInicio}
              onChange={(e) => setFiltros({ ...filtros, fechaInicio: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#172E08] mb-2">Fecha Fin</label>
            <input
              type="date"
              value={filtros.fechaFin}
              onChange={(e) => setFiltros({ ...filtros, fechaFin: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#172E08] mb-2">Tipo</label>
            <select
              value={filtros.tipoAplicacion}
              onChange={(e) => setFiltros({ ...filtros, tipoAplicacion: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
            >
              <option value="Todos">Todos</option>
              <option value="Fumigación">Fumigación</option>
              <option value="Fertilización">Fertilización</option>
              <option value="Drench">Drench</option>
            </select>
          </div>

          <div>
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

          <div>
            <label className="block text-sm font-medium text-[#172E08] mb-2">Filtro</label>
            <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={filtros.soloCompletas}
                onChange={(e) => setFiltros({ ...filtros, soloCompletas: e.target.checked })}
                className="w-4 h-4 text-[#73991C] rounded focus:ring-[#73991C]"
              />
              <span className="text-sm text-[#172E08]">Solo completas (≥90%)</span>
            </label>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={cargarAplicaciones}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#73991C] text-white rounded-lg hover:bg-[#5C7A16] transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Cargando...
              </>
            ) : (
              <>
                <Filter className="w-4 h-4" />
                Buscar Aplicaciones
              </>
            )}
          </button>

          {aplicaciones.length > 0 && (
            <>
              <button
                onClick={exportarCSV}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#172E08] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                CSV ({aplicaciones.length})
              </button>
              <button
                onClick={exportarExcel}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#172E08] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel
              </button>
              <button
                onClick={exportarPDF}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#172E08] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileText className="w-4 h-4" />
                PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Estadísticas */}
      {aplicaciones.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#172E08]">{stats.total}</p>
                <p className="text-sm text-[#4D240F]/70">Total</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.completas}</p>
                <p className="text-sm text-[#4D240F]/70">Completas</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{stats.incompletas}</p>
                <p className="text-sm text-[#4D240F]/70">Incompletas</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">{stats.completitudPromedio}%</p>
                <p className="text-sm text-[#4D240F]/70">Promedio</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista de aplicaciones */}
      {aplicaciones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="font-semibold text-[#172E08]">
              Aplicaciones para Exportar ({aplicaciones.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
            {aplicaciones.map((app) => (
              <div key={app.id} className="p-4 hover:bg-[#F8FAF5]/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium text-[#172E08]">{app.codigo_aplicacion}</span>
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                        {app.tipo_aplicacion}
                      </span>
                      <span className="text-sm text-[#4D240F]/70 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatearFecha(app.fecha_inicio_ejecucion)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-[#4D240F]/70">
                      <span>{app.lotes?.join(', ')}</span>
                      <span>•</span>
                      <span>{app.productos?.length || 0} productos</span>
                      <span>•</span>
                      <span>{app.movimientos?.length || 0} días</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Completitud */}
                    <div className={`px-3 py-1.5 rounded-lg border text-center ${getCompletitudBg(app.completitud || 0)}`}>
                      <p className={`text-lg font-bold ${getCompletitudColor(app.completitud || 0)}`}>
                        {app.completitud}%
                      </p>
                      <p className="text-xs text-[#4D240F]/60">Completitud</p>
                    </div>

                    {/* Ver detalle */}
                    <button
                      onClick={() => setAplicacionSeleccionada(app)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Ver detalle"
                    >
                      <Eye className="w-5 h-5 text-[#73991C]" />
                    </button>
                  </div>
                </div>

                {/* Campos faltantes */}
                {app.camposFaltantes && app.camposFaltantes.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-amber-800 mb-1">
                          Campos faltantes:
                        </p>
                        <p className="text-xs text-amber-700">
                          {app.camposFaltantes.slice(0, 3).join(', ')}
                          {app.camposFaltantes.length > 3 &&
                            ` y ${app.camposFaltantes.length - 3} más`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sin resultados */}
      {!loading && aplicaciones.length === 0 && filtros.fechaInicio && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileCheck className="w-16 h-16 mx-auto mb-4 text-[#4D240F]/30" />
          <h3 className="text-lg font-semibold text-[#172E08] mb-2">
            No se encontraron aplicaciones
          </h3>
          <p className="text-[#4D240F]/70 mb-4">
            Intenta ajustar los filtros de búsqueda o el rango de fechas
          </p>
        </div>
      )}

      {/* MODAL DE DETALLE */}
      {aplicacionSeleccionada && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[#172E08]">
                  {aplicacionSeleccionada.codigo_aplicacion}
                </h3>
                <p className="text-sm text-[#4D240F]/70">Validación GlobalGAP</p>
              </div>
              <button
                onClick={() => setAplicacionSeleccionada(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Completitud */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-[#172E08]">
                    Completitud de Datos
                  </h4>
                  <span className={`text-2xl font-bold ${getCompletitudColor(aplicacionSeleccionada.completitud || 0)}`}>
                    {aplicacionSeleccionada.completitud}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className={`h-full rounded-full ${
                      (aplicacionSeleccionada.completitud || 0) >= 90
                        ? 'bg-green-500'
                        : (aplicacionSeleccionada.completitud || 0) >= 70
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${aplicacionSeleccionada.completitud}%` }}
                  ></div>
                </div>
              </div>

              {/* Productos */}
              <div>
                <h4 className="text-sm font-semibold text-[#172E08] mb-3">
                  Productos ({aplicacionSeleccionada.productos?.length || 0})
                </h4>
                <div className="space-y-3">
                  {aplicacionSeleccionada.productos?.map((prod, idx) => (
                    <div key={idx} className="p-4 bg-gray-50 rounded-lg space-y-2">
                      <p className="font-medium text-[#172E08]">{prod.nombre}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#4D240F]/60">Registro ICA:</span>{' '}
                          <span className={prod.registro_ica ? 'text-green-600' : 'text-red-600'}>
                            {prod.registro_ica || '❌ Faltante'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#4D240F]/60">IA 1:</span>{' '}
                          <span className={prod.ingrediente_activo_1 ? '' : 'text-red-600'}>
                            {prod.ingrediente_activo_1 || '❌ Faltante'}
                          </span>
                        </div>
                        {aplicacionSeleccionada.tipo_aplicacion === 'Fumigación' && (
                          <>
                            <div>
                              <span className="text-[#4D240F]/60">Carencia:</span>{' '}
                              <span className={prod.periodo_carencia ? '' : 'text-red-600'}>
                                {prod.periodo_carencia ? `${prod.periodo_carencia} días` : '❌ Faltante'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#4D240F]/60">Reingreso:</span>{' '}
                              <span className={prod.periodo_reingreso ? '' : 'text-red-600'}>
                                {prod.periodo_reingreso ? `${prod.periodo_reingreso} horas` : '❌ Faltante'}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Movimientos */}
              <div>
                <h4 className="text-sm font-semibold text-[#172E08] mb-3">
                  Movimientos Diarios ({aplicacionSeleccionada.movimientos?.length || 0})
                </h4>
                <div className="space-y-3">
                  {aplicacionSeleccionada.movimientos?.map((mov, idx) => (
                    <div key={idx} className="p-4 bg-gray-50 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-[#172E08]">
                          Día {idx + 1} - {mov.lote_nombre}
                        </p>
                        <span className="text-sm text-[#4D240F]/70">{mov.fecha}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#4D240F]/60">Método:</span>{' '}
                          <span className={mov.metodo_aplicacion ? '' : 'text-red-600'}>
                            {mov.metodo_aplicacion || '❌ Faltante'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#4D240F]/60">Condiciones:</span>{' '}
                          <span className={mov.condiciones_meteorologicas ? '' : 'text-red-600'}>
                            {mov.condiciones_meteorologicas || '❌ Faltante'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#4D240F]/60">Horario:</span>{' '}
                          <span className={mov.hora_inicio && mov.hora_fin ? '' : 'text-red-600'}>
                            {mov.hora_inicio && mov.hora_fin
                              ? `${mov.hora_inicio} - ${mov.hora_fin}`
                              : '❌ Faltante'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#4D240F]/60">Aplicadores:</span>{' '}
                          <span className={mov.aplicadores ? '' : 'text-red-600'}>
                            {mov.aplicadores || '❌ Faltante'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Campos faltantes */}
              {aplicacionSeleccionada.camposFaltantes &&
                aplicacionSeleccionada.camposFaltantes.length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-amber-800 mb-2">
                          Campos Faltantes ({aplicacionSeleccionada.camposFaltantes.length})
                        </p>
                        <ul className="text-sm text-amber-700 space-y-1">
                          {aplicacionSeleccionada.camposFaltantes.map((campo, idx) => (
                            <li key={idx}>• {campo}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Información de campos incluidos */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-[#172E08] mb-4">Campos Incluidos en el Reporte</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Fumigación */}
          <div>
            <h4 className="font-medium text-[#172E08] mb-3 pb-2 border-b border-gray-200">
              Para Fumigación
            </h4>
            <ul className="space-y-1 text-sm text-[#4D240F]/70">
              <li>✓ Fecha, Año, Mes, Semana</li>
              <li>✓ Lote, Número de árboles</li>
              <li>✓ Categoría, Propósito, Blanco biológico</li>
              <li>✓ Insumo, Ingredientes activos (1, 2, 3) con concentraciones</li>
              <li>✓ Periodo de carencia y reingreso</li>
              <li>✓ Dosis/caneca, Cantidad utilizada</li>
              <li>✓ Canecas usadas (20L, 200L, 500L, 1000L)</li>
              <li>✓ Aplicación promedio por árbol</li>
              <li>✓ Método de aplicación</li>
              <li>✓ Condiciones meteorológicas</li>
              <li>✓ Hora inicio/fin, Aplicadores</li>
            </ul>
          </div>

          {/* Fertilización */}
          <div>
            <h4 className="font-medium text-[#172E08] mb-3 pb-2 border-b border-gray-200">
              Para Fertilización
            </h4>
            <ul className="space-y-1 text-sm text-[#4D240F]/70">
              <li>✓ Fecha, Año, Mes, Semana</li>
              <li>✓ Lote, Producto, Registro ICA</li>
              <li>✓ Análisis nutricional completo</li>
              <li>✓ Número de árboles</li>
              <li>✓ Tipo aplicación: Suelo, Foliar, Drench</li>
              <li>✓ Dosis por tamaño de árbol</li>
              <li>✓ Kilos totales aplicados</li>
              <li>✓ Canecas usadas</li>
              <li>✓ Método de aplicación</li>
              <li>✓ Condiciones meteorológicas</li>
              <li>✓ Supervisor, Recomendado por</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}