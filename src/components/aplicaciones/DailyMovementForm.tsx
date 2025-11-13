import { useState, useEffect } from 'react';
import { Calendar, Package, User, FileText, Plus, X, AlertTriangle, Info } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { validarFormularioMovimiento } from '../../utils/dailyMovementUtils';
import type {
  MovimientoDiario,
  Aplicacion,
  LoteSeleccionado,
  ProductoEnMezcla
} from '../../types/aplicaciones';

interface DailyMovementFormProps {
  aplicacion: Aplicacion;
  onSuccess: () => void;
  onCancel: () => void;
}

export function DailyMovementForm({ aplicacion, onSuccess, onCancel }: DailyMovementFormProps) {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados del formulario
  const [fechaMovimiento, setFechaMovimiento] = useState(new Date().toISOString().split('T')[0]);
  const [loteId, setLoteId] = useState('');
  const [productoId, setProductoId] = useState('');
  const [cantidadUtilizada, setCantidadUtilizada] = useState('');
  const [numeroCanecasUtilizadas, setNumeroCanecasUtilizadas] = useState('');
  const [responsable, setResponsable] = useState('');
  const [notas, setNotas] = useState('');

  // Datos de la aplicación
  const [lotes, setLotes] = useState<LoteSeleccionado[]>([]);
  const [productos, setProductos] = useState<ProductoEnMezcla[]>([]);
  const [canecasPorLote, setCanecasPorLote] = useState<Record<string, number>>({});

  // Cargar datos al montar
  useEffect(() => {
    cargarDatosAplicacion();
    cargarUsuarioActual();
  }, [aplicacion.id]);

  const cargarDatosAplicacion = async () => {
    try {
      // Cargar lotes de la aplicación
      const { data: lotesData, error: errorLotes } = await supabase
        .from('aplicaciones_lotes')
        .select(`
          lote_id,
          lotes (
            id,
            nombre
          )
        `)
        .eq('aplicacion_id', aplicacion.id);

      if (errorLotes) throw errorLotes;

      const lotesFormateados: LoteSeleccionado[] = (lotesData || []).map(l => ({
        lote_id: l.lote_id,
        nombre: l.lotes?.nombre || 'Sin nombre',
        area_hectareas: 0,
        conteo_arboles: { grandes: 0, medianos: 0, pequenos: 0, clonales: 0, total: 0 }
      }));

      setLotes(lotesFormateados);

      // Cargar cálculos de canecas por lote (solo fumigación)
      if (aplicacion.tipo === 'fumigacion') {
        const { data: calculosData, error: errorCalculos } = await supabase
          .from('aplicaciones_calculos')
          .select('lote_id, numero_canecas')
          .eq('aplicacion_id', aplicacion.id);

        if (!errorCalculos && calculosData) {
          const canecasMap: Record<string, number> = {};
          calculosData.forEach(calc => {
            if (calc.numero_canecas) {
              canecasMap[calc.lote_id] = calc.numero_canecas;
            }
          });
          setCanecasPorLote(canecasMap);
        }
      }

      // Cargar productos de las mezclas
      const { data: mezclasData, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacion.id);

      if (errorMezclas) throw errorMezclas;

      if (mezclasData && mezclasData.length > 0) {
        const mezclaIds = mezclasData.map(m => m.id);

        const { data: productosData, error: errorProductos } = await supabase
          .from('aplicaciones_productos')
          .select('*')
          .in('mezcla_id', mezclaIds);

        if (errorProductos) throw errorProductos;

        // Eliminar duplicados por producto_id
        const productosUnicos = new Map<string, ProductoEnMezcla>();
        (productosData || []).forEach(p => {
          if (!productosUnicos.has(p.producto_id)) {
            productosUnicos.set(p.producto_id, {
              producto_id: p.producto_id,
              producto_nombre: p.producto_nombre,
              producto_categoria: p.producto_categoria,
              producto_unidad: p.producto_unidad,
              cantidad_total_necesaria: p.cantidad_total_necesaria,
            });
          }
        });

        setProductos(Array.from(productosUnicos.values()));
      }
    } catch (err: any) {
      console.error('Error cargando datos:', err);
      setError('Error al cargar los datos de la aplicación');
    }
  };

  const cargarUsuarioActual = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Cargar perfil del usuario
        const { data: profile } = await supabase
          .from('usuarios')
          .select('nombre_completo')
          .eq('user_id', user.id)
          .single();

        if (profile?.nombre_completo) {
          setResponsable(profile.nombre_completo);
        }
      }
    } catch (err: any) {
      console.error('Error cargando usuario:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validacion = validarFormularioMovimiento({
      fechaMovimiento,
      loteId,
      productoId,
      cantidadUtilizada,
      responsable,
      notas,
      numeroCanecasUtilizadas,
      esFumigacion: aplicacion.tipo === 'fumigacion',
      tieneCanecasPlaneadas: !!canecasPorLote[loteId]
    });

    if (!validacion.valido) {
      setError(validacion.mensaje);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Encontrar información del lote y producto
      const lote = lotes.find(l => l.lote_id === loteId);
      const producto = productos.find(p => p.producto_id === productoId);

      if (!lote || !producto) {
        throw new Error('Lote o producto no encontrado');
      }

      // Crear movimiento diario
      const nuevoMovimiento: MovimientoDiario = {
        aplicacion_id: aplicacion.id,
        fecha_movimiento: fechaMovimiento,
        lote_id: loteId,
        lote_nombre: lote.nombre,
        producto_id: productoId,
        producto_nombre: producto.producto_nombre,
        producto_categoria: producto.producto_categoria,
        producto_unidad: producto.producto_unidad,
        cantidad_utilizada: parseFloat(cantidadUtilizada),
        responsable: responsable.trim(),
        notas: notas.trim() || undefined,
        created_by: user.id,
      };

      // Agregar canecas si es fumigación
      if (aplicacion.tipo === 'fumigacion' && numeroCanecasUtilizadas && canecasPorLote[loteId]) {
        nuevoMovimiento.numero_canecas_utilizadas = parseInt(numeroCanecasUtilizadas);
        nuevoMovimiento.numero_canecas_planeadas = canecasPorLote[loteId];
      }

      const { error: errorInsert } = await supabase
        .from('movimientos_diarios')
        .insert([nuevoMovimiento]);

      if (errorInsert) throw errorInsert;

      console.log('✅ Movimiento diario registrado exitosamente');

      // Limpiar formulario
      setFechaMovimiento(new Date().toISOString().split('T')[0]);
      setLoteId('');
      setProductoId('');
      setCantidadUtilizada('');
      setNumeroCanecasUtilizadas('');
      setNotas('');

      // Notificar éxito
      onSuccess();

    } catch (err: any) {
      console.error('Error guardando movimiento:', err);
      setError(err.message || 'Error al guardar el movimiento');
    } finally {
      setLoading(false);
    }
  };

  const productoSeleccionado = productos.find(p => p.producto_id === productoId);
  const loteSeleccionado = lotes.find(l => l.lote_id === loteId);

  return (
    <div className="bg-white rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#73991C]/10 rounded-xl flex items-center justify-center">
            <Plus className="w-6 h-6 text-[#73991C]" />
          </div>
          <div>
            <h3 className="text-lg text-[#172E08]">Nuevo Movimiento Diario</h3>
            <p className="text-sm text-[#4D240F]/60">
              Registra el uso de insumos durante la aplicación
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-red-800 text-sm mb-1">Error</h4>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Fecha */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#73991C]" />
            Fecha del Movimiento
            <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={fechaMovimiento}
            onChange={(e) => setFechaMovimiento(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            disabled={loading}
            className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Lote */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            <Package className="w-4 h-4 text-[#73991C]" />
            Lote Aplicado
            <span className="text-red-500">*</span>
          </label>
          <select
            value={loteId}
            onChange={(e) => setLoteId(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Selecciona un lote</option>
            {lotes.map(lote => (
              <option key={lote.lote_id} value={lote.lote_id}>
                {lote.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Producto */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            <Package className="w-4 h-4 text-[#73991C]" />
            Producto
            <span className="text-red-500">*</span>
          </label>
          <select
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Selecciona un producto</option>
            {productos.map(producto => (
              <option key={producto.producto_id} value={producto.producto_id}>
                {producto.producto_nombre} ({producto.producto_categoria})
              </option>
            ))}
          </select>
        </div>

        {/* Cantidad Utilizada */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            Cantidad Utilizada
            <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-3">
            <Input
              type="number"
              value={cantidadUtilizada}
              onChange={(e) => setCantidadUtilizada(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              disabled={loading}
              className="flex-1 bg-white border-[#73991C]/20 focus:border-[#73991C] disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {productoSeleccionado && (
              <div className="px-4 py-3 bg-[#E7EDDD] border border-[#73991C]/20 rounded-xl text-[#172E08] min-w-[100px] flex items-center justify-center">
                {productoSeleccionado.producto_unidad}
              </div>
            )}
          </div>
          {productoSeleccionado && (
            <p className="text-xs text-[#4D240F]/60 mt-2">
              Planeado: {productoSeleccionado.cantidad_total_necesaria.toFixed(2)} {productoSeleccionado.producto_unidad}
            </p>
          )}
        </div>

        {/* Número de Canecas (solo fumigación) */}
        {aplicacion.tipo === 'fumigacion' && loteId && canecasPorLote[loteId] && (
          <div>
            <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-[#73991C]" />
              Número de Canecas Utilizadas
              <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              <Input
                type="number"
                value={numeroCanecasUtilizadas}
                onChange={(e) => setNumeroCanecasUtilizadas(e.target.value)}
                placeholder="0"
                step="1"
                min="0"
                disabled={loading}
                className="flex-1 bg-white border-[#73991C]/20 focus:border-[#73991C] disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="px-4 py-3 bg-[#E7EDDD] border border-[#73991C]/20 rounded-xl text-[#172E08] min-w-[120px] flex items-center justify-center">
                canecas
              </div>
            </div>
            <div className="mt-2 p-3 bg-[#73991C]/5 border border-[#73991C]/20 rounded-lg">
              <p className="text-xs text-[#4D240F]/70">
                📊 <strong>Planeado:</strong> {canecasPorLote[loteId]} canecas para este lote
              </p>
            </div>
          </div>
        )}

        {/* Responsable */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            <User className="w-4 h-4 text-[#73991C]" />
            Responsable
            <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            placeholder="Nombre del responsable"
            disabled={loading}
            className="bg-white border-[#73991C]/20 focus:border-[#73991C] disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Notas */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#73991C]" />
            Notas (Opcional)
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Observaciones adicionales..."
            rows={3}
            disabled={loading}
            className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Botones */}
        <div className="flex items-center gap-3 pt-4 border-t border-[#73991C]/10">
          <Button
            type="button"
            onClick={onCancel}
            disabled={loading}
            variant="outline"
            className="flex-1 border-[#73991C]/20 hover:bg-[#73991C]/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#73991C] hover:bg-[#5f7d17] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Guardando...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Registrar Movimiento
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Info de movimiento provisional */}
      <div className="mt-6 p-4 bg-[#73991C]/5 border border-[#73991C]/20 rounded-xl">
        <p className="text-xs text-[#4D240F]/70 flex items-start gap-2">
          <span className="text-[#73991C] mt-0.5">ℹ️</span>
          <span>
            Este es un movimiento <strong>provisional</strong> que no afecta el inventario inmediatamente.
            Al cerrar la aplicación, podrás revisar y ajustar si hay diferencias entre lo planeado y lo real.
          </span>
        </p>
      </div>
    </div>
  );
}