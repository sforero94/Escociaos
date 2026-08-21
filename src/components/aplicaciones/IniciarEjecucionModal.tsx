import { useState } from 'react';
import { Play, Calendar, AlertCircle } from 'lucide-react';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EstadoAplicacionBadge } from './shared/EstadoAplicacionBadge';
import type { Aplicacion } from '../../types/aplicaciones';
import { obtenerFechaHoy } from '@/utils/fechas';
import { formatearNumero } from '@/utils/format';

interface IniciarEjecucionModalProps {
  aplicacion: Aplicacion;
  onClose: () => void;
  onSuccess: () => void;
}

interface ProductoFaltante {
  nombre: string;
  necesario: number;
  disponible: number;
  unidad: string;
}

export function IniciarEjecucionModal({
  aplicacion,
  onClose,
  onSuccess,
}: IniciarEjecucionModalProps) {
  const supabase = getSupabase();
  const [fechaInicio, setFechaInicio] = useState<string>(
    obtenerFechaHoy()
  );
  const [loading, setLoading] = useState(false);
  const [validandoStock, setValidandoStock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productosFaltantes, setProductosFaltantes] = useState<ProductoFaltante[]>([]);
  const [stockValidado, setStockValidado] = useState(false);
  const [showConfirmStockInsuficiente, setShowConfirmStockInsuficiente] = useState(false);

  /**
   * VALIDAR STOCK SUFICIENTE
   */
  const validarStockSuficiente = async (): Promise<boolean> => {
    try {
      setValidandoStock(true);
      setError(null);
      setProductosFaltantes([]);


      // 1. Cargar productos necesarios de todas las mezclas
      const { data: mezclas, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacion.id);

      if (errorMezclas) {
        throw new Error('Error al cargar mezclas');
      }

      if (!mezclas || mezclas.length === 0) {
        setStockValidado(true);
        return true;
      }

      const mezclasIds = mezclas.map(m => m.id);

      const { data: productosNecesarios, error: errorProductos } = await supabase
        .from('aplicaciones_productos')
        .select('producto_id, producto_nombre, cantidad_total_necesaria, producto_unidad')
        .in('mezcla_id', mezclasIds);

      if (errorProductos) {
        throw new Error('Error al cargar productos necesarios');
      }

      if (!productosNecesarios || productosNecesarios.length === 0) {
        setStockValidado(true);
        return true;
      }

      // 2. Consolidar cantidades por producto (puede haber duplicados en diferentes mezclas)
      const necesidadesPorProducto = new Map<string, { nombre: string; cantidad: number; unidad: string }>();

      productosNecesarios.forEach(p => {
        const actual = necesidadesPorProducto.get(p.producto_id);
        if (actual) {
          actual.cantidad += p.cantidad_total_necesaria || 0;
        } else {
          necesidadesPorProducto.set(p.producto_id, {
            nombre: p.producto_nombre,
            cantidad: p.cantidad_total_necesaria || 0,
            unidad: p.producto_unidad || 'L/Kg'
          });
        }
      });

      // 3. Cargar stock actual de productos
      const productosIds = Array.from(necesidadesPorProducto.keys());

      const { data: productosStock, error: errorStock } = await supabase
        .from('productos')
        .select('id, nombre, cantidad_actual, unidad_medida')
        .in('id', productosIds);

      if (errorStock) {
        throw new Error('Error al cargar inventario actual');
      }

      const stockMap = new Map(productosStock?.map(p => [p.id, { disponible: p.cantidad_actual || 0, unidad: p.unidad_medida }]) || []);

      // 4. Verificar faltantes
      const faltantes: ProductoFaltante[] = [];

      necesidadesPorProducto.forEach((necesidad, productoId) => {
        const stock = stockMap.get(productoId);
        const disponible = stock?.disponible || 0;

        if (disponible < necesidad.cantidad) {
          faltantes.push({
            nombre: necesidad.nombre,
            necesario: necesidad.cantidad,
            disponible: disponible,
            unidad: stock?.unidad || necesidad.unidad
          });
        }
      });

      // 5. Resultado
      if (faltantes.length > 0) {
        setProductosFaltantes(faltantes);
        setStockValidado(false);
        return false;
      }

      setStockValidado(true);
      return true;

    } catch (err: any) {
      setError(err.message || 'Error al validar inventario');
      return false;
    } finally {
      setValidandoStock(false);
    }
  };

  const ejecutarInicio = async () => {
    try {
      setLoading(true);
      setError(null);

      // Actualizar aplicación a estado "En ejecución"
      const { error: updateError } = await supabase
        .from('aplicaciones')
        .update({
          estado: 'En ejecución',
          fecha_inicio_ejecucion: fechaInicio,
          updated_at: new Date().toISOString(),
        })
        .eq('id', aplicacion.id);

      if (updateError) throw updateError;

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error al iniciar la ejecución');
    } finally {
      setLoading(false);
    }
  };

  const handleIniciar = async () => {
    setError(null);

    // Validar fecha
    if (!fechaInicio) {
      setError('Debes seleccionar una fecha de inicio');
      return;
    }

    const fechaInicioDate = new Date(fechaInicio);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (fechaInicioDate > hoy) {
      setError('La fecha de inicio no puede ser futura');
      return;
    }

    // Validar stock si no se ha validado aún
    if (!stockValidado) {
      const stockSuficiente = await validarStockSuficiente();
      if (!stockSuficiente) {
        // Si hay faltantes, mostrar ConfirmDialog en lugar de window.confirm
        setShowConfirmStockInsuficiente(true);
        return;
      }
    }

    await ejecutarInicio();
  };

  // Build a description that lists the products with insufficient stock
  const confirmStockDescription = productosFaltantes.length > 0
    ? `${productosFaltantes.length} producto(s) no tienen suficiente inventario:\n` +
      productosFaltantes.map(
        (p) => `${p.nombre}: necesita ${formatearNumero(p.necesario, 2)} ${p.unidad}, disponible ${formatearNumero(p.disponible, 2)} ${p.unidad}`
      ).join(' / ') +
      '\n\nEsta acción no se puede deshacer.'
    : 'Esta acción no se puede deshacer.';

  return (
    <>
      <ConfirmDialog
        open={showConfirmStockInsuficiente}
        onOpenChange={(open) => { if (!open) setShowConfirmStockInsuficiente(false); }}
        title="Stock insuficiente — ¿Iniciar de todos modos?"
        description={confirmStockDescription}
        confirmLabel="Iniciar de todos modos"
        onConfirm={() => { setShowConfirmStockInsuficiente(false); ejecutarInicio(); }}
        destructive
      />

      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Play className="size-[18px]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle>Iniciar Ejecución</DialogTitle>
                <p className="text-sm text-muted-foreground truncate">{aplicacion.nombre_aplicacion}</p>
              </div>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {/* Info */}
            <Alert>
              <AlertCircle aria-hidden="true" />
              <AlertDescription>
                <p className="font-medium text-foreground">Al iniciar la ejecución podrás:</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>Registrar movimientos diarios de productos</li>
                  <li>Mantener trazabilidad</li>
                  <li>Comparar lo planificado vs lo ejecutado</li>
                </ul>
              </AlertDescription>
            </Alert>

            {/* Fecha de inicio */}
            <div>
              <label htmlFor="fecha-inicio-ejecucion" className="mb-2 flex items-center gap-1.5 text-sm text-foreground">
                <Calendar className="size-4" aria-hidden="true" />
                Fecha de inicio de ejecución
              </label>
              <Input
                id="fecha-inicio-ejecucion"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                max={obtenerFechaHoy()}
                className="w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Fecha en que comenzó la aplicación en campo
              </p>
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Resumen */}
            <div className="space-y-2 rounded-xl bg-muted p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-brand-brown/70">Estado actual:</span>
                <EstadoAplicacionBadge estado={aplicacion.estado} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-brown/70">Nuevo estado:</span>
                <EstadoAplicacionBadge estado="En ejecución" />
              </div>
              <div className="flex justify-between">
                <span className="text-brand-brown/70">Tipo:</span>
                <span className="text-foreground">{aplicacion.tipo_aplicacion}</span>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button onClick={onClose} variant="outline" disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleIniciar} disabled={loading || validandoStock}>
              <Play className="size-4" aria-hidden="true" />
              {loading ? 'Iniciando...' : validandoStock ? 'Validando stock...' : 'Iniciar Ejecución'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
