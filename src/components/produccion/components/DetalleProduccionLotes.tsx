import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ComparacionLoteCosecha, DetalleEtapaLote } from '@/utils/calculosProduccionAnalisis';
import { formatoFechaCorte, formatoKgEtapa, textoDiferenciaEtapas } from '@/utils/calculosProduccionAnalisis';
import type { CosechaIdentidad } from '../../../types/produccion';

interface DetalleProduccionLotesProps {
  filas: ComparacionLoteCosecha[];
  cosechas: CosechaIdentidad[];
  etapasPorLote?: DetalleEtapaLote[];
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

function buscarEtapa(
  etapas: DetalleEtapaLote[],
  cosechaKey: string,
  loteId: string,
): DetalleEtapaLote | undefined {
  return etapas.find((e) => e.cosechaKey === cosechaKey && e.lote_id === loteId);
}

function textoRespaldo(etapa: DetalleEtapaLote | undefined): string {
  if (!etapa) return 'Sin etapa registrada';
  const partes: string[] = [];
  const clas = formatoFechaCorte(etapa.fecha_clasificado);
  const desp = formatoFechaCorte(etapa.fecha_despachado);
  if (clas) partes.push(`Clasificado al ${clas}`);
  if (desp) partes.push(`Despachado al ${desp}`);
  return partes.length > 0 ? partes.join(' · ') : 'Sin etapa registrada';
}

export function DetalleProduccionLotes({
  filas,
  cosechas,
  etapasPorLote = [],
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
          Entrada, clasificado y despachado se leen aparte. Si falta la etapa, queda en blanco.
          El clasificado son canastas × 20 kg.
        </p>
      </div>

      {cosechas.length === 0 && (
        <p className="text-sm text-brand-brown/70">Sin cosecha en el corte actual.</p>
      )}

      {cosechas.map((cosecha) => {
        const total = totalDe(filas, cosecha.key);
        const filasCosecha = filas.filter((f) => kgDe(f, cosecha.key) != null);
        const idsExtra = etapasPorLote
          .filter(
            (e) =>
              e.cosechaKey === cosecha.key &&
              (e.clasificado_kg != null || e.despachado_kg != null) &&
              !filasCosecha.some((f) => f.lote_id === e.lote_id),
          )
          .map((e) => e.lote_id);
        const filasVista = [
          ...filasCosecha,
          ...idsExtra.map((lote_id) => ({
            lote_id,
            lote_nombre: lote_id,
            por_cosecha: {},
            kg_por_cosecha: {},
          })),
        ];
        const totalClas = etapasPorLote
          .filter((e) => e.cosechaKey === cosecha.key && e.clasificado_kg != null)
          .reduce((s, e) => s + (e.clasificado_kg as number), 0);
        const hayClas = etapasPorLote.some(
          (e) => e.cosechaKey === cosecha.key && e.clasificado_kg != null,
        );
        const totalDesp = etapasPorLote
          .filter((e) => e.cosechaKey === cosecha.key && e.despachado_kg != null)
          .reduce((s, e) => s + (e.despachado_kg as number), 0);
        const hayDesp = etapasPorLote.some(
          (e) => e.cosechaKey === cosecha.key && e.despachado_kg != null,
        );
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
              {filasVista.map((fila) => {
                const etapa = buscarEtapa(etapasPorLote, cosecha.key, fila.lote_id);
                const entrada = kgDe(fila, cosecha.key);
                return (
                  <article
                    key={fila.lote_id}
                    className="rounded-xl border border-primary/10 px-4 py-3"
                  >
                    <p className="text-base font-medium text-foreground">{fila.lote_nombre}</p>
                    <p className="text-base font-semibold tabular-nums mt-1">
                      Entrada {entrada == null ? 'Sin dato' : formatoKgEtapa(entrada)}
                    </p>
                    <p className="text-sm text-brand-brown/80 mt-1">
                      Clasificado {formatoKgEtapa(etapa?.clasificado_kg ?? null)} · Despachado{' '}
                      {formatoKgEtapa(etapa?.despachado_kg ?? null)}
                    </p>
                    <p className="text-sm text-brand-brown/70 mt-1">
                      {textoDiferenciaEtapas(
                        etapa?.diferencia_entrada_clasificacion_kg ?? null,
                        etapa?.diferencia_sin_despacho_kg ?? null,
                      )}
                    </p>
                    <p className="text-sm text-brand-brown/60 mt-1">{textoRespaldo(etapa)}</p>
                  </article>
                );
              })}
              {filasVista.length === 0 && (
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
                  {filasVista.map((fila) => {
                    const etapa = buscarEtapa(etapasPorLote, cosecha.key, fila.lote_id);
                    const entrada = kgDe(fila, cosecha.key);
                    return (
                      <TableRow key={fila.lote_id}>
                        <TableCell className="font-medium">{fila.lote_nombre}</TableCell>
                        <TableCell className="font-mono">
                          {entrada == null ? <CeldaVacia>Sin dato</CeldaVacia> : formatoKgEtapa(entrada)}
                        </TableCell>
                        <TableCell className="font-mono">
                          {etapa?.clasificado_kg == null ? (
                            <CeldaVacia>Sin dato</CeldaVacia>
                          ) : (
                            formatoKgEtapa(etapa.clasificado_kg)
                          )}
                        </TableCell>
                        <TableCell className="font-mono">
                          {etapa?.despachado_kg == null ? (
                            <CeldaVacia>Sin dato</CeldaVacia>
                          ) : (
                            formatoKgEtapa(etapa.despachado_kg)
                          )}
                        </TableCell>
                        <TableCell>
                          {textoDiferenciaEtapas(
                            etapa?.diferencia_entrada_clasificacion_kg ?? null,
                            etapa?.diferencia_sin_despacho_kg ?? null,
                          )}
                        </TableCell>
                        <TableCell className="text-brand-brown/70">{textoRespaldo(etapa)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {filasVista.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-brand-brown/70">
                        Sin lotes con dato en esta cosecha.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {filasVista.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell>Total de esta cosecha</TableCell>
                      <TableCell className="font-mono">
                        {total != null ? formatoKgEtapa(total) : 'Sin dato'}
                      </TableCell>
                      <TableCell className="font-mono">
                        {hayClas ? formatoKgEtapa(totalClas) : <CeldaVacia>Sin dato</CeldaVacia>}
                      </TableCell>
                      <TableCell className="font-mono">
                        {hayDesp ? formatoKgEtapa(totalDesp) : <CeldaVacia>Sin dato</CeldaVacia>}
                      </TableCell>
                      <TableCell className="font-normal text-brand-brown/70">
                        Las etapas no se suman entre sí.
                      </TableCell>
                      <TableCell className="font-normal text-brand-brown/70">
                        Cada etapa conserva su corte.
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
