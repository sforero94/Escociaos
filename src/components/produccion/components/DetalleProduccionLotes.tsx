import type { ComparacionLoteCosecha } from '@/utils/calculosProduccionAnalisis';
import type { CosechaIdentidad } from '../../../types/produccion';

interface DetalleProduccionLotesProps {
  filas: ComparacionLoteCosecha[];
  cosechas: CosechaIdentidad[];
  loading?: boolean;
}

/**
 * Detalle por lote con producción registrada.
 * Columnas de clasificación/despacho quedan como Sin dato (gap de schema).
 */
export function DetalleProduccionLotes({
  filas,
  cosechas,
  loading = false,
}: DetalleProduccionLotesProps) {
  const cosechaActiva = cosechas[cosechas.length - 1];
  const total =
    cosechaActiva == null
      ? null
      : filas.reduce((s, f) => {
          const v = f.por_cosecha[cosechaActiva.key];
          return s + (v != null ? v : 0);
        }, 0);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-40 mb-4" />
        <div className="h-48 bg-gray-100 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 overflow-x-auto">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Detalle por lote</h3>
        <p className="text-sm text-gray-500 mt-1">
          {cosechaActiva?.label ?? 'Sin cosecha'} · Fuente: tabla produccion
          (kg_totales). Clasificación y despacho aún sin schema.
        </p>
      </div>

      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <th className="py-3 pr-3 font-medium">Lote</th>
            <th className="py-3 pr-3 font-medium">Producción kg</th>
            <th className="py-3 pr-3 font-medium">Clasificado kg</th>
            <th className="py-3 pr-3 font-medium">Despachado kg</th>
            <th className="py-3 pr-3 font-medium">Diferencia kg</th>
            <th className="py-3 font-medium">Respaldo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const prod =
              cosechaActiva != null ? fila.por_cosecha[cosechaActiva.key] : null;
            return (
              <tr
                key={fila.lote_id}
                className="border-b border-gray-50 text-gray-800"
              >
                <td className="py-3 pr-3 font-medium">{fila.lote_nombre}</td>
                <td className="py-3 pr-3 font-mono">
                  {prod != null ? prod.toLocaleString('es-CO') : 'Sin dato'}
                </td>
                <td className="py-3 pr-3 text-gray-400">Sin dato</td>
                <td className="py-3 pr-3 text-gray-400">Sin dato</td>
                <td className="py-3 pr-3 text-gray-400">Sin dato</td>
                <td className="py-3 text-gray-500">Registro produccion</td>
              </tr>
            );
          })}
          {filas.length > 0 && (
            <tr className="text-gray-900 font-medium">
              <td className="py-3 pr-3">Total · no sumar etapas</td>
              <td className="py-3 pr-3 font-mono">
                {total != null ? Math.round(total).toLocaleString('es-CO') : '—'}
              </td>
              <td className="py-3 pr-3 text-gray-400 font-normal">Sin dato</td>
              <td className="py-3 pr-3 text-gray-400 font-normal">Sin dato</td>
              <td className="py-3 pr-3 text-gray-400 font-normal">Sin dato</td>
              <td className="py-3 text-gray-500 font-normal">
                Solo producción registrada
              </td>
            </tr>
          )}
          {filas.length === 0 && (
            <tr>
              <td colSpan={6} className="py-10 text-center text-gray-500">
                Sin filas para el filtro actual.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="mt-4 text-xs text-gray-400">
        En el producto, cada cifra abrirá sus movimientos y fuente. No se fuerza
        un enlace entre etapas sin evidencia.
      </p>
    </div>
  );
}
