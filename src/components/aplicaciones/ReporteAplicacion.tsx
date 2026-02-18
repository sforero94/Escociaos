import { useState, useEffect } from 'react';
import {
  ArrowLeft, DollarSign, Users, Calendar, MapPin,
  Package, FileText, TrendingUp, TrendingDown, Loader2,
  Droplet, Leaf, Target,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { Button } from '../ui/button';
import { fetchDatosReporteCierre, fetchAplicacionesComparables } from '../../utils/fetchDatosReporteCierre';
import { generarPDFReporteCierre } from '../../utils/generarPDFReporteCierre';
import { formatearMoneda, formatearNumero } from '../../utils/format';
import type { DatosReporteCierre } from '../../utils/generarPDFReporteCierre';
import type { AplicacionComparable } from '../../utils/fetchDatosReporteCierre';
import type { Aplicacion } from '../../types/aplicaciones';

interface ReporteAplicacionProps {
  aplicacion: Aplicacion;
  onClose: () => void;
}

function DeltaBadge({ current, previous, inverted = false }: {
  current: number;
  previous: number;
  inverted?: boolean;
}) {
  if (previous === 0) return null;
  const delta = ((current - previous) / previous) * 100;
  const isPositive = delta > 0;
  const isGood = inverted ? !isPositive : isPositive;

  return (
    <div className={`flex items-center gap-1 text-sm font-medium ${isGood ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
      <span>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
    </div>
  );
}

function formatFechaCorta(fecha?: string): string {
  if (!fecha) return '-';
  const [year, month, day] = fecha.split('T')[0].split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(day)} ${meses[parseInt(month) - 1]} ${year}`;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function ReporteAplicacion({ aplicacion, onClose }: ReporteAplicacionProps) {
  const [datos, setDatos] = useState<DatosReporteCierre | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [comparables, setComparables] = useState<AplicacionComparable[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [datosComparacion, setDatosComparacion] = useState<DatosReporteCierre | null>(null);
  const [loadingComparacion, setLoadingComparacion] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  // Load main data + comparable apps on mount
  useEffect(() => {
    const cargarDatos = async () => {
      setLoading(true);
      try {
        const tipoApp = aplicacion.tipo_aplicacion || aplicacion.tipo || '';
        const [reporteData, appsComparables] = await Promise.all([
          fetchDatosReporteCierre(aplicacion.id),
          fetchAplicacionesComparables(aplicacion.id, tipoApp),
        ]);
        setDatos(reporteData);
        setComparables(appsComparables);
      } catch (err: any) {
        setError(err.message || 'Error cargando datos del reporte');
      } finally {
        setLoading(false);
      }
    };
    cargarDatos();
  }, [aplicacion.id]);

  // Load comparison data when user selects one
  useEffect(() => {
    if (!selectedCompId) {
      setDatosComparacion(null);
      return;
    }
    const cargar = async () => {
      setLoadingComparacion(true);
      try {
        const data = await fetchDatosReporteCierre(selectedCompId);
        setDatosComparacion(data);
      } catch {
        setDatosComparacion(null);
      } finally {
        setLoadingComparacion(false);
      }
    };
    cargar();
  }, [selectedCompId]);

  const descargarPDF = async () => {
    if (!datos) return;
    setGenerandoPDF(true);
    try {
      generarPDFReporteCierre(datos);
    } finally {
      setGenerandoPDF(false);
    }
  };

  const getTipoIcon = () => {
    const tipo = datos?.tipo_aplicacion || '';
    if (tipo.toLowerCase().includes('fumig')) return <Droplet className="w-5 h-5" />;
    if (tipo.toLowerCase().includes('fertil')) return <Leaf className="w-5 h-5" />;
    return <Target className="w-5 h-5" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-[#73991C]/20 border-t-[#73991C] rounded-full animate-spin mb-4"></div>
          <p className="text-[#4D240F]/70">Cargando reporte...</p>
        </div>
      </div>
    );
  }

  if (error || !datos) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-2xl mb-4">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-2xl text-[#172E08] mb-2">Error</h2>
        <p className="text-[#4D240F]/70 mb-4">{error}</p>
        <button onClick={onClose} className="px-6 py-2 bg-[#73991C] hover:bg-[#5f7a17] text-white rounded-xl transition-colors">
          Volver a Aplicaciones
        </button>
      </div>
    );
  }

  // Chart data
  const costBreakdownData = [
    {
      name: 'Actual',
      insumos: datos.costo_total_insumos,
      mano_obra: datos.costo_total_mano_obra,
    },
    ...(datosComparacion ? [{
      name: datosComparacion.nombre.length > 20 ? datosComparacion.nombre.substring(0, 20) + '...' : datosComparacion.nombre,
      insumos: datosComparacion.costo_total_insumos,
      mano_obra: datosComparacion.costo_total_mano_obra,
    }] : []),
  ];

  const comparisonChartData = datosComparacion ? [
    { name: 'Insumos', actual: datos.costo_total_insumos, anterior: datosComparacion.costo_total_insumos },
    { name: 'Mano de Obra', actual: datos.costo_total_mano_obra, anterior: datosComparacion.costo_total_mano_obra },
    { name: 'Costo Total', actual: datos.costo_total, anterior: datosComparacion.costo_total },
    { name: 'Costo/Árbol', actual: datos.costo_por_arbol, anterior: datosComparacion.costo_por_arbol },
  ] : [];

  const insumoPct = datos.costo_total > 0 ? ((datos.costo_total_insumos / datos.costo_total) * 100).toFixed(0) : '0';
  const mobraPct = datos.costo_total > 0 ? ((datos.costo_total_mano_obra / datos.costo_total) * 100).toFixed(0) : '0';

  return (
    <div className="space-y-6 pb-8">
      {/* ============================================================ */}
      {/* SECTION A: HEADER */}
      {/* ============================================================ */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[#4D240F]" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#172E08]">{datos.nombre}</h1>
              <span className="px-3 py-1 bg-[#73991C]/10 text-[#73991C] rounded-lg text-sm font-medium flex items-center gap-1.5">
                {getTipoIcon()}
                {datos.tipo_aplicacion}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-[#4D240F]/70 mt-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Cerrada: {formatFechaCorta(datos.fecha_cierre)}
              </span>
              {datos.dias_aplicacion > 0 && (
                <>
                  <span className="text-[#4D240F]/30">|</span>
                  <span>{datos.dias_aplicacion} dias de ejecucion</span>
                </>
              )}
              {datos.proposito && (
                <>
                  <span className="text-[#4D240F]/30">|</span>
                  <span className="truncate max-w-[200px]">{datos.proposito}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Comparison dropdown */}
          <div className="relative">
            <select
              value={selectedCompId || ''}
              onChange={(e) => setSelectedCompId(e.target.value || null)}
              className="px-4 py-2 pr-8 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C] text-sm bg-white min-w-[200px] appearance-none"
            >
              <option value="">Comparar con...</option>
              {comparables.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.nombre} ({formatFechaCorta(app.fecha_cierre)})
                </option>
              ))}
            </select>
            {loadingComparacion && (
              <Loader2 className="w-4 h-4 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-[#73991C]" />
            )}
          </div>

          {/* PDF export */}
          <Button
            onClick={descargarPDF}
            disabled={generandoPDF}
            className="bg-[#73991C] hover:bg-[#5f7d17] text-white"
          >
            {generandoPDF ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Comparison banner */}
      {datosComparacion && (
        <div className="bg-[#73991C]/5 border border-[#73991C]/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-[#172E08]">
            Comparando con: <strong>{datosComparacion.nombre}</strong> ({formatFechaCorta(datosComparacion.fecha_cierre)})
          </p>
          <button
            onClick={() => setSelectedCompId(null)}
            className="text-sm text-[#73991C] hover:text-[#5f7d17] font-medium"
          >
            Quitar comparacion
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION B: HERO KPIs (Tier 1) */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Costo Total */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-[#73991C] to-[#5f7d17] rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            {datosComparacion && (
              <DeltaBadge current={datos.costo_total} previous={datosComparacion.costo_total} inverted />
            )}
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{formatearMoneda(datos.costo_total)}</h3>
          <p className="text-sm text-gray-600 font-medium mt-1">Costo Total</p>
          {datosComparacion && (
            <p className="text-xs text-gray-400 mt-1">
              Anterior: {formatearMoneda(datosComparacion.costo_total)}
            </p>
          )}
        </div>

        {/* Costo por Arbol */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            {datosComparacion && (
              <DeltaBadge current={datos.costo_por_arbol} previous={datosComparacion.costo_por_arbol} inverted />
            )}
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{formatearMoneda(datos.costo_por_arbol)}</h3>
          <p className="text-sm text-gray-600 font-medium mt-1">Costo por Arbol</p>
          {datosComparacion && (
            <p className="text-xs text-gray-400 mt-1">
              Anterior: {formatearMoneda(datosComparacion.costo_por_arbol)}
            </p>
          )}
        </div>

        {/* Total Arboles */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Leaf className="w-6 h-6 text-white" />
            </div>
            {datosComparacion && (
              <DeltaBadge current={datos.total_arboles} previous={datosComparacion.total_arboles} />
            )}
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{datos.total_arboles.toLocaleString('es-CO')}</h3>
          <p className="text-sm text-gray-600 font-medium mt-1">Arboles Tratados</p>
          {datosComparacion && (
            <p className="text-xs text-gray-400 mt-1">
              Anterior: {datosComparacion.total_arboles.toLocaleString('es-CO')}
            </p>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION C: COST BREAKDOWN (Tier 2) */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Cost distribution chart */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-[#172E08] mb-6">Distribucion de Costos</h3>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={costBreakdownData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tickFormatter={(v) => formatCompact(v)} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#6B7280', fontSize: 12 }} width={80} />
                <Tooltip formatter={(v: any) => formatearMoneda(v)} />
                <Legend />
                <Bar dataKey="insumos" stackId="a" fill="#3B82F6" name="Insumos" />
                <Bar dataKey="mano_obra" stackId="a" fill="#8B5CF6" name="Mano de Obra" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Percentage breakdown */}
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-600">Insumos</p>
              <p className="text-lg font-semibold text-blue-600">{formatearMoneda(datos.costo_total_insumos)}</p>
              <p className="text-xs text-gray-400">{insumoPct}% del total</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Mano de Obra</p>
              <p className="text-lg font-semibold text-purple-600">{formatearMoneda(datos.costo_total_mano_obra)}</p>
              <p className="text-xs text-gray-400">{mobraPct}% del total</p>
            </div>
          </div>
        </div>

        {/* Right: Efficiency mini-KPIs */}
        <div className="space-y-4">
          {/* Arboles por Jornal */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Arboles por Jornal</p>
                <p className="text-xl font-bold text-[#172E08]">{formatearNumero(datos.arboles_por_jornal, 1)}</p>
              </div>
              <div className="flex items-center gap-3">
                {datosComparacion && (
                  <DeltaBadge current={datos.arboles_por_jornal} previous={datosComparacion.arboles_por_jornal} />
                )}
                <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-teal-600" />
                </div>
              </div>
            </div>
            {datosComparacion && (
              <p className="text-xs text-gray-400 mt-2">
                Anterior: {formatearNumero(datosComparacion.arboles_por_jornal, 1)}
              </p>
            )}
          </div>

          {/* Dias de Ejecucion */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Dias de Ejecucion</p>
                <p className="text-xl font-bold text-[#172E08]">{datos.dias_aplicacion} dias</p>
              </div>
              <div className="flex items-center gap-3">
                {datosComparacion && (
                  <DeltaBadge current={datos.dias_aplicacion} previous={datosComparacion.dias_aplicacion} inverted />
                )}
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-amber-600" />
                </div>
              </div>
            </div>
            {datosComparacion && (
              <p className="text-xs text-gray-400 mt-2">
                Anterior: {datosComparacion.dias_aplicacion} dias
              </p>
            )}
          </div>

          {/* Jornales Utilizados */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Jornales Utilizados</p>
                <p className="text-xl font-bold text-[#172E08]">{formatearNumero(datos.jornales_utilizados, 1)}</p>
                <p className="text-xs text-gray-400 mt-1">Valor jornal: {formatearMoneda(datos.valor_jornal)}</p>
              </div>
              <div className="flex items-center gap-3">
                {datosComparacion && (
                  <DeltaBadge current={datos.jornales_utilizados} previous={datosComparacion.jornales_utilizados} inverted />
                )}
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
              </div>
            </div>
            {datosComparacion && (
              <p className="text-xs text-gray-400 mt-2">
                Anterior: {formatearNumero(datosComparacion.jornales_utilizados, 1)} ({formatearMoneda(datosComparacion.valor_jornal)}/jornal)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION D: COMPARISON COST CHART (only when comparing) */}
      {/* ============================================================ */}
      {datosComparacion && (
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-[#172E08] mb-6">
            Comparacion de Costos: Actual vs {datosComparacion.nombre}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={comparisonChartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip formatter={(v: any) => formatearMoneda(v)} />
                <Legend />
                <Bar dataKey="actual" fill="#73991C" name="Actual" radius={[4, 4, 0, 0]} />
                <Bar dataKey="anterior" fill="#BFD97D" name="Anterior" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION E: PRODUCT COMPARISON TABLE (Tier 3) */}
      {/* ============================================================ */}
      {datos.comparacion_productos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#172E08] flex items-center gap-2">
              <Package className="w-5 h-5 text-[#73991C]" />
              Comparacion de Productos (Planeado vs Real)
            </h3>
            <span className="text-sm text-[#4D240F]/60">
              {datos.comparacion_productos.filter(p => Math.abs(p.porcentaje_desviacion) > 20).length} producto(s) con alta desviacion
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAF5]">
                <tr>
                  <th className="text-left py-3 px-5 text-xs text-[#4D240F]/70 font-medium">Producto</th>
                  <th className="text-right py-3 px-4 text-xs text-[#4D240F]/70 font-medium">Planeado</th>
                  <th className="text-right py-3 px-4 text-xs text-[#4D240F]/70 font-medium">Real</th>
                  <th className="text-right py-3 px-4 text-xs text-[#4D240F]/70 font-medium">Diferencia</th>
                  <th className="text-right py-3 px-4 text-xs text-[#4D240F]/70 font-medium">Desviacion</th>
                  <th className="text-right py-3 px-4 text-xs text-[#4D240F]/70 font-medium">Costo</th>
                  {datosComparacion && (
                    <th className="text-right py-3 px-4 text-xs text-[#4D240F]/70 font-medium">Costo Anterior</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#73991C]/5">
                {datos.comparacion_productos.map((prod, i) => {
                  const highDeviation = Math.abs(prod.porcentaje_desviacion) > 20;
                  const prevProd = datosComparacion?.comparacion_productos.find(
                    (p) => p.producto_nombre === prod.producto_nombre
                  );

                  return (
                    <tr key={i} className={`hover:bg-[#F8FAF5] transition-colors ${highDeviation ? 'bg-red-50/50' : ''}`}>
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#172E08]">{prod.producto_nombre}</span>
                          {highDeviation && (
                            <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">Alta desv.</span>
                          )}
                        </div>
                        <div className="text-xs text-[#4D240F]/50">{prod.producto_unidad}</div>
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-[#172E08]">
                        {formatearNumero(prod.cantidad_planeada)}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-[#73991C]">
                        {formatearNumero(prod.cantidad_real)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm ${
                          prod.diferencia > 0.1 ? 'bg-red-50 text-red-700' :
                          prod.diferencia < -0.1 ? 'bg-amber-50 text-amber-700' :
                          'bg-gray-50 text-gray-700'
                        }`}>
                          {prod.diferencia > 0 ? '+' : ''}{formatearNumero(prod.diferencia)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`text-sm font-medium ${
                          Math.abs(prod.porcentaje_desviacion) > 20 ? 'text-red-600' :
                          Math.abs(prod.porcentaje_desviacion) > 10 ? 'text-amber-600' :
                          'text-gray-600'
                        }`}>
                          {prod.porcentaje_desviacion > 0 ? '+' : ''}{prod.porcentaje_desviacion.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-[#172E08]">
                        {formatearMoneda(prod.costo_total)}
                      </td>
                      {datosComparacion && (
                        <td className="py-3 px-4 text-right text-sm text-gray-500">
                          {prevProd ? formatearMoneda(prevProd.costo_total) : '-'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals footer */}
              <tfoot className="bg-[#F8FAF5] border-t border-gray-200">
                <tr>
                  <td className="py-3 px-5 text-sm font-semibold text-[#172E08]">Total</td>
                  <td className="py-3 px-4 text-right text-sm font-semibold text-[#172E08]">
                    {formatearNumero(datos.comparacion_productos.reduce((s, p) => s + p.cantidad_planeada, 0))}
                  </td>
                  <td className="py-3 px-4 text-right text-sm font-semibold text-[#73991C]">
                    {formatearNumero(datos.comparacion_productos.reduce((s, p) => s + p.cantidad_real, 0))}
                  </td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4 text-right text-sm font-semibold text-[#172E08]">
                    {formatearMoneda(datos.comparacion_productos.reduce((s, p) => s + p.costo_total, 0))}
                  </td>
                  {datosComparacion && (
                    <td className="py-3 px-4 text-right text-sm font-semibold text-gray-500">
                      {formatearMoneda(datosComparacion.comparacion_productos.reduce((s, p) => s + p.costo_total, 0))}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION F: OPERATIONAL DETAILS (Tier 4) */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Lot breakdown */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-[#172E08] mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#73991C]" />
            Lotes Tratados
          </h3>
          <div className="space-y-3">
            {datos.lotes.map((lote, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-[#F8FAF5] rounded-xl">
                <span className="text-sm text-[#172E08]">{lote.nombre}</span>
                <span className="text-sm text-[#73991C] font-medium">
                  {lote.arboles.toLocaleString('es-CO')} arboles
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between p-3 bg-[#73991C]/10 rounded-xl font-medium">
              <span className="text-sm text-[#172E08]">Total</span>
              <span className="text-sm text-[#73991C]">
                {datos.total_arboles.toLocaleString('es-CO')} arboles
              </span>
            </div>
          </div>
        </div>

        {/* Right: Observations + Metadata */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-[#172E08] mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#73991C]" />
            Observaciones y Metadata
          </h3>

          {datos.observaciones_cierre && (
            <div className="mb-4">
              <p className="text-xs text-[#4D240F]/60 mb-1">Observaciones de cierre</p>
              <p className="text-sm text-[#172E08] bg-[#F8FAF5] rounded-lg p-3 italic">
                {datos.observaciones_cierre}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#4D240F]/60">Cerrado por</span>
              <span className="text-[#172E08]">{datos.cerrado_por || 'No registrado'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#4D240F]/60">Fecha de cierre</span>
              <span className="text-[#172E08]">{formatFechaCorta(datos.fecha_cierre)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#4D240F]/60">Inicio planeado</span>
              <span className="text-[#172E08]">{formatFechaCorta(datos.fecha_inicio_planeada)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#4D240F]/60">Inicio real</span>
              <span className="text-[#172E08]">{formatFechaCorta(datos.fecha_inicio_ejecucion)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#4D240F]/60">Dias de ejecucion</span>
              <span className="text-[#172E08]">{datos.dias_aplicacion} dias</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
