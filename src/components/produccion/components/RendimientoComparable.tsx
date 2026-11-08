import type { CosechaIdentidad } from '../../../types/produccion';
import type { ResumenProduccionCosecha } from '@/utils/calculosProduccionAnalisis';
import { TreeDeciduous } from 'lucide-react';

interface RendimientoComparableProps {
  resumenes: ResumenProduccionCosecha[];
  cosechas: CosechaIdentidad[];
  loading?: boolean;
}

function fmt(v: number | null, digits: number, unit: string): string {
  if (v == null) return 'Sin dato';
  const num = v.toLocaleString('es-CO', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return unit ? `${num} ${unit}` : num;
}

export function RendimientoComparable({
  resumenes,
  cosechas,
  loading = false,
}: RendimientoComparableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse h-full min-h-[280px]">
        <div className="h-6 bg-gray-200 rounded w-48 mb-6" />
        <div className="h-8 bg-gray-100 rounded w-40 mb-4" />
        <div className="h-8 bg-gray-100 rounded w-36" />
      </div>
    );
  }

  const primario = resumenes[resumenes.length - 1];
  const kgArbol = primario?.kg_por_arbol ?? null;
  const tonHa = primario?.ton_por_ha ?? null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 h-full">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <TreeDeciduous className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Rendimiento comparable</h3>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-500">kg / arbol</p>
          <p className="text-2xl font-semibold text-gray-900 tabular-nums">
            {fmt(kgArbol, 2, 'kg/arbol')}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500">t / ha</p>
          <p className="text-2xl font-semibold text-gray-900 tabular-nums">
            {fmt(tonHa, 2, 't/ha')}
          </p>
        </div>
      </div>

      {(kgArbol == null || tonHa == null) && (
        <p className="mt-4 text-sm text-gray-500">
          Faltan denominadores validados (arboles o area) para la seleccion.
          Se calculan solo con datos vigentes del lote y la campana. Nunca se
          asume cero.
        </p>
      )}

      <div className="mt-6 pt-4 border-t border-gray-100 space-y-1 text-sm text-gray-600">
        {resumenes.map((r) => (
          <p key={r.cosecha.key}>
            Total {r.cosecha.label}:{' '}
            <span className="font-mono font-medium text-gray-900">
              {r.produccion_kg.toLocaleString('es-CO')} kg
            </span>
          </p>
        ))}
        {cosechas.length === 0 && (
          <p className="text-gray-400">Sin cosechas en el corte actual.</p>
        )}
      </div>
    </div>
  );
}
