import { conciliarEtapas } from '@/utils/calculosProduccionAnalisis';

interface EntradaConciliacion {
  label: string;
  kg: number | null;
}

interface ConciliacionEtapasGapProps {
  entradas: EntradaConciliacion[];
  periodo: string;
}

export function ConciliacionEtapasGap({ entradas, periodo }: ConciliacionEtapasGapProps) {
  const bloques = (entradas.length > 0 ? entradas : [{ label: 'Cosecha', kg: null }]).map(
    (entrada) => ({
      label: entrada.label,
      corte: conciliarEtapas(entrada.kg, null, null),
    }),
  );
  return (
    <section className="bg-white rounded-xl border border-primary/10 p-5 md:p-6 h-full">
      <h2 className="text-xl text-foreground">Conciliación al corte</h2>
      <p className="text-sm text-brand-brown/70 mt-1">
        {periodo || 'Sin período'} · etapas separadas, no se suman
      </p>

      <div className="mt-5 space-y-6">
        {bloques.map((bloque) => {
          const etapas = [
            { label: 'Entrada neta', valor: bloque.corte.entrada_kg },
            { label: 'Clasificado', valor: bloque.corte.clasificado_kg },
            { label: 'Despachado', valor: bloque.corte.despachado_kg },
          ];
          const maxRef = Math.max(bloque.corte.entrada_kg ?? 0, 1);
          return (
            <div key={bloque.label}>
              {bloques.length > 1 && (
                <p className="text-sm font-medium text-foreground mb-2">{bloque.label}</p>
              )}
              <div className="space-y-4">
                {etapas.map((etapa) => (
                  <div key={etapa.label}>
                    <div className="flex justify-between gap-3 text-sm mb-1.5">
                      <span className="text-foreground">{etapa.label}</span>
                      <span className="font-mono text-foreground">
                        {etapa.valor != null
                          ? `${Math.round(etapa.valor).toLocaleString('es-CO')} kg`
                          : 'Sin dato'}
                      </span>
                    </div>
                    <div className="h-3 rounded-sm bg-[#F3F6EE] overflow-hidden">
                      {etapa.valor != null ? (
                        <div
                          className="h-full bg-primary rounded-sm"
                          style={{
                            width: `${Math.max(4, Math.round((etapa.valor / maxRef) * 100))}%`,
                          }}
                        />
                      ) : (
                        <div className="h-full w-full bg-[repeating-linear-gradient(135deg,#e7eddd,#e7eddd_6px,#f7faf2_6px,#f7faf2_12px)]" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-lg bg-[#F7FAF2] border border-primary/10 px-4 py-3 text-sm text-foreground">
        <p className="font-medium">Diferencia por revisar</p>
        <p className="mt-1 text-brand-brown/80 leading-relaxed">{bloques[0].corte.nota}</p>
      </div>
    </section>
  );
}
