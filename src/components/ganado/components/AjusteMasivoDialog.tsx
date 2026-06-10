import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGanadoInventario } from '../hooks/useGanadoInventario';
import type { AjusteMasivoFila } from '@/utils/calculosGanado';
import type { InventarioPotreroRow } from '@/types/ganado';

interface AjusteMasivoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: InventarioPotreroRow[];
  onSuccess: () => void;
}

/**
 * Modo ajuste masivo: tabla editable con todos los potreros activos.
 * Un solo submit genera movimientos de tipo `ajuste` por cada fila
 * modificada, con una nota global obligatoria.
 */
export function AjusteMasivoDialog({ open, onOpenChange, rows, onSuccess }: AjusteMasivoDialogProps) {
  const { ajusteMasivo } = useGanadoInventario();
  const [valores, setValores] = useState<Record<string, { novillos: string; toros: string }>>({});
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const inicial: Record<string, { novillos: string; toros: string }> = {};
    rows.forEach((r) => {
      inicial[r.potrero_id] = { novillos: String(r.novillos), toros: String(r.toros) };
    });
    setValores(inicial);
    setNota('');
  }, [open, rows]);

  const cambios = useMemo(() => {
    return rows.filter((r) => {
      const v = valores[r.potrero_id];
      if (!v) return false;
      return Number(v.novillos) !== r.novillos || Number(v.toros) !== r.toros;
    }).length;
  }, [rows, valores]);

  const update = (potreroId: string, campo: 'novillos' | 'toros', valor: string) => {
    setValores((prev) => ({ ...prev, [potreroId]: { ...prev[potreroId], [campo]: valor } }));
  };

  const handleSubmit = async () => {
    if (!nota.trim()) {
      toast.error('La nota de la sesión de ajuste es obligatoria');
      return;
    }
    const filas: AjusteMasivoFila[] = rows.map((r) => {
      const v = valores[r.potrero_id] || { novillos: String(r.novillos), toros: String(r.toros) };
      return {
        potrero_id: r.potrero_id,
        novillosActual: r.novillos,
        torosActual: r.toros,
        novillosNuevo: Math.max(0, Math.round(Number(v.novillos) || 0)),
        torosNuevo: Math.max(0, Math.round(Number(v.toros) || 0)),
      };
    });

    setSaving(true);
    try {
      const n = await ajusteMasivo(filas, nota.trim());
      if (n === 0) {
        toast.info('No hay cambios para guardar');
      } else {
        toast.success(`${n} ${n === 1 ? 'ajuste registrado' : 'ajustes registrados'}`);
        onSuccess();
        onOpenChange(false);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast.error('Error registrando ajustes: ' + message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Ajuste masivo de inventario</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <p className="text-sm text-brand-brown/70">
              Edita los conteos por potrero. Solo las filas modificadas generan un movimiento de ajuste.
            </p>
            <div className="rounded-xl border border-primary/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-green-600 text-white">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Potrero</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Finca</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide">Novillos</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide">Toros</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm text-brand-brown/50">
                        Sin potreros activos
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => {
                      const v = valores[r.potrero_id] || { novillos: '', toros: '' };
                      const modificado = Number(v.novillos) !== r.novillos || Number(v.toros) !== r.toros;
                      return (
                        <tr key={r.potrero_id} className={`border-t border-primary/5 ${modificado ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <td className="px-3 py-2 whitespace-nowrap font-medium">{r.potrero}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-brand-brown/70">{r.finca}</td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              value={v.novillos}
                              onChange={(e) => update(r.potrero_id, 'novillos', e.target.value)}
                              onWheel={(e) => e.currentTarget.blur()}
                              className="w-20 text-right ml-auto"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              value={v.toros}
                              onChange={(e) => update(r.potrero_id, 'toros', e.target.value)}
                              onWheel={(e) => e.currentTarget.blur()}
                              className="w-20 text-right ml-auto"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="space-y-1.5">
              <Label>Nota de la sesión de ajuste *</Label>
              <Textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej. Conteo físico del 10 de junio..."
                rows={2}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-brand-brown/60">
              {cambios === 0 ? 'Sin cambios' : `${cambios} ${cambios === 1 ? 'potrero modificado' : 'potreros modificados'}`}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving || cambios === 0}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar ajustes
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
