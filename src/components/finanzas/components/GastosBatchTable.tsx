import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Save, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSupabase } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { GastosBatchRow } from './GastosBatchRow';
import { ProveedorDialog } from '@/components/shared/ProveedorDialog';
import type { BatchRowData } from '@/types/finanzas';
import type { GastosCatalogs } from '../hooks/useGastosCatalogs';
import {
  obtenerFechaHoy,
  esFechaFuturaSospechosa,
  mensajeConfirmacionFechaFutura,
  ETIQUETA_CONFIRMAR_FECHA_FUTURA,
  ETIQUETA_CORREGIR_FECHA_FUTURA,
} from '@/utils/fechas';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

import { useAuth } from '@/contexts/AuthContext';
import { guardarGastosLote, leerIntentoGastosLote, finalizarGastosLote } from '@/utils/guardadoGastosLote';

const DRAFT_KEY = 'gastos_batch_draft';

interface GastosBatchTableProps {
  catalogs: GastosCatalogs;
  onSaved: () => void;
}

function createEmptyRow(): BatchRowData {
  return {
    id: crypto.randomUUID(),
    fecha: obtenerFechaHoy(),
    nombre: '',
    valor: '',
    negocio_id: '',
    region_id: '',
    categoria_id: '',
    concepto_id: '',
    proveedor_id: '',
    medio_pago_id: '',
    observaciones: '',
    factura_file: null,
    factura_uploaded: false,
  };
}

interface DraftData {
  rows: Omit<BatchRowData, 'factura_file'>[];
  savedAt: string;
  solicitudId?: string;
}

function serializeRows(rows: BatchRowData[], solicitudId: string): DraftData {
  return {
    rows: rows.map(({ factura_file: _file, ...rest }) => rest),
    savedAt: new Date().toISOString(),
    solicitudId,
  };
}

function deserializeRows(draft: DraftData): BatchRowData[] {
  return draft.rows.map((r) => ({ ...r, factura_file: null }));
}

const REQUIRED_FIELDS = ['fecha', 'nombre', 'valor', 'negocio_id', 'region_id', 'categoria_id', 'concepto_id', 'medio_pago_id'] as const;

const COLUMN_HEADERS = [
  'Fecha', 'Nombre', 'Valor', 'Negocio', 'Region',
  'Categoria', 'Concepto', 'Proveedor', 'Medio Pago', 'Observaciones', 'Factura', '',
];

export function GastosBatchTable({ catalogs, onSaved }: GastosBatchTableProps) {
  const { user } = useAuth();
  const usuarioActual = useRef(user?.id);
  usuarioActual.current = user?.id;
  const [pendiente, setPendiente] = useState(false);
  const [bloqueoRecuperacion, setBloqueoRecuperacion] = useState(false);
  const enviando = useRef(false);
  const [rows, setRows] = useState<BatchRowData[]>([createEmptyRow()]);
  const solicitudId = useRef(rows[0].id);
  const [errors, setErrors] = useState<Record<number, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [draftBanner, setDraftBanner] = useState<number | null>(null);
  const [showProveedorDialog, setShowProveedorDialog] = useState(false);
  const [mostrarConfirmacionFechaFutura, setMostrarConfirmacionFechaFutura] = useState(false);
  const [fechasFuturasPendientes, setFechasFuturasPendientes] = useState<string[]>([]);
  const draftTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const actualizarPendiente = useCallback(() => {
    try {
      setPendiente(!!user?.id && !!leerIntentoGastosLote(user.id));
      setBloqueoRecuperacion(false);
    } catch {
      setBloqueoRecuperacion(true);
    }
  }, [user?.id]);

  useEffect(() => {
    actualizarPendiente();
    window.addEventListener('storage', actualizarPendiente);
    return () => window.removeEventListener('storage', actualizarPendiente);
  }, [actualizarPendiente]);

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft: DraftData = JSON.parse(raw);
        if (draft.rows?.length > 0) {
          setDraftBanner(draft.rows.length);
        }
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  // Auto-save draft on row changes (debounced 5s)
  // Skip auto-save while the draft banner is showing — otherwise the empty
  // initial rows overwrite the saved draft before the user clicks "Restaurar".
  const saveDraft = useCallback(() => {
    const nonEmpty = rows.filter((r) => r.nombre || r.valor || r.negocio_id);
    if (nonEmpty.length > 0) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(serializeRows(nonEmpty, solicitudId.current)));
    } else {
      const raw = localStorage.getItem(DRAFT_KEY);
      const draft: DraftData | null = raw ? JSON.parse(raw) : null;
      if (draft && (draft.solicitudId ?? draft.rows?.[0]?.id) === solicitudId.current) localStorage.removeItem(DRAFT_KEY);
    }
  }, [rows]);

  useEffect(() => {
    if (draftBanner !== null || pendiente || bloqueoRecuperacion || saving) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(saveDraft, 5000);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [saveDraft, draftBanner, pendiente, bloqueoRecuperacion, saving]);

  const handleRestoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft: DraftData = JSON.parse(raw);
        solicitudId.current = draft.solicitudId ?? draft.rows[0].id;
        setRows(deserializeRows(draft));
      }
    } catch {
      // ignore
    }
    setDraftBanner(null);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftBanner(null);
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const handleChange = (index: number, field: string, value: string | File | null) => {
    setRows((prev) => {
      const updated = [...prev];
      if (field === 'factura_file') {
        updated[index] = { ...updated[index], factura_file: value as File | null };
      } else {
        updated[index] = { ...updated[index], [field]: value as string };
      }
      return updated;
    });
    setErrors((prev) => {
      const rowErrors = { ...prev[index] };
      delete rowErrors[field];
      return { ...prev, [index]: rowErrors };
    });
  };

  const handleRemove = (index: number) => {
    setRows((prev) => {
      if (prev.length === 1) return [createEmptyRow()];
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleProveedorCreated = async (_proveedorId: string) => {
    await catalogs.reloadProveedores();
    setShowProveedorDialog(false);
  };

  const isRowTouched = (row: BatchRowData) =>
    row.nombre || row.valor || row.negocio_id || row.region_id || row.categoria_id || row.concepto_id || row.medio_pago_id || row.observaciones;

  const validate = (): boolean => {
    const newErrors: Record<number, Record<string, string>> = {};
    let valid = true;

    rows.forEach((row, i) => {
      if (!isRowTouched(row)) return;
      const rowErrors: Record<string, string> = {};
      for (const field of REQUIRED_FIELDS) {
        if (field === 'valor') {
          if (!row.valor || Number(row.valor) <= 0) {
            rowErrors.valor = 'Requerido';
            valid = false;
          }
        } else if (!row[field]) {
          rowErrors[field] = 'Requerido';
          valid = false;
        }
      }
      if (Object.keys(rowErrors).length > 0) {
        newErrors[i] = rowErrors;
      }
    });

    setErrors(newErrors);
    return valid;
  };

  const persistirGastos = async () => {
    if (enviando.current || !user?.id || bloqueoRecuperacion) return;
    enviando.current = true;
    const usuarioId = user.id;
    try {
      setSaving(true);
      const supabase = getSupabase();

      const intentoPrevio = leerIntentoGastosLote(usuarioId);
      if (intentoPrevio) {
        const cantidad = await guardarGastosLote(supabase, usuarioId);
        completarGuardado(usuarioId, intentoPrevio.id, cantidad);
        return;
      }
      const rowsToSave = rows.filter(isRowTouched);
      // Preserve the input before uploads; no database request exists yet.
      if (draftTimer.current) clearTimeout(draftTimer.current);
      saveDraft();

      const facturaUrls: Record<number, string> = {};
      for (let i = 0; i < rowsToSave.length; i++) {
        const file = rowsToSave[i].factura_file;
        if (file) {
          const timestamp = Date.now();
          const ext = file.name.split('.').pop();
          const path = `facturas_compra/${timestamp}-${Math.random().toString(36).substring(7)}.${ext}`;
          const { data, error } = await supabase.storage
            .from('facturas')
            .upload(path, file, { cacheControl: '3600', upsert: false });
          if (error) throw new Error(`Error subiendo factura fila ${i + 1}: ${error.message}`);
          facturaUrls[i] = data.path;
        }
      }

      const payload = rowsToSave.map((row, i) => ({
        fecha: row.fecha,
        nombre: row.nombre.trim(),
        valor: Number(row.valor),
        negocio_id: row.negocio_id,
        region_id: row.region_id,
        categoria_id: row.categoria_id,
        concepto_id: row.concepto_id,
        proveedor_id: row.proveedor_id || null,
        medio_pago_id: row.medio_pago_id,
        observaciones: row.observaciones.trim() || null,
        url_factura: facturaUrls[i] || null,
        estado: 'Confirmado' as const,
      }));

      if (usuarioActual.current !== usuarioId) throw new Error('La sesión cambió. Vuelve a la cuenta original para guardar.');
      const promesa = guardarGastosLote(supabase, usuarioId, payload, solicitudId.current);
      const intentoId = leerIntentoGastosLote(usuarioId)?.id;
      const cantidad = await promesa;
      if (intentoId) completarGuardado(usuarioId, intentoId, cantidad);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error al guardar: ' + message);
    } finally {
      enviando.current = false;
      setSaving(false);
      actualizarPendiente();
    }
  };

  const completarGuardado = (usuarioId: string, intentoId: string, cantidad: number) => {
    if (usuarioActual.current !== usuarioId) return; // Keep the original account's recovery state.
    const raw = localStorage.getItem(DRAFT_KEY);
    const draft: DraftData | null = raw ? JSON.parse(raw) : null;
    if (draft && (draft.solicitudId ?? draft.rows?.[0]?.id) === intentoId) localStorage.removeItem(DRAFT_KEY);
    finalizarGastosLote(usuarioId, intentoId);
    solicitudId.current = crypto.randomUUID();
    setRows([createEmptyRow()]);
    setErrors({});
    setDraftBanner(null);
    toast.success(`${cantidad} gasto${cantidad > 1 ? 's' : ''} guardado${cantidad > 1 ? 's' : ''} exitosamente`);
    onSaved();
  };

  const handleSave = async () => {
    if (!user?.id || enviando.current || bloqueoRecuperacion) return;
    try {
      if (leerIntentoGastosLote(user.id)) { await persistirGastos(); return; }
    } catch { actualizarPendiente(); return; }
    const touchedRows = rows.filter(isRowTouched);
    if (touchedRows.length === 0) {
      toast.error('No hay gastos para guardar');
      return;
    }
    if (!validate()) {
      toast.error('Corrige los campos marcados en rojo antes de guardar');
      return;
    }

    const futuras = touchedRows.filter((r) => esFechaFuturaSospechosa(r.fecha)).map((r) => r.fecha);
    if (futuras.length > 0) {
      setFechasFuturasPendientes(futuras);
      setMostrarConfirmacionFechaFutura(true);
      return;
    }

    await persistirGastos();
  };

  const filledCount = rows.filter((r) => r.nombre && r.valor).length;

  return (
    <>
    <div className="space-y-4">
      {(pendiente || bloqueoRecuperacion) && (
        <div role="status" className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          {bloqueoRecuperacion
            ? 'No se puede leer el lote pendiente. Conserva los datos y avisa a Gerencia.'
            : 'Hay un lote sin confirmar. Verifica su guardado antes de capturar otros gastos. No borres los datos del navegador.'}
        </div>
      )}
      {/* Draft restoration banner */}
      {draftBanner !== null && !pendiente && !bloqueoRecuperacion && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800 flex-1">
            Tienes {draftBanner} gasto{draftBanner > 1 ? 's' : ''} sin guardar de una sesion anterior.
          </span>
          <Button size="sm" variant="outline" onClick={handleRestoreDraft} className="border-amber-300 text-amber-700 hover:bg-amber-100">
            Restaurar
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDiscardDraft} className="text-amber-600 hover:text-amber-800">
            Descartar
          </Button>
        </div>
      )}

      <fieldset className="min-w-0" style={{ minWidth: 0 }} disabled={saving || pendiente || bloqueoRecuperacion}>
      {/* Table */}
      <div className="bg-white rounded-xl border border-primary/10 overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-primary/10">
              {COLUMN_HEADERS.map((h, i) => (
                <th key={i} className="px-3 py-3 text-left text-xs font-semibold text-brand-brown/70 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <GastosBatchRow
                key={row.id}
                row={row}
                index={i}
                catalogs={catalogs}
                errors={errors[i] || {}}
                onChange={handleChange}
                onRemove={handleRemove}
                onCreateProveedor={() => setShowProveedorDialog(true)}
              />
            ))}
          </tbody>
        </table>
      </div>

      </fieldset>
      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={saving || pendiente || bloqueoRecuperacion}
          onClick={handleAddRow}
          className="border-dashed border-primary/30 text-primary hover:bg-primary/5"
        >
          <Plus className="w-4 h-4 mr-1" />
          Agregar fila
        </Button>

        <div className="flex-1" />

        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || catalogs.loading || !user || bloqueoRecuperacion}
          className="bg-gradient-to-r from-primary to-secondary text-white hover:from-primary-dark hover:to-secondary-dark shadow-sm"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {saving ? 'Guardando...' : pendiente ? 'Verificar lote pendiente' : `Guardar ${filledCount} gasto${filledCount !== 1 ? 's' : ''}`}
        </Button>
      </div>

      {/* Proveedor creation dialog */}
      <ProveedorDialog
        open={showProveedorDialog}
        onOpenChange={setShowProveedorDialog}
        onSuccess={handleProveedorCreated}
        onError={(message) => toast.error(message)}
      />
    </div>

    {/* ESCO-91: fecha más de un día en el futuro -- casi siempre un error de tecleo */}
    <ConfirmDialog
      open={mostrarConfirmacionFechaFutura}
      onOpenChange={setMostrarConfirmacionFechaFutura}
      title="¿Fecha en el futuro?"
      description={mensajeConfirmacionFechaFutura('gasto', fechasFuturasPendientes)}
      confirmLabel={ETIQUETA_CONFIRMAR_FECHA_FUTURA}
      cancelLabel={ETIQUETA_CORREGIR_FECHA_FUTURA}
      onConfirm={() => {
        setMostrarConfirmacionFechaFutura(false);
        persistirGastos();
      }}
    />
    </>
  );
}
