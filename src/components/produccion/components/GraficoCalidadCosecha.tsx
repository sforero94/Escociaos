interface DatoCalidadCosecha {
  cosecha: string;
  cosecha_label: string;
  kg_exportacion: number;
  kg_nacional: number;
  kg_sin_desglose: number;
  kg_con_desglose?: number;
  pct_exportacion?: number | null;
  pct_nacional?: number | null;
}

interface GraficoCalidadCosechaProps {
  data: DatoCalidadCosecha[];
  loading?: boolean;
}

function pct(parte: number, total: number): string {
  if (total <= 0) return 'Sin dato';
  return `${((parte / total) * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
}

function Fila({
  color,
  nombre,
  kg,
  porcentaje,
}: {
  color: string;
  nombre: string;
  kg: number;
  porcentaje: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center text-sm">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-foreground">{nombre}</span>
      <span className="font-mono text-foreground tabular-nums text-right">
        {Math.round(kg).toLocaleString('es-CO')} kg
        <span className="text-brand-brown/60 font-sans"> · {porcentaje}</span>
      </span>
    </div>
  );
}

export function GraficoCalidadCosecha({ data, loading = false }: GraficoCalidadCosechaProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-primary/10 p-6 animate-pulse h-full min-h-[240px]" />
    );
  }

  return (
    <section className="bg-white rounded-xl border border-primary/10 p-5 md:p-6 h-full">
      <h2 className="text-xl text-foreground">Calidades y clasificación</h2>
      {(!data || data.length === 0) && (
        <p className="mt-4 text-sm text-brand-brown/70">Sin cosecha en el corte actual.</p>
      )}
      <div className="mt-4 space-y-6">
        {(data ?? []).map((dato) => {
          const conDesglose = dato.kg_con_desglose ?? dato.kg_exportacion + dato.kg_nacional;
          const total = conDesglose + dato.kg_sin_desglose;
          const segmentos = [
            { key: 'exp', kg: dato.kg_exportacion, color: '#73991C' },
            { key: 'nac', kg: dato.kg_nacional, color: '#C5D6A4' },
            { key: 'sin', kg: dato.kg_sin_desglose, color: '#E4D3C4' },
          ].filter((s) => s.kg > 0);
          return (
            <div key={dato.cosecha}>
              <p className="text-sm font-medium text-foreground">{dato.cosecha_label}</p>
              {total <= 0 ? (
                <p className="text-sm text-brand-brown/70 mt-2">
                  Sin dato en este corte. No hay kilos de entrada para clasificar.
                </p>
              ) : (
              <>
              <p className="text-sm sm:text-xs text-brand-brown/60 mt-1">
                {conDesglose > 0
                  ? `Base del porcentaje: ${Math.round(conDesglose).toLocaleString('es-CO')} kg clasificados. Quedan fuera ${Math.round(dato.kg_sin_desglose).toLocaleString('es-CO')} kg sin desglose.`
                  : `Sin desglose de calidad. ${Math.round(dato.kg_sin_desglose).toLocaleString('es-CO')} kg quedan sin clasificar.`}
              </p>
              <div className="mt-3 h-4 rounded-sm overflow-hidden flex bg-[#F3F6EE]">
                {total <= 0 ? (
                  <div className="h-full w-full bg-[repeating-linear-gradient(135deg,#e7eddd,#e7eddd_6px,#f7faf2_6px,#f7faf2_12px)]" />
                ) : (
                  segmentos.map((s) => (
                    <div
                      key={s.key}
                      style={{ width: `${(s.kg / total) * 100}%`, backgroundColor: s.color }}
                    />
                  ))
                )}
              </div>
              <div className="mt-3 space-y-2">
                {conDesglose > 0 ? (
                  <>
                    <Fila
                      color="#73991C"
                      nombre="Exportación"
                      kg={dato.kg_exportacion}
                      porcentaje={
                        dato.pct_exportacion != null
                          ? `${dato.pct_exportacion.toLocaleString('es-CO', { maximumFractionDigits: 1 })} % del clasificado`
                          : pct(dato.kg_exportacion, conDesglose)
                      }
                    />
                    <Fila
                      color="#C5D6A4"
                      nombre="Nacional"
                      kg={dato.kg_nacional}
                      porcentaje={
                        dato.pct_nacional != null
                          ? `${dato.pct_nacional.toLocaleString('es-CO', { maximumFractionDigits: 1 })} % del clasificado`
                          : pct(dato.kg_nacional, conDesglose)
                      }
                    />
                  </>
                ) : (
                  <p className="text-sm text-brand-brown/70">
                    Exportación y nacional: Sin dato. No hay desglose para calcular un porcentaje.
                  </p>
                )}
                <Fila
                  color="#E4D3C4"
                  nombre="Sin desglose"
                  kg={dato.kg_sin_desglose}
                  porcentaje="fuera del denominador"
                />
              </div>
              </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
