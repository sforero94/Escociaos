import { useState, useEffect } from 'react';
import { ArrowUpCircle, ArrowDownCircle, RefreshCw, ChevronDown, Package } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { formatNumber } from '../../utils/format';
import { Button } from '../ui/button';
import { formatearFechaHora } from '../../utils/fechas';

interface Movement {
  id: number;
  tipo_movimiento: string;
  cantidad: number;
  saldo_anterior: number;
  saldo_nuevo: number;
  referencia_id: number | null;
  tipo_referencia: string | null;
  notas: string | null;
  created_at: string;
}

interface ProductMovementsProps {
  productId: number;
  productName: string;
  unidadMedida: string;
}

export function ProductMovements({ productId, productName, unidadMedida }: ProductMovementsProps) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    loadMovements();
  }, [productId, limit]);

  const loadMovements = async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('movimientos_inventario')
        .select('*')
        .eq('producto_id', productId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      setMovements(data || []);
    } catch (err: any) {
    } finally {
      setLoading(false);
    }
  };

  // Removed - now using formatearFechaHora from utils/fechas

  const formatReferencia = (tipo: string | null, id: number | null) => {
    if (!tipo || !id) return 'Manual';
    const tipos: Record<string, string> = {
      'compra': 'Compra',
      'aplicacion': 'Aplicación',
      'ajuste': 'Ajuste',
      'verificacion': 'Verificación',
      'devolucion': 'Devolución',
    };
    return `${tipos[tipo] || tipo} #${id}`;
  };

  const getMovementIcon = (type: string) => {
    const isEntrada = type?.toLowerCase()?.trim() === 'entrada';
    return isEntrada
      ? <ArrowUpCircle className="w-6 h-6 text-success-alt" />
      : <ArrowDownCircle className="w-6 h-6 text-destructive" />;
  };

  const getMovementBorderColor = (type: string) => {
    const isEntrada = type?.toLowerCase()?.trim() === 'entrada';
    return isEntrada
      ? 'border-l-success-alt bg-success-alt/5'
      : 'border-l-destructive bg-destructive/5';
  };

  const getMovementBadgeColor = (type: string) => {
    const isEntrada = type?.toLowerCase()?.trim() === 'entrada';
    return isEntrada
      ? 'bg-success-alt/10 text-success-alt'
      : 'bg-destructive/10 text-destructive';
  };

  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl text-foreground flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Historial de Movimientos
          </h3>
          <p className="text-sm text-brand-brown/60 mt-1">{productName}</p>
        </div>
        <Button
          onClick={loadMovements}
          variant="ghost"
          size="sm"
          className="text-primary hover:bg-primary/5"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {movements.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-brand-brown/40 mx-auto mb-4" />
          <p className="text-brand-brown/60">No hay movimientos registrados para este producto</p>
        </div>
      ) : (
        <>
          {/* Lista de movimientos */}
          <div className="space-y-3 mb-6">
            {movements.map(movement => (
              <div
                key={movement.id}
                className={`border-l-4 ${getMovementBorderColor(movement.tipo_movimiento)} rounded-r-xl p-4 transition-all duration-200 hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    {/* Tipo y cantidad */}
                    <div className="flex items-center gap-3 mb-3">
                      <div>
                        {getMovementIcon(movement.tipo_movimiento)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2.5 py-0.5 rounded-lg text-xs uppercase tracking-wide ${getMovementBadgeColor(movement.tipo_movimiento)}`}>
                            {movement.tipo_movimiento}
                          </span>
                        </div>
                        <p className="text-lg text-foreground">
                          {movement.tipo_movimiento?.toLowerCase()?.trim() === 'entrada' ? '+' : '-'}
                          {formatNumber(Math.abs(movement.cantidad), 2)} {unidadMedida}
                        </p>
                      </div>
                    </div>

                    {/* Stock antes/después */}
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="bg-white/50 rounded-lg p-2">
                        <p className="text-xs text-brand-brown/60 mb-0.5 uppercase tracking-wide">Antes</p>
                        <p className="text-sm text-foreground">
                          {formatNumber(movement.saldo_anterior, 2)} {unidadMedida}
                        </p>
                      </div>
                      <div className="bg-white/50 rounded-lg p-2">
                        <p className="text-xs text-brand-brown/60 mb-0.5 uppercase tracking-wide">Después</p>
                        <p className="text-sm text-foreground">
                          {formatNumber(movement.saldo_nuevo, 2)} {unidadMedida}
                        </p>
                      </div>
                    </div>

                    {/* Referencia y Notas */}
                    <div className="space-y-1">
                      {movement.tipo_referencia && (
                        <p className="text-sm text-brand-brown/70 flex items-center gap-1">
                          <span className="text-primary">●</span>
                          <span>Referencia:</span>{' '}
                          <span className="text-foreground">{formatReferencia(movement.tipo_referencia, movement.referencia_id)}</span>
                        </p>
                      )}
                      {movement.notas && (
                        <p className="text-sm text-brand-brown/70 flex items-start gap-1">
                          <span className="text-primary mt-0.5">●</span>
                          <span>Nota:</span>{' '}
                          <span className="text-foreground">{movement.notas}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Fecha */}
                  <div className="text-right text-xs text-brand-brown/60 whitespace-nowrap">
                    {formatearFechaHora(movement.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Botón ver más */}
          {movements.length >= limit && (
            <div className="text-center mb-6">
              <Button
                onClick={() => setLimit(prev => prev + 10)}
                variant="outline"
                className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 rounded-xl"
              >
                Ver más movimientos
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Resumen */}
          <div className="grid grid-cols-2 gap-4 pt-6 border-t border-primary/10">
            <div className="bg-gradient-to-br from-success-alt/5 to-success-alt/10 rounded-xl border border-success-alt/20 p-4 hover:shadow-md transition-all duration-200">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpCircle className="w-5 h-5 text-success-alt" />
                <p className="text-sm text-success-alt/70 uppercase tracking-wide">Entradas</p>
              </div>
              <p className="text-2xl text-success-alt">
                {movements.filter(m => m.tipo_movimiento?.toLowerCase()?.trim() === 'entrada').length}
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-destructive/5 to-destructive/10 rounded-xl border border-destructive/20 p-4 hover:shadow-md transition-all duration-200">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownCircle className="w-5 h-5 text-destructive" />
                <p className="text-sm text-destructive/70 uppercase tracking-wide">Salidas</p>
              </div>
              <p className="text-2xl text-destructive">
                {movements.filter(m => m.tipo_movimiento?.toLowerCase()?.trim() === 'salida').length}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}