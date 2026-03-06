import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { getSupabase } from '../../../utils/supabase/client';
import { formatNumber } from '../../../utils/format';
import { formatearFechaCorta, calcularRangoFechasPorPeriodo } from '../../../utils/fechas';
import { Input } from '../../ui/input';
import { CompletarGastoDialog } from './CompletarGastoDialog';
import type { Gasto, Negocio, Region, CategoriaGasto, ConceptoGasto, TransaccionGanado, UnifiedFinanceItem } from '../../../types/finanzas';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { TransaccionGanadoForm } from './TransaccionGanadoForm';

interface GastosListProps {
  onEdit?: (gasto: Gasto) => void;
}

interface FiltrosState {
  periodo: string;
  negocio_id: string;
  region_id: string;
  categoria_id: string;
  concepto_id: string;
  estado: string;
  fecha_desde: string;
  fecha_hasta: string;
}

const selectClass = 'px-2 py-1.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0';

export function GastosList({ onEdit }: GastosListProps) {
  const location = useLocation();

  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [ganadoItems, setGanadoItems] = useState<TransaccionGanado[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtros, setFiltros] = useState<FiltrosState>(() => {
    const state = location.state as any;
    return {
      periodo: state?.periodo || 'mes_actual',
      negocio_id: state?.negocio_id || '',
      region_id: state?.region_id || '',
      categoria_id: state?.categoria || '',
      concepto_id: '',
      estado: '',
      fecha_desde: state?.fecha_desde || '',
      fecha_hasta: state?.fecha_hasta || '',
    };
  });
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [completandoGasto, setCompletandoGasto] = useState<Gasto | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetSource, setDeleteTargetSource] = useState<'gasto' | 'ganado'>('gasto');
  const [editingGanado, setEditingGanado] = useState<TransaccionGanado | null>(null);

  // Catalogs
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [conceptos, setConceptos] = useState<ConceptoGasto[]>([]);

  const aplicadoKey = useRef<string | null>(location.key);

  // Load catalogs once
  useEffect(() => {
    const supabase = getSupabase();
    Promise.all([
      supabase.from('fin_negocios').select('*').eq('activo', true).order('nombre'),
      supabase.from('fin_regiones').select('*').eq('activo', true).order('nombre'),
      supabase.from('fin_categorias_gastos').select('*').eq('activo', true).order('nombre'),
      supabase.from('fin_conceptos_gastos').select('*').eq('activo', true).order('nombre'),
    ]).then(([neg, reg, cat, con]) => {
      if (neg.data) setNegocios(neg.data);
      if (reg.data) setRegiones(reg.data);
      if (cat.data) setCategorias(cat.data);
      if (con.data) setConceptos(con.data);
    });
  }, []);

  // Apply filters from navigation
  useEffect(() => {
    const state = location.state as any;
    if (state && aplicadoKey.current !== location.key) {
      aplicadoKey.current = location.key;
      setFiltros((prev) => ({
        ...prev,
        periodo: state.periodo || 'mes_actual',
        negocio_id: state.negocio_id || '',
        region_id: state.region_id || '',
        categoria_id: state.categoria || '',
        fecha_desde: state.fecha_desde || '',
        fecha_hasta: state.fecha_hasta || '',
      }));
    }
  }, [location.state, location.key]);

  // Auto-load on any filter change
  useEffect(() => {
    loadGastos();
  }, [filtros, searchQuery]);

  useEffect(() => {
    const handleClickOutside = () => { if (menuAbiertoId) setMenuAbiertoId(null); };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuAbiertoId]);

  const loadGastos = async () => {
    try {
      setIsLoading(true);

      let fechaDesde = filtros.fecha_desde;
      let fechaHasta = filtros.fecha_hasta;

      if (filtros.periodo && filtros.periodo !== 'rango_personalizado') {
        const rango = calcularRangoFechasPorPeriodo(filtros.periodo);
        fechaDesde = rango.fecha_desde;
        fechaHasta = rango.fecha_hasta;
      }

      let query = getSupabase()
        .from('fin_gastos')
        .select(`*, fin_negocios (nombre), fin_regiones (nombre), fin_categorias_gastos (nombre), fin_conceptos_gastos (nombre), fin_proveedores (nombre), fin_medios_pago (nombre)`);

      if (fechaDesde) query = query.gte('fecha', fechaDesde);
      if (fechaHasta) query = query.lte('fecha', fechaHasta);
      if (filtros.negocio_id) query = query.eq('negocio_id', filtros.negocio_id);
      if (filtros.region_id) query = query.eq('region_id', filtros.region_id);
      if (filtros.estado) query = query.eq('estado', filtros.estado);
      if (filtros.categoria_id) query = query.eq('categoria_id', filtros.categoria_id);
      if (filtros.concepto_id) query = query.eq('concepto_id', filtros.concepto_id);

      query = query.order('fecha', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;

      let result = (data || []) as any[];

      // Fetch ganado compras with same date filters
      let ganadoQuery = getSupabase()
        .from('fin_transacciones_ganado' as any)
        .select('*')
        .eq('tipo', 'compra');
      if (fechaDesde) ganadoQuery = ganadoQuery.gte('fecha', fechaDesde);
      if (fechaHasta) ganadoQuery = ganadoQuery.lte('fecha', fechaHasta);
      ganadoQuery = ganadoQuery.order('fecha', { ascending: false });
      const { data: ganadoData } = await ganadoQuery;

      let ganadoResult = (ganadoData || []) as TransaccionGanado[];

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        result = result.filter((g: any) =>
          g.nombre?.toLowerCase().includes(q) ||
          g.fin_categorias_gastos?.nombre?.toLowerCase().includes(q) ||
          g.fin_conceptos_gastos?.nombre?.toLowerCase().includes(q) ||
          g.fin_proveedores?.nombre?.toLowerCase().includes(q)
        );
        ganadoResult = ganadoResult.filter((g) =>
          g.finca?.toLowerCase().includes(q) ||
          g.cliente_proveedor?.toLowerCase().includes(q) ||
          'ganado'.includes(q)
        );
      }

      setGastos(result as Gasto[]);
      setGanadoItems(ganadoResult);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  };

  const handleEliminar = (id: string, source: 'gasto' | 'ganado' = 'gasto') => {
    setDeleteTargetId(id);
    setDeleteTargetSource(source);
    setConfirmDeleteOpen(true);
  };

  const confirmEliminar = async () => {
    if (!deleteTargetId) return;
    try {
      setEliminando(deleteTargetId);
      const table = deleteTargetSource === 'ganado' ? 'fin_transacciones_ganado' as any : 'fin_gastos';
      const { error } = await getSupabase().from(table).delete().eq('id', deleteTargetId);
      if (error) throw error;
      if (deleteTargetSource === 'ganado') {
        setGanadoItems(ganadoItems.filter((g) => g.id !== deleteTargetId));
      } else {
        setGastos(gastos.filter((g) => g.id !== deleteTargetId));
      }
      toast.success(deleteTargetSource === 'ganado' ? 'Transaccion ganado eliminada' : 'Gasto eliminado');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast.error('Error: ' + message);
    } finally {
      setEliminando(null);
      setDeleteTargetId(null);
    }
  };

  const updateFiltro = (field: keyof FiltrosState, value: string) => {
    setFiltros((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'categoria_id') next.concepto_id = '';
      return next;
    });
  };

  const conceptosFiltrados = filtros.categoria_id
    ? conceptos.filter((c) => c.categoria_id === filtros.categoria_id)
    : [];

  const tieneFiltrosActivos = filtros.negocio_id || filtros.region_id || filtros.categoria_id || filtros.concepto_id || filtros.estado;
  const valorTotalGastos = gastos.reduce((sum, g) => sum + (g.valor || 0), 0);
  const valorTotalGanado = ganadoItems.reduce((sum, g) => sum + (g.valor_total || 0), 0);
  const valorTotal = valorTotalGastos + valorTotalGanado;

  // Build unified list sorted by date
  const unifiedItems: UnifiedFinanceItem[] = [
    ...gastos.map((g) => ({
      source: 'gasto' as const,
      id: g.id,
      fecha: g.fecha,
      nombre: g.nombre,
      valor: g.valor,
      details: [(g as any).fin_negocios?.nombre, (g as any).fin_categorias_gastos?.nombre, (g as any).fin_conceptos_gastos?.nombre].filter(Boolean).join(' · '),
      estado: g.estado,
      raw: g,
    })),
    ...ganadoItems.map((g) => ({
      source: 'ganado' as const,
      id: g.id,
      fecha: g.fecha,
      nombre: `Compra Ganado${g.finca ? ` - ${g.finca}` : ''}`,
      valor: g.valor_total,
      details: [g.cantidad_cabezas ? `${g.cantidad_cabezas} cabezas` : null, g.kilos_pagados ? `${g.kilos_pagados} kg` : null, g.cliente_proveedor].filter(Boolean).join(' · '),
      raw: g,
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const totalCount = unifiedItems.length;

  return (
    <div className="space-y-3">
      {/* Compact filter bar: search + all filters in one row */}
      <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          {/* Periodo */}
          <select value={filtros.periodo} onChange={(e) => updateFiltro('periodo', e.target.value)} className={selectClass}>
            <option value="mes_actual">Mes Actual</option>
            <option value="trimestre">Trimestre</option>
            <option value="ytd">YTD</option>
            <option value="ano_anterior">Ano Anterior</option>
            <option value="rango_personalizado">Personalizado</option>
          </select>

          {/* Negocio */}
          <select value={filtros.negocio_id} onChange={(e) => updateFiltro('negocio_id', e.target.value)} className={selectClass}>
            <option value="">Negocio</option>
            {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
          </select>

          {/* Region */}
          <select value={filtros.region_id} onChange={(e) => updateFiltro('region_id', e.target.value)} className={selectClass}>
            <option value="">Region</option>
            {regiones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>

          {/* Categoria */}
          <select value={filtros.categoria_id} onChange={(e) => updateFiltro('categoria_id', e.target.value)} className={selectClass}>
            <option value="">Categoria</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>

          {/* Concepto */}
          {filtros.categoria_id && (
            <select value={filtros.concepto_id} onChange={(e) => updateFiltro('concepto_id', e.target.value)} className={selectClass}>
              <option value="">Concepto</option>
              {conceptosFiltrados.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}

          {/* Estado */}
          <select value={filtros.estado} onChange={(e) => updateFiltro('estado', e.target.value)} className={selectClass}>
            <option value="">Estado</option>
            <option value="Confirmado">Confirmado</option>
            <option value="Pendiente">Pendiente</option>
          </select>

          {/* Clear filters */}
          {tieneFiltrosActivos && (
            <button
              onClick={() => setFiltros({ periodo: 'mes_actual', negocio_id: '', region_id: '', categoria_id: '', concepto_id: '', estado: '', fecha_desde: '', fecha_hasta: '' })}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Limpiar filtros"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Custom date range — only when selected */}
        {filtros.periodo === 'rango_personalizado' && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">Desde</span>
            <input type="date" value={filtros.fecha_desde} onChange={(e) => updateFiltro('fecha_desde', e.target.value)} className={`${selectClass} flex-1`} />
            <span className="text-xs text-gray-500">Hasta</span>
            <input type="date" value={filtros.fecha_hasta} onChange={(e) => updateFiltro('fecha_hasta', e.target.value)} className={`${selectClass} flex-1`} />
          </div>
        )}
      </div>

      {/* Inline stats summary */}
      <div className="flex items-center gap-4 px-1 text-sm text-gray-500">
        <span><strong className="text-gray-900">{totalCount}</strong> gastos</span>
        <span className="text-gray-300">|</span>
        <span>Total: <strong className="text-gray-900">${formatNumber(valorTotal)}</strong></span>
        {gastos.some((g) => g.estado === 'Pendiente') && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-yellow-600">{gastos.filter((g) => g.estado === 'Pendiente').length} pendientes</span>
          </>
        )}
        {ganadoItems.length > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-amber-700">{ganadoItems.length} ganado</span>
          </>
        )}
      </div>

      {/* Compact expense list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">
              {searchQuery ? 'No se encontraron gastos' : 'No hay gastos en este periodo'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {unifiedItems.map((item) => (
              <div key={`${item.source}-${item.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50/50 transition-colors group">
                {/* Estado icon or Ganado badge */}
                {item.source === 'ganado' ? (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-amber-100 text-amber-800 flex-shrink-0">
                    Ganado
                  </span>
                ) : item.source === 'gasto' ? (
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    item.estado === 'Confirmado' ? 'bg-green-50' : 'bg-yellow-50'
                  }`}>
                    {item.estado === 'Confirmado'
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      : <Clock className="w-3.5 h-3.5 text-yellow-600" />
                    }
                  </div>
                ) : null}

                {/* Date */}
                <span className="text-xs text-gray-400 w-[70px] flex-shrink-0">
                  {formatearFechaCorta(item.fecha)}
                </span>

                {/* Name + details in one line */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {item.nombre}
                  </span>
                  {item.details && (
                    <span className="hidden sm:inline text-xs text-gray-400 truncate">
                      {item.details}
                    </span>
                  )}
                </div>

                {/* Value */}
                <span className="text-sm font-semibold text-gray-900 flex-shrink-0 tabular-nums">
                  ${formatNumber(item.valor)}
                </span>

                {/* Actions menu */}
                <div className="relative flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuAbiertoId(menuAbiertoId === `${item.source}-${item.id}` ? null : `${item.source}-${item.id}`);
                    }}
                    disabled={eliminando === item.id}
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all text-gray-400"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {menuAbiertoId === `${item.source}-${item.id}` && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-50">
                      {item.source === 'ganado' ? (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingGanado(item.raw as TransaccionGanado); setMenuAbiertoId(null); }}
                            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Editar
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEliminar(item.id, 'ganado'); setMenuAbiertoId(null); }}
                            disabled={eliminando === item.id}
                            className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Eliminar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); onEdit?.(item.raw as Gasto); setMenuAbiertoId(null); }}
                            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Editar
                          </button>
                          {(item.raw as Gasto).estado === 'Pendiente' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setCompletandoGasto(item.raw as Gasto); setMenuAbiertoId(null); }}
                              className="w-full px-3 py-1.5 text-left text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" /> Completar
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEliminar(item.id, 'gasto'); setMenuAbiertoId(null); }}
                            disabled={eliminando === item.id}
                            className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {completandoGasto && (
        <CompletarGastoDialog
          open={!!completandoGasto}
          onOpenChange={(open) => { if (!open) setCompletandoGasto(null); }}
          gasto={completandoGasto}
          onSuccess={() => { setCompletandoGasto(null); loadGastos(); }}
          onError={(message) => toast.error(message)}
        />
      )}

      {editingGanado && (
        <TransaccionGanadoForm
          open={!!editingGanado}
          onOpenChange={(open) => { if (!open) setEditingGanado(null); }}
          transaccion={editingGanado}
          defaultTipo="compra"
          onSuccess={() => { setEditingGanado(null); loadGastos(); }}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={deleteTargetSource === 'ganado' ? 'Eliminar transaccion ganado?' : 'Eliminar gasto?'}
        description="Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={confirmEliminar}
        destructive
      />
    </div>
  );
}
