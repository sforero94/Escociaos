// ARCHIVO: components/aplicaciones/TendenciasAplicaciones.tsx
// DESCRIPCIÓN: Análisis de tendencias con gráficos navegables implementados
// Prioridad: 1.Costos totales, 2.Árboles/jornal, 3.Top productos, 4.L/árbol, 5.Costo/tipo, 6.Desviaciones

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Package,
  BarChart3,
  Activity,
  Download,
  Users,
  Droplet,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';

// ============================================
// INTERFACES
// ============================================

type VistaGrafico =
  | 'costos-totales'
  | 'arboles-jornal'
  | 'top-productos'
  | 'volumen-arbol'
  | 'costo-tipo'
  | 'desviaciones';

interface MetricaResumen {
  label: string;
  valor: string | number;
  icono: any;
  color: string;
  descripcion: string;
}

interface DatosCostos {
  mes: string;
  insumos: number;
  manoObra: number;
}

interface DatosEficiencia {
  mes: string;
  arbolesPorJornal: number;
}

interface ProductoTop {
  nombre: string;
  cantidadTotal: number;
  costoTotal: number;
  aplicaciones: number;
}

interface DatosVolumen {
  mes: string;
  litrosPorArbol: number;
}

interface DatosCostoTipo {
  tipo: string;
  costoPromedio: number;
}

interface DatosDesviacion {
  rango: string;
  cantidad: number;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function TendenciasAplicaciones() {
  const supabase = getSupabase();
  const [vistaActual, setVistaActual] = useState<VistaGrafico>('costos-totales');
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [rangoFechas, setRangoFechas] = useState({
    inicio: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    fin: new Date().toISOString().split('T')[0],
  });
  const [tipoFiltro, setTipoFiltro] = useState<'Todos' | 'Fumigación' | 'Fertilización' | 'Drench'>('Todos');

  // Datos de gráficos
  const [metricas, setMetricas] = useState<MetricaResumen[]>([]);
  const [datosCostos, setDatosCostos] = useState<DatosCostos[]>([]);
  const [datosEficiencia, setDatosEficiencia] = useState<DatosEficiencia[]>([]);
  const [productosTop, setProductosTop] = useState<ProductoTop[]>([]);
  const [datosVolumen, setDatosVolumen] = useState<DatosVolumen[]>([]);
  const [datosCostoTipo, setDatosCostoTipo] = useState<DatosCostoTipo[]>([]);
  const [datosDesviacion, setDatosDesviacion] = useState<DatosDesviacion[]>([]);

  const COLORES = ['#73991C', '#BFD97D', '#E7EDDD', '#4D240F', '#172E08'];

  // ============================================
  // DEFINICIÓN DE GRÁFICOS
  // ============================================

  const graficos = [
    {
      id: 'costos-totales' as VistaGrafico,
      titulo: 'Evolución de Costos Totales',
      icon: DollarSign,
      descripcion: 'Costos en el tiempo (total, insumos, mano de obra)',
    },
    {
      id: 'arboles-jornal' as VistaGrafico,
      titulo: 'Eficiencia: Árboles/Jornal',
      icon: TrendingUp,
      descripcion: 'Productividad de la mano de obra',
    },
    {
      id: 'top-productos' as VistaGrafico,
      titulo: 'Top 10 Productos Más Usados',
      icon: Package,
      descripcion: 'Productos con mayor consumo y costo',
    },
    {
      id: 'volumen-arbol' as VistaGrafico,
      titulo: 'Volumen por Árbol (L o Kg)',
      icon: Droplet,
      descripcion: 'Evolución de aplicación por árbol',
    },
    {
      id: 'costo-tipo' as VistaGrafico,
      titulo: 'Costo Promedio por Tipo',
      icon: BarChart3,
      descripcion: 'Comparación entre tipos de aplicación',
    },
    {
      id: 'desviaciones' as VistaGrafico,
      titulo: 'Distribución de Desviaciones',
      icon: Activity,
      descripcion: 'Histograma de desviaciones % planificado vs real',
    },
  ];

  // ============================================
  // CARGAR DATOS
  // ============================================

  useEffect(() => {
    if (rangoFechas.inicio && rangoFechas.fin) {
      cargarDatos();
    }
  }, [rangoFechas, tipoFiltro]);

  const cargarDatos = async () => {
    try {
      setIsLoading(true);

      // Cargar aplicaciones cerradas en el rango
      let query = supabase
        .from('aplicaciones')
        .select(`
          id,
          tipo_aplicacion,
          estado,
          fecha_inicio_ejecucion,
          fecha_fin_ejecucion,
          created_at,
          costo_total_insumos,
          costo_total_mano_obra
        `)
        .eq('estado', 'Cerrada')
        .gte('fecha_inicio_ejecucion', rangoFechas.inicio)
        .lte('fecha_inicio_ejecucion', rangoFechas.fin);

      if (tipoFiltro !== 'Todos') {
        query = query.eq('tipo_aplicacion', tipoFiltro);
      }

      const { data: aplicacionesCerradas, error } = await query;

      if (error) throw error;

      console.log(`📊 [TENDENCIAS] Total aplicaciones cerradas encontradas: ${aplicacionesCerradas?.length || 0}`);
      if (aplicacionesCerradas && aplicacionesCerradas.length > 0) {
        console.log('📋 Primeras 3 aplicaciones:', aplicacionesCerradas.slice(0, 3).map(a => ({
          codigo: a.codigo_aplicacion,
          fecha: a.fecha_inicio_ejecucion,
          estado: a.estado
        })));
      }

      // Calcular todas las métricas en paralelo
      await Promise.all([
        calcularMetricas(aplicacionesCerradas || []),
        calcularCostos(aplicacionesCerradas || []),
        calcularEficiencia(aplicacionesCerradas || []),
        calcularProductosTop(aplicacionesCerradas || []),
        calcularVolumenPorArbol(aplicacionesCerradas || []),
        calcularCostoPorTipo(aplicacionesCerradas || []),
        calcularDesviaciones(aplicacionesCerradas || []),
      ]);

    } catch (error) {
      console.error('Error cargando tendencias:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // CÁLCULOS
  // ============================================

  const calcularMetricas = async (aplicaciones: any[]) => {
    const totalAplicaciones = aplicaciones.length;
    
    // Calcular costos totales estimados
    let costoTotalInsumos = 0;
    let costoTotalManoObra = 0;

    for (const app of aplicaciones) {
      // Costo de insumos (productos)
      const { data: mezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', app.id);

      if (mezclas) {
        for (const mezcla of mezclas) {
          const { data: productos } = await supabase
            .from('aplicaciones_productos')
            .select('cantidad_total_necesaria, productos(precio_unitario)')
            .eq('mezcla_id', mezcla.id);

          if (productos) {
            productos.forEach((p: any) => {
              const cantidad = parseFloat(p.cantidad_total_necesaria) || 0;
              const precio = parseFloat(p.productos?.precio_unitario) || 0;
              costoTotalInsumos += cantidad * precio;
            });
          }
        }
      }

      // Costo de mano de obra (jornales * tarifa promedio)
      const { data: movimientos } = await supabase
        .from('movimientos_diarios')
        .select('numero_jornales')
        .eq('aplicacion_id', app.id);

      const jornalesTotales = movimientos?.reduce(
        (sum, m) => sum + (m.numero_jornales || 0),
        0
      ) || 0;
      
      // Tarifa promedio jornal (ajustar según tu realidad)
      const tarifaJornal = 50000; // COP
      costoTotalManoObra += jornalesTotales * tarifaJornal;
    }

    const costoTotal = costoTotalInsumos + costoTotalManoObra;
    const costoPromedio = totalAplicaciones > 0 ? costoTotal / totalAplicaciones : 0;

    setMetricas([
      {
        label: 'Total Aplicaciones',
        valor: totalAplicaciones,
        icono: Activity,
        color: 'bg-blue-50 text-blue-600 border-blue-200',
        descripcion: 'Aplicaciones cerradas',
      },
      {
        label: 'Costo Total',
        valor: `$${Math.round(costoTotal / 1000)}K`,
        icono: DollarSign,
        color: 'bg-green-50 text-green-600 border-green-200',
        descripcion: 'Insumos + Mano de obra',
      },
      {
        label: 'Costo Promedio',
        valor: `$${Math.round(costoPromedio / 1000)}K`,
        icono: TrendingUp,
        color: 'bg-purple-50 text-purple-600 border-purple-200',
        descripcion: 'Por aplicación',
      },
      {
        label: 'Costo Insumos',
        valor: `$${Math.round(costoTotalInsumos / 1000)}K`,
        icono: Package,
        color: 'bg-orange-50 text-orange-600 border-orange-200',
        descripcion: 'Solo productos',
      },
    ]);
  };

  const calcularCostos = async (aplicaciones: any[]) => {
    const costosPorMes: {
      [key: string]: { insumos: number; manoObra: number };
    } = {};

    for (const app of aplicaciones) {
      const fecha = new Date(app.fecha_cierre || app.created_at);
      const mesKey = `${fecha.getFullYear()}-${(fecha.getMonth() + 1)
        .toString()
        .padStart(2, '0')}`;

      if (!costosPorMes[mesKey]) {
        costosPorMes[mesKey] = { insumos: 0, manoObra: 0 };
      }

      // Usar los valores calculados de la tabla aplicaciones
      costosPorMes[mesKey].insumos += app.costo_total_insumos || 0;
      costosPorMes[mesKey].manoObra += app.costo_total_mano_obra || 0;
    }

    const datosFormateados: DatosCostos[] = Object.entries(costosPorMes)
      .sort()
      .map(([mes, costos]) => {
        const fecha = new Date(mes + '-01');
        return {
          mes: fecha.toLocaleDateString('es-CO', {
            month: 'short',
            year: '2-digit',
          }),
          insumos: Math.round(costos.insumos / 1000), // En miles
          manoObra: Math.round(costos.manoObra / 1000),
        };
      });

    setDatosCostos(datosFormateados);
  };

  const calcularEficiencia = async (aplicaciones: any[]) => {
    const eficienciaPorMes: { [key: string]: { arboles: number; jornales: number } } = {};

    for (const app of aplicaciones) {
      const fecha = new Date(app.fecha_inicio_ejecucion || app.created_at);
      const mesKey = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;

      if (!eficienciaPorMes[mesKey]) {
        eficienciaPorMes[mesKey] = { arboles: 0, jornales: 0 };
      }

      // ✅ CORRECTO: Obtener árboles de aplicaciones_calculos.total_arboles
      const { data: calculos } = await supabase
        .from('aplicaciones_calculos')
        .select('total_arboles')
        .eq('aplicacion_id', app.id);

      const arbolesTotales = calculos?.reduce(
        (sum, c) => sum + (c.total_arboles || 0),
        0
      ) || 0;

      // Obtener jornales
      const { data: movimientos } = await supabase
        .from('movimientos_diarios')
        .select('numero_jornales')
        .eq('aplicacion_id', app.id);

      const jornalesTotales = movimientos?.reduce(
        (sum, m) => sum + (m.numero_jornales || 0),
        0
      ) || 0;

      eficienciaPorMes[mesKey].arboles += arbolesTotales;
      eficienciaPorMes[mesKey].jornales += jornalesTotales;
    }

    const datosFormateados: DatosEficiencia[] = Object.entries(eficienciaPorMes)
      .sort()
      .map(([mes, datos]) => {
        const fecha = new Date(mes + '-01');
        const eficiencia = datos.jornales > 0 ? datos.arboles / datos.jornales : 0;
        return {
          mes: fecha.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
          arbolesPorJornal: Math.round(eficiencia),
        };
      });

    setDatosEficiencia(datosFormateados);
  };

  const calcularProductosTop = async (aplicaciones: any[]) => {
    const productosMap: {
      [nombre: string]: { cantidad: number; costo: number; aplicaciones: Set<string> };
    } = {};

    for (const app of aplicaciones) {
      const { data: mezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', app.id);

      if (mezclas) {
        for (const mezcla of mezclas) {
          const { data: productos } = await supabase
            .from('aplicaciones_productos')
            .select('cantidad_total_necesaria, productos(nombre, precio_unitario)')
            .eq('mezcla_id', mezcla.id);

          if (productos) {
            productos.forEach((p: any) => {
              const nombre = p.productos.nombre;
              const cantidad = parseFloat(p.cantidad_total_necesaria) || 0;
              const precio = parseFloat(p.productos.precio_unitario) || 0;

              if (!productosMap[nombre]) {
                productosMap[nombre] = { cantidad: 0, costo: 0, aplicaciones: new Set() };
              }

              productosMap[nombre].cantidad += cantidad;
              productosMap[nombre].costo += cantidad * precio;
              productosMap[nombre].aplicaciones.add(app.id);
            });
          }
        }
      }
    }

    const productosArray: ProductoTop[] = Object.entries(productosMap)
      .map(([nombre, data]) => ({
        nombre,
        cantidadTotal: Math.round(data.cantidad * 10) / 10,
        costoTotal: Math.round(data.costo),
        aplicaciones: data.aplicaciones.size,
      }))
      .sort((a, b) => b.costoTotal - a.costoTotal)
      .slice(0, 10);

    setProductosTop(productosArray);
  };

  const calcularVolumenPorArbol = async (aplicaciones: any[]) => {
    const volumenPorMes: { [key: string]: { volumen: number; arboles: number } } = {};

    for (const app of aplicaciones) {
      const fecha = new Date(app.fecha_inicio_ejecucion || app.created_at);
      const mesKey = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;

      if (!volumenPorMes[mesKey]) {
        volumenPorMes[mesKey] = { volumen: 0, arboles: 0 };
      }

      // Obtener volumen total
      const { data: mezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', app.id);

      if (mezclas) {
        for (const mezcla of mezclas) {
          const { data: productos } = await supabase
            .from('aplicaciones_productos')
            .select('cantidad_total_necesaria')
            .eq('mezcla_id', mezcla.id);

          const volumenTotal = productos?.reduce(
            (sum, p) => sum + (parseFloat(p.cantidad_total_necesaria) || 0),
            0
          ) || 0;

          volumenPorMes[mesKey].volumen += volumenTotal;
        }
      }

      // ✅ CORRECTO: Obtener árboles de aplicaciones_calculos.total_arboles
      const { data: calculos } = await supabase
        .from('aplicaciones_calculos')
        .select('total_arboles')
        .eq('aplicacion_id', app.id);

      const arbolesTotales = calculos?.reduce(
        (sum, c) => sum + (c.total_arboles || 0),
        0
      ) || 0;

      volumenPorMes[mesKey].arboles += arbolesTotales;
    }

    const datosFormateados: DatosVolumen[] = Object.entries(volumenPorMes)
      .sort()
      .map(([mes, datos]) => {
        const fecha = new Date(mes + '-01');
        const litrosPorArbol = datos.arboles > 0 ? datos.volumen / datos.arboles : 0;
        return {
          mes: fecha.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
          litrosPorArbol: Math.round(litrosPorArbol * 100) / 100,
        };
      });

    setDatosVolumen(datosFormateados);
  };

  const calcularCostoPorTipo = async (aplicaciones: any[]) => {
    const costosPorTipo: { [tipo: string]: { costo: number; cantidad: number } } = {
      'Fumigación': { costo: 0, cantidad: 0 },
      'Fertilización': { costo: 0, cantidad: 0 },
      'Drench': { costo: 0, cantidad: 0 },
    };

    for (const app of aplicaciones) {
      const tipo = app.tipo_aplicacion;

      // Costo insumos
      const { data: mezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', app.id);

      let costoApp = 0;
      if (mezclas) {
        for (const mezcla of mezclas) {
          const { data: productos } = await supabase
            .from('aplicaciones_productos')
            .select('cantidad_total_necesaria, productos(precio_unitario)')
            .eq('mezcla_id', mezcla.id);

          if (productos) {
            productos.forEach((p: any) => {
              const cantidad = parseFloat(p.cantidad_total_necesaria) || 0;
              const precio = parseFloat(p.productos?.precio_unitario) || 0;
              costoApp += cantidad * precio;
            });
          }
        }
      }

      // Costo mano de obra
      const { data: movimientos } = await supabase
        .from('movimientos_diarios')
        .select('numero_jornales')
        .eq('aplicacion_id', app.id);

      const jornalesTotales = movimientos?.reduce((sum, m) => sum + (m.numero_jornales || 0), 0) || 0;
      costoApp += jornalesTotales * 50000;

      costosPorTipo[tipo].costo += costoApp;
      costosPorTipo[tipo].cantidad += 1;
    }

    const datosFormateados: DatosCostoTipo[] = Object.entries(costosPorTipo)
      .filter(([_, data]) => data.cantidad > 0)
      .map(([tipo, data]) => ({
        tipo,
        costoPromedio: Math.round(data.costo / data.cantidad),
      }));

    setDatosCostoTipo(datosFormateados);
  };

  const calcularDesviaciones = async (aplicaciones: any[]) => {
    // NOTA: Esta funcionalidad requiere un campo de canecas planificadas que no existe en el esquema actual
    // Por ahora retornamos datos vacíos
    setDatosDesviacion([
      { rango: '< -20%', cantidad: 0 },
      { rango: '-20% a -10%', cantidad: 0 },
      { rango: '-10% a 0%', cantidad: 0 },
      { rango: '0% a 10%', cantidad: 0 },
      { rango: '10% a 20%', cantidad: 0 },
      { rango: '> 20%', cantidad: 0 },
    ]);
  };

  // ============================================
  // CUSTOM TOOLTIP
  // ============================================

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="text-[#172E08] mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: <span className="font-medium">{entry.value.toLocaleString()}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // ============================================
  // EXPORTAR
  // ============================================

  const exportarReporte = () => {
    const reporte = {
      fecha_generacion: new Date().toISOString(),
      rango: rangoFechas,
      tipo_filtro: tipoFiltro,
      metricas: metricas.map(m => ({ label: m.label, valor: m.valor, descripcion: m.descripcion })),
      costos_mensuales: datosCostos,
      eficiencia_mensual: datosEficiencia,
      top_productos: productosTop,
      volumen_por_arbol: datosVolumen,
      costo_por_tipo: datosCostoTipo,
      desviaciones: datosDesviacion,
    };

    const blob = new Blob([JSON.stringify(reporte, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tendencias_aplicaciones_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros generales */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[#172E08]">Filtros de Análisis</h3>
          <button
            onClick={exportarReporte}
            className="flex items-center gap-2 px-4 py-2 bg-[#73991C] text-white rounded-lg hover:bg-[#5C7A16] transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#172E08] mb-2">
              Fecha Inicio
            </label>
            <input
              type="date"
              value={rangoFechas.inicio}
              onChange={(e) => setRangoFechas({ ...rangoFechas, inicio: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#172E08] mb-2">
              Fecha Fin
            </label>
            <input
              type="date"
              value={rangoFechas.fin}
              onChange={(e) => setRangoFechas({ ...rangoFechas, fin: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#172E08] mb-2">
              Tipo de Aplicación
            </label>
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
            >
              <option value="Todos">Todos</option>
              <option value="Fumigación">Fumigación</option>
              <option value="Fertilización">Fertilización</option>
              <option value="Drench">Drench</option>
            </select>
          </div>
        </div>
      </div>

      {/* Métricas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricas.map((metrica, index) => {
          const Icono = metrica.icono;
          return (
            <div key={index} className={`bg-white rounded-xl border p-5 ${metrica.color}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-white/50 rounded-lg flex items-center justify-center">
                  <Icono className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-bold mb-1">{metrica.valor}</p>
              <p className="text-sm opacity-90 mb-1">{metrica.label}</p>
              <p className="text-xs opacity-70">{metrica.descripcion}</p>
            </div>
          );
        })}
      </div>

      {/* Tabs de gráficos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Navegación de gráficos */}
        <div className="border-b border-gray-200 p-4 overflow-x-auto">
          <div className="flex gap-2">
            {graficos.map((grafico, index) => {
              const Icon = grafico.icon;
              const isActive = vistaActual === grafico.id;

              return (
                <button
                  key={grafico.id}
                  onClick={() => setVistaActual(grafico.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-lg whitespace-nowrap
                    transition-all duration-200 min-w-fit
                    ${
                      isActive
                        ? 'bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white shadow-sm'
                        : 'text-[#4D240F]/70 hover:bg-[#E7EDDD]/50'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {index + 1}. {grafico.titulo.replace('Evolución de ', '').replace('Eficiencia: ', '').replace('Top 10 ', '')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Contenido del gráfico */}
        <div className="p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-[#172E08]">
              {graficos.find((g) => g.id === vistaActual)?.titulo}
            </h3>
            <p className="text-sm text-[#4D240F]/70">
              {graficos.find((g) => g.id === vistaActual)?.descripcion}
            </p>
          </div>

          {/* Gráfico 1: Costos Totales */}
          {vistaActual === 'costos-totales' && (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={datosCostos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7EDDD" />
                <XAxis dataKey="mes" stroke="#4D240F" style={{ fontSize: '12px' }} />
                <YAxis stroke="#4D240F" style={{ fontSize: '12px' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="insumos"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  name="Insumos"
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="manoObra"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  name="Mano de Obra"
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Gráfico 2: Árboles por Jornal */}
          {vistaActual === 'arboles-jornal' && (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={datosEficiencia}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7EDDD" />
                <XAxis dataKey="mes" stroke="#4D240F" style={{ fontSize: '12px' }} />
                <YAxis stroke="#4D240F" style={{ fontSize: '12px' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="arbolesPorJornal"
                  stroke="#10B981"
                  strokeWidth={3}
                  name="Árboles/Jornal"
                  dot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Gráfico 3: Top Productos */}
          {vistaActual === 'top-productos' && (
            <div className="space-y-4">
              {productosTop.map((producto, index) => {
                const maxCosto = Math.max(...productosTop.map((p) => p.costoTotal));
                const porcentaje = (producto.costoTotal / maxCosto) * 100;

                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#172E08] truncate flex-1 font-medium">
                        {index + 1}. {producto.nombre}
                      </span>
                      <span className="text-[#73991C] font-bold ml-4">
                        ${(producto.costoTotal / 1000).toFixed(1)}K
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div
                        className="h-full bg-gradient-to-r from-[#73991C] to-[#BFD97D] rounded-full"
                        style={{ width: `${porcentaje}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#4D240F]/60">
                      <span>{producto.cantidadTotal} L/Kg</span>
                      <span>{producto.aplicaciones} aplicaciones</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Gráfico 4: Volumen por Árbol */}
          {vistaActual === 'volumen-arbol' && (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={datosVolumen}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7EDDD" />
                <XAxis dataKey="mes" stroke="#4D240F" style={{ fontSize: '12px' }} />
                <YAxis stroke="#4D240F" style={{ fontSize: '12px' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="litrosPorArbol"
                  stroke="#06B6D4"
                  strokeWidth={3}
                  name="L/Árbol"
                  dot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Gráfico 5: Costo por Tipo */}
          {vistaActual === 'costo-tipo' && (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={datosCostoTipo}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7EDDD" />
                <XAxis dataKey="tipo" stroke="#4D240F" style={{ fontSize: '12px' }} />
                <YAxis stroke="#4D240F" style={{ fontSize: '12px' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="costoPromedio" name="Costo Promedio" fill="#73991C" />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Gráfico 6: Desviaciones */}
          {vistaActual === 'desviaciones' && (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={datosDesviacion}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7EDDD" />
                <XAxis dataKey="rango" stroke="#4D240F" style={{ fontSize: '12px' }} />
                <YAxis stroke="#4D240F" style={{ fontSize: '12px' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="cantidad" name="Aplicaciones" fill="#8B5CF6" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}