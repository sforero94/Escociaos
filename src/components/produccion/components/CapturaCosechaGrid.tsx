import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Label } from '../../ui/label';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useFormPersistence } from '@/hooks/useFormPersistence';
import { FormDraftBanner } from '@/components/shared/FormDraftBanner';
import { formatNumber } from '@/utils/format';
import type { CosechaTipo } from '../../../types/produccion';
import {
  useCapturaCosecha,
  type GridRow,
  type HistoricoStats,
  effectiveKgTotales,
  kgPorArbol,
  rowHasData,
} from '../hooks/useCapturaCosecha';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

const CURRENT_YEAR = new Date().getFullYear();
const ANOS_GRID: number[] = [];
for (let y = 2023; y <= CURRENT_YEAR + 1; y++) ANOS_GRID.push(y);

interface GridFormState {
  ano: number;
  cosecha_tipo: CosechaTipo;
  rows: GridRow[];
}

const INITIAL_FORM: GridFormState = {
  ano: CURRENT_YEAR,
  cosecha_tipo: 'Principal',
  rows: [],
};

interface OutlierFlag {
  rowIndex: number;
  lote_nombre: string;
  sublote_nombre: string | null;
  kg_totales: number;
  kgPorArbol: number;
  historico: HistoricoStats;
  descripcion: string;
}

// ============================================================================
// PROPS
// ============================================================================

export interface CapturaCosechaGridProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// ============================================================================
// CONFIRMATION DIALOG (outlier warnings)
// ============================================================================

interface OutlierConfirmDialogProps {
  outliers: OutlierFlag[];
  onConfirm: () => void;
  onCancel: () => void;
}

function OutlierConfirmDialog({ outliers, onConfirm, onCancel }: OutlierConfirmDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-5 h-5" />
            Valores atípicos detectados
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-gray-600 mb-4">
            Los siguientes registros tienen rendimientos inusuales vs el histórico del lote.
            Verifica que los datos sean correctos antes de guardar.
          </p>
          <ul className="space-y-2">
            {outliers.map((flag, i) => (
              <li key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
                <span className="font-semibold text-amber-900">
                  {flag.lote_nombre}{flag.sublote_nombre ? ` – ${flag.sublote_nombre}` : ''}:
                </span>{' '}
                <span className="text-amber-800">
                  {formatNumber(flag.kg_totales)} kg → {flag.kgPorArbol.toFixed(2)} kg/árbol
                </span>
                <br />
                <span className="text-amber-700 text-xs">{flag.descripcion}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-gray-500 mt-4">
            ¿Deseas guardar de todas formas?
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Revisar
          </Button>
          <Button
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Guardar de todas formas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CapturaCosechaGrid({ open, onOpenChange, onSuccess }: CapturaCosechaGridProps): React.ReactElement {
  const hook = useCapturaCosecha();

  // ---- Form persistence ----
  // Storage key includes año+tipo so each cosecha has its own draft.
  // We track the selector state separately because changing it triggers a reload.
  const [selectorAno, setSelectorAno] = useState<number>(CURRENT_YEAR);
  const [selectorTipo, setSelectorTipo] = useState<CosechaTipo>('Principal');
  const persistenceKey = `captura-cosecha-grid-${selectorAno}-${selectorTipo}-v1`;

  const [formState, setFormState, clearFormData, wasRestored] =
    useFormPersistence<GridFormState>({
      key: persistenceKey,
      initialState: INITIAL_FORM,
    });

  // Sync selector state from restored form on open
  useEffect(() => {
    if (open && wasRestored && formState.rows.length > 0) {
      setSelectorAno(formState.ano);
      setSelectorTipo(formState.cosecha_tipo);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Local state ----
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [historicoMap, setHistoricoMap] = useState<Map<string, HistoricoStats>>(new Map());
  const [outlierFlags, setOutlierFlags] = useState<OutlierFlag[]>([]);
  const [showOutlierConfirm, setShowOutlierConfirm] = useState(false);

  // ---- Load grid data ----
  const loadGrid = useCallback(async (ano: number, tipo: CosechaTipo) => {
    setLoadingGrid(true);
    try {
      const { lotes, sublotesByLote } = await hook.loadLotesConSublotes();
      const existingMap = await hook.loadExistingCosecha(ano, tipo);
      const rows = hook.buildGridRows(lotes, sublotesByLote, existingMap);

      // Load historic stats for outlier detection (exclude current cosecha)
      const loteIds = Array.from(new Set(rows.map((r) => r.lote_id)));
      const stats = await hook.loadHistoricoStats(ano, tipo, loteIds);
      setHistoricoMap(stats);

      setFormState({
        ano,
        cosecha_tipo: tipo,
        rows,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error cargando datos: ${msg}`);
    } finally {
      setLoadingGrid(false);
    }
  }, [hook, setFormState]);

  // Load when dialog opens (if no restored draft)
  useEffect(() => {
    if (!open) return;
    if (wasRestored && formState.rows.length > 0) {
      // Re-load historic stats for the restored cosecha
      const loteIds = Array.from(new Set(formState.rows.map((r) => r.lote_id)));
      hook.loadHistoricoStats(formState.ano, formState.cosecha_tipo, loteIds)
        .then(setHistoricoMap)
        .catch(console.error);
      return;
    }
    loadGrid(selectorAno, selectorTipo);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Cosecha selector change ----
  const handleCosechaChange = (ano: number, tipo: CosechaTipo) => {
    setSelectorAno(ano);
    setSelectorTipo(tipo);
    clearFormData();
    loadGrid(ano, tipo);
  };

  // ---- Row update helpers ----
  const updateRow = (idx: number, patch: Partial<GridRow>) => {
    setFormState((prev) => {
      const rows = prev.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      return { ...prev, rows };
    });
  };

  // ---- Save flow ----
  const handleSave = async () => {
    const filledRows = formState.rows.filter((r) => rowHasData(r));
    if (filledRows.length === 0) {
      toast.error('No hay filas con datos para guardar');
      return;
    }

    // Validate kg breakdown consistency per row
    for (let i = 0; i < formState.rows.length; i++) {
      const row = formState.rows[i];
      if (!rowHasData(row)) continue;

      const hasExp = row.kg_exportacion !== '';
      const hasNac = row.kg_nacional !== '';
      const kgTot = effectiveKgTotales(row);

      if ((hasExp && !hasNac) || (!hasExp && hasNac)) {
        const label = row.sublote_nombre
          ? `${row.lote_nombre} – ${row.sublote_nombre}`
          : row.lote_nombre;
        toast.error(`${label}: si ingresas exportación o nacional, debes ingresar ambos`);
        return;
      }

      // Validate sum equals totales (only when computed)
      if (hasExp && hasNac && kgTot !== '') {
        const sumBreakdown = Number(row.kg_exportacion) + Number(row.kg_nacional);
        const directTotales = row.kg_totales !== '' ? Number(row.kg_totales) : null;
        if (directTotales !== null && Math.abs(sumBreakdown - directTotales) > 0.5) {
          const label = row.sublote_nombre
            ? `${row.lote_nombre} – ${row.sublote_nombre}`
            : row.lote_nombre;
          toast.error(`${label}: exportación + nacional (${formatNumber(sumBreakdown)}) no coincide con kg totales (${formatNumber(directTotales)})`);
          return;
        }
      }
    }

    // Check outliers before saving
    const flags = hook.detectOutliers(formState.rows, historicoMap);
    if (flags.length > 0) {
      setOutlierFlags(flags);
      setShowOutlierConfirm(true);
      return;
    }

    await doSave();
  };

  const doSave = async () => {
    setShowOutlierConfirm(false);
    setSubmitting(true);
    try {
      const result = await hook.saveRows(formState.rows, formState.ano, formState.cosecha_tipo);
      const parts: string[] = [];
      if (result.inserted > 0) parts.push(`${result.inserted} registro${result.inserted > 1 ? 's' : ''} creado${result.inserted > 1 ? 's' : ''}`);
      if (result.updated > 0) parts.push(`${result.updated} actualizado${result.updated > 1 ? 's' : ''}`);
      toast.success(`Cosecha guardada: ${parts.join(', ')}`);
      clearFormData();
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('unique') || msg.includes('duplicate')) {
        toast.error('Ya existe un registro para esa combinación de lote/sublote/año/cosecha');
      } else if (msg.includes('check') || msg.includes('CHECK')) {
        toast.error('Error: la suma de exportación + nacional debe ser igual a kg totales');
      } else {
        toast.error(`Error al guardar: ${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    clearFormData();
    setOutlierFlags([]);
    setShowOutlierConfirm(false);
    onOpenChange(false);
  };

  // ---- Computed column helpers ----
  const getKgTotalesDisplay = (row: GridRow): string => {
    const val = effectiveKgTotales(row);
    if (val === '') return '';
    return String(Number(val));
  };

  const isKgTotalesLocked = (row: GridRow): boolean =>
    row.kg_exportacion !== '' && row.kg_nacional !== '';

  const getKgPorArbol = (row: GridRow): string => {
    const val = kgPorArbol(row);
    if (val === null) return '—';
    return val.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // ---- Render ----
  const isLoading = loadingGrid || hook.loading;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Captura masiva de cosecha</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <FormDraftBanner
              variant="restored"
              show={wasRestored && formState.rows.length > 0}
              onDiscard={() => {
                clearFormData();
                loadGrid(selectorAno, selectorTipo);
              }}
            />

            {/* Cosecha selector */}
            <div className="flex flex-wrap items-end gap-4 mb-6">
              <div className="space-y-1.5">
                <Label htmlFor="grid-ano">Año</Label>
                <Select
                  value={String(selectorAno)}
                  onValueChange={(v) =>
                    handleCosechaChange(parseInt(v), selectorTipo)
                  }
                >
                  <SelectTrigger id="grid-ano" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANOS_GRID.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="grid-tipo">Tipo de cosecha</Label>
                <Select
                  value={selectorTipo}
                  onValueChange={(v) =>
                    handleCosechaChange(selectorAno, v as CosechaTipo)
                  }
                >
                  <SelectTrigger id="grid-tipo" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Principal">Principal</SelectItem>
                    <SelectItem value="Traviesa">Traviesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={isLoading}
                onClick={() => loadGrid(selectorAno, selectorTipo)}
                className="mb-0.5"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Recargar
              </Button>

              {/* Summary of existing records */}
              {!isLoading && formState.rows.length > 0 && (
                <div className="ml-auto flex items-center gap-1.5 text-sm text-gray-500">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {formState.rows.filter((r) => r.id).length} registros existentes ·{' '}
                  {formState.rows.filter((r) => rowHasData(r)).length} con datos
                </div>
              )}
            </div>

            {/* Grid table */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400 mr-2" />
                <span className="text-gray-500">Cargando datos...</span>
              </div>
            ) : formState.rows.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                No se encontraron lotes activos
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left py-3 px-3 font-medium text-gray-600 w-[160px]">Lote</th>
                      <th className="text-left py-3 px-3 font-medium text-gray-600 w-[130px]">Sublote</th>
                      <th className="text-right py-3 px-3 font-medium text-gray-600 w-[90px]">Árboles</th>
                      <th className="text-right py-3 px-3 font-medium text-gray-600 w-[110px]">Kg Export.</th>
                      <th className="text-right py-3 px-3 font-medium text-gray-600 w-[110px]">Kg Nacional</th>
                      <th className="text-right py-3 px-3 font-medium text-gray-600 w-[110px]">Kg Totales</th>
                      <th className="text-right py-3 px-3 font-medium text-gray-600 w-[90px]">kg/árbol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formState.rows.map((row, idx) => {
                      const isExisting = Boolean(row.id);
                      const totalesLocked = isKgTotalesLocked(row);

                      // Group header row (first row of a new lote group)
                      const prevRow = idx > 0 ? formState.rows[idx - 1] : null;
                      const isFirstOfLote = !prevRow || prevRow.lote_id !== row.lote_id;

                      return (
                        <tr
                          key={`${row.lote_id}-${row.sublote_id ?? 'lote'}`}
                          className={`border-b border-gray-100 transition-colors ${
                            isExisting ? 'bg-blue-50/30' : 'hover:bg-gray-50'
                          } ${isFirstOfLote && idx > 0 ? 'border-t-2 border-t-gray-200' : ''}`}
                        >
                          {/* Lote name — only show on first row of group */}
                          <td className="py-2 px-3 font-medium text-gray-800">
                            {isFirstOfLote || !prevRow || prevRow.lote_id !== row.lote_id
                              ? (
                                <span className="flex items-center gap-1.5">
                                  {row.lote_nombre}
                                  {isExisting && (
                                    <span className="text-[10px] font-normal text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                                      existente
                                    </span>
                                  )}
                                </span>
                              )
                              : (
                                isExisting && (
                                  <span className="text-[10px] font-normal text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                                    existente
                                  </span>
                                )
                              )
                            }
                          </td>

                          {/* Sublote */}
                          <td className="py-2 px-3 text-gray-600">
                            {row.sublote_nombre ?? <span className="text-gray-400 italic">Nivel lote</span>}
                          </td>

                          {/* Árboles */}
                          <td className="py-2 px-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.arboles === '' ? '' : String(row.arboles)}
                              onChange={(e) =>
                                updateRow(idx, {
                                  arboles: e.target.value === '' ? '' : parseInt(e.target.value) || 0,
                                })
                              }
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="0"
                              className="w-full text-right bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            />
                          </td>

                          {/* Kg Exportación */}
                          <td className="py-2 px-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.kg_exportacion === '' ? '' : String(row.kg_exportacion)}
                              onChange={(e) =>
                                updateRow(idx, {
                                  kg_exportacion: e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                                })
                              }
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="—"
                              className="w-full text-right bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            />
                          </td>

                          {/* Kg Nacional */}
                          <td className="py-2 px-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.kg_nacional === '' ? '' : String(row.kg_nacional)}
                              onChange={(e) =>
                                updateRow(idx, {
                                  kg_nacional: e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                                })
                              }
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="—"
                              className="w-full text-right bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            />
                          </td>

                          {/* Kg Totales */}
                          <td className="py-2 px-1">
                            {totalesLocked ? (
                              <div className="w-full text-right bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 font-medium">
                                {formatNumber(Number(effectiveKgTotales(row)))}
                              </div>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={row.kg_totales === '' ? '' : String(row.kg_totales)}
                                onChange={(e) =>
                                  updateRow(idx, {
                                    kg_totales: e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                                  })
                                }
                                onWheel={(e) => e.currentTarget.blur()}
                                placeholder="0"
                                className="w-full text-right bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                              />
                            )}
                          </td>

                          {/* kg/árbol (read-only) */}
                          <td className={`py-2 px-3 text-right font-medium ${
                            (() => {
                              const kpa = kgPorArbol(row);
                              if (kpa === null) return 'text-gray-400';
                              const stats = historicoMap.get(row.lote_id);
                              if (!stats || stats.escasos) return 'text-gray-700';
                              if (kpa > stats.max_kg_arbol * 2 || (stats.min_kg_arbol > 1 && kpa < stats.min_kg_arbol * 0.4)) {
                                return 'text-amber-600';
                              }
                              return 'text-gray-700';
                            })()
                          }`}>
                            {getKgTotalesDisplay(row) !== '' && row.arboles !== '' && Number(row.arboles) > 0
                              ? getKgPorArbol(row)
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Totals footer */}
                  {formState.rows.some((r) => rowHasData(r)) && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                        <td colSpan={2} className="py-2 px-3 text-gray-700">Total</td>
                        <td className="py-2 px-3 text-right text-gray-700">
                          {formatNumber(
                            formState.rows
                              .filter((r) => rowHasData(r))
                              .reduce((s, r) => s + (r.arboles !== '' ? Number(r.arboles) : 0), 0)
                          )}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700">
                          {(() => {
                            const filled = formState.rows.filter((r) => r.kg_exportacion !== '');
                            if (filled.length === 0) return '—';
                            return formatNumber(filled.reduce((s, r) => s + Number(r.kg_exportacion), 0));
                          })()}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700">
                          {(() => {
                            const filled = formState.rows.filter((r) => r.kg_nacional !== '');
                            if (filled.length === 0) return '—';
                            return formatNumber(filled.reduce((s, r) => s + Number(r.kg_nacional), 0));
                          })()}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700">
                          {formatNumber(
                            formState.rows
                              .filter((r) => rowHasData(r))
                              .reduce((s, r) => {
                                const kg = effectiveKgTotales(r);
                                return s + (kg !== '' ? Number(kg) : 0);
                              }, 0)
                          )}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-500">
                          {(() => {
                            const validRows = formState.rows.filter((r) => rowHasData(r) && kgPorArbol(r) !== null);
                            if (validRows.length === 0) return '—';
                            const totalKg = validRows.reduce((s, r) => {
                              const kg = effectiveKgTotales(r);
                              return s + (kg !== '' ? Number(kg) : 0);
                            }, 0);
                            const totalArb = validRows.reduce((s, r) => s + (r.arboles !== '' ? Number(r.arboles) : 0), 0);
                            if (totalArb === 0) return '—';
                            return (totalKg / totalArb).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                          })()}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Info note about breakdown */}
            {!isLoading && formState.rows.length > 0 && (
              <p className="text-xs text-gray-400 mt-3">
                Kg Exportación y Kg Nacional son opcionales. Si los ingresas, Kg Totales se calcula automáticamente.
                El campo Kg Totales es directamente editable cuando no hay desglose.
              </p>
            )}
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={submitting || isLoading || formState.rows.length === 0}
              className="bg-primary hover:bg-primary/90"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {submitting ? 'Guardando...' : 'Guardar cosecha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Outlier confirmation sub-dialog */}
      {showOutlierConfirm && (
        <OutlierConfirmDialog
          outliers={outlierFlags}
          onConfirm={doSave}
          onCancel={() => setShowOutlierConfirm(false)}
        />
      )}
    </>
  );
}
