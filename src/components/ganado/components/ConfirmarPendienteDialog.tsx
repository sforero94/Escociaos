import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGanadoInventario } from '../hooks/useGanadoInventario';
import { validarSplitConfirmacion, cabezasDePendiente } from '@/utils/calculosGanado';
import { formatNumber } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import type { GanFinca, GanPotrero, GanMovimiento } from '@/types/ganado';

interface ConfirmarPendienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movimiento: GanMovimiento | null;
  fincas: GanFinca[];
  potreros: GanPotrero[];
  onSuccess: () => void;
}

const selectClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20';

/**
 * Confirmación de un movimiento pendiente generado desde finanzas:
 * asigna el potrero y el split novillos/toros. La suma debe igualar las
 * cabezas de la transacción original (precargadas por el trigger).
 */
export function ConfirmarPendienteDialog({ open, onOpenChange, movimiento, fincas, potreros, onSuccess }: ConfirmarPendienteDialogProps) {
  const { confirmarPendiente } = useGanadoInventario();

  const [potreroId, setPotreroId] = useState('');
  const [novillos, setNovillos] = useState('');
  const [toros, setToros] = useState('');
  const [saving, setSaving] = useState(false);

  const cabezas = movimiento ? cabezasDePendiente(movimiento) : 0;
  const esVenta = movimiento?.tipo === 'venta';

  useEffect(() => {
    if (!open || !movimiento) return;
    setPotreroId('');
    setNovillos(String(cabezasDePendiente(movimiento)));
    setToros('0');
  }, [open, movimiento]);

  const potrerosPorFinca = useMemo(() => {
    const map = new Map<string, GanPotrero[]>();
    potreros.filter((p) => p.activo).forEach((p) => {
      if (!map.has(p.finca_id)) map.set(p.finca_id, []);
      map.get(p.finca_id)!.push(p);
    });
    return Array.from(map.entries());
  }, [potreros]);

  const fincaNombre = (fincaId: string) => fincas.find((f) => f.id === fincaId)?.nombre || 'Sin finca';

  const handleConfirmar = async () => {
    if (!movimiento) return;
    if (!potreroId) {
      toast.error('Selecciona el potrero');
      return;
    }
    const nNovillos = Math.round(Number(novillos) || 0);
    const nToros = Math.round(Number(toros) || 0);
    const errorSplit = validarSplitConfirmacion(nNovillos, nToros, cabezas);
    if (errorSplit) {
      toast.error(errorSplit);
      return;
    }

    setSaving(true);
    try {
      await confirmarPendiente({
        movimientoId: movimiento.id,
        potreroId,
        novillos: nNovillos,
        toros: nToros,
        esVenta: !!esVenta,
      });
      toast.success('Movimiento confirmado e inventario actualizado');
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      if (message.includes('gan_movimientos_transaccion_confirmado_unique')) {
        toast.error('Esta transacción ya tiene un movimiento confirmado en inventario');
      } else {
        toast.error('Error confirmando movimiento: ' + message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!movimiento) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Confirmar {esVenta ? 'venta' : 'compra'} en inventario</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4 p-1">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 space-y-1">
              <p><strong>{formatNumber(cabezas)}</strong> cabezas · {formatearFecha(movimiento.fecha)}</p>
              {movimiento.peso_promedio_kg != null && (
                <p>Peso promedio: {formatNumber(movimiento.peso_promedio_kg)} kg</p>
              )}
              {movimiento.notas && <p className="text-amber-700/80">{movimiento.notas}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>{esVenta ? 'Potrero de origen *' : 'Potrero de destino *'}</Label>
              <select value={potreroId} onChange={(e) => setPotreroId(e.target.value)} className={selectClass}>
                <option value="">Seleccionar...</option>
                {potrerosPorFinca.map(([fincaId, ps]) => (
                  <optgroup key={fincaId} label={fincaNombre(fincaId)}>
                    {ps.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Novillos *</Label>
                <Input
                  type="number"
                  min={0}
                  value={novillos}
                  onChange={(e) => setNovillos(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Toros *</Label>
                <Input
                  type="number"
                  min={0}
                  value={toros}
                  onChange={(e) => setToros(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
            </div>
            <p className="text-xs text-brand-brown/60">
              La suma de novillos y toros debe ser {formatNumber(cabezas)}.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleConfirmar} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
