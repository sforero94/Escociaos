import { useAuth } from '@/contexts/AuthContext';
import { validateInvoiceSelection,uploadInvoice,invalidateInvoiceTarget,verifyInvoiceOwner,resolveInvoice,pendingInvoice,type InvoiceClient } from '@/utils/invoiceUpload';
import { validarArchivoFactura } from '@/utils/archivoFactura';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Save, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSupabase } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { IngresosBatchRow } from './IngresosBatchRow';
import { CompradorDialog } from './CompradorDialog';
import type { BatchRowDataIngreso } from '@/types/finanzas';
import type { IngresosCatalogs } from '../hooks/useIngresosCatalogs';
import {
  obtenerFechaHoy,
  esFechaFuturaSospechosa,
  mensajeConfirmacionFechaFutura,
  ETIQUETA_CONFIRMAR_FECHA_FUTURA,
  ETIQUETA_CORREGIR_FECHA_FUTURA,
} from '@/utils/fechas';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const DRAFT_PREFIX = 'ingresos_batch_draft';

interface IngresosBatchTableProps {
  catalogs: IngresosCatalogs;
  onSaved: () => void;
}

function createEmptyRow(): BatchRowDataIngreso {
  return {
    id: crypto.randomUUID(),
    fecha: obtenerFechaHoy(),
    nombre: '',
    valor: '',
    negocio_id: '',
    region_id: '',
    categoria_id: '',
    comprador_id: '',
    medio_pago_id: '',
    observaciones: '',
    factura_file: null,
    factura_uploaded: false,
    cantidad: '',
  };
}

interface DraftData {
  rows: Omit<BatchRowDataIngreso, 'factura_file'>[];
  savedAt: string;
}

function serializeRows(rows: BatchRowDataIngreso[]): DraftData {
  return {
    rows: rows.map(({ factura_file: _file, ...rest }) => rest),
    savedAt: new Date().toISOString(),
  };
}

function deserializeRows(draft: DraftData): BatchRowDataIngreso[] {
  return draft.rows.map((r) => {
    const row = { ...r, factura_file: null } as BatchRowDataIngreso;
    // Compatibilidad con borradores guardados antes de que se agregara el campo cantidad
    if (!row.cantidad) row.cantidad = '';
    return row;
  });
}

const REQUIRED_FIELDS = ['fecha', 'nombre', 'valor', 'negocio_id', 'region_id', 'categoria_id', 'medio_pago_id'] as const;

const COLUMN_HEADERS = [
  'Fecha', 'Nombre', 'Valor', 'Negocio', 'Region',
  'Categoria', 'Comprador', 'Medio Pago', 'Observaciones', 'Factura', '',
];

export function IngresosBatchTable(props:IngresosBatchTableProps) {
  const {user}=useAuth();return <IngresosBatchTableState key={user?.id??'signed-out'} {...props} owner={user?.id??''}/>;
}
function IngresosBatchTableState({catalogs,onSaved,owner}:IngresosBatchTableProps & {owner:string}) {
  const DRAFT_KEY=`${DRAFT_PREFIX}:${owner}`;
  const operation=useRef(0);const mounted=useRef(true);const targets=useRef(new Map<string,string>());
  useEffect(()=>{mounted.current=true;const targetMap=targets.current;const operationRef=operation;return()=>{mounted.current=false;operationRef.current++;for(const key of targetMap.values())void invalidateInvoiceTarget(getSupabase() as unknown as InvoiceClient,owner,key).catch(()=>undefined);};},[owner]);
  const [rows, setRows] = useState<BatchRowDataIngreso[]>([createEmptyRow()]);
  const [errors, setErrors] = useState<Record<number, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [draftBanner, setDraftBanner] = useState<number | null>(null);
  const [showCompradorDialog, setShowCompradorDialog] = useState(false);
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

  const handleCompradorCreated = async (_compradorId: string) => {
    await catalogs.reloadCompradores();
    setShowCompradorDialog(false);
  };

  const validate = (): boolean => {
    const newErrors: Record<number, Record<string, string>> = {};
    let valid = true;

    rows.forEach((row, i) => {
      const rowErrors: Record<string, string> = {};
      if (row.factura_file) {
        const error = validarArchivoFactura(row.factura_file);
        if (error) { rowErrors.factura_file = error; valid = false; }
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

  const persistirIngresos = async () => {
    if (!validate()) {
      toast.error('Corrige los campos marcados en rojo antes de guardar');
      return;
    }
    try {
      const g=++operation.current;const current=()=>mounted.current&&operation.current===g;
      setSaving(true);
      const supabase = getSupabase();

      for(const row of rows){if(row.factura_file)await validateInvoiceSelection(row.factura_file);if(!current())throw new Error('La cuenta o la fila cambió');}
      const facturaUrls: Record<string, string> = {};
      for (let i = 0; i < rows.length; i++) {
        const file = rows[i].factura_file;
        if (file) {
          const rowId=rows[i].id;let targetKey=targets.current.get(rowId);if(!targetKey){targetKey=crypto.randomUUID();targets.current.set(rowId,targetKey);}
          const r=await uploadInvoice(supabase as unknown as InvoiceClient,owner,`IngresosBatchTable:${rowId}`,targetKey,'venta',file,current);
          if(!current())throw new Error('La cuenta o la fila cambió');
          facturaUrls[rowId]=r.path;
        }
      }

      const payload = rows.map((row) => {
        const negocio = catalogs.negocios.find((n) => n.id === row.negocio_id);
        const negocioNombre = negocio?.nombre ?? '';
        const mostrarCantidad =
          negocioNombre.toLowerCase().includes('aguacate') ||
          negocioNombre.toLowerCase().includes('hato') ||
          negocioNombre.toLowerCase().includes('lechero');
        const cantidadNum = mostrarCantidad && row.cantidad ? Number(row.cantidad) : null;
        const valorNum = Number(row.valor);
        const precioUnitario =
          cantidadNum && cantidadNum > 0 && valorNum > 0 ? valorNum / cantidadNum : null;

        return {
          fecha: row.fecha,
          nombre: row.nombre.trim(),
          valor: valorNum,
          negocio_id: row.negocio_id,
          region_id: row.region_id,
          categoria_id: row.categoria_id,
          comprador_id: row.comprador_id || null,
          medio_pago_id: row.medio_pago_id,
          observaciones: row.observaciones.trim() || null,
          url_factura: facturaUrls[row.id] || null,
          cantidad: cantidadNum,
          precio_unitario: precioUnitario,
        };
      });

      await verifyInvoiceOwner(supabase as unknown as InvoiceClient,owner,current);
      const { error } = await supabase.from('fin_ingresos').insert(payload);
      if(!current())return;
      if (error) throw error;

      toast.success(`${rows.length} ingreso${rows.length > 1 ? 's' : ''} guardado${rows.length > 1 ? 's' : ''} exitosamente`);
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
    if (!validate()) {
      toast.error('Corrige los campos marcados en rojo antes de guardar');
      return;
    }

    const futuras = rows.filter((r) => esFechaFuturaSospechosa(r.fecha)).map((r) => r.fecha);
    if (futuras.length > 0) {
      setFechasFuturasPendientes(futuras);
      setMostrarConfirmacionFechaFutura(true);
      return;
    }

    await persistirIngresos();
  };

  const filledCount = rows.filter((r) => r.nombre && r.valor).length;

  return (
    <>
    <div className="space-y-4">
        <Button type="button" variant="outline" disabled={saving} onClick={async()=>{
        const g=operation.current;const current=()=>mounted.current&&operation.current===g;
        try{for(const row of rows){const scope=`IngresosBatchTable:${row.id}`;if(pendingInvoice(owner,scope))await resolveInvoice(getSupabase() as unknown as InvoiceClient,owner,scope,current);}
          if(current())toast.success('Resultados verificados; los intentos desconocidos se conservan.');
        }catch(error:unknown){if(current())toast.error(error instanceof Error?error.message:'Factura pendiente');}
      }}>Verificar facturas pendientes</Button>
      {/* Draft restoration banner */}
      {draftBanner !== null && (

      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800 flex-1">
            Tienes {draftBanner} ingreso{draftBanner > 1 ? 's' : ''} sin guardar de una sesion anterior.
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
              <IngresosBatchRow
                key={row.id}
                row={row}
                index={i}
                catalogs={catalogs}
                errors={errors[i] || {}}
                onChange={handleChange}
                onRemove={handleRemove}
                onCreateComprador={() => setShowCompradorDialog(true)}
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
          disabled={saving || catalogs.loading || filledCount === 0}
          className="bg-gradient-to-r from-primary to-secondary text-white hover:from-primary-dark hover:to-secondary-dark shadow-sm"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {saving ? 'Guardando...' : `Guardar ${filledCount} ingreso${filledCount !== 1 ? 's' : ''}`}
        </Button>
      </div>

      {/* Comprador creation dialog */}
      <CompradorDialog
        open={showCompradorDialog}
        onOpenChange={setShowCompradorDialog}
        onSuccess={handleCompradorCreated}
        onError={(message) => toast.error(message)}
      />
    </div>

    {/* ESCO-91: fecha más de un día en el futuro -- casi siempre un error de tecleo */}
    <ConfirmDialog
      open={mostrarConfirmacionFechaFutura}
      onOpenChange={setMostrarConfirmacionFechaFutura}
      title="¿Fecha en el futuro?"
      description={mensajeConfirmacionFechaFutura('ingreso', fechasFuturasPendientes)}
      confirmLabel={ETIQUETA_CONFIRMAR_FECHA_FUTURA}
      cancelLabel={ETIQUETA_CORREGIR_FECHA_FUTURA}
      onConfirm={() => {
        setMostrarConfirmacionFechaFutura(false);
        persistirIngresos();
      }}
    />
    </>
  );
}
