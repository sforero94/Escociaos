import { Package, TreeDeciduous, Map, Grid2X2 } from 'lucide-react';
import type { KPIProduccion } from '../../../types/produccion';

interface KPICardsProduccionProps {
  kpis: KPIProduccion | null;
  loading?: boolean;
}

interface KPICardProps {
  titulo: string;
  valor: string;
  subtitulo: string;
  icono: React.ElementType;
  colorClase: string;
}

function KPICard({ titulo, valor, subtitulo, icono: Icono, colorClase }: KPICardProps) {
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

export function KPICardsProduccion({ kpis, loading = false }: KPICardsProduccionProps) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <KPICardSkeleton key={i} />
        ))}
      </div>
    );
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
      titulo: 'Ton/Ha Promedio',
      valor: `${kpis.ton_por_ha_promedio.toLocaleString('es-CO', { minimumFractionDigits: 2 })} ton/ha`,
      subtitulo: 'Por area cultivada',
      icono: Map,
      colorClase: 'from-amber-500 to-amber-600',
    },
    {
      titulo: 'Lotes Activos',
      valor: kpis.lotes_activos.toString(),
      subtitulo: 'En produccion',
      icono: Grid2X2,
      colorClase: 'from-purple-500 to-purple-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <KPICard key={index} {...card} />
      ))}
    </div>
  );
}
