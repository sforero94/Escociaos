import type { ReactNode } from 'react';
import { Button } from '../../ui/button';
import { X, AlertTriangle } from 'lucide-react';
import type {
  FiltrosProduccion as FiltrosType,
  LoteProduccion,
  MetricaProduccion,
  CosechaIdentidad,
  VistaProduccion,
  CosechaTipo,
} from '../../../types/produccion';
import { getLoteCode } from '../../../types/produccion';
import {
  anosCampanaDeCosechas,
  resolverSeleccionCosechas,
} from '@/utils/calculosProduccionAnalisis';

interface FiltrosProduccionProps {
  filtros: FiltrosType;
  lotes: LoteProduccion[];
  anosDisponibles: number[];
  cosechasDisponibles: CosechaIdentidad[];
  corteLabel: string;
  corteDetalle: string;
  onFiltrosChange: (filtros: FiltrosType) => void;
}

const METRICA_UI: { id: MetricaProduccion; label: string }[] = [
  { id: 'kg_totales', label: 'Producción · kg' },
  { id: 'kg_por_arbol', label: 'kg / árbol' },
  { id: 'ton_por_ha', label: 't / ha' },
];

function proyectarFiltros(
  base: FiltrosType,
  disponibles: CosechaIdentidad[],
): FiltrosType {
  const seleccion = resolverSeleccionCosechas(disponibles, base);
  const cosechas = seleccion.estado === 'ok' ? seleccion.cosechas : [];
  const anos = anosCampanaDeCosechas(cosechas);
  const tipos = Array.from(new Set(cosechas.map((c) => c.tipo)));
  const cosecha_tipo: CosechaTipo | 'Ambas' = tipos.length === 1 ? tipos[0] : 'Ambas';
  return { ...base, anos, cosecha_tipo };
}

function TarjetaFiltro({
  etiqueta,
  children,
  detalle,
}: {
  etiqueta: string;
  children: ReactNode;
  detalle?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-primary/10 px-4 py-3 min-w-0">
      <p className="text-sm sm:text-xs uppercase tracking-wide text-brand-brown/60 mb-1">{etiqueta}</p>
      {children}
      {detalle && <p className="text-sm sm:text-xs text-brand-brown/50 mt-1 leading-snug">{detalle}</p>}
    </div>
  );
}

export function FiltrosProduccion({
  filtros,
  lotes,
  anosDisponibles,
  cosechasDisponibles,
  corteLabel,
  corteDetalle,
  onFiltrosChange,
}: FiltrosProduccionProps) {
  const seleccion = resolverSeleccionCosechas(cosechasDisponibles, filtros);

  const emit = (parcial: Partial<FiltrosType>) => {
    onFiltrosChange(proyectarFiltros({ ...filtros, ...parcial }, cosechasDisponibles));
  };

  const toggleAno = (ano: number) => {
    const anos_movimiento = filtros.anos_movimiento.includes(ano)
      ? filtros.anos_movimiento.filter((a) => a !== ano)
      : [...filtros.anos_movimiento, ano].sort((a, b) => a - b);
    emit({ anos_movimiento });
  };

  const toggleCosecha = (key: string) => {
    if (filtros.vista === 'una') {
      emit({ cosecha_keys: [key] });
      return;
    }
    const cosecha_keys = filtros.cosecha_keys.includes(key)
      ? filtros.cosecha_keys.filter((k) => k !== key)
      : [...filtros.cosecha_keys, key];
    emit({ cosecha_keys });
  };

  const toggleLote = (loteId: string) => {
    const lote_ids = filtros.lote_ids.includes(loteId)
      ? filtros.lote_ids.filter((l) => l !== loteId)
      : [...filtros.lote_ids, loteId];
    emit({ lote_ids });
  };

  const setVista = (vista: VistaProduccion) => {
    if (vista === 'una' && filtros.cosecha_keys.length > 1) {
      emit({
        vista,
        cosecha_keys: [filtros.cosecha_keys[filtros.cosecha_keys.length - 1]],
      });
      return;
    }
    emit({ vista });
  };

  const limpiarFiltros = () => {
    const ultima = cosechasDisponibles[cosechasDisponibles.length - 1];
    onFiltrosChange(
      proyectarFiltros(
        {
          vista: filtros.vista,
          anos_movimiento: [],
          cosecha_keys: filtros.vista === 'una' && ultima ? [ultima.key] : [],
          lote_ids: [],
          metrica: 'kg_totales',
          anos: [],
          cosecha_tipo: 'Ambas',
        },
        cosechasDisponibles,
      ),
    );
  };

  const cosechaValor =
    seleccion.estado === 'ok'
      ? seleccion.cosechas.map((c) => c.label).join(' · ')
      : 'Sin cosecha';
  const metricaValor = METRICA_UI.find((m) => m.id === filtros.metrica)?.label ?? 'Producción · kg';
  const lotesValor =
    filtros.lote_ids.length === 0 ? 'Todos los lotes' : `${filtros.lote_ids.length} lote(s)`;
  const anoValor =
    filtros.anos_movimiento.length > 0
      ? filtros.anos_movimiento.join(', ')
      : anosDisponibles.length === 0
        ? 'Sin fecha'
        : 'Todos los años';

  const hayFiltrosActivos =
    filtros.anos_movimiento.length > 0 ||
    filtros.lote_ids.length > 0 ||
    filtros.metrica !== 'kg_totales' ||
    (filtros.vista === 'varias' && filtros.cosecha_keys.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-primary/15 overflow-hidden bg-white">
          {(
            [
              { id: 'una', label: 'Una cosecha' },
              { id: 'varias', label: 'Varias cosechas' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setVista(opt.id)}
              className={`min-h-11 px-3 text-sm font-medium ${
                filtros.vista === opt.id ? 'bg-primary text-white' : 'text-foreground hover:bg-primary/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {hayFiltrosActivos && (
          <Button
            variant="ghost"
            size="sm"
            onClick={limpiarFiltros}
            className="text-brand-brown/70 min-h-11"
          >
            <X className="w-4 h-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <TarjetaFiltro
          etiqueta="Año del movimiento"
          detalle={
            anosDisponibles.length === 0
              ? 'Sale de la fecha del registro. Aquí no hay fecha, así que no hay lista y ninguna cosecha se esconde.'
              : 'Año de la fecha del movimiento, aparte de la cosecha.'
          }
        >
          <p className="text-base font-semibold text-foreground">{anoValor}</p>
          {anosDisponibles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {anosDisponibles.map((ano) => {
                const activo = filtros.anos_movimiento.includes(ano);
                return (
                  <button
                    key={ano}
                    type="button"
                    onClick={() => toggleAno(ano)}
                    className={`min-h-11 px-3 rounded-lg border text-sm ${
                      activo
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-foreground border-primary/15'
                    }`}
                  >
                    {ano}
                  </button>
                );
              })}
            </div>
          )}
        </TarjetaFiltro>

        <TarjetaFiltro
          etiqueta={filtros.vista === 'varias' ? 'Cosechas' : 'Cosecha'}
          detalle={
            filtros.vista === 'varias'
              ? 'Varias a la vez. Vacío incluye todas, también las antiguas.'
              : 'Identidad de campaña, distinta del año del movimiento.'
          }
        >
          <p className="text-base font-semibold text-foreground truncate">{cosechaValor}</p>
          {cosechasDisponibles.length === 0 ? (
            <p className="text-sm text-brand-brown/60 mt-2">Sin cosechas registradas</p>
          ) : (
            <>
              {filtros.vista === 'una' && (
                <label className="block sm:hidden mt-2">
                  <span className="sr-only">Elegir cosecha</span>
                  <select
                    className="w-full min-h-11 rounded-lg border border-primary/20 bg-white px-3 text-base"
                    value={
                      seleccion.estado === 'ok' ? seleccion.cosechas[0]?.key ?? '' : ''
                    }
                    onChange={(e) => toggleCosecha(e.target.value)}
                  >
                    {cosechasDisponibles.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div
                className={
                filtros.vista === 'una'
                  ? 'hidden sm:flex sm:flex-row sm:flex-wrap gap-1.5 mt-2'
                  : 'flex flex-col sm:flex-row sm:flex-wrap gap-1.5 mt-2'
              }
              >
                {cosechasDisponibles.map((c) => {
                  const activa =
                    seleccion.estado === 'ok' &&
                    seleccion.cosechas.some((x) => x.key === c.key) &&
                    (filtros.cosecha_keys.length > 0 || filtros.vista === 'una');
                  const marcada =
                    filtros.cosecha_keys.includes(c.key) ||
                    (filtros.cosecha_keys.length === 0 &&
                      seleccion.estado === 'ok' &&
                      seleccion.cosechas.some((x) => x.key === c.key));
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleCosecha(c.key)}
                      className={`min-h-11 px-3 rounded-lg border text-left text-sm ${
                        marcada || activa
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-foreground border-primary/15'
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </TarjetaFiltro>

        <TarjetaFiltro etiqueta="Métrica" detalle="kg/árbol y t/ha piden un denominador válido.">
          <label className="block">
            <span className="sr-only">Métrica</span>
            <select
              className="w-full min-h-11 rounded-lg border border-primary/20 bg-white px-3 text-base sm:text-sm font-semibold"
              value={filtros.metrica}
              onChange={(e) => emit({ metrica: e.target.value as MetricaProduccion })}
            >
              {METRICA_UI.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <p className="sr-only">{metricaValor}</p>
        </TarjetaFiltro>

        <TarjetaFiltro etiqueta="Lotes" detalle="Vacío incluye todos los lotes con registro.">
          <p className="text-base font-semibold text-foreground">{lotesValor}</p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5 mt-2">
            {lotes.map((lote) => {
              const activo = filtros.lote_ids.includes(lote.id);
              return (
                <button
                  key={lote.id}
                  type="button"
                  onClick={() => toggleLote(lote.id)}
                  className={`min-h-11 px-3 rounded-lg border text-left text-sm ${
                    activo
                      ? 'bg-primary/10 text-foreground border-primary'
                      : 'bg-white text-foreground border-primary/15'
                  }`}
                >
                  {getLoteCode(lote.nombre)} · {lote.nombre}
                </button>
              );
            })}
          </div>
        </TarjetaFiltro>

        <TarjetaFiltro etiqueta="Corte" detalle={corteDetalle}>
          <p className="text-base font-semibold text-foreground">{corteLabel}</p>
        </TarjetaFiltro>
      </div>

      <p className="text-sm sm:text-xs text-brand-brown/70 leading-relaxed">
        El año sale de la fecha del movimiento y la cosecha es otra identidad. Las opciones salen
        de los registros. Una cosecha nueva aparece sola, sin lista fija en el código.
      </p>

      {seleccion.estado === 'incompatible' && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Selección incompatible</p>
            <p className="mt-0.5">{seleccion.mensaje}</p>
            {seleccion.sugeridas.length > 0 && (
              <p className="mt-1">
                En los registros: {seleccion.sugeridas.map((c) => c.label).join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      {seleccion.estado === 'vacio' && (
        <div className="rounded-xl border border-primary/10 bg-white px-4 py-3 text-sm text-brand-brown/80">
          {seleccion.mensaje}
        </div>
      )}
    </div>
  );
}
