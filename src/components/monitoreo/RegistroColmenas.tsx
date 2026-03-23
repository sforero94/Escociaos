import { useState, useEffect } from 'react';
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
import { toast } from 'sonner';
import { getSupabase } from '../../utils/supabase/client';
import { AlertTriangle } from 'lucide-react';
import type { Apiario } from '../../types/monitoreo';

interface RegistroColmenasProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RegistroColmenas({ open, onClose, onSuccess }: RegistroColmenasProps) {
  const supabase = getSupabase();

  const [apiarios, setApiarios] = useState<Apiario[]>([]);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [apiarioId, setApiarioId] = useState('');
  const [fuertes, setFuertes] = useState(0);
  const [debiles, setDebiles] = useState(0);
  const [muertas, setMuertas] = useState(0);
  const [conReina, setConReina] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) cargarApiarios();
  }, [open]);

  async function cargarApiarios() {
    const { data } = await supabase
      .from('apiarios')
      .select('*')
      .eq('activo', true)
      .order('nombre');
    setApiarios(data || []);
  }

  const apiarioSeleccionado = apiarios.find(a => a.id === apiarioId);
  const totalReportado = fuertes + debiles + muertas;
  const totalApiario = apiarioSeleccionado?.total_colmenas ?? 0;
  const discrepancia = apiarioId && totalApiario > 0 && totalReportado !== totalApiario;

  async function guardar() {
    if (!apiarioId) {
      toast.error('Selecciona un apiario');
      return;
    }
    if (totalReportado === 0) {
      toast.error('Ingresa al menos un conteo');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('mon_colmenas').insert({
        fecha_monitoreo: fecha,
        apiario_id: apiarioId,
        colmenas_fuertes: fuertes,
        colmenas_debiles: debiles,
        colmenas_muertas: muertas,
        colmenas_con_reina: conReina,
        observaciones: observaciones || null,
      });
      if (error) throw error;

      toast.success('Registro de colmenas guardado');
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
    setApiarioId('');
    setFuertes(0);
    setDebiles(0);
    setMuertas(0);
    setConReina(0);
    setObservaciones('');
    setFecha(new Date().toISOString().split('T')[0]);
  }

  function handleClose() {
    limpiar();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Monitoreo de Colmenas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Fecha</Label>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Apiario *</Label>
            <Select value={apiarioId} onValueChange={setApiarioId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleccionar apiario" />
              </SelectTrigger>
              <SelectContent>
                {apiarios.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nombre} ({a.total_colmenas} colmenas)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-green-700">Fuertes</Label>
              <Input
                type="number"
                min="0"
                value={fuertes}
                onChange={(e) => setFuertes(parseInt(e.target.value) || 0)}
                onWheel={(e) => e.currentTarget.blur()}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-yellow-700">Débiles</Label>
              <Input
                type="number"
                min="0"
                value={debiles}
                onChange={(e) => setDebiles(parseInt(e.target.value) || 0)}
                onWheel={(e) => e.currentTarget.blur()}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-red-700">Muertas</Label>
              <Input
                type="number"
                min="0"
                value={muertas}
                onChange={(e) => setMuertas(parseInt(e.target.value) || 0)}
                onWheel={(e) => e.currentTarget.blur()}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-blue-700">Con reina</Label>
              <Input
                type="number"
                min="0"
                value={conReina}
                onChange={(e) => setConReina(parseInt(e.target.value) || 0)}
                onWheel={(e) => e.currentTarget.blur()}
                className="mt-1"
              />
            </div>
          </div>

          {/* Total indicator */}
          <div className={`text-sm px-3 py-2 rounded-md ${
            discrepancia
              ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
              : 'bg-muted text-brand-brown/70'
          }`}>
            {discrepancia && <AlertTriangle className="w-4 h-4 inline mr-1" />}
            Total reportado: <span className="font-semibold">{totalReportado}</span>
            {totalApiario > 0 && (
              <> / {totalApiario} colmenas del apiario</>
            )}
          </div>

          <div>
            <Label>Observaciones (opcional)</Label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              className="mt-1 w-full px-3 py-2 border border-secondary/30 rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Notas..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={loading} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={loading} className="flex-1 bg-primary hover:bg-primary-dark">
              {loading ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
