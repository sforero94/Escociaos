import { useState } from 'react';
import {
  construirEvolucionSemanal,
  type EjeEvolucion,
  type RegistroProduccionAgregable,
} from '@/utils/calculosProduccionAnalisis';
import type { CosechaIdentidad } from '../../../types/produccion';

interface EvolucionCosechaProps {
  cosechas: CosechaIdentidad[];
  registros: RegistroProduccionAgregable[];
  onVerCosecha?: (key: string) => void;
}

const COLORES = ['#73991C', '#B7C98A', '#5f7d17', '#8FA86A', '#3F6212', '#D9E6BE'];

export function EvolucionSemanalGap({
  cosechas,
  registros,
  onVerCosecha,
}: EvolucionCosechaProps) {
  const [eje, setEje] = useState<EjeEvolucion>('desde_inicio');
  const evolucion = construirEvolucionSemanal(registros, cosechas, eje);
  const seriesConPuntos = evolucion.series.filter((s) => s.puntos.length > 0);
  const maxAcum = Math.max(
    1,
    ...seriesConPuntos.flatMap((s) => s.puntos.map((p) => p.acumulado)),
  );
  const maxKg = Math.max(
    1,
    ...seriesConPuntos.flatMap((s) => s.puntos.map((p) => p.kg ?? 0)),
  );

  const etiquetas =
    eje === 'desde_inicio'
      ? Array.from(
          { length: Math.max(0, ...seriesConPuntos.map((s) => s.puntos.length)) },
          (_, i) => String(i + 1),
        )
      : Array.from(
          new Set(seriesConPuntos.flatMap((s) => s.puntos.map((p) => p.etiqueta_calendario))),
        );

  return (
    <section className="bg-white rounded-xl border border-primary/10 p-5 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl text-foreground">Evolución de la cosecha</h2>
          <p className="text-sm text-brand-brown/70 mt-1 max-w-2xl">{evolucion.mensaje}</p>
        </div>
        <div className="flex rounded-lg border border-primary/15 overflow-hidden shrink-0">
          {(
            [
              { id: 'desde_inicio', label: 'Desde el inicio' },
              { id: 'calendario', label: 'Calendario' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setEje(opt.id)}
              className={`min-h-11 px-3 text-sm ${
                eje === opt.id ? 'bg-primary text-white' : 'bg-white text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {evolucion.estado !== 'ok' ? (
        <div className="mt-5 h-56 rounded-lg border border-dashed border-primary/20 bg-[#F7FAF2] flex items-center justify-center px-6 text-center">
          <p className="text-sm text-brand-brown/80 max-w-xl">{evolucion.motivo}</p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <div
            className="grid gap-3 min-w-[280px]"
            style={{ gridTemplateColumns: `repeat(${Math.max(etiquetas.length, 1)}, minmax(2.5rem, 1fr))` }}
          >
            {etiquetas.map((etiqueta, index) => (
              <div key={`${etiqueta}-${index}`} className="flex flex-col items-center gap-1">
                <div className="h-36 w-full flex items-end justify-center gap-0.5">
                  {seriesConPuntos.map((serie, serieIndex) => {
                    const punto =
                      eje === 'desde_inicio'
                        ? serie.puntos[index]
                        : serie.puntos.find((p) => p.etiqueta_calendario === etiqueta);
                    const kg = punto?.kg;
                    const alto = kg == null ? 0 : Math.max(4, Math.round((kg / maxKg) * 100));
                    return (
                      <div
                        key={serie.cosecha.key}
                        className="w-3 sm:w-4 rounded-sm"
                        style={{
                          height: kg == null ? 2 : `${alto}%`,
                          backgroundColor:
                            kg == null ? 'transparent' : COLORES[serieIndex % COLORES.length],
                          opacity: kg == null ? 0 : 0.9,
                        }}
                        title={
                          kg == null
                            ? `${serie.cosecha.label}: sin movimiento`
                            : `${serie.cosecha.label}: ${Math.round(kg).toLocaleString('es-CO')} kg`
                        }
                      />
                    );
                  })}
                </div>
                <span className="text-xs text-brand-brown/60">{etiqueta}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-brand-brown/60">
            Barras: entrada de la semana. El acumulado máximo del corte es{' '}
            {Math.round(maxAcum).toLocaleString('es-CO')} kg. Una semana en blanco no es cero.
          </p>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {evolucion.series.map((serie, index) => (
          <li
            key={serie.cosecha.key}
            className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COLORES[index % COLORES.length] }}
              />
              <span className="font-medium text-foreground">{serie.cosecha.label}</span>
              <span className="text-brand-brown/60">
                {serie.corte
                  ? `corte ${serie.corte} · ${serie.semanas_con_dato} semanas con dato`
                  : 'sin fecha de movimiento'}
                {' · abierta/cerrada no registrada'}
              </span>
            </div>
            {onVerCosecha && (
              <button
                type="button"
                onClick={() => onVerCosecha(serie.cosecha.key)}
                className="min-h-11 text-left text-sm text-primary font-medium"
              >
                Ver detalle
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-brand-brown/60 leading-relaxed">{evolucion.motivo}</p>
    </section>
  );
}
