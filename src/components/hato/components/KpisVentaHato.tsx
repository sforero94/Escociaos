// ARCHIVO: components/hato/components/KpisVentaHato.tsx
// DESCRIPCIÓN: Mitad derecha del bloque "Ventas" del tablero de Producción
// (decisión 14 del dueño, plan `docs/plan_hato_produccion_rework.md`
// §4.3, SOW 5): L/vaca promedio, precio neto promedio ($/L) y el reparto de
// ingresos leche / terneros / descarte. Componente PLANO (sin `RoleGuard`
// propio) -- el gate Gerencia-only del bloque "Ventas" completo (esta
// tarjeta + `GraficoLitrosQuincenal`) vive UNA sola vez en `ProduccionView`,
// para no mostrarle a un Administrador dos candados lado a lado (el ASCII
// del plan §4.3 dibuja "Ventas [GERENCIA]" como un único bloque con un
// único fallback).
//
// Owner feedback (este rework): "add a quincena, mes, trimestre toggle --
// no use seeing a static value in a dashboard". El toggle (`Tabs`, mismo
// patrón visual que `RankingVacas.tsx`) escoge el periodo
// (`PeriodoVentaHato`, `hatoProduccion.ts`) que filtra TANTO
// `historialQuincenal` (L/vaca promedio) COMO la lista cruda de
// `fin_ingresos` (`useRepartoVentasHato().ingresos`, precio neto promedio +
// reparto) -- las tres cifras siempre reflejan el MISMO periodo
// seleccionado, nunca un histórico completo silencioso. Ancla la ventana al
// dato REAL más reciente (`fechaAnclaVentasHato`), no a "hoy" literal --
// mismo criterio que `fechaAnclaProduccion` para el pesaje semanal.
//
// Owner feedback (agregado después): "add YTD as a fourth option". A
// diferencia de las otras 3 (ventanas RODANTES, `desde` calculado por
// resta de días), YTD es CALENDARIO-ANCLA: `desde` es siempre el 1 de
// enero del año del ancla -- ver `rangoPeriodoVentaHato` en
// `hatoProduccion.ts`, fuente única de la que sale también el texto del
// "gate de fechas" de abajo, así que YTD nunca necesita un caso especial
// en este componente.
//
// Trampa de unidades corregida (riesgo R-4, hallazgo del dueño): el KPI
// "L/vaca" ahora rotula explícitamente el periodo ("L/vaca · quincena") --
// sin el rótulo era fácil leerlo como una cifra diaria, sentado justo debajo
// del tracker "Litros/día del hato".
//
// BUG corregido (owner, hallado a ojo contra producción): el límite
// inferior de la ventana rodante era INCLUSIVO -- con facturas de leche
// fechadas fin-de-mes, "Mes" sumaba DOS facturas mensuales completas en vez
// de una (`Leche $51.645.049` = jun $27.076.564,28 + may $24.568.485,00; y
// `Terneros $480.000` = 4 × $120.000, las 4 fechadas 2026-05-31). El fix
// vive en `rangoPeriodoVentaHato`/`filtrarHistorialPorPeriodo`/
// `filtrarIngresosPorPeriodo` (`hatoProduccion.ts`) -- este componente solo
// consume el resultado.
//
// Owner feedback (misma ronda): "add a small text below with the date
// gates applied with each filter". El texto usa el MISMO
// `rangoPeriodoVentaHato` que ya gobierna el filtro -- nunca una
// descripción hardcodeada -- así que si el ancla se desplaza por backlog de
// captura, el texto lo refleja siempre.

import { useMemo, useState } from 'react';
import { Loader2, Milk, Baby, HandCoins, HelpCircle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatNumber, formatCurrency, formatPercentage, formatDateRange } from '@/utils/format';
import { obtenerFechaHoy } from '@/utils/fechas';
import {
  calcularPrecioUnitarioQuincena,
  promedioProductividadQuincenal,
  filtrarHistorialPorPeriodo,
  filtrarIngresosPorPeriodo,
  fechaAnclaVentasHato,
  rangoPeriodoVentaHato,
  repartoVentasHato,
  type PeriodoVentaHato,
} from '@/utils/hatoProduccion';
import { useRepartoVentasHato } from '../hooks/useRepartoVentasHato';
import type { HatoProduccionQuincenalConIngreso } from '../hooks/useProduccionHato';

const PERIODOS: Array<{ value: PeriodoVentaHato; label: string; etiquetaCorta: string }> = [
  { value: 'quincena', label: 'Quincena', etiquetaCorta: 'quincena' },
  { value: 'mes', label: 'Mes', etiquetaCorta: 'mes' },
  { value: 'trimestre', label: 'Trimestre', etiquetaCorta: 'trimestre' },
  { value: 'ytd', label: 'YTD', etiquetaCorta: 'YTD' },
];

interface FilaCubetaProps {
  icono: React.ElementType;
  label: string;
  valor: number;
  total: number;
}

function FilaCubeta({ icono: Icono, label, valor, total }: FilaCubetaProps) {
  const pct = total > 0 ? valor / total : null;
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icono className="w-4 h-4 text-gray-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-700">{label}</span>
          <span className="text-sm font-semibold text-gray-900">{formatCurrency(valor)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: pct != null ? `${Math.round(pct * 100)}%` : '0%' }}
          />
        </div>
      </div>
      <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">
        {pct != null ? formatPercentage(pct * 100, 0) : '—'}
      </span>
    </div>
  );
}

export function KpisVentaHato({
  historialQuincenal,
}: {
  historialQuincenal: HatoProduccionQuincenalConIngreso[];
}) {
  const { ingresos, loading, error } = useRepartoVentasHato();
  const [periodo, setPeriodo] = useState<PeriodoVentaHato>('mes');

  // `obtenerFechaHoy()` -- NUNCA `new Date().toISOString().slice(0, 10)`,
  // que es UTC y ya es "mañana" en Bogotá después de las 19:00.
  const hoy = useMemo(() => obtenerFechaHoy(), []);
  // Ancla al dato REAL más reciente (quincena o ingreso), nunca a "hoy"
  // literal -- mismo criterio que `fechaAnclaProduccion` (pesaje semanal),
  // así el toggle no queda en blanco por backlog de captura.
  const fechaAncla = useMemo(
    () => fechaAnclaVentasHato(historialQuincenal, ingresos ?? [], hoy),
    [historialQuincenal, ingresos, hoy],
  );

  // Misma función que gobierna el filtro (`filtrarHistorialPorPeriodo`/
  // `filtrarIngresosPorPeriodo` la llaman internamente) -- el texto del
  // "gate de fechas" nunca puede divergir del rango realmente aplicado.
  const rango = useMemo(() => rangoPeriodoVentaHato(periodo, fechaAncla), [periodo, fechaAncla]);

  const historialPeriodo = useMemo(
    () => filtrarHistorialPorPeriodo(historialQuincenal, periodo, fechaAncla),
    [historialQuincenal, periodo, fechaAncla],
  );
  const reparto = useMemo(() => {
    if (!ingresos) return null;
    return repartoVentasHato(filtrarIngresosPorPeriodo(ingresos, periodo, fechaAncla));
  }, [ingresos, periodo, fechaAncla]);

  const lVaca = promedioProductividadQuincenal(historialPeriodo);
  const precioNeto = reparto ? calcularPrecioUnitarioQuincena(reparto.leche.valor, reparto.leche.litros) : null;
  const etiquetaPeriodo = PERIODOS.find((p) => p.value === periodo)!.etiquetaCorta;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold text-gray-900">Ventas del Hato</h3>
        <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoVentaHato)}>
          <TabsList>
            {PERIODOS.map((p) => (
              <TabsTrigger key={p.value} value={p.value}>{p.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <p className="text-xs text-gray-500">Leche, terneros y descarte — negocio Hato Lechero</p>
      {/* Gate de fechas real aplicado por el toggle (owner feedback) --
          sale del MISMO cómputo que filtra los datos, nunca una
          descripción fija. */}
      <p className="text-xs text-gray-400 mb-4">{formatDateRange(rango.desde, rango.hasta)}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg bg-gray-50 p-3">
          {/* Unidad explícita del periodo (riesgo R-4): sin este rótulo el
              lector puede leer esta cifra como diaria -- está justo debajo
              del tracker "Litros/día del hato". */}
          <p className="text-xs text-gray-500">L/vaca · {etiquetaPeriodo}</p>
          <p className="text-lg font-bold text-gray-900">{lVaca != null ? `${formatNumber(lVaca, 1)} L` : '—'}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Precio neto promedio</p>
          <p className="text-lg font-bold text-gray-900">
            {precioNeto != null ? `${formatCurrency(precioNeto)}/L` : '—'}
          </p>
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Reparto de ingresos — {etiquetaPeriodo}
      </p>

      {loading ? (
        <div className="flex items-center py-4 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando reparto de ingresos…
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !reparto || reparto.total === 0 ? (
        <p className="text-sm text-gray-400">Sin ventas registradas en este período.</p>
      ) : (
        <div className="space-y-3">
          <FilaCubeta icono={Milk} label="Leche" valor={reparto.leche.valor} total={reparto.total} />
          <FilaCubeta icono={Baby} label="Terneros" valor={reparto.terneros.valor} total={reparto.total} />
          <FilaCubeta icono={HandCoins} label="Descarte" valor={reparto.descarte.valor} total={reparto.total} />
          {reparto.otros.valor > 0 && (
            <FilaCubeta icono={HelpCircle} label="Otros" valor={reparto.otros.valor} total={reparto.total} />
          )}
        </div>
      )}
    </div>
  );
}
