import { useState } from 'react';
import { CheckCircle2, Clock, Edit2, Trash2, AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { getSupabase } from '../../../utils/supabase/client';
import { formatNumber } from '../../../utils/format';
import { formatearFechaLarga } from '../../../utils/fechas';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '../../ui/dialog';
import type { Gasto, TransaccionGanado, UnifiedFinanceItem } from '../../../types/finanzas';
import { toast } from 'sonner';

interface GastoDetalleDialogProps {
  item: UnifiedFinanceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resuelve created_by → nombre del usuario que registró el gasto. */
  nombreUsuario?: string;
  onEdit: () => void;
  onEliminar: () => void;
  onCompletar?: () => void;
}

/** Una fila etiqueta/valor. Se omite por completo cuando no hay dato. */
function Campo({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 mt-1">{value}</p>
    </div>
  );
}

export function GastoDetalleDialog({
  item,
  open,
  onOpenChange,
  nombreUsuario,
  onEdit,
  onEliminar,
  onCompletar,
}: GastoDetalleDialogProps) {
  const [abriendoFactura, setAbriendoFactura] = useState(false);

  if (!item) return null;

  const esGanado = item.source === 'ganado';
  const gasto = !esGanado ? (item.raw as Gasto) : null;
  const ganado = esGanado ? (item.raw as TransaccionGanado) : null;
  // El query de GastosList trae los catálogos como joins anidados (fin_negocios, etc.),
  // que no están declarados en el tipo Gasto.
  const relaciones = (item.raw ?? {}) as unknown as Record<string, { nombre?: string } | undefined>;
  const urlFactura = gasto?.url_factura;
  const esPendiente = gasto?.estado === 'Pendiente';

  const verFactura = async () => {
    if (!urlFactura) return;
    try {
      setAbriendoFactura(true);
      const { data, error } = await getSupabase()
        .storage
        .from('facturas')
        .createSignedUrl(urlFactura, 60 * 60);
      if (error || !data?.signedUrl) throw error ?? new Error('No se pudo generar el enlace');
      window.open(data.signedUrl, '_blank');
    } catch {
      toast.error('No se pudo abrir la factura');
    } finally {
      setAbriendoFactura(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="text-base">{item.nombre}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          {/* Valor + estado */}
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-gray-100">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Valor</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">${formatNumber(item.valor)}</p>
            </div>
            {esGanado ? (
              <span className="px-2 py-1 text-xs font-semibold rounded-lg bg-amber-100 text-amber-700">
                Ganado
              </span>
            ) : (
              <span
                className={`px-2 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 ${
                  gasto?.estado === 'Confirmado'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-yellow-50 text-yellow-700'
                }`}
              >
                {gasto?.estado === 'Confirmado' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
                {gasto?.estado}
              </span>
            )}
          </div>

          {/* Campos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <Campo label="Fecha" value={formatearFechaLarga(item.fecha)} />

            {esGanado ? (
              <>
                <Campo label="Finca" value={ganado?.finca} />
                <Campo label="Proveedor" value={ganado?.cliente_proveedor} />
                <Campo
                  label="Cabezas"
                  value={ganado?.cantidad_cabezas ? formatNumber(ganado.cantidad_cabezas) : null}
                />
                <Campo
                  label="Kilos pagados"
                  value={ganado?.kilos_pagados ? `${formatNumber(ganado.kilos_pagados)} kg` : null}
                />
                <Campo
                  label="Precio por kilo"
                  value={ganado?.precio_kilo ? `$${formatNumber(ganado.precio_kilo)}` : null}
                />
              </>
            ) : (
              <>
                <Campo label="Negocio" value={relaciones.fin_negocios?.nombre} />
                <Campo label="Región" value={relaciones.fin_regiones?.nombre} />
                <Campo label="Categoría" value={relaciones.fin_categorias_gastos?.nombre} />
                <Campo label="Concepto" value={relaciones.fin_conceptos_gastos?.nombre} />
                <Campo label="Proveedor" value={relaciones.fin_proveedores?.nombre} />
                <Campo label="Medio de pago" value={relaciones.fin_medios_pago?.nombre} />
              </>
            )}

            <Campo label="Registrado por" value={nombreUsuario || 'Sin usuario'} />
          </div>

          {(item.raw as Gasto | TransaccionGanado)?.observaciones && (
            <div className="pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Observaciones</p>
              <p className="text-sm text-gray-900 mt-1">
                {(item.raw as Gasto | TransaccionGanado).observaciones}
              </p>
            </div>
          )}

          {urlFactura && (
            <div className="pt-4 border-t border-gray-100">
              <Button variant="outline" size="sm" onClick={verFactura} disabled={abriendoFactura}>
                {abriendoFactura ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 mr-2" />
                )}
                Ver factura
              </Button>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onEliminar}
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Eliminar
          </Button>
          {esPendiente && onCompletar && (
            <Button variant="outline" onClick={onCompletar} className="border-orange-200 text-orange-600">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Completar
            </Button>
          )}
          <Button onClick={onEdit}>
            <Edit2 className="w-4 h-4 mr-2" />
            Editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
