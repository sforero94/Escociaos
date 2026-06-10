import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGanadoInventario } from '../hooks/useGanadoInventario';
import type { GanFinca, GanPotrero } from '@/types/ganado';

interface MovimientoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fincas: GanFinca[];
  potreros: GanPotrero[];
  onSuccess: () => void;
}

const selectClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20';

type TipoManual = 'muerte' | 'traslado' | 'ajuste';

/**
 * Registro manual de movimientos: muerte, traslado (genera salida +
 * entrada) y ajuste (delta libre con nota obligatoria).
 */
export function MovimientoFormDialog({ open, onOpenChange, fincas, potreros, onSuccess }: MovimientoFormDialogProps) {
  const { registrarMuerte, registrarTraslado, registrarAjuste } = useGanadoInventario();

  const [tipo, setTipo] = useState<TipoManual>('muerte');
  const [fecha, setFecha] = useState('');
  const [potreroOrigen, setPotreroOrigen] = useState('');
  const [potreroDestino, setPotreroDestino] = useState('');
  const [novillos, setNovillos] = useState('');
  const [toros, setToros] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTipo('muerte');
    setFecha(new Date().toISOString().split('T')[0]);
    setPotreroOrigen('');
    setPotreroDestino('');
    setNovillos('');
    setToros('');
    setNotas('');
  }, [open]);

  const potrerosActivos = useMemo(() => potreros.filter((p) => p.activo), [potreros]);

  const fincaNombre = (fincaId: string) => fincas.find((f) => f.id === fincaId)?.nombre || 'Sin finca';

  const potrerosPorFinca = useMemo(() => {
    const map = new Map<string, GanPotrero[]>();
    potrerosActivos.forEach((p) => {
      if (!map.has(p.finca_id)) map.set(p.finca_id, []);
      map.get(p.finca_id)!.push(p);
    });
    return Array.from(map.entries());
  }, [potrerosActivos]);

  const renderPotreroSelect = (value: string, onChange: (v: string) => void, excluir?: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      <option value="">Seleccionar...</option>
      {potrerosPorFinca.map(([fincaId, ps]) => (
        <optgroup key={fincaId} label={fincaNombre(fincaId)}>
          {ps.filter((p) => p.id !== excluir).map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  const handleSubmit = async () => {
    const nNovillos = Math.round(Number(novillos) || 0);
    const nToros = Math.round(Number(toros) || 0);

    if (!fecha) {
      toast.error('La fecha es requerida');
      return;
    }
    if (tipo !== 'ajuste' && nNovillos + nToros <= 0) {
      toast.error('Debes indicar al menos una cabeza');
      return;
    }
    if (tipo !== 'ajuste' && (nNovillos < 0 || nToros < 0)) {
      toast.error('Las cantidades no pueden ser negativas');
      return;
    }
    if (tipo === 'ajuste' && nNovillos === 0 && nToros === 0) {
      toast.error('El ajuste debe tener un delta distinto de cero');
      return;
    }
    if (tipo === 'ajuste' && !notas.trim()) {
      toast.error('La nota es obligatoria para ajustes');
      return;
    }
    if ((tipo === 'muerte' || tipo === 'traslado') && !potreroOrigen) {
      toast.error('Selecciona el potrero de origen');
      return;
    }
    if (tipo === 'traslado' && !potreroDestino) {
      toast.error('Selecciona el potrero de destino');
      return;
    }
    if (tipo === 'ajuste' && !potreroDestino) {
      toast.error('Selecciona el potrero');
      return;
    }

    setSaving(true);
    try {
      if (tipo === 'muerte') {
        await registrarMuerte({ fecha, potreroId: potreroOrigen, novillos: nNovillos, toros: nToros, notas: notas.trim() || null });
      } else if (tipo === 'traslado') {
        await registrarTraslado({
          fecha,
          potreroOrigenId: potreroOrigen,
          potreroDestinoId: potreroDestino,
          novillos: nNovillos,
          toros: nToros,
          notas: notas.trim() || null,
        });
      } else {
        await registrarAjuste({ fecha, potreroId: potreroDestino, novillosDelta: nNovillos, torosDelta: nToros, notas: notas.trim() });
      }
      toast.success('Movimiento registrado');
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast.error('Error registrando movimiento: ' + message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4 p-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoManual)} className={selectClass}>
                  <option value="muerte">Muerte</option>
                  <option value="traslado">Traslado</option>
                  <option value="ajuste">Ajuste</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha *</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
            </div>

            {tipo === 'muerte' && (
              <div className="space-y-1.5">
                <Label>Potrero *</Label>
                {renderPotreroSelect(potreroOrigen, setPotreroOrigen)}
              </div>
            )}

            {tipo === 'traslado' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Potrero origen *</Label>
                  {renderPotreroSelect(potreroOrigen, setPotreroOrigen, potreroDestino)}
                </div>
                <div className="space-y-1.5">
                  <Label>Potrero destino *</Label>
                  {renderPotreroSelect(potreroDestino, setPotreroDestino, potreroOrigen)}
                </div>
              </div>
            )}

            {tipo === 'ajuste' && (
              <div className="space-y-1.5">
                <Label>Potrero *</Label>
                {renderPotreroSelect(potreroDestino, setPotreroDestino)}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{tipo === 'ajuste' ? 'Delta novillos (+/-)' : 'Novillos'}</Label>
                <Input
                  type="number"
                  min={tipo === 'ajuste' ? undefined : 0}
                  value={novillos}
                  onChange={(e) => setNovillos(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tipo === 'ajuste' ? 'Delta toros (+/-)' : 'Toros'}</Label>
                <Input
                  type="number"
                  min={tipo === 'ajuste' ? undefined : 0}
                  value={toros}
                  onChange={(e) => setToros(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{tipo === 'muerte' ? 'Notas (causa)' : tipo === 'ajuste' ? 'Nota *' : 'Notas'}</Label>
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder={tipo === 'muerte' ? 'Causa de la muerte...' : tipo === 'ajuste' ? 'Razón de la corrección...' : 'Notas adicionales...'}
                rows={2}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Registrar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
