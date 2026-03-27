import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '../../utils/supabase/client';
import type { Lote } from '../../types/shared';
import type { LecturaCE } from '../../types/monitoreo';
import { useFormDraft } from '@/hooks/useFormDraft';
import { FormDraftBanner } from '@/components/shared/FormDraftBanner';

interface RegistroConductividadProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RegistroConductividad({ open, onClose, onSuccess }: RegistroConductividadProps) {
  const supabase = getSupabase();

  const [lotes, setLotes] = useState<Lote[]>([]);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [loteId, setLoteId] = useState('');
  const [numArboles, setNumArboles] = useState(30);
  const [lecturas, setLecturas] = useState<LecturaCE[]>([]);
  // Raw string values for inputs — allows typing "0.", ".5", etc.
  const [inputStrings, setInputStrings] = useState<Record<string, string>>({});
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [mostrarPaste, setMostrarPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const draft = useFormDraft('conductividad-new-v1', { fecha, loteId, numArboles, lecturas, inputStrings, observaciones }, { debounceMs: 1500 });

  const handleRestoreDraft = useCallback(() => {
    if (draft.draftData) {
      setFecha(draft.draftData.fecha);
      setLoteId(draft.draftData.loteId);
      setNumArboles(draft.draftData.numArboles);
      setLecturas(draft.draftData.lecturas);
      setInputStrings(draft.draftData.inputStrings);
      setObservaciones(draft.draftData.observaciones);
      draft.acceptDraft();
    }
  }, [draft]);

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    if (open) {
      cargarLotes();
      inicializarLecturas(numArboles);
    }
  }, [open]);

  useEffect(() => {
    inicializarLecturas(numArboles);
  }, [numArboles]);

  function inicializarLecturas(n: number) {
    setLecturas(prev => {
      const result: LecturaCE[] = [];
      for (let i = 1; i <= n; i++) {
        const existing = prev.find(l => l.arbol === i);
        result.push(existing || { arbol: i, alta: null, baja: null });
      }
      return result;
    });
  }

  async function cargarLotes() {
    const { data } = await supabase
      .from('lotes')
      .select('id, nombre')
      .eq('activo', true)
      .order('numero_orden', { ascending: true });
    setLotes(data || []);
  }

  function handleInputChange(arbol: number, campo: 'alta' | 'baja', valor: string) {
    // Allow empty, digits, dots, commas — intermediate typing states
    const cleaned = valor.replace(',', '.');
    if (cleaned !== '' && !/^-?\d*\.?\d*$/.test(cleaned)) return;
    setInputStrings(prev => ({ ...prev, [`${arbol}-${campo}`]: cleaned }));
  }

  function handleInputBlur(arbol: number, campo: 'alta' | 'baja') {
    const key = `${arbol}-${campo}`;
    const raw = inputStrings[key];
    if (raw === undefined) return;
    const parsed = raw === '' ? null : parseFloat(raw);
    const final = parsed !== null && isNaN(parsed) ? null : parsed;
    setLecturas(prev => prev.map(l =>
      l.arbol === arbol ? { ...l, [campo]: final } : l
    ));
    // Clean up raw string — let the display come from lecturas state
    setInputStrings(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function getInputValue(arbol: number, campo: 'alta' | 'baja', storedValue: number | null): string {
    const key = `${arbol}-${campo}`;
    if (key in inputStrings) return inputStrings[key];
    return storedValue != null ? String(storedValue) : '';
  }

  function aplicarDatosPegados(texto: string) {
    const lineas = texto.trim().split('\n').filter(l => l.trim());
    if (lineas.length === 0) {
      toast.error('No se encontraron datos para pegar');
      return;
    }

    const nuevasLecturas = [...lecturas];
    let aplicados = 0;

    for (let i = 0; i < lineas.length; i++) {
      const arbol = i + 1;
      if (arbol > numArboles) break;

      // Split by tab, semicolon, or multiple spaces
      const celdas = lineas[i].split(/[\t;]|  +/).map(c => c.trim().replace(',', '.'));

      const idx = nuevasLecturas.findIndex(l => l.arbol === arbol);
      if (idx === -1) continue;

      const altaVal = celdas[0] ? parseFloat(celdas[0]) : null;
      const bajaVal = celdas[1] ? parseFloat(celdas[1]) : null;

      nuevasLecturas[idx] = {
        ...nuevasLecturas[idx],
        alta: altaVal !== null && !isNaN(altaVal) ? altaVal : nuevasLecturas[idx].alta,
        baja: bajaVal !== null && !isNaN(bajaVal) ? bajaVal : nuevasLecturas[idx].baja,
      };
      aplicados++;
    }

    setLecturas(nuevasLecturas);
    setInputStrings({});
    setMostrarPaste(false);
    setPasteText('');
    toast.success(`${aplicados} filas pegadas`);
  }

  function handleCellPaste(e: React.ClipboardEvent<HTMLInputElement>, arbol: number, campo: 'alta' | 'baja') {
    const text = e.clipboardData.getData('text');
    // If pasting multi-line or multi-column data, intercept and fill the table
    if (text.includes('\n') || text.includes('\t')) {
      e.preventDefault();
      const lineas = text.trim().split('\n').filter(l => l.trim());
      const nuevasLecturas = [...lecturas];

      for (let i = 0; i < lineas.length; i++) {
        const targetArbol = arbol + i;
        if (targetArbol > numArboles) break;

        const celdas = lineas[i].split(/[\t;]|  +/).map(c => c.trim().replace(',', '.'));
        const idx = nuevasLecturas.findIndex(l => l.arbol === targetArbol);
        if (idx === -1) continue;

        // Determine starting column based on which cell was focused
        if (campo === 'alta') {
          const altaVal = celdas[0] ? parseFloat(celdas[0]) : null;
          const bajaVal = celdas[1] ? parseFloat(celdas[1]) : null;
          if (altaVal !== null && !isNaN(altaVal)) nuevasLecturas[idx].alta = altaVal;
          if (bajaVal !== null && !isNaN(bajaVal)) nuevasLecturas[idx].baja = bajaVal;
        } else {
          const bajaVal = celdas[0] ? parseFloat(celdas[0]) : null;
          if (bajaVal !== null && !isNaN(bajaVal)) nuevasLecturas[idx].baja = bajaVal;
        }
      }

      setLecturas(nuevasLecturas);
      setInputStrings({});
      toast.success(`${lineas.length} filas pegadas`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, arbol: number, campo: 'alta' | 'baja') {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      // Trigger blur to parse current value before moving
      (e.target as HTMLInputElement).blur();
      // Alta → Baja → next tree Alta
      if (campo === 'alta') {
        setTimeout(() => inputRefs.current.get(`${arbol}-baja`)?.focus(), 0);
      } else {
        if (arbol < numArboles) {
          setTimeout(() => inputRefs.current.get(`${arbol + 1}-alta`)?.focus(), 0);
        }
      }
    }
  }

  function setRef(arbol: number, campo: 'alta' | 'baja', el: HTMLInputElement | null) {
    if (el) {
      inputRefs.current.set(`${arbol}-${campo}`, el);
    }
  }

  // Computed averages
  const lecturasConAlta = lecturas.filter(l => l.alta != null);
  const lecturasConBaja = lecturas.filter(l => l.baja != null);
  const promAlta = lecturasConAlta.length > 0
    ? lecturasConAlta.reduce((s, l) => s + (l.alta || 0), 0) / lecturasConAlta.length
    : 0;
  const promBaja = lecturasConBaja.length > 0
    ? lecturasConBaja.reduce((s, l) => s + (l.baja || 0), 0) / lecturasConBaja.length
    : 0;
  const todasLasLecturas = lecturas.flatMap(l => [l.alta, l.baja].filter(v => v != null)) as number[];
  const promGeneral = todasLasLecturas.length > 0
    ? todasLasLecturas.reduce((s, v) => s + v, 0) / todasLasLecturas.length
    : 0;
  const completados = lecturas.filter(l => l.alta != null && l.baja != null).length;

  async function guardar() {
    if (!loteId) {
      toast.error('Selecciona un lote');
      return;
    }
    if (todasLasLecturas.length === 0) {
      toast.error('Ingresa al menos una lectura');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('mon_conductividad').insert({
        fecha_monitoreo: fecha,
        lote_id: loteId,
        valor_ce: +promGeneral.toFixed(2),
        lecturas: lecturas.filter(l => l.alta != null || l.baja != null),
        num_arboles: numArboles,
        observaciones: observaciones || null,
      });

      if (error) throw error;

      toast.success(`CE guardada — ${completados}/${numArboles} árboles, promedio ${promGeneral.toFixed(2)} dS/m`);
      draft.clearDraft();
      limpiar();
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function limpiar() {
    setLoteId('');
    setObservaciones('');
    setFecha(new Date().toISOString().split('T')[0]);
    setNumArboles(30);
    setLecturas([]);
    setInputStrings({});
    setMostrarPaste(false);
    setPasteText('');
  }

  function handleClose() {
    limpiar();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="lg" className="p-0">
        {/* HEADER — sticky */}
        <div className="px-6 pt-6 pb-3 border-b bg-white sticky top-0 z-10">
          <DialogHeader>
            <DialogTitle>Conductividad Eléctrica</DialogTitle>
          </DialogHeader>

          <FormDraftBanner
            variant="available"
            show={draft.hasDraft}
            onRestore={handleRestoreDraft}
            onDiscard={draft.discardDraft}
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Lote *</Label>
              <Select value={loteId} onValueChange={setLoteId}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {lotes.map(l => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs"># Árboles</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={numArboles}
                onChange={(e) => setNumArboles(parseInt(e.target.value) || 30)}
                onWheel={(e) => e.currentTarget.blur()}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-sm text-brand-brown/60">{completados}/{numArboles}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => setMostrarPaste(!mostrarPaste)}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Pegar
              </Button>
            </div>
          </div>

          {mostrarPaste && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-brand-brown/60">
                Pega datos desde Excel: 2 columnas (Alta, Baja), una fila por árbol. Separados por tab, ; o espacios.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onPaste={(e) => {
                  // Let the paste happen into the textarea, then process on next tick
                  setTimeout(() => {
                    const val = (e.target as HTMLTextAreaElement).value;
                    if (val.trim()) aplicarDatosPegados(val);
                  }, 0);
                }}
                placeholder="Selecciona las celdas en Excel y pega aquí (Ctrl+V / Cmd+V)"
                className="w-full h-20 text-xs p-2 border rounded font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => { setMostrarPaste(false); setPasteText(''); }}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={() => aplicarDatosPegados(pasteText)}
                  disabled={!pasteText.trim()}
                >
                  Aplicar datos
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* GRID — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-[5]">
              <tr className="border-b text-brand-brown/60">
                <th className="py-1.5 pr-2 text-left w-10 text-xs">#</th>
                <th className="py-1.5 px-1 text-center text-xs">Alta</th>
                <th className="py-1.5 px-1 text-center text-xs">Baja</th>
                <th className="py-1.5 pl-2 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {lecturas.map((l, i) => {
                const completo = l.alta != null && l.baja != null;
                return (
                  <tr key={l.arbol} className={i % 2 === 0 ? '' : 'bg-muted/30'}>
                    <td className="py-0.5 pr-2 text-xs text-brand-brown/50 font-medium">{l.arbol}</td>
                    <td className="py-0.5 px-1">
                      <input
                        ref={(el) => setRef(l.arbol, 'alta', el)}
                        type="text"
                        inputMode="decimal"
                        value={getInputValue(l.arbol, 'alta', l.alta)}
                        onChange={(e) => handleInputChange(l.arbol, 'alta', e.target.value)}
                        onBlur={() => handleInputBlur(l.arbol, 'alta')}
                        onKeyDown={(e) => handleKeyDown(e, l.arbol, 'alta')}
                        onPaste={(e) => handleCellPaste(e, l.arbol, 'alta')}
                        onFocus={(e) => e.target.select()}
                        className="w-full h-7 px-2 text-center text-sm border border-secondary/30 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary bg-white"
                        placeholder="—"
                      />
                    </td>
                    <td className="py-0.5 px-1">
                      <input
                        ref={(el) => setRef(l.arbol, 'baja', el)}
                        type="text"
                        inputMode="decimal"
                        value={getInputValue(l.arbol, 'baja', l.baja)}
                        onChange={(e) => handleInputChange(l.arbol, 'baja', e.target.value)}
                        onBlur={() => handleInputBlur(l.arbol, 'baja')}
                        onKeyDown={(e) => handleKeyDown(e, l.arbol, 'baja')}
                        onPaste={(e) => handleCellPaste(e, l.arbol, 'baja')}
                        onFocus={(e) => e.target.select()}
                        className="w-full h-7 px-2 text-center text-sm border border-secondary/30 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary bg-white"
                        placeholder="—"
                      />
                    </td>
                    <td className="py-0.5 pl-2 text-center">
                      {completo && <span className="text-green-600 text-xs">✓</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* FOOTER — sticky */}
        <div className="px-6 py-3 border-t bg-white sticky bottom-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-4 text-xs text-brand-brown/70">
              <span>Prom. Alta: <strong className="text-foreground">{promAlta > 0 ? promAlta.toFixed(2) : '—'}</strong></span>
              <span>Prom. Baja: <strong className="text-foreground">{promBaja > 0 ? promBaja.toFixed(2) : '—'}</strong></span>
              <span>Prom. General: <strong className="text-foreground text-sm">{promGeneral > 0 ? promGeneral.toFixed(2) : '—'}</strong> dS/m</span>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose} disabled={loading} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={loading} className="flex-1 bg-primary hover:bg-primary-dark">
              {loading ? 'Guardando...' : `Guardar (${completados}/${numArboles})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
