import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell } from 'recharts';
import { getSupabase } from '../../../utils/supabase/client';
import { formatNumber } from '../../../utils/format';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Label } from '../../ui/label';
import type { DistribucionData, FiltrosFinanzas, CategoriaGasto } from '../../../types/finanzas';

interface GraficoDistribucionConceptosProps {
  data: DistribucionData[];
  loading?: boolean;
  filtrosActivos?: FiltrosFinanzas;
  onCategoriaChange: (categoriaId: string | undefined) => void;
}

/**
 * Componente de gráfico de barras para distribución de gastos por concepto
 * Incluye un selector de categoría local que no afecta otros gráficos
 */
export function GraficoDistribucionConceptos({
  data,
  loading = false,
  filtrosActivos,
  onCategoriaChange
}: GraficoDistribucionConceptosProps) {
  const navigate = useNavigate();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | undefined>(undefined);
  const [loadingCategorias, setLoadingCategorias] = useState(true);

  // Colores para los conceptos
  const COLORS = [
    '#EF4444', // Rojo
    '#F59E0B', // Amarillo
    '#F97316', // Naranja
    '#EC4899', // Rosa
    '#8B5CF6', // Morado
    '#3B82F6', // Azul
    '#06B6D4', // Cyan
    '#14B8A6', // Teal
    '#10B981', // Verde
    '#84CC16', // Lima
    '#22C55E', // Verde lima
    '#6366F1', // Indigo
    '#A855F7', // Violeta
    '#F43F5E', // Rojo rosado
    '#EAB308', // Amarillo dorado
  ];

  // Cargar categorías al montar el componente
  useEffect(() => {
    loadCategorias();
  }, []);

  const loadCategorias = async () => {
    try {
      setLoadingCategorias(true);
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('fin_categorias_gastos')
        .select('*')
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;

      setCategorias(data || []);
    } catch (error) {
      setCategorias([]);
    } finally {
      setLoadingCategorias(false);
    }
  };

  const handleCategoriaChange = (value: string) => {
    const nuevaCategoria = value === 'todas' ? undefined : value;
    setCategoriaSeleccionada(nuevaCategoria);
    onCategoriaChange(nuevaCategoria);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-10 bg-gray-200 rounded w-64 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const nombreCategoriaSeleccionada = categoriaSeleccionada
    ? categorias.find(c => c.id === categoriaSeleccionada)?.nombre
    : 'Todas las categorías';

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Distribución de Gastos por Concepto
        </h3>

        {/* Selector de Categoría */}
        <div className="mb-6 max-w-md">
          <Label htmlFor="categoria-filter" className="text-sm text-gray-700 mb-2 block">
            Filtrar por Categoría
          </Label>
          <Select
            value={categoriaSeleccionada || 'todas'}
            onValueChange={handleCategoriaChange}
            disabled={loadingCategorias}
          >
            <SelectTrigger id="categoria-filter" className="w-full">
              <SelectValue placeholder="Seleccionar categoría..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {categorias.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            Este filtro solo afecta este gráfico
          </p>
        </div>

        <div className="h-64 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              📊
            </div>
            <p>No hay datos disponibles para {nombreCategoriaSeleccionada.toLowerCase()}</p>
          </div>
        </div>
      </div>
    );
  }

  // Ordenar datos de mayor a menor y asignar colores
  const chartData = [...data]
    .sort((a, b) => b.valor - a.valor)
    .map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));

  // Tooltip personalizado
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{data.categoria}</p>
          <p className="text-sm text-gray-600">
            Valor: <span className="font-semibold">${formatNumber(data.valor)}</span>
          </p>
          <p className="text-sm text-gray-600">
            Porcentaje: <span className="font-semibold">{data.porcentaje}%</span>
          </p>
          <p className="text-xs text-gray-500 mt-1 italic">
            Click para ver gastos de este concepto
          </p>
        </div>
      );
    }
    return null;
  };

  // Navegar a gastos con todos los filtros activos + concepto
  const handleBarClick = (data: any) => {
    if (data && data.categoria_id) {
      navigate('/finanzas/gastos', {
        state: {
          concepto: data.categoria_id, // categoria_id aquí es realmente concepto_id
          categoria: categoriaSeleccionada,
          periodo: filtrosActivos?.periodo,
          negocio_id: filtrosActivos?.negocio_id,
          region_id: filtrosActivos?.region_id,
          fecha_desde: filtrosActivos?.fecha_desde,
          fecha_hasta: filtrosActivos?.fecha_hasta
        }
      });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Distribución de Gastos por Concepto
      </h3>

      {/* Selector de Categoría */}
      <div className="mb-6 max-w-md">
        <Label htmlFor="categoria-filter" className="text-sm text-gray-700 mb-2 block">
          Filtrar por Categoría
        </Label>
        <Select
          value={categoriaSeleccionada || 'todas'}
          onValueChange={handleCategoriaChange}
          disabled={loadingCategorias}
        >
          <SelectTrigger id="categoria-filter" className="w-full">
            <SelectValue placeholder="Seleccionar categoría..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            {categorias.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500 mt-1">
          Este filtro solo afecta este gráfico
        </p>
      </div>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              type="number"
              tick={{ fill: '#6B7280', fontSize: 12 }}
              stroke="#E5E7EB"
              tickLine={false}
              tickFormatter={(value: number) => `$${formatNumber(value)}`}
            />
            <YAxis
              type="category"
              dataKey="categoria"
              tick={{ fill: '#6B7280', fontSize: 12 }}
              stroke="#E5E7EB"
              tickLine={false}
              width={150}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="valor"
              radius={[0, 8, 8, 0]}
              onClick={handleBarClick}
              cursor="pointer"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Resumen */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <p className="text-gray-600">Concepto Principal</p>
            <p className="text-lg font-semibold text-gray-900">
              {chartData[0]?.categoria}
            </p>
            <p className="text-sm text-gray-500">
              {chartData[0]?.porcentaje}% del total
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-600">Total de Conceptos</p>
            <p className="text-lg font-semibold text-gray-900">
              {chartData.length}
            </p>
            <p className="text-sm text-gray-500">
              Conceptos con gastos
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-600">Categoría Actual</p>
            <p className="text-lg font-semibold text-gray-900">
              {nombreCategoriaSeleccionada}
            </p>
            <p className="text-sm text-gray-500">
              Filtro local activo
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
