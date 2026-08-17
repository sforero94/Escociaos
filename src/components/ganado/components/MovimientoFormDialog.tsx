import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGanadoInventario } from '../hooks/useGanadoInventario';
import { RepartoPotreros, FILA_REPARTO_VACIA } from './RepartoPotreros';
import type { ExistenciasPotrero } from './RepartoPotreros';
import {
  validarTrasladoMulti,
  validarExistencias,
  filasConCabezas,
  totalNovillosReparto,
  totalTorosReparto,
} from '@/utils/calculosGanado';
import type { RepartoFila } from '@/utils/calculosGanado';
import { formatNumber } from '@/utils/format';
import type { GanFinca, GanPotrero } from '@/types/ganado';
import { obtenerFechaHoy } from '@/utils/fechas';

interface MovimientoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fincas: GanFinca[];
  potreros: GanPotrero[];
  existencias?: Record<string, ExistenciasPotrero>;
  onSuccess: () => void;
}

const selectClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20';

type TipoManual = 'muerte' | 'traslado' | 'ajuste';

/**
 * Registro manual de movimientos: muerte, traslado (N potreros origen →
 * M potreros destino, con los totales cerrando por categoría) y ajuste
 * (delta libre con nota obligatoria).
 */
export function MovimientoFormDialog({ open, onOpenChange, fincas, potreros, existencias, onSuccess }: MovimientoFormDialogProps) {
  const { registrarMuerte, registrarTraslado, registrarAjuste } = useGanadoInventario();

  const [tipo, setTipo] = useState<TipoManual>('muerte');
  const [fecha, setFecha] = useState('');
  const [potreroOrigen, setPotreroOrigen] = useState('');
  const [potreroDestino, setPotreroDestino] = useState('');
  const [novillos, setNovillos] = useState('');
  const [toros, setToros] = useState('');
  const [origenes, setOrigenes] = useState<RepartoFila[]>([{ ...FILA_REPARTO_VACIA }]);
  const [destinos, setDestinos] = useState<RepartoFila[]>([{ ...FILA_REPARTO_VACIA }]);
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTipo('muerte');
    setFecha(obtenerFechaHoy());
    setPotreroOrigen('');
    setPotreroDestino('');
    setNovillos('');
    setToros('');
    setOrigenes([{ ...FILA_REPARTO_VACIA }]);
    setDestinos([{ ...FILA_REPARTO_VACIA }]);
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

  const nombrePotrero = useMemo(() => {
    const map = new Map(potreros.map((p) => [p.id, p.nombre]));
    return (id: string) => map.get(id) || 'El potrero';
  }, [potreros]);

  const renderPotreroSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      <option value="">Seleccionar...</option>
      {potrerosPorFinca.map(([fincaId, ps]) => (
        <optgroup key={fincaId} label={fincaNombre(fincaId)}>
          {ps.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  const salen = { novillos: totalNovillosReparto(filasConCabezas(origenes)), toros: totalTorosReparto(filasConCabezas(origenes)) };
  const entran = { novillos: totalNovillosReparto(filasConCabezas(destinos)), toros: totalTorosReparto(filasConCabezas(destinos)) };
  const trasladoCierra = salen.novillos === entran.novillos && salen.toros === entran.toros && salen.novillos + salen.toros > 0;

  const handleSubmit = async () => {
    if (!fecha) {
      toast.error('La fecha es requerida');
      return;
    }

    if (tipo === 'traslado') {
      const errorTraslado = validarTrasladoMulti({ fecha, origenes, destinos, notas });
      if (errorTraslado) {
        toast.error(errorTraslado);
        return;
      }
      if (existencias) {
        const errorExistencias = validarExistencias(origenes, existencias, nombrePotrero);
        if (errorExistencias) {
          toast.error(errorExistencias);
          return;
        }
      }
    } else {
      const nNovillos = Math.round(Number(novillos) || 0);
      const nToros = Math.round(Number(toros) || 0);

      if (tipo === 'muerte') {
        if (nNovillos + nToros <= 0) {
          toast.error('Debes indicar al menos una cabeza');
          return;
        }
        if (nNovillos < 0 || nToros < 0) {
          toast.error('Las cantidades no pueden ser negativas');
          return;
        }
        if (!potreroOrigen) {
          toast.error('Selecciona el potrero de origen');
          return;
        }
      } else {
        if (nNovillos === 0 && nToros === 0) {
          toast.error('El ajuste debe tener un delta distinto de cero');
          return;
        }
        if (!notas.trim()) {
          toast.error('La nota es obligatoria para ajustes');
          return;
        }
        if (!potreroDestino) {
          toast.error('Selecciona el potrero');
          return;
        }
      }
    }

    setSaving(true);
    try {
      const nNovillos = Math.round(Number(novillos) || 0);
      const nToros = Math.round(Number(toros) || 0);

      if (tipo === 'muerte') {
        await registrarMuerte({ fecha, potreroId: potreroOrigen, novillos: nNovillos, toros: nToros, notas: notas.trim() || null });
      } else if (tipo === 'traslado') {
        await registrarTraslado({ fecha, origenes, destinos, notas: notas.trim() || null });
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
      <DialogContent size={tipo === 'traslado' ? 'lg' : 'md'}>
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
              <>
                <RepartoPotreros
                  label="Salen de *"
                  filas={origenes}
                  onChange={setOrigenes}
                  fincas={fincas}
                  potreros={potreros}
                  existencias={existencias}
                  potrerosExcluidos={filasConCabezas(destinos).map((f) => f.potrero_id)}
                  disabled={saving}
                />
                <RepartoPotreros
                  label="Entran a *"
                  filas={destinos}
                  onChange={setDestinos}
                  fincas={fincas}
                  potreros={potreros}
                  potrerosExcluidos={filasConCabezas(origenes).map((f) => f.potrero_id)}
                  disabled={saving}
                />
                <div
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    trasladoCierra
                      ? 'border-primary/30 bg-primary/5 text-primary'
                      : 'border-amber-300 bg-amber-50 text-amber-800'
                  }`}
                >
                  Salen {formatNumber(salen.novillos)} novillos y {formatNumber(salen.toros)} toros ·
                  {' '}Entran {formatNumber(entran.novillos)} novillos y {formatNumber(entran.toros)} toros
                </div>
              </>
            )}

            {tipo === 'ajuste' && (
              <div className="space-y-1.5">
                <Label>Potrero *</Label>
                {renderPotreroSelect(potreroDestino, setPotreroDestino)}
              </div>
            )}

            {tipo !== 'traslado' && (
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
            )}

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
            <Button onClick={handleSubmit} disabled={saving || (tipo === 'traslado' && !trasladoCierra)}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Registrar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
