import { Package, TreeDeciduous, DollarSign, LandPlot } from 'lucide-react';
import type { KPIProduccion } from '../../../types/produccion';
import type { DatosCostoKg } from '../hooks/useCostoKg';
import { ANO_MIN_LOTE } from '../hooks/useCostoKg';

interface KPICardsProduccionProps {
  kpis: KPIProduccion | null;
  loading?: boolean;
  datosCosto?: DatosCostoKg | null;
  loadingCosto?: boolean;
  /** Años de campaña derivados (para costo/kg). */
  anosSeleccionados?: number[];
  /** Si true, kg/árbol o t/ha no tienen denominador válido. */
  rendimientoSinDato?: boolean;
  tonHaSinDato?: boolean;
}

interface KPICardProps {
  titulo: string;
  valor: string;
  subtitulo: string;
  icono: React.ElementType;
  colorClase: string;
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

function calcularCostoKgPonderado(
  datosCosto: DatosCostoKg | null | undefined,
  anosSeleccionados: number[],
): { valor: number | null; esFallback: boolean; texto: string } {
  if (!datosCosto) return { valor: null, esFallback: false, texto: '—' };

  if (datosCosto.fallback) {
    const v = datosCosto.fallback.costo_kg;
    return {
      valor: v,
      esFallback: true,
      texto: v != null ? `$${Math.round(v).toLocaleString('es-CO')}/kg` : '—',
    };
  }

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
  rendimientoSinDato = false,
  tonHaSinDato = false,
}: KPICardsProduccionProps) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <KPICardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const { texto: costoKgTexto, esFallback } = calcularCostoKgPonderado(
    datosCosto,
    anosSeleccionados,
  );

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
      titulo: 'Producción registrada',
      valor: `${kpis.produccion_total_kg.toLocaleString('es-CO')} kg`,
      subtitulo: `Periodo: ${kpis.periodo}`,
      icono: Package,
      colorClase: 'from-primary to-primary-dark',
      nota: 'kg_totales · no suma etapas',
    },
    {
      titulo: 'Rendimiento',
      valor:
        rendimientoSinDato || kpis.rendimiento_promedio_kg_arbol == null
          ? 'Sin dato'
          : `${kpis.rendimiento_promedio_kg_arbol.toLocaleString('es-CO', {
              minimumFractionDigits: 2,
            })} kg/árbol`,
      subtitulo: rendimientoSinDato
        ? 'Sin árboles vinculados a la campaña'
        : 'Promedio ponderado',
      icono: TreeDeciduous,
      colorClase: 'from-emerald-600 to-emerald-700',
    },
    {
      titulo: 'Toneladas / ha',
      valor:
        tonHaSinDato || kpis.ton_por_ha_promedio == null
          ? 'Sin dato'
          : `${kpis.ton_por_ha_promedio.toLocaleString('es-CO', {
              minimumFractionDigits: 2,
            })} t/ha`,
      subtitulo: tonHaSinDato
        ? 'Sin área válida para el corte'
        : 'Con área de lotes con dato',
      icono: LandPlot,
      colorClase: 'from-sky-600 to-sky-700',
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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <KPICard key={index} {...card} />
      ))}
    </div>
  );
}
