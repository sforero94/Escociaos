import { useState, useEffect, useMemo, Fragment } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGanadoInventario } from '../hooks/useGanadoInventario';
import { EtapaChip } from './ChipsEtapa';
import type { AjusteMasivoFila } from '@/utils/calculosGanado';
import type { InventarioPotreroRow } from '@/types/ganado';

interface AjusteMasivoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: InventarioPotreroRow[];
  onSuccess: () => void;
}

interface GrupoLote {
  lote: string;
  potreros: InventarioPotreroRow[];
}

interface GrupoFinca {
  finca_id: string;
  finca: string;
  lotes: GrupoLote[];
}

/** Agrupa las filas planas por finca › lote, preservando el orden de llegada (§6.6). */
function agruparPorFincaYLote(rows: InventarioPotreroRow[]): GrupoFinca[] {
  const porFinca = new Map<string, { finca: string; lotes: Map<string, GrupoLote> }>();
  rows.forEach((r) => {
    if (!porFinca.has(r.finca_id)) porFinca.set(r.finca_id, { finca: r.finca, lotes: new Map() });
    const grupoFinca = porFinca.get(r.finca_id)!;
    const claveLote = r.lote_id ?? 'sin-lote';
    if (!grupoFinca.lotes.has(claveLote)) {
      grupoFinca.lotes.set(claveLote, { lote: r.lote ?? 'Sin lote', potreros: [] });
    }
    grupoFinca.lotes.get(claveLote)!.potreros.push(r);
  });
  return Array.from(porFinca.entries()).map(([finca_id, g]) => ({
    finca_id,
    finca: g.finca,
    lotes: Array.from(g.lotes.values()),
  }));
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

  const grupos = useMemo(() => agruparPorFincaYLote(rows), [rows]);

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
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-green-600 text-white">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Lote / Potrero</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Etapa</th>
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
                    grupos.map((grupoFinca) => (
                      <Fragment key={`finca-${grupoFinca.finca_id}`}>
                        <tr className="bg-primary/10 border-t border-primary/10">
                          <td colSpan={4} className="px-3 py-1.5 font-semibold text-foreground text-xs uppercase tracking-wide">
                            {grupoFinca.finca}
                          </td>
                        </tr>
                        {grupoFinca.lotes.map((grupoLote) => (
                          <Fragment key={`lote-${grupoFinca.finca_id}-${grupoLote.lote}`}>
                            <tr className="bg-gray-50/80 border-t border-primary/5">
                              <td className="px-3 py-1.5 pl-6 font-medium text-brand-brown/70 text-xs">{grupoLote.lote}</td>
                              <td colSpan={3} />
                            </tr>
                            {grupoLote.potreros.map((r, i) => {
                              const v = valores[r.potrero_id] || { novillos: '', toros: '' };
                              const modificado = Number(v.novillos) !== r.novillos || Number(v.toros) !== r.toros;
                              return (
                                <tr
                                  key={r.potrero_id}
                                  className={`border-t border-primary/5 ${modificado ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                                >
                                  <td className="px-3 py-2 pl-10 whitespace-nowrap font-medium">{r.potrero}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <EtapaChip etapa={r.etapa ?? 'sin_clasificar'} />
                                  </td>
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
                            })}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
              </div>
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
