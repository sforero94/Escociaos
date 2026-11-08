import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Detalle por lote</h3>
        <p className="text-sm text-gray-500 mt-1">
          {cosechaActiva?.label ?? 'Sin cosecha'} · Fuente: tabla produccion
          (kg_totales). Clasificación y despacho aún sin schema.
        </p>
      </div>

      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead>Lote</TableHead>
            <TableHead>Producción kg</TableHead>
            <TableHead>Clasificado kg</TableHead>
            <TableHead>Despachado kg</TableHead>
            <TableHead>Diferencia kg</TableHead>
            <TableHead>Respaldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody striped>
          {filas.map((fila) => {
            const prod =
              cosechaActiva != null ? fila.por_cosecha[cosechaActiva.key] : null;
            return (
              <TableRow key={fila.lote_id} className="text-gray-800">
                <TableCell className="font-medium">{fila.lote_nombre}</TableCell>
                <TableCell className="font-mono">
                  {prod != null ? prod.toLocaleString('es-CO') : 'Sin dato'}
                </TableCell>
                <TableCell className="text-gray-400">Sin dato</TableCell>
                <TableCell className="text-gray-400">Sin dato</TableCell>
                <TableCell className="text-gray-400">Sin dato</TableCell>
                <TableCell className="text-gray-500">Registro produccion</TableCell>
              </TableRow>
            );
          })}
          {filas.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-gray-500">
                Sin filas para el filtro actual.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {filas.length > 0 && (
          <TableFooter>
            <TableRow className="text-gray-900">
              <TableCell>Total · no sumar etapas</TableCell>
              <TableCell className="font-mono">
                {total != null ? Math.round(total).toLocaleString('es-CO') : '—'}
              </TableCell>
              <TableCell className="text-gray-400 font-normal">Sin dato</TableCell>
              <TableCell className="text-gray-400 font-normal">Sin dato</TableCell>
              <TableCell className="text-gray-400 font-normal">Sin dato</TableCell>
              <TableCell className="text-gray-500 font-normal">
                Solo producción registrada
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>

      <p className="mt-4 text-xs text-gray-400">
        En el producto, cada cifra abrirá sus movimientos y fuente. No se fuerza
        un enlace entre etapas sin evidencia.
      </p>
    </div>
  );
}
