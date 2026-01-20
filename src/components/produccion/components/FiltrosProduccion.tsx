import { useState } from 'react';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Filter, X, Check } from 'lucide-react';
import type {
  FiltrosProduccion as FiltrosType,
  LoteProduccion,
  CosechaTipo,
  MetricaProduccion,
} from '../../../types/produccion';
import {
  ANOS_DISPONIBLES,
  METRICA_LABELS,
  getLoteCode,
  getLoteColor,
} from '../../../types/produccion';

interface FiltrosProduccionProps {
  filtros: FiltrosType;
  lotes: LoteProduccion[];
  onFiltrosChange: (filtros: FiltrosType) => void;
}

export function FiltrosProduccion({
  filtros,
  lotes,
  onFiltrosChange,
}: FiltrosProduccionProps) {
  const [expanded, setExpanded] = useState(false);

  // Toggle ano en el array
  const toggleAno = (ano: number) => {
    const nuevosAnos = filtros.anos.includes(ano)
      ? filtros.anos.filter((a) => a !== ano)
      : [...filtros.anos, ano].sort();
    onFiltrosChange({ ...filtros, anos: nuevosAnos });
  };

  // Toggle lote en el array
  const toggleLote = (loteId: string) => {
    const nuevosLotes = filtros.lote_ids.includes(loteId)
      ? filtros.lote_ids.filter((l) => l !== loteId)
      : [...filtros.lote_ids, loteId];
    onFiltrosChange({ ...filtros, lote_ids: nuevosLotes });
  };

  // Cambiar tipo de cosecha
  const handleCosechaTipoChange = (value: string) => {
    onFiltrosChange({
      ...filtros,
      cosecha_tipo: value as CosechaTipo | 'Ambas',
    });
  };

  // Cambiar metrica
  const handleMetricaChange = (value: string) => {
    onFiltrosChange({
      ...filtros,
      metrica: value as MetricaProduccion,
    });
  };

  // Limpiar filtros
  const limpiarFiltros = () => {
    onFiltrosChange({
      anos: [2023, 2024, 2025, 2026],
      cosecha_tipo: 'Ambas',
      lote_ids: [],
      metrica: 'kg_totales',
    });
  };

  // Verificar si hay filtros activos
  const hayFiltrosActivos =
    filtros.anos.length < ANOS_DISPONIBLES.length ||
    filtros.cosecha_tipo !== 'Ambas' ||
    filtros.lote_ids.length > 0 ||
    filtros.metrica !== 'kg_totales';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header con toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-[#73991C]" />
          <h3 className="font-semibold text-gray-900">Filtros</h3>
          {hayFiltrosActivos && (
            <span className="bg-[#73991C]/10 text-[#73991C] text-xs px-2 py-1 rounded-full">
              Activos
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Menos filtros' : 'Mas filtros'}
          </Button>
        </div>
      </div>

      {/* Filtros principales - siempre visibles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Anos */}
        <div>
          <Label className="text-sm text-gray-600 mb-2 block">Anos</Label>
          <div className="flex flex-wrap gap-2">
            {ANOS_DISPONIBLES.map((ano) => (
              <button
                key={ano}
                onClick={() => toggleAno(ano)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  filtros.anos.includes(ano)
                    ? 'bg-[#73991C] text-white border-[#73991C]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#73991C]/50'
                }`}
              >
                {ano}
              </button>
            ))}
          </div>
        </div>

        {/* Tipo de cosecha */}
        <div>
          <Label className="text-sm text-gray-600 mb-2 block">Cosecha</Label>
          <Select
            value={filtros.cosecha_tipo}
            onValueChange={handleCosechaTipoChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Ambas">Todas</SelectItem>
              <SelectItem value="Principal">Principal</SelectItem>
              <SelectItem value="Traviesa">Traviesa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Metrica */}
        <div>
          <Label className="text-sm text-gray-600 mb-2 block">Metrica</Label>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(Object.keys(METRICA_LABELS) as MetricaProduccion[]).map(
              (metrica) => (
                <button
                  key={metrica}
                  onClick={() => handleMetricaChange(metrica)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    filtros.metrica === metrica
                      ? 'bg-[#73991C] text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {METRICA_LABELS[metrica]}
                </button>
              )
            )}
          </div>
        </div>

        {/* Resumen de lotes */}
        <div>
          <Label className="text-sm text-gray-600 mb-2 block">Lotes</Label>
          <div className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
            {filtros.lote_ids.length === 0
              ? 'Todos los lotes'
              : `${filtros.lote_ids.length} seleccionado(s)`}
          </div>
        </div>
      </div>

      {/* Filtros expandidos - selector de lotes */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <Label className="text-sm text-gray-600 mb-3 block">
            Seleccionar Lotes
          </Label>
          <div className="flex flex-wrap gap-2">
            {lotes.map((lote) => {
              const codigo = getLoteCode(lote.nombre);
              const color = getLoteColor(lote.nombre);
              const isSelected = filtros.lote_ids.includes(lote.id);

              return (
                <button
                  key={lote.id}
                  onClick={() => toggleLote(lote.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                    isSelected
                      ? 'border-transparent shadow-sm'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={{
                    backgroundColor: isSelected ? `${color}20` : undefined,
                    borderColor: isSelected ? color : undefined,
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className={`text-sm font-medium ${isSelected ? '' : 'text-gray-700'}`}
                    style={{ color: isSelected ? color : undefined }}
                  >
                    {codigo}
                  </span>
                  {isSelected && <Check className="w-4 h-4" style={{ color }} />}
                </button>
              );
            })}
          </div>

          {/* Acciones rapidas */}
          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onFiltrosChange({ ...filtros, lote_ids: [] })}
            >
              Todos
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onFiltrosChange({
                  ...filtros,
                  lote_ids: lotes.map((l) => l.id),
                })
              }
            >
              Ninguno
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
