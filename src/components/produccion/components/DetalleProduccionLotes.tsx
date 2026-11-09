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
  onVerCosecha?: (key: string) => void;
}

function kgDe(fila: ComparacionLoteCosecha, key: string): number | null {
  if (fila.kg_por_cosecha && key in fila.kg_por_cosecha) {
    return fila.kg_por_cosecha[key];
  }
  return fila.por_cosecha[key] ?? null;
}

function totalDe(filas: ComparacionLoteCosecha[], key: string): number | null {
  const valores = filas.map((f) => kgDe(f, key)).filter((v): v is number => v != null);
  if (valores.length === 0) return null;
  return valores.reduce((s, v) => s + v, 0);
}

function CeldaVacia({ children }: { children: string }) {
  return <span className="text-brand-brown/50">{children}</span>;
}

export function DetalleProduccionLotes({
  filas,
  cosechas,
  loading = false,
  onVerCosecha,
}: DetalleProduccionLotesProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-primary/10 p-6 animate-pulse h-48" />
    );
  }

  return (
    <section className="bg-white rounded-xl border border-primary/10 p-5 md:p-6 space-y-8">
      <div>
        <h2 className="text-xl text-foreground">Detalle por lote</h2>
        <p className="text-sm text-brand-brown/70 mt-1">
          Entrada = kg registrados. Clasificación, despacho y diferencia quedan en blanco
          cuando no hay etapa.
        </p>
      </div>

      {cosechas.length === 0 && (
        <p className="text-sm text-brand-brown/70">Sin cosecha en el corte actual.</p>
      )}

      {cosechas.map((cosecha) => {
        const total = totalDe(filas, cosecha.key);
        const filasCosecha = filas.filter((f) => kgDe(f, cosecha.key) != null);
        return (
          <div key={cosecha.key} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-medium text-foreground">{cosecha.label}</p>
              {onVerCosecha && cosechas.length > 1 && (
                <button
                  type="button"
                  onClick={() => onVerCosecha(cosecha.key)}
                  className="min-h-11 text-sm font-medium text-primary"
                >
                  Ver esta cosecha
                </button>
              )}
            </div>

            <div className="md:hidden space-y-3">
              {filasCosecha.map((fila) => (
                <article
                  key={fila.lote_id}
                  className="rounded-xl border border-primary/10 px-4 py-3"
                >
                  <p className="text-base font-medium text-foreground">{fila.lote_nombre}</p>
                  <p className="text-base font-semibold tabular-nums mt-1">
                    {Math.round(kgDe(fila, cosecha.key) ?? 0).toLocaleString('es-CO')} kg de entrada
                  </p>
                  <p className="text-sm text-brand-brown/60 mt-1">
                    Clasificado, despachado y diferencia: Sin dato
                  </p>
                </article>
              ))}
              {filasCosecha.length === 0 && (
                <p className="text-sm text-brand-brown/70">Sin lotes con dato.</p>
              )}
            </div>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote</TableHead>
                    <TableHead>Entrada kg</TableHead>
                    <TableHead>Clasificado kg</TableHead>
                    <TableHead>Despachado kg</TableHead>
                    <TableHead>Diferencia kg</TableHead>
                    <TableHead>Respaldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody striped>
                  {filasCosecha.map((fila) => (
                    <TableRow key={fila.lote_id}>
                      <TableCell className="font-medium">{fila.lote_nombre}</TableCell>
                      <TableCell className="font-mono">
                        {Math.round(kgDe(fila, cosecha.key) ?? 0).toLocaleString('es-CO')}
                      </TableCell>
                      <TableCell>
                        <CeldaVacia>Sin dato</CeldaVacia>
                      </TableCell>
                      <TableCell>
                        <CeldaVacia>Sin dato</CeldaVacia>
                      </TableCell>
                      <TableCell>
                        <CeldaVacia>Sin dato</CeldaVacia>
                      </TableCell>
                      <TableCell className="text-brand-brown/70">
                        Registro de producción
                      </TableCell>
                    </TableRow>
                  ))}
                  {filasCosecha.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-brand-brown/70">
                        Sin lotes con dato en esta cosecha.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {filasCosecha.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell>Total de esta cosecha</TableCell>
                      <TableCell className="font-mono">
                        {total != null ? Math.round(total).toLocaleString('es-CO') : 'Sin dato'}
                      </TableCell>
                      <TableCell>
                        <CeldaVacia>Sin dato</CeldaVacia>
                      </TableCell>
                      <TableCell>
                        <CeldaVacia>Sin dato</CeldaVacia>
                      </TableCell>
                      <TableCell>
                        <CeldaVacia>Sin dato</CeldaVacia>
                      </TableCell>
                      <TableCell className="font-normal text-brand-brown/70">
                        Solo la entrada. Las etapas no se suman.
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </div>
        );
      })}
    </section>
  );
}
