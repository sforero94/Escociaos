import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useGanadoInventario } from '../hooks/useGanadoInventario';
import { RepartoPotreros, FILA_REPARTO_VACIA } from './RepartoPotreros';
import type { ExistenciasPotrero } from './RepartoPotreros';
import {
  validarRepartoConfirmacion,
  validarExistencias,
  cabezasDePendiente,
  filasConCabezas,
  totalCabezasReparto,
} from '@/utils/calculosGanado';
import type { RepartoFila } from '@/utils/calculosGanado';
import { formatNumber, formatCurrency } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import type { GanFinca, GanLote, GanPotrero, GanMovimiento } from '@/types/ganado';

/**
 * `movimiento` puede traer el valor de la transacción embebido cuando el
 * rol lo permite (B-2) — campo opcional: si no viene, la fila de valor
 * simplemente no se muestra, nunca en blanco (R-4/R-1).
 */
interface MovimientoPendienteConValor extends GanMovimiento {
  valor_total?: number | null;
}

interface ConfirmarPendienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movimiento: MovimientoPendienteConValor | null;
  fincas: GanFinca[];
  lotes?: GanLote[];
  potreros: GanPotrero[];
  existencias?: Record<string, ExistenciasPotrero>;
  onSuccess: () => void;
}

/**
 * Confirmación de un movimiento pendiente generado desde finanzas: reparte
 * las cabezas entre uno o varios potreros con su split novillos/toros. El
 * total debe cerrar exactamente contra las cabezas de la transacción
 * (precargadas por el trigger).
 */
export function ConfirmarPendienteDialog({
  open,
  onOpenChange,
  movimiento,
  fincas,
  lotes = [],
  potreros,
  existencias,
  onSuccess,
}: ConfirmarPendienteDialogProps) {
  const { confirmarPendiente } = useGanadoInventario();
  const { profile } = useAuth();
  const canVerPlata = profile?.rol === 'Gerencia' || profile?.rol === 'Administrador';

  const [filas, setFilas] = useState<RepartoFila[]>([{ ...FILA_REPARTO_VACIA }]);
  const [saving, setSaving] = useState(false);

  const cabezas = movimiento ? cabezasDePendiente(movimiento) : 0;
  const esVenta = movimiento?.tipo === 'venta';

  useEffect(() => {
    if (!open || !movimiento) return;
    // Arranca con todas las cabezas como novillos en un solo potrero: es el
    // caso más común y quien reparta solo tiene que corregir hacia abajo.
    setFilas([{ potrero_id: '', novillos: cabezasDePendiente(movimiento), toros: 0 }]);
  }, [open, movimiento]);

  const asignadas = totalCabezasReparto(filasConCabezas(filas));
  const restantes = cabezas - asignadas;

  const nombrePotrero = useMemo(() => {
    const map = new Map(potreros.map((p) => [p.id, p.nombre]));
    return (id: string) => map.get(id) || 'El potrero';
  }, [potreros]);

  const handleConfirmar = async () => {
    if (!movimiento) return;

    const errorReparto = validarRepartoConfirmacion(filas, cabezas);
    if (errorReparto) {
      toast.error(errorReparto);
      return;
    }
    // En una venta las cabezas salen de cada potrero: se valida antes para
    // que el usuario no reciba el error como una falla de base de datos.
    if (esVenta && existencias) {
      const errorExistencias = validarExistencias(filas, existencias, nombrePotrero);
      if (errorExistencias) {
        toast.error(errorExistencias);
        return;
      }
    }

    setSaving(true);
    try {
      await confirmarPendiente({ movimientoId: movimiento.id, filas });
      const n = filasConCabezas(filas).length;
      toast.success(
        n > 1
          ? `Movimiento confirmado y repartido en ${n} potreros`
          : 'Movimiento confirmado e inventario actualizado'
      );
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast.error('Error confirmando movimiento: ' + message);
    } finally {
      setSaving(false);
    }
  };

  if (!movimiento) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Confirmar {esVenta ? 'venta' : 'compra'} en inventario</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4 p-1">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 space-y-1">
              <p><strong>{formatNumber(cabezas)}</strong> cabezas · {formatearFecha(movimiento.fecha)}</p>
              {canVerPlata && movimiento.valor_total != null && (
                <p>Valor: <strong>{formatCurrency(movimiento.valor_total)}</strong></p>
              )}
              {movimiento.peso_promedio_kg != null && (
                <p>Peso promedio: {formatNumber(movimiento.peso_promedio_kg)} kg</p>
              )}
              {movimiento.notas && <p className="text-amber-700/80">{movimiento.notas}</p>}
            </div>

            <RepartoPotreros
              label={esVenta ? 'Potreros de origen *' : 'Potreros de destino *'}
              filas={filas}
              onChange={setFilas}
              fincas={fincas}
              lotes={lotes}
              potreros={potreros}
              existencias={esVenta ? existencias : undefined}
              disabled={saving}
            />

            <div
              className={`rounded-xl border px-3 py-2 text-sm ${
                restantes === 0
                  ? 'border-primary/30 bg-primary/5 text-primary'
                  : 'border-amber-300 bg-amber-50 text-amber-800'
              }`}
            >
              Asignadas <strong>{formatNumber(asignadas)}</strong> de {formatNumber(cabezas)} cabezas
              {restantes > 0 && ` · faltan ${formatNumber(restantes)}`}
              {restantes < 0 && ` · sobran ${formatNumber(-restantes)}`}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleConfirmar} disabled={saving || restantes !== 0}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
