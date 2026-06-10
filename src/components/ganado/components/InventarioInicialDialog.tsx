import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useGanadoInventario } from '../hooks/useGanadoInventario';
import { validarCargaInicial } from '@/utils/calculosGanado';
import type { CargaInicialFila } from '@/utils/calculosGanado';
import { formatNumber } from '@/utils/format';
import type { GanFinca, GanUbicacion, InventarioPotreroRow } from '@/types/ganado';

interface InventarioInicialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fincas: GanFinca[];
  ubicaciones: GanUbicacion[];
  rows: InventarioPotreroRow[];
  onSuccess: () => void;
}

/**
 * Carga del inventario inicial por finca: el usuario digita novillos y
 * toros por finca sin necesidad de tener potreros configurados. Las
 * cabezas entran como ajustes confirmados al potrero "General" de cada
 * finca (creado automáticamente), trazables en el log de movimientos.
 */
export function InventarioInicialDialog({ open, onOpenChange, fincas, ubicaciones, rows, onSuccess }: InventarioInicialDialogProps) {
  const { cargarInventarioInicial } = useGanadoInventario();
  const [valores, setValores] = useState<Record<string, { novillos: string; toros: string }>>({});
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);

  const fincasActivas = useMemo(() => fincas.filter((f) => f.activa), [fincas]);

  // Cabezas actuales por finca, para advertir posibles dobles conteos
  const actualPorFinca = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.finca_id, (map.get(r.finca_id) || 0) + r.novillos + r.toros));
    return map;
  }, [rows]);

  useEffect(() => {
    if (!open) return;
    const inicial: Record<string, { novillos: string; toros: string }> = {};
    fincasActivas.forEach((f) => {
      inicial[f.id] = { novillos: '', toros: '' };
    });
    setValores(inicial);
    setNota('Inventario inicial');
  }, [open, fincasActivas]);

  const update = (fincaId: string, campo: 'novillos' | 'toros', valor: string) => {
    setValores((prev) => ({ ...prev, [fincaId]: { ...prev[fincaId], [campo]: valor } }));
  };

  const filas = useMemo<CargaInicialFila[]>(
    () =>
      fincasActivas.map((f) => {
        const v = valores[f.id] || { novillos: '', toros: '' };
        return {
          finca_id: f.id,
          novillos: v.novillos === '' ? 0 : Number(v.novillos),
          toros: v.toros === '' ? 0 : Number(v.toros),
        };
      }),
    [fincasActivas, valores]
  );

  const totalCabezas = filas.reduce((s, f) => s + (f.novillos || 0) + (f.toros || 0), 0);

  const ubicacionNombre = (f: GanFinca) =>
    ubicaciones.find((u) => u.id === f.ubicacion_id)?.nombre || 'Sin ubicación';

  const handleSubmit = async () => {
    const error = validarCargaInicial(filas, nota);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      const n = await cargarInventarioInicial(filas, nota.trim());
      toast.success(`Inventario inicial cargado en ${n} ${n === 1 ? 'finca' : 'fincas'}`);
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error cargando inventario: ' + message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Cargar inventario inicial</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <p className="text-sm text-brand-brown/70">
              Digita las cabezas actuales por finca. Entran al potrero <strong>"General"</strong> de
              cada finca (se crea automáticamente); luego puedes repartirlas entre potreros con traslados.
            </p>
            <div className="rounded-xl border border-primary/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-green-600 text-white">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Finca</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Ubicación</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide">Ha</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide">Actual</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide">Novillos</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide">Toros</th>
                  </tr>
                </thead>
                <tbody>
                  {fincasActivas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-brand-brown/50">
                        Sin fincas activas. Créalas en Configuración → Ganado.
                      </td>
                    </tr>
                  ) : (
                    fincasActivas.map((f, i) => {
                      const v = valores[f.id] || { novillos: '', toros: '' };
                      const actual = actualPorFinca.get(f.id) || 0;
                      const conCarga = (Number(v.novillos) || 0) + (Number(v.toros) || 0) > 0;
                      return (
                        <tr key={f.id} className={`border-t border-primary/5 ${conCarga ? 'bg-green-50/60' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <td className="px-3 py-2 whitespace-nowrap font-medium">{f.nombre}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-brand-brown/70">{ubicacionNombre(f)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap text-brand-brown/70">{formatNumber(f.hectareas, 1)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {actual > 0 && conCarga ? (
                              <span className="inline-flex items-center gap-1 text-amber-700" title="Esta finca ya tiene cabezas registradas — la carga se SUMA al inventario existente">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {formatNumber(actual)}
                              </span>
                            ) : (
                              formatNumber(actual)
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              value={v.novillos}
                              onChange={(e) => update(f.id, 'novillos', e.target.value)}
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="0"
                              className="w-20 text-right ml-auto"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              value={v.toros}
                              onChange={(e) => update(f.id, 'toros', e.target.value)}
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="0"
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
              <Label>Nota *</Label>
              <Textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej. Inventario inicial — conteo de junio 2026"
                rows={2}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-brand-brown/60">
              {totalCabezas === 0 ? 'Sin cabezas por cargar' : `${formatNumber(totalCabezas)} ${totalCabezas === 1 ? 'cabeza' : 'cabezas'} en total`}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving || totalCabezas === 0}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Cargar inventario
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
