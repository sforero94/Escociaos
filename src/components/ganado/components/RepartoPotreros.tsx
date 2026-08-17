import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { formatNumber } from '@/utils/format';
import type { RepartoFila } from '@/utils/calculosGanado';
import type { GanFinca, GanLote, GanPotrero } from '@/types/ganado';
import { ETIQUETA_ETAPA } from '@/types/ganado';

const selectClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20';

export interface ExistenciasPotrero {
  novillos: number;
  toros: number;
}

interface RepartoPotrerosProps {
  label: string;
  filas: RepartoFila[];
  onChange: (filas: RepartoFila[]) => void;
  fincas: GanFinca[];
  potreros: GanPotrero[];
  /** Lotes de las fincas — agrupa los <optgroup> por finca › lote en vez de solo finca. */
  lotes?: GanLote[];
  /** Inventario actual por potrero: muestra las cabezas disponibles al sacar. */
  existencias?: Record<string, ExistenciasPotrero>;
  /** Potreros usados por el otro lado de un traslado (no se pueden repetir). */
  potrerosExcluidos?: string[];
  disabled?: boolean;
}

export const FILA_REPARTO_VACIA: RepartoFila = { potrero_id: '', novillos: 0, toros: 0 };

/**
 * Lista editable de "potrero + novillos + toros". Es el reparto de un lote de
 * ganado entre varios potreros: una compra rara vez cae completa en uno solo.
 * No valida totales — de eso se encargan los validadores de calculosGanado.
 */
export function RepartoPotreros({
  label,
  filas,
  onChange,
  fincas,
  potreros,
  lotes = [],
  existencias,
  potrerosExcluidos = [],
  disabled,
}: RepartoPotrerosProps) {
  const fincaNombre = (fincaId: string) => fincas.find((f) => f.id === fincaId)?.nombre || 'Sin finca';
  const loteNombre = (loteId: string | null | undefined) =>
    loteId ? lotes.find((l) => l.id === loteId)?.nombre ?? null : null;

  // <optgroup> por finca › lote (§6.6): un potrero sin lote_id cae en el
  // grupo "Sin lote" de su finca. El orden de grupos sigue el orden de
  // aparición de los potreros activos (ya vienen ordenados por nombre).
  const gruposFincaLote = useMemo(() => {
    const grupos = new Map<string, { etiqueta: string; potreros: GanPotrero[] }>();
    potreros
      .filter((p) => p.activo)
      .forEach((p) => {
        const clave = `${p.finca_id}::${p.lote_id ?? 'sin-lote'}`;
        if (!grupos.has(clave)) {
          grupos.set(clave, {
            etiqueta: `${fincaNombre(p.finca_id)} › ${loteNombre(p.lote_id) ?? 'Sin lote'}`,
            potreros: [],
          });
        }
        grupos.get(clave)!.potreros.push(p);
      });
    return Array.from(grupos.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [potreros, fincas, lotes]);

  const etapaDe = (p: GanPotrero) => (p.etapa ? ETIQUETA_ETAPA[p.etapa] : null);

  const actualizar = (index: number, cambios: Partial<RepartoFila>) => {
    onChange(filas.map((f, i) => (i === index ? { ...f, ...cambios } : f)));
  };

  const eliminar = (index: number) => {
    const restantes = filas.filter((_, i) => i !== index);
    onChange(restantes.length > 0 ? restantes : [{ ...FILA_REPARTO_VACIA }]);
  };

  const agregar = () => onChange([...filas, { ...FILA_REPARTO_VACIA }]);

  // Un potrero ya usado en otra fila (o en el otro lado del traslado) no se
  // vuelve a ofrecer, salvo en la fila que lo tiene seleccionado.
  const ocupados = (index: number) =>
    new Set([
      ...filas.filter((_, i) => i !== index).map((f) => f.potrero_id),
      ...potrerosExcluidos,
    ]);

  const numeroONulo = (valor: string) => (valor === '' ? 0 : Math.max(0, Math.round(Number(valor) || 0)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button type="button" variant="outline" size="sm" onClick={agregar} disabled={disabled}>
          <Plus className="w-4 h-4 mr-1" />
          Agregar potrero
        </Button>
      </div>

      <div className="space-y-2">
        {filas.map((fila, index) => {
          const usados = ocupados(index);
          const inv = existencias?.[fila.potrero_id];
          const excedeNovillos = !!inv && fila.novillos > inv.novillos;
          const excedeToros = !!inv && fila.toros > inv.toros;

          return (
            <div key={index} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
              <div className="flex items-start gap-2">
                <select
                  value={fila.potrero_id}
                  onChange={(e) => actualizar(index, { potrero_id: e.target.value })}
                  className={selectClass}
                  disabled={disabled}
                  aria-label={`Potrero ${index + 1}`}
                >
                  <option value="">Seleccionar potrero...</option>
                  {gruposFincaLote.map((grupo) => {
                    const disponibles = grupo.potreros.filter((p) => !usados.has(p.id));
                    if (disponibles.length === 0) return null;
                    return (
                      <optgroup key={grupo.etiqueta} label={grupo.etiqueta}>
                        {disponibles.map((p) => {
                          const etapa = etapaDe(p);
                          return (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                              {etapa ? ` · ${etapa}` : ''}
                            </option>
                          );
                        })}
                      </optgroup>
                    );
                  })}
                </select>
                {filas.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => eliminar(index)}
                    disabled={disabled}
                    title="Quitar potrero"
                    aria-label="Quitar potrero"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs text-brand-brown/60">Novillos</span>
                  <Input
                    type="number"
                    min={0}
                    value={fila.novillos === 0 ? '' : String(fila.novillos)}
                    onChange={(e) => actualizar(index, { novillos: numeroONulo(e.target.value) })}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    disabled={disabled}
                    aria-label={`Novillos potrero ${index + 1}`}
                    className={excedeNovillos ? 'border-red-400 focus-visible:ring-red-200' : undefined}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-brand-brown/60">Toros</span>
                  <Input
                    type="number"
                    min={0}
                    value={fila.toros === 0 ? '' : String(fila.toros)}
                    onChange={(e) => actualizar(index, { toros: numeroONulo(e.target.value) })}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    disabled={disabled}
                    aria-label={`Toros potrero ${index + 1}`}
                    className={excedeToros ? 'border-red-400 focus-visible:ring-red-200' : undefined}
                  />
                </div>
              </div>

              {inv && (
                <p className={`text-xs ${excedeNovillos || excedeToros ? 'text-red-600' : 'text-brand-brown/50'}`}>
                  Disponible: {formatNumber(inv.novillos)} novillos · {formatNumber(inv.toros)} toros
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
