import { useState, useEffect } from 'react';
import {
  ShoppingCart,
  CheckCircle,
  AlertTriangle,
  Download,
  Edit2,
  Save,
  X as XIcon,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { useSafeMode } from '../../contexts/SafeModeContext';
import { generarPDFListaCompras } from '../../utils/generarPDFListaCompras';
import { calcularTotalesGlobalesProductos, generarListaCompras } from '../../utils/calculosAplicaciones';
import { formatearMoneda, formatearNumero } from '../../utils/format';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Card } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../ui/input-group';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '../ui/empty';
import { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell } from '../ui/table';
import { cn } from '../ui/utils';
import type {
  ConfiguracionAplicacion,
  Mezcla,
  CalculosPorLote,
  ListaCompras,
  ProductoCatalogo,
  ItemListaCompras,
} from '../../types/aplicaciones';

interface PasoListaComprasProps {
  configuracion: ConfiguracionAplicacion;
  mezclas: Mezcla[];
  calculos: CalculosPorLote[];
  lista_compras: ListaCompras | null;
  onUpdate: (lista_compras: ListaCompras) => void;
}

export function PasoListaCompras({
  configuracion,
  mezclas,
  lista_compras,
  onUpdate,
}: PasoListaComprasProps) {
  const supabase = getSupabase();
  const { isSafeModeEnabled } = useSafeMode();

  const [lista, setLista] = useState<ListaCompras | null>(lista_compras);
  const [cargando, setCargando] = useState(false);

  const [modoEdicion, setModoEdicion] = useState(false);
  const [itemsEditables, setItemsEditables] = useState<Record<string, ItemListaCompras>>({});

  useEffect(() => {
    if (!lista_compras) {
      generarLista();
    } else {
      const editables: Record<string, ItemListaCompras> = {};
      lista_compras.items.forEach((item) => {
        editables[item.producto_id] = { ...item };
      });
      setItemsEditables(editables);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generarLista = async () => {
    setCargando(true);
    try {
      const productosNecesarios = calcularTotalesGlobalesProductos(mezclas);
      const productosIds = productosNecesarios.map((p) => p.producto_id);

      const { data, error } = await supabase.from('productos').select('*').in('id', productosIds);
      if (error) throw error;

      let inventarioActual = data.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        grupo: p.grupo,
        unidad_medida: p.unidad_medida,
        estado_fisico: p.estado_fisico,
        presentacion_comercial:
          p.presentacion_kg_l && p.presentacion_kg_l > 0
            ? `${p.presentacion_kg_l} ${(p.unidad_medida as string) === 'kilos' || p.unidad_medida === 'Kilos' ? 'Kg' : (p.unidad_medida as string) === 'litros' || p.unidad_medida === 'Litros' ? 'L' : p.unidad_medida}`
            : `1 ${(p.unidad_medida as string) === 'kilos' || p.unidad_medida === 'Kilos' ? 'Kg' : (p.unidad_medida as string) === 'litros' || p.unidad_medida === 'Litros' ? 'L' : p.unidad_medida}`,
        ultimo_precio_unitario: p.precio_unitario || 0,
        precio_presentacion: p.precio_por_presentacion || 0,
        cantidad_actual: p.cantidad_actual || 0,
        permitido_gerencia: p.permitido_gerencia ?? undefined,
      })) as unknown as ProductoCatalogo[];

      if (isSafeModeEnabled) {
        inventarioActual = inventarioActual.filter((p) => p.permitido_gerencia !== false);
      }

      const nuevaLista = generarListaCompras(productosNecesarios, inventarioActual);
      setLista(nuevaLista);
      onUpdate(nuevaLista);
    } catch {
      toast.error('Error al generar lista de compras');
    } finally {
      setCargando(false);
    }
  };

  const exportarPDF = async () => {
    if (!lista) {
      toast.error('No hay lista de compras para exportar');
      return;
    }
    const datosEmpresa = {
      nombre: 'Escocia Hass',
      nit: '900.XXX.XXX-X',
      direccion: 'Dirección del cultivo',
      telefono: '+57 XXX XXX XXXX',
      email: 'contacto@escocia-hass.com',
    };
    await generarPDFListaCompras(lista, configuracion, datosEmpresa);
  };

  const activarEdicion = () => setModoEdicion(true);

  const cancelarEdicion = () => {
    if (lista) {
      const editables: Record<string, ItemListaCompras> = {};
      lista.items.forEach((item) => {
        editables[item.producto_id] = { ...item };
      });
      setItemsEditables(editables);
    }
    setModoEdicion(false);
  };

  const extraerTamanoPresentacion = (presentacion: string | undefined): number => {
    if (!presentacion) return 1;
    const normalizada = presentacion.replace(/,/g, '.');
    const match = normalizada.match(/(\d+\.?\d*)/);
    const valor = match ? parseFloat(match[1]) : 1;
    return isNaN(valor) || valor <= 0 ? 1 : valor;
  };

  const editarCantidad = (
    productoId: string,
    campo: 'unidades_a_comprar' | 'cantidad_faltante',
    valor: number,
  ) => {
    const item = itemsEditables[productoId];
    if (!item) return;

    const itemActualizado = { ...item };
    if (campo === 'unidades_a_comprar') {
      itemActualizado.unidades_a_comprar = Math.max(0, valor);
      const tamanoPresentacion = extraerTamanoPresentacion(item.presentacion_comercial);
      itemActualizado.cantidad_faltante = itemActualizado.unidades_a_comprar * tamanoPresentacion;
    } else {
      itemActualizado.cantidad_faltante = Math.max(0, valor);
      const tamanoPresentacion = extraerTamanoPresentacion(item.presentacion_comercial);
      itemActualizado.unidades_a_comprar = Math.ceil(valor / tamanoPresentacion);
    }
    itemActualizado.costo_estimado = itemActualizado.unidades_a_comprar * (item.precio_presentacion || 0);

    setItemsEditables((prev) => ({ ...prev, [productoId]: itemActualizado }));
  };

  const editarPrecioPresentacion = (productoId: string, nuevoPrecio: number) => {
    const item = itemsEditables[productoId];
    if (!item) return;
    const itemActualizado = { ...item, precio_presentacion: Math.max(0, nuevoPrecio) };
    itemActualizado.costo_estimado = itemActualizado.unidades_a_comprar * itemActualizado.precio_presentacion;
    setItemsEditables((prev) => ({ ...prev, [productoId]: itemActualizado }));
  };

  const guardarCambios = () => {
    if (!lista) return;
    const itemsActualizados = Object.values(itemsEditables);
    const nuevosCostos = itemsActualizados
      .filter((item) => item.cantidad_faltante > 0)
      .reduce((sum, item) => sum + (item.costo_estimado || 0), 0);

    const nuevaLista: ListaCompras = { ...lista, items: itemsActualizados, costo_total_estimado: nuevosCostos };
    setLista(nuevaLista);
    onUpdate(nuevaLista);
    setModoEdicion(false);
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary/20 border-t-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Generando lista de compras...</p>
        </div>
      </div>
    );
  }

  if (!lista) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShoppingCart />
          </EmptyMedia>
          <EmptyTitle>No se pudo generar la lista de compras</EmptyTitle>
          <EmptyDescription>Intenta de nuevo — puede ser un problema temporal de conexión.</EmptyDescription>
        </EmptyHeader>
        <Button type="button" onClick={generarLista}>
          Reintentar
        </Button>
      </Empty>
    );
  }

  const productosAComprar = modoEdicion
    ? Object.values(itemsEditables).filter((item) => item.cantidad_faltante > 0)
    : lista.items.filter((item) => item.cantidad_faltante > 0);
  const productosDisponibles = modoEdicion
    ? Object.values(itemsEditables).filter((item) => item.cantidad_faltante === 0)
    : lista.items.filter((item) => item.cantidad_faltante === 0);

  const costoTotalActual = modoEdicion
    ? productosAComprar.reduce((sum, item) => sum + (item.costo_estimado || 0), 0)
    : lista.costo_total_estimado;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-foreground">Lista de Compras</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Comparación con inventario disponible</p>
        </div>

        <div className="flex gap-2">
          {!modoEdicion ? (
            <Button type="button" variant="outline" size="sm" onClick={activarEdicion}>
              <Edit2 className="w-4 h-4" />
              <span className="hidden sm:inline">Editar Cantidades</span>
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={cancelarEdicion}>
                <XIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Cancelar</span>
              </Button>
              <Button type="button" size="sm" onClick={guardarCambios}>
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">Guardar Cambios</span>
              </Button>
            </>
          )}
          <Button type="button" variant="outline" size="sm" onClick={exportarPDF} disabled={modoEdicion}>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </Button>
        </div>
      </div>

      {modoEdicion && (
        <Alert>
          <Edit2 />
          <AlertDescription>
            <strong className="text-foreground">Modo de edición activado.</strong> Puedes modificar las cantidades y
            precios. Los costos se recalculan al vuelo.{' '}
            <strong className="text-foreground">Los precios editados aquí no afectan el inventario</strong>, solo
            este reporte.
          </AlertDescription>
        </Alert>
      )}

      {/* RESUMEN */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className={cn('text-2xl font-bold tabular-nums', productosAComprar.length > 0 && 'text-destructive')}>
            {productosAComprar.length}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">Productos a Comprar</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold tabular-nums text-foreground">{productosDisponibles.length}</p>
          <p className="text-sm text-muted-foreground mt-0.5">Disponibles en Stock</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold tabular-nums text-foreground">{formatearMoneda(costoTotalActual)}</p>
          <p className="text-sm text-muted-foreground mt-0.5">Inversión Estimada</p>
        </Card>
      </div>

      {/* ALERTAS */}
      {(lista.productos_sin_precio > 0 || lista.productos_sin_stock > 0) && (
        <div className="space-y-2">
          {lista.productos_sin_precio > 0 && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>
                <strong className="text-foreground">{lista.productos_sin_precio}</strong> producto(s) no tienen
                precio registrado. El costo estimado puede ser inexacto.
              </AlertDescription>
            </Alert>
          )}
          {lista.productos_sin_stock > 0 && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>
                <strong className="text-foreground">{lista.productos_sin_stock}</strong> producto(s) no tienen stock
                disponible y deben comprarse en su totalidad.
              </AlertDescription>
            </Alert>
          )}
          {lista.items.some((item) => item.presentacion_comercial.startsWith('1 ')) && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>
                <strong className="text-foreground">Algunos productos no tienen presentación comercial configurada.</strong>{' '}
                Se calculan en unidades individuales (1 Kg/L). Configura "presentacion_kg_l" en Inventario para
                calcular en bultos.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* PRODUCTOS A COMPRAR */}
      {productosAComprar.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-destructive" />
            Productos a Comprar ({productosAComprar.length})
          </h4>

          {/* Escritorio: tabla */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">En Stock</TableHead>
                  <TableHead className="text-right">Necesario</TableHead>
                  <TableHead className="text-right">Faltante</TableHead>
                  <TableHead className="text-center">A Comprar</TableHead>
                  <TableHead className="text-right">Precio / Presentación</TableHead>
                  <TableHead className="text-right">Costo Est.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productosAComprar.map((item) => (
                  <TableRow key={item.producto_id}>
                    <TableCell className="whitespace-normal">
                      <p className={cn('font-medium', item.permitido_gerencia === false && 'text-destructive font-bold')}>
                        {item.producto_nombre}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.producto_categoria}</p>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatearNumero(item.inventario_actual)} {item.unidad}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearNumero(item.cantidad_necesaria)} {item.unidad}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {modoEdicion ? (
                        <InputGroupInput
                          type="number"
                          step="0.01"
                          value={item.cantidad_faltante}
                          onChange={(e) => editarCantidad(item.producto_id, 'cantidad_faltante', parseFloat(e.target.value) || 0)}
                          className="w-28 text-right ml-auto"
                          aria-label={`Faltante de ${item.producto_nombre}`}
                        />
                      ) : (
                        <span className="text-destructive font-semibold">
                          {formatearNumero(item.cantidad_faltante)} {item.unidad}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {modoEdicion ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <InputGroupInput
                            type="number"
                            min={0}
                            value={item.unidades_a_comprar}
                            onChange={(e) =>
                              editarCantidad(item.producto_id, 'unidades_a_comprar', parseInt(e.target.value, 10) || 0)
                            }
                            className="w-16 text-center"
                            aria-label={`Unidades a comprar de ${item.producto_nombre}`}
                          />
                          <span className="text-xs text-muted-foreground">× {item.presentacion_comercial}</span>
                        </div>
                      ) : (
                        <Badge variant="destructive">
                          {item.unidades_a_comprar} × {item.presentacion_comercial}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {modoEdicion ? (
                        <InputGroup className="w-32 ml-auto">
                          <InputGroupAddon>$</InputGroupAddon>
                          <InputGroupInput
                            type="number"
                            step="1000"
                            min={0}
                            value={item.precio_presentacion || 0}
                            onChange={(e) => editarPrecioPresentacion(item.producto_id, parseFloat(e.target.value) || 0)}
                            aria-label={`Precio por presentación de ${item.producto_nombre}`}
                          />
                        </InputGroup>
                      ) : item.alerta === 'sin_precio' ? (
                        <span className="text-warning">Sin precio</span>
                      ) : (
                        formatearMoneda(item.precio_presentacion || 0)
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {item.alerta === 'sin_precio' ? (
                        <span className="text-warning">Sin precio</span>
                      ) : (
                        formatearMoneda(item.costo_estimado || 0)
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6} className="text-right">
                    TOTAL A COMPRAR
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearMoneda(productosAComprar.reduce((sum, item) => sum + (item.costo_estimado || 0), 0))}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Móvil: tarjetas (Patrón A del sistema visual — no la misma tabla con scroll horizontal) */}
          <div className="sm:hidden space-y-3">
            {productosAComprar.map((item) => (
              <div key={item.producto_id} className="border border-border rounded-xl p-4 bg-card">
                <div className="flex justify-between gap-3 mb-3">
                  <div>
                    <p className={cn('font-bold text-sm', item.permitido_gerencia === false && 'text-destructive')}>
                      {item.producto_nombre}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.producto_categoria}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold tabular-nums text-destructive">{formatearNumero(item.cantidad_faltante)}</p>
                    <p className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">Faltante · {item.unidad}</p>
                  </div>
                </div>
                <div className="flex gap-5 text-xs text-muted-foreground mb-3">
                  <span>
                    En stock <b className="text-foreground">{formatearNumero(item.inventario_actual)}</b>
                  </span>
                  <span>
                    Necesario <b className="text-foreground">{formatearNumero(item.cantidad_necesaria)}</b>
                  </span>
                </div>
                {modoEdicion ? (
                  <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-border">
                    <Field>
                      <FieldLabel className="text-xs">A Comprar</FieldLabel>
                      <InputGroupInput
                        type="number"
                        min={0}
                        value={item.unidades_a_comprar}
                        onChange={(e) => editarCantidad(item.producto_id, 'unidades_a_comprar', parseInt(e.target.value, 10) || 0)}
                        aria-label={`Unidades a comprar de ${item.producto_nombre}`}
                      />
                    </Field>
                    <Field>
                      <FieldLabel className="text-xs">Precio</FieldLabel>
                      <InputGroup>
                        <InputGroupAddon>$</InputGroupAddon>
                        <InputGroupInput
                          type="number"
                          step="1000"
                          min={0}
                          value={item.precio_presentacion || 0}
                          onChange={(e) => editarPrecioPresentacion(item.producto_id, parseFloat(e.target.value) || 0)}
                          aria-label={`Precio por presentación de ${item.producto_nombre}`}
                        />
                      </InputGroup>
                    </Field>
                  </div>
                ) : (
                  <div className="flex justify-between items-center pt-3 border-t border-border">
                    <Badge variant="destructive">
                      {item.unidades_a_comprar} × {item.presentacion_comercial}
                    </Badge>
                    <span className="font-bold text-sm tabular-nums">
                      {item.alerta === 'sin_precio' ? 'Sin precio' : formatearMoneda(item.costo_estimado || 0)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRODUCTOS DISPONIBLES */}
      <div>
        <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-primary" />
          Productos Disponibles en Stock ({productosDisponibles.length})
        </h4>

        {productosDisponibles.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckCircle />
              </EmptyMedia>
              <EmptyTitle>Sin productos disponibles en este cálculo</EmptyTitle>
              <EmptyDescription>
                Todo lo necesario para esta aplicación debe comprarse — no hay excedente de inventario que mostrar aquí.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">En Stock</TableHead>
                  <TableHead className="text-right">Necesario</TableHead>
                  <TableHead className="text-right">Sobrante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productosDisponibles.map((item) => {
                  const sobrante = item.inventario_actual - item.cantidad_necesaria;
                  return (
                    <TableRow key={item.producto_id}>
                      <TableCell className="whitespace-normal">
                        <p className={cn('font-medium', item.permitido_gerencia === false && 'text-destructive font-bold')}>
                          {item.producto_nombre}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.producto_categoria}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-primary">
                        {formatearNumero(item.inventario_actual)} {item.unidad}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatearNumero(item.cantidad_necesaria)} {item.unidad}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-primary">
                        +{formatearNumero(sobrante)} {item.unidad}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {productosDisponibles.length > 0 && (
          <div className="sm:hidden space-y-3">
            {productosDisponibles.map((item) => {
              const sobrante = item.inventario_actual - item.cantidad_necesaria;
              return (
                <div key={item.producto_id} className="border border-border rounded-xl p-4 bg-card">
                  <p className={cn('font-bold text-sm', item.permitido_gerencia === false && 'text-destructive')}>
                    {item.producto_nombre}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">{item.producto_categoria}</p>
                  <div className="flex gap-5 text-xs text-muted-foreground">
                    <span>
                      Stock <b className="text-foreground">{formatearNumero(item.inventario_actual)}</b>
                    </span>
                    <span>
                      Sobrante <b className="text-primary">+{formatearNumero(sobrante)}</b>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RESUMEN FINAL */}
      <Card className="p-5">
        <h4 className="text-sm font-bold text-foreground mb-4">Resumen de la Aplicación</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-0.5">Nombre</p>
            <p className="text-foreground font-medium">{configuracion.nombre}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Tipo</p>
            <p className="text-foreground font-medium capitalize">{configuracion.tipo}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Lotes</p>
            <p className="text-foreground font-medium">{configuracion.lotes_seleccionados.length} lotes seleccionados</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Productos en Mezcla</p>
            <p className="text-foreground font-medium">{mezclas[0]?.productos.length || 0} productos</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-muted-foreground mb-0.5">Inversión Estimada</p>
            <p className="text-foreground font-bold text-lg tabular-nums">{formatearMoneda(costoTotalActual)}</p>
          </div>
        </div>
      </Card>

      {productosAComprar.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle />
            </EmptyMedia>
            <EmptyTitle>¡Todos los productos están disponibles!</EmptyTitle>
            <EmptyDescription>No necesitas comprar nada. Tienes suficiente stock para realizar la aplicación.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
