import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { Filter, X, Check, AlertTriangle } from 'lucide-react';
import type {
  FiltrosProduccion as FiltrosType,
  LoteProduccion,
  MetricaProduccion,
  CosechaIdentidad,
  VistaProduccion,
  CosechaTipo,
} from '../../../types/produccion';
import {
  METRICA_LABELS,
  getLoteCode,
  getLoteColor,
} from '../../../types/produccion';
import {
  anosCampanaDeCosechas,
  cosechasCompatiblesConAnos,
  resolverSeleccionCosechas,
} from '@/utils/calculosProduccionAnalisis';

interface FiltrosProduccionProps {
  filtros: FiltrosType;
  lotes: LoteProduccion[];
  anosDisponibles: number[];
  cosechasDisponibles: CosechaIdentidad[];
  onFiltrosChange: (filtros: FiltrosType) => void;
}

function proyectarFiltros(
  base: FiltrosType,
  disponibles: CosechaIdentidad[],
): FiltrosType {
  const seleccion = resolverSeleccionCosechas(disponibles, base);
  const cosechas =
    seleccion.estado === 'ok'
      ? seleccion.cosechas
      : seleccion.estado === 'incompatible'
        ? []
        : [];
  const anos = anosCampanaDeCosechas(cosechas);
  const tipos = Array.from(new Set(cosechas.map((c) => c.tipo)));
  const cosecha_tipo: CosechaTipo | 'Ambas' =
    tipos.length === 1 ? tipos[0] : 'Ambas';
  return { ...base, anos, cosecha_tipo };
}

export function FiltrosProduccion({
  filtros,
  lotes,
  anosDisponibles,
  cosechasDisponibles,
  onFiltrosChange,
}: FiltrosProduccionProps) {
  const visibles = cosechasCompatiblesConAnos(
    cosechasDisponibles,
    filtros.anos_movimiento,
  );
  const seleccion = resolverSeleccionCosechas(cosechasDisponibles, filtros);

  const emit = (parcial: Partial<FiltrosType>) => {
    const next = proyectarFiltros({ ...filtros, ...parcial }, cosechasDisponibles);
    onFiltrosChange(next);
  };

  const toggleAno = (ano: number) => {
    const anos_movimiento = filtros.anos_movimiento.includes(ano)
      ? filtros.anos_movimiento.filter((a) => a !== ano)
      : [...filtros.anos_movimiento, ano].sort((a, b) => a - b);

    // El año solo acota la lista; si una cosecha queda fuera, se limpia la key
    // (no se reagrupa el análisis por calendario).
    const nuevasVisibles = cosechasCompatiblesConAnos(
      cosechasDisponibles,
      anos_movimiento,
    );
    const keysOk = filtros.cosecha_keys.filter((k) =>
      nuevasVisibles.some((c) => c.key === k),
    );
    emit({
      anos_movimiento,
      cosecha_keys: keysOk.length === filtros.cosecha_keys.length ? keysOk : [],
    });
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
    const ordenadas = visibles.length > 0 ? visibles : cosechasDisponibles;
    const ultima = ordenadas[ordenadas.length - 1];
    onFiltrosChange(
      proyectarFiltros(
        {
          vista: filtros.vista,
          anos_movimiento: [],
          cosecha_keys:
            filtros.vista === 'una' && ultima ? [ultima.key] : [],
          lote_ids: [],
          metrica: 'kg_totales',
          anos: [],
          cosecha_tipo: 'Ambas',
        },
        cosechasDisponibles,
      ),
    );
  };

  const hayFiltrosActivos =
    filtros.anos_movimiento.length > 0 ||
    filtros.lote_ids.length > 0 ||
    filtros.metrica !== 'kg_totales' ||
    (filtros.vista === 'varias' && filtros.cosecha_keys.length > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-gray-900">Filtros</h3>
          {hayFiltrosActivos && (
            <span className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-md">
              Activos
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(
              [
                { id: 'una', label: 'Una cosecha' },
                { id: 'varias', label: 'Comparar' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setVista(opt.id)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  filtros.vista === opt.id
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
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
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Cosecha primero: unidad de agrupación del tablero */}
        <div className="md:col-span-2">
          <Label className="text-xs uppercase tracking-wide text-gray-500 mb-2 block">
            Cosecha{filtros.vista === 'varias' ? 's' : ''} · unidad de análisis
          </Label>
          <div className="flex flex-wrap gap-2">
            {visibles.length === 0 ? (
              <span className="text-sm text-gray-400">Sin cosechas visibles</span>
            ) : (
              visibles.map((c) => {
                const explicit = filtros.cosecha_keys.includes(c.key);
                const efectiva =
                  seleccion.estado === 'ok' &&
                  seleccion.cosechas.some((x) => x.key === c.key);
                const activa =
                  explicit ||
                  (filtros.cosecha_keys.length === 0 && efectiva);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleCosecha(c.key)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      activa
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-primary/50'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            KPIs, lotes y series se agrupan por cosecha (p. ej. Principal 2027),
            no por año calendario.
            {filtros.vista === 'varias'
              ? ' Multiselección; vacío = todas las visibles.'
              : ''}
          </p>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wide text-gray-500 mb-2 block">
            Año del movimiento · opcional
          </Label>
          <div className="flex flex-wrap gap-2">
            {anosDisponibles.length === 0 ? (
              <span className="text-sm text-gray-400">Sin registros aún</span>
            ) : (
              anosDisponibles.map((ano) => (
                <button
                  key={ano}
                  type="button"
                  onClick={() => toggleAno(ano)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    filtros.anos_movimiento.includes(ano)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary/50'
                  }`}
                >
                  {ano}
                </button>
              ))
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Solo acota qué cosechas se listan. No cambia el eje del análisis.
            Principal 2027 puede aparecer al filtrar 2026.
          </p>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wide text-gray-500 mb-2 block">
            Métrica
          </Label>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(Object.keys(METRICA_LABELS) as MetricaProduccion[]).map((metrica) => (
              <button
                key={metrica}
                type="button"
                onClick={() => emit({ metrica })}
                className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                  filtros.metrica === metrica
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {METRICA_LABELS[metrica]}
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-2 xl:col-span-4">
          <Label className="text-xs uppercase tracking-wide text-gray-500 mb-2 block">
            Lotes
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
              {filtros.lote_ids.length === 0
                ? 'Todos los lotes'
                : `${filtros.lote_ids.length} seleccionado(s)`}
            </div>
            {lotes.map((lote) => {
              const codigo = getLoteCode(lote.nombre);
              const color = getLoteColor(lote.nombre);
              const isSelected = filtros.lote_ids.includes(lote.id);
              return (
                <button
                  key={lote.id}
                  type="button"
                  onClick={() => toggleLote(lote.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm transition-all ${
                    isSelected ? 'border-transparent' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={{
                    backgroundColor: isSelected ? `${color}20` : undefined,
                    borderColor: isSelected ? color : undefined,
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span style={{ color: isSelected ? color : undefined }}>{codigo}</span>
                  {isSelected && <Check className="w-3.5 h-3.5" style={{ color }} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {seleccion.estado === 'incompatible' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Selección incompatible</p>
            <p className="mt-0.5">{seleccion.mensaje}</p>
            {seleccion.sugeridas.length > 0 && (
              <p className="mt-1 text-amber-800/80">
                Cosechas visibles: {seleccion.sugeridas.map((c) => c.label).join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      {seleccion.estado === 'vacio' && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {seleccion.mensaje}
        </div>
      )}
    </div>
  );
}
