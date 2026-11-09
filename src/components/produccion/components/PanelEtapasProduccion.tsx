import type { ResumenEtapasCosecha, ResumenProduccionCosecha } from '@/utils/calculosProduccionAnalisis';
import { formatoFechaCorte, formatoKgEtapa, textoDiferenciaEtapas } from '@/utils/calculosProduccionAnalisis';

interface PanelEtapasProduccionProps {
  resumenes: ResumenProduccionCosecha[];
  etapas: ResumenEtapasCosecha[];
  vista: 'una' | 'varias';
  /** Corte de la entrada cuando se conoce. `produccion` no lo guarda. */
  corteEntrada?: Record<string, string | null | undefined>;
  loading?: boolean;
}

function fechas(lista: string[]): string {
  const texto = lista.map((f) => formatoFechaCorte(f)).filter(Boolean).join(' · ');
  return texto || 'Sin fecha de corte';
}

export function PanelEtapasProduccion({
  resumenes,
  etapas,
  vista,
  corteEntrada = {},
  loading = false,
}: PanelEtapasProduccionProps) {
  const una = vista === 'una' ? resumenes[resumenes.length - 1] : null;
  const etapaUna = una ? etapas.find((e) => e.cosecha.key === una.cosecha.key) : null;
  const entrada = una?.tiene_registros ? una.produccion_kg : null;
  const corteUna = una ? formatoFechaCorte(corteEntrada[una.cosecha.key]) : null;

  const cards = [
    {
      titulo: 'Entrada neta',
      valor: vista === 'varias' ? null : loading ? '…' : formatoKgEtapa(entrada),
      subtitulo:
        vista === 'varias'
          ? 'Cada campaña conserva su total. No se suma con clasificación ni despacho.'
          : corteUna
            ? `Corte ${corteUna}`
            : 'Sin fecha de corte en produccion',
      destacada: true,
    },
    {
      titulo: 'Clasificado',
      valor: vista === 'varias' ? null : loading ? '…' : formatoKgEtapa(etapaUna?.clasificado.kg ?? null),
      subtitulo:
        vista === 'varias'
          ? 'Canastas × 20 kg. Cada campaña tiene su corte.'
          : `${fechas(etapaUna?.clasificado.fechas_corte ?? [])}. Canastas × 20 kg.`,
      destacada: false,
    },
    {
      titulo: 'Despachado',
      valor: vista === 'varias' ? null : loading ? '…' : formatoKgEtapa(etapaUna?.despachado.kg ?? null),
      subtitulo:
        vista === 'varias'
          ? 'Corte propio del despacho, distinto del de la entrada si hace falta.'
          : fechas(etapaUna?.despachado.fechas_corte ?? []),
      destacada: false,
    },
    {
      titulo: 'Diferencia por revisar',
      valor:
        vista === 'varias'
          ? null
          : loading
            ? '…'
            : textoDiferenciaEtapas(
                etapaUna?.diferencia_entrada_clasificacion_kg ?? null,
                etapaUna?.diferencia_sin_despacho_kg ?? null,
              ),
      subtitulo: 'Una diferencia no es necesariamente merma. Las etapas no se suman.',
      destacada: false,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div
            key={card.titulo}
            className={`rounded-xl border p-5 ${
              card.destacada ? 'bg-[#E4EED0] border-[#C5D6A4]' : 'bg-white border-primary/10'
            }`}
          >
            <p className="text-sm text-brand-brown/70">{card.titulo}</p>
            {vista === 'varias' ? (
              <ul className="mt-2 space-y-2">
                {resumenes.length === 0 && (
                  <li className="text-2xl font-semibold text-brand-brown/40">Sin dato</li>
                )}
                {resumenes.map((r) => {
                  const etapa = etapas.find((e) => e.cosecha.key === r.cosecha.key);
                  let valor = 'Sin dato';
                  if (!loading) {
                    if (card.titulo === 'Entrada neta') {
                      valor = r.tiene_registros ? formatoKgEtapa(r.produccion_kg) : 'Sin dato';
                    } else if (card.titulo === 'Clasificado') {
                      valor = formatoKgEtapa(etapa?.clasificado.kg ?? null);
                    } else if (card.titulo === 'Despachado') {
                      valor = formatoKgEtapa(etapa?.despachado.kg ?? null);
                    } else {
                      valor = textoDiferenciaEtapas(
                        etapa?.diferencia_entrada_clasificacion_kg ?? null,
                        etapa?.diferencia_sin_despacho_kg ?? null,
                      );
                    }
                  }
                  return (
                    <li key={r.cosecha.key}>
                      <p className="text-sm text-foreground">{r.cosecha.label}</p>
                      <p className="text-base font-semibold tabular-nums text-foreground">{valor}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p
                className={`mt-1 font-semibold tabular-nums leading-tight ${
                  card.titulo === 'Diferencia por revisar' ? 'text-base' : 'text-2xl'
                } ${card.valor === 'Sin dato' ? 'text-brand-brown/40' : 'text-foreground'}`}
              >
                {card.valor}
              </p>
            )}
            <p className="text-sm sm:text-xs text-brand-brown/60 mt-2 leading-relaxed">{card.subtitulo}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
