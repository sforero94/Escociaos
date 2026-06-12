import { Package, TreeDeciduous, DollarSign } from 'lucide-react';
import type { KPIProduccion } from '../../../types/produccion';
import type { DatosCostoKg } from '../hooks/useCostoKg';
import { ANO_MIN_LOTE } from '../hooks/useCostoKg';

interface KPICardsProduccionProps {
  kpis: KPIProduccion | null;
  loading?: boolean;
  /**
   * Resultado del motor de costo para el período seleccionado.
   * - Para años >= 2026: resultados por lote (promedio ponderado por kg).
   * - Para 2023–2025: fallback nivel finca.
   * - null mientras carga, o cuando los años no tienen datos.
   */
  datosCosto?: DatosCostoKg | null;
  loadingCosto?: boolean;
  /** Años seleccionados (para saber si hay alguno >= 2026) */
  anosSeleccionados?: number[];
}

interface KPICardProps {
  titulo: string;
  valor: string;
  subtitulo: string;
  icono: React.ElementType;
  colorClase: string;
  /** Texto pequeño adicional (disclaimer) */
  nota?: string;
}

function KPICard({ titulo, valor, subtitulo, icono: Icono, colorClase, nota }: KPICardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-gray-300 transition-all">
      <div className="flex items-center justify-between mb-4">
        <div
          className={`w-12 h-12 bg-gradient-to-br ${colorClase} rounded-xl flex items-center justify-center`}
        >
          <Icono className="w-6 h-6 text-white" />
        </div>
      </div>
      <h3 className="text-2xl font-bold text-gray-900">{valor}</h3>
      <p className="text-sm text-gray-600 font-medium">{titulo}</p>
      <p className="text-xs text-gray-400 mt-1">{subtitulo}</p>
      {nota && <p className="text-xs text-gray-400 mt-0.5 italic">{nota}</p>}
    </div>
  );
}

function KPICardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="w-12 h-12 bg-gray-200 rounded-xl" />
      </div>
      <div className="h-8 bg-gray-200 rounded w-24 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-32 mb-1" />
      <div className="h-3 bg-gray-200 rounded w-20" />
    </div>
  );
}

/**
 * Calcula el costo/kg ponderado por kg a partir de los resultados del motor.
 * Devuelve null si no hay datos suficientes.
 */
function calcularCostoKgPonderado(
  datosCosto: DatosCostoKg | null | undefined,
  anosSeleccionados: number[],
): { valor: number | null; esFallback: boolean; texto: string } {
  if (!datosCosto) return { valor: null, esFallback: false, texto: '—' };

  // Fallback finca para años < 2026
  if (datosCosto.fallback) {
    const v = datosCosto.fallback.costo_kg;
    return {
      valor: v,
      esFallback: true,
      texto: v != null ? `$${Math.round(v).toLocaleString('es-CO')}/kg` : '—',
    };
  }

  // Promedio ponderado por kg de los lotes
  if (datosCosto.resultados.length > 0) {
    const totalKg = datosCosto.resultados.reduce((s, r) => s + r.kg_totales, 0);
    const totalCosto = datosCosto.resultados.reduce((s, r) => s + r.costo_total, 0);
    const ponderado = totalKg > 0 ? Math.round(totalCosto / totalKg) : null;
    return {
      valor: ponderado,
      esFallback: false,
      texto: ponderado != null ? `$${ponderado.toLocaleString('es-CO')}/kg` : '—',
    };
  }

  // Años seleccionados todos < 2026 → sin datos de costo/kg por lote
  if (anosSeleccionados.every((a) => a < ANO_MIN_LOTE)) {
    return { valor: null, esFallback: false, texto: '—' };
  }

  return { valor: null, esFallback: false, texto: '—' };
}

export function KPICardsProduccion({
  kpis,
  loading = false,
  datosCosto = null,
  loadingCosto = false,
  anosSeleccionados = [],
}: KPICardsProduccionProps) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <KPICardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const { texto: costoKgTexto, esFallback } = calcularCostoKgPonderado(
    datosCosto,
    anosSeleccionados,
  );

  // Subtítulo del costo/kg varía según disponibilidad
  let costoKgSubtitulo = 'Costo por kg cosechado';
  let costoKgNota: string | undefined;
  if (loadingCosto) {
    costoKgSubtitulo = 'Calculando…';
  } else if (esFallback) {
    costoKgSubtitulo = 'Nivel finca (2023–2025)';
    costoKgNota = 'Sin desglose por lote';
  } else if (costoKgTexto === '—') {
    const tieneAnios2026 = anosSeleccionados.some((a) => a >= ANO_MIN_LOTE);
    costoKgSubtitulo = tieneAnios2026
      ? 'Disponible con datos etiquetados por lote'
      : 'Disponible desde 2026';
  } else {
    costoKgSubtitulo = 'Promedio ponderado por kg';
  }

  const cards = [
    {
      titulo: 'Produccion Total',
      valor: `${kpis.produccion_total_kg.toLocaleString('es-CO')} kg`,
      subtitulo: `Periodo: ${kpis.periodo}`,
      icono: Package,
      colorClase: 'from-green-500 to-green-600',
    },
    {
      titulo: 'Rendimiento Promedio',
      valor: `${kpis.rendimiento_promedio_kg_arbol.toLocaleString('es-CO', { minimumFractionDigits: 2 })} kg/arbol`,
      subtitulo: 'Promedio ponderado',
      icono: TreeDeciduous,
      colorClase: 'from-blue-500 to-blue-600',
    },
    {
      titulo: 'Costo/Kg',
      valor: loadingCosto ? '…' : costoKgTexto,
      subtitulo: costoKgSubtitulo,
      icono: DollarSign,
      colorClase: 'from-amber-500 to-amber-600',
      nota: costoKgNota,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {cards.map((card, index) => (
        <KPICard key={index} {...card} />
      ))}
    </div>
  );
}
