import {
  formatoFechaCorte,
  formatoKgEtapa,
  textoDiferenciaEtapas,
  type ResumenEtapasCosecha,
  type ResumenProduccionCosecha,
} from '@/utils/calculosProduccionAnalisis';

interface ConciliacionEtapasGapProps {
  resumenes: ResumenProduccionCosecha[];
  etapas: ResumenEtapasCosecha[];
  corteEntrada?: Record<string, string | null | undefined>;
  periodo: string;
}

function etiquetaCorte(fechas: string[]): string {
  const texto = fechas.map((f) => formatoFechaCorte(f)).filter(Boolean).join(' · ');
  return texto ? `Corte ${texto}` : 'Sin fecha de corte';
}

export function ConciliacionEtapasGap({
  resumenes,
  etapas,
  corteEntrada = {},
  periodo,
}: ConciliacionEtapasGapProps) {
  const bloques =
    resumenes.length > 0
      ? resumenes.map((resumen) => {
          const etapa = etapas.find((e) => e.cosecha.key === resumen.cosecha.key);
          return {
            label: resumen.cosecha.label,
            entrada: resumen.tiene_registros ? resumen.produccion_kg : null,
            clasificado: etapa?.clasificado.kg ?? null,
            despachado: etapa?.despachado.kg ?? null,
            corteEntrada: formatoFechaCorte(corteEntrada[resumen.cosecha.key]),
            corteClasificado: etiquetaCorte(etapa?.clasificado.fechas_corte ?? []),
            corteDespachado: etiquetaCorte(etapa?.despachado.fechas_corte ?? []),
            diferencia: textoDiferenciaEtapas(
              etapa?.diferencia_entrada_clasificacion_kg ?? null,
              etapa?.diferencia_sin_despacho_kg ?? null,
            ),
          };
        })
      : [
          {
            label: 'Cosecha',
            entrada: null as number | null,
            clasificado: null as number | null,
            despachado: null as number | null,
            corteEntrada: null as string | null,
            corteClasificado: 'Sin fecha de corte',
            corteDespachado: 'Sin fecha de corte',
            diferencia: 'Sin dato',
          },
        ];

  return (
    <section className="bg-white rounded-xl border border-primary/10 p-5 md:p-6 h-full">
      <h2 className="text-xl text-foreground">Conciliación al corte</h2>
      <p className="text-sm text-brand-brown/70 mt-1">
        {periodo || 'Sin período'} · cada etapa conserva su corte y no se suman
      </p>

      <div className="mt-5 space-y-6">
        {bloques.map((bloque) => {
          const etapasBarra = [
            {
              label: 'Entrada neta',
              valor: bloque.entrada,
              corte: bloque.corteEntrada ? `Corte ${bloque.corteEntrada}` : 'Sin fecha de corte en produccion',
            },
            {
              label: 'Clasificado',
              valor: bloque.clasificado,
              corte: `${bloque.corteClasificado}. Canastas × 20 kg.`,
            },
            {
              label: 'Despachado',
              valor: bloque.despachado,
              corte: bloque.corteDespachado,
            },
          ];
          const maxRef = Math.max(bloque.entrada ?? 0, bloque.clasificado ?? 0, bloque.despachado ?? 0, 1);
          return (
            <div key={bloque.label}>
              {bloques.length > 1 && (
                <p className="text-sm font-medium text-foreground mb-2">{bloque.label}</p>
              )}
              <div className="space-y-4">
                {etapasBarra.map((etapa) => (
                  <div key={etapa.label}>
                    <div className="flex justify-between gap-3 text-sm mb-1">
                      <span className="text-foreground">{etapa.label}</span>
                      <span className="font-mono text-foreground">{formatoKgEtapa(etapa.valor)}</span>
                    </div>
                    <div className="h-3 rounded-sm bg-[#F3F6EE] overflow-hidden">
                      {etapa.valor != null ? (
                        <div
                          className="h-full bg-primary rounded-sm"
                          style={{
                            width: `${Math.max(4, Math.round((Math.abs(etapa.valor) / maxRef) * 100))}%`,
                          }}
                        />
                      ) : (
                        <div className="h-full w-full bg-[repeating-linear-gradient(135deg,#e7eddd,#e7eddd_6px,#f7faf2_6px,#f7faf2_12px)]" />
                      )}
                    </div>
                    <p className="text-sm sm:text-xs text-brand-brown/60 mt-1">{etapa.corte}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-lg bg-[#F7FAF2] border border-primary/10 px-4 py-3 text-sm text-foreground">
        <p className="font-medium">Diferencia por revisar</p>
        {bloques.map((bloque) => (
          <p key={bloque.label} className="mt-1 text-brand-brown/80 leading-relaxed">
            {bloques.length > 1 ? `${bloque.label}: ` : ''}
            {bloque.diferencia}
          </p>
        ))}
        <p className="mt-1 text-brand-brown/70 leading-relaxed">
          Una diferencia no es necesariamente merma. El clasificado son canastas × 20 kg.
        </p>
      </div>
    </section>
  );
}
