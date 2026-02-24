// components/aplicaciones/ReporteAplicacionCerrada.tsx
// Dashboard report for closed applications

import { useState } from 'react';
import { X, Download, TrendingUp, TrendingDown, Minus, Calendar, Droplet, Package, Users } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../ui/table';
import { useReporteAplicacion } from '../../hooks/useReporteAplicacion';
import { formatearFecha } from '../../utils/fechas';
import { formatearMoneda, formatearNumero } from '../../utils/calculosReporteAplicacion';
import type { KPICardData, FilaComparacion, DatosGraficoBarrasLote } from '../../types/aplicaciones';

// ============================================================================
// TYPES
// ============================================================================

interface ReporteAplicacionCerradaProps {
    aplicacionId: string;
    onClose: () => void;
}

// ============================================================================
// COLORS
// ============================================================================

const COLORS = {
    planeado: '#3B82F6',  // Blue
    real: '#73991C',      // Brand green
    anterior: '#F59E0B',  // Amber
    positivo: '#22C55E',  // Green
    negativo: '#EF4444',  // Red
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ReporteAplicacionCerrada({ aplicacionId, onClose }: ReporteAplicacionCerradaProps) {
    const [activeTab, setActiveTab] = useState<'canecas' | 'productos' | 'jornales'>('canecas');

    const {
        reporte,
        loading,
        error,
        aplicacionesComparables,
        seleccionarAnterior,
    } = useReporteAplicacion(aplicacionId);

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8 flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#73991C] border-t-transparent" />
                    <p className="text-gray-600">Cargando reporte...</p>
                </div>
            </div>
        );
    }

    if (error || !reporte) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8 max-w-md">
                    <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
                    <p className="text-gray-600 mb-4">{error || 'No se pudo cargar el reporte'}</p>
                    <Button onClick={onClose}>Cerrar</Button>
                </div>
            </div>
        );
    }

    const tipoLabel = reporte.tipo_aplicacion === 'Fertilización' ? 'Fertilización' : 'Fumigación';

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-hidden">
            <style>
                {`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #report-modal-content, #report-modal-content * {
                        visibility: visible;
                    }
                    #report-modal-content {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        height: auto;
                        overflow: visible !important;
                        background: white !important;
                        border-radius: 0 !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    /* Ensure scrollable content is fully expanded */
                    #report-modal-scroll {
                        overflow: visible !important;
                        height: auto !important;
                    }
                }
                `}
            </style>
            <div id="report-modal-content" className="bg-gray-50 w-full h-full md:w-[95vw] md:h-[95vh] md:rounded-xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-bold text-gray-900">
                                    {reporte.nombre_aplicacion || reporte.codigo_aplicacion}
                                </h1>
                                <Badge variant="secondary" className="bg-[#73991C]/10 text-[#73991C]">
                                    {tipoLabel}
                                </Badge>
                                <Badge variant="outline">Cerrada</Badge>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                <Calendar className="inline h-3 w-3 mr-1" />
                                {formatearFecha(reporte.fecha_inicio)} - {formatearFecha(reporte.fecha_fin)}
                                <span className="mx-2">•</span>
                                {reporte.dias_aplicacion} días
                                <span className="mx-2">•</span>
                                {formatearNumero(reporte.total_arboles, 0)} árboles
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Previous Application Selector */}
                        <div className="flex items-center gap-2 no-print">
                            <span className="text-sm text-gray-500">Comparar con:</span>
                            <Select
                                value={reporte.aplicacion_anterior_id || 'none'}
                                onValueChange={(val) => seleccionarAnterior(val === 'none' ? null : val)}
                            >
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Seleccionar anterior" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sin comparación</SelectItem>
                                    {aplicacionesComparables.map((app) => (
                                        <SelectItem key={app.id} value={app.id}>
                                            {app.nombre || app.codigo}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
                            <Download className="h-4 w-4 mr-2" />
                            PDF
                        </Button>

                        <Button variant="ghost" size="icon" onClick={onClose} className="no-print">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                </div>

                {/* Content - Scrollable */}
                <div id="report-modal-scroll" className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <KPICard icon={<Package className="h-5 w-5" />} data={reporte.kpis.costo_total} />
                        <KPICard icon={<Droplet className="h-5 w-5" />} data={reporte.kpis.canecas_totales} />
                        <KPICard icon={<TrendingUp className="h-5 w-5" />} data={reporte.kpis.eficiencia_planta} />
                        <KPICard icon={<Users className="h-5 w-5" />} data={reporte.kpis.arboles_jornal} />
                    </div>

                    {/* Charts Row 1 */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Costo Total - Últimas 3 Aplicaciones</CardTitle>
                                <CardDescription>Comparación histórica de costos</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={reporte.grafico_costos_historico}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="aplicacion" fontSize={12} />
                                        <YAxis tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} fontSize={12} />
                                        <Tooltip
                                            formatter={(value: number) => [formatearMoneda(value), 'Costo']}
                                            labelStyle={{ color: '#000' }}
                                        />
                                        <Bar dataKey="costoTotal" fill={COLORS.real} name="Costo Total" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Desglose de Costos</CardTitle>
                                <CardDescription>Productos vs Mano de Obra</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={reporte.grafico_costos_historico}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="aplicacion" fontSize={12} />
                                        <YAxis tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} fontSize={12} />
                                        <Tooltip
                                            formatter={(value: number) => [formatearMoneda(value)]}
                                            labelStyle={{ color: '#000' }}
                                        />
                                        <Legend />
                                        <Bar dataKey="costoProductos" stackId="a" fill={COLORS.planeado} name="Productos" />
                                        <Bar dataKey="costoJornales" stackId="a" fill={COLORS.anterior} name="Jornales" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Charts Row 2 - Horizontal */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <HorizontalComparisonChart
                            title={reporte.tipo_aplicacion === 'Fertilización' ? 'Bultos por Lote' : 'Canecas por Lote'}
                            description="Plan vs Real vs Anterior"
                            data={reporte.grafico_canecas_por_lote}
                            hasAnterior={!!reporte.aplicacion_anterior_id}
                        />
                        <HorizontalComparisonChart
                            title="Productos por Lote"
                            description="Cantidad total aplicada"
                            data={reporte.grafico_productos_por_lote}
                            hasAnterior={!!reporte.aplicacion_anterior_id}
                        />
                    </div>

                    {/* Charts Row 3 - Horizontal */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <HorizontalComparisonChart
                            title="Jornales por Lote"
                            description="Plan vs Real vs Anterior"
                            data={reporte.grafico_jornales_por_lote}
                            hasAnterior={!!reporte.aplicacion_anterior_id}
                        />
                        <HorizontalComparisonChart
                            title="Árboles/Jornal por Lote"
                            description="Eficiencia laboral"
                            data={reporte.grafico_eficiencia_por_lote}
                            hasAnterior={!!reporte.aplicacion_anterior_id}
                        />
                    </div>

                    {/* Detail Tables Tabs */}
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-4">
                                <CardTitle className="text-base">Detalle por Lote</CardTitle>
                                <div className="flex bg-gray-100 rounded-lg p-1">
                                    {(['canecas', 'productos', 'jornales'] as const).map((tab) => (
                                        <button
                                            key={tab}
                                            type="button"
                                            onClick={() => setActiveTab(tab)}
                                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === tab
                                                ? 'bg-[#73991C] text-white'
                                                : 'text-gray-600 hover:text-gray-900'
                                                }`}
                                        >
                                            {tab === 'canecas' && (reporte.tipo_aplicacion === 'Fertilización' ? 'Bultos' : 'Canecas')}
                                            {tab === 'productos' && 'Productos'}
                                            {tab === 'jornales' && 'Jornales'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {activeTab === 'canecas' && (
                                <CanecasTable
                                    totales={reporte.detalle_canecas.totales}
                                    porLote={reporte.detalle_canecas.por_lote}
                                    hasAnterior={!!reporte.aplicacion_anterior_id}
                                    tamanoCaneca={reporte.tamano_caneca || 200}
                                    tipoAplicacion={reporte.tipo_aplicacion}
                                />
                            )}
                            {activeTab === 'jornales' && (
                                <JornalesTable
                                    totales={reporte.detalle_jornales.totales}
                                    porLote={reporte.detalle_jornales.por_lote}
                                    hasAnterior={!!reporte.aplicacion_anterior_id}
                                />
                            )}
                            {activeTab === 'productos' && (
                                <ProductosTable
                                    totales={reporte.detalle_productos.totales}
                                    productsMap={reporte.detalle_productos.por_lote}
                                    lotes={reporte.detalle_canecas.por_lote}
                                    hasAnterior={!!reporte.aplicacion_anterior_id}
                                />
                            )}
                        </CardContent>
                    </Card>

                    {/* Alerts */}
                    {reporte.alertas.length > 0 && (
                        <Card className="border-amber-200 bg-amber-50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base text-amber-800">Alertas</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-1">
                                    {reporte.alertas.map((alerta, idx) => (
                                        <li key={idx} className="text-sm text-amber-700">{alerta}</li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function KPICard({ icon, data }: { icon: React.ReactNode; data: KPICardData }) {
    const ArrowIcon = data.desviacion > 0.5
        ? TrendingUp
        : data.desviacion < -0.5
            ? TrendingDown
            : Minus;

    const arrowColor = data.esPositivo ? 'text-green-600' : 'text-red-600';
    const bgColor = data.esPositivo ? 'bg-green-50' : 'bg-red-50';

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{data.titulo}</CardTitle>
                <div className="text-gray-400">{icon}</div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{data.valorFormateado}</div>
                <div className={`flex items-center gap-1 mt-1 text-xs ${arrowColor} ${bgColor} px-2 py-0.5 rounded-full w-fit`}>
                    <ArrowIcon className="h-3 w-3" />
                    <span>{Math.abs(data.desviacion).toFixed(1)}% {data.comparacion}</span>
                </div>
            </CardContent>
        </Card>
    );
}

function HorizontalComparisonChart({
    title,
    description,
    data,
    hasAnterior
}: {
    title: string;
    description: string;
    data: DatosGraficoBarrasLote[];
    hasAnterior: boolean;
}) {
    // Calculate chart height based on number of items
    const chartHeight = Math.max(200, data.length * 40 + 60);

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart data={data} layout="vertical" margin={{ left: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" fontSize={12} />
                        <YAxis type="category" dataKey="lote" fontSize={12} width={80} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="planeado" fill={COLORS.planeado} name="Plan" />
                        <Bar dataKey="real" fill={COLORS.real} name="Real" />
                        {hasAnterior && <Bar dataKey="anterior" fill={COLORS.anterior} name="Anterior" />}
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}

function CanecasTable({
    totales,
    porLote,
    hasAnterior,
    tamanoCaneca,
    tipoAplicacion
}: {
    totales: any;
    porLote: any[];
    hasAnterior: boolean;
    tamanoCaneca: number;
    tipoAplicacion: string;
}) {
    const renderComparison = (fila: FilaComparacion<number>) => {
        if (!fila) return null;
        return (
            <div className="text-right">
                <div className="font-medium">{formatearNumero(fila.real, 1)}</div>
                <div className="text-xs text-gray-500">
                    Plan: {formatearNumero(fila.planeado, 1)}
                    {hasAnterior && fila.anterior !== undefined && (
                        <> | Ant: {formatearNumero(fila.anterior, 1)}</>
                    )}
                </div>
                <DeviationBadge value={fila.desviacion} />
            </div>
        );
    };

    // Dynamic label based on application type
    const unidadLabel = tipoAplicacion === 'Fertilización' ? 'Bultos' : `Canecas (${tamanoCaneca}L)`;

    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="font-bold">Lote</TableHead>
                        <TableHead className="text-right">{unidadLabel}</TableHead>
                        <TableHead className="text-right">Litros Total</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {/* TOTAL row first */}
                    <TableRow className="bg-[#73991C]/10 font-bold">
                        <TableCell>{totales.lote_nombre}</TableCell>
                        <TableCell>{renderComparison(totales.canecas)}</TableCell>
                        <TableCell>{renderComparison(totales.litros_totales)}</TableCell>
                    </TableRow>
                    {/* Individual lots */}
                    {porLote.map((lote) => (
                        <TableRow key={lote.lote_id}>
                            <TableCell className="font-medium">{lote.lote_nombre}</TableCell>
                            <TableCell>{renderComparison(lote.canecas)}</TableCell>
                            <TableCell>{renderComparison(lote.litros_totales)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function JornalesTable({
    totales,
    porLote,
    hasAnterior
}: {
    totales: any;
    porLote: any[];
    hasAnterior: boolean;
}) {
    const renderComparison = (fila: FilaComparacion<number>) => {
        if (!fila) return null;
        return (
            <div className="text-right">
                <div className="font-medium">{formatearNumero(fila.real, 2)}</div>
                <div className="text-xs text-gray-500">
                    Plan: {formatearNumero(fila.planeado, 2)}
                    {hasAnterior && fila.anterior !== undefined && (
                        <> | Ant: {formatearNumero(fila.anterior, 2)}</>
                    )}
                </div>
                <DeviationBadge value={fila.desviacion} />
            </div>
        );
    };

    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="font-bold">Lote</TableHead>
                        <TableHead className="text-right">Preparación</TableHead>
                        <TableHead className="text-right">Aplicación</TableHead>
                        <TableHead className="text-right">Transporte</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Árboles/Jornal</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {/* TOTAL row first */}
                    <TableRow className="bg-[#73991C]/10 font-bold">
                        <TableCell>{totales.lote_nombre}</TableCell>
                        <TableCell>{renderComparison(totales.jornales_preparacion)}</TableCell>
                        <TableCell>{renderComparison(totales.jornales_aplicacion)}</TableCell>
                        <TableCell>{renderComparison(totales.jornales_transporte)}</TableCell>
                        <TableCell>{renderComparison(totales.jornales_total)}</TableCell>
                        <TableCell>{renderComparison(totales.arboles_por_jornal)}</TableCell>
                    </TableRow>
                    {/* Individual lots */}
                    {porLote.map((lote) => (
                        <TableRow key={lote.lote_id}>
                            <TableCell className="font-medium">{lote.lote_nombre}</TableCell>
                            <TableCell>{renderComparison(lote.jornales_preparacion)}</TableCell>
                            <TableCell>{renderComparison(lote.jornales_aplicacion)}</TableCell>
                            <TableCell>{renderComparison(lote.jornales_transporte)}</TableCell>
                            <TableCell>{renderComparison(lote.jornales_total)}</TableCell>
                            <TableCell>{renderComparison(lote.arboles_por_jornal)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function DeviationBadge({ value }: { value: number }) {
    if (Math.abs(value) < 1) return null;

    const isNegative = value < 0;
    const bgColor = isNegative ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
    const arrow = isNegative ? '↓' : '↑';

    return (
        <span className={`text-xs px-1.5 py-0.5 rounded ${bgColor}`}>
            {arrow}{Math.abs(value).toFixed(1)}%
        </span>
    );
}

function ProductosTable({
    totales,
    productsMap,
    lotes,
    hasAnterior
}: {
    totales: any[];
    productsMap: Record<string, any[]>;
    lotes: any[];
    hasAnterior: boolean;
}) {
    const renderComparison = (fila: any) => {
        if (!fila) return null;
        return (
            <div className="text-right">
                <div className="font-medium">{formatearNumero(fila.real, 2)}</div>
                <div className="text-xs text-gray-500">
                    Plan: {formatearNumero(fila.planeado, 2)}
                    {hasAnterior && fila.anterior !== undefined && (
                        <> | Ant: {formatearNumero(fila.anterior, 2)}</>
                    )}
                </div>
                <DeviationBadge value={fila.desviacion} />
            </div>
        );
    };

    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="font-bold">Producto</TableHead>
                        <TableHead className="text-right">Unidad</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Costo</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {/* TOTAL rows */}
                    <TableRow className="bg-[#73991C]/10 font-bold">
                        <TableCell colSpan={4}>TOTALES GENERALES</TableCell>
                    </TableRow>
                    {totales.map((prod) => (
                        <TableRow key={`total-${prod.producto_id}`} className="bg-[#73991C]/5">
                            <TableCell className="pl-8 font-medium">{prod.producto_nombre}</TableCell>
                            <TableCell className="text-right text-sm text-gray-500">{prod.unidad}</TableCell>
                            <TableCell>{renderComparison(prod.cantidad)}</TableCell>
                            <TableCell>{renderComparison(prod.costo)}</TableCell>
                        </TableRow>
                    ))}

                    {/* Per Lot */}
                    {lotes.map((lote) => {
                        const products = productsMap[lote.lote_id] || [];
                        if (products.length === 0) return null;

                        return (
                            <>
                                <TableRow key={`header-${lote.lote_id}`} className="bg-gray-50 font-bold border-t-2">
                                    <TableCell colSpan={4}>{lote.lote_nombre}</TableCell>
                                </TableRow>
                                {products.map((prod) => (
                                    <TableRow key={`${lote.lote_id}-${prod.producto_id}`}>
                                        <TableCell className="pl-8">{prod.producto_nombre}</TableCell>
                                        <TableCell className="text-right text-sm text-gray-500">{prod.unidad}</TableCell>
                                        <TableCell>{renderComparison(prod.cantidad)}</TableCell>
                                        <TableCell>{renderComparison(prod.costo)}</TableCell>
                                    </TableRow>
                                ))}
                            </>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

export default ReporteAplicacionCerrada;
