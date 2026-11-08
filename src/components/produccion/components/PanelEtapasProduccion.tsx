import { Info, Package, Scale, Truck, Diff } from 'lucide-react';
import { GAPS_PRODUCCION_ANALISIS } from '@/utils/calculosProduccionAnalisis';

interface PanelEtapasProduccionProps {
  /** Proxy actual: kg_totales de produccion. */
  produccionKg: number | null;
  periodo: string;
  loading?: boolean;
}

/**
 * Resumen de etapas del mock (entrada / clasificado / despachado / diferencia).
 * Solo la producción registrada tiene dato en el schema actual; el resto se
 * muestra como gap explícito — no se inventan cifras del mock.
 */
export function PanelEtapasProduccion({
  produccionKg,
  periodo,
  loading = false,
}: PanelEtapasProduccionProps) {
  const cards = [
    {
      titulo: 'Producción registrada',
      valor:
        loading || produccionKg == null
          ? '—'
          : `${produccionKg.toLocaleString('es-CO')} kg`,
      subtitulo: periodo
        ? `kg_totales · ${periodo}`
        : 'Proxy de entrada neta (sin fecha de movimiento)',
      icono: Package,
      disponible: produccionKg != null && !loading,
    },
    {
      titulo: 'Clasificado',
      valor: 'Sin dato',
      subtitulo: 'Sin registros de clasificación por línea',
      icono: Scale,
      disponible: false,
    },
    {
      titulo: 'Despachado',
      valor: 'Sin dato',
      subtitulo: 'Sin tabla de despachos en el schema',
      icono: Truck,
      disponible: false,
    },
    {
      titulo: 'Diferencia por revisar',
      valor: 'Sin dato',
      subtitulo: 'No se infiere merma entre etapas',
      icono: Diff,
      disponible: false,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icono = card.icono;
          return (
            <div
              key={card.titulo}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-600">{card.titulo}</p>
                <Icono
                  className={`w-4 h-4 ${card.disponible ? 'text-primary' : 'text-gray-300'}`}
                />
              </div>
              <p
                className={`text-2xl font-semibold tabular-nums ${
                  card.disponible ? 'text-gray-900' : 'text-gray-400'
                }`}
              >
                {card.valor}
              </p>
              <p className="text-xs text-gray-400 mt-2">{card.subtitulo}</p>
            </div>
          );
        })}
      </div>
      <div className="flex items-start gap-2 text-xs text-gray-500 px-1">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          {GAPS_PRODUCCION_ANALISIS.produccion_proxy} Las etapas del mock
          (entrada canastilla / clasificación / despacho) no están en el
          schema: se muestran como «Sin dato», no como ceros del demo.
        </p>
      </div>
    </div>
  );
}
