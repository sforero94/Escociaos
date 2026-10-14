import { useAuth } from '@/contexts/AuthContext';
import { validateInvoiceSelection,uploadInvoice,invalidateInvoiceTarget,verifyInvoiceOwner,resolveInvoice,pendingInvoice,type InvoiceClient } from '@/utils/invoiceUpload';
import { validarArchivoFactura } from '@/utils/archivoFactura';
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

const DRAFT_PREFIX = 'gastos_batch_draft';

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
}

function serializeRows(rows: BatchRowData[]): DraftData {
  return {
    rows: rows.map(({ factura_file: _file, ...rest }) => rest),
    savedAt: new Date().toISOString(),
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

export function GastosBatchTable(props:GastosBatchTableProps) {
  const {user}=useAuth();return <GastosBatchTableState key={user?.id??'signed-out'} {...props} owner={user?.id??''}/>;
}
function GastosBatchTableState({catalogs,onSaved,owner}:GastosBatchTableProps & {owner:string}) {
  const DRAFT_KEY=`${DRAFT_PREFIX}:${owner}`;
  const operation=useRef(0);const mounted=useRef(true);const targets=useRef(new Map<string,string>());
  useEffect(()=>{mounted.current=true;const targetMap=targets.current;const operationRef=operation;return()=>{mounted.current=false;operationRef.current++;for(const key of targetMap.values())void invalidateInvoiceTarget(getSupabase() as unknown as InvoiceClient,owner,key).catch(()=>undefined);};},[owner]);
  const [rows, setRows] = useState<BatchRowData[]>([createEmptyRow()]);
  const [errors, setErrors] = useState<Record<number, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [draftBanner, setDraftBanner] = useState<number | null>(null);
  const [showProveedorDialog, setShowProveedorDialog] = useState(false);
  const [mostrarConfirmacionFechaFutura, setMostrarConfirmacionFechaFutura] = useState(false);
  const [fechasFuturasPendientes, setFechasFuturasPendientes] = useState<string[]>([]);
  const draftTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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
  }, [DRAFT_KEY]);

  // Auto-save draft on row changes (debounced 5s)
  // Skip auto-save while the draft banner is showing — otherwise the empty
  // initial rows overwrite the saved draft before the user clicks "Restaurar".
  const saveDraft = useCallback(() => {
    const nonEmpty = rows.filter((r) => r.nombre || r.valor || r.negocio_id);
    if (nonEmpty.length > 0) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(serializeRows(nonEmpty)));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [rows,DRAFT_KEY]);

  useEffect(() => {
    if (draftBanner !== null) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(saveDraft, 5000);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [saveDraft, draftBanner]);

  const handleRestoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft: DraftData = JSON.parse(raw);
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
    if (field === 'factura_file' && value) {
      const error = validarArchivoFactura(value as File);
      if (error) { toast.error(error); return; }
    }
    operation.current++;
    const rowId=rows[index].id;const previousTarget=targets.current.get(rowId);
    if(previousTarget){targets.current.delete(rowId);void invalidateInvoiceTarget(getSupabase() as unknown as InvoiceClient,owner,previousTarget).catch(()=>undefined);}
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
    operation.current++;const key=targets.current.get(rows[index].id);if(key)void invalidateInvoiceTarget(getSupabase() as unknown as InvoiceClient,owner,key).catch(()=>undefined);
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
      const rowErrors: Record<string, string> = {};
      if (row.factura_file) {
        const error = validarArchivoFactura(row.factura_file);
        if (error) { rowErrors.factura_file = error; valid = false; }
      }
      if (!isRowTouched(row)) {
        if (Object.keys(rowErrors).length) newErrors[i] = rowErrors;
        return;
      }
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
    if (!validate()) {
      toast.error('Corrige los campos marcados en rojo antes de guardar');
      return;
    }
    try {
      const g=++operation.current;const current=()=>mounted.current&&operation.current===g;
      setSaving(true);
      const supabase = getSupabase();

      const rowsToSave = rows.filter(isRowTouched);
      for(const row of rowsToSave){if(row.factura_file)await validateInvoiceSelection(row.factura_file);if(!current())throw new Error('La cuenta o la fila cambió');}

      const facturaUrls: Record<string, string> = {};
      for (let i = 0; i < rowsToSave.length; i++) {
        const file = rowsToSave[i].factura_file;
        if (file) {
          const rowId=rowsToSave[i].id;let targetKey=targets.current.get(rowId);if(!targetKey){targetKey=crypto.randomUUID();targets.current.set(rowId,targetKey);}
          const r=await uploadInvoice(supabase as unknown as InvoiceClient,owner,`GastosBatchTable:${rowId}`,targetKey,'compra',file,current);
          if(!current())throw new Error('La cuenta o la fila cambió');
          facturaUrls[rowId]=r.path;
        }
      }

      const payload = rowsToSave.map((row) => ({
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
        url_factura: facturaUrls[row.id] || null,
        estado: 'Confirmado' as const,
      }));

      await verifyInvoiceOwner(supabase as unknown as InvoiceClient,owner,current);
      const { error } = await supabase.from('fin_gastos').insert(payload);
      if(!current())return;
      if (error) throw error;

      toast.success(`${rowsToSave.length} gasto${rowsToSave.length > 1 ? 's' : ''} guardado${rowsToSave.length > 1 ? 's' : ''} exitosamente`);
      localStorage.removeItem(DRAFT_KEY);
      setRows([createEmptyRow()]);
      setErrors({});
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error al guardar: ' + message);
    } finally {
      if(mounted.current)setSaving(false);
    }
  };

  const handleSave = async () => {
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
        <Button type="button" variant="outline" disabled={saving} onClick={async()=>{
        const g=operation.current;const current=()=>mounted.current&&operation.current===g;
        try{for(const row of rows){const scope=`GastosBatchTable:${row.id}`;if(pendingInvoice(owner,scope))await resolveInvoice(getSupabase() as unknown as InvoiceClient,owner,scope,current);}
          if(current())toast.success('Resultados verificados; los intentos desconocidos se conservan.');
        }catch(error:unknown){if(current())toast.error(error instanceof Error?error.message:'Factura pendiente');}
      }}>Verificar facturas pendientes</Button>
      {/* Draft restoration banner */}
      {draftBanner !== null && (

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

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
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
          disabled={saving || catalogs.loading}
          className="bg-gradient-to-r from-primary to-secondary text-white hover:from-primary-dark hover:to-secondary-dark shadow-sm"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {saving ? 'Guardando...' : `Guardar ${filledCount} gasto${filledCount !== 1 ? 's' : ''}`}
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
