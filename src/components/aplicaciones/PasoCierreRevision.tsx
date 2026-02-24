import { useState, useEffect, useMemo } from 'react';
import { Calendar, Package, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import type { Aplicacion, MovimientoDiario } from '../../types/aplicaciones';

interface PasoCierreRevisionProps {
  aplicacion: Aplicacion;
  movimientos: MovimientoDiario[];
  onMovimientosActualizados: (movimientos: MovimientoDiario[]) => void;
}

interface ResumenDiario {
  fecha: string;
  canecas: number;
  productos: {
    [productoId: string]: {
      nombre: string;
      cantidad: number;
      unidad: string;
    };
  };
}

export function PasoCierreRevision({
  aplicacion,
  movimientos,
  onMovimientosActualizados,
}: PasoCierreRevisionProps) {
  // Obtener fechas únicas ordenadas
  const fechasUnicas = useMemo(() => {
    const fechas = Array.from(new Set(movimientos.map((m) => m.fecha_movimiento))).sort();
    return fechas;
  }, [movimientos]);

  // Agrupar por fecha
  const resumenPorFecha = useMemo((): ResumenDiario[] => {
    return fechasUnicas.map((fecha) => {
      const movimientosDia = movimientos.filter((m) => m.fecha_movimiento === fecha);

      const canecas = movimientosDia.reduce(
        (sum, m) => sum + (m.numero_canecas_utilizadas || 0),
        0
      );

      const productos: ResumenDiario['productos'] = {};
      movimientosDia.forEach((mov) => {
        if (!productos[mov.producto_id]) {
          productos[mov.producto_id] = {
            nombre: mov.producto_nombre,
            cantidad: 0,
            unidad: mov.producto_unidad,
          };
        }
        productos[mov.producto_id].cantidad += mov.cantidad_utilizada;
      });

      return { fecha, canecas, productos };
    });
  }, [movimientos, fechasUnicas]);

  // Obtener lista de todos los productos únicos
  const productosUnicos = useMemo(() => {
    const productos = new Map<
      string,
      { id: string; nombre: string; unidad: string; totalUtilizado: number }
    >();

    movimientos.forEach((mov) => {
      if (!productos.has(mov.producto_id)) {
        productos.set(mov.producto_id, {
          id: mov.producto_id,
          nombre: mov.producto_nombre,
          unidad: mov.producto_unidad,
          totalUtilizado: 0,
        });
      }
      const producto = productos.get(mov.producto_id)!;
      producto.totalUtilizado += mov.cantidad_utilizada;
    });

    return Array.from(productos.values()).sort((a, b) => b.totalUtilizado - a.totalUtilizado);
  }, [movimientos]);

  // Calcular cantidades planeadas por producto
  const cantidadesPlaneadas = useMemo(() => {
    const planeadas = new Map<string, number>();


    // Intentar obtener de mezclas (estructura principal)
    if (aplicacion.mezclas && aplicacion.mezclas.length > 0) {
      aplicacion.mezclas.forEach((mezcla, index) => {
        if (mezcla.productos && Array.isArray(mezcla.productos)) {
          mezcla.productos.forEach((producto) => {
            const productoId = producto.producto_id || producto.id;
            const cantidad = producto.cantidad_total_necesaria || producto.cantidad || 0;
            const actual = planeadas.get(productoId) || 0;
            planeadas.set(productoId, actual + cantidad);
          });
        }
      });
    }
    // Intentar obtener de lista_compras como alternativa
    else if (aplicacion.lista_compras && aplicacion.lista_compras.length > 0) {
      aplicacion.lista_compras.forEach((item) => {
        const productoId = item.producto_id || item.id;
        const cantidad = item.cantidad_total || item.cantidad || 0;
        const actual = planeadas.get(productoId) || 0;
        planeadas.set(productoId, actual + cantidad);
      });
    }
    // Intentar obtener de calculos como última opción
    else if (aplicacion.calculos && aplicacion.calculos.length > 0) {
      aplicacion.calculos.forEach((calculo) => {
        if (calculo.productos && Array.isArray(calculo.productos)) {
          calculo.productos.forEach((producto) => {
            const productoId = producto.producto_id || producto.id;
            const cantidad = producto.cantidad_total || producto.cantidad || 0;
            const actual = planeadas.get(productoId) || 0;
            planeadas.set(productoId, actual + cantidad);
          });
        }
      });
    }

    return planeadas;
  }, [aplicacion.mezclas, aplicacion.calculos, aplicacion.lista_compras]);

  // Calcular canecas planeadas totales desde aplicaciones_calculos
  const canecasPlaneadas = useMemo(() => {
    if (!aplicacion.calculos || aplicacion.calculos.length === 0) {
      return 0;
    }
    
    const total = aplicacion.calculos.reduce(
      (sum, calculo) => sum + (calculo.numero_canecas || 0),
      0
    );

    return total;
  }, [aplicacion.calculos]);

  const formatearFecha = (fecha: string): string => {
    return new Date(fecha).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
    });
  };

  const formatearNumero = (valor: number, decimales: number = 2): string => {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(valor);
  };

  const calcularDesviacion = (productoId: string): number | null => {
    const planeado = cantidadesPlaneadas.get(productoId);
    const producto = productosUnicos.find((p) => p.id === productoId);

    if (!planeado || !producto || planeado === 0) return null;

    return ((producto.totalUtilizado - planeado) / planeado) * 100;
  };

  const getColorDesviacion = (desviacion: number | null): string => {
    if (desviacion === null) return 'text-gray-600';
    const abs = Math.abs(desviacion);
    if (abs > 20) return 'text-red-600';
    if (abs > 10) return 'text-yellow-600';
    return 'text-green-600';
  };

  const totalCanecas = resumenPorFecha.reduce((sum, dia) => sum + dia.canecas, 0);

  return (
    <div className="space-y-6">
      {/* TÍTULO */}
      <div>
        <h3 className="text-xl text-foreground mb-2">Revisión de Movimientos</h3>
        <p className="text-brand-brown/70">
          Revisa las cantidades utilizadas por día antes de proceder con el cierre.
        </p>
      </div>

      {/* ESTADÍSTICAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-5 h-5 text-primary" />
            <div className="text-xs text-brand-brown/70">Días de Aplicación</div>
          </div>
          <div className="text-3xl text-primary">{fechasUnicas.length}</div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/10 to-blue-400/10 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-5 h-5 text-blue-600" />
            <div className="text-xs text-blue-700">Productos Utilizados</div>
          </div>
          <div className="text-3xl text-blue-900">{productosUnicos.length}</div>
        </div>

        <div className="bg-gradient-to-br from-purple-500/10 to-purple-400/10 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <div className="text-xs text-purple-700">Total Canecas</div>
          </div>
          <div className="text-3xl text-purple-900">{totalCanecas}</div>
        </div>
      </div>

      {/* MATRIZ 1: CANECAS POR DÍA */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-purple-500/10 to-purple-400/10 border-b border-purple-200 p-4">
          <h4 className="text-foreground">Canecas Utilizadas por Día</h4>
        </div>

        {fechasUnicas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs text-brand-brown uppercase tracking-wider">
                    Concepto
                  </th>
                  <th className="px-4 py-3 text-center text-xs text-brand-brown uppercase tracking-wider">
                    Planeado
                  </th>
                  {fechasUnicas.map((fecha) => (
                    <th
                      key={fecha}
                      className="px-4 py-3 text-center text-xs text-brand-brown uppercase tracking-wider"
                    >
                      {formatearFecha(fecha)}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs text-brand-brown uppercase tracking-wider bg-purple-50">
                    Total Real
                  </th>
                  <th className="px-4 py-3 text-center text-xs text-brand-brown uppercase tracking-wider bg-blue-50">
                    Desviación
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-sm text-foreground">Canecas</div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-blue-600">
                    {canecasPlaneadas > 0 ? formatearNumero(canecasPlaneadas, 1) : '-'}
                  </td>
                  {resumenPorFecha.map((dia) => (
                    <td key={dia.fecha} className="px-4 py-3 text-center text-sm">
                      {dia.canecas}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center bg-purple-50">
                    <div className="text-sm text-foreground">{totalCanecas}</div>
                  </td>
                  <td className="px-4 py-3 text-center bg-blue-50">
                    {canecasPlaneadas > 0 ? (
                      <div className={`text-sm ${getColorDesviacion(
                        ((totalCanecas - canecasPlaneadas) / canecasPlaneadas) * 100
                      )}`}>
                        {((totalCanecas - canecasPlaneadas) / canecasPlaneadas * 100) > 0 ? '+' : ''}
                        {formatearNumero(((totalCanecas - canecasPlaneadas) / canecasPlaneadas) * 100)}%
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">N/A</div>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-brand-brown/70">No hay movimientos registrados</p>
          </div>
        )}
      </div>

      {/* MATRIZ 2: PRODUCTOS POR DÍA */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-primary/20 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-foreground">Insumos Utilizados por Día</h4>
            <div className="text-xs text-brand-brown/70">
              Planeado vs Real - {productosUnicos.length} productos
            </div>
          </div>
        </div>

        {productosUnicos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs text-brand-brown uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-center text-xs text-brand-brown uppercase tracking-wider">
                    Planeado
                  </th>
                  {fechasUnicas.map((fecha) => (
                    <th
                      key={fecha}
                      className="px-4 py-3 text-center text-xs text-brand-brown uppercase tracking-wider"
                    >
                      {formatearFecha(fecha)}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs text-brand-brown uppercase tracking-wider bg-primary/10">
                    Total Real
                  </th>
                  <th className="px-4 py-3 text-center text-xs text-brand-brown uppercase tracking-wider bg-blue-50">
                    Desviación
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productosUnicos.map((producto) => {
                  const planeado = cantidadesPlaneadas.get(producto.id);
                  const desviacion = calcularDesviacion(producto.id);

                  return (
                    <tr key={producto.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 sticky left-0 bg-white hover:bg-gray-50 z-10">
                        <div className="text-sm text-foreground">{producto.nombre}</div>
                        <div className="text-xs text-brand-brown/50">{producto.unidad}</div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-blue-600">
                        {planeado ? formatearNumero(planeado) : '-'}
                      </td>
                      {resumenPorFecha.map((dia) => {
                        const productoDia = dia.productos[producto.id];
                        return (
                          <td key={dia.fecha} className="px-4 py-3 text-center text-sm">
                            {productoDia ? formatearNumero(productoDia.cantidad) : '-'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center bg-primary/10">
                        <div className="text-sm text-foreground">
                          {formatearNumero(producto.totalUtilizado)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center bg-blue-50">
                        {desviacion !== null ? (
                          <div className={`text-sm ${getColorDesviacion(desviacion)}`}>
                            {desviacion > 0 ? '+' : ''}
                            {formatearNumero(desviacion)}%
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">N/A</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-brand-brown/70">No hay productos registrados</p>
          </div>
        )}
      </div>

      {/* ALERTAS */}
      {movimientos.length === 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-900">
              <strong>No hay movimientos registrados</strong>
            </p>
            <p className="text-red-800 text-sm mt-1">
              Debes registrar al menos un movimiento diario antes de cerrar la aplicación.
            </p>
          </div>
        </div>
      )}

      {movimientos.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-green-900">
              <strong>Movimientos registrados correctamente</strong>
            </p>
            <p className="text-green-800 text-sm mt-1">
              Se encontraron {movimientos.length} movimientos en {fechasUnicas.length} días.
              Puedes continuar al siguiente paso.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}