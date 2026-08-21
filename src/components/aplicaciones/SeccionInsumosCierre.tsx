import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/components/ui/utils';
import { formatearNumero } from '@/utils/format';
import { calcularInsumosConDesviacion, type InsumoInput } from '@/utils/calculosCierreAplicacion';
import type { TipoAplicacion } from '@/types/aplicaciones';

interface SeccionInsumosCierreProps {
  tipoAplicacion: TipoAplicacion;
  totalLotes: number;
  totalArboles: number;
  proposito: string | null | undefined;
  resumenInsumos: InsumoInput[];
  canecasPlaneadas: number;
  canecasAplicadas: number;
}

const ETIQUETA_TIPO: Record<string, string> = {
  Fumigación: 'Fumigación',
  Fertilización: 'Fertilización',
};

/**
 * Sección ① del Cierre (`W03-cierre-v2.md` §1/§5) — Resumen + Insumos + Canecas fusionados en
 * UNA tarjeta (antes 3 separadas). Corta: 4 filas como máximo, así que no se colapsa como Labores
 * — se resume con una línea de rollup arriba de la tabla en vez de esconderse.
 */
export function SeccionInsumosCierre({
  tipoAplicacion,
  totalLotes,
  totalArboles,
  proposito,
  resumenInsumos,
  canecasPlaneadas,
  canecasAplicadas,
}: SeccionInsumosCierreProps) {
  const insumosConDesviacion = calcularInsumosConDesviacion(resumenInsumos);
  const criticos = insumosConDesviacion.filter((i) => i.esCritico);
  const diferenciaCanecas = canecasAplicadas - canecasPlaneadas;

  return (
    <div className="space-y-4">
      <SeccionHeader numero={1} titulo="Insumos" />

      <Card className="overflow-hidden gap-0 py-0">
        <dl className="grid grid-cols-2 gap-4 border-b bg-gradient-to-br from-primary/5 to-secondary/10 p-5 sm:grid-cols-4">
          <div>
            <dt className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Tipo</dt>
            <dd className="text-sm font-medium text-foreground">
              {ETIQUETA_TIPO[tipoAplicacion] ?? 'Drench'}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Lotes</dt>
            <dd className="text-sm font-medium text-foreground">{totalLotes} lotes</dd>
          </div>
          <div>
            <dt className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Total Árboles
            </dt>
            <dd className="text-sm font-medium text-foreground tabular-nums">
              {formatearNumero(totalArboles, 0)}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Propósito
            </dt>
            <dd className="truncate text-sm font-medium text-foreground" title={proposito ?? undefined}>
              {proposito || 'No especificado'}
            </dd>
          </div>
        </dl>

        {insumosConDesviacion.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No hay insumos registrados
          </p>
        ) : (
          <>
            <RollupInsumos criticos={criticos} insumos={insumosConDesviacion} />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Planeado</TableHead>
                  <TableHead className="text-right">Aplicado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insumosConDesviacion.map((insumo) => (
                  <TableRow key={insumo.nombre}>
                    <TableCell className="whitespace-normal font-medium text-foreground">
                      {insumo.nombre}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatearNumero(insumo.planeado, 2)} {insumo.unidad}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-foreground">
                      {formatearNumero(insumo.aplicado, 2)} {insumo.unidad}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        insumo.diferencia > 0 && 'text-orange-600',
                        insumo.diferencia < 0 && 'text-blue-600',
                      )}
                    >
                      {insumo.diferencia > 0 ? '+' : ''}
                      {formatearNumero(insumo.diferencia, 2)} {insumo.unidad}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={
                          insumo.esCritico
                            ? 'border-destructive/30 bg-destructive/10 text-destructive'
                            : 'border-success/30 bg-success/10 text-success'
                        }
                      >
                        {insumo.esCritico ? 'Desviado' : 'OK'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        {tipoAplicacion === 'Fumigación' && (
          <div className="grid grid-cols-3 gap-4 border-t p-5">
            {/* 2 decimales, no 1, en las TRES celdas. Con 1 decimal se lee
                "76,0 − 75,8 = +0,17", que no cierra y hace dudar del número: el planeado real es
                75,83 y la diferencia real es 0,17. Redondear los operandos pero no el resultado es
                justo lo que hace que la cifra parezca un error de la app. */}
            <CeldaCaneca label="Canecas Planeadas" valor={formatearNumero(canecasPlaneadas, 2)} />
            <CeldaCaneca
              label="Canecas Aplicadas"
              valor={formatearNumero(canecasAplicadas, 2)}
              className="text-primary"
            />
            <CeldaCaneca
              label="Diferencia"
              valor={`${diferenciaCanecas > 0 ? '+' : ''}${formatearNumero(diferenciaCanecas, 2)}`}
              className={cn(
                diferenciaCanecas > 0 && 'text-orange-600',
                diferenciaCanecas < 0 && 'text-blue-600',
              )}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function RollupInsumos({
  criticos,
  insumos,
}: {
  criticos: ReturnType<typeof calcularInsumosConDesviacion>;
  insumos: ReturnType<typeof calcularInsumosConDesviacion>;
}) {
  if (criticos.length > 0) {
    const nombres = criticos.map((i) => i.nombre).join(', ');
    return (
      <div className="flex items-center gap-2 border-b bg-destructive/5 px-5 py-3 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <span>
          {criticos.length === 1 ? '1 insumo con' : `${criticos.length} insumos con`} desviación
          crítica (&gt;15%): <b className="font-semibold">{nombres}</b>.
        </span>
      </div>
    );
  }

  const mayor = insumos.reduce((max, i) =>
    Math.abs(i.diferencia) > Math.abs(max.diferencia) ? i : max,
  );
  const signo = mayor.diferencia > 0 ? '+' : '';

  return (
    <div className="flex items-center gap-2 border-b bg-success/5 px-5 py-3 text-sm text-primary-dark">
      <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>
        {insumos.length} {insumos.length === 1 ? 'insumo aplicado' : 'insumos aplicados'}, dentro
        de rango — mayor variación: {mayor.nombre} {signo}
        {formatearNumero(mayor.diferencia, 2)} {mayor.unidad}.
      </span>
    </div>
  );
}

function CeldaCaneca({
  label,
  valor,
  className,
}: {
  label: string;
  valor: string;
  className?: string;
}) {
  return (
    <div className="text-center">
      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-semibold tabular-nums text-foreground', className)}>{valor}</p>
    </div>
  );
}

/** Encabezado numerado no interactivo — reemplaza a `AplicacionStepper` en esta pantalla (una
 * página de revisión de 3 secciones simultáneas, no un wizard secuencial). Sin `aria-current`,
 * sin done/active/pending: es un ancla de lectura, no un control. Ver `W03-cierre-v2.md` §2. */
export function SeccionHeader({
  numero,
  titulo,
  descripcion,
}: {
  numero: number;
  titulo: string;
  descripcion?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-sm font-bold text-primary-dark">
        {numero}
      </span>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>}
      </div>
    </div>
  );
}
