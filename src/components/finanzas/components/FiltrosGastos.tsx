import { useState, useEffect } from 'react';
import { getSupabase } from '../../../utils/supabase/client';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { MultiSelect } from './MultiSelect';
import { Calendar, Filter, X } from 'lucide-react';
import type { FiltrosFinanzas, Negocio, Region, CategoriaGasto, ConceptoGasto } from '../../../types/finanzas';

interface FiltrosGastosExtendidos extends FiltrosFinanzas {
  categoria_id?: string;
  concepto_id?: string;
}

interface FiltrosGastosProps {
  filtros: FiltrosGastosExtendidos;
  onFiltrosChange: (filtros: FiltrosGastosExtendidos) => void;
  onAplicarFiltros: () => void;
}

/**
 * Componente de filtros para la vista de gastos
 * Extiende FiltrosGlobales con filtros específicos de categoría y concepto
 */
export function FiltrosGastos({ filtros, onFiltrosChange, onAplicarFiltros }: FiltrosGastosProps) {
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [conceptos, setConceptos] = useState<ConceptoGasto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarCatalogos();
  }, []);

  const cargarCatalogos = async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();

      const [negociosResult, regionesResult, categoriasResult, conceptosResult] = await Promise.all([
        supabase.from('fin_negocios').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_regiones').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_categorias_gastos').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_conceptos_gastos').select('*').eq('activo', true).order('nombre')
      ]);

      if (negociosResult.data) setNegocios(negociosResult.data);
      if (regionesResult.data) setRegiones(regionesResult.data);
      if (categoriasResult.data) setCategorias(categoriasResult.data);
      if (conceptosResult.data) setConceptos(conceptosResult.data);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const handleFiltroChange = (campo: keyof FiltrosGastosExtendidos, valor: string | string[] | undefined) => {
    // No permitir cambios mientras se están cargando los catálogos
    if (loading) {
      return;
    }

    const nuevosFiltros = {
      ...filtros,
      [campo]: valor
    };
    onFiltrosChange(nuevosFiltros);
  };

  const limpiarFiltros = () => {
    onFiltrosChange({
      periodo: 'mes_actual'
    });
  };

  const tieneFiltrosActivos = () => {
    const hasNegocio = Array.isArray(filtros.negocio_id) ? filtros.negocio_id.length > 0 : !!filtros.negocio_id;
    const hasRegion = Array.isArray(filtros.region_id) ? filtros.region_id.length > 0 : !!filtros.region_id;
    return !!(
      hasNegocio ||
      hasRegion ||
      filtros.categoria_id ||
      filtros.concepto_id ||
      filtros.fecha_desde ||
      filtros.fecha_hasta
    );
  };

  // Filtrar conceptos por categoría seleccionada
  const conceptosFiltrados = filtros.categoria_id
    ? conceptos.filter(c => c.categoria_id === filtros.categoria_id)
    : conceptos;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-5 h-5 text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
        {tieneFiltrosActivos() && (
          <Button
            variant="ghost"
            size="sm"
            onClick={limpiarFiltros}
            className="ml-auto text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Período */}
        <div className="space-y-2">
          <Label htmlFor="periodo">Período</Label>
          <Select
            value={filtros.periodo || 'mes_actual'}
            onValueChange={(value) => handleFiltroChange('periodo', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mes_actual">Mes Actual</SelectItem>
              <SelectItem value="trimestre">Trimestre</SelectItem>
              <SelectItem value="ytd">Año hasta la Fecha</SelectItem>
              <SelectItem value="ano_anterior">Año Anterior</SelectItem>
              <SelectItem value="rango_personalizado">Rango Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Negocio */}
        <MultiSelect
          label="Negocio"
          options={negocios}
          selectedIds={Array.isArray(filtros.negocio_id) ? filtros.negocio_id : filtros.negocio_id ? [filtros.negocio_id] : []}
          onChange={(ids) => handleFiltroChange('negocio_id', ids.length === 0 ? undefined : ids)}
          placeholder="Todos los negocios"
          disabled={loading}
        />

        {/* Región */}
        <MultiSelect
          label="Región"
          options={regiones}
          selectedIds={Array.isArray(filtros.region_id) ? filtros.region_id : filtros.region_id ? [filtros.region_id] : []}
          onChange={(ids) => handleFiltroChange('region_id', ids.length === 0 ? undefined : ids)}
          placeholder="Todas las regiones"
          disabled={loading}
        />

        {/* Categoría */}
        <div className="space-y-2">
          <Label htmlFor="categoria">Categoría</Label>
          <Select
            value={
              filtros.categoria_id && categorias.find(c => c.id === filtros.categoria_id)
                ? filtros.categoria_id
                : 'todos'
            }
            onValueChange={(value) => {
              if (loading) return; // Prevenir cambios durante carga
              const newValue = value === 'todos' ? '' : value;
              // Solo actualizar si realmente cambió
              if (newValue !== filtros.categoria_id) {
                handleFiltroChange('categoria_id', newValue);
                // Limpiar concepto si se cambia categoría
                handleFiltroChange('concepto_id', '');
              }
            }}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las categorías</SelectItem>
              {categorias.map((categoria) => (
                <SelectItem key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Segunda fila de filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {/* Concepto */}
        <div className="space-y-2">
          <Label htmlFor="concepto">Concepto</Label>
          <Select
            value={filtros.concepto_id || 'todos'}
            onValueChange={(value) => handleFiltroChange('concepto_id', value === 'todos' ? '' : value)}
            disabled={loading || !filtros.categoria_id}
          >
            <SelectTrigger>
              <SelectValue placeholder={filtros.categoria_id ? "Todos los conceptos" : "Seleccione categoría primero"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los conceptos</SelectItem>
              {conceptosFiltrados.map((concepto) => (
                <SelectItem key={concepto.id} value={concepto.id}>
                  {concepto.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Espaciador */}
        <div className="hidden lg:block"></div>
        <div className="hidden lg:block"></div>

        {/* Botón Aplicar */}
        <div className="flex items-end">
          <Button
            onClick={onAplicarFiltros}
            className="w-full bg-[#73991C] hover:bg-[#5a7716]"
            disabled={loading}
          >
            <Filter className="w-4 h-4 mr-2" />
            Aplicar Filtros
          </Button>
        </div>
      </div>

      {/* Rango personalizado - solo visible cuando se selecciona */}
      {filtros.periodo === 'rango_personalizado' && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fecha_desde">Fecha Desde</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="fecha_desde"
                  type="date"
                  value={filtros.fecha_desde || ''}
                  onChange={(e) => handleFiltroChange('fecha_desde', e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fecha_hasta">Fecha Hasta</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="fecha_hasta"
                  type="date"
                  value={filtros.fecha_hasta || ''}
                  onChange={(e) => handleFiltroChange('fecha_hasta', e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Indicador de filtros activos */}
      {tieneFiltrosActivos() && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-gray-600">Filtros activos:</span>
            {(() => {
              const negocioIds = Array.isArray(filtros.negocio_id) ? filtros.negocio_id : filtros.negocio_id ? [filtros.negocio_id] : [];
              if (negocioIds.length > 0 && negocioIds.length < negocios.length) {
                const nombres = negocioIds.map((id: string) => negocios.find((n: Negocio) => n.id === id)?.nombre).filter(Boolean);
                return (
                  <span key="negocio" className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                    Negocio: {nombres.length === 1 ? nombres[0] : `${nombres.length} seleccionados`}
                  </span>
                );
              }
              return null;
            })()}
            {(() => {
              const regionIds = Array.isArray(filtros.region_id) ? filtros.region_id : filtros.region_id ? [filtros.region_id] : [];
              if (regionIds.length > 0 && regionIds.length < regiones.length) {
                const nombres = regionIds.map((id: string) => regiones.find((r: Region) => r.id === id)?.nombre).filter(Boolean);
                return (
                  <span key="region" className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                    Región: {nombres.length === 1 ? nombres[0] : `${nombres.length} seleccionadas`}
                  </span>
                );
              }
              return null;
            })()}
            {filtros.categoria_id && categorias.find(c => c.id === filtros.categoria_id) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                Categoría: {categorias.find(c => c.id === filtros.categoria_id)?.nombre}
              </span>
            )}
            {filtros.concepto_id && conceptos.find(c => c.id === filtros.concepto_id) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                Concepto: {conceptos.find(c => c.id === filtros.concepto_id)?.nombre}
              </span>
            )}
            {filtros.fecha_desde && filtros.fecha_hasta && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-pink-100 text-pink-800 text-xs rounded-full">
                Período: {filtros.fecha_desde} - {filtros.fecha_hasta}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
