/**
 * Tab de Rentabilidad — Produccion Dashboard
 *
 * Para años >= 2026: tabla y barras por lote con costo/kg, desglose directo vs overhead,
 * precio de venta ponderado (fin_ingresos), y margen por kg.
 * Para 2023–2025: solo el costo/kg a nivel finca (fallback).
 *
 * Disclaimers obligatorios sobre limitaciones de datos.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { DollarSign, Info, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { useCostoKg, ANO_MIN_LOTE } from '../hooks/useCostoKg';
import { getSupabase } from '@/utils/supabase/client';
import { formatNumber, formatCompact } from '@/utils/format';
import type { FiltrosProduccion, CostoKgFarmFallback } from '@/types/produccion';
import { getLoteColor } from '@/types/produccion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCOP(v: number | null | undefined): string {
  if (v == null) return '—';
  return `$${formatNumber(Math.round(v))}`;
}

function fmtMiles(v: number): string {
  if (v >= 1_000_000) return `$${formatCompact(v)}`;
  return fmtCOP(v);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilaLote {
  lote_id: string;
  lote_nombre: string;
  costo_kg: number | null;
  /** Costo directo (labor + insumos) en $/kg */
  costo_kg_directo: number | null;
  /** Overhead asignado en $/kg */
  costo_kg_overhead: number | null;
  costo_directo: number;
  overhead_asignado: number;
  costo_total: number;
  kg_totales: number;
  arboles: number;
  precio_venta_kg: number | null;
  margen_kg: number | null;
}

interface RentabilidadTabProps {
  filtros: FiltrosProduccion;
}

// ---------------------------------------------------------------------------
// Tooltip components (defined at module scope to avoid component-during-render)
// ---------------------------------------------------------------------------

interface BarTooltipData {
  nombre: string;
  lote_nombre: string;
  costo_directo_kg: number;
  overhead_kg: number;
  precio_venta: number;
}

function makeBarTooltip(chartData: BarTooltipData[], precioRef: number | null) {
  return function BarChartTooltip({ active, payload, label }: {
    active?: boolean;
    payload?: { name: string; value: number; fill: string }[];
    label?: string;
  }) {
    if (!active || !payload?.length) return null;
    const row = chartData.find((d) => d.nombre === label);
    const total = payload.reduce((s, p) => s + (p.value || 0), 0);
    return (
      <div className="bg-white p-4 border border-gray-200 shadow-lg rounded-lg text-sm z-50 min-w-[200px]">
        <p className="font-bold text-gray-800 mb-2">{row?.lote_nombre ?? label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: p.fill }} />
              <span className="text-gray-600">{p.name}</span>
            </div>
            <span className="font-mono">{fmtCOP(p.value)}/kg</span>
          </div>
        ))}
        <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between font-medium">
          <span>Costo total/kg</span>
          <span className="font-mono">{fmtCOP(total)}/kg</span>
        </div>
        {precioRef && (
          <>
            <div className="flex justify-between text-green-700 mt-1">
              <span>Precio venta</span>
              <span className="font-mono">{fmtCOP(precioRef)}/kg</span>
            </div>
            <div className={`flex justify-between mt-1 font-bold ${precioRef - total > 0 ? 'text-green-700' : 'text-red-600'}`}>
              <span>Margen</span>
              <span className="font-mono">
                {precioRef - total > 0 ? '+' : ''}{fmtCOP(precioRef - total)}/kg
              </span>
            </div>
          </>
        )}
      </div>
    );
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DisclaimersPanel() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1.5">
      <div className="flex items-center gap-2 font-semibold text-amber-900 mb-1">
        <Info className="w-4 h-4 flex-shrink-0" />
        Notas metodologicas
      </div>
      <p>• Costo/kg por lote disponible desde 2026 (mano de obra desde oct-2025, aplicaciones desde dic-2025).</p>
      <p>• Distribucion por cosecha proporcional a los kilos registrados en cada tipo (Principal / Traviesa).</p>
      <p>• Gastos generales (overhead) distribuidos proporcionalmente al numero de arboles por lote.</p>
      <p>• Lotes con 0 arboles registrados se excluyen del calculo de overhead.</p>
      <p>• Precio de venta: promedio ponderado por kg de fin_ingresos (negocio Aguacate Hass) del mismo año.</p>
    </div>
  );
}

function FallbackHistorico({ fallbacks }: { fallbacks: CostoKgFarmFallback[] }) {
  if (!fallbacks.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <DollarSign className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Costo/kg historico nivel finca</h3>
          <p className="text-sm text-gray-500">2023–2025 — sin desglose por lote</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 pr-4 font-medium text-gray-600">Año</th>
              <th className="text-right py-2 pr-4 font-medium text-gray-600">Kg totales</th>
              <th className="text-right py-2 pr-4 font-medium text-gray-600">Gasto total</th>
              <th className="text-right py-2 font-medium text-gray-600">Costo/kg</th>
            </tr>
          </thead>
          <tbody>
            {fallbacks.map((fb) => (
              <tr key={fb.ano} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 pr-4 font-semibold text-gray-900">{fb.ano}</td>
                <td className="py-3 pr-4 text-right font-mono text-gray-700">
                  {fb.kg_totales_farm.toLocaleString('es-CO')} kg
                </td>
                <td className="py-3 pr-4 text-right font-mono text-gray-700">
                  {fmtMiles(fb.costo_total_farm)}
                </td>
                <td className="py-3 text-right font-mono font-bold text-gray-900">
                  {fb.costo_kg != null ? `${fmtCOP(fb.costo_kg)}/kg` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Nivel finca — no hay suficientes datos lote-etiquetados en estos años para desglosar por lote.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook interno para precio de venta ponderado de ingresos
// ---------------------------------------------------------------------------

function usePrecioVentaAnual(ano: number): {
  cargando: boolean;
  precioGlobal: number | null;
} {
  const [cargando, setCargando] = useState(false);
  const [precioGlobal, setPrecioGlobal] = useState<number | null>(null);

  useEffect(() => {
    if (ano < ANO_MIN_LOTE) return;
    let cancelled = false;
    (async () => {
      try {
        setCargando(true);
        const supabase = getSupabase();

        // Resolver negocio Aguacate Hass
        const { data: neg } = await supabase
          .from('fin_negocios')
          .select('id')
          .eq('nombre', 'Aguacate Hass')
          .maybeSingle();

        if (!neg?.id || cancelled) return;

        const { data: ingresos } = await supabase
          .from('fin_ingresos')
          .select('cantidad, precio_unitario')
          .eq('negocio_id', neg.id)
          .gte('fecha', `${ano}-01-01`)
          .lte('fecha', `${ano}-12-31`)
          .gt('cantidad', 0)
          .not('precio_unitario', 'is', null);

        if (cancelled || !ingresos?.length) return;

        // Promedio ponderado global
        type IngRow = { cantidad: number | null; precio_unitario: number | null };
        const totalKg = ingresos.reduce((s: number, r: IngRow) => s + (Number(r.cantidad) || 0), 0);
        const totalValor = ingresos.reduce(
          (s: number, r: IngRow) =>
            s + (Number(r.cantidad) || 0) * (Number(r.precio_unitario) || 0),
          0
        );
        const global = totalKg > 0 ? totalValor / totalKg : null;

        if (!cancelled) {
          setPrecioGlobal(global);
        }
      } catch (e) {
        console.warn('usePrecioVentaAnual error:', e);
      } finally {
        if (!cancelled) setCargando(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ano]);

  return { cargando, precioGlobal };
}

// ---------------------------------------------------------------------------
// Componente con desglose completo por lote (2026+)
// ---------------------------------------------------------------------------

interface TablaRentabilidadConDesgloseProps {
  filtros: FiltrosProduccion;
  precioGlobal: number | null;
  anosConDatos: number[];
}

function TablaRentabilidadConDesglose({
  filtros,
  precioGlobal,
  anosConDatos,
}: TablaRentabilidadConDesgloseProps) {
  const { calcular } = useCostoKg();
  const [filas, setFilas] = useState<FilaLote[]>([]);
  const [cargando, setCargando] = useState(false);

  const anos2026 = filtros.anos.filter((a) => a >= ANO_MIN_LOTE);

  const cargar = useCallback(async () => {
    if (!anos2026.length) {
      setFilas([]);
      return;
    }
    setCargando(true);
    try {
      type Acum = {
        lote_nombre: string;
        costo_directo: number;
        overhead_asignado: number;
        costo_total: number;
        kg_totales: number;
        arboles: number;
      };
      const acum = new Map<string, Acum>();

      await Promise.allSettled(
        anos2026.map(async (ano) => {
          try {
            const { costosLote, resultados } = await calcular({ ano });
            for (const cl of costosLote) {
              const res = resultados.find((r) => r.lote_id === cl.lote_id);
              const kg = res?.kg_totales ?? 0;
              const prev = acum.get(cl.lote_id) ?? {
                lote_nombre: cl.lote_nombre,
                costo_directo: 0,
                overhead_asignado: 0,
                costo_total: 0,
                kg_totales: 0,
                arboles: cl.arboles,
              };
              prev.costo_directo += cl.costo_directo;
              prev.overhead_asignado += cl.overhead_asignado;
              prev.costo_total += cl.costo_total;
              prev.kg_totales += kg;
              prev.arboles = Math.max(prev.arboles, cl.arboles);
              acum.set(cl.lote_id, prev);
            }
          } catch (e) {
            console.warn(`TablaRentabilidad error año ${ano}:`, e);
          }
        })
      );

      const rows: FilaLote[] = Array.from(acum.entries()).map(([lote_id, d]) => {
        const costoKg = d.kg_totales > 0 ? Math.round(d.costo_total / d.kg_totales) : null;
        const costoKgDirecto = d.kg_totales > 0 ? d.costo_directo / d.kg_totales : null;
        const costoKgOverhead = d.kg_totales > 0 ? d.overhead_asignado / d.kg_totales : null;
        const margenKg =
          costoKg != null && precioGlobal != null ? precioGlobal - costoKg : null;
        return {
          lote_id,
          lote_nombre: d.lote_nombre,
          costo_kg: costoKg,
          costo_kg_directo: costoKgDirecto,
          costo_kg_overhead: costoKgOverhead,
          costo_directo: d.costo_directo,
          overhead_asignado: d.overhead_asignado,
          costo_total: d.costo_total,
          kg_totales: d.kg_totales,
          arboles: d.arboles,
          precio_venta_kg: precioGlobal,
          margen_kg: margenKg,
        };
      });

      const filtradas =
        filtros.lote_ids.length > 0
          ? rows.filter((r) => filtros.lote_ids.includes(r.lote_id))
          : rows;

      setFilas(
        filtradas.sort((a, b) => (b.margen_kg ?? -Infinity) - (a.margen_kg ?? -Infinity))
      );
    } finally {
      setCargando(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anos2026.join(','), filtros.lote_ids.join(','), precioGlobal, calcular]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filasConKg = filas.filter((f) => f.kg_totales > 0 || f.costo_total > 0);

  // Chart data
  const chartData: BarTooltipData[] = filasConKg
    .filter((f) => f.kg_totales > 0)
    .map((f) => ({
      nombre: f.lote_nombre.split(' ').slice(0, 2).join(' '),
      lote_nombre: f.lote_nombre,
      costo_directo_kg: f.costo_kg_directo != null ? Math.round(f.costo_kg_directo) : 0,
      overhead_kg: f.costo_kg_overhead != null ? Math.round(f.costo_kg_overhead) : 0,
      precio_venta: precioGlobal ?? 0,
    }));

  const precioRef = precioGlobal && precioGlobal > 0 ? precioGlobal : null;
  const yMax = chartData.length
    ? Math.ceil(
        Math.max(
          ...chartData.map((d) => d.costo_directo_kg + d.overhead_kg),
          precioRef ?? 0
        ) * 1.2 / 1000
      ) * 1000
    : 5000;

  // Tooltip built outside render
  const BarChartTooltip = makeBarTooltip(chartData, precioRef);

  if (cargando) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
          <div className="h-[280px] bg-gray-100 rounded" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!filasConKg.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p className="font-medium">Sin datos de costo para 2026+</p>
        <p className="text-sm mt-1">
          Asegurate de tener registros de labor, insumos o gastos etiquetados por lote.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Gráfico barras apiladas */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Estructura de costo/kg por lote</h3>
              <p className="text-sm text-gray-500">Directo + overhead vs precio de venta (linea verde)</p>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="nombre" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  domain={[0, yMax]}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<BarChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="costo_directo_kg" name="Directo" stackId="costo" fill="#f59e0b" />
                <Bar dataKey="overhead_kg" name="Overhead" stackId="costo" fill="#d97706" radius={[4, 4, 0, 0]} />
                {precioRef && (
                  <ReferenceLine
                    y={precioRef}
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    label={{
                      value: `Precio ${fmtCOP(precioRef)}/kg`,
                      position: 'insideTopRight',
                      fill: '#10b981',
                      fontSize: 11,
                    }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabla detalle */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            Rentabilidad por lote — {anosConDatos.join(', ')}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Costo directo + overhead asignado vs precio de venta promedio ponderado
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Lote</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Kg</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Directo/kg</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Overhead/kg</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 bg-gray-100">Costo/kg</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Precio venta/kg</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Margen/kg</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => {
                const margenPos = fila.margen_kg != null && fila.margen_kg > 0;
                const sinKg = fila.kg_totales <= 0;
                return (
                  <tr key={fila.lote_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getLoteColor(fila.lote_nombre) }}
                        />
                        <span className="font-medium text-gray-900">{fila.lote_nombre}</span>
                        {fila.arboles === 0 && (
                          <span className="text-xs text-orange-500 ml-1" title="Sin arboles registrados">
                            sin arboles
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-700">
                      {sinKg ? <span className="text-gray-400">—</span> : fila.kg_totales.toLocaleString('es-CO')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-600">
                      {fila.costo_kg_directo != null ? fmtCOP(Math.round(fila.costo_kg_directo)) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-600">
                      {fila.costo_kg_overhead != null ? fmtCOP(Math.round(fila.costo_kg_overhead)) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 bg-gray-50">
                      {fila.costo_kg != null ? `${fmtCOP(fila.costo_kg)}/kg` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-700">
                      {fila.precio_venta_kg != null ? `${fmtCOP(Math.round(fila.precio_venta_kg))}/kg` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {fila.margen_kg != null ? (
                        <span className={margenPos ? 'text-green-700' : 'text-red-600'}>
                          {margenPos ? '+' : ''}{fmtCOP(Math.round(fila.margen_kg))}/kg
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {precioGlobal == null && (
          <div className="p-4 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Precio de venta no disponible — registra ingresos con cantidad y precio unitario en el modulo de Finanzas.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RentabilidadTab({ filtros }: RentabilidadTabProps) {
  const { calcular, loading: loadingCosto } = useCostoKg();
  const [fallbacks, setFallbacks] = useState<CostoKgFarmFallback[]>([]);
  const [anosConDatos, setAnosConDatos] = useState<number[]>([]);

  // Obtener el año más alto seleccionado >= 2026 para el precio de venta
  const anoRef2026 = filtros.anos.filter((a) => a >= ANO_MIN_LOTE).sort().at(-1) ?? 0;
  const { precioGlobal, cargando: cargandoPrecio } = usePrecioVentaAnual(anoRef2026);

  const cargarFallbacks = useCallback(async () => {
    const anosHistoricos = filtros.anos.filter((a) => a < ANO_MIN_LOTE).sort();
    if (!anosHistoricos.length) {
      setFallbacks([]);
      setAnosConDatos(filtros.anos.filter((a) => a >= ANO_MIN_LOTE).sort());
      return;
    }

    const nuevos: CostoKgFarmFallback[] = [];
    const anosOk: number[] = [...filtros.anos.filter((a) => a >= ANO_MIN_LOTE)];

    await Promise.allSettled(
      anosHistoricos.map(async (ano) => {
        try {
          const datos = await calcular({ ano });
          if (datos.fallback) nuevos.push(datos.fallback);
          anosOk.push(ano);
        } catch (e) {
          console.warn(`RentabilidadTab fallback error año ${ano}:`, e);
        }
      })
    );

    setFallbacks(nuevos.sort((a, b) => a.ano - b.ano));
    setAnosConDatos(anosOk.sort());
  }, [filtros.anos, calcular]);

  useEffect(() => {
    cargarFallbacks();
  }, [cargarFallbacks]);

  const sinAnos2026 = filtros.anos.every((a) => a < ANO_MIN_LOTE);
  const loading = loadingCosto || cargandoPrecio;

  return (
    <div className="space-y-6">
      <DisclaimersPanel />

      {/* Fallback histórico 2023-2025 */}
      {fallbacks.length > 0 && <FallbackHistorico fallbacks={fallbacks} />}

      {/* Tabla + gráfico 2026+ */}
      {!sinAnos2026 && (
        <TablaRentabilidadConDesglose
          filtros={filtros}
          precioGlobal={precioGlobal}
          anosConDatos={anosConDatos}
        />
      )}

      {sinAnos2026 && fallbacks.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          <TrendingDown className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="font-medium">Sin datos de rentabilidad</p>
          <p className="text-sm mt-1">Selecciona al menos un año para ver el analisis.</p>
        </div>
      )}
    </div>
  );
}
