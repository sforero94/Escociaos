import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from '@/components/ui/dialog';
import { getSupabase } from '@/utils/supabase/client';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { getQuarterRange } from '@/components/finanzas/hooks/usePresupuestoData';
import { formatCurrency } from '@/utils/format';
import { formatearFechaCorta } from '@/utils/fechas';
import { Loader2 } from 'lucide-react';

/** Fila cruda de `fin_gastos` tal como la devuelve el select de abajo. */
interface GastoDetalle {
  id: string;
  fecha: string;
  nombre: string | null;
  valor: number;
  fin_proveedores: { nombre: string } | null;
  fin_conceptos_gastos: { nombre: string } | null;
}

export interface GastosEjecucionTarget {
  /** Nombre del concepto o de la categoría sobre la que se hizo clic. */
  titulo: string;
  /** Categoría a la que pertenece el concepto (solo cuando el target es un concepto). */
  categoriaNombre?: string;
  /**
   * Conceptos que suman la cifra: uno para una fila de concepto, todos los de
   * la categoría para una fila de categoría.
   *
   * Se filtra por concepto y no por `fin_gastos.categoria_id` a propósito: la
   * tabla agrupa cada concepto bajo la categoría del catálogo, mientras que el
   * gasto lleva su propia categoría desnormalizada. Si las dos divergen, un
   * filtro por categoría mostraría un total distinto al de la celda.
   */
  conceptoIds: string[];
}

interface GastosEjecucionDialogProps {
  target: GastosEjecucionTarget | null;
  onClose: () => void;
  negocioId: string;
  anio: number;
  quarters: number[];
}

function formatQuarterLabel(quarters: number[]): string {
  if (quarters.length === 4) return 'Año completo';
  return quarters.map((q) => `Q${q}`).join('+');
}

/**
 * Lista los gastos que suman la cifra de "Ejecución" de una fila del
 * presupuesto.
 *
 * Replica exactamente el filtro de `aggregateGastos` en `usePresupuestoData`
 * (negocio + estado Confirmado + rango de cada trimestre seleccionado), para
 * que el total del diálogo nunca contradiga la celda desde la que se abrió.
 */
export function GastosEjecucionDialog({
  target,
  onClose,
  negocioId,
  anio,
  quarters,
}: GastosEjecucionDialogProps) {
  const [gastos, setGastos] = useState<GastoDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncado, setTruncado] = useState(false);

  const conceptosKey = target?.conceptoIds.join(',') ?? '';
  const quartersKey = quarters.join(',');
  const abierto = target !== null;
  const unSoloConcepto = target?.conceptoIds.length === 1;

  useEffect(() => {
    if (!abierto) return;
    // Sin conceptos no hay nada que consultar, pero tampoco puede quedar en
    // pantalla la lista del target anterior.
    if (!negocioId || !conceptosKey) {
      setGastos([]);
      setLoading(false);
      return;
    }

    let cancelado = false;
    const quartersList = quartersKey.split(',').map(Number);
    const conceptoIds = conceptosKey.split(',');

    async function cargar() {
      setLoading(true);
      setError(null);
      setTruncado(false);

      try {
        const supabase = getSupabase();

        // Una consulta por trimestre: los trimestres seleccionados pueden no
        // ser contiguos (p. ej. Q1 + Q3), así que un único rango de fechas
        // metería meses que la tabla no está sumando.
        const resultados = await Promise.all(
          quartersList.map((q) => {
            const rango = getQuarterRange(anio, q);
            return fetchAll<GastoDetalle>(
              (desde, hasta) =>
                supabase
                  .from('fin_gastos')
                  .select('id, fecha, nombre, valor, fin_proveedores(nombre), fin_conceptos_gastos(nombre)')
                  .eq('negocio_id', negocioId)
                  .eq('estado', 'Confirmado')
                  .in('concepto_id', conceptoIds)
                  .gte('fecha', rango.desde)
                  .lte('fecha', rango.hasta)
                  .order('fecha', { ascending: false })
                  .range(desde, hasta) as unknown as PromiseLike<{
                  data: GastoDetalle[] | null;
                  error: { message: string } | null;
                }>,
            );
          }),
        );

        if (cancelado) return;

        const filas = resultados.flatMap((r) => r.filas);
        filas.sort((a, b) => b.fecha.localeCompare(a.fecha));
        setGastos(filas);
        setTruncado(resultados.some((r) => r.truncado));
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : 'Error al cargar los gastos');
      } finally {
        if (!cancelado) setLoading(false);
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
  }, [abierto, negocioId, anio, quartersKey, conceptosKey]);

  const total = gastos.reduce((s, g) => s + Number(g.valor), 0);
  // En vista de categoría el concepto es lo que distingue una fila de otra.
  const mostrarConcepto = !unSoloConcepto;

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{target?.titulo ?? ''}</DialogTitle>
          <DialogDescription>
            {target?.categoriaNombre ? `${target.categoriaNombre} · ` : ''}
            Gastos confirmados {formatQuarterLabel(quarters)} {anio}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="ml-2 text-sm">Cargando gastos...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-red-600">{error}</div>
          ) : gastos.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              No hay gastos confirmados en este período
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {gastos.map((g) => (
                <div key={g.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-foreground truncate">
                      {g.nombre || 'Sin descripción'}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {formatearFechaCorta(g.fecha)}
                      {mostrarConcepto && g.fin_conceptos_gastos?.nombre
                        ? ` · ${g.fin_conceptos_gastos.nombre}`
                        : ''}
                      {g.fin_proveedores?.nombre ? ` · ${g.fin_proveedores.nombre}` : ''}
                    </div>
                  </div>
                  <div className="celda-num text-sm font-medium text-foreground shrink-0">
                    {formatCurrency(Number(g.valor))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {truncado && (
            <p className="mt-3 text-xs text-amber-600">
              Se alcanzó el límite de páginas: puede que falten gastos por mostrar.
            </p>
          )}
        </DialogBody>

        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t pt-3 text-sm">
          <span className="text-gray-500">
            {gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'}
          </span>
          <span className="celda-num font-semibold text-foreground">{formatCurrency(total)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
