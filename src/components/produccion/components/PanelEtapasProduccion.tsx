import type { ResumenProduccionCosecha } from '@/utils/calculosProduccionAnalisis';
import { conciliarEtapas } from '@/utils/calculosProduccionAnalisis';

interface PanelEtapasProduccionProps {
  resumenes: ResumenProduccionCosecha[];
  vista: 'una' | 'varias';
  loading?: boolean;
}

function fmtKg(valor: number | null, loading: boolean): string {
  if (loading) return '…';
  if (valor == null) return 'Sin dato';
  return `${Math.round(valor).toLocaleString('es-CO')} kg`;
}

export function PanelEtapasProduccion({
  resumenes,
  vista,
  loading = false,
}: PanelEtapasProduccionProps) {
  const una = vista === 'una' ? resumenes[resumenes.length - 1] : null;
  const entrada = una?.tiene_registros ? una.produccion_kg : null;
  const conciliacion = conciliarEtapas(entrada, null, null);

  const cards = [
    {
      titulo: 'Entrada neta',
      valor: vista === 'varias' ? null : fmtKg(entrada, loading),
      subtitulo:
        vista === 'varias'
          ? 'Cada campaña conserva su total. No se suman entre sí.'
          : una
            ? `Producción registrada · ${una.cosecha.label}`
            : 'Producción registrada de la cosecha',
      destacada: true,
    },
    {
      titulo: 'Clasificado',
      valor: 'Sin dato',
      subtitulo: 'Sin líneas de clasificación en este corte',
      destacada: false,
    },
    {
      titulo: 'Despachado',
      valor: 'Sin dato',
      subtitulo: 'Sin despachos ligados a esta cosecha',
      destacada: false,
    },
    {
      titulo: 'Diferencia por revisar',
      valor: 'Sin dato',
      subtitulo: conciliacion.nota,
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
              card.destacada
                ? 'bg-[#E4EED0] border-[#C5D6A4]'
                : 'bg-white border-primary/10'
            }`}
          >
            <p className="text-sm text-brand-brown/70">{card.titulo}</p>
            {card.destacada && vista === 'varias' ? (
              <ul className="mt-2 space-y-1">
                {resumenes.length === 0 && (
                  <li className="text-2xl font-semibold text-foreground">Sin dato</li>
                )}
                {resumenes.map((r) => (
                  <li key={r.cosecha.key} className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-foreground">{r.cosecha.label}</span>
                    <span className="text-base font-semibold tabular-nums text-foreground">
                      {loading
                        ? '…'
                        : r.tiene_registros
                          ? `${r.produccion_kg.toLocaleString('es-CO')} kg`
                          : 'Sin dato'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                  card.valor === 'Sin dato' ? 'text-brand-brown/40' : 'text-foreground'
                }`}
              >
                {card.valor}
              </p>
            )}
            <p className="text-xs text-brand-brown/60 mt-2 leading-relaxed">{card.subtitulo}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
