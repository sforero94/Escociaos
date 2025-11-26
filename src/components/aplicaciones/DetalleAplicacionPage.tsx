// ARCHIVO: components/aplicaciones/DetalleAplicacionPage.tsx
// DESCRIPCIÓN: Página completa de detalle de aplicación cerrada
// Navegación: Incluye botón de "Volver atrás"

import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Droplet,
  Package2,
  Target,
  Users,
  Activity,
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
  proposito: string | null;
  blanco_biologico: string | null;
  fecha_inicio_planeada: string | null;
  fecha_fin_planeada: string | null;
  fecha_inicio_ejecucion: string | null;
  fecha_fin_ejecucion: string | null;
  agronomo_responsable: string | null;
  jornales_utilizados: number | null;
  valor_jornal: number | null;
  costo_total_insumos: number | null;
  costo_total_mano_obra: number | null;
  costo_total: number | null;
  costo_por_arbol: number | null;
  arboles_jornal: number | null;
}

interface DatosCalculados {
  total_arboles: number;
  total_litros_mezcla: number;
  total_kilos: number;
  total_canecas: number;
  total_bultos: number;
  total_insumos_cantidad: number; // ✅ SUMA DE PRODUCTOS, NO MEZCLA
  costo_por_litro: number; // ✅ costo_insumos / litros_mezcla
  cambio_vs_anterior: number;
  cambio_costo_vs_anterior: number;
}

interface LoteDetalle {
  lote_nombre: string;
  total_arboles: number;
  litros_mezcla: number;
  kilos_totales: number;
  numero_canecas: number;
  costo_insumos: number;
  costo_mano_obra: number;
  costo_total: number;
}

interface ProductoDetalle {
  producto_nombre: string;
  categoria: string;
  unidad: string;
  cantidad_planificada: number;
  cantidad_real: number | null;
  costo_unitario: number;
  costo_total: number;
}

interface ManoObraDetalle {
  lote_nombre: string;
  jornales_aplicacion: number;
  jornales_mezcla: number;
  jornales_transporte: number;
  jornales_total: number;
  valor_jornal: number;
  costo_total: number;
}

interface Props {
  aplicacionId: string;
  onVolver: () => void;
}

type TabActivo = 'comparacion' | 'lotes' | 'productos' | 'manoObra';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function DetalleAplicacionPage({ aplicacionId, onVolver }: Props) {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(true);
  const [tabActivo, setTabActivo] = useState<TabActivo>('comparacion');
  
  const [aplicacion, setAplicacion] = useState<Aplicacion | null>(null);
  const [datosCalculados, setDatosCalculados] = useState<DatosCalculados | null>(null);
  const [lotes, setLotes] = useState<LoteDetalle[]>([]);
  const [productos, setProductos] = useState<ProductoDetalle[]>([]);
  const [manoObra, setManoObra] = useState<ManoObraDetalle[]>([]);

  useEffect(() => {
    cargarDatosCompletos();
  }, [aplicacionId]);

  // ============================================
  // CARGAR DATOS COMPLETOS
  // ============================================

  const cargarDatosCompletos = async () => {
    try {
      setLoading(true);

      // 1. Cargar aplicación
      const { data: app } = await supabase
        .from('aplicaciones')
        .select(`
          id,
          codigo_aplicacion,
          nombre_aplicacion,
          tipo_aplicacion,
          proposito,
          blanco_biologico,
          fecha_inicio_planeada,
          fecha_fin_planeada,
          fecha_inicio_ejecucion,
          fecha_fin_ejecucion,
          agronomo_responsable,
          jornales_utilizados,
          valor_jornal,
          costo_total_insumos,
          costo_total_mano_obra,
          costo_total,
          costo_por_arbol,
          arboles_jornal
        `)
        .eq('id', aplicacionId)
        .single();

      if (!app) throw new Error('Aplicación no encontrada');
      setAplicacion(app);

      // 2. Cargar cálculos (para totales planificados de MEZCLA)
      const { data: calculos } = await supabase
        .from('aplicaciones_calculos')
        .select('*')
        .eq('aplicacion_id', aplicacionId);

      const total_arboles = calculos?.reduce((sum, c) => sum + (c.total_arboles || 0), 0) || 0;
      const total_litros_mezcla = calculos?.reduce((sum, c) => sum + (c.litros_mezcla || 0), 0) || 0;
      const total_kilos = calculos?.reduce((sum, c) => sum + (c.kilos_totales || 0), 0) || 0;
      const total_canecas = calculos?.reduce((sum, c) => sum + (c.numero_canecas || 0), 0) || 0;
      const total_bultos = calculos?.reduce((sum, c) => sum + (c.numero_bultos || 0), 0) || 0;

      // 3. ✅ CORRECTO: Cargar PRODUCTOS (insumos reales)
      const { data: mezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacionId);

      let total_insumos_cantidad = 0;
      const productosTemp: ProductoDetalle[] = [];

      if (mezclas && mezclas.length > 0) {
        for (const mezcla of mezclas) {
          const { data: prods } = await supabase
            .from('aplicaciones_productos')
            .select(`
              producto_id,
              producto_nombre,
              producto_categoria,
              producto_unidad,
              cantidad_total_necesaria
            `)
            .eq('mezcla_id', mezcla.id);

          if (prods) {
            prods.forEach((p) => {
              const cantidad = p.cantidad_total_necesaria || 0;
              // ✅ Sumar SOLO los productos (insumos), NO la mezcla
              total_insumos_cantidad += cantidad;

              productosTemp.push({
                producto_nombre: p.producto_nombre,
                categoria: p.producto_categoria,
                unidad: p.producto_unidad,
                cantidad_planificada: cantidad,
                cantidad_real: null,
                costo_unitario: 0,
                costo_total: 0,
              });
            });
          }
        }
      }

      // 4. Cargar datos reales de cierre (si existen)
      const { data: cierre } = await supabase
        .from('aplicaciones_cierre')
        .select('id')
        .eq('aplicacion_id', aplicacionId)
        .maybeSingle();

      let lotesTemp: LoteDetalle[] = [];
      let manoObraTemp: ManoObraDetalle[] = [];

      if (cierre) {
        // Cargar productos reales
        const { data: prodReales } = await supabase
          .from('aplicaciones_productos_real')
          .select('producto_id, cantidad_real, costo')
          .eq('cierre_id', cierre.id);

        // Actualizar productos con datos reales
        if (prodReales) {
          prodReales.forEach((pr) => {
            const prod = productosTemp.find((p) => p.producto_nombre === pr.producto_id);
            if (prod) {
              prod.cantidad_real = pr.cantidad_real || 0;
              prod.costo_total = pr.costo || 0;
            }
          });
        }

        // 5. ✅ CORRECTO: Cargar lotes reales con jornales por actividad
        const { data: lotesReales } = await supabase
          .from('aplicaciones_lotes_real')
          .select(`
            lote_id,
            litros_mezcla_real,
            jornales_aplicacion,
            jornales_mezcla,
            jornales_transporte,
            jornales_total,
            costo_insumos,
            costo_mano_obra,
            costo_total
          `)
          .eq('cierre_id', cierre.id);

        if (lotesReales) {
          for (const lr of lotesReales) {
            // Buscar nombre del lote y datos de cálculos
            const { data: loteData } = await supabase
              .from('lotes')
              .select('nombre')
              .eq('id', lr.lote_id)
              .single();

            const loteCalculo = calculos?.find((c) => c.lote_id === lr.lote_id);

            lotesTemp.push({
              lote_nombre: loteData?.nombre || 'Sin nombre',
              total_arboles: loteCalculo?.total_arboles || 0,
              litros_mezcla: lr.litros_mezcla_real || loteCalculo?.litros_mezcla || 0,
              kilos_totales: loteCalculo?.kilos_totales || 0,
              numero_canecas: loteCalculo?.numero_canecas || 0,
              costo_insumos: lr.costo_insumos || 0,
              costo_mano_obra: lr.costo_mano_obra || 0,
              costo_total: lr.costo_total || 0,
            });

            // ✅ CORRECTO: Detalle de mano de obra por actividad
            manoObraTemp.push({
              lote_nombre: loteData?.nombre || 'Sin nombre',
              jornales_aplicacion: lr.jornales_aplicacion || 0,
              jornales_mezcla: lr.jornales_mezcla || 0,
              jornales_transporte: lr.jornales_transporte || 0,
              jornales_total: lr.jornales_total || 0,
              valor_jornal: app.valor_jornal || 0,
              costo_total: lr.costo_mano_obra || 0,
            });
          }
        }
      } else {
        // Sin cierre, usar datos planificados
        lotesTemp = calculos?.map((c) => ({
          lote_nombre: c.lote_nombre,
          total_arboles: c.total_arboles || 0,
          litros_mezcla: c.litros_mezcla || 0,
          kilos_totales: c.kilos_totales || 0,
          numero_canecas: c.numero_canecas || 0,
          costo_insumos: 0,
          costo_mano_obra: 0,
          costo_total: 0,
        })) || [];
      }

      setLotes(lotesTemp);
      setManoObra(manoObraTemp);
      setProductos(productosTemp);

      // 6. ✅ CORRECTO: Calcular costo por L/kg usando SOLO insumos
      const costo_por_litro =
        app.tipo_aplicacion === 'Fumigación' && total_litros_mezcla > 0
          ? (app.costo_total_insumos || 0) / total_litros_mezcla
          : app.tipo_aplicacion !== 'Fumigación' && total_kilos > 0
          ? (app.costo_total_insumos || 0) / total_kilos
          : 0;

      // 7. Buscar aplicación anterior para comparar
      const { data: anterior } = await supabase
        .from('aplicaciones')
        .select('id, codigo_aplicacion, costo_total')
        .eq('tipo_aplicacion', app.tipo_aplicacion)
        .eq('estado', 'Cerrada')
        .neq('id', aplicacionId)
        .order('fecha_inicio_ejecucion', { ascending: false })
        .limit(1)
        .maybeSingle();

      let cambio_vs_anterior = 0;
      let cambio_costo_vs_anterior = 0;

      if (anterior) {
        const { data: calculosAnt } = await supabase
          .from('aplicaciones_calculos')
          .select('litros_mezcla, kilos_totales')
          .eq('aplicacion_id', anterior.id);

        if (app.tipo_aplicacion === 'Fumigación') {
          const litros_ant = calculosAnt?.reduce((sum, c) => sum + (c.litros_mezcla || 0), 0) || 0;
          if (litros_ant > 0) {
            cambio_vs_anterior = ((total_litros_mezcla - litros_ant) / litros_ant) * 100;
          }
        } else {
          const kilos_ant = calculosAnt?.reduce((sum, c) => sum + (c.kilos_totales || 0), 0) || 0;
          if (kilos_ant > 0) {
            cambio_vs_anterior = ((total_kilos - kilos_ant) / kilos_ant) * 100;
          }
        }

        if (anterior.costo_total && anterior.costo_total > 0) {
          cambio_costo_vs_anterior =
            (((app.costo_total || 0) - anterior.costo_total) / anterior.costo_total) * 100;
        }
      }

      setDatosCalculados({
        total_arboles,
        total_litros_mezcla,
        total_kilos,
        total_canecas,
        total_bultos,
        total_insumos_cantidad,
        costo_por_litro,
        cambio_vs_anterior,
        cambio_costo_vs_anterior,
      });
    } catch (error) {
      console.error('Error cargando datos completos:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // UTILIDADES
  // ============================================

  const formatearFecha = (fecha: string | null) => {
    if (!fecha) return '-';
    return new Date(fecha + 'T00:00:00-05:00').toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Bogota',
    });
  };

  const formatearMoneda = (valor: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(valor);
  };

  const formatearNumero = (valor: number, decimales: number = 1) => {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(valor);
  };

  const getCambioIcon = (valor: number) => {
    if (valor > 0) return <TrendingUp className="w-4 h-4 text-red-600" />;
    if (valor < 0) return <TrendingDown className="w-4 h-4 text-green-600" />;
    return null;
  };

  const getCambioColor = (valor: number) => {
    if (valor > 0) return 'text-red-600';
    if (valor < 0) return 'text-green-600';
    return 'text-gray-600';
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading || !aplicacion || !datosCalculados) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#172E08]">Cargando detalles...</p>
        </div>
      </div>
    );
  }

  const totalAplicado =
    aplicacion.tipo_aplicacion === 'Fumigación'
      ? `${formatearNumero(datosCalculados.total_litros_mezcla, 1)} L`
      : `${formatearNumero(datosCalculados.total_bultos, 0)} bultos (${formatearNumero(
          datosCalculados.total_kilos,
          1
        )} kg)`;

  const unidadCosto = aplicacion.tipo_aplicacion === 'Fumigación' ? 'L' : 'kg';

  return (
    <div className="min-h-screen bg-[#F8FAF5] pb-12">
      {/* Header fijo */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onVolver}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#172E08]" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-[#172E08]">
                  {aplicacion.codigo_aplicacion}
                </h1>
                <p className="text-sm text-[#4D240F]/70">
                  {aplicacion.nombre_aplicacion || 'Sin nombre'} • {aplicacion.tipo_aplicacion}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* GRID DE MÉTRICAS PRINCIPALES */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Aplicado */}
          <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/20 p-5 rounded-xl border border-[#73991C]/20">
            <div className="flex items-start justify-between mb-2">
              <Droplet className="w-5 h-5 text-[#73991C]" />
              {datosCalculados.cambio_vs_anterior !== 0 && (
                <span
                  className={`text-xs flex items-center gap-1 ${getCambioColor(
                    datosCalculados.cambio_vs_anterior
                  )}`}
                >
                  {getCambioIcon(datosCalculados.cambio_vs_anterior)}
                  {Math.abs(datosCalculados.cambio_vs_anterior).toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-[#172E08]">{totalAplicado}</p>
            <p className="text-xs text-[#4D240F]/60 mt-1">Total Aplicado</p>
          </div>

          {/* Costo Total */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 rounded-xl border border-blue-200">
            <div className="flex items-start justify-between mb-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              {datosCalculados.cambio_costo_vs_anterior !== 0 && (
                <span
                  className={`text-xs flex items-center gap-1 ${getCambioColor(
                    datosCalculados.cambio_costo_vs_anterior
                  )}`}
                >
                  {getCambioIcon(datosCalculados.cambio_costo_vs_anterior)}
                  {Math.abs(datosCalculados.cambio_costo_vs_anterior).toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-[#172E08]">
              {formatearMoneda(aplicacion.costo_total || 0)}
            </p>
            <p className="text-xs text-[#4D240F]/60 mt-1">Costo Total</p>
          </div>

          {/* Costo Insumos */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 p-5 rounded-xl border border-purple-200">
            <div className="flex items-start justify-between mb-2">
              <Package2 className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-[#172E08]">
              {formatearMoneda(aplicacion.costo_total_insumos || 0)}
            </p>
            <p className="text-xs text-[#4D240F]/60 mt-1">Costo Insumos</p>
            <p className="text-xs text-gray-600 mt-1">
              {aplicacion.costo_total
                ? (((aplicacion.costo_total_insumos || 0) / aplicacion.costo_total) * 100).toFixed(1)
                : 0}
              % del total
            </p>
          </div>

          {/* Costo Mano de Obra */}
          <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 p-5 rounded-xl border border-orange-200">
            <div className="flex items-start justify-between mb-2">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-[#172E08]">
              {formatearMoneda(aplicacion.costo_total_mano_obra || 0)}
            </p>
            <p className="text-xs text-[#4D240F]/60 mt-1">Costo Mano de Obra</p>
            <p className="text-xs text-gray-600 mt-1">
              {formatearNumero(aplicacion.jornales_utilizados || 0, 1)} jornales
            </p>
          </div>

          {/* Costo por Unidad */}
          <div className="bg-gradient-to-br from-green-50 to-green-100/50 p-5 rounded-xl border border-green-200">
            <div className="flex items-start justify-between mb-2">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-[#172E08]">
              {formatearMoneda(datosCalculados.costo_por_litro)}
            </p>
            <p className="text-xs text-[#4D240F]/60 mt-1">Costo por {unidadCosto}</p>
          </div>

          {/* Árboles Tratados */}
          <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 p-5 rounded-xl border border-teal-200">
            <div className="flex items-start justify-between mb-2">
              <Target className="w-5 h-5 text-teal-600" />
            </div>
            <p className="text-2xl font-bold text-[#172E08]">
              {formatearNumero(datosCalculados.total_arboles, 0)}
            </p>
            <p className="text-xs text-[#4D240F]/60 mt-1">Árboles Tratados</p>
            <p className="text-xs text-gray-600 mt-1">{lotes.length} lotes</p>
          </div>

          {/* Árboles/Jornal */}
          <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-5 rounded-xl border border-amber-200">
            <div className="flex items-start justify-between mb-2">
              <Activity className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-[#172E08]">
              {formatearNumero(aplicacion.arboles_jornal || 0, 0)}
            </p>
            <p className="text-xs text-[#4D240F]/60 mt-1">Árboles/Jornal</p>
          </div>

          {/* Costo por Árbol */}
          <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 p-5 rounded-xl border border-rose-200">
            <div className="flex items-start justify-between mb-2">
              <DollarSign className="w-5 h-5 text-rose-600" />
            </div>
            <p className="text-2xl font-bold text-[#172E08]">
              {formatearMoneda(aplicacion.costo_por_arbol || 0)}
            </p>
            <p className="text-xs text-[#4D240F]/60 mt-1">Costo por Árbol</p>
          </div>
        </div>

        {/* TABS NAVEGABLES */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="border-b border-gray-200">
            <div className="flex gap-1 px-6">
              <button
                onClick={() => setTabActivo('comparacion')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  tabActivo === 'comparacion'
                    ? 'border-[#73991C] text-[#73991C]'
                    : 'border-transparent text-[#4D240F]/60 hover:text-[#172E08]'
                }`}
              >
                Comparación
              </button>
              <button
                onClick={() => setTabActivo('lotes')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  tabActivo === 'lotes'
                    ? 'border-[#73991C] text-[#73991C]'
                    : 'border-transparent text-[#4D240F]/60 hover:text-[#172E08]'
                }`}
              >
                Por Lote ({lotes.length})
              </button>
              <button
                onClick={() => setTabActivo('productos')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  tabActivo === 'productos'
                    ? 'border-[#73991C] text-[#73991C]'
                    : 'border-transparent text-[#4D240F]/60 hover:text-[#172E08]'
                }`}
              >
                Por Productos ({productos.length})
              </button>
              <button
                onClick={() => setTabActivo('manoObra')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  tabActivo === 'manoObra'
                    ? 'border-[#73991C] text-[#73991C]'
                    : 'border-transparent text-[#4D240F]/60 hover:text-[#172E08]'
                }`}
              >
                Mano de Obra ({manoObra.length})
              </button>
            </div>
          </div>

          {/* CONTENIDO DE TABS */}
          <div className="p-6">
            {/* TAB: COMPARACIÓN */}
            {tabActivo === 'comparacion' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-[#172E08] mb-4">Planificado vs Real</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#F8FAF5] border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-[#172E08]">
                            Métrica
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                            Planificado
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                            Real
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                            Diferencia
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                            %
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {aplicacion.tipo_aplicacion === 'Fumigación' && (
                          <>
                            <tr>
                              <td className="px-4 py-3 text-sm text-[#172E08]">Litros de mezcla</td>
                              <td className="px-4 py-3 text-sm text-right">
                                {formatearNumero(datosCalculados.total_litros_mezcla, 1)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right">
                                {formatearNumero(datosCalculados.total_litros_mezcla, 1)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right">0,0</td>
                              <td className="px-4 py-3 text-sm text-right">0,0%</td>
                            </tr>
                            <tr>
                              <td className="px-4 py-3 text-sm text-[#172E08]">Canecas</td>
                              <td className="px-4 py-3 text-sm text-right">
                                {formatearNumero(datosCalculados.total_canecas, 1)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right">-</td>
                              <td className="px-4 py-3 text-sm text-right">-</td>
                              <td className="px-4 py-3 text-sm text-right">-</td>
                            </tr>
                          </>
                        )}
                        {(aplicacion.tipo_aplicacion === 'Fertilización' ||
                          aplicacion.tipo_aplicacion === 'Drench') && (
                          <>
                            <tr>
                              <td className="px-4 py-3 text-sm text-[#172E08]">Kilogramos</td>
                              <td className="px-4 py-3 text-sm text-right">
                                {formatearNumero(datosCalculados.total_kilos, 1)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right">
                                {formatearNumero(datosCalculados.total_kilos, 1)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right">0,0</td>
                              <td className="px-4 py-3 text-sm text-right">0,0%</td>
                            </tr>
                            <tr>
                              <td className="px-4 py-3 text-sm text-[#172E08]">Bultos (50 kg)</td>
                              <td className="px-4 py-3 text-sm text-right">
                                {formatearNumero(datosCalculados.total_bultos, 0)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right">-</td>
                              <td className="px-4 py-3 text-sm text-right">-</td>
                              <td className="px-4 py-3 text-sm text-right">-</td>
                            </tr>
                          </>
                        )}
                        <tr className="bg-[#F8FAF5]">
                          <td className="px-4 py-3 text-sm font-medium text-[#172E08]">
                            Costo Total
                          </td>
                          <td className="px-4 py-3 text-sm text-right">-</td>
                          <td className="px-4 py-3 text-sm text-right font-medium">
                            {formatearMoneda(aplicacion.costo_total || 0)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">-</td>
                          <td className="px-4 py-3 text-sm text-right">-</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Información adicional */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm font-medium text-[#172E08] mb-3">Fechas</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#4D240F]/60">Planeado:</span>
                        <span className="text-[#172E08]">
                          {formatearFecha(aplicacion.fecha_inicio_planeada)} -{' '}
                          {formatearFecha(aplicacion.fecha_fin_planeada)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#4D240F]/60">Real:</span>
                        <span className="text-[#172E08]">
                          {formatearFecha(aplicacion.fecha_inicio_ejecucion)} -{' '}
                          {formatearFecha(aplicacion.fecha_fin_ejecucion)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm font-medium text-[#172E08] mb-3">Responsable</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#4D240F]/60">Agrónomo:</span>
                        <span className="text-[#172E08]">
                          {aplicacion.agronomo_responsable || '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#4D240F]/60">Propósito:</span>
                        <span className="text-[#172E08]">{aplicacion.proposito || '-'}</span>
                      </div>
                      {aplicacion.blanco_biologico && (
                        <div className="flex justify-between">
                          <span className="text-[#4D240F]/60">Blanco:</span>
                          <span className="text-[#172E08] flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            {aplicacion.blanco_biologico}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: POR LOTE */}
            {tabActivo === 'lotes' && (
              <div>
                <h3 className="font-semibold text-[#172E08] mb-4">Distribución por Lote</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#F8FAF5] border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-[#172E08]">
                          Lote
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                          Árboles
                        </th>
                        {aplicacion.tipo_aplicacion === 'Fumigación' && (
                          <>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                              Litros
                            </th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                              Canecas
                            </th>
                          </>
                        )}
                        {aplicacion.tipo_aplicacion !== 'Fumigación' && (
                          <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                            Kilogramos
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lotes.map((lote, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-[#172E08] font-medium">
                            {lote.lote_nombre}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatearNumero(lote.total_arboles, 0)}
                          </td>
                          {aplicacion.tipo_aplicacion === 'Fumigación' && (
                            <>
                              <td className="px-4 py-3 text-sm text-right">
                                {formatearNumero(lote.litros_mezcla, 1)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right">
                                {formatearNumero(lote.numero_canecas, 1)}
                              </td>
                            </>
                          )}
                          {aplicacion.tipo_aplicacion !== 'Fumigación' && (
                            <td className="px-4 py-3 text-sm text-right">
                              {formatearNumero(lote.kilos_totales, 1)}
                            </td>
                          )}
                        </tr>
                      ))}
                      <tr className="bg-[#F8FAF5] font-medium">
                        <td className="px-4 py-3 text-sm text-[#172E08]">TOTAL</td>
                        <td className="px-4 py-3 text-sm text-right">
                          {formatearNumero(datosCalculados.total_arboles, 0)}
                        </td>
                        {aplicacion.tipo_aplicacion === 'Fumigación' && (
                          <>
                            <td className="px-4 py-3 text-sm text-right">
                              {formatearNumero(datosCalculados.total_litros_mezcla, 1)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {formatearNumero(datosCalculados.total_canecas, 1)}
                            </td>
                          </>
                        )}
                        {aplicacion.tipo_aplicacion !== 'Fumigación' && (
                          <td className="px-4 py-3 text-sm text-right">
                            {formatearNumero(datosCalculados.total_kilos, 1)}
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: POR PRODUCTOS */}
            {tabActivo === 'productos' && (
              <div>
                <h3 className="font-semibold text-[#172E08] mb-4">Productos Utilizados</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#F8FAF5] border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-[#172E08]">
                          Producto
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-[#172E08]">
                          Categoría
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                          Planificado
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                          Real
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                          Diferencia
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                          Costo
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {productos.map((prod, idx) => {
                        const diferencia = prod.cantidad_real
                          ? prod.cantidad_real - prod.cantidad_planificada
                          : 0;
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-[#172E08] font-medium">
                              {prod.producto_nombre}
                            </td>
                            <td className="px-4 py-3 text-sm text-[#4D240F]/70">
                              {prod.categoria}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {formatearNumero(prod.cantidad_planificada, 2)} {prod.unidad}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {prod.cantidad_real
                                ? `${formatearNumero(prod.cantidad_real, 2)} ${prod.unidad}`
                                : '-'}
                            </td>
                            <td
                              className={`px-4 py-3 text-sm text-right ${
                                diferencia > 0
                                  ? 'text-red-600'
                                  : diferencia < 0
                                  ? 'text-green-600'
                                  : ''
                              }`}
                            >
                              {prod.cantidad_real
                                ? `${formatearNumero(diferencia, 2)} ${prod.unidad}`
                                : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {prod.cantidad_real ? formatearMoneda(prod.costo_total) : '-'}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-[#F8FAF5] font-medium">
                        <td colSpan={5} className="px-4 py-3 text-sm text-[#172E08] text-right">
                          TOTAL
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {formatearMoneda(aplicacion.costo_total_insumos || 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: MANO DE OBRA */}
            {tabActivo === 'manoObra' && (
              <div>
                <h3 className="font-semibold text-[#172E08] mb-4">
                  Detalle de Mano de Obra por Actividad
                </h3>
                {manoObra.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#F8FAF5] border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-[#172E08]">
                            Lote
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                            Aplicación
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                            Mezcla
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                            Transporte
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                            Total Jornales
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                            Valor Jornal
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-[#172E08]">
                            Costo Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {manoObra.map((mo, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-[#172E08] font-medium">
                              {mo.lote_nombre}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {formatearNumero(mo.jornales_aplicacion, 1)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {formatearNumero(mo.jornales_mezcla, 1)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {formatearNumero(mo.jornales_transporte, 1)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium">
                              {formatearNumero(mo.jornales_total, 1)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {formatearMoneda(mo.valor_jornal)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium">
                              {formatearMoneda(mo.costo_total)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-[#F8FAF5] font-medium">
                          <td className="px-4 py-3 text-sm text-[#172E08]">TOTAL</td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatearNumero(
                              manoObra.reduce((sum, mo) => sum + mo.jornales_aplicacion, 0),
                              1
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatearNumero(
                              manoObra.reduce((sum, mo) => sum + mo.jornales_mezcla, 0),
                              1
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatearNumero(
                              manoObra.reduce((sum, mo) => sum + mo.jornales_transporte, 0),
                              1
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatearNumero(aplicacion.jornales_utilizados || 0, 1)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">-</td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatearMoneda(aplicacion.costo_total_mano_obra || 0)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-[#4D240F]/60">
                    <Users className="w-16 h-16 mx-auto mb-4 text-[#4D240F]/30" />
                    <p className="text-[#172E08] mb-2">No hay registros de jornales</p>
                    <p className="text-sm">
                      Los detalles de mano de obra aún no han sido registrados
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}