import { Package } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatearMoneda, formatearNumero } from '@/utils/format';
import { cn } from '@/components/ui/utils';

interface ComparisonField {
  real: number;
  planeado: number;
  desviacion: number | undefined;
}

interface ProductoDetalle {
  producto_id: string;
  producto_nombre: string;
  unidad: string;
  cantidad: ComparisonField;
  costo: ComparisonField;
}

interface ProductComparisonTableProps {
  productos: ProductoDetalle[];
}

function deviationColor(desviacion: number): string {
  const abs = Math.abs(desviacion);
  if (abs <= 5) return 'text-success';
  if (abs <= 20) return 'text-warning';
  return 'text-destructive';
}

function deviationBadgeClass(desviacion: number): string {
  const abs = Math.abs(desviacion);
  if (abs <= 5) return 'bg-green-50 text-green-700';
  if (abs <= 20) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

export function ProductComparisonTable({ productos }: ProductComparisonTableProps) {
  if (productos.length === 0) return null;

  // "Alta desviación" solo tiene sentido cuando hay un plan contra el cual desviarse — un
  // producto sin plan (desviacion undefined, D2) no cuenta, aunque su cantidad real sea grande.
  const conAltaDesviacion = productos.filter((p) => p.cantidad.planeado > 0 && p.cantidad.desviacion !== undefined && Math.abs(p.cantidad.desviacion) > 20);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-6 py-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Package className="size-[18px] text-primary" aria-hidden="true" />
          Comparación de Productos
        </h3>
        {conAltaDesviacion.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {conAltaDesviacion.length} producto{conAltaDesviacion.length === 1 ? '' : 's'} con alta desviación
          </span>
        )}
      </div>

      {/* Desktop / tablet (≥640px): tabla completa. */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-right">Plan</TableHead>
              <TableHead className="text-right">Real</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
              <TableHead className="text-right">Desv%</TableHead>
              <TableHead className="text-right">Costo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productos.map((prod) => {
              const tienePlan = prod.cantidad.planeado > 0 && prod.cantidad.desviacion !== undefined;
              const altaDesv = tienePlan && Math.abs(prod.cantidad.desviacion as number) > 20;
              const diferencia = prod.cantidad.real - prod.cantidad.planeado;
              return (
                <TableRow key={prod.producto_id} className={cn(altaDesv && 'bg-red-50/40')}>
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {prod.producto_nombre}
                      {altaDesv && <Badge variant="destructive" className="text-xs">Alta desv.</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{prod.unidad}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tienePlan ? formatearNumero(prod.cantidad.planeado, 1) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium text-primary tabular-nums">
                    {formatearNumero(prod.cantidad.real, 1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tienePlan ? (
                      <span className={cn(
                        'inline-flex items-center rounded-lg px-2 py-0.5 text-xs',
                        diferencia > 0.1 ? 'bg-red-50 text-red-700' : diferencia < -0.1 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-700',
                      )}>
                        {diferencia > 0 ? '+' : ''}{formatearNumero(diferencia, 1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tienePlan ? (
                      <span className={cn('font-medium', deviationColor(prod.cantidad.desviacion as number))}>
                        {(prod.cantidad.desviacion as number) > 0 ? '+' : ''}{formatearNumero(prod.cantidad.desviacion as number, 1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-foreground tabular-nums">{formatearMoneda(prod.costo.real)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatearNumero(productos.reduce((s, p) => s + p.cantidad.planeado, 0), 1)}
              </TableCell>
              <TableCell className="text-right text-primary tabular-nums">
                {formatearNumero(productos.reduce((s, p) => s + p.cantidad.real, 0), 1)}
              </TableCell>
              <TableCell colSpan={2} />
              <TableCell className="text-right tabular-nums">
                {formatearMoneda(productos.reduce((s, p) => s + p.costo.real, 0))}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Móvil (<640px): lista de tarjetas — Patrón A (docs/sistema-visual.md §3-bis). 7
          columnas no caben en 375px sin desplazar en dos ejes a la vez; una tarjeta por
          producto evita el scroll horizontal por completo. */}
      <div className="flex flex-col gap-2 p-4 sm:hidden">
        {productos.map((prod) => {
          const tienePlan = prod.cantidad.planeado > 0 && prod.cantidad.desviacion !== undefined;
          const altaDesv = tienePlan && Math.abs(prod.cantidad.desviacion as number) > 20;
          const diferencia = prod.cantidad.real - prod.cantidad.planeado;
          return (
            <div key={prod.producto_id} className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h4 className="min-w-0 text-sm font-semibold text-foreground">{prod.producto_nombre}</h4>
                {tienePlan && (
                  <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold', deviationBadgeClass(prod.cantidad.desviacion as number))}>
                    {(prod.cantidad.desviacion as number) > 0 ? '+' : ''}{formatearNumero(prod.cantidad.desviacion as number, 1)}%
                  </span>
                )}
                {altaDesv && <Badge variant="destructive" className="shrink-0 text-xs">Alta desv.</Badge>}
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-xl font-bold tabular-nums">{formatearNumero(prod.cantidad.real, 1)}</span>
                <span className="text-xs text-muted-foreground">{prod.unidad} reales</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>Plan <b className="font-medium text-foreground">{tienePlan ? `${formatearNumero(prod.cantidad.planeado, 1)} ${prod.unidad}` : '—'}</b></span>
                <span>Dif <b className="font-medium text-foreground">{tienePlan ? `${diferencia > 0 ? '+' : ''}${formatearNumero(diferencia, 1)}` : '—'}</b></span>
                <span>Costo <b className="font-medium text-foreground">{formatearMoneda(prod.costo.real)}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
