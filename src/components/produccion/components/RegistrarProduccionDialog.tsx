import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useProduccionData } from '../hooks/useProduccionData';
import type {
  LoteProduccion,
  SubloteProduccion,
  ProduccionFormData,
  CosechaTipo,
} from '../../../types/produccion';
import { ANOS_DISPONIBLES } from '../../../types/produccion';

interface RegistrarProduccionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lotes: LoteProduccion[];
  onSuccess: () => void;
}

const INITIAL_FORM: ProduccionFormData = {
  lote_id: '',
  sublote_id: undefined,
  ano: new Date().getFullYear(),
  cosecha_tipo: 'Principal',
  kg_totales: 0,
  arboles_registrados: 0,
  observaciones: '',
};

export function RegistrarProduccionDialog({
  open,
  onOpenChange,
  lotes,
  onSuccess,
}: RegistrarProduccionDialogProps) {
  const [formData, setFormData] = useState<ProduccionFormData>(INITIAL_FORM);
  const [sublotes, setSublotes] = useState<SubloteProduccion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSublotes, setLoadingSublotes] = useState(false);

  const { getSublotesByLote, createProduccion } = useProduccionData();

  // Cargar sublotes cuando cambia el lote
  useEffect(() => {
    if (formData.lote_id) {
      cargarSublotes(formData.lote_id);
    } else {
      setSublotes([]);
    }
  }, [formData.lote_id]);

  // Auto-llenar arboles cuando se selecciona lote/sublote
  useEffect(() => {
    if (formData.sublote_id) {
      const sublote = sublotes.find((s) => s.id === formData.sublote_id);
      if (sublote?.total_arboles) {
        setFormData((prev) => ({
          ...prev,
          arboles_registrados: sublote.total_arboles || 0,
        }));
      }
    } else if (formData.lote_id) {
      const lote = lotes.find((l) => l.id === formData.lote_id);
      if (lote?.total_arboles) {
        setFormData((prev) => ({
          ...prev,
          arboles_registrados: lote.total_arboles || 0,
        }));
      }
    }
  }, [formData.lote_id, formData.sublote_id, sublotes, lotes]);

  const cargarSublotes = async (loteId: string) => {
    try {
      setLoadingSublotes(true);
      const data = await getSublotesByLote(loteId);
      setSublotes(data);
    } catch (err) {
      console.error('Error loading sublotes:', err);
    } finally {
      setLoadingSublotes(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones
    if (!formData.lote_id) {
      toast.error('Selecciona un lote');
      return;
    }
    if (formData.kg_totales <= 0) {
      toast.error('Los KG totales deben ser mayor a 0');
      return;
    }
    if (formData.arboles_registrados <= 0) {
      toast.error('Los arboles registrados deben ser mayor a 0');
      return;
    }

    try {
      setSubmitting(true);
      await createProduccion(formData);
      toast.success('Registro de produccion creado exitosamente');
      setFormData(INITIAL_FORM);
      onSuccess();
    } catch (err: any) {
      console.error('Error creating production record:', err);
      if (err.message?.includes('unique_produccion_record')) {
        toast.error(
          'Ya existe un registro para este lote/sublote, ano y tipo de cosecha'
        );
      } else {
        toast.error('Error al crear el registro: ' + err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData(INITIAL_FORM);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Registrar Cosecha</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Lote */}
          <div className="space-y-2">
            <Label htmlFor="lote">Lote *</Label>
            <Select
              value={formData.lote_id}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  lote_id: value,
                  sublote_id: undefined,
                })
              }
            >
              <SelectTrigger id="lote">
                <SelectValue placeholder="Seleccionar lote" />
              </SelectTrigger>
              <SelectContent>
                {lotes.map((lote) => (
                  <SelectItem key={lote.id} value={lote.id}>
                    {lote.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sublote (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="sublote">Sublote (opcional)</Label>
            <Select
              value={formData.sublote_id || 'none'}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  sublote_id: value === 'none' ? undefined : value,
                })
              }
              disabled={!formData.lote_id || loadingSublotes}
            >
              <SelectTrigger id="sublote">
                <SelectValue
                  placeholder={
                    loadingSublotes ? 'Cargando...' : 'Nivel lote (sin sublote)'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nivel lote (sin sublote)</SelectItem>
                {sublotes.map((sublote) => (
                  <SelectItem key={sublote.id} value={sublote.id}>
                    {sublote.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ano y Tipo de Cosecha */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ano">Ano *</Label>
              <Select
                value={formData.ano.toString()}
                onValueChange={(value) =>
                  setFormData({ ...formData, ano: parseInt(value) })
                }
              >
                <SelectTrigger id="ano">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANOS_DISPONIBLES.map((ano) => (
                    <SelectItem key={ano} value={ano.toString()}>
                      {ano}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cosecha_tipo">Tipo de Cosecha *</Label>
              <Select
                value={formData.cosecha_tipo}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    cosecha_tipo: value as CosechaTipo,
                  })
                }
              >
                <SelectTrigger id="cosecha_tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Principal">Principal</SelectItem>
                  <SelectItem value="Traviesa">Traviesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* KG Totales y Arboles */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="kg_totales">KG Totales *</Label>
              <Input
                id="kg_totales"
                type="number"
                min="0"
                step="0.01"
                value={formData.kg_totales || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    kg_totales: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="arboles">Arboles Registrados *</Label>
              <Input
                id="arboles"
                type="number"
                min="1"
                value={formData.arboles_registrados || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    arboles_registrados: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="0"
              />
            </div>
          </div>

          {/* Rendimiento calculado */}
          {formData.kg_totales > 0 && formData.arboles_registrados > 0 && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-100">
              <p className="text-sm text-green-800">
                <strong>Rendimiento calculado:</strong>{' '}
                {(formData.kg_totales / formData.arboles_registrados).toLocaleString(
                  'es-CO',
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                )}{' '}
                kg/arbol
              </p>
            </div>
          )}

          {/* Observaciones */}
          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              value={formData.observaciones || ''}
              onChange={(e) =>
                setFormData({ ...formData, observaciones: e.target.value })
              }
              placeholder="Notas adicionales sobre la cosecha..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-primary hover:bg-primary-dark"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {submitting ? 'Guardando...' : 'Guardar Registro'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
